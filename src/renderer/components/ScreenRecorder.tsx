import React, { useState, useRef, useCallback } from 'react'
import type { RunStep } from '../types'
import StepCaptureModal from './StepCaptureModal'
import StepCard from './StepCard'

interface ScreenRecorderProps {
  runId: string
  steps: RunStep[]
  onStepAdded: (step: RunStep) => void
  onStepRemoved: (index: number) => void
  onStepEdited: (step: RunStep) => void
  onStepToggleExclude: (index: number) => void
}

export default function ScreenRecorder({
  runId,
  steps,
  onStepAdded,
  onStepRemoved,
  onStepEdited,
  onStepToggleExclude
}: ScreenRecorderProps): JSX.Element {
  const [isRecording, setIsRecording] = useState(false)
  const [captureModalOpen, setCaptureModalOpen] = useState(false)
  const [capturedScreenshot, setCapturedScreenshot] = useState<string | null>(null)
  const [capturedTranscript, setCapturedTranscript] = useState('')
  const [editingStep, setEditingStep] = useState<RunStep | null>(null)
  const [micEnabled, setMicEnabled] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedStep, setSelectedStep] = useState<number | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recordingIndexRef = useRef(0)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const transcriptBufferRef = useRef('')

  const startRecording = useCallback(async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: 1920, height: 1080 },
        audio: false
      })

      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
      }

      const recorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp9'
      })

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' })
        chunksRef.current = []

        const arrayBuffer = await blob.arrayBuffer()
        const bytes = new Uint8Array(arrayBuffer)
        let binary = ''
        for (let i = 0; i < bytes.length; i += 8192) {
          binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
        }
        const base64 = btoa(binary)

        try {
          await window.electronAPI.recordingSave({
            runId,
            index: recordingIndexRef.current++,
            data: base64
          })
        } catch (err) {
          console.error('Failed to save recording:', err)
        }
      }

      // Handle stream ended (user stopped sharing)
      stream.getVideoTracks()[0].addEventListener('ended', () => {
        stopRecording()
      })

      recorder.start(1000)
      mediaRecorderRef.current = recorder
      setIsRecording(true)

      // Start speech recognition if mic is enabled
      if (micEnabled) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const SpeechRecognitionCtor = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
        if (SpeechRecognitionCtor) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const recognition = new SpeechRecognitionCtor() as any
          recognition.continuous = true
          recognition.interimResults = false
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          recognition.onresult = (event: any) => {
            const result = event.results[event.resultIndex]
            if (result.isFinal) {
              const text = (result[0].transcript as string).trim()
              if (text) {
                transcriptBufferRef.current += (transcriptBufferRef.current ? ' ' : '') + text
              }
            }
          }
          recognition.onerror = () => { /* silently degrade */ }
          recognition.start()
          recognitionRef.current = recognition
          transcriptBufferRef.current = ''
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'NotAllowedError') {
        setError('Screen sharing permission denied. Please allow screen capture to proceed.')
      } else {
        setError(`Failed to start recording: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }, [runId, micEnabled])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    mediaRecorderRef.current = null
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch { /* ignore */ }
      recognitionRef.current = null
    }
    setIsRecording(false)
  }, [])

  const captureStep = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return

    const video = videoRef.current
    const canvas = canvasRef.current

    canvas.width = video.videoWidth || 1280
    canvas.height = video.videoHeight || 720

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL('image/png')

    const transcript = transcriptBufferRef.current
    transcriptBufferRef.current = ''

    setCapturedScreenshot(dataUrl)
    setCapturedTranscript(transcript)
    setEditingStep(null)
    setCaptureModalOpen(true)
  }, [])

  const handleStepConfirm = useCallback(async (title: string, description: string) => {
    if (editingStep !== null) {
      onStepEdited({ ...editingStep, title, description })
      setCaptureModalOpen(false)
      setEditingStep(null)
      return
    }

    const stepIndex = steps.length
    let screenshotPath: string | null = null

    if (capturedScreenshot) {
      try {
        const base64 = capturedScreenshot.split(',')[1]
        const filename = `step-${String(stepIndex).padStart(3, '0')}.png`
        const result = await window.electronAPI.assetSave({ runId, filename, data: base64 })
        screenshotPath = result.filePath
      } catch (err) {
        console.error('Failed to save screenshot:', err)
      }
    }

    onStepAdded({ index: stepIndex, title, description, screenshotPath, thumbnailPath: null })
    setCaptureModalOpen(false)
    setCapturedScreenshot(null)
    setCapturedTranscript('')
  }, [editingStep, steps.length, capturedScreenshot, runId, onStepAdded, onStepEdited])

  const handleStepCancel = useCallback(() => {
    setCaptureModalOpen(false)
    setCapturedScreenshot(null)
    setCapturedTranscript('')
    setEditingStep(null)
  }, [])

  const handleEditStep = useCallback((step: RunStep) => {
    setEditingStep(step)
    setCapturedScreenshot(null)
    setCapturedTranscript('')
    setCaptureModalOpen(true)
  }, [])

  return (
    <div className="flex flex-col h-full">
      {/* Video preview */}
      <div className="relative bg-slate-900 border-b border-slate-800" style={{ minHeight: '240px', maxHeight: '320px' }}>
        <video
          ref={videoRef}
          className="w-full h-full object-contain"
          muted
          playsInline
          style={{ minHeight: '240px', maxHeight: '320px' }}
        />
        <canvas ref={canvasRef} className="hidden" />

        {!isRecording && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-900">
            <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-500">
                <rect x="3" y="3" width="22" height="18" rx="3" />
                <path d="M9 21v3M19 21v3M6 24h16" />
                <circle cx="14" cy="12" r="4" />
              </svg>
            </div>
            <div className="text-center">
              <div className="text-sm font-medium text-slate-300 mb-1">Screen recording stopped</div>
              <div className="text-xs text-slate-500">Click "Start Recording" to begin</div>
            </div>
          </div>
        )}

        {/* Recording indicator */}
        {isRecording && (
          <div className="absolute top-3 left-3 flex items-center gap-2 bg-slate-900/80 backdrop-blur-sm px-2 py-1 rounded-full">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
            </span>
            <span className="text-xs font-medium text-red-300">REC</span>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2">
        {!isRecording ? (
          <>
            <button
              onClick={startRecording}
              className="btn btn-primary btn-sm"
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="currentColor">
                <circle cx="6.5" cy="6.5" r="5" fillOpacity="0.3" stroke="currentColor" strokeWidth="1.5" fill="none" />
                <circle cx="6.5" cy="6.5" r="2.5" />
              </svg>
              Start Recording
            </button>
            <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer select-none ml-1">
              <input
                type="checkbox"
                checked={micEnabled}
                onChange={(e) => setMicEnabled(e.target.checked)}
                className="w-3 h-3 accent-brand-500"
              />
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="1" width="4" height="6" rx="2" />
                <path d="M2 6a4 4 0 008 0M6 10v1.5M4.5 11.5h3" />
              </svg>
              Transcribe voice
            </label>
          </>
        ) : (
          <>
            <button
              onClick={captureStep}
              className="btn btn-primary btn-sm"
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1.5" y="3" width="10" height="8" rx="1" />
                <path d="M4.5 3V2a1 1 0 011-1h2a1 1 0 011 1v1" />
                <circle cx="6.5" cy="7" r="1.5" />
              </svg>
              Capture Step
            </button>

            <button
              onClick={stopRecording}
              className="btn btn-danger btn-sm"
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="currentColor">
                <rect x="2.5" y="2.5" width="8" height="8" rx="1" />
              </svg>
              Stop
            </button>
          </>
        )}

        <div className="ml-auto text-xs text-slate-500">
          {steps.length} step{steps.length !== 1 ? 's' : ''} captured
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-4 mt-3 px-3 py-2.5 bg-red-900/20 border border-red-800/50 rounded-lg text-xs text-red-300 flex items-start gap-2">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="mt-0.5 shrink-0">
            <circle cx="7" cy="7" r="5.5" />
            <path d="M7 4.5v3M7 9.5h.01" />
          </svg>
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-auto text-red-400 hover:text-red-200"
          >
            ×
          </button>
        </div>
      )}

      {/* Steps list */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {steps.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-600 py-8">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="7" width="22" height="18" rx="2" />
              <path d="M5 12h22M11 7V5M21 7V5" />
            </svg>
            <div className="text-center">
              <div className="font-medium mb-1">No steps captured yet</div>
              <div className="text-sm">Start recording and click "Capture Step" to add steps</div>
            </div>
          </div>
        ) : (
          <div className="space-y-3 group">
            {steps.map((step) => (
              <StepCard
                key={step.index}
                step={step}
                isSelected={selectedStep === step.index}
                onClick={() => setSelectedStep(selectedStep === step.index ? null : step.index)}
                onDelete={() => onStepRemoved(step.index)}
                onEdit={() => handleEditStep(step)}
                onToggleExclude={() => onStepToggleExclude(step.index)}
                showDelete={true}
              />
            ))}
          </div>
        )}
      </div>

      {/* Capture / edit modal */}
      <StepCaptureModal
        isOpen={captureModalOpen}
        screenshotDataUrl={editingStep
          ? (editingStep.screenshotPath
              ? editingStep.screenshotPath.startsWith('gsasset://')
                ? editingStep.screenshotPath
                : `gsasset://asset${encodeURI(editingStep.screenshotPath.replace(/^file:\/\//, ''))}`
              : null)
          : capturedScreenshot}
        stepNumber={editingStep ? editingStep.index + 1 : steps.length + 1}
        initialTitle={editingStep?.title}
        initialDescription={editingStep?.description}
        onConfirm={handleStepConfirm}
        onCancel={handleStepCancel}
      />
    </div>
  )
}
