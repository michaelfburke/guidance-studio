import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import RunCard from '../components/RunCard'
import type { RunMeta } from '../types'

export default function HomePage(): JSX.Element {
  const navigate = useNavigate()
  const [runs, setRuns] = useState<RunMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'agent' | 'assisted'>('all')
  const [search, setSearch] = useState('')
  const [groupByProduct, setGroupByProduct] = useState(true)

  const loadRuns = useCallback(async () => {
    setLoading(true)
    try {
      const list = await window.electronAPI.runList()
      setRuns(list)
    } catch (err) {
      console.error('Failed to load runs:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadRuns()
  }, [loadRuns])

  const handleDelete = useCallback(async (id: string) => {
    await window.electronAPI.runDelete(id)
    setRuns(prev => prev.filter(r => r.id !== id))
  }, [])

  const filteredRuns = runs.filter(run => {
    if (filter !== 'all' && run.mode !== filter) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        run.feature.toLowerCase().includes(q) ||
        run.productName.toLowerCase().includes(q) ||
        run.goal.toLowerCase().includes(q)
      )
    }
    return true
  })

  // Group filteredRuns by productName for the product view, sorted by most recently active
  const productGroups = useMemo(() => {
    const groups: Record<string, RunMeta[]> = {}
    for (const run of filteredRuns) {
      const key = run.productName || 'Unnamed'
      if (!groups[key]) groups[key] = []
      groups[key].push(run)
    }
    return Object.entries(groups).sort(
      ([, a], [, b]) => new Date(b[0].createdAt).getTime() - new Date(a[0].createdAt).getTime()
    )
  }, [filteredRuns])

  const handleNewFeatureForProduct = useCallback((productRuns: RunMeta[]): void => {
    const mostRecent = productRuns[0]
    navigate('/runs/new', {
      state: {
        prefill: {
          productName: mostRecent.productName,
          url: mostRecent.url ?? '',
          mode: mostRecent.mode,
          provider: mostRecent.provider
        }
      }
    })
  }, [navigate])

  const stats = {
    total: runs.length,
    completed: runs.filter(r => r.status === 'completed').length,
    running: runs.filter(r => r.status === 'running').length
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Page header */}
      <div className="px-6 py-5 border-b border-slate-800/60">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-100">Documentation</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {stats.total === 0
                ? 'No features documented yet'
                : `${stats.completed} feature${stats.completed !== 1 ? 's' : ''} documented${stats.running > 0 ? ` · ${stats.running} running` : ''}`
              }
            </p>
          </div>

          <button
            onClick={() => navigate('/runs/new')}
            className="btn btn-primary"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M8 3v10M3 8h10" />
            </svg>
            Document feature
          </button>
        </div>

        {/* Filters & Search */}
        {runs.length > 0 && (
          <div className="flex items-center gap-3 mt-4">
            {/* Mode filter */}
            <div className="flex items-center bg-slate-800/60 rounded-lg p-0.5 gap-0.5">
              {(['all', 'agent', 'assisted'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors capitalize ${
                    filter === f
                      ? 'bg-slate-700 text-slate-100'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            {/* Group by product toggle */}
            <button
              onClick={() => setGroupByProduct(prev => !prev)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-medium transition-colors border ${
                groupByProduct
                  ? 'bg-slate-700 text-slate-100 border-slate-600'
                  : 'border-slate-800 text-slate-500 hover:text-slate-300'
              }`}
              title={groupByProduct ? 'Switch to flat list' : 'Group by product'}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M1 3h10M1 6h6M1 9h4" />
              </svg>
              By product
            </button>

            {/* Search */}
            <div className="relative flex-1 max-w-xs">
              <svg
                width="14" height="14"
                viewBox="0 0 14 14"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
              >
                <circle cx="6" cy="6" r="4.5" />
                <path d="M9.5 9.5L12 12" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search runs..."
                className="input pl-8 py-1.5 text-xs h-8"
              />
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading ? (
          <div className="flex items-center justify-center h-48 gap-3 text-slate-500">
            <svg className="animate-spin" width="20" height="20" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="8" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
              <path d="M10 2a8 8 0 018 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Loading runs...
          </div>
        ) : runs.length === 0 ? (
          // Empty state
          <div className="flex flex-col items-center justify-center h-full gap-6 py-16">
            <div className="w-20 h-20 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center">
              <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-600">
                <rect x="4" y="4" width="28" height="28" rx="4" />
                <path d="M4 14h28M14 4v28" />
                <circle cx="23" cy="23" r="4" />
                <path d="M21.5 23h3M23 21.5v3" />
              </svg>
            </div>
            <div className="text-center">
              <h2 className="text-lg font-semibold text-slate-200 mb-2">No features documented yet</h2>
              <p className="text-slate-500 text-sm max-w-sm">
                Document your first feature to start building your product's
                AI-powered documentation library.
              </p>
            </div>
            <button
              onClick={() => navigate('/runs/new')}
              className="btn btn-primary"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M8 3v10M3 8h10" />
              </svg>
              Document First Feature
            </button>
          </div>
        ) : filteredRuns.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-slate-500">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="14" cy="14" r="9" />
              <path d="M22 22l5 5" />
            </svg>
            <div className="text-center">
              <div className="font-medium">No matching runs</div>
              <div className="text-sm mt-1">Try adjusting your filters</div>
            </div>
          </div>
        ) : groupByProduct ? (
          // Product-grouped view
          <div className="space-y-8">
            {productGroups.map(([productName, productRuns]) => {
              const completedCount = productRuns.filter(r => r.status === 'completed').length
              return (
                <div key={productName}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <h2 className="text-sm font-semibold text-slate-200 truncate">{productName}</h2>
                      <span className="text-xs text-slate-600 shrink-0">
                        {completedCount} of {productRuns.length} documented
                      </span>
                    </div>
                    <button
                      onClick={() => handleNewFeatureForProduct(productRuns)}
                      className="btn btn-secondary btn-sm shrink-0 ml-4"
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                        <path d="M6 2v8M2 6h8" />
                      </svg>
                      New feature
                    </button>
                  </div>
                  <div className="grid gap-2">
                    {productRuns.map(run => (
                      <RunCard key={run.id} run={run} onDelete={handleDelete} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          // Flat list view
          <div className="grid gap-3">
            {filteredRuns.map(run => (
              <RunCard
                key={run.id}
                run={run}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
