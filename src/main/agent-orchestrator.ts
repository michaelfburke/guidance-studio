import { BrowserWindow } from 'electron'
import { type LLMProvider } from './llm/provider'
import {
  AGENT_SYSTEM_PROMPT,
  buildAgentActionPrompt,
  type AgentActionContext
} from './llm/agent-prompts'
import {
  saveRunMeta,
  saveRunSteps,
  saveRunEvents,
  loadRunMeta,
  type RunMeta,
  type RunStep
} from './storage'
import { saveScreenshot, toLLMImage } from './asset-manager'
import { BrowserAgent, type PageSnapshot } from './browser/browser-agent'
import { type CredentialSecret } from './credentials'
import { RetryingProvider } from './llm/retry'

export interface AgentEvent {
  runId: string
  type: 'nav' | 'observe' | 'click' | 'type' | 'screenshot' | 'analyze' | 'step' | 'complete' | 'error' | 'info'
  message: string
  timestamp: number
  // True only when an 'error' event ends the run. Non-fatal errors (e.g. a
  // failed action the agent recovers from) leave this false.
  fatal?: boolean
}

export interface AgentAction {
  title: string
  description: string
  action: 'click' | 'type' | 'navigate' | 'scroll' | 'done'
  index?: number
  value?: string
}

const MAX_STEPS = 16

// How many times to re-prompt the LLM when its reply cannot be parsed into a
// valid action, before giving up on the run.
const MAX_DECIDE_ATTEMPTS = 3

const VALID_ACTIONS: ReadonlyArray<AgentAction['action']> = [
  'click', 'type', 'navigate', 'scroll', 'done'
]

const activeAgents = new Map<string, { stopped: boolean }>()
// Per-run event logs, persisted so the activity log survives reloads.
const runEventLogs = new Map<string, AgentEvent[]>()

function emitEvent(
  runId: string,
  type: AgentEvent['type'],
  message: string,
  fatal = false
): void {
  const event: AgentEvent = { runId, type, message, timestamp: Date.now(), fatal }
  const log = runEventLogs.get(runId)
  if (log) {
    log.push(event)
    // Persist before broadcasting, so a reload never loses an event.
    saveRunEvents(runId, log)
  }
  BrowserWindow.getAllWindows().forEach(win => {
    win.webContents.send('agent:event', event)
  })
}

function emitStep(step: RunStep): void {
  BrowserWindow.getAllWindows().forEach(win => {
    win.webContents.send('agent:step', step)
  })
}

