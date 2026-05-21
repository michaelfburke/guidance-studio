import { ipcMain, shell, app, systemPreferences } from 'electron'
import path from 'path'
import keytar from 'keytar'
import fs from 'fs'
import {
  listRuns,
  loadRunData,
  deleteRun,
  saveRunMeta,
  saveRunSteps,
  saveRunOutput,
  loadRunMeta,
  loadRunSteps,
  getRunDir,
  type RunMeta
} from './storage'
import { saveAsset, saveRecording, toLLMImage } from './asset-manager'
import { runAgent, stopAgent } from './agent-orchestrator'
import {
  listCredentials,
  setCredential,
  deleteCredential,
  getCredentialForUrl
} from './credentials'
import { ClaudeProvider } from './llm/claude'
import { GeminiProvider } from './llm/gemini'
import { OpenAIProvider } from './llm/openai'
import { CopilotProvider } from './llm/copilot'
import { RetryingProvider } from './llm/retry'
import { type LLMProvider } from './llm/provider'
import { buildDocGenerationPrompt, SYSTEM_PROMPT } from './llm/agent-prompts'
import { openrouterOAuth } from './auth/openrouter-oauth'
import { startDeviceFlow, pollDeviceFlow, COPILOT_CLIENT_ID } from './auth/github-device-flow'

const DEFAULT_OPENAI_BASE_URL = 'http://localhost:4141/v1'
const DEFAULT_OPENAI_MODEL = 'gpt-4.1'
const DEFAULT_OPENROUTER_MODEL = 'anthropic/claude-sonnet-4-5'
const DEFAULT_COPILOT_MODEL = 'gpt-4o'
const GITHUB_MODELS_BASE_URL = 'https://models.github.ai/inference'
const DEFAULT_GITHUB_MODELS_MODEL = 'openai/gpt-4o'

const KEYTAR_SERVICE = 'guidance-studio'

async function safeGetPassword(service: string, account: string): Promise<string | null> {
  try {
    return await keytar.getPassword(service, account)
  } catch {
    return null
  }
}

// Simple JSON settings file in userData
function getSettingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

function loadSettings(): Record<string, unknown> {
  try {
    const data = fs.readFileSync(getSettingsPath(), 'utf-8')
    return JSON.parse(data)
  } catch {
    return {}
  }
}

function saveSettings(settings: Record<string, unknown>): void {
  fs.writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2))
}

/** Builds the LLM provider for a run, reading keys and config from storage. */
async function buildProvider(provider: string): Promise<LLMProvider> {
  const settings = loadSettings()

  if (provider === 'claude') {
    const apiKey = await safeGetPassword(KEYTAR_SERVICE, 'claude')
    if (!apiKey) {
      throw new Error('No API key found for Claude. Please configure it in Settings.')
    }
    const model = (settings.claudeModel as string) || undefined
    return new ClaudeProvider(apiKey, model)
  }

  if (provider === 'gemini') {
    const apiKey = await safeGetPassword(KEYTAR_SERVICE, 'gemini')
    if (!apiKey) {
      throw new Error('No API key found for Gemini. Please configure it in Settings.')
    }
    const model = (settings.geminiModel as string) || undefined
    return new GeminiProvider(apiKey, model)
  }

  if (provider === 'openai') {
    // The API key is optional — a local Copilot proxy does not need one.
    const apiKey = (await safeGetPassword(KEYTAR_SERVICE, 'openai')) || ''
    const settings = loadSettings()
    const baseURL = (settings.openaiBaseUrl as string) || DEFAULT_OPENAI_BASE_URL
    const model = (settings.openaiModel as string) || DEFAULT_OPENAI_MODEL
    return new OpenAIProvider({ apiKey, baseURL, model })
  }

  if (provider === 'openrouter') {
    const apiKey = await safeGetPassword(KEYTAR_SERVICE, 'openrouter')
    if (!apiKey) throw new Error('OpenRouter is not connected. Please authorise it in Settings.')
    const model = (settings.openrouterModel as string) || DEFAULT_OPENROUTER_MODEL
    return new OpenAIProvider({ apiKey, baseURL: 'https://openrouter.ai/api/v1', model })
  }

  if (provider === 'copilot') {
    const githubToken = await safeGetPassword(KEYTAR_SERVICE, 'copilot')
    if (!githubToken) throw new Error('GitHub Copilot is not connected. Please authorise it in Settings.')
    const model = (settings.copilotModel as string) || DEFAULT_COPILOT_MODEL
    return new CopilotProvider(githubToken, model)
  }

  if (provider === 'github-models') {
    const apiKey = await safeGetPassword(KEYTAR_SERVICE, 'github-models')
    if (!apiKey) throw new Error('No GitHub PAT found for GitHub Models. Please configure it in Settings.')
    const model = (settings.githubModelsModel as string) || DEFAULT_GITHUB_MODELS_MODEL
    return new OpenAIProvider({ apiKey, baseURL: GITHUB_MODELS_BASE_URL, model })
  }

  throw new Error(`Unknown provider: ${provider}`)
}

