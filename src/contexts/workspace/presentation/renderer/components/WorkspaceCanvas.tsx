import React from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { WorkspaceCanvasInner } from './WorkspaceCanvasInner'
import { WhisperWidget } from '@contexts/whisper/presentation/renderer/components/WhisperWidget'
import { AdminPanel } from '@contexts/admin/presentation/renderer/components/AdminPanel'
import { useAdminPanelStore } from '@contexts/admin/presentation/renderer/store/useAdminPanelStore'
import { Bot } from 'lucide-react'
import type { WorkspaceCanvasProps } from './workspaceCanvas/types'

export function WorkspaceCanvas(props: WorkspaceCanvasProps): React.JSX.Element {
  const { isOpen: isAdminOpen, toggle: toggleAdmin, close: closeAdmin } = useAdminPanelStore()

  return (
    <ReactFlowProvider>
      <WorkspaceCanvasInner {...props} />
      <WhisperWidget />
      <button
        type="button"
        className="admin-toggle-btn"
        onClick={toggleAdmin}
        title="Admin Agent"
      >
        <Bot size={16} />
      </button>
      {isAdminOpen && <AdminPanel onClose={closeAdmin} />}
    </ReactFlowProvider>
  )
}
