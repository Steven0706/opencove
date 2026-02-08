import type { Node } from '@xyflow/react'

export interface TerminalNodeData {
  sessionId: string
  title: string
  width: number
  height: number
}

export interface WorkspaceState {
  id: string
  name: string
  path: string
  nodes: Node<TerminalNodeData>[]
}

export interface Size {
  width: number
  height: number
}

export interface Point {
  x: number
  y: number
}
