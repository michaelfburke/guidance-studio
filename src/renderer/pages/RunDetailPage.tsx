import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import type { RunMeta, RunStep, AgentEvent, RunData } from '../types'
import { providerMeta } from '../providers'
import ActivityLog from '../components/ActivityLog'
import StepCard from '../components/StepCard'
import DocEditor from '../components/DocEditor'
import ScreenRecorder from '../components/ScreenRecorder'

type Tab = 'run' | 'docs'

export default function RunDetailPage(): JSX.Element {
  const { runId } = useParams<{ runId: string }>()
  const navigate = useNavigate()

  const [run, setRun] = useState<RunData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('run')

  // Agent state
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [liveSteps, setLiveSteps] = useState<RunStep[]>([])
  const [isRunning, setIsRunning] = useState(false)

  // Assisted state
  const [assistedSteps, setAssistedSteps] = useState<RunStep[]>([])

  // Doc editor state
  const [docMarkdown, setDocMarkdown] = useState('')
  const [savedDocMarkdown, setSavedDocMarkdown] = useState('')
  const [isGeneratingDocs, setIsGeneratingDocs] = useState(false)

  // Inline error banner
  const [errorBanner, setErrorBanner] = useState<string | null>(null)
  const showError = useCallback((msg: string) => {
    setErrorBanner(msg)
    setTimeout(() => setErrorBanner(null), 30000)
  }, [])

  const unsubEventRef = useRef<(() => void) | null>(null)
  const unsubStepRef = useRef<(() => void) | null>(null)

  const loadRun = useCallback(async () => {
    if (!runId) return
    setLoading(true)
    try {
      const data = await window.electronAPI.runGet(runId)
      if (!data) {
        navigate('/runs')
        return
      }
      setRun(data)
      setLiveSteps(data.steps || [])
      setAssistedSteps(data.steps || [])
      setEvents(data.events || [])
      setDocMarkdown(data.outputMd || '')
      setSavedDocMarkdown(data.outputMd || '')
      setIsRunning(data.meta.status === 'running')
    } catch (err) {
      console.error('Failed to load run:', err)
    } finally {
      setLoading(false)
    }
  }, [runId, navigate])

  // Subscribe to agent events
  useEffect(() => {
    if (!runId) return

    const unsubEvent = window.electronAPI.onAgentEvent((event) => {
      if (event.runId !== runId) return
      setEvents(prev => [...prev, event])

      if (event.type === 'complete') {
        setIsRunning(false)
        // Reload to get final state
        setTimeout(() => loadRun(), 500)
      }
      // Only a fatal error ends the run — transient action failures the agent
      // recovers from must not hide the Stop button mid-run.
      if (event.type === 'error' && event.fatal) {
        setIsRunning(false)
        // Reload to pick up the persisted final status (failed/stopped).
        setTimeout(() => loadRun(), 500)
      }
    })

    const unsubStep = window.electronAPI.onAgentStep((step) => {
      setLiveSteps(prev => {
        const existing = prev.findIndex(s => s.index === step.index)
        if (existing >= 0) {
          const updated = [...prev]
          updated[existing] = step
          return updated
        }
        return [...prev, step].sort((a, b) => a.index - b.index)
      })
    })

    unsubEventRef.current = unsubEvent
    unsubStepRef.current = unsubStep

    return () => {
      unsubEvent()
      unsubStep()
    }
  }, [runId, loadRun])

  useEffect(() => {
    loadRun()
  }, [loadRun])

  const handleStopAgent = useCallback(async () => {
    if (!runId) return
    await window.electronAPI.agentStop(runId)
    setIsRunning(false)
  }, [runId])

  // Open the New Run form pre-filled with this run's settings, so it can be
  // tweaked and run again as a fresh run (the original is left intact).
  const handleRerun = useCallback(() => {
    if (!run) return
    navigate('/runs/new', {
      state: {
        prefill: {
          mode: run.meta.mode,
          productName: run.meta.productName,
          url: run.meta.url ?? '',
          feature: run.meta.feature,
          goal: run.meta.goal
        }
      }
    })
  }, [run, navigate])

  // Include / exclude a step from the generated guidance.
  const handleToggleExclude = useCallback(async (index: number): Promise<void> => {
    const isAgent = run?.meta.mode === 'agent'
    const current = isAgent ? liveSteps : assistedSteps
    const updated = current.map(s =>
      s.index === index ? { ...s, excluded: !s.excluded } : s
    )
    if (isAgent) {
      setLiveSteps(updated)
    } else {
      setAssistedSteps(updated)
    }
    if (runId) await window.electronAPI.runSaveSteps(runId, updated)
  }, [liveSteps, assistedSteps, runId, run])

  const handleGenerateDocs = useCallback(async () => {
    if (!runId || !run) return
    setIsGeneratingDocs(true)

    // Only included steps go into the guidance; renumber so they read 1, 2, 3…
    const steps = (run.meta.mode === 'agent' ? liveSteps : assistedSteps)
      .filter(s => !s.excluded)
      .map((s, i) => ({ ...s, index: i }))

    try {
      const settings = await window.electronAPI.settingsGetAll()

      const result = await window.electronAPI.llmGenerateDocs({
        runId,
        productName: run.meta.productName,
        feature: run.meta.feature,
        goal: run.meta.goal,
        steps,
        provider: run.meta.provider,
        toneGuide: settings.toneGuide as string | undefined,
        linkedDocs: settings.linkedDocs as string | undefined
      })

      if (result.success) {
        setDocMarkdown(result.markdown)
        setSavedDocMarkdown(result.markdown)
        setActiveTab('docs')

        // Update meta
        const updatedMeta: RunMeta = {
          ...run.meta,
          status: 'completed'
        }
        setRun(prev => prev ? { ...prev, meta: updatedMeta } : null)
      }
    } catch (err) {
      showError(`Failed to generate docs: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setIsGeneratingDocs(false)
    }
  }, [runId, run, liveSteps, assistedSteps])

  const handleSaveDocs = useCallback(async () => {
    if (!runId) return
    await window.electronAPI.runSaveOutput(runId, docMarkdown)
    setSavedDocMarkdown(docMarkdown)
  }, [runId, docMarkdown])

  // Assisted mode handlers
  const handleStepAdded = useCallback(async (step: RunStep) => {
    const updated = [...assistedSteps, step]
    setAssistedSteps(updated)

    if (runId) {
      await window.electronAPI.runSaveSteps(runId, updated)
      // Update meta step count
      if (run) {
        const updatedMeta: RunMeta = { ...run.meta, stepCount: updated.length }
        await window.electronAPI.runSave(updatedMeta)
        setRun(prev => prev ? { ...prev, meta: updatedMeta } : null)
      }
    }
  }, [assistedSteps, runId, run])

  const handleStepRemoved = useCallback(async (index: number) => {
    const updated = assistedSteps
      .filter(s => s.index !== index)
      .map((s, i) => ({ ...s, index: i }))
    setAssistedSteps(updated)

    if (runId) {
      await window.electronAPI.runSaveSteps(runId, updated)
    }
  }, [assistedSteps, runId])

  const handleFinishAssisted = useCallback(async () => {
    if (!runId || !run) return
    const updatedMeta: RunMeta = {
      ...run.meta,
      status: 'completed',
      stepCount: assistedSteps.length
    }
    await window.electronAPI.runSave(updatedMeta)
    setRun(prev => prev ? { ...prev, meta: updatedMeta } : null)
    setActiveTab('docs')
  }, [runId, run, assistedSteps])

  const handleStepEdited = useCallback(async (step: RunStep) => {
    const updated = assistedSteps.map(s => s.index === step.index ? step : s)
    setAssistedSteps(updated)
    if (runId) await window.electronAPI.runSaveSteps(runId, updated)
  }, [assistedSteps, runId])

  const handleContinueRecording = useCallback(async () => {
    if (!runId || !run) return
    const updatedMeta: RunMeta = { ...run.meta, status: 'running' }
    await window.electronAPI.runSave(updatedMeta)
    setRun(prev => prev ? { ...prev, meta: updatedMeta } : null)
    setActiveTab('run')
  }, [runId, run])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full gap-3 text-slate-500">
        <svg className="animate-spin" width="20" height="20" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="8" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
          <path d="M10 2a8 8 0 018 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        Loading run...
      </div>
    )
  }

  if (!run) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-500">
        <div className="text-lg font-medium">Run not found</div>
        <button onClick={() => navigate('/runs')} className="btn btn-secondary btn-sm">
          Back to Runs
        </button>
      </div>
    )
  }

  const { meta } = run
  const currentSteps = meta.mode === 'agent' ? liveSteps : assistedSteps
  const includedSteps = currentSteps.filter(s => !s.excluded)
  const isDocDirty = docMarkdown !== savedDocMarkdown

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Inline error banner */}
      {errorBanner && (
        <div className="mx-6 mt-3 px-4 py-2.5 bg-red-900/30 border border-red-700/50 rounded-lg flex items-center justify-between gap-3 text-sm text-red-300">
          <div className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="shrink-0">
              <circle cx="7" cy="7" r="5.5" />
              <path d="M7 4.5v3M7 9h.01" />
            </svg>
            {errorBanner}
          </div>
          <button
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

      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-800/60 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <button
            onClick={() => navigate('/runs')}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors mt-0.5 shrink-0"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 3L5 8l5 5" />
            </svg>
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={meta.mode === 'agent' ? 'badge-agent' : 'badge-assisted'}>
                {meta.mode === 'agent' ? 'Agent' : 'Assisted'}
              </span>
              <span className={providerMeta(meta.provider).badgeClass}>
                {providerMeta(meta.provider).label}
              </span>
              <span className={
                meta.status === 'running' ? 'status-running' :
                meta.status === 'completed' ? 'status-completed' :
                meta.status === 'failed' ? 'status-failed' :
                'status-stopped'
              }>
                {meta.status === 'running' && (
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500" />
                  </span>
                )}
                {meta.status.charAt(0).toUpperCase() + meta.status.slice(1)}
              </span>
            </div>
            <h1 className="text-base font-semibold text-slate-100 truncate">
              {meta.feature || 'Untitled Feature'}
            </h1>
            {meta.productName && (
              <p className="text-xs text-slate-500 mt-0.5">{meta.productName} · {meta.goal}</p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {isRunning && meta.mode === 'agent' && (
            <button
              onClick={handleStopAgent}
              className="btn btn-danger btn-sm"
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="currentColor">
                <rect x="2.5" y="2.5" width="8" height="8" rx="1" />
              </svg>
              Stop
            </button>
          )}

          {meta.mode === 'assisted' && meta.status === 'running' && (
            <button
              onClick={handleFinishAssisted}
              className="btn btn-secondary btn-sm"
              disabled={assistedSteps.length === 0}
            >
              Finish Recording
            </button>
          )}

          {meta.mode === 'assisted' && meta.status === 'completed' && (
            <button
              onClick={handleContinueRecording}
              className="btn btn-secondary btn-sm"
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="6.5" cy="6.5" r="5" fillOpacity="0.3" stroke="currentColor" strokeWidth="1.5" fill="none" />
                <circle cx="6.5" cy="6.5" r="2.5" fill="currentColor" stroke="none" />
              </svg>
              Continue Recording
            </button>
          )}

          {!isRunning && (
            <button
              onClick={handleRerun}
              className="btn btn-secondary btn-sm"
              title="Edit settings and run again as a new run"
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 6.5a4.5 4.5 0 11-1.3-3.2M11 1.5v3H8" />
              </svg>
              Re-run
            </button>
          )}

          <button
            onClick={handleGenerateDocs}
            disabled={isGeneratingDocs || includedSteps.length === 0 || isRunning}
            className="btn btn-primary btn-sm"
          >
            {isGeneratingDocs ? (
              <>
                <svg className="animate-spin" width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
                  <path d="M6.5 1.5a5 5 0 015 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                Generating...
              </>
            ) : (
              <>
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6.5 1.5L8 5l3.5.5-2.5 2.5.5 3.5L6.5 9.5 3 11.5l.5-3.5L1 5.5 4.5 5z" />
                </svg>
                Generate Docs
              </>
            )}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-6 pt-3 border-b border-slate-800">
        <button
          onClick={() => setActiveTab('run')}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors -mb-px ${
            activeTab === 'run'
              ? 'text-brand-300 border-b-2 border-brand-500'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          {meta.mode === 'agent' ? 'Agent View' : 'Recording'}
        </button>
        <button
          onClick={() => setActiveTab('docs')}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors -mb-px flex items-center gap-1.5 ${
            activeTab === 'docs'
              ? 'text-brand-300 border-b-2 border-brand-500'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          Documentation
          {docMarkdown && (
            <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
          )}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'run' && (
          <>
            {meta.mode === 'agent' ? (
              // Agent view: split layout
              <div className="flex h-full">
                {/* Activity log */}
                <div className="w-2/5 flex-shrink-0 border-r border-slate-800 overflow-hidden bg-slate-950">
                  <ActivityLog events={events} isRunning={isRunning} />
                </div>

                {/* Steps grid */}
                <div className="flex-1 overflow-y-auto p-4">
                  {liveSteps.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-600">
                      {isRunning ? (
                        <>
                          <div className="flex gap-1.5">
                            {[0, 150, 300].map(d => (
                              <div
                                key={d}
                                className="w-2 h-2 bg-brand-500 rounded-full animate-bounce"
                                style={{ animationDelay: `${d}ms` }}
                              />
                            ))}
                          </div>
                          <span>Discovering steps...</span>
                        </>
                      ) : (
                        <>
                          <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="5" y="7" width="30" height="26" rx="3" />
                            <path d="M5 14h30M13 7V5M27 7V5" />
                          </svg>
                          <span>No steps yet</span>
                        </>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-3 px-0.5">
                        <span className="text-xs text-slate-500">
                          {includedSteps.length} of {liveSteps.length} steps in guidance
                        </span>
                        <span className="text-xs text-slate-600">
                          Click a step to include / exclude it
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {liveSteps.map(step => (
                          <StepCard
                            key={step.index}
                            step={step}
                            onClick={() => handleToggleExclude(step.index)}
                            onToggleExclude={() => handleToggleExclude(step.index)}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            ) : (
              // Assisted mode
              <ScreenRecorder
                runId={runId!}
                steps={assistedSteps}
                onStepAdded={handleStepAdded}
                onStepRemoved={handleStepRemoved}
                onStepEdited={handleStepEdited}
                onStepToggleExclude={handleToggleExclude}
              />
            )}
          </>
        )}

        {activeTab === 'docs' && (
          <DocEditor
            markdown={docMarkdown}
            onChange={setDocMarkdown}
            onSave={handleSaveDocs}
            onGenerate={handleGenerateDocs}
            isGenerating={isGeneratingDocs}
            hasSteps={includedSteps.length > 0}
            isDocDirty={isDocDirty}
          />
        )}
      </div>
    </div>
  )
}
