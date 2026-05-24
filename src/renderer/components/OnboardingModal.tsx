import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'

type Step = 'welcome' | 'provider' | 'configure'
type ProviderId = 'claude' | 'gemini' | 'copilot'

interface FeaturedProvider {
  id: ProviderId
  label: string
  tagline: string
  detail: string
  color: string
}

const FEATURED: FeaturedProvider[] = [
  {
    id: 'claude',
    label: 'Claude',
    tagline: 'Best overall quality',
    detail: 'Anthropic API key required. Excellent at navigation and documentation.',
    color: 'border-orange-600/60 bg-orange-900/10 hover:border-orange-500/80'
  },
  {
    id: 'gemini',
    label: 'Gemini',
    tagline: 'Free tier available',
    detail: 'Google AI Studio key required. Generous free quota for getting started.',
    color: 'border-blue-600/60 bg-blue-900/10 hover:border-blue-500/80'
  },
  {
    id: 'copilot',
    label: 'GitHub Copilot',
    tagline: 'No extra signup needed',
    detail: 'Uses your existing GitHub Copilot subscription. Authorize via your browser.',
    color: 'border-sky-600/60 bg-sky-900/10 hover:border-sky-500/80'
  }
]

const API_KEY_LINKS: Record<ProviderId, string> = {
  claude: 'https://console.anthropic.com/settings/keys',
  gemini: 'https://aistudio.google.com/apikey',
  copilot: ''
}

const LABEL: Record<ProviderId, string> = {
  claude: 'Anthropic API Key',
  gemini: 'Google AI Studio Key',
  copilot: ''
}

interface Props {
  onComplete: () => void
}