function isStopped(runId: string): boolean {
  return activeAgents.get(runId)?.stopped ?? true
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export async function runAgent(params: {
  runId: string
  url: string
  productName: string
  feature: string
  goal: string
  llmProvider: LLMProvider
  credentials?: CredentialSecret | null
  headless?: boolean
}): Promise<void> {
  const { runId, url, productName, feature, goal, llmProvider } = params
  const credentials = params.credentials ?? null
  const headless = params.headless ?? false

  if (activeAgents.has(runId)) {
    throw new Error(`Agent run ${runId} is already active`)
  }
  activeAgents.set(runId, { stopped: false })
  runEventLogs.set(runId, [])

  // Retry rate-limit / overload errors with backoff, surfacing each wait.
  const provider = new RetryingProvider(llmProvider, {
    shouldContinue: () => !isStopped(runId),
    onRetry: info => emitEvent(
      runId,
      'info',
      `Rate limited — waiting ${Math.round(info.delayMs / 1000)}s before retry ${info.attempt}/${info.maxRetries}`
    )
  })

  const browser = new BrowserAgent()
  const steps: RunStep[] = []
  const history: string[] = []
  // Set when the loop exits because of an error, so the run is reported as
  // failed rather than completed.
  let failureReason: string | null = null

  try {
    emitEvent(runId, 'info', `Launching browser for: ${goal}`)
    await browser.launch({ headless })

    if (isStopped(runId)) return

    emitEvent(runId, 'nav', `Navigating to ${url}`)
    await browser.goto(url)

    if (credentials) {
      emitEvent(runId, 'info', 'Login credentials found for this site — the agent will sign in if prompted.')
    }

    for (let stepNum = 1; stepNum <= MAX_STEPS; stepNum++) {
      if (isStopped(runId)) break

      // Capture the real current page state.
      emitEvent(runId, 'screenshot', `Capturing page state (step ${stepNum})`)
      let snap: PageSnapshot
      try {
        snap = await browser.snapshot()
      } catch (err) {
        failureReason = `Could not read the page: ${errMessage(err)}`
        emitEvent(runId, 'error', failureReason, true)
        break
      }

      if (isStopped(runId)) break

      // Ask the LLM what to do next, given the real screenshot + elements.
      emitEvent(runId, 'analyze', `Analyzing page: ${snap.title || snap.url}`)
      let action: AgentAction
      try {
        // Send a downscaled image to the LLM; the full-res PNG is kept on disk.
        action = await decideAction(
          provider,
          toLLMImage(snap.screenshot),
          {
            productName,
            feature,
            goal,
            url: snap.url,
            pageTitle: snap.title,
            stepNumber: stepNum,
            maxSteps: MAX_STEPS,
            elements: snap.elements,
            history,
            hasCredentials: credentials !== null
          },
          info => emitEvent(
            runId,
            'info',
            `LLM reply was not usable (${info.reason}) — asking it to correct `
              + `(attempt ${info.attempt}/${info.maxAttempts})`
          )
        )
      } catch (err) {
        failureReason = `LLM could not decide the next step: ${errMessage(err)}`
        emitEvent(runId, 'error', failureReason, true)
        break
      }

      if (isStopped(runId)) break

      // Record the step against the real screenshot of the page it describes.
      const stepIndex = steps.length
      const screenshotPath = saveScreenshot(runId, stepIndex, snap.screenshot.toString('base64'))
      const step: RunStep = {
        index: stepIndex,
        title: action.title,
        description: action.description,
        screenshotPath,
        thumbnailPath: screenshotPath
      }
      steps.push(step)
      history.push(action.title)

      emitActionEvent(runId, action)
      emitEvent(runId, 'step', `Step ${stepIndex + 1} recorded: ${action.title}`)
      emitStep(step)
      persistProgress(runId, steps)

      if (action.action === 'done') {
        emitEvent(runId, 'info', 'Agent reports the goal is complete.')
        break
      }

      // Perform the action in the real browser.
      try {
        await executeAction(browser, action, credentials)
      } catch (err) {
        // A failed action is not fatal — the next snapshot reflects reality.
        emitEvent(runId, 'error', `Could not perform "${action.title}": ${errMessage(err)}`)
      }
    }

    let finalStatus: RunMeta['status']
    if (isStopped(runId)) {
      finalStatus = 'stopped'
    } else if (failureReason) {
      finalStatus = 'failed'
    } else {
      finalStatus = 'completed'
    }

    if (finalStatus === 'completed') {
      emitEvent(runId, 'complete', `Agent completed. Captured ${steps.length} steps.`)
    } else if (finalStatus === 'failed') {
      emitEvent(
        runId,
        'error',
        `Run ended early — captured ${steps.length} step(s) before the agent could not continue.`,
        true
      )
    }
    finalize(runId, steps, finalStatus)
  } catch (err) {
    emitEvent(runId, 'error', `Agent error: ${errMessage(err)}`, true)
    finalize(runId, steps, 'failed')
  } finally {
    await browser.close()
    activeAgents.delete(runId)
    runEventLogs.delete(runId)
  }
}

export function stopAgent(runId: string): void {
  const agent = activeAgents.get(runId)
  if (agent) {
    agent.stopped = true
  }
}

interface DecideRetryInfo {
  attempt: number
  maxAttempts: number
  reason: string
}

async function decideAction(
  llm: LLMProvider,
  screenshot: Buffer,
  ctx: AgentActionContext,
  onRetry?: (info: DecideRetryInfo) => void
): Promise<AgentAction> {
  const basePrompt = buildAgentActionPrompt(ctx)
  let lastError = ''

  // Re-prompt on a malformed reply: a single bad JSON response from the model
  // should not abort the whole run.
  for (let attempt = 1; attempt <= MAX_DECIDE_ATTEMPTS; attempt++) {
    const prompt = attempt === 1
      ? basePrompt
      : `${basePrompt}\n\nYour previous reply could not be used: ${lastError}\n`
        + `Reply again with ONLY the JSON object — no markdown fences, no commentary. `
        + `Escape any double quote inside a string value as \\", and do not put `
        + `quotation marks around words in "title" or "description".`

    const raw = await llm.call({
      prompt,
      images: [screenshot],
      maxTokens: 1024,
      systemPrompt: AGENT_SYSTEM_PROMPT
    })

    try {
      return parseAgentAction(raw)
    } catch (err) {
      lastError = errMessage(err)
      if (attempt < MAX_DECIDE_ATTEMPTS) {
        onRetry?.({ attempt, maxAttempts: MAX_DECIDE_ATTEMPTS, reason: lastError })
      }
    }
  }

  throw new Error(`no usable action after ${MAX_DECIDE_ATTEMPTS} attempts (${lastError})`)
}

/**
 * Extracts and validates an AgentAction from a raw LLM reply. Throws on any
 * malformed or incomplete response so the caller can re-prompt.
 */
export function parseAgentAction(raw: string): AgentAction {
  let json = raw.trim()
  // Strip markdown fences if the model added them anyway.
  json = json.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '')
  // Isolate the JSON object in case of stray prose.
  const start = json.indexOf('{')
  const end = json.lastIndexOf('}')
  if (start >= 0 && end > start) {
    json = json.slice(start, end + 1)
  }

  const parsed = JSON.parse(json) as AgentAction
  if (!parsed || typeof parsed.action !== 'string') {
    throw new Error('reply had no "action" field')
  }
  if (!VALID_ACTIONS.includes(parsed.action)) {
    throw new Error(
      `"action" was "${parsed.action}" — must be one of ${VALID_ACTIONS.join(', ')}`
    )
  }
  // Actions that target a DOM element must supply a valid non-negative index.
  if (['click', 'type'].includes(parsed.action)) {
    if (parsed.index == null || !Number.isInteger(parsed.index) || parsed.index < 0) {
      throw new Error(
        `"${parsed.action}" action requires a non-negative integer "index", got: ${JSON.stringify(parsed.index)}`
      )
    }
  }
  parsed.title = parsed.title?.trim() || `Step (${parsed.action})`
  parsed.description = parsed.description?.trim() || ''
  return parsed
}

