import { useMemo, useState } from 'react'
import { WorkspaceCanvas } from './features/workspace/components/WorkspaceCanvas'
import type { WorkspaceState } from './features/workspace/types'

function App(): JSX.Element {
  const [workspaces, setWorkspaces] = useState<WorkspaceState[]>([])
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null)

  const activeWorkspace = useMemo(
    () => workspaces.find(workspace => workspace.id === activeWorkspaceId) ?? null,
    [activeWorkspaceId, workspaces],
  )

  const handleAddWorkspace = async (): Promise<void> => {
    const selected = await window.coveApi.workspace.selectDirectory()
    if (!selected) {
      return
    }

    const existing = workspaces.find(workspace => workspace.path === selected.path)
    if (existing) {
      setActiveWorkspaceId(existing.id)
      return
    }

    const nextWorkspace: WorkspaceState = {
      ...selected,
      nodes: [],
    }

    setWorkspaces(prev => [...prev, nextWorkspace])
    setActiveWorkspaceId(nextWorkspace.id)
  }

  const handleWorkspaceNodesChange = (nodes: WorkspaceState['nodes']): void => {
    if (!activeWorkspace) {
      return
    }

    setWorkspaces(prev =>
      prev.map(workspace => {
        if (workspace.id !== activeWorkspace.id) {
          return workspace
        }

        return {
          ...workspace,
          nodes,
        }
      }),
    )
  }

  return (
    <div className="app-shell">
      <aside className="workspace-sidebar">
        <div className="workspace-sidebar__header">
          <h1>Workspaces</h1>
          <button type="button" onClick={() => void handleAddWorkspace()}>
            Add
          </button>
        </div>

        <div className="workspace-sidebar__list">
          {workspaces.length === 0 ? (
            <p className="workspace-sidebar__empty">No workspace yet.</p>
          ) : null}

          {workspaces.map(workspace => {
            const isActive = workspace.id === activeWorkspaceId
            return (
              <button
                type="button"
                key={workspace.id}
                className={`workspace-item ${isActive ? 'workspace-item--active' : ''}`}
                onClick={() => setActiveWorkspaceId(workspace.id)}
                title={workspace.path}
              >
                <span className="workspace-item__name">{workspace.name}</span>
                <span className="workspace-item__path">{workspace.path}</span>
                <span className="workspace-item__meta">{workspace.nodes.length} terminals</span>
              </button>
            )
          })}
        </div>
      </aside>

      <main className="workspace-main">
        {activeWorkspace ? (
          <WorkspaceCanvas
            workspacePath={activeWorkspace.path}
            nodes={activeWorkspace.nodes}
            onNodesChange={handleWorkspaceNodesChange}
          />
        ) : (
          <div className="workspace-empty-state">
            <h2>Add a workspace to start</h2>
            <p>Each workspace has its own infinite canvas and terminals.</p>
            <button type="button" onClick={() => void handleAddWorkspace()}>
              Add Workspace
            </button>
          </div>
        )}
      </main>
    </div>
  )
}

export default App
