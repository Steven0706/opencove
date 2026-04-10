import React from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { WorkspaceCanvasInner } from './WorkspaceCanvasInner'
import type { WorkspaceCanvasProps } from './workspaceCanvas/types'
import { WhisperWidget } from '@contexts/whisper/presentation/renderer/components/WhisperWidget'

function WorkspaceCanvasComponent(props: WorkspaceCanvasProps): React.JSX.Element {
  return (
    <ReactFlowProvider>
      <WorkspaceCanvasInner {...props} />
      <WhisperWidget />
    </ReactFlowProvider>
  )
}

export const WorkspaceCanvas = React.memo(WorkspaceCanvasComponent)
