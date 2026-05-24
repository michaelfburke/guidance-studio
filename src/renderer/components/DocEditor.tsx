import React, { useState, useCallback, useEffect, useMemo } from 'react'
import { marked } from 'marked'

// Configure marked once at module level: GFM tables + line breaks
marked.setOptions({ gfm: true, breaks: true })

interface DocEditorProps {
  markdown: string
  onChange: (value: string) => void
  onSave?: () => void
  onGenerate?: () => void
  isGenerating?: boolean
  hasSteps?: boolean
  isDocDirty?: boolean
}

function MarkdownPreview({ markdown }: { markdown: string }): JSX.Element {
  const html = useMemo(() => {
    const result = marked.parse(markdown)
    return typeof result === 'string' ? result : ''
  }, [markdown])

  return (
    <div
      className="doc-preview px-6 py-5 overflow-y-auto h-full"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

export default function DocEditor({
  markdown,
  onChange,
  onSave,
  onGenerate,
  isGenerating = false,
  hasSteps = false,
  isDocDirty = false
}: DocEditorProps): JSX.Element {
  const [view, setView] = useState<'edit' | 'preview' | 'split'>('split')
  const [copied, setCopied] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(markdown)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [markdown])

  const handleSave = useCallback(() => {
    onSave?.()
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }, [onSave])

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleSave])

  const charCount = markdown.length
  const wordCount = markdown.trim() ? markdown.trim().split(/\s+/).length : 0

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-slate-950/50">
        <div className="flex items-center gap-1">
          {/* View mode toggles */}
          <div className="flex items-center bg-slate-800 rounded-lg p-0.5 gap-0.5">
            <button
              onClick={() => setView('edit')}
              className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
                view === 'edit'
                  ? 'bg-slate-700 text-slate-100'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              Edit
            </button>
            <button
              onClick={() => setView('split')}
              className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
                view === 'split'
                  ? 'bg-slate-700 text-slate-100'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              Split
            </button>
            <button
              onClick={() => setView('preview')}
              className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
                view === 'preview'
                  ? 'bg-slate-700 text-slate-100'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              Preview
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Stats */}
          <span className="text-xs text-slate-600">
            {wordCount} words · {charCount} chars
          </span>

          {/* Copy */}
          <button
            onClick={handleCopy}
            className="btn btn-ghost btn-sm gap-1.5"
            title="Copy markdown"
          >
            {copied ? (
              <>
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 7l3 3 6-6" />
                </svg>
                Copied
              </>
            ) : (
              <>
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="4" y="4" width="7" height="8" rx="1" />
                  <path d="M9 4V3a1 1 0 00-1-1H3a1 1 0 00-1 1v7a1 1 0 001 1h1" />
                </svg>
                Copy
              </>
            )}
          </button>

          {/* Generate */}
          {onGenerate && (
            <button
              onClick={onGenerate}
              disabled={isGenerating || !hasSteps}
              className="btn btn-primary btn-sm"
              title={!hasSteps ? 'Add steps first' : 'Generate documentation with AI'}
            >
              {isGenerating ? (
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
          )}

          {/* Unsaved indicator */}
          {isDocDirty && !saved && (
            <span className="flex items-center gap-1 text-xs text-amber-400">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              Unsaved
            </span>
          )}

          {/* Save */}
          {onSave && (
            <button
              onClick={handleSave}
              className="btn btn-secondary btn-sm"
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.5 11.5h-8a1 1 0 01-1-1v-8l2-2h6a1 1 0 011 1v9a1 1 0 01-1 1z" />
                <rect x="4" y="7" width="5" height="4.5" rx="0.5" />
                <rect x="3.5" y="1.5" width="5" height="3" rx="0.5" />
              </svg>
              {saved ? 'Saved' : 'Save'}
            </button>
          )}
        </div>
      </div>

      {/* Editor/Preview area */}
      <div className="flex-1 overflow-hidden flex">
        {/* Edit pane */}
        {(view === 'edit' || view === 'split') && (
          <div className={`${view === 'split' ? 'w-1/2 border-r border-slate-800' : 'w-full'} flex flex-col`}>
            <div className="px-3 py-1.5 border-b border-slate-800 bg-slate-950/30">
              <span className="text-xs text-slate-600 font-mono">markdown</span>
            </div>
            <textarea
              value={markdown}
              onChange={(e) => onChange(e.target.value)}
              className="flex-1 w-full bg-transparent text-slate-300 font-mono text-xs leading-relaxed resize-none p-4 focus:outline-none placeholder-slate-700"
              placeholder="# Documentation&#10;&#10;Start typing or click **Generate Docs** to create documentation from your recorded steps..."
              spellCheck={false}
            />
          </div>
        )}

        {/* Preview pane */}
        {(view === 'preview' || view === 'split') && (
          <div className={`${view === 'split' ? 'w-1/2' : 'w-full'} flex flex-col overflow-hidden`}>
            <div className="px-3 py-1.5 border-b border-slate-800 bg-slate-950/30">
              <span className="text-xs text-slate-600">preview</span>
            </div>
            {markdown ? (
              <MarkdownPreview markdown={markdown} />
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-600">
                <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="6" y="4" width="28" height="32" rx="3" />
                  <path d="M12 13h16M12 19h16M12 25h10" />
                </svg>
                <div className="text-center">
                  <div className="font-medium mb-1">No documentation yet</div>
                  <div className="text-sm">Generate docs from your steps</div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
