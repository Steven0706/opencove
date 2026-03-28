import type { MutableRefObject, ReactElement } from 'react'
import { PgViewerNode } from '@contexts/pgViewer/presentation/renderer/components/PgViewerNode'
import type { NodeFrame, Point, TerminalNodeData } from '../../types'
import { useNodeMaximizeStore } from '../../store/useNodeMaximizeStore'

export function WorkspaceCanvasPgViewerNodeType({
  data,
  id,
  nodePosition,
  selectNode,
  closeNodeRef,
  resizeNodeRef,
  toggleMaximizeNodeRef,
  normalizeViewportForTerminalInteractionRef,
}: {
  data: TerminalNodeData
  id: string
  nodePosition: Point
  selectNode: (nodeId: string, options?: { toggle?: boolean }) => void
  closeNodeRef: MutableRefObject<(nodeId: string) => Promise<void>>
  resizeNodeRef: MutableRefObject<(nodeId: string, desiredFrame: NodeFrame) => void>
  toggleMaximizeNodeRef: MutableRefObject<(nodeId: string) => void>
  normalizeViewportForTerminalInteractionRef: MutableRefObject<(nodeId: string) => void>
}): ReactElement | null {
  const maximizedNodeId = useNodeMaximizeStore(state => state.maximizedNodeId)

  if (!data.pgViewer) {
    return null
  }

  return (
    <PgViewerNode
      host={data.pgViewer.host}
      port={data.pgViewer.port}
      database={data.pgViewer.database}
      user={data.pgViewer.user}
      isConnected={data.pgViewer.isConnected}
      connectionId={data.pgViewer.connectionId}
      activeTable={data.pgViewer.activeTable}
      nodeNumber={data.nodeNumber}
      isMaximized={maximizedNodeId === id}
      onToggleMaximize={() => toggleMaximizeNodeRef.current(id)}
      position={nodePosition}
      width={data.width}
      height={data.height}
      onClose={() => {
        void closeNodeRef.current(id)
      }}
      onResize={frame => resizeNodeRef.current(id, frame)}
      onConnectionChange={() => {
        // Connection state is managed locally within the PgViewerNode component
      }}
      onInteractionStart={options => {
        if (options?.selectNode !== false) {
          if (options?.shiftKey === true) {
            selectNode(id, { toggle: true })
            return
          }

          selectNode(id)
        }

        if (options?.normalizeViewport === false) {
          return
        }

        normalizeViewportForTerminalInteractionRef.current(id)
      }}
    />
  )
}
