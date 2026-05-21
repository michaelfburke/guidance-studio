import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import type { RunMeta } from '../types'
import { providerMeta } from '../providers'

interface RunCardProps {
  run: RunMeta
  onDelete: (id: string) => void
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const hours = diff / (1000 * 60 * 60)

  if (hours < 1) {
    const mins = Math.floor(diff / (1000 * 60))
    return mins <= 1 ? 'Just now' : `${mins} minutes ago`
  }
  if (hours < 24) {
    const h = Math.floor(hours)
    return `${h} hour${h !== 1 ? 's' : ''} ago`
  }
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} day${days !== 1 ? 's' : ''} ago`

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function StatusBadge({ status }: { status: RunMeta['status'] }): JSX.Element {
  const classes = {
    running: 'status-running',
    completed: 'status-completed',
    failed: 'status-failed',
    stopped: 'status-stopped'
  }

  const icons = {
    running: (
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
      </span>
    ),
    completed: (
      <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
        <path d="M8 3L4 7L2 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
    ),
    failed: (
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M7 3L3 7M3 3l4 4" />
      </svg>
    ),
    stopped: (
      <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
        <rect x="3" y="3" width="4" height="4" rx="0.5" />
      </svg>
    )
  }

  return (
    <span className={classes[status]}>
      {icons[status]}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

export default function RunCard({ run, onDelete }: RunCardProps): JSX.Element {
  const [pendingDelete, setPendingDelete] = useState(false)

  const handleDeleteClick = (e: React.MouseEvent): void => {
    e.stopPropagation()
    setPendingDelete(true)
  }

  const handleDeleteConfirm = (e: React.MouseEvent): void => {
    e.stopPropagation()
    onDelete(run.id)
  }

  const handleDeleteCancel = (e: React.MouseEvent): void => {
    e.stopPropagation()
    setPendingDelete(false)
  }

  return (
    <Link
      to={`/runs/${run.id}`}
      className="card p-4 cursor-pointer hover:border-slate-700 hover:bg-slate-900/80 transition-all duration-150 group block"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Header row */}
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className={run.mode === 'agent' ? 'badge-agent' : 'badge-assisted'}>
              {run.mode === 'agent' ? (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                  <circle cx="5" cy="5" r="4" fillOpacity="0.3" stroke="currentColor" strokeWidth="1.5" fill="none" />
                  <circle cx="5" cy="5" r="1.5" />
                </svg>
              ) : (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <circle cx="5" cy="3" r="1.5" />
                  <path d="M2 9c0-1.657 1.343-3 3-3s3 1.343 3 3" />
                </svg>
              )}
              {run.mode === 'agent' ? 'Agent' : 'Assisted'}
            </span>

            <span className={providerMeta(run.provider).badgeClass}>
              {providerMeta(run.provider).label}
            </span>

            <StatusBadge status={run.status} />
          </div>

          {/* Title */}
          <h3 className="font-semibold text-slate-100 text-sm truncate mb-1">
            {run.feature || 'Untitled Feature'}
          </h3>

          {/* Product & goal */}
          <p className="text-xs text-slate-500 truncate mb-2">
            {run.productName && <span className="text-slate-400">{run.productName} · </span>}
            {run.goal}
          </p>

          {/* Footer */}
          <div className="flex items-center gap-3 text-xs text-slate-600">
            <span>{formatDate(run.createdAt)}</span>
            {run.stepCount > 0 && (
              <span className="flex items-center gap-1">
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M2 5.5h7M6.5 3L9 5.5 6.5 8" />
                </svg>
                {run.stepCount} step{run.stepCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className={`flex items-center gap-1 transition-opacity ${pendingDelete ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
          {pendingDelete ? (
            <>
              <span className="text-xs text-slate-400 mr-1">Delete?</span>
              <button
                onClick={handleDeleteConfirm}
                className="px-2 py-1 rounded text-xs font-medium bg-red-900/40 text-red-400 hover:bg-red-900/60 hover:text-red-300 transition-colors"
              >
                Confirm
              </button>
              <button
                onClick={handleDeleteCancel}
                className="px-2 py-1 rounded text-xs font-medium text-slate-500 hover:text-slate-300 transition-colors"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleDeleteClick}
                className="p-1.5 rounded text-slate-600 hover:text-red-400 hover:bg-red-900/20 transition-colors"
                title="Delete run"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 3.5h10M5.5 3.5V2h3v1.5M4.5 3.5v7a1 1 0 001 1h3a1 1 0 001-1v-7" />
                </svg>
              </button>

              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-600">
                <path d="M6 3l5 5-5 5" />
              </svg>
            </>
          )}
        </div>
      </div>
    </Link>
  )
}
