import React, { useState, useEffect, useCallback } from 'react'

interface SettingsState {
  claudeApiKey: string
  geminiApiKey: string
  defaultProvider: 'claude' | 'gemini'
  toneGuide: string
  linkedDocs: string
}

interface TestState {
  claude: 'idle' | 'testing' | 'ok' | 'fail'
  gemini: 'idle' | 'testing' | 'ok' | 'fail'
}

interface TestError {
  claude?: string
  gemini?: string
}

export default function SettingsPage(): JSX.Element {
  const [settings, setSettings] = useState<SettingsState>({
    claudeApiKey: '',
    geminiApiKey: '',
    defaultProvider: 'claude',
    toneGuide: '',
    linkedDocs: ''
  })

  const [testState, setTestState] = useState<TestState>({ claude: 'idle', gemini: 'idle' })
  const [testErrors, setTestErrors] = useState<TestError>({})
  const [savedFields, setSavedFields] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState<Set<string>>(new Set())
  const [initialLoad, setInitialLoad] = useState(true)

  const [showClaudeKey, setShowClaudeKey] = useState(false)
  const [showGeminiKey, setShowGeminiKey] = useState(false)

  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        const all = await window.electronAPI.settingsGetAll()
        const claudeKey = await window.electronAPI.settingsGet('claudeApiKey') as string | null
        const geminiKey = await window.electronAPI.settingsGet('geminiApiKey') as string | null

        setSettings({
          claudeApiKey: claudeKey || '',
          geminiApiKey: geminiKey || '',
          defaultProvider: (all.defaultProvider as 'claude' | 'gemini') || 'claude',
          toneGuide: (all.toneGuide as string) || '',
          linkedDocs: (all.linkedDocs as string) || ''
        })
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

  const handleTestConnection = useCallback(async (provider: 'claude' | 'gemini'): Promise<void> => {
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

    // Reset after delay
    setTimeout(() => {
      setTestState(prev => ({ ...prev, [provider]: 'idle' }))
    }, 5000)
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
                      <span className="text-xs text-slate-500">Anthropic · claude-sonnet-4-6</span>
                    </div>

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

                    {testState.claude === 'fail' && testErrors.claude && (
                      <p className="text-xs text-red-400 mt-1">{testErrors.claude}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-3">
                  <button
                    onClick={() => saveField('claudeApiKey', settings.claudeApiKey)}
                    disabled={saving.has('claudeApiKey')}
                    className="btn btn-secondary btn-sm"
                  >
                    {saving.has('claudeApiKey') ? 'Saving...' : 'Save Key'}
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
                      <span className="text-xs text-slate-500">Google · gemini-1.5-pro</span>
                    </div>

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

                    {testState.gemini === 'fail' && testErrors.gemini && (
                      <p className="text-xs text-red-400 mt-1">{testErrors.gemini}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-3">
                  <button
                    onClick={() => saveField('geminiApiKey', settings.geminiApiKey)}
                    disabled={saving.has('geminiApiKey')}
                    className="btn btn-secondary btn-sm"
                  >
                    {saving.has('geminiApiKey') ? 'Saving...' : 'Save Key'}
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
            </div>
          </section>

          {/* Default Provider */}
          <section>
            <h2 className="text-base font-semibold text-slate-100 mb-1">Default Provider</h2>
            <p className="text-xs text-slate-500 mb-4">
              The default LLM provider used when creating new runs.
            </p>

            <div className="grid grid-cols-2 gap-3">
              {(['claude', 'gemini'] as const).map(provider => (
                <button
                  key={provider}
                  type="button"
                  onClick={() => {
                    setSettings(prev => ({ ...prev, defaultProvider: provider }))
                    saveField('defaultProvider', provider)
                  }}
                  className={`
                    p-3 rounded-xl border-2 text-left transition-all
                    ${settings.defaultProvider === provider
                      ? provider === 'claude' ? 'border-orange-600/70 bg-orange-900/10' : 'border-blue-600/70 bg-blue-900/10'
                      : 'border-slate-800 bg-slate-900 hover:border-slate-700'
                    }
                  `}
                >
                  <div className="flex items-center justify-between">
                    <span className={provider === 'claude' ? 'badge-claude' : 'badge-gemini'}>
                      {provider === 'claude' ? 'Claude' : 'Gemini'}
                    </span>
                    {settings.defaultProvider === provider && (
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={provider === 'claude' ? 'text-orange-400' : 'text-blue-400'}>
                        <path d="M2 7l3.5 3.5L12 3" />
                      </svg>
                    )}
                  </div>
                </button>
              ))}
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
                <span className="text-slate-300">Simulated (v1.0)</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Claude model</span>
                <span className="text-slate-300 font-mono text-xs">claude-sonnet-4-6</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Gemini model</span>
                <span className="text-slate-300 font-mono text-xs">gemini-1.5-pro</span>
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
