import { ipcMain, shell, app } from 'electron'
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
import { saveAsset, saveRecording } from './asset-manager'
import { runAgent, stopAgent } from './agent-orchestrator'
import { ClaudeProvider } from './llm/claude'
import { GeminiProvider } from './llm/gemini'
import { buildDocGenerationPrompt, SYSTEM_PROMPT } from './llm/agent-prompts'

const KEYTAR_SERVICE = 'guidance-studio'

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

    // Get API key for provider
    const apiKey = await keytar.getPassword(KEYTAR_SERVICE, provider)
    if (!apiKey) {
      throw new Error(`No API key found for provider: ${provider}. Please configure it in Settings.`)
    }

    const llmProvider = provider === 'claude'
      ? new ClaudeProvider(apiKey)
      : new GeminiProvider(apiKey)

    // Create initial run meta
    const meta: RunMeta = {
      id: runId,
      mode: 'agent',
      provider: provider as 'claude' | 'gemini',
      productName,
      feature,
      goal,
      status: 'running',
      createdAt: new Date().toISOString(),
      stepCount: 0
    }
    saveRunMeta(meta)

    // Start agent in background
    runAgent({ runId, url, productName, feature, goal, llmProvider })
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

  // ── Settings ───────────────────────────────────────────────────────────────
  ipcMain.handle('settings:get', async (_event, key: string) => {
    // API keys come from keytar
    if (key === 'claudeApiKey') {
      return keytar.getPassword(KEYTAR_SERVICE, 'claude')
    }
    if (key === 'geminiApiKey') {
      return keytar.getPassword(KEYTAR_SERVICE, 'gemini')
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
    // Mask API keys - just return whether they're set
    const claudeKey = await keytar.getPassword(KEYTAR_SERVICE, 'claude')
    const geminiKey = await keytar.getPassword(KEYTAR_SERVICE, 'gemini')

    return {
      ...settings,
      claudeApiKeySet: !!claudeKey,
      geminiApiKeySet: !!geminiKey
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

    const apiKey = await keytar.getPassword(KEYTAR_SERVICE, provider)
    if (!apiKey) {
      throw new Error(`No API key found for provider: ${provider}`)
    }

    const llmProvider = provider === 'claude'
      ? new ClaudeProvider(apiKey)
      : new GeminiProvider(apiKey)

    // Load screenshots for steps that have them
    const images: Buffer[] = []
    for (const step of steps) {
      if (step.screenshotPath) {
        try {
          const imgData = fs.readFileSync(step.screenshotPath)
          images.push(imgData)
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

    const markdown = await llmProvider.call({
      prompt,
      images: images.length > 0 ? images : undefined,
      maxTokens: 8192,
      systemPrompt: SYSTEM_PROMPT
    })

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
    const apiKey = await keytar.getPassword(KEYTAR_SERVICE, provider)
    if (!apiKey) {
      return { success: false, error: 'No API key configured' }
    }

    try {
      const llmProvider = provider === 'claude'
        ? new ClaudeProvider(apiKey)
        : new GeminiProvider(apiKey)

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

  // ── Utilities ──────────────────────────────────────────────────────────────
  ipcMain.handle('util:openExternal', async (_event, url: string) => {
    await shell.openExternal(url)
    return { success: true }
  })

  ipcMain.handle('util:getAppVersion', async () => {
    return app.getVersion()
  })
}