export default function OnboardingModal({ onComplete }: Props): JSX.Element {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('welcome')
  const [selectedProvider, setSelectedProvider] = useState<ProviderId | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testError, setTestError] = useState('')
  const [deviceFlowState, setDeviceFlowState] = useState<{
    userCode: string; verificationUri: string; deviceCode: string; interval: number
  } | null>(null)
  const [copilotPolling, setCopilotPolling] = useState(false)

  const markComplete = async () => {
    await window.electronAPI.settingsSet('onboardingComplete', true)
    onComplete()
  }

  const handleStartCopilotFlow = async () => {
    setTesting(true)
    setTestError('')
    try {
      const result = await window.electronAPI.copilotStartDeviceFlow()
      if (!result.success) {
        setTestError(result.error ?? 'Failed to start device flow. Make sure GITHUB_COPILOT_CLIENT_ID is configured.')
      } else {
        setDeviceFlowState({
          userCode: result.userCode,
          verificationUri: result.verificationUri,
          deviceCode: result.deviceCode,
          interval: result.interval
        })
      }
    } catch (err) {
      setTestError(err instanceof Error ? err.message : String(err))
    } finally {
      setTesting(false)
    }
  }

  const handleCopilotPoll = async () => {
    if (!deviceFlowState) return
    setCopilotPolling(true)
    setTestError('')
    try {
      const result = await window.electronAPI.copilotPoll(deviceFlowState.deviceCode, deviceFlowState.interval)
      if (result.success) {
        await markComplete()
      } else {
        setTestError(result.error ?? 'Authorization not yet confirmed. Try again in a moment.')
      }
    } catch (err) {
      setTestError(err instanceof Error ? err.message : String(err))
    } finally {
      setCopilotPolling(false)
    }
  }

  const handleSaveAndTest = async () => {
    if (!selectedProvider || !apiKey.trim()) return
    setTesting(true)
    setTestError('')

    const keyField = selectedProvider === 'claude' ? 'claudeApiKey' : 'geminiApiKey'
    try {
      await window.electronAPI.settingsSet(keyField, apiKey.trim())
      await window.electronAPI.settingsSet('defaultProvider', selectedProvider)

      const result = await window.electronAPI.llmTestConnection(selectedProvider)
      if (result.success) {
        await markComplete()
      } else {
        setTestError(result.error ?? 'Connection test failed. Check your API key and try again.')
      }
    } catch (err) {
      setTestError(err instanceof Error ? err.message : String(err))
    } finally {
      setTesting(false)
    }
  }

  const handleSkip = async () => {
    await markComplete()
    navigate('/settings')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
      <div className="w-full max-w-lg mx-4 bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden">

        {/* Progress dots */}
        <div className="flex justify-center gap-1.5 pt-5 pb-1">
          {(['welcome', 'provider', 'configure'] as Step[]).map((s, i) => (
            <div key={s} className={`h-1.5 rounded-full transition-all ${
              step === s ? 'w-6 bg-brand-500' :
              i < (['welcome', 'provider', 'configure'] as Step[]).indexOf(step) ? 'w-1.5 bg-brand-700' :
              'w-1.5 bg-slate-700'
            }`} />
          ))}
        </div>

        <div className="p-8">

          {/* ── Welcome ── */}
          {step === 'welcome' && (
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500 to-violet-500 flex items-center justify-center mx-auto mb-5">
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                  <path d="M8 16C8 11.582 11.582 8 16 8C18.071 8 19.95 8.804 21.372 10.121" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
                  <path d="M16 16L21 11" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
                  <circle cx="16" cy="16" r="2.5" fill="white" />
                  <path d="M16 20V25" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
                  <path d="M12 23H20" stroke="white" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-slate-100 mb-3">Welcome to GuidanceStudio</h1>
              <p className="text-slate-400 text-sm leading-relaxed mb-2">
                GuidanceStudio uses an AI agent to automatically navigate your web app, capture screenshots, and write step-by-step user guides — in minutes, not hours.
              </p>
              <p className="text-slate-500 text-sm mb-8">
                To get started, you'll need to connect an AI provider.
              </p>
              <button
                onClick={() => setStep('provider')}
                className="btn btn-primary w-full justify-center"
              >
                Get started
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M3 7h8M8 4l3 3-3 3" />
                </svg>
              </button>
              <button onClick={handleSkip} className="mt-3 text-xs text-slate-600 hover:text-slate-400 transition-colors w-full">
                I'll configure this in Settings
              </button>
            </div>
          )}

          {/* ── Provider Selection ── */}
          {step === 'provider' && (
            <div>
              <h2 className="text-lg font-semibold text-slate-100 mb-1">Choose an AI provider</h2>
              <p className="text-sm text-slate-500 mb-5">Pick one to connect now — you can add others later in Settings.</p>
              <div className="space-y-3 mb-6">
                {FEATURED.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedProvider(p.id)}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                      selectedProvider === p.id
                        ? p.color.replace('hover:', '') + ' ring-1 ring-white/10'
                        : `border-slate-700/60 bg-slate-800/30 ${p.color.includes('hover:') ? p.color : ''} hover:border-slate-600`
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-medium text-slate-200 text-sm">{p.label}</div>
                        <div className="text-xs text-slate-400 mt-0.5">{p.tagline}</div>
                      </div>
                      {selectedProvider === p.id && (
                        <div className="w-4 h-4 rounded-full bg-brand-500 flex items-center justify-center shrink-0 mt-0.5">
                          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round">
                            <path d="M1 4l2 2 4-4" />
                          </svg>
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-2">{p.detail}</p>
                  </button>
                ))}
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep('welcome')} className="btn btn-ghost flex-1 justify-center">Back</button>
                <button
                  onClick={() => setStep('configure')}
                  disabled={!selectedProvider}
                  className="btn btn-primary flex-1 justify-center"
                >
                  Continue
                </button>
              </div>
              <button onClick={handleSkip} className="mt-3 text-xs text-slate-600 hover:text-slate-400 transition-colors w-full text-center">
                Skip and configure manually
              </button>
            </div>
          )}

          {/* ── Configure ── */}
          {step === 'configure' && selectedProvider && (
            <div>
              <h2 className="text-lg font-semibold text-slate-100 mb-1">
                Connect {FEATURED.find(p => p.id === selectedProvider)?.label}
              </h2>

              {selectedProvider === 'copilot' ? (
                <div>
                  <p className="text-sm text-slate-400 mb-5">
                    Authorize GuidanceStudio via your GitHub account. This uses your existing Copilot subscription.
                  </p>
                  {!deviceFlowState ? (
                    <button
                      onClick={handleStartCopilotFlow}
                      disabled={testing}
                      className="btn btn-primary w-full justify-center mb-4"
                    >
                      {testing ? (
                        <>
                          <svg className="animate-spin" width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.5" /><path d="M7 1.5a5.5 5.5 0 015.5 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                          Starting…
                        </>
                      ) : 'Authorize with GitHub'}
                    </button>
                  ) : (
                    <div className="space-y-4 mb-4">
                      <div className="p-4 rounded-xl bg-slate-800 border border-slate-700">
                        <p className="text-xs text-slate-400 mb-2">Visit this URL and enter the code:</p>
                        <button
                          onClick={() => window.electronAPI.openExternal(deviceFlowState.verificationUri)}
                          className="text-brand-400 hover:text-brand-300 text-sm font-mono underline decoration-dotted"
                        >
                          {deviceFlowState.verificationUri}
                        </button>
                        <div className="mt-3 flex items-center gap-2">
                          <span className="text-xs text-slate-500">Your code:</span>
                          <code className="text-lg font-mono font-bold tracking-[0.2em] text-slate-100">{deviceFlowState.userCode}</code>
                        </div>
                      </div>
                      <button
                        onClick={handleCopilotPoll}
                        disabled={copilotPolling}
                        className="btn btn-primary w-full justify-center"
                      >
                        {copilotPolling ? (
                          <>
                            <svg className="animate-spin" width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.5" /><path d="M7 1.5a5.5 5.5 0 015.5 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                            Checking…
                          </>
                        ) : 'I\'ve authorized — continue'}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <p className="text-sm text-slate-400 mb-5">
                    Paste your API key below.{' '}
                    <button
                      onClick={() => window.electronAPI.openExternal(API_KEY_LINKS[selectedProvider])}
                      className="text-brand-400 hover:text-brand-300 underline decoration-dotted"
                    >
                      Get one here →
                    </button>
                  </p>
                  <div className="mb-4">
                    <label className="label">{LABEL[selectedProvider]}</label>
                    <div className="relative">
                      <input
                        type={showKey ? 'text' : 'password'}
                        value={apiKey}
                        onChange={e => setApiKey(e.target.value)}
                        placeholder="sk-..."
                        className="input pr-10"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                      >
                        {showKey ? (
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M1 7s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4z" /><circle cx="7" cy="7" r="1.5" /><path d="M1 1l12 12" /></svg>
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M1 7s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4z" /><circle cx="7" cy="7" r="1.5" /></svg>
                        )}
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={handleSaveAndTest}
                    disabled={!apiKey.trim() || testing}
                    className="btn btn-primary w-full justify-center mb-3"
                  >
                    {testing ? (
                      <>
                        <svg className="animate-spin" width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.5" /><path d="M7 1.5a5.5 5.5 0 015.5 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                        Testing connection…
                      </>
                    ) : 'Save & test connection'}
                  </button>
                </div>
              )}

              {testError && (
                <div className="p-3 rounded-lg bg-red-900/20 border border-red-700/40 text-xs text-red-300 mb-3">
                  {testError}
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={() => { setStep('provider'); setTestError(''); setApiKey(''); setDeviceFlowState(null) }} className="btn btn-ghost flex-1 justify-center text-sm">
                  Back
                </button>
                <button onClick={handleSkip} className="btn btn-ghost flex-1 justify-center text-sm text-slate-500">
                  Skip for now
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
