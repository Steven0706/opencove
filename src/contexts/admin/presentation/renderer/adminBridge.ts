// Global bridge for Admin Agent to call workspace operations.
// These callbacks are set by WorkspaceCanvasInner and read by AdminPanel.

import type { Node } from '@xyflow/react'
import type { TerminalNodeData } from '@contexts/workspace/presentation/renderer/types'

export interface CreateAgentNodeParams {
  prompt: string
  profileName?: string
  profileEmoji?: string
}

export interface AdminBridge {
  getNodes?: () => Node<TerminalNodeData>[]
  createTerminalNode?: () => Promise<string | null>
  createAgentNode?: (params: CreateAgentNodeParams) => Promise<string | null>
  createNoteNode?: (text?: string) => string | null
  closeNode?: (nodeId: string) => Promise<void>
  toggleMaximizeNode?: (nodeId: string) => void
  focusNode?: (nodeId: string) => void
  updateNodeTitle?: (nodeId: string, title: string) => void
  updateNodeDescription?: (nodeId: string, description: string) => void
  createPgViewerNode?: () => string | null
  updatePgViewerConnection?: (nodeId: string, data: { host: string; port: number; database: string; user: string; connectionId: string | null; isConnected: boolean }) => void
  workspacePath?: string
}

export const adminBridge: AdminBridge = {}
