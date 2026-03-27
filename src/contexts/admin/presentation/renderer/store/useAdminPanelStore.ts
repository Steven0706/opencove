import { create } from 'zustand'

interface AdminPanelState {
  isOpen: boolean
  toggle: () => void
  open: () => void
  close: () => void
}

export const useAdminPanelStore = create<AdminPanelState>(set => ({
  isOpen: false,
  toggle: () => set(s => ({ isOpen: !s.isOpen })),
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}))
