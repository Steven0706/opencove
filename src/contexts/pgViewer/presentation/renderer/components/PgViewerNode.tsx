import { useCallback, useMemo, useState } from 'react'
import type { JSX } from 'react'
import { Maximize2, Minimize2 } from 'lucide-react'
import type { NodeFrame, Point } from '@contexts/workspace/presentation/renderer/types'
import type { PgQueryResult } from '../../../../../shared/contracts/dto'
import { NodeResizeHandles } from '@contexts/workspace/presentation/renderer/components/shared/NodeResizeHandles'
import { useNodeFrameResize } from '@contexts/workspace/presentation/renderer/utils/nodeFrameResize'
import { resolveCanonicalNodeMinSize } from '@contexts/workspace/presentation/renderer/utils/workspaceNodeSizing'
import { PgConnectionForm } from './PgConnectionForm'
import { PgTableList } from './PgTableList'
import { PgQueryEditor } from './PgQueryEditor'
import { PgResultsTable } from './PgResultsTable'

interface PgViewerNodeInteractionOptions {
  normalizeViewport?: boolean
  selectNode?: boolean
  shiftKey?: boolean
}

interface PgViewerNodeProps {
  host: string
  port: number
  database: string
  user: string
  isConnected: boolean
  connectionId: string | null
  activeTable: string | null
  nodeNumber?: number
  position: Point
  width: number
  height: number
  onClose: () => void
  onResize: (frame: NodeFrame) => void
  onConnectionChange: (data: {
    connectionId: string | null
    isConnected: boolean
    host: string
    port: number
    database: string
    user: string
    activeTable: string | null
    tables: string[]
  }) => void
  onInteractionStart?: (options?: PgViewerNodeInteractionOptions) => void
  isMaximized?: boolean
  onToggleMaximize?: () => void
}

export function PgViewerNode({
  host,
  port,
  database,
  user,
  isConnected,
  connectionId,
  activeTable,
  nodeNumber,
  position,
  width,
  height,
  onClose,
  onResize,
  onConnectionChange,
  onInteractionStart,
  isMaximized,
  onToggleMaximize,
}: PgViewerNodeProps): JSX.Element {
  const [tables, setTables] = useState<string[]>([])
  const [currentQuery, setCurrentQuery] = useState<string>('')
  const [queryResults, setQueryResults] = useState<PgQueryResult | null>(null)

  const { draftFrame, handleResizePointerDown } = useNodeFrameResize({
    position,
    width,
    height,
    minSize: resolveCanonicalNodeMinSize('pgViewer'),
    onResize,
  })

  const renderedFrame = draftFrame ?? {
    position,
    size: { width, height },
  }

  const style = useMemo(
    () => ({
      width: renderedFrame.size.width,
      height: renderedFrame.size.height,
      transform:
        renderedFrame.position.x !== position.x || renderedFrame.position.y !== position.y
          ? `translate(${renderedFrame.position.x - position.x}px, ${renderedFrame.position.y - position.y}px)`
          : undefined,
    }),
    [
      position.x,
      position.y,
      renderedFrame.position.x,
      renderedFrame.position.y,
      renderedFrame.size.height,
      renderedFrame.size.width,
    ],
  )

  const handleConnect = useCallback(
    (result: { connectionId: string; tables: string[] }) => {
      setTables(result.tables)
      onConnectionChange({
        connectionId: result.connectionId,
        isConnected: true,
        host,
        port,
        database,
        user,
        activeTable: null,
        tables: result.tables,
      })
    },
    [onConnectionChange, host, port, database, user],
  )

  const handleDisconnect = useCallback(() => {
    if (connectionId) {
      void window.opencoveApi.pg.disconnect({ connectionId })
    }
    setTables([])
    setQueryResults(null)
    setCurrentQuery('')
    onConnectionChange({
      connectionId: null,
      isConnected: false,
      host,
      port,
      database,
      user,
      activeTable: null,
      tables: [],
    })
  }, [connectionId, onConnectionChange, host, port, database, user])

  const handleSelectTable = useCallback(
    (tableName: string) => {
      const query = `SELECT * FROM "${tableName}" LIMIT 100`
      setCurrentQuery(query)
      onConnectionChange({
        connectionId,
        isConnected: true,
        host,
        port,
        database,
        user,
        activeTable: tableName,
        tables,
      })
    },
    [connectionId, onConnectionChange, host, port, database, user, tables],
  )

  const handleResults = useCallback((results: PgQueryResult) => {
    setQueryResults(results)
  }, [])

  return (
    <div
      className="pg-viewer-node nowheel"
      style={style}
      onClickCapture={event => {
        if (event.button !== 0 || !(event.target instanceof Element)) {
          return
        }

        if (event.target.closest('.nodrag')) {
          return
        }

        event.stopPropagation()
        onInteractionStart?.({ shiftKey: event.shiftKey })
      }}
    >
      <div
        className="pg-viewer-node__header"
        data-node-drag-handle="true"
        onDoubleClick={event => {
          if (!(event.target instanceof Element) || event.target.closest('.nodrag')) return
          event.stopPropagation()
          onToggleMaximize?.()
        }}
      >
        {nodeNumber != null ? (
          <span className="pg-viewer-node__number">#{nodeNumber}</span>
        ) : null}
        <span className="pg-viewer-node__title">
          {isConnected && database ? `PostgreSQL - ${database}` : 'PostgreSQL'}
        </span>
        {isConnected ? (
          <button
            type="button"
            className="pg-viewer-node__disconnect nodrag"
            onClick={event => {
              event.stopPropagation()
              handleDisconnect()
            }}
          >
            Disconnect
          </button>
        ) : null}
        {onToggleMaximize ? (
          <button
            type="button"
            className="pg-viewer-node__maximize nodrag"
            aria-label={isMaximized ? 'Restore' : 'Maximize'}
            title={isMaximized ? 'Restore' : 'Maximize'}
            onClick={event => {
              event.stopPropagation()
              onToggleMaximize()
            }}
          >
            {isMaximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
        ) : null}
        <button
          type="button"
          className="pg-viewer-node__close nodrag"
          onClick={event => {
            event.stopPropagation()
            if (connectionId) {
              void window.opencoveApi.pg.disconnect({ connectionId })
            }
            onClose()
          }}
          aria-label="Close"
          title="Close"
        >
          x
        </button>
      </div>

      {!isConnected ? (
        <PgConnectionForm
          host={host}
          port={port}
          database={database}
          user={user}
          onConnect={handleConnect}
        />
      ) : (
        <div className="pg-viewer-node__connected">
          <PgTableList
            tables={tables}
            activeTable={activeTable}
            onSelectTable={handleSelectTable}
          />
          <div className="pg-viewer-node__main">
            <PgQueryEditor
              connectionId={connectionId ?? ''}
              initialQuery={currentQuery}
              onResults={handleResults}
            />
            <PgResultsTable results={queryResults} />
          </div>
        </div>
      )}

      <NodeResizeHandles
        classNamePrefix="task-node"
        testIdPrefix="pg-viewer-resizer"
        handleResizePointerDown={handleResizePointerDown}
      />
    </div>
  )
}
