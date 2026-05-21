import { contextBridge, ipcRenderer } from 'electron'

// Expose protected methods that allow the renderer process to use ipcRenderer
// without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Agent
  agentStart: (params: {
    runId: string
    url: string
    productName: string
    feature: string
    goal: string
    provider: string
  }) => ipcRenderer.invoke('agent:start', params),

  agentStop: (runId: string) => ipcRenderer.invoke('agent:stop', runId),

  onAgentEvent: (callback: (event: AgentEvent) => void) => {
    const handler = (_: Electron.IpcRendererEvent, event: AgentEvent) => callback(event)
    ipcRenderer.on('agent:event', handler)
    return () => ipcRenderer.removeListener('agent:event', handler)
  },

  onAgentStep: (callback: (step: RunStep) => void) => {
    const handler = (_: Electron.IpcRendererEvent, step: RunStep) => callback(step)
    ipcRenderer.on('agent:step', handler)
    return () => ipcRenderer.removeListener('agent:step', handler)
  },

  // Settings
  settingsGet: (key: string) => ipcRenderer.invoke('settings:get', key),
  settingsSet: (key: string, value: unknown) => ipcRenderer.invoke('settings:set', key, value),
  settingsGetAll: () => ipcRenderer.invoke('settings:getAll'),

  // Credentials
  credentialsList: () => ipcRenderer.invoke('credentials:list'),
  credentialsSet: (params: { domain: string; username: string; password: string }) =>
    ipcRenderer.invoke('credentials:set', params),
  credentialsDelete: (domain: string) => ipcRenderer.invoke('credentials:delete', domain),

  // Runs
  runList: () => ipcRenderer.invoke('run:list'),
  runGet: (runId: string) => ipcRenderer.invoke('run:get', runId),
  runDelete: (runId: string) => ipcRenderer.invoke('run:delete', runId),
  runSave: (meta: RunMeta) => ipcRenderer.invoke('run:save', meta),
  runSaveSteps: (runId: string, steps: RunStep[]) => ipcRenderer.invoke('run:saveSteps', runId, steps),
  runSaveOutput: (runId: string, markdown: string) => ipcRenderer.invoke('run:saveOutput', runId, markdown),

  // Assets
  assetSave: (params: { runId: string; filename: string; data: string }) =>
    ipcRenderer.invoke('asset:save', params),

  assetGetPath: (runId: string, filename: string) =>
    ipcRenderer.invoke('asset:getPath', runId, filename),

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
  }) => ipcRenderer.invoke('llm:generate-docs', params),

  llmTestConnection: (provider: string) =>
    ipcRenderer.invoke('llm:test-connection', provider),

  // Recordings
  recordingSave: (params: { runId: string; index: number; data: string }) =>
    ipcRenderer.invoke('recording:save', params),
  recordingScreenAccess: () => ipcRenderer.invoke('recording:screen-access'),
  recordingOpenScreenSettings: () => ipcRenderer.invoke('recording:open-screen-settings'),

  // OAuth — OpenRouter
  openrouterConnect: () => ipcRenderer.invoke('auth:openrouter-connect'),
  openrouterDisconnect: () => ipcRenderer.invoke('auth:openrouter-disconnect'),

  // OAuth — GitHub Copilot (device flow)
  copilotStartDeviceFlow: () => ipcRenderer.invoke('auth:copilot-start'),
  copilotPoll: (deviceCode: string, interval: number) =>
    ipcRenderer.invoke('auth:copilot-poll', deviceCode, interval),
  copilotDisconnect: () => ipcRenderer.invoke('auth:copilot-disconnect'),
  copilotClientConfigured: () => ipcRenderer.invoke('auth:copilot-client-configured'),

  // GitHub Models catalog
  githubModelsListModels: () => ipcRenderer.invoke('github-models:list-models'),

  // Utility
  openExternal: (url: string) => ipcRenderer.invoke('util:openExternal', url),
  getAppVersion: () => ipcRenderer.invoke('util:getAppVersion'),

  // Host platform ('darwin' | 'win32' | 'linux'); used for titlebar layout
  platform: process.platform
})

// Type declarations for use in renderer
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
