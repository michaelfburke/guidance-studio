import React, { useState, useEffect, useCallback, useRef } from 'react'
import { PROVIDERS, type ProviderId } from '../providers'

const DEFAULT_OPENAI_BASE_URL = 'http://localhost:4141/v1'
const DEFAULT_OPENAI_MODEL = 'gpt-4.1'
const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-4-6'
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash'
const DEFAULT_OPENROUTER_MODEL = 'anthropic/claude-sonnet-4-5'
const DEFAULT_COPILOT_MODEL = 'gpt-4o'
const DEFAULT_GITHUB_MODELS_MODEL = 'gpt-4o'

interface SettingsState {
  claudeApiKey: string
  claudeModel: string
  geminiApiKey: string
  geminiModel: string
  openaiApiKey: string
  openaiBaseUrl: string
  openaiModel: string
  openrouterConnected: boolean
  openrouterModel: string
  copilotConnected: boolean
  copilotModel: string
  githubModelsApiKey: string
  githubModelsModel: string
  defaultProvider: ProviderId
  toneGuide: string
  linkedDocs: string
}

type TestStatus = 'idle' | 'testing' | 'ok' | 'fail'
type TestState = Record<ProviderId, TestStatus>
type TestError = Partial<Record<ProviderId, string>>


type OAuthStatus = 'idle' | 'connecting' | 'ok' | 'fail'
type DeviceFlowStatus = 'idle' | 'waiting' | 'polling' | 'ok' | 'fail'

interface CredentialEntry {
  domain: string
  username: string
}

// ── Reusable SVGs ─────────────────────────────────────────────────────────────

const EyeIcon = (): JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d="M1 7s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4z" />
    <circle cx="7" cy="7" r="1.5" />
  </svg>
)

const EyeOffIcon = (): JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d="M1 7s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4z" />
    <circle cx="7" cy="7" r="1.5" />
    <path d="M1 1l12 12" />
  </svg>
)

const SpinnerIcon = ({ size = 12 }: { size?: number }): JSX.Element => (
  <svg className="animate-spin" width={size} height={size} viewBox="0 0 12 12" fill="none">
    <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.5" />
    <path d="M6 1.5a4.5 4.5 0 014.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)

const CheckIcon = (): JSX.Element => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d="M2 6l3 3 5-5" />
  </svg>
)

// ── Component ─────────────────────────────────────────────────────────────────

