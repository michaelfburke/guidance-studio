import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import type { AppSettings, RunMeta } from '../types'
import { providerMeta, type ProviderId } from '../providers'

function hostOf(url: string): string {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`)
      .hostname.replace(/^www\./, '')
      .toLowerCase()
  } catch {
    return ''
  }
}

function generateRunId(): string {
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 8)
  return `run-${ts}-${rand}`
}

interface FormState {
  mode: 'agent' | 'assisted'
  productName: string
  url: string
  feature: string
  goal: string
}

export default function NewRunPage(): JSX.Element {
  const navigate = useNavigate()
  const location = useLocation()
  const prefill = (location.state as { prefill?: Partial<FormState> } | null)?.prefill

  const [form, setForm] = useState<FormState>(() => ({
    mode: prefill?.mode ?? 'agent',
    productName: prefill?.productName ?? '',
    url: prefill?.url ?? '',
    feature: prefill?.feature ?? '',
    goal: prefill?.goal ?? '',
  }))
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})
  const [settings, setSettings] = useState<Partial<AppSettings>>({})
  const [savedDomains, setSavedDomains] = useState<string[]>([])
  const [recentProducts, setRecentProducts] = useState<Array<{ productName: string; url: string; domain: string }>>([])

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [requiresOverride, setRequiresOverride] = useState(false)
  const [errorBanner, setErrorBanner] = useState<string | null>(null)
  const overrideGrantedRef = useRef(false)
  const formRef = useRef<HTMLFormElement>(null)
  // If prefill included a productName, treat it as user-set so URL changes don't override it
  const productNameEditedRef = useRef(!!prefill?.productName)

  const showError = useCallback((msg: string) => {
    setErrorBanner(msg)
    setTimeout(() => setErrorBanner(null), 8000)
  }, [])

  useEffect(() => {
    window.electronAPI.settingsGetAll().then(s => {
      setSettings(s)
    }).catch(console.error)

    window.electronAPI.credentialsList()
      .then(list => setSavedDomains(list.map(c => c.domain)))
      .catch(console.error)

    // Build recent-products list from run history for productName auto-fill.
    // Already sorted newest-first, so first match per domain wins.
    window.electronAPI.runList()
      .then((allRuns: RunMeta[]) => {
        const seen = new Set<string>()
        const products: Array<{ productName: string; url: string; domain: string }> = []
        for (const run of allRuns) {
          if (!run.url || !run.productName) continue
          const domain = hostOf(run.url)
          if (!domain || seen.has(domain)) continue
          seen.add(domain)
          products.push({ productName: run.productName, url: run.url, domain })
        }
        setRecentProducts(products)

        // When exactly one product has been used before, pre-fill the form
        // with it so the user needn't pick it from the dropdown.
        if (products.length === 1 && !prefill) {
          const only = products[0]
          setForm(prev => ({
            ...prev,
            productName: prev.productName || only.productName,
            url: prev.url || only.url
          }))
        }
      })
      .catch(console.error)
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

    const provider = (settings.defaultProvider ?? 'claude') as ProviderId

    if (!providerReady(provider) && form.mode === 'agent') {
      if (!overrideGrantedRef.current) {
        setRequiresOverride(true)
        return
      }
      overrideGrantedRef.current = false
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
          provider
        })
        navigate(`/runs/${runId}`)
      } catch (err) {
        showError(`Failed to start agent: ${err instanceof Error ? err.message : String(err)}`)
        setIsSubmitting(false)
      }
    } else {
      // Assisted mode - save meta and navigate
      try {
        await window.electronAPI.runSave({
          id: runId,
          mode: 'assisted',
          provider,
          productName: form.productName.trim(),
          feature: form.feature.trim(),
          goal: form.goal.trim(),
          status: 'running',
          createdAt: new Date().toISOString(),
          stepCount: 0
        })
        navigate(`/runs/${runId}`)
      } catch (err) {
        showError(`Failed to create run: ${err instanceof Error ? err.message : String(err)}`)
        setIsSubmitting(false)
      }
    }
  }

  const update = (key: keyof FormState, value: string): void => {
    setForm(prev => ({ ...prev, [key]: value }))
    if (errors[key]) setErrors(prev => ({ ...prev, [key]: undefined }))
    if (key === 'mode') setRequiresOverride(false)
    if (key === 'productName') productNameEditedRef.current = true
  }

  const handleUrlChange = (value: string): void => {
    update('url', value)
    // Auto-fill productName from run history when the field hasn't been manually edited
    if (!productNameEditedRef.current) {
      const domain = hostOf(value)
      if (domain) {
        const match = recentProducts.find(p => domain === p.domain || domain.endsWith(`.${p.domain}`))
        if (match) {
          setForm(prev => ({ ...prev, url: value, productName: match.productName }))
        }
      }
    }
  }

  // OpenAI-compatible endpoints work with a local proxy and built-in defaults,
  // so they need no API key — only Claude and Gemini gate on a stored key.
  const providerReady = (p: ProviderId): boolean => {
    if (p === 'claude') return !!settings.claudeApiKeySet
    if (p === 'gemini') return !!settings.geminiApiKeySet
    return true
  }

  const activeProvider = (settings.defaultProvider ?? 'claude') as ProviderId
  const providerWarning = form.mode === 'agent' && !providerReady(activeProvider)

  // Saved login credentials matching the entered URL, if any.
  const credentialMatch = (() => {
    if (form.mode !== 'agent') return null
    const h = hostOf(form.url)
    if (!h) return null
    return savedDomains.find(d => h === d || h.endsWith(`.${d}`)) ?? null
  })()

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-800/60">
        <h1 className="text-xl font-bold text-slate-100">New Run</h1>
        <p className="text-sm text-slate-500 mt-0.5">Configure and start a documentation run</p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        {errorBanner && (
          <div className="max-w-2xl mx-auto mb-4 px-4 py-2.5 bg-red-900/30 border border-red-700/50 rounded-lg flex items-center justify-between gap-3 text-sm text-red-300">
            <div className="flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="shrink-0">
                <circle cx="7" cy="7" r="5.5" />
                <path d="M7 4.5v3M7 9h.01" />
              </svg>
              {errorBanner}
            </div>
            <button
              type="button"
              onClick={() => setErrorBanner(null)}
              className="text-red-400 hover:text-red-200 shrink-0"
              aria-label="Dismiss"
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M3 3l7 7M10 3l-7 7" />
              </svg>
            </button>
          </div>
        )}

        <form ref={formRef} onSubmit={handleSubmit} className="max-w-2xl mx-auto space-y-6">

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

          {/* Active provider (read-only — configured in Settings) */}
          <div>
            <div className="label">LLM Provider</div>
            <div className="flex items-center justify-between px-3 py-2.5 rounded-xl border border-slate-800 bg-slate-900">
              <div className="flex items-center gap-2.5">
                <span className={providerMeta(activeProvider).badgeClass}>
                  {providerMeta(activeProvider).label}
                </span>
                <div className="flex items-center gap-1.5">
                  <div className={`w-1.5 h-1.5 rounded-full ${providerReady(activeProvider) ? 'bg-green-400' : 'bg-slate-600'}`} />
                  <span className={`text-xs ${providerReady(activeProvider) ? 'text-green-400' : 'text-slate-500'}`}>
                    {providerReady(activeProvider) ? 'API key configured' : 'No API key'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => navigate('/settings')}
                className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                Change in Settings →
              </button>
            </div>

            {providerWarning && (
              <div className={`mt-2 px-3 py-2 border rounded-lg text-xs flex flex-col gap-2 ${
                requiresOverride
                  ? 'bg-amber-900/30 border-amber-700/60'
                  : 'bg-amber-900/20 border-amber-800/50'
              }`}>
                <div className="flex items-center gap-2 text-amber-300">
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="shrink-0">
                    <path d="M6.5 1.5L1 11h11L6.5 1.5z" />
                    <path d="M6.5 5v3M6.5 9.5h.01" />
                  </svg>
                  No API key for {providerMeta(activeProvider).label}.
                  {!requiresOverride && (
                    <button
                      type="button"
                      onClick={() => navigate('/settings')}
                      className="underline hover:text-amber-200 ml-1"
                    >
                      Configure in Settings
                    </button>
                  )}
                </div>
                {requiresOverride && (
                  <div className="flex items-center gap-2 text-amber-400 flex-wrap">
                    <span className="font-medium">The agent requires an API key to generate content.</span>
                    <button
                      type="button"
                      onClick={() => navigate('/settings')}
                      className="underline text-amber-300 hover:text-amber-200"
                    >
                      Configure in Settings
                    </button>
                    <span className="text-amber-600">or</span>
                    <button
                      type="button"
                      onClick={() => {
                        overrideGrantedRef.current = true
                        setRequiresOverride(false)
                        formRef.current?.requestSubmit()
                      }}
                      className="underline text-amber-300 hover:text-amber-200"
                    >
                      Continue anyway
                    </button>
                  </div>
                )}
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
              list="gs-recent-product-names"
              autoComplete="off"
            />
            {recentProducts.length > 0 && (
              <datalist id="gs-recent-product-names">
                {recentProducts.map(p => (
                  <option key={p.domain} value={p.productName} />
                ))}
              </datalist>
            )}
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
                onChange={e => handleUrlChange(e.target.value)}
                placeholder="https://app.example.com"
                list="gs-saved-sites"
                className={`input ${errors.url ? 'input-error' : ''}`}
              />
              {savedDomains.length > 0 && (
                <datalist id="gs-saved-sites">
                  {savedDomains.map(d => (
                    <option key={d} value={`https://${d}`} />
                  ))}
                </datalist>
              )}
              {errors.url && (
                <p className="text-xs text-red-400 mt-1">{errors.url}</p>
              )}
              {!errors.url && credentialMatch && (
                <p className="text-xs text-green-400 mt-1 flex items-center gap-1">
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 5.5l2.5 2.5L9 3" />
                  </svg>
                  Login credentials saved for {credentialMatch} — the agent will sign in automatically.
                </p>
              )}
              {!errors.url && !credentialMatch && savedDomains.length > 0 && (
                <p className="text-xs text-slate-600 mt-1">
                  Pick a saved site, or manage logins in Settings.
                </p>
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
