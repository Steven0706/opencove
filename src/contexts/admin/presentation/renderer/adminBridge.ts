// Global bridge for Admin Agent to call workspace operations.
// These callbacks are set by WorkspaceCanvasInner and read by AdminPanel.

import type { Node } from '@xyflow/react'
import type { TerminalNodeData } from '@contexts/workspace/presentation/renderer/types'

export interface AdminBridge {
  getNodes?: () => Node<TerminalNodeData>[]
  createTerminalNode?: () => Promise<string | null>
  createNoteNode?: (text?: string) => string | null
  closeNode?: (nodeId: string) => Promise<void>
  toggleMaximizeNode?: (nodeId: string) => void
  focusNode?: (nodeId: string) => void
}

export const adminBridge: AdminBridge = {}
