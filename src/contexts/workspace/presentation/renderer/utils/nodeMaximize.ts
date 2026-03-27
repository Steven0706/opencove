import type { ReactFlowInstance, Node } from '@xyflow/react'
import type { TerminalNodeData } from '../types'
import { useNodeMaximizeStore } from '../store/useNodeMaximizeStore'

const MAXIMIZE_PADDING = 24

export function maximizeNode(
  reactFlow: ReactFlowInstance<Node<TerminalNodeData>>,
  nodeId: string,
  setNodes: (updater: (nodes: Node<TerminalNodeData>[]) => Node<TerminalNodeData>[]) => void,
): void {
  const store = useNodeMaximizeStore.getState()

  if (store.maximizedNodeId === nodeId) {
    restoreNode(setNodes)
    return
  }

  if (store.maximizedNodeId !== null) {
    restoreNode(setNodes)
  }

  const node = reactFlow.getNode(nodeId)
  if (!node) return

  store.setMaximized(nodeId, {
    nodeId,
    position: { x: node.position.x, y: node.position.y },
    width: node.data.width,
    height: node.data.height,
  })

  const viewport = reactFlow.getViewport()
  const topLeft = reactFlow.screenToFlowPosition({ x: MAXIMIZE_PADDING, y: MAXIMIZE_PADDING })
  const bottomRight = reactFlow.screenToFlowPosition({
    x: window.innerWidth - MAXIMIZE_PADDING,
    y: window.innerHeight - MAXIMIZE_PADDING,
  })

  const newWidth = Math.round(bottomRight.x - topLeft.x)
  const newHeight = Math.round(bottomRight.y - topLeft.y)

  setNodes(nodes =>
    nodes.map(n => {
      if (n.id !== nodeId) return n
      return {
        ...n,
        position: { x: topLeft.x, y: topLeft.y },
        data: {
          ...n.data,
          width: newWidth,
          height: newHeight,
        },
      }
    }),
  )

  reactFlow.setViewport(
    {
      x: -topLeft.x * viewport.zoom + MAXIMIZE_PADDING,
      y: -topLeft.y * viewport.zoom + MAXIMIZE_PADDING,
      zoom: viewport.zoom,
    },
    { duration: 120 },
  )
}

export function restoreNode(
  setNodes: (updater: (nodes: Node<TerminalNodeData>[]) => Node<TerminalNodeData>[]) => void,
): void {
  const store = useNodeMaximizeStore.getState()
  const prev = store.previousFrame
  if (!prev) return

  setNodes(nodes =>
    nodes.map(n => {
      if (n.id !== prev.nodeId) return n
      return {
        ...n,
        position: { x: prev.position.x, y: prev.position.y },
        data: {
          ...n.data,
          width: prev.width,
          height: prev.height,
        },
      }
    }),
  )

  store.clearMaximized()
}

export function isNodeMaximized(nodeId: string): boolean {
  return useNodeMaximizeStore.getState().maximizedNodeId === nodeId
}
