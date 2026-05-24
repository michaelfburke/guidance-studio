import React from 'react'
import { useNavigate } from 'react-router-dom'

interface State {
  error: Error | null
}

interface Props {
  children: React.ReactNode
  /** Shown when the boundary catches; defaults to a full-page fallback. */
  fallback?: React.ReactNode
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  reset = (): void => {
    this.setState({ error: null })
  }

  render(): React.ReactNode {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback
      return <ErrorFallback error={this.state.error} onReset={this.reset} />
    }
    return this.props.children
  }
}

function ErrorFallback({ error, onReset }: { error: Error; onReset: () => void }): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      <div className="max-w-md">
        <div className="w-12 h-12 rounded-full bg-red-900/30 border border-red-700/50 flex items-center justify-center mx-auto mb-4">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-red-400">
            <circle cx="11" cy="11" r="9" />
            <path d="M11 7v4.5M11 14.5h.01" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-slate-100 mb-2">Something went wrong</h2>
        <p className="text-sm text-slate-400 mb-1">{error.message}</p>
        <p className="text-xs text-slate-600 mb-6">The error has been logged to the console.</p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={onReset}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm transition-colors"
          >
            Try again
          </button>
          <GoHomeButton />
        </div>
      </div>
    </div>
  )
}

function GoHomeButton(): JSX.Element {
  // Can't use useNavigate inside a class component; this wrapper is functional.
  const navigate = useNavigate()
  return (
    <button
      onClick={() => navigate('/runs')}
      className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-sm transition-colors"
    >
      Go to Home
    </button>
  )
}
