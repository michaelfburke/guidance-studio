import React, { useState, useCallback } from 'react'
import type { RunStep } from '../types'

interface StepCardProps {
  step: RunStep
  isSelected?: boolean
  onClick?: () => void
  onDelete?: () => void
  onEdit?: () => void
  onToggleExclude?: () => void
  showDelete?: boolean
}

export default function StepCard({
  step,
  isSelected = false,
  onClick,
  onDelete,
  onEdit,
  onToggleExclude,
  showDelete = false
}: StepCardProps): JSX.Element {
  const [imgError, setImgError] = useState(false)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const excluded = !!step.excluded

  const openLightbox = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setLightboxOpen(true)
  }, [])

  const hasScreenshot = step.screenshotPath && !imgError

  // Screenshots are served through the gsasset:// protocol (registered in the
  // main process) — file:// URLs are blocked in the renderer.
  const screenshotSrc = step.screenshotPath
    ? step.screenshotPath.startsWith('gsasset://')
      ? step.screenshotPath
      : `gsasset://asset${encodeURI(step.screenshotPath.replace(/^file:\/\//, ''))}`
    : null

  return (
    <div
      className={`
        group relative rounded-xl border transition-all duration-150 overflow-hidden
        ${onClick ? 'cursor-pointer' : ''}
        ${excluded ? 'opacity-55' : ''}
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

      {/* Include / exclude toggle */}
      {onToggleExclude && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onToggleExclude()
          }}
          className={`absolute top-2.5 right-2.5 z-10 flex items-center gap-1 px-1.5 py-1 rounded-md text-xs font-medium transition-colors ${
            excluded
              ? 'bg-amber-900/80 text-amber-300 hover:bg-amber-900'
              : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 opacity-0 group-hover:opacity-100'
          }`}
          title={excluded ? 'Include in guidance' : 'Exclude from guidance'}
        >
          {excluded ? (
            <>
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M1 7s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4z" />
                <circle cx="7" cy="7" r="1.5" />
                <path d="M1 1l12 12" />
              </svg>
              Excluded
            </>
          ) : (
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M1 7s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4z" />
              <circle cx="7" cy="7" r="1.5" />
            </svg>
          )}
        </button>
      )}

      {/* Screenshot area */}
      {hasScreenshot && screenshotSrc ? (
        <div
          className="w-full h-48 bg-slate-800 overflow-hidden cursor-zoom-in relative group/screenshot"
          onClick={openLightbox}
          title="Click to enlarge"
        >
          <img
            src={screenshotSrc}
            alt={`Screenshot for step ${step.index + 1}`}
            className={`w-full h-full object-cover object-top ${excluded ? 'grayscale' : ''}`}
            onError={() => setImgError(true)}
          />
          <div className="absolute inset-0 bg-black/0 group-hover/screenshot:bg-black/20 transition-colors flex items-center justify-center">
            <svg className="opacity-0 group-hover/screenshot:opacity-70 transition-opacity" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round">
              <path d="M15 3h6m0 0v6m0-6l-7 7M9 21H3m0 0v-6m0 6l7-7" />
            </svg>
          </div>
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
        <h4 className={`font-medium text-sm leading-snug mb-1.5 pr-6 ${
          excluded ? 'text-slate-500 line-through' : 'text-slate-100'
        }`}>
          {step.title}
        </h4>
        <p className="text-xs text-slate-400 leading-relaxed line-clamp-3">
          {step.description}
        </p>
      </div>

      {/* Edit + Delete buttons grouped at bottom-right */}
      {(onEdit || (showDelete && onDelete)) && (
        <div className="absolute bottom-2.5 right-2.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 z-10">
          {onEdit && (
            <button
              onClick={(e) => { e.stopPropagation(); onEdit() }}
              className="p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-700 transition-colors"
              title="Edit step"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8.5 1.5l2 2L4 10H2v-2L8.5 1.5z" />
              </svg>
            </button>
          )}
          {showDelete && onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete() }}
              className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-red-900/20 transition-colors"
              title="Remove step"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M9 3L3 9M3 3l6 6" />
              </svg>
            </button>
          )}
        </div>
      )}

      {/* Lightbox overlay */}
      {lightboxOpen && screenshotSrc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={(e) => { e.stopPropagation(); setLightboxOpen(false) }}
        >
          <button
            className="absolute top-4 right-4 p-2 rounded-full bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
            onClick={(e) => { e.stopPropagation(); setLightboxOpen(false) }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M4 4l10 10M14 4L4 14" />
            </svg>
          </button>
          <div className="max-w-5xl max-h-[90vh] p-4" onClick={(e) => e.stopPropagation()}>
            <img
              src={screenshotSrc}
              alt={`Step ${step.index + 1} full view`}
              className="max-w-full max-h-[85vh] rounded-lg border border-slate-700 object-contain shadow-2xl"
            />
            <p className="text-center text-xs text-slate-500 mt-2">Step {step.index + 1}: {step.title}</p>
          </div>
        </div>
      )}
    </div>
  )
}
