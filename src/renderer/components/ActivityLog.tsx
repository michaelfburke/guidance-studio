import React, { useRef, useEffect } from 'react'
import type { AgentEvent } from '../types'

interface ActivityLogProps {
  events: AgentEvent[]
  isRunning?: boolean
}

const EVENT_CONFIG: Record<AgentEvent['type'], { icon: string; color: string; label: string }> = {
  nav: {
    icon: '→',
    color: 'text-blue-400',
    label: 'NAV'
  },
  observe: {
    icon: '👁',
    color: 'text-slate-400',
    label: 'OBS'
  },
  click: {
    icon: '◉',
    color: 'text-emerald-400',
    label: 'CLK'
  },
  type: {
    icon: '⌨',
    color: 'text-violet-400',
    label: 'TYP'
  },
  screenshot: {
    icon: '📷',
    color: 'text-sky-400',
    label: 'SCR'
  },
  analyze: {
    icon: '🔍',
    color: 'text-amber-400',
    label: 'ANA'
  },
  step: {
    icon: '✓',
    color: 'text-green-400',
    label: 'STP'
  },
  complete: {
    icon: '★',
    color: 'text-brand-400',
    label: 'DONE'
  },
  error: {
    icon: '✗',
    color: 'text-red-400',
    label: 'ERR'
  },
  info: {
    icon: 'ℹ',
    color: 'text-slate-500',
    label: 'INFO'
  }
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

export default function ActivityLog({ events, isRunning = false }: ActivityLogProps): JSX.Element {
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const autoScrollRef = useRef(true)

  // Auto-scroll to bottom on new events
  useEffect(() => {
    if (autoScrollRef.current && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [events])

  const handleScroll = (): void => {
    if (!containerRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current
    autoScrollRef.current = scrollHeight - scrollTop - clientHeight < 100
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="text-sm font-medium text-slate-200">Activity Log</div>
          {isRunning && (
            <span className="flex items-center gap-1.5 text-xs text-amber-400">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500" />
              </span>
              Running
            </span>
          )}
        </div>
        <div className="text-xs text-slate-600">{events.length} events</div>
      </div>

      {/* Events */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto px-3 py-2 font-mono text-xs"
        onScroll={handleScroll}
      >
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-600">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="16" cy="16" r="12" />
              <path d="M16 10v6l4 2" />
            </svg>
            <span>Waiting for agent...</span>
          </div>
        ) : (
          <div className="space-y-0.5">
            {events.map((event, i) => {
              const config = EVENT_CONFIG[event.type]
              return (
                <div
                  key={i}
                  className={`
                    flex items-start gap-2 py-1 px-2 rounded hover:bg-slate-800/40 transition-colors
                    ${event.type === 'error' ? 'bg-red-900/10' : ''}
                    ${event.type === 'complete' ? 'bg-brand-900/10' : ''}
                  `}
                >
                  {/* Time */}
                  <span className="text-slate-700 shrink-0 w-20">{formatTime(event.timestamp)}</span>

                  {/* Label */}
                  <span className={`shrink-0 w-10 font-bold text-right ${config.color}`}>
                    {config.label}
                  </span>

                  {/* Message */}
                  <span className={`flex-1 break-all leading-relaxed ${
                    event.type === 'error' ? 'text-red-300' :
                    event.type === 'complete' ? 'text-brand-300' :
                    event.type === 'step' ? 'text-green-300' :
                    'text-slate-400'
                  }`}>
                    {event.message}
                  </span>
                </div>
              )
            })}

            {/* Running indicator */}
            {isRunning && (
              <div className="flex items-center gap-2 py-1 px-2">
                <span className="text-slate-700 w-20">{formatTime(Date.now())}</span>
                <span className="text-slate-600 w-10 text-right">...</span>
                <span className="text-slate-600 flex gap-0.5">
                  <span className="animate-bounce" style={{ animationDelay: '0ms' }}>.</span>
                  <span className="animate-bounce" style={{ animationDelay: '150ms' }}>.</span>
                  <span className="animate-bounce" style={{ animationDelay: '300ms' }}>.</span>
                </span>
              </div>
            )}
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
