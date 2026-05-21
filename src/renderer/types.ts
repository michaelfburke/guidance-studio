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
  excluded?: boolean
}

export interface RunMeta {
  id: string
  mode: 'agent' | 'assisted'
  provider: 'claude' | 'gemini' | 'openai' | 'openrouter' | 'copilot' | 'github-models'
  productName: string
  feature: string
  goal: string
  url?: string
  status: 'running' | 'completed' | 'failed' | 'stopped'
  createdAt: string
  stepCount: number
}

export interface RunData {
  meta: RunMeta
  steps: RunStep[]
  events: AgentEvent[]
  outputMd: string | null
}

export interface AppSettings {
  defaultProvider: 'claude' | 'gemini' | 'openai' | 'openrouter' | 'copilot' | 'github-models'
  toneGuide: string
  linkedDocs: string
  claudeApiKeySet?: boolean
  geminiApiKeySet?: boolean
  openaiApiKeySet?: boolean
  openrouterConnected?: boolean
  copilotConnected?: boolean
  githubModelsApiKeySet?: boolean
  claudeModel?: string
  geminiModel?: string
  openaiBaseUrl?: string
  openaiModel?: string
  openrouterModel?: string
  copilotModel?: string
  githubModelsModel?: string
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

  // Credentials
  credentialsList: () => Promise<Array<{ domain: string; username: string }>>
  credentialsSet: (params: { domain: string; username: string; password: string }) => Promise<{ success: boolean }>
  credentialsDelete: (domain: string) => Promise<{ success: boolean }>

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
  recordingScreenAccess: () => Promise<'not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown'>
  recordingOpenScreenSettings: () => Promise<{ success: boolean }>

  // GitHub Models catalog
  githubModelsListModels: () => Promise<{ success: boolean; error?: string; models: Array<{ id: string; name: string; publisher: string }> }>

  // Auth — OpenRouter
  openrouterConnect: () => Promise<{ success: boolean; error?: string }>
  openrouterDisconnect: () => Promise<{ success: boolean }>

  // Auth — GitHub Copilot (device flow)
  copilotClientConfigured: () => Promise<{ configured: boolean }>
  copilotStartDeviceFlow: () => Promise<{ success: boolean; userCode: string; verificationUri: string; deviceCode: string; interval: number; error?: string }>
  copilotPoll: (deviceCode: string, interval: number) => Promise<{ success: boolean; error?: string }>
  copilotDisconnect: () => Promise<{ success: boolean }>

  // Utility
  openExternal: (url: string) => Promise<{ success: boolean }>
  getAppVersion: () => Promise<string>

  // Host platform ('darwin' | 'win32' | 'linux')
  platform: string
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
