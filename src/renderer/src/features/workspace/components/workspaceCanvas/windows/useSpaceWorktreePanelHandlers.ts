import { useMemo } from 'react'
import type { BranchMode } from './spaceWorktree.shared'

export function useSpaceWorktreePanelHandlers({
  spaceDirectoryPath,
  setError,
  setViewMode,
  setRemoveWorktreeOnDetach,
  setRemoveConfirmText,
  setSelectedWorktreePath,
  setBranchMode,
  setNewBranchName,
  setStartPoint,
  setExistingBranchName,
  setWorktreeName,
  refresh,
  handleBind,
  handleSuggestNames,
  handleCreate,
  handleDetachContinue,
  handleDetachRemoveConfirm,
}: {
  spaceDirectoryPath: string
  setError: React.Dispatch<React.SetStateAction<string | null>>
  setViewMode: React.Dispatch<
    React.SetStateAction<'home' | 'switch' | 'create' | 'detach' | 'detach-confirm'>
  >
  setRemoveWorktreeOnDetach: React.Dispatch<React.SetStateAction<boolean>>
  setRemoveConfirmText: React.Dispatch<React.SetStateAction<string>>
  setSelectedWorktreePath: React.Dispatch<React.SetStateAction<string>>
  setBranchMode: React.Dispatch<React.SetStateAction<BranchMode>>
  setNewBranchName: React.Dispatch<React.SetStateAction<string>>
  setStartPoint: React.Dispatch<React.SetStateAction<string>>
  setExistingBranchName: React.Dispatch<React.SetStateAction<string>>
  setWorktreeName: React.Dispatch<React.SetStateAction<string>>
  refresh: (options?: { preferredWorktreePath?: string }) => Promise<void>
  handleBind: () => Promise<void>
  handleSuggestNames: () => Promise<void>
  handleCreate: () => Promise<void>
  handleDetachContinue: () => Promise<void>
  handleDetachRemoveConfirm: () => Promise<void>
}): {
  onOpenSwitch: () => void
  onOpenCreate: () => void
  onOpenDetach: () => void
  onBackHome: () => void
  onBackDetach: () => void
  onSelectWorktreePath: (value: string) => void
  onRefresh: () => void
  onBind: () => void
  onBranchModeChange: (mode: BranchMode) => void
  onNewBranchNameChange: (value: string) => void
  onStartPointChange: (value: string) => void
  onExistingBranchNameChange: (value: string) => void
  onWorktreeNameChange: (value: string) => void
  onSuggestNames: () => void
  onCreate: () => void
  onRemoveWorktreeOnDetachChange: (checked: boolean) => void
  onDetachContinue: () => void
  onRemoveConfirmTextChange: (value: string) => void
  onDetachRemoveConfirm: () => void
} {
  return useMemo(
    () => ({
      onOpenSwitch: () => {
        setError(null)
        setViewMode('switch')
      },
      onOpenCreate: () => {
        setError(null)
        setViewMode('create')
      },
      onOpenDetach: () => {
        setError(null)
        setRemoveWorktreeOnDetach(false)
        setRemoveConfirmText('')
        setViewMode('detach')
      },
      onBackHome: () => {
        setViewMode('home')
        setError(null)
      },
      onBackDetach: () => {
        setViewMode('detach')
        setError(null)
      },
      onSelectWorktreePath: (value: string) => {
        setSelectedWorktreePath(value)
      },
      onRefresh: () => {
        void refresh({ preferredWorktreePath: spaceDirectoryPath })
      },
      onBind: () => {
        void handleBind()
      },
      onBranchModeChange: (mode: BranchMode) => {
        setBranchMode(mode)
        setError(null)
      },
      onNewBranchNameChange: (value: string) => {
        setNewBranchName(value)
        setError(null)
      },
      onStartPointChange: (value: string) => {
        setStartPoint(value)
        setError(null)
      },
      onExistingBranchNameChange: (value: string) => {
        setExistingBranchName(value)
        setError(null)
      },
      onWorktreeNameChange: (value: string) => {
        setWorktreeName(value)
        setError(null)
      },
      onSuggestNames: () => {
        void handleSuggestNames()
      },
      onCreate: () => {
        void handleCreate()
      },
      onRemoveWorktreeOnDetachChange: (checked: boolean) => {
        setRemoveWorktreeOnDetach(checked)
        setError(null)
      },
      onDetachContinue: () => {
        void handleDetachContinue()
      },
      onRemoveConfirmTextChange: (value: string) => {
        setRemoveConfirmText(value)
        setError(null)
      },
      onDetachRemoveConfirm: () => {
        void handleDetachRemoveConfirm()
      },
    }),
    [
      handleBind,
      handleCreate,
      handleDetachContinue,
      handleDetachRemoveConfirm,
      handleSuggestNames,
      refresh,
      setBranchMode,
      setError,
      setExistingBranchName,
      setNewBranchName,
      setRemoveConfirmText,
      setRemoveWorktreeOnDetach,
      setSelectedWorktreePath,
      setStartPoint,
      setViewMode,
      setWorktreeName,
      spaceDirectoryPath,
    ],
  )
}