/**
 * Substitutes {{username}} / {{password}} placeholders with the real stored
 * values. This is the only place the actual secrets are used — they are never
 * sent to the LLM, logged, or written into saved run steps.
 */
export function applyCredentials(value: string, creds: CredentialSecret | null): string {
  if (!creds) return value
  return value
    .replace(/\{\{\s*username\s*\}\}/gi, creds.username)
    .replace(/\{\{\s*password\s*\}\}/gi, creds.password)
}

async function executeAction(
  browser: BrowserAgent,
  action: AgentAction,
  credentials: CredentialSecret | null
): Promise<void> {
  switch (action.action) {
    case 'click':
      if (action.index == null) throw new Error('click action is missing an element index')
      await browser.click(action.index)
      break
    case 'type':
      if (action.index == null) throw new Error('type action is missing an element index')
      await browser.type(action.index, applyCredentials(action.value ?? '', credentials))
      break
    case 'navigate':
      if (!action.value) throw new Error('navigate action is missing a URL')
      await browser.goto(action.value)
      break
    case 'scroll':
      await browser.scroll()
      break
    case 'done':
      break
  }
}

function emitActionEvent(runId: string, action: AgentAction): void {
  switch (action.action) {
    case 'navigate':
      emitEvent(runId, 'nav', `Navigating: ${action.title}`)
      break
    case 'click':
      emitEvent(runId, 'click', `Clicking: ${action.title}`)
      break
    case 'type':
      emitEvent(runId, 'type', `Entering data: ${action.title}`)
      break
    case 'scroll':
      emitEvent(runId, 'observe', `Scrolling: ${action.title}`)
      break
    case 'done':
      emitEvent(runId, 'observe', `Final state: ${action.title}`)
      break
  }
}

function persistProgress(runId: string, steps: RunStep[]): void {
  saveRunSteps(runId, steps)
  const meta = loadRunMeta(runId)
  if (meta) {
    meta.stepCount = steps.length
    saveRunMeta(meta)
  }
}

function finalize(runId: string, steps: RunStep[], status: RunMeta['status']): void {
  saveRunSteps(runId, steps)
  const meta = loadRunMeta(runId)
  if (meta) {
    meta.status = status
    meta.stepCount = steps.length
    saveRunMeta(meta)
  }
}
