import React, { useCallback, useEffect, useMemo, useState } from 'react'
import type { Node } from '@xyflow/react'
import type { AgentSettings } from '../../../../settings/agentConfig'
import type { TerminalNodeData, WorkspaceSpaceState } from '../../../types'
import type { CreateGitWorktreeBranchMode, GitWorktreeInfo } from '@shared/types/api'
import { SpaceWorktreeGuardWindow, type SpaceWorktreeGuardState } from './SpaceWorktreeGuardWindow'
import { SpaceWorktreeWindowDialog } from './SpaceWorktreeWindowDialog'
import {
  type BlockingNodesSnapshot,
  type BranchMode,
  getWorktreeApiMethod,
  isSafeWorktreeName,
  normalizeComparablePath,
  type PendingOperation,
  resolveWorktreePath,
  resolveWorktreesRoot,
  type SpaceWorktreeViewMode,
  type UpdateSpaceDirectoryOptions,
} from './spaceWorktree.shared'
import { useSpaceWorktreeGuardActions } from './useSpaceWorktreeGuardActions'
import { useSpaceWorktreePanelHandlers } from './useSpaceWorktreePanelHandlers'
import { useSpaceWorktreeRefresh } from './useSpaceWorktreeRefresh'
import { useSpaceWorktreeSuggestNames } from './useSpaceWorktreeSuggestNames'
import { toErrorMessage } from '../helpers'

