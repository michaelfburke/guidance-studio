import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { AppSettings } from '../types'

function generateRunId(): string {
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 8)
  return `run-${ts}-${rand}`
}

interface FormState {
  mode: 'agent' | 'assisted'
  provider: 'claude' | 'gemini'
  productName: string
  url: string
  feature: string
  goal: string
}

export default function NewRunPage(): JSX.Element {
  const navigate = useNavigate()
  const [form, setForm] = useState<FormState>({
    mode: 'agent',
    provider: 'claude',
    productName: '',
    url: '',
    feature: '',
    goal: ''
  })
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})
  const [settings, setSettings] = useState<Partial<AppSettings>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    window.electronAPI.settingsGetAll().then(s => {
      setSettings(s)
      if (s.defaultProvider) {
        setForm(prev => ({ ...prev, provider: s.defaultProvider as 'claude' | 'gemini' }))
      }
    }).catch(console.error)
  }, [])

  const validate = (): boolean => {
    const errs: typeof errors = {}

    if (form.mode === 'agent') {
      if (!form.url.trim()) errs.url = 'URL is required for Agent mode'
      else if (!/^https?:\/\/.+/.test(form.url.trim())) errs.url = 'Please enter a valid URL'
    }

    if (!form.feature.trim()) errs.feature = 'Feature name is required'
    if (!form.goal.trim()) errs.goal = 'Goal description is required'

    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!validate()) return

    const apiKeySet = form.provider === 'claude'
      ? settings.claudeApiKeySet
      : settings.geminiApiKeySet

    if (!apiKeySet && form.mode === 'agent') {
      const confirmed = confirm(
        `No ${form.provider === 'claude' ? 'Claude' : 'Gemini'} API key configured. ` +
        'The agent requires an API key to generate content. ' +
        'Go to Settings to configure it, or continue anyway?'
      )
      if (!confirmed) {
        navigate('/settings')
        return
      }
    }

    setIsSubmitting(true)

    const runId = generateRunId()

    if (form.mode === 'agent') {
      try {
        await window.electronAPI.agentStart({
          runId,
          url: form.url.trim(),
          productName: form.productName.trim() || new URL(form.url.trim()).hostname,
          feature: form.feature.trim(),
          goal: form.goal.trim(),
          provider: form.provider
        })
        navigate(`/runs/${runId}`)
      } catch (err) {
        alert(`Failed to start agent: ${err instanceof Error ? err.message : String(err)}`)
        setIsSubmitting(false)
      }
    } else {
      // Assisted mode - save meta and navigate
      try {
        await window.electronAPI.runSave({
          id: runId,
          mode: 'assisted',
          provider: form.provider,
          productName: form.productName.trim(),
          feature: form.feature.trim(),
          goal: form.goal.trim(),
          status: 'running',
          createdAt: new Date().toISOString(),
          stepCount: 0
        })
        navigate(`/runs/${runId}`)
      } catch (err) {
        alert(`Failed to create run: ${err instanceof Error ? err.message : String(err)}`)
        setIsSubmitting(false)
      }
    }
  }

  const update = (key: keyof FormState, value: string): void => {
    setForm(prev => ({ ...prev, [key]: value }))
    if (errors[key]) setErrors(prev => ({ ...prev, [key]: undefined }))
  }

  const providerWarning = form.mode === 'agent' && (
    (form.provider === 'claude' && !settings.claudeApiKeySet) ||
    (form.provider === 'gemini' && !settings.geminiApiKeySet)
  )

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-800/60">
        <h1 className="text-xl font-bold text-slate-100">New Run</h1>
        <p className="text-sm text-slate-500 mt-0.5">Configure and start a documentation run</p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <form onSubmit={handleSubmit} className="max-w-2xl mx-auto space-y-6">

          {/* Mode selection */}
          <div>
            <div className="label">Mode</div>
            <div className="grid grid-cols-2 gap-3">
              {(['agent', 'assisted'] as const).map(mode => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => update('mode', mode)}
                  className={`
                    p-4 rounded-xl border-2 text-left transition-all duration-150
                    ${form.mode === mode
                      ? 'border-brand-600 bg-brand-900/20'
                      : 'border-slate-800 hover:border-slate-700 bg-slate-900'
                    }
                  `}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      mode === 'agent' ? 'bg-violet-900/60' : 'bg-emerald-900/60'
                    }`}>
                      {mode === 'agent' ? (
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-violet-300">
                          <circle cx="8" cy="8" r="6" />
                          <circle cx="8" cy="8" r="2" />
                          <path d="M8 2v1M8 13v1M2 8h1M13 8h1" />
                        </svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-300">
                          <circle cx="8" cy="5" r="2.5" />
                          <path d="M3 14c0-2.761 2.239-5 5-5s5 2.239 5 5" />
                        </svg>
                      )}
                    </div>
                    <div>
                      <div className="font-semibold text-sm text-slate-100 capitalize">{mode}</div>
                      <div className={`text-xs ${mode === 'agent' ? 'text-violet-400' : 'text-emerald-400'}`}>
                        {mode === 'agent' ? 'AI navigates automatically' : 'Human-guided recording'}
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500">
                    {mode === 'agent'
                      ? 'AI agent navigates a URL and generates documentation steps automatically.'
                      : 'You record your screen while manually capturing steps with screenshots.'
                    }
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Provider selection */}
          <div>
            <div className="label">LLM Provider</div>
            <div className="grid grid-cols-2 gap-3">
              {(['claude', 'gemini'] as const).map(provider => {
                const keySet = provider === 'claude' ? settings.claudeApiKeySet : settings.geminiApiKeySet
                return (
                  <button
                    key={provider}
                    type="button"
                    onClick={() => update('provider', provider)}
                    className={`
                      p-3 rounded-xl border-2 text-left transition-all duration-150
                      ${form.provider === provider
                        ? provider === 'claude' ? 'border-orange-600/70 bg-orange-900/10' : 'border-blue-600/70 bg-blue-900/10'
                        : 'border-slate-800 hover:border-slate-700 bg-slate-900'
                      }
                    `}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={provider === 'claude' ? 'badge-claude' : 'badge-gemini'}>
                          {provider === 'claude' ? 'Claude' : 'Gemini'}
                        </span>
                        <span className="text-xs text-slate-400">
                          {provider === 'claude' ? 'by Anthropic' : 'by Google'}
                        </span>
                      </div>
                      {form.provider === provider && (
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={provider === 'claude' ? 'text-orange-400' : 'text-blue-400'}>
                          <path d="M2 7l3.5 3.5L12 3" />
                        </svg>
                      )}
                    </div>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <div className={`w-1.5 h-1.5 rounded-full ${keySet ? 'bg-green-400' : 'bg-slate-600'}`} />
                      <span className={`text-xs ${keySet ? 'text-green-400' : 'text-slate-500'}`}>
                        {keySet ? 'API key configured' : 'No API key'}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>

            {providerWarning && (
              <div className="mt-2 px-3 py-2 bg-amber-900/20 border border-amber-800/50 rounded-lg text-xs text-amber-300 flex items-center gap-2">
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="shrink-0">
                  <path d="M6.5 1.5L1 11h11L6.5 1.5z" />
                  <path d="M6.5 5v3M6.5 9.5h.01" />
                </svg>
                No API key for {form.provider === 'claude' ? 'Claude' : 'Gemini'}.
                <button
                  type="button"
                  onClick={() => navigate('/settings')}
                  className="underline hover:text-amber-200 ml-1"
                >
                  Configure in Settings
                </button>
              </div>
            )}
          </div>

          {/* Product Name */}
          <div>
            <label className="label">Product Name</label>
            <input
              type="text"
              value={form.productName}
              onChange={e => update('productName', e.target.value)}
              placeholder="e.g., Acme Dashboard, Linear, Notion..."
              className="input"
            />
            <p className="text-xs text-slate-600 mt-1">
              {form.mode === 'agent' ? 'Will be inferred from URL if left blank' : 'Optional – used in generated docs'}
            </p>
          </div>

          {/* URL (agent mode only) */}
          {form.mode === 'agent' && (
            <div>
              <label className="label">
                Product URL <span className="text-red-400">*</span>
              </label>
              <input
                type="url"
                value={form.url}
                onChange={e => update('url', e.target.value)}
                placeholder="https://app.example.com"
                className={`input ${errors.url ? 'input-error' : ''}`}
              />
              {errors.url && (
                <p className="text-xs text-red-400 mt-1">{errors.url}</p>
              )}
            </div>
          )}

          {/* Feature */}
          <div>
            <label className="label">
              Feature <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={form.feature}
              onChange={e => update('feature', e.target.value)}
              placeholder="e.g., User Onboarding, Create Project, Export Reports..."
              className={`input ${errors.feature ? 'input-error' : ''}`}
            />
            {errors.feature && (
              <p className="text-xs text-red-400 mt-1">{errors.feature}</p>
            )}
          </div>

          {/* Goal */}
          <div>
            <label className="label">
              Goal / Description <span className="text-red-400">*</span>
            </label>
            <textarea
              value={form.goal}
              onChange={e => update('goal', e.target.value)}
              placeholder="Describe what you want to document. e.g., 'How to create and configure a new project from scratch'"
              className={`input resize-none ${errors.goal ? 'input-error' : ''}`}
              rows={3}
            />
            {errors.goal && (
              <p className="text-xs text-red-400 mt-1">{errors.goal}</p>
            )}
          </div>

          {/* Submit */}
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => navigate('/runs')}
              className="btn btn-ghost"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="btn btn-primary"
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin" width="15" height="15" viewBox="0 0 15 15" fill="none">
                    <circle cx="7.5" cy="7.5" r="6" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
                    <path d="M7.5 1.5a6 6 0 016 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  Starting...
                </>
              ) : (
                <>
                  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 3l7 4.5-7 4.5V3z" fill="currentColor" />
                  </svg>
                  {form.mode === 'agent' ? 'Start Agent Run' : 'Start Recording'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
