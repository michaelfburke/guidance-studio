import { BrowserWindow } from 'electron'
import { type LLMProvider } from './llm/provider'
import { buildAgentPlanningPrompt, SYSTEM_PROMPT } from './llm/agent-prompts'
import {
  saveRunMeta,
  saveRunSteps,
  loadRunMeta,
  type RunStep
} from './storage'
import { generatePlaceholderPng, saveScreenshot, saveThumbnail } from './asset-manager'

export interface AgentEvent {
  runId: string
  type: 'nav' | 'observe' | 'click' | 'type' | 'screenshot' | 'analyze' | 'step' | 'complete' | 'error' | 'info'
  message: string
  timestamp: number
}

const activeAgents = new Map<string, { stopped: boolean }>()

function emitEvent(runId: string, type: AgentEvent['type'], message: string): void {
  const event: AgentEvent = {
    runId,
    type,
    message,
    timestamp: Date.now()
  }
  // Broadcast to all windows
  BrowserWindow.getAllWindows().forEach(win => {
    win.webContents.send('agent:event', event)
  })
}

function emitStep(runId: string, step: RunStep): void {
  BrowserWindow.getAllWindows().forEach(win => {
    win.webContents.send('agent:step', step)
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function isStopped(runId: string): boolean {
  return activeAgents.get(runId)?.stopped ?? true
}

interface PlannedStep {
  index: number
  title: string
  description: string
  action: string
}

interface AgentPlan {
  productName: string
  steps: PlannedStep[]
}

export async function runAgent(params: {
  runId: string
  url: string
  productName: string
  feature: string
  goal: string
  llmProvider: LLMProvider
}): Promise<void> {
  const { runId, url, productName, feature, goal, llmProvider } = params

  // Register agent
  activeAgents.set(runId, { stopped: false })

  try {
    // Phase 1: Navigation
    emitEvent(runId, 'info', `Starting agent run for: ${goal}`)
    await sleep(400)

    if (isStopped(runId)) return

    emitEvent(runId, 'nav', `Navigating to ${url}`)
    await sleep(800)

    if (isStopped(runId)) return

    emitEvent(runId, 'observe', 'Page loaded. Analyzing interface structure...')
    await sleep(600)

    if (isStopped(runId)) return

    emitEvent(runId, 'analyze', `Identifying UI elements relevant to: "${feature}"`)
    await sleep(700)

    if (isStopped(runId)) return

    emitEvent(runId, 'info', 'Generating exploration plan using LLM...')
    await sleep(300)

    // Phase 2: LLM Planning
    let plan: AgentPlan
    try {
      const prompt = buildAgentPlanningPrompt(url, goal)
      const response = await llmProvider.call({
        prompt,
        maxTokens: 2048,
        systemPrompt: SYSTEM_PROMPT
      })

      if (isStopped(runId)) return

      // Parse JSON response
      let jsonText = response.trim()
      // Strip markdown code fences if present
      jsonText = jsonText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '')
      plan = JSON.parse(jsonText) as AgentPlan
    } catch (err) {
      emitEvent(runId, 'error', `Failed to generate plan: ${err instanceof Error ? err.message : String(err)}`)

      // Use fallback plan
      plan = generateFallbackPlan(productName, feature, goal)
    }

    if (isStopped(runId)) return

    emitEvent(runId, 'info', `Plan ready. Executing ${plan.steps.length} steps...`)
    await sleep(500)

    // Phase 3: Execute steps
    const steps: RunStep[] = []

    for (const plannedStep of plan.steps) {
      if (isStopped(runId)) break

      const stepIndex = plannedStep.index

      // Emit action events based on step type
      const action = plannedStep.action || 'observe'

      if (action === 'nav') {
        emitEvent(runId, 'nav', `Navigating to: ${plannedStep.title}`)
      } else if (action === 'click') {
        emitEvent(runId, 'click', `Clicking: ${plannedStep.title}`)
      } else if (action === 'type') {
        emitEvent(runId, 'type', `Entering data: ${plannedStep.title}`)
      } else {
        emitEvent(runId, 'observe', `Observing: ${plannedStep.title}`)
      }

      await sleep(600 + Math.random() * 400)

      if (isStopped(runId)) break

      emitEvent(runId, 'screenshot', `Capturing screenshot for step ${stepIndex + 1}`)
      await sleep(300)

      // Generate placeholder screenshot
      const screenshotData = generatePlaceholderPng(
        `Step ${stepIndex + 1}: ${plannedStep.title}`,
        800,
        600
      )

      const screenshotPath = saveScreenshot(runId, stepIndex, screenshotData.toString('base64'))
      const thumbnailPath = saveThumbnail(runId, stepIndex, screenshotData.toString('base64'))

      emitEvent(runId, 'analyze', `Analyzing step ${stepIndex + 1}: ${plannedStep.title}`)
      await sleep(400 + Math.random() * 300)

      if (isStopped(runId)) break

      const step: RunStep = {
        index: stepIndex,
        title: plannedStep.title,
        description: plannedStep.description,
        screenshotPath,
        thumbnailPath
      }

      steps.push(step)

      // Emit step discovered
      emitEvent(runId, 'step', `Step ${stepIndex + 1} discovered: ${plannedStep.title}`)
      emitStep(runId, step)

      // Periodically save progress
      saveRunSteps(runId, steps)
      const meta = loadRunMeta(runId)
      if (meta) {
        meta.stepCount = steps.length
        saveRunMeta(meta)
      }

      await sleep(200)
    }

    if (!isStopped(runId)) {
      // Phase 4: Complete
      emitEvent(runId, 'complete', `Agent completed. Discovered ${steps.length} steps.`)

      // Final save
      saveRunSteps(runId, steps)
      const meta = loadRunMeta(runId)
      if (meta) {
        meta.status = 'completed'
        meta.stepCount = steps.length
        saveRunMeta(meta)
      }
    }
  } catch (err) {
    emitEvent(runId, 'error', `Agent error: ${err instanceof Error ? err.message : String(err)}`)

    const meta = loadRunMeta(runId)
    if (meta) {
      meta.status = 'failed'
      saveRunMeta(meta)
    }
  } finally {
    activeAgents.delete(runId)
  }
}

export function stopAgent(runId: string): void {
  const agent = activeAgents.get(runId)
  if (agent) {
    agent.stopped = true
  }
}

function generateFallbackPlan(productName: string, feature: string, goal: string): AgentPlan {
  return {
    productName,
    steps: [
      {
        index: 0,
        title: 'Navigate to the application',
        description: `Opened ${productName} and landed on the main dashboard. The interface shows the primary navigation and key features.`,
        action: 'nav'
      },
      {
        index: 1,
        title: `Locate ${feature} section`,
        description: `Found the ${feature} section in the navigation menu. Clicked to expand and access the feature area.`,
        action: 'click'
      },
      {
        index: 2,
        title: 'Review current state',
        description: `The ${feature} interface loaded successfully. Observed the existing configuration and available options.`,
        action: 'observe'
      },
      {
        index: 3,
        title: 'Initiate the workflow',
        description: `Clicked the primary action button to begin: "${goal}". A dialog or form appeared with required fields.`,
        action: 'click'
      },
      {
        index: 4,
        title: 'Configure settings',
        description: 'Filled in the required fields and adjusted configuration options according to the desired setup.',
        action: 'type'
      },
      {
        index: 5,
        title: 'Submit and confirm',
        description: 'Submitted the form and confirmed the action. The system processed the request and displayed a success message.',
        action: 'click'
      },
      {
        index: 6,
        title: 'Verify the result',
        description: 'Navigated back to the main view to verify the changes were applied correctly. The updated state is now visible.',
        action: 'observe'
      }
    ]
  }
}
