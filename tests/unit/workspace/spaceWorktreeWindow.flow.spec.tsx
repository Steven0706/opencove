import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Node } from '@xyflow/react'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_AGENT_SETTINGS } from '../../../src/renderer/src/features/settings/agentConfig'
import { SpaceWorktreeWindow } from '../../../src/renderer/src/features/workspace/components/workspaceCanvas/windows/SpaceWorktreeWindow'
import type {
  TerminalNodeData,
  WorkspaceSpaceState,
} from '../../../src/renderer/src/features/workspace/types'

function createNodes(): Node<TerminalNodeData>[] {
  return []
}

function createSpaces(directoryPath = '/repo/.cove/worktrees/space-1'): WorkspaceSpaceState[] {
  return [
    {
      id: 'space-1',
      name: 'Space 1',
      directoryPath,
      nodeIds: [],
      rect: null,
    },
  ]
}

describe('SpaceWorktreeWindow flow', () => {
  it('navigates between home and action views', async () => {
    const listBranches = vi.fn(async () => ({
      current: 'main',
      branches: ['main', 'feature/demo'],
    }))
    const listWorktrees = vi.fn(async () => ({
      worktrees: [
        { path: '/repo', head: 'abc', branch: 'main' },
        {
          path: '/repo/.cove/worktrees/space-1',
          head: 'def',
          branch: 'feature/demo',
        },
      ],
    }))

    Object.defineProperty(window, 'coveApi', {
      configurable: true,
      writable: true,
      value: {
        worktree: {
          listBranches,
          listWorktrees,
          suggestNames: vi.fn(async () => ({
            branchName: 'space/demo',
            worktreeName: 'demo',
            provider: 'codex',
            effectiveModel: 'gpt-5.2-codex',
          })),
          create: vi.fn(async () => ({
            worktree: {
              path: '/repo/.cove/worktrees/demo',
              head: null,
              branch: 'space/demo',
            },
          })),
          remove: vi.fn(async () => undefined),
        },
      },
    })

    render(
      <SpaceWorktreeWindow
        spaceId="space-1"
        spaces={createSpaces()}
        nodes={createNodes()}
        workspacePath="/repo"
        worktreesRoot=".cove/worktrees"
        agentSettings={DEFAULT_AGENT_SETTINGS}
        onClose={() => undefined}
        onUpdateSpaceDirectory={() => undefined}
        getBlockingNodes={() => ({ agentNodeIds: [], terminalNodeIds: [] })}
        closeNodesById={async () => undefined}
      />,
    )

    await waitFor(() => {
      expect(listBranches).toHaveBeenCalledTimes(1)
      expect(listWorktrees).toHaveBeenCalledTimes(1)
    })

    expect(screen.getByTestId('space-worktree-open-switch')).toBeVisible()
    expect(screen.queryByTestId('space-worktree-open-create')).not.toBeInTheDocument()
    expect(screen.getByTestId('space-worktree-open-detach')).toBeVisible()

    fireEvent.click(screen.getByTestId('space-worktree-open-switch'))
    expect(screen.getByTestId('space-worktree-switch-view')).toBeVisible()
    fireEvent.click(screen.getByTestId('space-worktree-back-home'))

    fireEvent.click(screen.getByTestId('space-worktree-open-detach'))
    expect(screen.getByTestId('space-worktree-detach-view')).toBeVisible()
  })

  it('shows create action when space is on workspace root', async () => {
    Object.defineProperty(window, 'coveApi', {
      configurable: true,
      writable: true,
      value: {
        worktree: {
          listBranches: vi.fn(async () => ({
            current: 'main',
            branches: ['main', 'feature/demo'],
          })),
          listWorktrees: vi.fn(async () => ({
            worktrees: [{ path: '/repo', head: 'abc', branch: 'main' }],
          })),
          suggestNames: vi.fn(async () => ({
            branchName: 'space/demo',
            worktreeName: 'demo',
            provider: 'codex',
            effectiveModel: 'gpt-5.2-codex',
          })),
          create: vi.fn(async () => ({
            worktree: {
              path: '/repo/.cove/worktrees/demo',
              head: null,
              branch: 'space/demo',
            },
          })),
          remove: vi.fn(async () => undefined),
        },
      },
    })

    render(
      <SpaceWorktreeWindow
        spaceId="space-1"
        spaces={createSpaces('/repo')}
        nodes={createNodes()}
        workspacePath="/repo"
        worktreesRoot=".cove/worktrees"
        agentSettings={DEFAULT_AGENT_SETTINGS}
        onClose={() => undefined}
        onUpdateSpaceDirectory={() => undefined}
        getBlockingNodes={() => ({ agentNodeIds: [], terminalNodeIds: [] })}
        closeNodesById={async () => undefined}
      />,
    )

    expect(await screen.findByTestId('space-worktree-open-switch')).toBeVisible()
    expect(screen.getByTestId('space-worktree-open-create')).toBeVisible()
    expect(screen.queryByTestId('space-worktree-open-detach')).not.toBeInTheDocument()
  })

  it('supports detach with optional worktree removal confirmation', async () => {
    const remove = vi.fn(async () => undefined)
    const onUpdateSpaceDirectory = vi.fn()

    Object.defineProperty(window, 'coveApi', {
      configurable: true,
      writable: true,
      value: {
        worktree: {
          listBranches: vi.fn(async () => ({
            current: 'main',
            branches: ['main', 'feature/demo'],
          })),
          listWorktrees: vi.fn(async () => ({
            worktrees: [
              {
                path: '/repo/.cove/worktrees/space-1',
                head: 'def',
                branch: 'feature/demo',
              },
            ],
          })),
          suggestNames: vi.fn(async () => ({
            branchName: 'space/demo',
            worktreeName: 'demo',
            provider: 'codex',
            effectiveModel: 'gpt-5.2-codex',
          })),
          create: vi.fn(async () => ({
            worktree: {
              path: '/repo/.cove/worktrees/demo',
              head: null,
              branch: 'space/demo',
            },
          })),
          remove,
        },
      },
    })

    render(
      <SpaceWorktreeWindow
        spaceId="space-1"
        spaces={createSpaces()}
        nodes={createNodes()}
        workspacePath="/repo"
        worktreesRoot=".cove/worktrees"
        agentSettings={DEFAULT_AGENT_SETTINGS}
        onClose={() => undefined}
        onUpdateSpaceDirectory={onUpdateSpaceDirectory}
        getBlockingNodes={() => ({ agentNodeIds: [], terminalNodeIds: [] })}
        closeNodesById={async () => undefined}
      />,
    )

    fireEvent.click(await screen.findByTestId('space-worktree-open-detach'))
    fireEvent.click(screen.getByTestId('space-worktree-detach-remove'))
    fireEvent.click(screen.getByTestId('space-worktree-detach-continue'))

    const confirmInput = await screen.findByTestId('space-worktree-remove-confirm-input')
    const confirmButton = screen.getByTestId('space-worktree-remove-confirm-submit')
    expect(confirmButton).toBeDisabled()

    fireEvent.change(confirmInput, { target: { value: 'remove' } })
    expect(confirmButton).toBeDisabled()

    fireEvent.change(confirmInput, { target: { value: 'REMOVE' } })
    expect(confirmButton).toBeEnabled()

    fireEvent.click(confirmButton)

    await waitFor(() => {
      expect(remove).toHaveBeenCalledWith({
        repoPath: '/repo',
        worktreePath: '/repo/.cove/worktrees/space-1',
        force: false,
      })
      expect(onUpdateSpaceDirectory).toHaveBeenCalledWith('space-1', '/repo', undefined)
    })
  })

  it('allows mark-mismatch path when detach is blocked by active windows', async () => {
    const onUpdateSpaceDirectory = vi.fn()
    const closeNodesById = vi.fn(async () => undefined)

    Object.defineProperty(window, 'coveApi', {
      configurable: true,
      writable: true,
      value: {
        worktree: {
          listBranches: vi.fn(async () => ({
            current: 'main',
            branches: ['main'],
          })),
          listWorktrees: vi.fn(async () => ({
            worktrees: [{ path: '/repo/.cove/worktrees/space-1', head: 'def', branch: 'main' }],
          })),
          suggestNames: vi.fn(async () => ({
            branchName: 'space/demo',
            worktreeName: 'demo',
            provider: 'codex',
            effectiveModel: 'gpt-5.2-codex',
          })),
          create: vi.fn(async () => ({
            worktree: { path: '/repo/.cove/worktrees/demo', head: null, branch: 'space/demo' },
          })),
          remove: vi.fn(async () => undefined),
        },
      },
    })

    render(
      <SpaceWorktreeWindow
        spaceId="space-1"
        spaces={createSpaces()}
        nodes={createNodes()}
        workspacePath="/repo"
        worktreesRoot=".cove/worktrees"
        agentSettings={DEFAULT_AGENT_SETTINGS}
        onClose={() => undefined}
        onUpdateSpaceDirectory={onUpdateSpaceDirectory}
        getBlockingNodes={() => ({ agentNodeIds: ['agent-1'], terminalNodeIds: ['terminal-1'] })}
        closeNodesById={closeNodesById}
      />,
    )

    fireEvent.click(await screen.findByTestId('space-worktree-open-detach'))
    fireEvent.click(screen.getByTestId('space-worktree-detach-continue'))
    expect(await screen.findByTestId('space-worktree-guard')).toBeVisible()
    expect(screen.getByTestId('space-worktree-guard-mark-mismatch')).toBeVisible()

    fireEvent.click(screen.getByTestId('space-worktree-guard-mark-mismatch'))

    await waitFor(() => {
      expect(onUpdateSpaceDirectory).toHaveBeenCalledWith('space-1', '/repo', {
        markNodeDirectoryMismatch: true,
      })
    })
    expect(closeNodesById).not.toHaveBeenCalled()
  })

  it('forces close-all path when deleting worktree with active windows', async () => {
    const remove = vi.fn(async () => undefined)
    const onUpdateSpaceDirectory = vi.fn()
    const closeNodesById = vi.fn(async () => undefined)
    const getBlockingNodes = vi
      .fn()
      .mockReturnValueOnce({ agentNodeIds: ['agent-1'], terminalNodeIds: ['terminal-1'] })
      .mockReturnValueOnce({ agentNodeIds: ['agent-1'], terminalNodeIds: ['terminal-1'] })
      .mockReturnValueOnce({ agentNodeIds: [], terminalNodeIds: [] })

    Object.defineProperty(window, 'coveApi', {
      configurable: true,
      writable: true,
      value: {
        worktree: {
          listBranches: vi.fn(async () => ({
            current: 'main',
            branches: ['main'],
          })),
          listWorktrees: vi.fn(async () => ({
            worktrees: [{ path: '/repo/.cove/worktrees/space-1', head: 'def', branch: 'main' }],
          })),
          suggestNames: vi.fn(async () => ({
            branchName: 'space/demo',
            worktreeName: 'demo',
            provider: 'codex',
            effectiveModel: 'gpt-5.2-codex',
          })),
          create: vi.fn(async () => ({
            worktree: { path: '/repo/.cove/worktrees/demo', head: null, branch: 'space/demo' },
          })),
          remove,
        },
      },
    })

    render(
      <SpaceWorktreeWindow
        spaceId="space-1"
        spaces={createSpaces()}
        nodes={createNodes()}
        workspacePath="/repo"
        worktreesRoot=".cove/worktrees"
        agentSettings={DEFAULT_AGENT_SETTINGS}
        onClose={() => undefined}
        onUpdateSpaceDirectory={onUpdateSpaceDirectory}
        getBlockingNodes={getBlockingNodes}
        closeNodesById={closeNodesById}
      />,
    )

    fireEvent.click(await screen.findByTestId('space-worktree-open-detach'))
    fireEvent.click(screen.getByTestId('space-worktree-detach-remove'))
    fireEvent.click(screen.getByTestId('space-worktree-detach-continue'))
    fireEvent.change(await screen.findByTestId('space-worktree-remove-confirm-input'), {
      target: { value: 'REMOVE' },
    })
    fireEvent.click(screen.getByTestId('space-worktree-remove-confirm-submit'))

    expect(await screen.findByTestId('space-worktree-guard')).toBeVisible()
    expect(screen.queryByTestId('space-worktree-guard-mark-mismatch')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('space-worktree-guard-close-all'))

    await waitFor(() => {
      expect(closeNodesById).toHaveBeenCalledWith(['agent-1', 'terminal-1'])
      expect(remove).toHaveBeenCalledWith({
        repoPath: '/repo',
        worktreePath: '/repo/.cove/worktrees/space-1',
        force: false,
      })
      expect(onUpdateSpaceDirectory).toHaveBeenCalledWith('space-1', '/repo', undefined)
    })
  })

  it('shows actionable error when worktree remove API is unavailable', async () => {
    const onUpdateSpaceDirectory = vi.fn()

    Object.defineProperty(window, 'coveApi', {
      configurable: true,
      writable: true,
      value: {
        worktree: {
          listBranches: vi.fn(async () => ({
            current: 'main',
            branches: ['main'],
          })),
          listWorktrees: vi.fn(async () => ({
            worktrees: [{ path: '/repo/.cove/worktrees/space-1', head: 'def', branch: 'main' }],
          })),
          suggestNames: vi.fn(async () => ({
            branchName: 'space/demo',
            worktreeName: 'demo',
            provider: 'codex',
            effectiveModel: 'gpt-5.2-codex',
          })),
          create: vi.fn(async () => ({
            worktree: { path: '/repo/.cove/worktrees/demo', head: null, branch: 'space/demo' },
          })),
        },
      },
    })

    render(
      <SpaceWorktreeWindow
        spaceId="space-1"
        spaces={createSpaces()}
        nodes={createNodes()}
        workspacePath="/repo"
        worktreesRoot=".cove/worktrees"
        agentSettings={DEFAULT_AGENT_SETTINGS}
        onClose={() => undefined}
        onUpdateSpaceDirectory={onUpdateSpaceDirectory}
        getBlockingNodes={() => ({ agentNodeIds: [], terminalNodeIds: [] })}
        closeNodesById={async () => undefined}
      />,
    )

    fireEvent.click(await screen.findByTestId('space-worktree-open-detach'))
    fireEvent.click(screen.getByTestId('space-worktree-detach-remove'))
    fireEvent.click(screen.getByTestId('space-worktree-detach-continue'))
    fireEvent.change(await screen.findByTestId('space-worktree-remove-confirm-input'), {
      target: { value: 'REMOVE' },
    })
    fireEvent.click(screen.getByTestId('space-worktree-remove-confirm-submit'))

    expect(
      await screen.findByText('Worktree API is unavailable. Please restart Cove and try again.'),
    ).toBeVisible()
    expect(onUpdateSpaceDirectory).not.toHaveBeenCalled()
  })

  it('shows actionable error when worktree listing API is unavailable', async () => {
    Object.defineProperty(window, 'coveApi', {
      configurable: true,
      writable: true,
      value: {
        worktree: {
          listWorktrees: vi.fn(async () => ({
            worktrees: [{ path: '/repo/.cove/worktrees/space-1', head: 'def', branch: 'main' }],
          })),
          suggestNames: vi.fn(async () => ({
            branchName: 'space/demo',
            worktreeName: 'demo',
            provider: 'codex',
            effectiveModel: 'gpt-5.2-codex',
          })),
          create: vi.fn(async () => ({
            worktree: { path: '/repo/.cove/worktrees/demo', head: null, branch: 'space/demo' },
          })),
          remove: vi.fn(async () => undefined),
        },
      },
    })

    render(
      <SpaceWorktreeWindow
        spaceId="space-1"
        spaces={createSpaces()}
        nodes={createNodes()}
        workspacePath="/repo"
        worktreesRoot=".cove/worktrees"
        agentSettings={DEFAULT_AGENT_SETTINGS}
        onClose={() => undefined}
        onUpdateSpaceDirectory={() => undefined}
        getBlockingNodes={() => ({ agentNodeIds: [], terminalNodeIds: [] })}
        closeNodesById={async () => undefined}
      />,
    )

    expect(
      await screen.findByText(
        'Failed to load worktree info: Worktree API is unavailable. Please restart Cove and try again.',
      ),
    ).toBeVisible()
  })
})