export default function SettingsPage(): JSX.Element {
  const [settings, setSettings] = useState<SettingsState>({
    claudeApiKey: '',
    claudeModel: DEFAULT_CLAUDE_MODEL,
    geminiApiKey: '',
    geminiModel: DEFAULT_GEMINI_MODEL,
    openaiApiKey: '',
    openaiBaseUrl: DEFAULT_OPENAI_BASE_URL,
    openaiModel: DEFAULT_OPENAI_MODEL,
    openrouterConnected: false,
    openrouterModel: DEFAULT_OPENROUTER_MODEL,
    copilotConnected: false,
    copilotModel: DEFAULT_COPILOT_MODEL,
    githubModelsApiKey: '',
    githubModelsModel: DEFAULT_GITHUB_MODELS_MODEL,
    defaultProvider: 'claude',
    toneGuide: '',
    linkedDocs: ''
  })

  const [testState, setTestState] = useState<TestState>({
    claude: 'idle', gemini: 'idle', openai: 'idle', openrouter: 'idle', copilot: 'idle', 'github-models': 'idle'
  })
  const [testErrors, setTestErrors] = useState<TestError>({})
  const [savedFields, setSavedFields] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState<Set<string>>(new Set())
  const [initialLoad, setInitialLoad] = useState(true)

  const [showClaudeKey, setShowClaudeKey] = useState(false)
  const [showGeminiKey, setShowGeminiKey] = useState(false)
  const [showOpenAIKey, setShowOpenAIKey] = useState(false)
  const [showGithubModelsKey, setShowGithubModelsKey] = useState(false)

  // OpenRouter OAuth state
  const [openrouterStatus, setOpenrouterStatus] = useState<OAuthStatus>('idle')
  const [openrouterError, setOpenrouterError] = useState('')

  // GitHub Copilot Device Flow state
  const [copilotStatus, setCopilotStatus] = useState<DeviceFlowStatus>('idle')
  const [copilotUserCode, setCopilotUserCode] = useState('')
  const [copilotVerificationUri, setCopilotVerificationUri] = useState('')
  const [copilotError, setCopilotError] = useState('')
  const [copilotClientConfigured, setCopilotClientConfigured] = useState(false)

  const [credentials, setCredentials] = useState<CredentialEntry[]>([])
  const [newCred, setNewCred] = useState({ domain: '', username: '', password: '' })
  const [showNewCredPw, setShowNewCredPw] = useState(false)
  const [credBusy, setCredBusy] = useState(false)

  const pollAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        const all = await window.electronAPI.settingsGetAll()
        const claudeKey = await window.electronAPI.settingsGet('claudeApiKey') as string | null
        const geminiKey = await window.electronAPI.settingsGet('geminiApiKey') as string | null
        const openaiKey = await window.electronAPI.settingsGet('openaiApiKey') as string | null
        const githubModelsKey = await window.electronAPI.settingsGet('githubModelsApiKey') as string | null

        setSettings({
          claudeApiKey: claudeKey || '',
          claudeModel: (all.claudeModel as string) || DEFAULT_CLAUDE_MODEL,
          geminiApiKey: geminiKey || '',
          geminiModel: (all.geminiModel as string) || DEFAULT_GEMINI_MODEL,
          openaiApiKey: openaiKey || '',
          openaiBaseUrl: (all.openaiBaseUrl as string) || DEFAULT_OPENAI_BASE_URL,
          openaiModel: (all.openaiModel as string) || DEFAULT_OPENAI_MODEL,
          openrouterConnected: !!(all.openrouterConnected),
          openrouterModel: (all.openrouterModel as string) || DEFAULT_OPENROUTER_MODEL,
          copilotConnected: !!(all.copilotConnected),
          copilotModel: (all.copilotModel as string) || DEFAULT_COPILOT_MODEL,
          githubModelsApiKey: githubModelsKey || '',
          githubModelsModel: (all.githubModelsModel as string) || DEFAULT_GITHUB_MODELS_MODEL,
          defaultProvider: (all.defaultProvider as ProviderId) || 'claude',
          toneGuide: (all.toneGuide as string) || '',
          linkedDocs: (all.linkedDocs as string) || ''
        })

        const { configured } = await window.electronAPI.copilotClientConfigured()
        setCopilotClientConfigured(configured)

        setCredentials(await window.electronAPI.credentialsList())
      } catch (err) {
        console.error('Failed to load settings:', err)
      } finally {
        setInitialLoad(false)
      }
    }
    load()
  }, [])

  // Cleanup device flow poll on unmount
  useEffect(() => {
    return () => { pollAbortRef.current?.abort() }
  }, [])

  const saveField = useCallback(async (key: string, value: unknown): Promise<void> => {
    setSaving(prev => new Set(prev).add(key))
    try {
      await window.electronAPI.settingsSet(key, value)
      setSavedFields(prev => {
        const next = new Set(prev)
        next.add(key)
        return next
      })
      setTimeout(() => {
        setSavedFields(prev => {
          const next = new Set(prev)
          next.delete(key)
          return next
        })
      }, 2000)
    } catch (err) {
      console.error(`Failed to save ${key}:`, err)
    } finally {
      setSaving(prev => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    }
  }, [])

  const handleTestConnection = useCallback(async (provider: ProviderId): Promise<void> => {
    setTestState(prev => ({ ...prev, [provider]: 'testing' }))
    setTestErrors(prev => ({ ...prev, [provider]: undefined }))
    try {
      const result = await window.electronAPI.llmTestConnection(provider)
      setTestState(prev => ({ ...prev, [provider]: result.success ? 'ok' : 'fail' }))
      if (!result.success) setTestErrors(prev => ({ ...prev, [provider]: result.error }))
    } catch (err) {
      setTestState(prev => ({ ...prev, [provider]: 'fail' }))
      setTestErrors(prev => ({ ...prev, [provider]: err instanceof Error ? err.message : String(err) }))
    }
    setTimeout(() => {
      setTestState(prev => prev[provider] === 'ok' ? { ...prev, [provider]: 'idle' } : prev)
    }, 5000)
  }, [])

  // ── OpenRouter OAuth ───────────────────────────────────────────────────────

  const handleOpenrouterConnect = useCallback(async (): Promise<void> => {
    setOpenrouterStatus('connecting')
    setOpenrouterError('')
    try {
      const result = await window.electronAPI.openrouterConnect()
      if (result.success) {
        setSettings(prev => ({ ...prev, openrouterConnected: true }))
        setOpenrouterStatus('ok')
        setTimeout(() => setOpenrouterStatus('idle'), 3000)
      } else {
        setOpenrouterError(result.error ?? 'Connection failed.')
        setOpenrouterStatus('fail')
      }
    } catch (err) {
      setOpenrouterError(err instanceof Error ? err.message : String(err))
      setOpenrouterStatus('fail')
    }
  }, [])

  const handleOpenrouterDisconnect = useCallback(async (): Promise<void> => {
    await window.electronAPI.openrouterDisconnect()
    setSettings(prev => ({ ...prev, openrouterConnected: false }))
    setOpenrouterStatus('idle')
    setOpenrouterError('')
  }, [])

  // ── GitHub Copilot Device Flow ─────────────────────────────────────────────

  const handleCopilotConnect = useCallback(async (): Promise<void> => {
    setCopilotStatus('waiting')
    setCopilotError('')
    setCopilotUserCode('')
    setCopilotVerificationUri('')

    const startResult = await window.electronAPI.copilotStartDeviceFlow()
    if (!startResult.success) {
      setCopilotError(startResult.error ?? 'Failed to start device flow.')
      setCopilotStatus('fail')
      return
    }

    setCopilotUserCode(startResult.userCode)
    setCopilotVerificationUri(startResult.verificationUri)
    setCopilotStatus('polling')

    const abort = new AbortController()
    pollAbortRef.current = abort

    // Fire-and-forget polling in the main process; renderer just awaits the IPC result.
    const pollResult = await window.electronAPI.copilotPoll(startResult.deviceCode, startResult.interval)
    if (abort.signal.aborted) return

    if (pollResult.success) {
      setSettings(prev => ({ ...prev, copilotConnected: true }))
      setCopilotStatus('ok')
      setCopilotUserCode('')
      setTimeout(() => setCopilotStatus('idle'), 3000)
    } else {
      setCopilotError(pollResult.error ?? 'Authorisation failed.')
      setCopilotStatus('fail')
    }
  }, [])

  const handleCopilotDisconnect = useCallback(async (): Promise<void> => {
    pollAbortRef.current?.abort()
    await window.electronAPI.copilotDisconnect()
    setSettings(prev => ({ ...prev, copilotConnected: false }))
    setCopilotStatus('idle')
    setCopilotError('')
    setCopilotUserCode('')
  }, [])

  // ── Credentials ────────────────────────────────────────────────────────────

  const handleAddCredential = useCallback(async (): Promise<void> => {
    const domain = newCred.domain.trim()
    if (!domain || !newCred.password) return
    setCredBusy(true)
    try {
      await window.electronAPI.credentialsSet({ domain, username: newCred.username.trim(), password: newCred.password })
      setNewCred({ domain: '', username: '', password: '' })
      setShowNewCredPw(false)
      setCredentials(await window.electronAPI.credentialsList())
    } catch (err) {
      console.error('Failed to save credential:', err)
    } finally {
      setCredBusy(false)
    }
  }, [newCred])

  const handleRemoveCredential = useCallback(async (domain: string): Promise<void> => {
    setCredBusy(true)
    try {
      await window.electronAPI.credentialsDelete(domain)
      setCredentials(await window.electronAPI.credentialsList())
    } catch (err) {
      console.error('Failed to delete credential:', err)
    } finally {
      setCredBusy(false)
    }
  }, [])

  // ── Sub-components ─────────────────────────────────────────────────────────

  const FieldSavedBadge = ({ field }: { field: string }): JSX.Element | null => {
    if (!savedFields.has(field)) return null
    return (
      <span className="text-xs text-green-400 flex items-center gap-1">
        <CheckIcon /> Saved
      </span>
    )
  }

  const TestButton = ({ provider, disabled }: { provider: ProviderId; disabled?: boolean }): JSX.Element => {
    const s = testState[provider]
    return (
      <button
        onClick={() => handleTestConnection(provider)}
        disabled={s === 'testing' || disabled}
        className="btn btn-ghost btn-sm"
      >
        {s === 'testing' ? (<><SpinnerIcon /> Testing...</>) :
         s === 'ok' ? <span className="text-green-400">✓ Connected</span> :
         s === 'fail' ? <span className="text-red-400">✗ Failed</span> :
         'Test Connection'}
      </button>
    )
  }

  if (initialLoad) {
    return (
      <div className="flex items-center justify-center h-full gap-3 text-slate-500">
        <SpinnerIcon size={20} /> Loading settings...
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-800/60">
        <h1 className="text-xl font-bold text-slate-100">Settings</h1>
        <p className="text-sm text-slate-500 mt-0.5">Configure LLM providers, tone, and documentation preferences</p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-2xl mx-auto space-y-8">

          {/* API Keys section */}
          <section>
            <h2 className="text-base font-semibold text-slate-100 mb-1">LLM Providers</h2>
            <p className="text-xs text-slate-500 mb-4">
              API keys are stored securely in your OS keychain and never written to disk.
              OpenRouter and GitHub Copilot use OAuth — no key to copy.
            </p>

            <div className="card divide-y divide-slate-800">

              {/* Claude */}
              <div className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="badge-claude">Claude</span>
                      <span className="text-xs text-slate-500">Anthropic</span>
                    </div>
                    <div className="space-y-2">
                      <div>
                        <label className="label">API Key</label>
                        <div className="relative">
                          <input
                            type={showClaudeKey ? 'text' : 'password'}
                            value={settings.claudeApiKey}
                            onChange={e => setSettings(prev => ({ ...prev, claudeApiKey: e.target.value }))}
                            placeholder="sk-ant-..."
                            className="input pr-10"
                          />
                          <button type="button" onClick={() => setShowClaudeKey(!showClaudeKey)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                            {showClaudeKey ? <EyeOffIcon /> : <EyeIcon />}
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="label">Model</label>
                        <input type="text" value={settings.claudeModel}
                          onChange={e => setSettings(prev => ({ ...prev, claudeModel: e.target.value }))}
                          placeholder={DEFAULT_CLAUDE_MODEL} className="input font-mono text-xs" />
                      </div>
                    </div>
                    {testState.claude === 'fail' && testErrors.claude && (
                      <p className="text-xs text-red-400 mt-1">{testErrors.claude}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <button onClick={() => { saveField('claudeApiKey', settings.claudeApiKey); saveField('claudeModel', settings.claudeModel) }}
                    disabled={saving.has('claudeApiKey')} className="btn btn-secondary btn-sm">
                    {saving.has('claudeApiKey') ? 'Saving...' : 'Save'}
                  </button>
                  <TestButton provider="claude" disabled={!settings.claudeApiKey} />
                  <FieldSavedBadge field="claudeApiKey" />
                </div>
              </div>

              {/* Gemini */}
              <div className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="badge-gemini">Gemini</span>
                      <span className="text-xs text-slate-500">Google</span>
                    </div>
                    <div className="space-y-2">
                      <div>
                        <label className="label">API Key</label>
                        <div className="relative">
                          <input
                            type={showGeminiKey ? 'text' : 'password'}
                            value={settings.geminiApiKey}
                            onChange={e => setSettings(prev => ({ ...prev, geminiApiKey: e.target.value }))}
                            placeholder="AIza..."
                            className="input pr-10"
                          />
                          <button type="button" onClick={() => setShowGeminiKey(!showGeminiKey)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                            {showGeminiKey ? <EyeOffIcon /> : <EyeIcon />}
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="label">Model</label>
                        <input type="text" value={settings.geminiModel}
                          onChange={e => setSettings(prev => ({ ...prev, geminiModel: e.target.value }))}
                          placeholder={DEFAULT_GEMINI_MODEL} className="input font-mono text-xs" />
                      </div>
                    </div>
                    {testState.gemini === 'fail' && testErrors.gemini && (
                      <p className="text-xs text-red-400 mt-1">{testErrors.gemini}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <button onClick={() => { saveField('geminiApiKey', settings.geminiApiKey); saveField('geminiModel', settings.geminiModel) }}
                    disabled={saving.has('geminiApiKey')} className="btn btn-secondary btn-sm">
                    {saving.has('geminiApiKey') ? 'Saving...' : 'Save'}
                  </button>
                  <TestButton provider="gemini" disabled={!settings.geminiApiKey} />
                  <FieldSavedBadge field="geminiApiKey" />
                </div>
              </div>

              {/* OpenRouter — OAuth PKCE */}
              <div className="p-5">
                <div className="flex items-center gap-2 mb-1">
                  <span className="badge-openrouter">OpenRouter</span>
                  {settings.openrouterConnected && (
                    <span className="text-xs text-green-400 flex items-center gap-1"><CheckIcon /> Connected</span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mb-3">
                  Access Claude, GPT, Gemini, and open-source models from one balance.
                  Authorise once — no API key to copy.
                </p>

                <div className="space-y-2">
                  <div>
                    <label className="label">Model</label>
                    <input type="text" value={settings.openrouterModel}
                      onChange={e => setSettings(prev => ({ ...prev, openrouterModel: e.target.value }))}
                      placeholder={DEFAULT_OPENROUTER_MODEL} className="input font-mono text-xs" />
                    <p className="text-xs text-slate-600 mt-1">Browse models at openrouter.ai/models</p>
                  </div>
                </div>

                {openrouterError && (
                  <p className="text-xs text-red-400 mt-2">{openrouterError}</p>
                )}
                {testState.openrouter === 'fail' && testErrors.openrouter && (
                  <p className="text-xs text-red-400 mt-1">{testErrors.openrouter}</p>
                )}

                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  {settings.openrouterConnected ? (
                    <>
                      <button onClick={() => { saveField('openrouterModel', settings.openrouterModel) }}
                        disabled={saving.has('openrouterModel')} className="btn btn-secondary btn-sm">
                        {saving.has('openrouterModel') ? 'Saving...' : 'Save Model'}
                      </button>
                      <TestButton provider="openrouter" />
                      <button onClick={handleOpenrouterDisconnect} className="btn btn-ghost btn-sm text-red-400 hover:text-red-300">
                        Disconnect
                      </button>
                      <FieldSavedBadge field="openrouterModel" />
                    </>
                  ) : (
                    <button onClick={handleOpenrouterConnect}
                      disabled={openrouterStatus === 'connecting'}
                      className="btn btn-secondary btn-sm flex items-center gap-2">
                      {openrouterStatus === 'connecting' ? (
                        <><SpinnerIcon /> Waiting for browser...</>
                      ) : openrouterStatus === 'ok' ? (
                        <span className="text-green-400">✓ Connected</span>
                      ) : (
                        'Connect with OpenRouter'
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* GitHub Copilot — Device Flow */}
              <div className="p-5">
                <div className="flex items-center gap-2 mb-1">
                  <span className="badge-copilot">Copilot</span>
                  <span className="text-xs text-slate-500">GitHub</span>
                  {settings.copilotConnected && (
                    <span className="text-xs text-green-400 flex items-center gap-1"><CheckIcon /> Connected</span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mb-3">
                  Use your GitHub Copilot subscription directly — no proxy required.
                  Sign in with your GitHub account to authorise.
                </p>

                {!copilotClientConfigured && (
                  <div className="rounded-lg border border-amber-800/40 bg-amber-900/10 px-3 py-2 mb-3">
                    <p className="text-xs text-amber-400">
                      GitHub OAuth App not configured. Register an OAuth App at{' '}
                      <span className="font-mono">github.com/settings/developers</span> and set{' '}
                      <span className="font-mono">GITHUB_COPILOT_CLIENT_ID</span> at build time.
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <div>
                    <label className="label">Model</label>
                    <input type="text" value={settings.copilotModel}
                      onChange={e => setSettings(prev => ({ ...prev, copilotModel: e.target.value }))}
                      placeholder={DEFAULT_COPILOT_MODEL} className="input font-mono text-xs" />
                  </div>
                </div>

                {/* Device flow code display */}
                {(copilotStatus === 'waiting' || copilotStatus === 'polling') && copilotUserCode && (
                  <div className="mt-3 rounded-lg border border-sky-800/40 bg-sky-900/10 px-4 py-3 space-y-2">
                    <p className="text-xs text-slate-400">
                      Go to{' '}
                      <button
                        onClick={() => window.electronAPI.openExternal(copilotVerificationUri)}
                        className="text-sky-400 hover:text-sky-300 underline underline-offset-2">
                        {copilotVerificationUri}
                      </button>{' '}
                      and enter this code:
                    </p>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xl font-bold tracking-widest text-slate-100">
                        {copilotUserCode}
                      </span>
                      <SpinnerIcon size={14} />
                      <span className="text-xs text-slate-500">Waiting for authorisation…</span>
                    </div>
                  </div>
                )}

                {copilotError && (
                  <p className="text-xs text-red-400 mt-2">{copilotError}</p>
                )}
                {testState.copilot === 'fail' && testErrors.copilot && (
                  <p className="text-xs text-red-400 mt-1">{testErrors.copilot}</p>
                )}

                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  {settings.copilotConnected ? (
                    <>
                      <button onClick={() => { saveField('copilotModel', settings.copilotModel) }}
                        disabled={saving.has('copilotModel')} className="btn btn-secondary btn-sm">
                        {saving.has('copilotModel') ? 'Saving...' : 'Save Model'}
                      </button>
                      <TestButton provider="copilot" />
                      <button onClick={handleCopilotDisconnect} className="btn btn-ghost btn-sm text-red-400 hover:text-red-300">
                        Disconnect
                      </button>
                      <FieldSavedBadge field="copilotModel" />
                    </>
                  ) : (
                    <button
                      onClick={handleCopilotConnect}
                      disabled={!copilotClientConfigured || copilotStatus === 'polling' || copilotStatus === 'waiting'}
                      className="btn btn-secondary btn-sm flex items-center gap-2">
                      {copilotStatus === 'polling' || copilotStatus === 'waiting' ? (
                        <><SpinnerIcon /> Authorising…</>
                      ) : copilotStatus === 'ok' ? (
                        <span className="text-green-400">✓ Connected</span>
                      ) : (
                        'Connect with GitHub'
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* GitHub Models */}
              <div className="p-5">
                <div className="flex items-center gap-2 mb-1">
                  <span className="badge-github-models">GitHub Models</span>
                  <span className="text-xs text-slate-500">GitHub</span>
                </div>
                <p className="text-xs text-slate-500 mb-3">
                  Access GPT-4o, Llama, DeepSeek, and more for free via your GitHub account.
                  Create a personal access token with <span className="font-mono">models:read</span> scope at{' '}
                  <button
                    onClick={() => window.electronAPI.openExternal('https://github.com/settings/tokens')}
                    className="text-green-400 hover:text-green-300 underline underline-offset-2">
                    github.com/settings/tokens
                  </button>.
                </p>

                <div className="space-y-2">
                  <div>
                    <label className="label">Personal Access Token</label>
                    <div className="relative">
                      <input
                        type={showGithubModelsKey ? 'text' : 'password'}
                        value={settings.githubModelsApiKey}
                        onChange={e => setSettings(prev => ({ ...prev, githubModelsApiKey: e.target.value }))}
                        placeholder="github_pat_..."
                        className="input pr-10"
                      />
                      <button type="button" onClick={() => setShowGithubModelsKey(!showGithubModelsKey)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                        {showGithubModelsKey ? <EyeOffIcon /> : <EyeIcon />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="label">Model</label>
                    <input type="text" value={settings.githubModelsModel}
                      onChange={e => setSettings(prev => ({ ...prev, githubModelsModel: e.target.value }))}
                      placeholder={DEFAULT_GITHUB_MODELS_MODEL} className="input font-mono text-xs" />
                    <p className="text-xs text-slate-600 mt-1">Browse models at github.com/marketplace/models</p>
                  </div>
                </div>

                {testState['github-models'] === 'fail' && testErrors['github-models'] && (
                  <p className="text-xs text-red-400 mt-2">{testErrors['github-models']}</p>
                )}

                <div className="flex items-center gap-2 mt-3">
                  <button
                    onClick={() => { saveField('githubModelsApiKey', settings.githubModelsApiKey); saveField('githubModelsModel', settings.githubModelsModel) }}
                    disabled={saving.has('githubModelsApiKey')} className="btn btn-secondary btn-sm">
                    {saving.has('githubModelsApiKey') ? 'Saving...' : 'Save'}
                  </button>
                  <TestButton provider="github-models" disabled={!settings.githubModelsApiKey} />
                  <FieldSavedBadge field="githubModelsApiKey" />
                </div>
              </div>

              {/* OpenAI-compatible */}
              <div className="p-5">
                <div className="flex items-center gap-2 mb-1">
                  <span className="badge-openai">OpenAI</span>
                  <span className="text-xs text-slate-500">OpenAI-compatible · Ollama, custom endpoints</span>
                </div>
                <p className="text-xs text-slate-500 mb-3">
                  Point this at any OpenAI-compatible endpoint — OpenAI directly, a local Ollama instance, or any other compatible server.
                </p>

                <div className="space-y-2">
                  <div>
                    <label className="label">Base URL</label>
                    <input type="text" value={settings.openaiBaseUrl}
                      onChange={e => setSettings(prev => ({ ...prev, openaiBaseUrl: e.target.value }))}
                      placeholder={DEFAULT_OPENAI_BASE_URL} className="input font-mono text-xs" />
                  </div>
                  <div>
                    <label className="label">Model</label>
                    <input type="text" value={settings.openaiModel}
                      onChange={e => setSettings(prev => ({ ...prev, openaiModel: e.target.value }))}
                      placeholder={DEFAULT_OPENAI_MODEL} className="input font-mono text-xs" />
                  </div>
                  <div>
                    <label className="label">API Key <span className="text-slate-600">(optional)</span></label>
                    <div className="relative">
                      <input
                        type={showOpenAIKey ? 'text' : 'password'}
                        value={settings.openaiApiKey}
                        onChange={e => setSettings(prev => ({ ...prev, openaiApiKey: e.target.value }))}
                        placeholder="Leave blank for unauthenticated endpoints"
                        className="input pr-10"
                      />
                      <button type="button" onClick={() => setShowOpenAIKey(!showOpenAIKey)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                        {showOpenAIKey ? <EyeOffIcon /> : <EyeIcon />}
                      </button>
                    </div>
                  </div>
                </div>

                {testState.openai === 'fail' && testErrors.openai && (
                  <p className="text-xs text-red-400 mt-2">{testErrors.openai}</p>
                )}

                <div className="flex items-center gap-2 mt-3">
                  <button onClick={() => { saveField('openaiBaseUrl', settings.openaiBaseUrl); saveField('openaiModel', settings.openaiModel); saveField('openaiApiKey', settings.openaiApiKey) }}
                    disabled={saving.has('openaiApiKey')} className="btn btn-secondary btn-sm">
                    {saving.has('openaiApiKey') ? 'Saving...' : 'Save'}
                  </button>
                  <TestButton provider="openai" />
                  <FieldSavedBadge field="openaiApiKey" />
                </div>
              </div>

            </div>
          </section>

          {/* Login Credentials */}
          <section>
            <h2 className="text-base font-semibold text-slate-100 mb-1">Login Credentials</h2>
            <p className="text-xs text-slate-500 mb-4">
              Per-site sign-in credentials, stored in your OS keychain. When an agent run&apos;s
              URL matches a domain below, the agent signs in automatically. Passwords are typed
              directly into the site and are never sent to the LLM.
            </p>

            <div className="card divide-y divide-slate-800">
              {credentials.length === 0 ? (
                <div className="p-5 text-xs text-slate-500">No credentials saved yet.</div>
              ) : (
                credentials.map(cred => (
                  <div key={cred.domain} className="p-4 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-sm text-slate-200 font-medium truncate">{cred.domain}</div>
                      <div className="text-xs text-slate-500 truncate">
                        {cred.username || <span className="italic">no username</span>} · ••••••••
                      </div>
                    </div>
                    <button onClick={() => handleRemoveCredential(cred.domain)} disabled={credBusy}
                      className="btn btn-ghost btn-sm text-red-400 hover:text-red-300">
                      Remove
                    </button>
                  </div>
                ))
              )}
              <div className="p-5 space-y-3">
                <div className="text-xs font-medium text-slate-400">Add credentials</div>
                <input value={newCred.domain}
                  onChange={e => setNewCred(prev => ({ ...prev, domain: e.target.value }))}
                  placeholder="Domain (e.g. thelandapp.com)" className="input" />
                <input value={newCred.username}
                  onChange={e => setNewCred(prev => ({ ...prev, username: e.target.value }))}
                  placeholder="Username or email" className="input" />
                <div className="relative">
                  <input type={showNewCredPw ? 'text' : 'password'} value={newCred.password}
                    onChange={e => setNewCred(prev => ({ ...prev, password: e.target.value }))}
                    placeholder="Password" className="input pr-10" />
                  <button type="button" onClick={() => setShowNewCredPw(!showNewCredPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                    {showNewCredPw ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
                <button onClick={handleAddCredential} disabled={credBusy || !newCred.domain.trim() || !newCred.password}
                  className="btn btn-secondary btn-sm">
                  {credBusy ? 'Saving...' : 'Add Credentials'}
                </button>
              </div>
            </div>
          </section>

          {/* Default Provider */}
          <section>
            <h2 className="text-base font-semibold text-slate-100 mb-1">Default Provider</h2>
            <p className="text-xs text-slate-500 mb-4">
              The provider used for all runs. Connect or configure the provider above first.
            </p>

            <div className="grid grid-cols-3 gap-3">
              {PROVIDERS.map(meta => {
                const selected = settings.defaultProvider === meta.id
                return (
                  <button key={meta.id} type="button"
                    onClick={() => { setSettings(prev => ({ ...prev, defaultProvider: meta.id })); saveField('defaultProvider', meta.id) }}
                    className={`p-3 rounded-xl border-2 text-left transition-all ${selected ? meta.accentBorder : 'border-slate-800 bg-slate-900 hover:border-slate-700'}`}>
                    <div className="flex items-center justify-between">
                      <span className={meta.badgeClass}>{meta.label}</span>
                      {selected && (
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={meta.accentText}>
                          <path d="M2 7l3.5 3.5L12 3" />
                        </svg>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">{meta.vendor}</div>
                  </button>
                )
              })}
            </div>
          </section>

          {/* Tone Guide */}
          <section>
            <h2 className="text-base font-semibold text-slate-100 mb-1">Tone Guide</h2>
            <p className="text-xs text-slate-500 mb-4">
              Instructions for how the AI should write documentation. Appended to every generation prompt.
            </p>
            <textarea value={settings.toneGuide}
              onChange={e => setSettings(prev => ({ ...prev, toneGuide: e.target.value }))}
              placeholder="e.g., Write in a friendly, concise tone. Avoid technical jargon. Use second-person perspective (you/your)..."
              className="input resize-none mb-2" rows={4} />
            <div className="flex items-center gap-2">
              <button onClick={() => saveField('toneGuide', settings.toneGuide)}
                disabled={saving.has('toneGuide')} className="btn btn-secondary btn-sm">
                {saving.has('toneGuide') ? 'Saving...' : 'Save'}
              </button>
              <FieldSavedBadge field="toneGuide" />
            </div>
          </section>

          {/* Linked Docs */}
          <section>
            <h2 className="text-base font-semibold text-slate-100 mb-1">Linked Documentation</h2>
            <p className="text-xs text-slate-500 mb-4">
              Reference documentation snippets the AI can use as context when generating new docs.
            </p>
            <textarea value={settings.linkedDocs}
              onChange={e => setSettings(prev => ({ ...prev, linkedDocs: e.target.value }))}
              placeholder="Paste related documentation here that the AI should reference when generating new docs..."
              className="input resize-none mb-2 font-mono text-xs" rows={6} />
            <div className="flex items-center gap-2">
              <button onClick={() => saveField('linkedDocs', settings.linkedDocs)}
                disabled={saving.has('linkedDocs')} className="btn btn-secondary btn-sm">
                {saving.has('linkedDocs') ? 'Saving...' : 'Save'}
              </button>
              <FieldSavedBadge field="linkedDocs" />
            </div>
          </section>

          {/* About */}
          <section>
            <h2 className="text-base font-semibold text-slate-100 mb-4">About</h2>
            <div className="card p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Version</span>
                <span className="text-slate-300">1.0.0</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Agent mode</span>
                <span className="text-slate-300">Live browser (Playwright)</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Claude model</span>
                <span className="text-slate-300 font-mono text-xs">{settings.claudeModel || DEFAULT_CLAUDE_MODEL}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Gemini model</span>
                <span className="text-slate-300 font-mono text-xs">{settings.geminiModel || DEFAULT_GEMINI_MODEL}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">OpenAI model</span>
                <span className="text-slate-300 font-mono text-xs">{settings.openaiModel || DEFAULT_OPENAI_MODEL}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">OpenRouter model</span>
                <span className="text-slate-300 font-mono text-xs">{settings.openrouterModel || DEFAULT_OPENROUTER_MODEL}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Copilot model</span>
                <span className="text-slate-300 font-mono text-xs">{settings.copilotModel || DEFAULT_COPILOT_MODEL}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">GitHub Models model</span>
                <span className="text-slate-300 font-mono text-xs">{settings.githubModelsModel || DEFAULT_GITHUB_MODELS_MODEL}</span>
              </div>
              <div className="border-t border-slate-800 pt-2 mt-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Storage</span>
                  <span className="text-slate-300 font-mono text-xs">~/GuidanceStudio/runs/</span>
                </div>
              </div>
            </div>
          </section>

        </div>
      </div>
    </div>
  )
}
