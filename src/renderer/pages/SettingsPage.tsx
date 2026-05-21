import React, { useState, useEffect, useCallback } from 'react'
import { PROVIDERS, type ProviderId } from '../providers'

const DEFAULT_OPENAI_BASE_URL = 'http://localhost:4141/v1'
const DEFAULT_OPENAI_MODEL = 'gpt-4.1'
const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-4-6'
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash'

interface SettingsState {
  claudeApiKey: string
  claudeModel: string
  geminiApiKey: string
  geminiModel: string
  openaiApiKey: string
  openaiBaseUrl: string
  openaiModel: string
  defaultProvider: ProviderId
  toneGuide: string
  linkedDocs: string
}

type TestStatus = 'idle' | 'testing' | 'ok' | 'fail'

type TestState = Record<ProviderId, TestStatus>

type TestError = Partial<Record<ProviderId, string>>

interface CredentialEntry {
  domain: string
  username: string
}

export default function SettingsPage(): JSX.Element {
  const [settings, setSettings] = useState<SettingsState>({
    claudeApiKey: '',
    claudeModel: DEFAULT_CLAUDE_MODEL,
    geminiApiKey: '',
    geminiModel: DEFAULT_GEMINI_MODEL,
    openaiApiKey: '',
    openaiBaseUrl: DEFAULT_OPENAI_BASE_URL,
    openaiModel: DEFAULT_OPENAI_MODEL,
    defaultProvider: 'claude',
    toneGuide: '',
    linkedDocs: ''
  })

  const [testState, setTestState] = useState<TestState>({ claude: 'idle', gemini: 'idle', openai: 'idle' })
  const [testErrors, setTestErrors] = useState<TestError>({})
  const [savedFields, setSavedFields] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState<Set<string>>(new Set())
  const [initialLoad, setInitialLoad] = useState(true)

  const [showClaudeKey, setShowClaudeKey] = useState(false)
  const [showGeminiKey, setShowGeminiKey] = useState(false)
  const [showOpenAIKey, setShowOpenAIKey] = useState(false)

  const [credentials, setCredentials] = useState<CredentialEntry[]>([])
  const [newCred, setNewCred] = useState({ domain: '', username: '', password: '' })
  const [showNewCredPw, setShowNewCredPw] = useState(false)
  const [credBusy, setCredBusy] = useState(false)

  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        const all = await window.electronAPI.settingsGetAll()
        const claudeKey = await window.electronAPI.settingsGet('claudeApiKey') as string | null
        const geminiKey = await window.electronAPI.settingsGet('geminiApiKey') as string | null
        const openaiKey = await window.electronAPI.settingsGet('openaiApiKey') as string | null

        setSettings({
          claudeApiKey: claudeKey || '',
          claudeModel: (all.claudeModel as string) || DEFAULT_CLAUDE_MODEL,
          geminiApiKey: geminiKey || '',
          geminiModel: (all.geminiModel as string) || DEFAULT_GEMINI_MODEL,
          openaiApiKey: openaiKey || '',
          openaiBaseUrl: (all.openaiBaseUrl as string) || DEFAULT_OPENAI_BASE_URL,
          openaiModel: (all.openaiModel as string) || DEFAULT_OPENAI_MODEL,
          defaultProvider: (all.defaultProvider as ProviderId) || 'claude',
          toneGuide: (all.toneGuide as string) || '',
          linkedDocs: (all.linkedDocs as string) || ''
        })

        setCredentials(await window.electronAPI.credentialsList())
      } catch (err) {
        console.error('Failed to load settings:', err)
      } finally {
        setInitialLoad(false)
      }
    }
    load()
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
      if (!result.success) {
        setTestErrors(prev => ({ ...prev, [provider]: result.error }))
      }
    } catch (err) {
      setTestState(prev => ({ ...prev, [provider]: 'fail' }))
      setTestErrors(prev => ({ ...prev, [provider]: err instanceof Error ? err.message : String(err) }))
    }

    // Only auto-reset on success; failures stay visible until user retries
    setTimeout(() => {
      setTestState(prev => {
        if (prev[provider] === 'ok') return { ...prev, [provider]: 'idle' }
        return prev
      })
    }, 5000)
  }, [])

  const handleAddCredential = useCallback(async (): Promise<void> => {
    const domain = newCred.domain.trim()
    if (!domain || !newCred.password) return
    setCredBusy(true)
    try {
      await window.electronAPI.credentialsSet({
        domain,
        username: newCred.username.trim(),
        password: newCred.password
      })
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

  const FieldSavedBadge = ({ field }: { field: string }): JSX.Element | null => {
    if (!savedFields.has(field)) return null
    return (
      <span className="text-xs text-green-400 flex items-center gap-1">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M2 6l3 3 5-5" />
        </svg>
        Saved
      </span>
    )
  }

  if (initialLoad) {
    return (
      <div className="flex items-center justify-center h-full gap-3 text-slate-500">
        <svg className="animate-spin" width="20" height="20" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="8" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
          <path d="M10 2a8 8 0 018 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        Loading settings...
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-800/60">
        <h1 className="text-xl font-bold text-slate-100">Settings</h1>
        <p className="text-sm text-slate-500 mt-0.5">Configure API keys, tone, and documentation preferences</p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-2xl mx-auto space-y-8">

          {/* API Keys section */}
          <section>
            <h2 className="text-base font-semibold text-slate-100 mb-1">API Keys</h2>
            <p className="text-xs text-slate-500 mb-4">
              Keys are stored securely in your OS keychain using keytar. They are never written to disk.
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
                          <button
                            type="button"
                            onClick={() => setShowClaudeKey(!showClaudeKey)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                          >
                            {showClaudeKey ? (
                              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                                <path d="M1 7s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4z" />
                                <circle cx="7" cy="7" r="1.5" />
                                <path d="M1 1l12 12" />
                              </svg>
                            ) : (
                              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                                <path d="M1 7s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4z" />
                                <circle cx="7" cy="7" r="1.5" />
                              </svg>
                            )}
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="label">Model</label>
                        <input
                          type="text"
                          value={settings.claudeModel}
                          onChange={e => setSettings(prev => ({ ...prev, claudeModel: e.target.value }))}
                          placeholder={DEFAULT_CLAUDE_MODEL}
                          className="input font-mono text-xs"
                        />
                      </div>
                    </div>

                    {testState.claude === 'fail' && testErrors.claude && (
                      <p className="text-xs text-red-400 mt-1">{testErrors.claude}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-3">
                  <button
                    onClick={() => {
                      saveField('claudeApiKey', settings.claudeApiKey)
                      saveField('claudeModel', settings.claudeModel)
                    }}
                    disabled={saving.has('claudeApiKey')}
                    className="btn btn-secondary btn-sm"
                  >
                    {saving.has('claudeApiKey') ? 'Saving...' : 'Save'}
                  </button>

                  <button
                    onClick={() => handleTestConnection('claude')}
                    disabled={testState.claude === 'testing' || !settings.claudeApiKey}
                    className="btn btn-ghost btn-sm"
                  >
                    {testState.claude === 'testing' ? (
                      <>
                        <svg className="animate-spin" width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.5" />
                          <path d="M6 1.5a4.5 4.5 0 014.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                        Testing...
                      </>
                    ) : testState.claude === 'ok' ? (
                      <span className="text-green-400">✓ Connected</span>
                    ) : testState.claude === 'fail' ? (
                      <span className="text-red-400">✗ Failed</span>
                    ) : (
                      'Test Connection'
                    )}
                  </button>

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
                          <button
                            type="button"
                            onClick={() => setShowGeminiKey(!showGeminiKey)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                          >
                            {showGeminiKey ? (
                              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                                <path d="M1 7s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4z" />
                                <circle cx="7" cy="7" r="1.5" />
                                <path d="M1 1l12 12" />
                              </svg>
                            ) : (
                              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                                <path d="M1 7s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4z" />
                                <circle cx="7" cy="7" r="1.5" />
                              </svg>
                            )}
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="label">Model</label>
                        <input
                          type="text"
                          value={settings.geminiModel}
                          onChange={e => setSettings(prev => ({ ...prev, geminiModel: e.target.value }))}
                          placeholder={DEFAULT_GEMINI_MODEL}
                          className="input font-mono text-xs"
                        />
                      </div>
                    </div>

                    {testState.gemini === 'fail' && testErrors.gemini && (
                      <p className="text-xs text-red-400 mt-1">{testErrors.gemini}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-3">
                  <button
                    onClick={() => {
                      saveField('geminiApiKey', settings.geminiApiKey)
                      saveField('geminiModel', settings.geminiModel)
                    }}
                    disabled={saving.has('geminiApiKey')}
                    className="btn btn-secondary btn-sm"
                  >
                    {saving.has('geminiApiKey') ? 'Saving...' : 'Save'}
                  </button>

                  <button
                    onClick={() => handleTestConnection('gemini')}
                    disabled={testState.gemini === 'testing' || !settings.geminiApiKey}
                    className="btn btn-ghost btn-sm"
                  >
                    {testState.gemini === 'testing' ? (
                      <>
                        <svg className="animate-spin" width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.5" />
                          <path d="M6 1.5a4.5 4.5 0 014.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                        Testing...
                      </>
                    ) : testState.gemini === 'ok' ? (
                      <span className="text-green-400">✓ Connected</span>
                    ) : testState.gemini === 'fail' ? (
                      <span className="text-red-400">✗ Failed</span>
                    ) : (
                      'Test Connection'
                    )}
                  </button>

                  <FieldSavedBadge field="geminiApiKey" />
                </div>
              </div>

              {/* OpenAI-compatible */}
              <div className="p-5">
                <div className="flex items-center gap-2 mb-1">
                  <span className="badge-openai">OpenAI</span>
                  <span className="text-xs text-slate-500">OpenAI-compatible · Copilot, OpenRouter, Ollama</span>
                </div>
                <p className="text-xs text-slate-500 mb-3">
                  Point this at any OpenAI-compatible endpoint. For GitHub Copilot, run the
                  local <code className="text-slate-300">copilot-api</code> proxy and use its
                  URL below — no API key required.
                </p>

                <div className="space-y-2">
                  <div>
                    <label className="label">Base URL</label>
                    <input
                      type="text"
                      value={settings.openaiBaseUrl}
                      onChange={e => setSettings(prev => ({ ...prev, openaiBaseUrl: e.target.value }))}
                      placeholder={DEFAULT_OPENAI_BASE_URL}
                      className="input font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="label">Model</label>
                    <input
                      type="text"
                      value={settings.openaiModel}
                      onChange={e => setSettings(prev => ({ ...prev, openaiModel: e.target.value }))}
                      placeholder={DEFAULT_OPENAI_MODEL}
                      className="input font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="label">API Key <span className="text-slate-600">(optional)</span></label>
                    <div className="relative">
                      <input
                        type={showOpenAIKey ? 'text' : 'password'}
                        value={settings.openaiApiKey}
                        onChange={e => setSettings(prev => ({ ...prev, openaiApiKey: e.target.value }))}
                        placeholder="Leave blank for a local Copilot proxy"
                        className="input pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowOpenAIKey(!showOpenAIKey)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                      >
                        {showOpenAIKey ? (
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                            <path d="M1 7s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4z" />
                            <circle cx="7" cy="7" r="1.5" />
                            <path d="M1 1l12 12" />
                          </svg>
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                            <path d="M1 7s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4z" />
                            <circle cx="7" cy="7" r="1.5" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {testState.openai === 'fail' && testErrors.openai && (
                  <p className="text-xs text-red-400 mt-2">{testErrors.openai}</p>
                )}

                <div className="flex items-center gap-2 mt-3">
                  <button
                    onClick={() => {
                      saveField('openaiBaseUrl', settings.openaiBaseUrl)
                      saveField('openaiModel', settings.openaiModel)
                      saveField('openaiApiKey', settings.openaiApiKey)
                    }}
                    disabled={saving.has('openaiApiKey')}
                    className="btn btn-secondary btn-sm"
                  >
                    {saving.has('openaiApiKey') ? 'Saving...' : 'Save'}
                  </button>

                  <button
                    onClick={() => handleTestConnection('openai')}
                    disabled={testState.openai === 'testing'}
                    className="btn btn-ghost btn-sm"
                  >
                    {testState.openai === 'testing' ? (
                      <>
                        <svg className="animate-spin" width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.5" />
                          <path d="M6 1.5a4.5 4.5 0 014.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                        Testing...
                      </>
                    ) : testState.openai === 'ok' ? (
                      <span className="text-green-400">✓ Connected</span>
                    ) : testState.openai === 'fail' ? (
                      <span className="text-red-400">✗ Failed</span>
                    ) : (
                      'Test Connection'
                    )}
                  </button>

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
                    <button
                      onClick={() => handleRemoveCredential(cred.domain)}
                      disabled={credBusy}
                      className="btn btn-ghost btn-sm text-red-400 hover:text-red-300"
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}

              {/* Add form */}
              <div className="p-5 space-y-3">
                <div className="text-xs font-medium text-slate-400">Add credentials</div>
                <input
                  value={newCred.domain}
                  onChange={e => setNewCred(prev => ({ ...prev, domain: e.target.value }))}
                  placeholder="Domain (e.g. thelandapp.com)"
                  className="input"
                />
                <input
                  value={newCred.username}
                  onChange={e => setNewCred(prev => ({ ...prev, username: e.target.value }))}
                  placeholder="Username or email"
                  className="input"
                />
                <div className="relative">
                  <input
                    type={showNewCredPw ? 'text' : 'password'}
                    value={newCred.password}
                    onChange={e => setNewCred(prev => ({ ...prev, password: e.target.value }))}
                    placeholder="Password"
                    className="input pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewCredPw(!showNewCredPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  >
                    {showNewCredPw ? (
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                        <path d="M1 7s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4z" />
                        <circle cx="7" cy="7" r="1.5" />
                        <path d="M1 1l12 12" />
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                        <path d="M1 7s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4z" />
                        <circle cx="7" cy="7" r="1.5" />
                      </svg>
                    )}
                  </button>
                </div>
                <button
                  onClick={handleAddCredential}
                  disabled={credBusy || !newCred.domain.trim() || !newCred.password}
                  className="btn btn-secondary btn-sm"
                >
                  {credBusy ? 'Saving...' : 'Add Credentials'}
                </button>
              </div>
            </div>
          </section>

          {/* LLM Provider */}
          <section>
            <h2 className="text-base font-semibold text-slate-100 mb-1">LLM Provider</h2>
            <p className="text-xs text-slate-500 mb-4">
              The provider used for all runs. Set your API key and model above, then select the active provider here.
            </p>

            <div className="grid grid-cols-3 gap-3">
              {PROVIDERS.map(meta => {
                const selected = settings.defaultProvider === meta.id
                return (
                  <button
                    key={meta.id}
                    type="button"
                    onClick={() => {
                      setSettings(prev => ({ ...prev, defaultProvider: meta.id }))
                      saveField('defaultProvider', meta.id)
                    }}
                    className={`
                      p-3 rounded-xl border-2 text-left transition-all
                      ${selected
                        ? meta.accentBorder
                        : 'border-slate-800 bg-slate-900 hover:border-slate-700'
                      }
                    `}
                  >
                    <div className="flex items-center justify-between">
                      <span className={meta.badgeClass}>{meta.label}</span>
                      {selected && (
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={meta.accentText}>
                          <path d="M2 7l3.5 3.5L12 3" />
                        </svg>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </section>

          {/* Tone Guide */}
          <section>
            <h2 className="text-base font-semibold text-slate-100 mb-1">Tone Guide</h2>
            <p className="text-xs text-slate-500 mb-4">
              Instructions for how the AI should write documentation. This is appended to every generation prompt.
            </p>

            <textarea
              value={settings.toneGuide}
              onChange={e => setSettings(prev => ({ ...prev, toneGuide: e.target.value }))}
              placeholder="e.g., Write in a friendly, concise tone. Avoid technical jargon. Use second-person perspective (you/your). Keep sentences under 20 words..."
              className="input resize-none mb-2"
              rows={4}
            />
            <div className="flex items-center gap-2">
              <button
                onClick={() => saveField('toneGuide', settings.toneGuide)}
                disabled={saving.has('toneGuide')}
                className="btn btn-secondary btn-sm"
              >
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
              Paste relevant sections here.
            </p>

            <textarea
              value={settings.linkedDocs}
              onChange={e => setSettings(prev => ({ ...prev, linkedDocs: e.target.value }))}
              placeholder="Paste related documentation here that the AI should reference when generating new docs..."
              className="input resize-none mb-2 font-mono text-xs"
              rows={6}
            />
            <div className="flex items-center gap-2">
              <button
                onClick={() => saveField('linkedDocs', settings.linkedDocs)}
                disabled={saving.has('linkedDocs')}
                className="btn btn-secondary btn-sm"
              >
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
