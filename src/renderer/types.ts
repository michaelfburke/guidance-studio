export interface AgentEvent {
  runId: string
  type: 'nav' | 'observe' | 'click' | 'type' | 'screenshot' | 'analyze' | 'step' | 'complete' | 'error' | 'info'
  message: string
  timestamp: number
}

export interface RunStep {
  index: number
  title: string
  description: string
  screenshotPath: string | null
  thumbnailPath: string | null
}

export interface RunMeta {
  id: string
  mode: 'agent' | 'assisted'
  provider: 'claude' | 'gemini'
  productName: string
  feature: string
  goal: string
  status: 'running' | 'completed' | 'failed' | 'stopped'
  createdAt: string
  stepCount: number
}

export interface RunData {
  meta: RunMeta
  steps: RunStep[]
  outputMd: string | null
}

export interface AppSettings {
  defaultProvider: 'claude' | 'gemini'
  toneGuide: string
  linkedDocs: string
  claudeApiKeySet?: boolean
  geminiApiKeySet?: boolean
}

export interface ElectronAPI {
  // Agent
  agentStart: (params: {
    runId: string
    url: string
    productName: string
    feature: string
    goal: string
    provider: string
  }) => Promise<{ success: boolean; runId: string }>

  agentStop: (runId: string) => Promise<{ success: boolean }>

  onAgentEvent: (callback: (event: AgentEvent) => void) => () => void
  onAgentStep: (callback: (step: RunStep) => void) => () => void

  // Settings
  settingsGet: (key: string) => Promise<unknown>
  settingsSet: (key: string, value: unknown) => Promise<{ success: boolean }>
  settingsGetAll: () => Promise<AppSettings & Record<string, unknown>>

  // Runs
  runList: () => Promise<RunMeta[]>
  runGet: (runId: string) => Promise<RunData | null>
  runDelete: (runId: string) => Promise<boolean>
  runSave: (meta: RunMeta) => Promise<{ success: boolean }>
  runSaveSteps: (runId: string, steps: RunStep[]) => Promise<{ success: boolean }>
  runSaveOutput: (runId: string, markdown: string) => Promise<{ success: boolean }>

  // Assets
  assetSave: (params: { runId: string; filename: string; data: string }) => Promise<{ success: boolean; filePath: string }>
  assetGetPath: (runId: string, filename: string) => Promise<string | null>

  // LLM
  llmGenerateDocs: (params: {
    runId: string
    productName: string
    feature: string
    goal: string
    steps: RunStep[]
    provider: string
    toneGuide?: string
    linkedDocs?: string
  }) => Promise<{ success: boolean; markdown: string }>

  llmTestConnection: (provider: string) => Promise<{ success: boolean; error?: string }>

  // Recordings
  recordingSave: (params: { runId: string; index: number; data: string }) => Promise<{ success: boolean; filePath: string }>

  // Utility
  openExternal: (url: string) => Promise<{ success: boolean }>
  getAppVersion: () => Promise<string>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
