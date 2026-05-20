import React, { useState } from 'react'

interface StepCaptureModalProps {
  isOpen: boolean
  screenshotDataUrl: string | null
  stepNumber: number
  onConfirm: (title: string, description: string) => void
  onCancel: () => void
}

export default function StepCaptureModal({
  isOpen,
  screenshotDataUrl,
  stepNumber,
  onConfirm,
  onCancel
}: StepCaptureModalProps): JSX.Element | null {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

  if (!isOpen) return null

  const handleConfirm = (): void => {
    if (!title.trim()) return
    onConfirm(title.trim(), description.trim())
    setTitle('')
    setDescription('')
  }

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleConfirm()
    }
    if (e.key === 'Escape') {
      onCancel()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Modal */}
      <div
        className="relative z-10 w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl"
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div>
            <h2 className="font-semibold text-slate-100">Capture Step {stepNumber}</h2>
            <p className="text-xs text-slate-500 mt-0.5">Add a title and description for this step</p>
          </div>
          <button
            onClick={onCancel}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M12 4L4 12M4 4l8 8" />
            </svg>
          </button>
        </div>

        {/* Screenshot preview */}
        {screenshotDataUrl && (
          <div className="px-5 pt-4">
            <div className="rounded-lg overflow-hidden border border-slate-700 bg-slate-800">
              <img
                src={screenshotDataUrl}
                alt="Captured screenshot"
                className="w-full max-h-48 object-cover object-top"
              />
            </div>
          </div>
        )}

        {/* Form */}
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="label">
              Step Title <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Click the 'Create Project' button"
              className="input"
              autoFocus
            />
          </div>

          <div>
            <label className="label">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what the user should do or see at this step..."
              className="input resize-none"
              rows={3}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-slate-800">
          <p className="text-xs text-slate-600">
            Press <kbd className="bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded text-xs font-mono">⌘+Enter</kbd> to confirm
          </p>
          <div className="flex gap-2">
            <button onClick={onCancel} className="btn btn-secondary btn-sm">
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!title.trim()}
              className="btn btn-primary btn-sm"
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 7l3 3 6-6" />
              </svg>
              Add Step
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
