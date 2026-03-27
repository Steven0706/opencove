import { create } from 'zustand'
import type { Point } from '../types'

interface PreviousFrame {
  nodeId: string
  position: Point
  width: number
  height: number
}

interface NodeMaximizeState {
  maximizedNodeId: string | null
  previousFrame: PreviousFrame | null
  setMaximized: (nodeId: string, previous: PreviousFrame) => void
  clearMaximized: () => void
}

export const useNodeMaximizeStore = create<NodeMaximizeState>(set => ({
  maximizedNodeId: null,
  previousFrame: null,
  setMaximized: (nodeId, previous) =>
    set({ maximizedNodeId: nodeId, previousFrame: previous }),
  clearMaximized: () => set({ maximizedNodeId: null, previousFrame: null }),
}))
