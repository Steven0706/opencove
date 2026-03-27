import { useState } from 'react'
import type { JSX } from 'react'
import type { PgQueryResult } from '../../../../../shared/contracts/dto'

interface PgQueryEditorProps {
  connectionId: string
  initialQuery?: string
  onResults: (results: PgQueryResult) => void
}

export function PgQueryEditor({
  connectionId,
  initialQuery,
  onResults,
}: PgQueryEditorProps): JSX.Element {
  const [query, setQuery] = useState(initialQuery ?? '')
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleRun = async () => {
    if (!query.trim()) {
      return
    }

    setError(null)
    setIsRunning(true)

    try {
      const result = await window.opencoveApi.pg.query({
        connectionId,
        query: query.trim(),
      })
      onResults(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Query failed')
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <div className="pg-viewer-node__query">
      <textarea
        className="pg-viewer-node__query-input nodrag nowheel"
        value={query}
        onChange={event => setQuery(event.target.value)}
        placeholder="SELECT * FROM ..."
        onPointerDownCapture={event => {
          event.stopPropagation()
        }}
        onPointerDown={event => {
          event.stopPropagation()
        }}
        onKeyDown={event => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            event.preventDefault()
            void handleRun()
          }
        }}
      />
      <div className="pg-viewer-node__query-actions">
        <button
          type="button"
          className="pg-viewer-node__run-btn nodrag"
          disabled={isRunning || !query.trim()}
          onClick={() => {
            void handleRun()
          }}
        >
          {isRunning ? 'Running...' : 'Run'}
        </button>
        {error ? <span className="pg-viewer-node__query-error">{error}</span> : null}
      </div>
    </div>
  )
}