export function SpaceWorktreeWindow({
  spaceId,
  spaces,
  nodes,
  workspacePath,
  worktreesRoot,
  agentSettings,
  onClose,
  onUpdateSpaceDirectory,
  getBlockingNodes,
  closeNodesById,
}: {
  spaceId: string | null
  spaces: WorkspaceSpaceState[]
  nodes: Node<TerminalNodeData>[]
  workspacePath: string
  worktreesRoot: string
  agentSettings: AgentSettings
  onClose: () => void
  onUpdateSpaceDirectory: (
    spaceId: string,
    directoryPath: string,
    options?: UpdateSpaceDirectoryOptions,
  ) => void
  getBlockingNodes: (spaceId: string) => BlockingNodesSnapshot
  closeNodesById: (nodeIds: string[]) => Promise<void>
}): React.JSX.Element | null {
  const space = useMemo(
    () => (spaceId ? (spaces.find(candidate => candidate.id === spaceId) ?? null) : null),
    [spaceId, spaces],
  )

  const [viewMode, setViewMode] = useState<SpaceWorktreeViewMode>('home')
  const [branches, setBranches] = useState<string[]>([])
  const [currentBranch, setCurrentBranch] = useState<string | null>(null)
  const [worktrees, setWorktrees] = useState<GitWorktreeInfo[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isMutating, setIsMutating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [selectedWorktreePath, setSelectedWorktreePath] = useState('')

  const [branchMode, setBranchMode] = useState<BranchMode>('new')
  const [newBranchName, setNewBranchName] = useState('')
  const [startPoint, setStartPoint] = useState('HEAD')
  const [existingBranchName, setExistingBranchName] = useState('')
  const [worktreeName, setWorktreeName] = useState('')
  const [isSuggesting, setIsSuggesting] = useState(false)
  const [removeWorktreeOnDetach, setRemoveWorktreeOnDetach] = useState(false)
  const [removeConfirmText, setRemoveConfirmText] = useState('')

  const [guard, setGuard] = useState<
    (SpaceWorktreeGuardState & { pending: PendingOperation; spaceId: string }) | null
  >(null)

  const resolvedWorktreesRoot = useMemo(
    () => resolveWorktreesRoot(workspacePath, worktreesRoot),
    [workspacePath, worktreesRoot],
  )

  const normalizedWorkspacePath = useMemo(
    () => normalizeComparablePath(workspacePath),
    [workspacePath],
  )

  const normalizedSpaceDirectory = useMemo(
    () => normalizeComparablePath(space?.directoryPath ?? workspacePath),
    [space?.directoryPath, workspacePath],
  )

  const isSpaceOnWorkspaceRoot = normalizedSpaceDirectory === normalizedWorkspacePath

  const currentWorktree = useMemo(
    () =>
      worktrees.find(entry => normalizeComparablePath(entry.path) === normalizedSpaceDirectory) ??
      null,
    [normalizedSpaceDirectory, worktrees],
  )

  const spaceTasks = useMemo(() => {
    if (!space) {
      return []
    }

    const spaceNodeIds = new Set(space.nodeIds)

    return nodes
      .filter(node => spaceNodeIds.has(node.id) && node.data.kind === 'task' && node.data.task)
      .map(node => ({
        title: node.data.title,
        requirement: node.data.task?.requirement ?? '',
      }))
  }, [nodes, space])

  const refresh = useSpaceWorktreeRefresh({
    workspacePath,
    setIsLoading,
    setError,
    setBranches,
    setCurrentBranch,
    setWorktrees,
    setSelectedWorktreePath,
    setExistingBranchName,
    setStartPoint,
  })

  const spaceIdentity = space?.id ?? null

  useEffect(() => {
    if (!spaceId || !space) {
      return
    }

    setViewMode('home')
    setBranches([])
    setCurrentBranch(null)
    setWorktrees([])
    setSelectedWorktreePath('')
    setBranchMode('new')
    setNewBranchName('')
    setStartPoint('HEAD')
    setExistingBranchName('')
    setWorktreeName('')
    setIsSuggesting(false)
    setIsMutating(false)
    setRemoveWorktreeOnDetach(false)
    setRemoveConfirmText('')
    setGuard(null)
    setError(null)

    void refresh({ preferredWorktreePath: space.directoryPath })
  }, [refresh, spaceId, spaceIdentity])

  const queueGuardIfNeeded = useCallback(
    (pending: PendingOperation, label: string): boolean => {
      if (!space) {
        return false
      }

      const blocking = getBlockingNodes(space.id)
      if (blocking.agentNodeIds.length === 0 && blocking.terminalNodeIds.length === 0) {
        return false
      }

      setGuard({
        spaceId: space.id,
        spaceName: space.name,
        agentCount: blocking.agentNodeIds.length,
        terminalCount: blocking.terminalNodeIds.length,
        pendingLabel: label,
        allowMarkMismatch: pending.kind !== 'detach-remove',
        isBusy: false,
        error: null,
        pending,
      })

      return true
    },
    [getBlockingNodes, space],
  )

  const executePendingOperation = useCallback(
    async (
      targetSpaceId: string,
      pending: PendingOperation,
      options?: UpdateSpaceDirectoryOptions,
    ) => {
      if (pending.kind === 'unbind') {
        onUpdateSpaceDirectory(targetSpaceId, workspacePath, options)
        setViewMode('home')
        setRemoveConfirmText('')
        setRemoveWorktreeOnDetach(false)
        return
      }

      if (pending.kind === 'bind') {
        onUpdateSpaceDirectory(targetSpaceId, pending.worktree.path, options)
        setViewMode('home')
        setRemoveConfirmText('')
        setRemoveWorktreeOnDetach(false)
        return
      }

      if (pending.kind === 'create') {
        const createWorktree = getWorktreeApiMethod('create')
        const created = await createWorktree({
          repoPath: workspacePath,
          worktreePath: pending.worktreePath,
          branchMode: pending.branchMode,
        })

        onUpdateSpaceDirectory(targetSpaceId, created.worktree.path, options)
        setSelectedWorktreePath(created.worktree.path)
        setRemoveConfirmText('')
        setRemoveWorktreeOnDetach(false)
        return
      }

      const removeWorktree = getWorktreeApiMethod('remove')
      await removeWorktree({
        repoPath: workspacePath,
        worktreePath: pending.worktreePath,
        force: pending.force,
      })

      onUpdateSpaceDirectory(targetSpaceId, workspacePath, options)
      setSelectedWorktreePath(workspacePath)
      setViewMode('home')
      setRemoveConfirmText('')
      setRemoveWorktreeOnDetach(false)
      await refresh({ preferredWorktreePath: workspacePath })
    },
    [onUpdateSpaceDirectory, refresh, workspacePath],
  )

  const runOperation = useCallback(
    async (pending: PendingOperation, label: string) => {
      if (!space) {
        return
      }

      setError(null)
      if (queueGuardIfNeeded(pending, label)) {
        return
      }

      setIsMutating(true)
      let shouldClose = false
      try {
        await executePendingOperation(space.id, pending)
        shouldClose = pending.kind === 'create'
      } catch (operationError) {
        setError(toErrorMessage(operationError))
      } finally {
        setIsMutating(false)
      }

      if (shouldClose) {
        onClose()
      }
    },
    [executePendingOperation, onClose, queueGuardIfNeeded, space],
  )

  const { applyPendingWithMismatch, applyPendingByClosingAll } = useSpaceWorktreeGuardActions({
    guard,
    setGuard,
    getBlockingNodes,
    closeNodesById,
    executePendingOperation,
    onClose,
  })

  const handleSuggestNames = useSpaceWorktreeSuggestNames({
    space,
    spaceNotes: '',
    spaceTasks,
    agentSettings,
    workspacePath,
    setIsSuggesting,
    setError,
    setNewBranchName,
    setWorktreeName,
  })

  const handleCreate = useCallback(async () => {
    if (!space) {
      return
    }

    if (!isSafeWorktreeName(worktreeName)) {
      setError('Worktree name must be a single directory name (no / or ..).')
      return
    }

    const branchModePayload: CreateGitWorktreeBranchMode =
      branchMode === 'existing'
        ? { kind: 'existing', name: existingBranchName.trim() }
        : {
            kind: 'new',
            name: newBranchName.trim(),
            startPoint: startPoint.trim().length > 0 ? startPoint.trim() : 'HEAD',
          }

    if (branchModePayload.name.length === 0) {
      setError('Branch name cannot be empty.')
      return
    }

    await runOperation(
      {
        kind: 'create',
        worktreePath: resolveWorktreePath(resolvedWorktreesRoot, worktreeName),
        branchMode: branchModePayload,
      },
      'Create & bind worktree',
    )
  }, [
    branchMode,
    existingBranchName,
    newBranchName,
    resolvedWorktreesRoot,
    runOperation,
    space,
    startPoint,
    worktreeName,
  ])

  const handleBind = useCallback(async () => {
    const selected = worktrees.find(entry => entry.path === selectedWorktreePath) ?? null
    if (!selected) {
      setError('Please select a worktree to switch.')
      return
    }

    await runOperation({ kind: 'bind', worktree: selected }, 'Switch worktree')
  }, [runOperation, selectedWorktreePath, worktrees])

  const handleDetachContinue = useCallback(async () => {
    if (!space) {
      return
    }

    if (isSpaceOnWorkspaceRoot) {
      setError('This Space is already using the workspace root.')
      return
    }

    if (removeWorktreeOnDetach) {
      setRemoveConfirmText('')
      setViewMode('detach-confirm')
      return
    }

    await runOperation({ kind: 'unbind' }, 'Detach worktree')
  }, [isSpaceOnWorkspaceRoot, removeWorktreeOnDetach, runOperation, space])

  const handleDetachRemoveConfirm = useCallback(async () => {
    if (!space) {
      return
    }

    if (removeConfirmText !== 'REMOVE') {
      return
    }

    await runOperation(
      {
        kind: 'detach-remove',
        worktreePath: space.directoryPath,
        force: false,
      },
      'Detach and remove worktree',
    )
  }, [removeConfirmText, runOperation, space])

  const currentDirectoryLabel = useMemo(() => {
    if (!space) {
      return ''
    }

    return isSpaceOnWorkspaceRoot ? 'Workspace root' : space.directoryPath
  }, [isSpaceOnWorkspaceRoot, space])

  const panelHandlers = useSpaceWorktreePanelHandlers({
    spaceDirectoryPath: space?.directoryPath ?? workspacePath,
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
  })

  const isBusy = isLoading || isMutating || isSuggesting

  if (!space) {
    return null
  }

  return (
    <>
      <SpaceWorktreeWindowDialog
        space={space}
        currentDirectoryLabel={currentDirectoryLabel}
        isSpaceOnWorkspaceRoot={isSpaceOnWorkspaceRoot}
        currentWorktree={currentWorktree}
        viewMode={viewMode}
        isBusy={isBusy}
        isMutating={isMutating}
        isSuggesting={isSuggesting}
        branches={branches}
        currentBranch={currentBranch}
        worktrees={worktrees}
        selectedWorktreePath={selectedWorktreePath}
        branchMode={branchMode}
        newBranchName={newBranchName}
        startPoint={startPoint}
        existingBranchName={existingBranchName}
        worktreeName={worktreeName}
        removeWorktreeOnDetach={removeWorktreeOnDetach}
        removeConfirmText={removeConfirmText}
        workspacePath={workspacePath}
        error={error}
        guardIsBusy={guard?.isBusy ?? false}
        onBackdropClose={onClose}
        onClose={onClose}
        onOpenSwitch={panelHandlers.onOpenSwitch}
        onOpenCreate={panelHandlers.onOpenCreate}
        onOpenDetach={panelHandlers.onOpenDetach}
        onBackHome={panelHandlers.onBackHome}
        onBackDetach={panelHandlers.onBackDetach}
        onSelectWorktreePath={panelHandlers.onSelectWorktreePath}
        onRefresh={panelHandlers.onRefresh}
        onBind={panelHandlers.onBind}
        onBranchModeChange={panelHandlers.onBranchModeChange}
        onNewBranchNameChange={panelHandlers.onNewBranchNameChange}
        onStartPointChange={panelHandlers.onStartPointChange}
        onExistingBranchNameChange={panelHandlers.onExistingBranchNameChange}
        onWorktreeNameChange={panelHandlers.onWorktreeNameChange}
        onSuggestNames={panelHandlers.onSuggestNames}
        onCreate={panelHandlers.onCreate}
        onRemoveWorktreeOnDetachChange={panelHandlers.onRemoveWorktreeOnDetachChange}
        onDetachContinue={panelHandlers.onDetachContinue}
        onRemoveConfirmTextChange={panelHandlers.onRemoveConfirmTextChange}
        onDetachRemoveConfirm={panelHandlers.onDetachRemoveConfirm}
      />

      <SpaceWorktreeGuardWindow
        guard={guard}
        onCancel={() => {
          if (guard?.isBusy) {
            return
          }

          setGuard(null)
        }}
        onMarkMismatchAndContinue={() => {
          void applyPendingWithMismatch()
        }}
        onCloseAllAndContinue={() => {
          void applyPendingByClosingAll()
        }}
      />
    </>
  )
}
