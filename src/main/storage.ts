import fs from 'fs'
import path from 'path'
import { app } from 'electron'

export interface RunMeta {
  id: string
  mode: 'agent' | 'assisted'
  provider: 'claude' | 'gemini' | 'openai' | 'openrouter' | 'copilot'
  productName: string
  feature: string
  goal: string
  /** Target URL for agent runs (absent for assisted runs). */
  url?: string
  status: 'running' | 'completed' | 'failed' | 'stopped'
  createdAt: string
  stepCount: number
}

export interface RunStep {
  index: number
  title: string
  description: string
  screenshotPath: string | null
  thumbnailPath: string | null
  /** When true, the step is omitted from generated guidance. */
  excluded?: boolean
}

export interface RunEvent {
  runId: string
  type: string
  message: string
  timestamp: number
}

export interface RunData {
  meta: RunMeta
  steps: RunStep[]
  events: RunEvent[]
  outputMd: string | null
}

function getRunsDir(): string {
  const homeDir = app.getPath('home')
  return path.join(homeDir, 'GuidanceStudio', 'runs')
}

function ensureRunDir(runId: string): string {
  const runDir = path.join(getRunsDir(), runId)
  fs.mkdirSync(runDir, { recursive: true })
  fs.mkdirSync(path.join(runDir, 'recordings'), { recursive: true })
  return runDir
}

export function saveRunMeta(meta: RunMeta): void {
  const runDir = ensureRunDir(meta.id)
  fs.writeFileSync(path.join(runDir, 'meta.json'), JSON.stringify(meta, null, 2))
}

export function saveRunSteps(runId: string, steps: RunStep[]): void {
  const runDir = ensureRunDir(runId)
  fs.writeFileSync(path.join(runDir, 'steps.json'), JSON.stringify(steps, null, 2))
}

export function saveRunOutput(runId: string, markdown: string): void {
  const runDir = ensureRunDir(runId)
  fs.writeFileSync(path.join(runDir, 'output.md'), markdown)
}

export function saveRunEvents(runId: string, events: RunEvent[]): void {
  const runDir = ensureRunDir(runId)
  fs.writeFileSync(path.join(runDir, 'events.json'), JSON.stringify(events, null, 2))
}

export function loadRunEvents(runId: string): RunEvent[] {
  try {
    const eventsPath = path.join(getRunsDir(), runId, 'events.json')
    return JSON.parse(fs.readFileSync(eventsPath, 'utf-8'))
  } catch {
    return []
  }
}

export function loadRunMeta(runId: string): RunMeta | null {
  try {
    const metaPath = path.join(getRunsDir(), runId, 'meta.json')
    const data = fs.readFileSync(metaPath, 'utf-8')
    return JSON.parse(data)
  } catch {
    return null
  }
}

export function loadRunSteps(runId: string): RunStep[] {
  try {
    const stepsPath = path.join(getRunsDir(), runId, 'steps.json')
    const data = fs.readFileSync(stepsPath, 'utf-8')
    return JSON.parse(data)
  } catch {
    return []
  }
}

export function loadRunOutput(runId: string): string | null {
  try {
    const outputPath = path.join(getRunsDir(), runId, 'output.md')
    return fs.readFileSync(outputPath, 'utf-8')
  } catch {
    return null
  }
}

export function loadRunData(runId: string): RunData | null {
  const meta = loadRunMeta(runId)
  if (!meta) return null
  return {
    meta,
    steps: loadRunSteps(runId),
    events: loadRunEvents(runId),
    outputMd: loadRunOutput(runId)
  }
}

export function listRuns(): RunMeta[] {
  try {
    const runsDir = getRunsDir()
    if (!fs.existsSync(runsDir)) return []

    const entries = fs.readdirSync(runsDir, { withFileTypes: true })
    const metas: RunMeta[] = []

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const meta = loadRunMeta(entry.name)
        if (meta) metas.push(meta)
      }
    }

    return metas.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  } catch {
    return []
  }
}

export function deleteRun(runId: string): boolean {
  try {
    const runDir = path.join(getRunsDir(), runId)
    fs.rmSync(runDir, { recursive: true, force: true })
    return true
  } catch {
    return false
  }
}

export function getRunDir(runId: string): string {
  return path.join(getRunsDir(), runId)
}
