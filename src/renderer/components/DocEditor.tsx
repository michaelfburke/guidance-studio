import React, { useState, useCallback } from 'react'

interface DocEditorProps {
  markdown: string
  onChange: (value: string) => void
  onSave?: () => void
  onGenerate?: () => void
  isGenerating?: boolean
  hasSteps?: boolean
}

function MarkdownPreview({ markdown }: { markdown: string }): JSX.Element {
  // Simple markdown renderer
  const renderMarkdown = (text: string): string => {
    return text
      // Escape HTML
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      // Headers
      .replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold text-slate-100 mt-5 mb-2">$1</h3>')
      .replace(/^## (.+)$/gm, '<h2 class="text-lg font-semibold text-slate-100 mt-6 mb-3 pb-1 border-b border-slate-800">$2</h2>')
      .replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold text-slate-100 mt-4 mb-4">$1</h1>')
      // Bold and italic
      .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g, '<strong class="text-slate-200">$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      // Code
      .replace(/`([^`]+)`/g, '<code class="bg-slate-800 text-brand-300 px-1.5 py-0.5 rounded text-xs font-mono">$1</code>')
      // Block code
      .replace(/```[\s\S]*?```/g, (match) => {
        const code = match.replace(/```\w*\n?/, '').replace(/\n?```$/, '')
        return `<pre class="bg-slate-800 rounded-lg p-3 my-3 overflow-x-auto"><code class="text-sm font-mono text-slate-300">${code}</code></pre>`
      })
      // Images
      .replace(
        /!\[([^\]]*)\]\(([^)\s]+)\)/g,
        '<img src="$2" alt="$1" class="rounded-lg border border-slate-800 my-3 max-w-full" />'
      )
      // Checkboxes
      .replace(/^- \[ \] (.+)$/gm, '<li class="flex items-start gap-2 text-slate-300 mb-1"><span class="mt-0.5 w-4 h-4 border border-slate-600 rounded flex-shrink-0"></span><span>$1</span></li>')
      .replace(/^- \[x\] (.+)$/gm, '<li class="flex items-start gap-2 text-slate-300 mb-1"><span class="mt-0.5 w-4 h-4 bg-brand-600 border border-brand-600 rounded flex-shrink-0 flex items-center justify-center text-xs text-white">✓</span><span>$1</span></li>')
      // Lists
      .replace(/^- (.+)$/gm, '<li class="text-slate-300 mb-1 ml-4 list-disc">$1</li>')
      .replace(/^\d+\. (.+)$/gm, '<li class="text-slate-300 mb-1 ml-4 list-decimal">$1</li>')
      // Horizontal rule
      .replace(/^---$/gm, '<hr class="border-slate-800 my-4" />')
      // Blockquote
      .replace(/^> (.+)$/gm, '<blockquote class="border-l-2 border-brand-600 pl-4 text-slate-400 italic my-3">$1</blockquote>')
      // Paragraphs
      .replace(/\n\n/g, '</p><p class="text-slate-300 mb-3 leading-relaxed">')
      .replace(/\n/g, '<br />')
  }

  const html = renderMarkdown(markdown)

  return (
    <div
      className="prose-custom px-6 py-5 text-sm leading-relaxed overflow-y-auto h-full"
      dangerouslySetInnerHTML={{
        __html: `<div class="text-slate-300 leading-relaxed">${html}</div>`
      }}
    />
  )
}

export default function DocEditor({
  markdown,
  onChange,
  onSave,
  onGenerate,
  isGenerating = false,
  hasSteps = false
}: DocEditorProps): JSX.Element {
  const [view, setView] = useState<'edit' | 'preview' | 'split'>('split')
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(markdown)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [markdown])

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

          {/* Save */}
          {onSave && (
            <button
              onClick={onSave}
              className="btn btn-secondary btn-sm"
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.5 11.5h-8a1 1 0 01-1-1v-8l2-2h6a1 1 0 011 1v9a1 1 0 01-1 1z" />
                <rect x="4" y="7" width="5" height="4.5" rx="0.5" />
                <rect x="3.5" y="1.5" width="5" height="3" rx="0.5" />
              </svg>
              Save
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
