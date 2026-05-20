import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import type { RunMeta, RunStep, AgentEvent, RunData } from '../types'
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
  const [selectedStep, setSelectedStep] = useState<number | null>(null)
  const [isRunning, setIsRunning] = useState(false)

  // Assisted state
  const [assistedSteps, setAssistedSteps] = useState<RunStep[]>([])

  // Doc editor state
  const [docMarkdown, setDocMarkdown] = useState('')
  const [isGeneratingDocs, setIsGeneratingDocs] = useState(false)

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
      setDocMarkdown(data.outputMd || '')
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
      if (event.type === 'error') {
        setIsRunning(false)
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

  const handleGenerateDocs = useCallback(async () => {
    if (!runId || !run) return
    setIsGeneratingDocs(true)

    const steps = run.meta.mode === 'agent' ? liveSteps : assistedSteps

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
        setActiveTab('docs')

        // Update meta
        const updatedMeta: RunMeta = {
          ...run.meta,
          status: 'completed'
        }
        setRun(prev => prev ? { ...prev, meta: updatedMeta } : null)
      }
    } catch (err) {
      alert(`Failed to generate docs: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setIsGeneratingDocs(false)
    }
  }, [runId, run, liveSteps, assistedSteps])

  const handleSaveDocs = useCallback(async () => {
    if (!runId) return
    await window.electronAPI.runSaveOutput(runId, docMarkdown)
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

  return (
    <div className="flex flex-col h-full overflow-hidden">
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
              <span className={meta.provider === 'claude' ? 'badge-claude' : 'badge-gemini'}>
                {meta.provider === 'claude' ? 'Claude' : 'Gemini'}
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
          {isRunning && (
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

          <button
            onClick={handleGenerateDocs}
            disabled={isGeneratingDocs || currentSteps.length === 0 || isRunning}
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
                    <div className="grid grid-cols-2 gap-3">
                      {liveSteps.map(step => (
                        <StepCard
                          key={step.index}
                          step={step}
                          isSelected={selectedStep === step.index}
                          onClick={() => setSelectedStep(selectedStep === step.index ? null : step.index)}
                        />
                      ))}
                    </div>
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
            hasSteps={currentSteps.length > 0}
          />
        )}
      </div>
    </div>
  )
}