/** Replaces [[screenshot:N]] tokens in generated docs with the step screenshots. */
function embedScreenshots(
  markdown: string,
  steps: Array<{ index: number; title: string; screenshotPath: string | null }>
): string {
  let out = markdown
  for (const step of steps) {
    if (!step.screenshotPath) continue
    const token = `[[screenshot:${step.index + 1}]]`
    const alt = step.title.replace(/[[\]]/g, '')
    const url = `gsasset://asset${encodeURI(step.screenshotPath)}`
    out = out.split(token).join(`![${alt}](${url})`)
  }
  // Drop any leftover tokens that had no matching screenshot.
  return out.replace(/\[\[screenshot:\d+\]\]/g, '')
}

export function registerIpcHandlers(): void {
  // ── Agent ──────────────────────────────────────────────────────────────────
  ipcMain.handle('agent:start', async (_event, params: {
    runId: string
    url: string
    productName: string
    feature: string
    goal: string
    provider: string
  }) => {
    const { runId, url, productName, feature, goal, provider } = params

    const llmProvider = await buildProvider(provider)

    // Create initial run meta
    const meta: RunMeta = {
      id: runId,
      mode: 'agent',
      provider: provider as RunMeta['provider'],
      productName,
      feature,
      goal,
      url,
      status: 'running',
      createdAt: new Date().toISOString(),
      stepCount: 0
    }
    saveRunMeta(meta)

    // Look up stored login credentials matching this URL's domain, if any.
    const credentials = await getCredentialForUrl(url)

    const agentSettings = loadSettings()
    const headless = !!(agentSettings.headlessBrowser)

    // Start agent in background
    runAgent({ runId, url, productName, feature, goal, llmProvider, credentials, headless })
      .catch(err => console.error('Agent error:', err))

    return { success: true, runId }
  })

  ipcMain.handle('agent:stop', async (_event, runId: string) => {
    stopAgent(runId)
    const meta = loadRunMeta(runId)
    if (meta) {
      meta.status = 'stopped'
      saveRunMeta(meta)
    }
    return { success: true }
  })

  // ── Credentials ────────────────────────────────────────────────────────────
  ipcMain.handle('credentials:list', async () => {
    return listCredentials()
  })

  ipcMain.handle('credentials:set', async (_event, params: {
    domain: string
    username: string
    password: string
  }) => {
    await setCredential(params.domain, params.username, params.password)
    return { success: true }
  })

  ipcMain.handle('credentials:delete', async (_event, domain: string) => {
    await deleteCredential(domain)
    return { success: true }
  })

  // ── Settings ───────────────────────────────────────────────────────────────
  ipcMain.handle('settings:get', async (_event, key: string) => {
    // API keys come from keytar
    if (key === 'claudeApiKey') {
      return safeGetPassword(KEYTAR_SERVICE, 'claude')
    }
    if (key === 'geminiApiKey') {
      return safeGetPassword(KEYTAR_SERVICE, 'gemini')
    }
    if (key === 'openaiApiKey') {
      return safeGetPassword(KEYTAR_SERVICE, 'openai')
    }
    if (key === 'githubModelsApiKey') {
      return safeGetPassword(KEYTAR_SERVICE, 'github-models')
    }

    const settings = loadSettings()
    return settings[key] ?? null
  })

  ipcMain.handle('settings:set', async (_event, key: string, value: unknown) => {
    // API keys go to keytar
    if (key === 'claudeApiKey') {
      if (value && typeof value === 'string') {
        await keytar.setPassword(KEYTAR_SERVICE, 'claude', value)
      } else {
        await keytar.deletePassword(KEYTAR_SERVICE, 'claude')
      }
      return { success: true }
    }
    if (key === 'geminiApiKey') {
      if (value && typeof value === 'string') {
        await keytar.setPassword(KEYTAR_SERVICE, 'gemini', value)
      } else {
        await keytar.deletePassword(KEYTAR_SERVICE, 'gemini')
      }
      return { success: true }
    }
    if (key === 'openaiApiKey') {
      if (value && typeof value === 'string') {
        await keytar.setPassword(KEYTAR_SERVICE, 'openai', value)
      } else {
        await keytar.deletePassword(KEYTAR_SERVICE, 'openai')
      }
      return { success: true }
    }
    if (key === 'githubModelsApiKey') {
      if (value && typeof value === 'string') {
        await keytar.setPassword(KEYTAR_SERVICE, 'github-models', value)
      } else {
        await keytar.deletePassword(KEYTAR_SERVICE, 'github-models')
      }
      return { success: true }
    }

    const settings = loadSettings()
    if (value === null || value === undefined) {
      delete settings[key]
    } else {
      settings[key] = value
    }
    saveSettings(settings)
    return { success: true }
  })

  ipcMain.handle('settings:getAll', async () => {
    const settings = loadSettings()
    const [claudeKey, geminiKey, openaiKey, openrouterKey, copilotKey, githubModelsKey] = await Promise.all([
      safeGetPassword(KEYTAR_SERVICE, 'claude'),
      safeGetPassword(KEYTAR_SERVICE, 'gemini'),
      safeGetPassword(KEYTAR_SERVICE, 'openai'),
      safeGetPassword(KEYTAR_SERVICE, 'openrouter'),
      safeGetPassword(KEYTAR_SERVICE, 'copilot'),
      safeGetPassword(KEYTAR_SERVICE, 'github-models')
    ])

    return {
      ...settings,
      claudeApiKeySet: !!claudeKey,
      geminiApiKeySet: !!geminiKey,
      openaiApiKeySet: !!openaiKey,
      openrouterConnected: !!openrouterKey,
      copilotConnected: !!copilotKey,
      githubModelsApiKeySet: !!githubModelsKey
    }
  })

  // ── Runs ───────────────────────────────────────────────────────────────────
  ipcMain.handle('run:list', async () => {
    return listRuns()
  })

  ipcMain.handle('run:get', async (_event, runId: string) => {
    return loadRunData(runId)
  })

  ipcMain.handle('run:delete', async (_event, runId: string) => {
    return deleteRun(runId)
  })

  ipcMain.handle('run:save', async (_event, meta: RunMeta) => {
    saveRunMeta(meta)
    return { success: true }
  })

  ipcMain.handle('run:saveSteps', async (_event, runId: string, steps: unknown[]) => {
    saveRunSteps(runId, steps as Parameters<typeof saveRunSteps>[1])
    return { success: true }
  })

  ipcMain.handle('run:saveOutput', async (_event, runId: string, markdown: string) => {
    saveRunOutput(runId, markdown)
    return { success: true }
  })

  // ── Assets ─────────────────────────────────────────────────────────────────
  ipcMain.handle('asset:save', async (_event, params: {
    runId: string
    filename: string
    data: string  // base64
  }) => {
    const filePath = saveAsset({
      runId: params.runId,
      filename: params.filename,
      data: params.data
    })
    return { success: true, filePath }
  })

  ipcMain.handle('asset:getPath', async (_event, runId: string, filename: string) => {
    const runDir = getRunDir(runId)
    const filePath = path.join(runDir, filename)
    if (fs.existsSync(filePath)) {
      return `file://${filePath}`
    }
    return null
  })

  // ── LLM ───────────────────────────────────────────────────────────────────
  ipcMain.handle('llm:generate-docs', async (_event, params: {
    runId: string
    productName: string
    feature: string
    goal: string
    steps: Array<{ index: number; title: string; description: string; screenshotPath: string | null }>
    provider: string
    toneGuide?: string
    linkedDocs?: string
  }) => {
    const { provider, productName, feature, goal, steps, toneGuide, linkedDocs, runId } = params

    const llmProvider = new RetryingProvider(await buildProvider(provider))

    // Load screenshots for steps that have them (downscaled for the LLM).
    const images: Buffer[] = []
    for (const step of steps) {
      if (step.screenshotPath) {
        try {
          images.push(toLLMImage(fs.readFileSync(step.screenshotPath)))
        } catch {
          // skip if file not found
        }
      }
    }

    const prompt = buildDocGenerationPrompt(
      productName,
      feature,
      goal,
      steps,
      toneGuide,
      linkedDocs
    )

    const rawMarkdown = await llmProvider.call({
      prompt,
      images: images.length > 0 ? images : undefined,
      maxTokens: 8192,
      systemPrompt: SYSTEM_PROMPT
    })

    // Replace [[screenshot:N]] tokens with the actual step screenshots.
    const markdown = embedScreenshots(rawMarkdown, steps)

    // Save the output
    saveRunOutput(runId, markdown)

    // Update meta
    const meta = loadRunMeta(runId)
    if (meta) {
      meta.status = 'completed'
      saveRunMeta(meta)
    }

    return { success: true, markdown }
  })

  ipcMain.handle('llm:test-connection', async (_event, provider: string) => {
    try {
      const llmProvider = await buildProvider(provider)
      await llmProvider.call({
        prompt: 'Respond with "OK" only.',
        maxTokens: 10
      })
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // ── Recordings ─────────────────────────────────────────────────────────────
  ipcMain.handle('recording:save', async (_event, params: {
    runId: string
    index: number
    data: string  // base64
  }) => {
    const buf = Buffer.from(params.data, 'base64')
    const filePath = saveRecording(params.runId, params.index, buf)
    return { success: true, filePath }
  })

  // Screen-recording permission status (macOS gates getDisplayMedia behind it).
  ipcMain.handle('recording:screen-access', () => {
    if (process.platform !== 'darwin') return 'granted'
    return systemPreferences.getMediaAccessStatus('screen')
  })

  // Open the macOS Screen Recording settings pane so the user can grant access.
  ipcMain.handle('recording:open-screen-settings', async () => {
    if (process.platform === 'darwin') {
      await shell.openExternal(
        'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
      )
    }
    return { success: true }
  })

  // ── Auth — OpenRouter ──────────────────────────────────────────────────────
  ipcMain.handle('auth:openrouter-connect', async () => {
    try {
      const key = await openrouterOAuth()
      await keytar.setPassword(KEYTAR_SERVICE, 'openrouter', key)
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('auth:openrouter-disconnect', async () => {
    await keytar.deletePassword(KEYTAR_SERVICE, 'openrouter')
    return { success: true }
  })

  // ── Auth — GitHub Copilot (Device Flow) ────────────────────────────────────
  ipcMain.handle('auth:copilot-client-configured', () => {
    return { configured: !!COPILOT_CLIENT_ID }
  })

  ipcMain.handle('auth:copilot-start', async () => {
    try {
      const challenge = await startDeviceFlow()
      return { success: true, ...challenge }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('auth:copilot-poll', async (_event, deviceCode: string, interval: number) => {
    try {
      const token = await pollDeviceFlow(deviceCode, interval)
      await keytar.setPassword(KEYTAR_SERVICE, 'copilot', token)
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('auth:copilot-disconnect', async () => {
    await keytar.deletePassword(KEYTAR_SERVICE, 'copilot')
    return { success: true }
  })

  // ── GitHub Models catalog ──────────────────────────────────────────────────
  ipcMain.handle('github-models:list-models', async () => {
    const apiKey = await safeGetPassword(KEYTAR_SERVICE, 'github-models')
    if (!apiKey) return { success: false, error: 'No PAT configured', models: [] }

    let res: Response
    try {
      res = await fetch('https://models.github.ai/catalog/models', {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2026-03-10'
        }
      })
    } catch (err) {
      return { success: false, error: `Network error: ${err instanceof Error ? err.message : String(err)}`, models: [] }
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      return { success: false, error: `API error ${res.status}: ${detail.slice(0, 200)}`, models: [] }
    }

    const data = (await res.json()) as Array<{ id: string; name: string; publisher: string; supported_input_modalities?: string[] }>
    // Only return chat/text models (skip embedding-only models).
    const models = data
      .filter(m => !m.supported_input_modalities || m.supported_input_modalities.includes('text'))
      .map(m => ({ id: m.id, name: m.name, publisher: m.publisher }))
      .sort((a, b) => a.publisher.localeCompare(b.publisher) || a.name.localeCompare(b.name))
    return { success: true, models }
  })

  // ── Utilities ──────────────────────────────────────────────────────────────
  ipcMain.handle('util:openExternal', async (_event, url: string) => {
    await shell.openExternal(url)
    return { success: true }
  })

  ipcMain.handle('util:getAppVersion', async () => {
    return app.getVersion()
  })
}
