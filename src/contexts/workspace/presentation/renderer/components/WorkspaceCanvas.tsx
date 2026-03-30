import React, { useState } from 'react'
import { ReactFlowProvider, useReactFlow } from '@xyflow/react'
import { WorkspaceCanvasInner } from './WorkspaceCanvasInner'
import { WhisperWidget } from '@contexts/whisper/presentation/renderer/components/WhisperWidget'
import { AdminPanel } from '@contexts/admin/presentation/renderer/components/AdminPanel'
import { useAdminPanelStore } from '@contexts/admin/presentation/renderer/store/useAdminPanelStore'
import { Bot, Plus, Minus, Maximize2 } from 'lucide-react'
import type { WorkspaceCanvasProps } from './workspaceCanvas/types'

function NavButton(): React.JSX.Element {
  const reactFlow = useReactFlow()
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className="canvas-toolbar__nav"
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      {expanded ? (
        <>
          <button type="button" className="canvas-toolbar__btn" onClick={() => reactFlow.zoomIn()} title="Zoom in"><Plus size={16} /></button>
          <button type="button" className="canvas-toolbar__btn" onClick={() => reactFlow.zoomOut()} title="Zoom out"><Minus size={16} /></button>
          <button type="button" className="canvas-toolbar__btn" onClick={() => reactFlow.fitView({ padding: 0.2 })} title="Fit view"><Maximize2 size={16} /></button>
        </>
      ) : (
        <button type="button" className="canvas-toolbar__btn" title="Navigation">
          <Maximize2 size={16} />
        </button>
      )}
    </div>
  )
}

export function WorkspaceCanvas(props: WorkspaceCanvasProps): React.JSX.Element {
  const { isOpen: isAdminOpen, toggle: toggleAdmin, close: closeAdmin } = useAdminPanelStore()

  return (
    <ReactFlowProvider>
      <WorkspaceCanvasInner {...props} />

      {/* CSS marker to hide minimap when admin panel is open */}
      {isAdminOpen && <style>{'.workspace-canvas .react-flow__minimap { display: none !important; }'}</style>}

      {/* Bottom-right toolbar: Whisper | Admin | Nav */}
      <div className="canvas-toolbar">
        <WhisperWidget />
        <button type="button" className="canvas-toolbar__btn" onClick={toggleAdmin} title="Admin Agent">
          <Bot size={16} />
        </button>
        <NavButton />
      </div>

      {isAdminOpen && <AdminPanel onClose={closeAdmin} />}
    </ReactFlowProvider>
  )
}
