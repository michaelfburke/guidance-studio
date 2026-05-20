import React, { useState } from 'react'
import type { RunStep } from '../types'

interface StepCardProps {
  step: RunStep
  isSelected?: boolean
  onClick?: () => void
  onDelete?: () => void
  showDelete?: boolean
}

export default function StepCard({
  step,
  isSelected = false,
  onClick,
  onDelete,
  showDelete = false
}: StepCardProps): JSX.Element {
  const [imgError, setImgError] = useState(false)

  const hasScreenshot = step.screenshotPath && !imgError

  // Convert file:// path or raw path for display
  const screenshotSrc = step.screenshotPath
    ? step.screenshotPath.startsWith('file://')
      ? step.screenshotPath
      : `file://${step.screenshotPath}`
    : null

  return (
    <div
      className={`
        relative rounded-xl border transition-all duration-150 overflow-hidden
        ${onClick ? 'cursor-pointer' : ''}
        ${isSelected
          ? 'border-brand-600/70 bg-brand-950/20 shadow-lg shadow-brand-900/20'
          : 'border-slate-800 bg-slate-900 hover:border-slate-700'
        }
      `}
      onClick={onClick}
    >
      {/* Step number badge */}
      <div className={`
        absolute top-3 left-3 z-10 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
        ${isSelected ? 'bg-brand-600 text-white' : 'bg-slate-800 text-slate-400'}
      `}>
        {step.index + 1}
      </div>

      {/* Screenshot area */}
      {hasScreenshot && screenshotSrc ? (
        <div className="w-full h-36 bg-slate-800 overflow-hidden">
          <img
            src={screenshotSrc}
            alt={`Screenshot for step ${step.index + 1}`}
            className="w-full h-full object-cover object-top"
            onError={() => setImgError(true)}
          />
        </div>
      ) : (
        <div className="w-full h-28 bg-slate-800/50 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2 text-slate-600">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="14" rx="2" />
              <path d="M8 21h8M12 17v4" />
            </svg>
            <span className="text-xs">No screenshot</span>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="p-3 pt-2">
        <h4 className="font-medium text-sm text-slate-100 leading-snug mb-1.5 pr-6">
          {step.title}
        </h4>
        <p className="text-xs text-slate-400 leading-relaxed line-clamp-3">
          {step.description}
        </p>
      </div>

      {/* Delete button */}
      {showDelete && onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="absolute top-2.5 right-2.5 p-1 rounded text-slate-600 hover:text-red-400 hover:bg-red-900/20 transition-colors opacity-0 group-hover:opacity-100"
          title="Remove step"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M9 3L3 9M3 3l6 6" />
          </svg>
        </button>
      )}
    </div>
  )
}
