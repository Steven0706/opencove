import React from 'react'
import { useReactFlow, type Edge, type Node } from '@xyflow/react'
import { ViewportMenuSurface } from '@app/renderer/components/ViewportMenuSurface'
import { Bot, ChevronDown, Layers, TerminalSquare } from 'lucide-react'
import { useTranslation } from '@app/renderer/i18n'
import type { TerminalNodeData, WorkspaceSpaceState } from '../../../types'
import { focusNodeInViewport } from '../helpers'
import { WorkspaceSpaceSwitcher } from './WorkspaceSpaceSwitcher'

interface WorkspaceCanvasTopOverlaysProps {
  spaces: WorkspaceSpaceState[]
  activateSpace: (spaceId: string) => void
  activateAllSpaces: () => void
  cancelSpaceRename: () => void
  nodes: Node<TerminalNodeData>[]
  selectedNodeCount: number
}

export function WorkspaceCanvasTopOverlays({
  spaces,
  activateSpace,
  activateAllSpaces,
  cancelSpaceRename,
  nodes,
  selectedNodeCount,
}: WorkspaceCanvasTopOverlaysProps): React.JSX.Element | null {
  const { t } = useTranslation()
  const reactFlow = useReactFlow<Node<TerminalNodeData>, Edge>()
  const [isMenuOpen, setIsMenuOpen] = React.useState(false)
  const triggerRef = React.useRef<HTMLButtonElement | null>(null)

  const navigableNodes = React.useMemo(
    () => nodes.filter(node => node.data.kind === 'terminal' || node.data.kind === 'agent'),
    [nodes],
  )

  const menuPlacement = React.useMemo(() => {
    if (!isMenuOpen) {
      return null
    }
    const rect = triggerRef.current?.getBoundingClientRect() ?? null
    return {
      type: 'point' as const,
      point: {
        x: rect?.left ?? 12,
        y: (rect?.bottom ?? 12) + 6,
      },
      estimatedSize: {
        width: 280,
        height: 320,
      },
    }
  }, [isMenuOpen])

  const handleSelectNode = React.useCallback(
    (nodeId: string) => {
      const node = reactFlow.getNode(nodeId)
      if (node) {
        focusNodeInViewport(reactFlow, node, { duration: 160, zoom: 1 })
      }
      setIsMenuOpen(false)
    },
    [reactFlow],
  )

  const hasAnyOverlay = selectedNodeCount > 0 || spaces.length > 0 || navigableNodes.length > 0

  if (!hasAnyOverlay) {
    return null
  }

  return (
    <div className="workspace-canvas__top-overlays">
      {spaces.length > 0 ? (
        <WorkspaceSpaceSwitcher
          spaces={spaces}
          activateSpace={activateSpace}
          activateAllSpaces={activateAllSpaces}
          cancelSpaceRename={cancelSpaceRename}
        />
      ) : null}

      {navigableNodes.length > 0 ? (
        <>
          <div
            className="workspace-node-navigator"
            onMouseDown={event => {
              event.stopPropagation()
            }}
            onClick={event => {
              event.stopPropagation()
            }}
          >
            <button
              ref={triggerRef}
              type="button"
              className={`workspace-node-navigator__trigger${isMenuOpen ? ' workspace-node-navigator__trigger--open' : ''}`}
              data-testid="workspace-node-navigator"
              aria-haspopup="menu"
              aria-expanded={isMenuOpen}
              onClick={() => {
                setIsMenuOpen(previous => !previous)
              }}
            >
              <Layers className="workspace-node-navigator__icon" aria-hidden="true" />
              <span className="workspace-node-navigator__label">
                {t('workspaceNodeNavigator.title', { count: navigableNodes.length })}
              </span>
              <ChevronDown
                className={`workspace-node-navigator__chevron${isMenuOpen ? ' workspace-node-navigator__chevron--open' : ''}`}
                aria-hidden="true"
              />
            </button>
          </div>

          {isMenuOpen && menuPlacement ? (
            <ViewportMenuSurface
              open={true}
              className="workspace-context-menu workspace-node-navigator__menu"
              data-testid="workspace-node-navigator-menu"
              placement={menuPlacement}
              role="menu"
              onDismiss={() => {
                setIsMenuOpen(false)
              }}
              dismissOnPointerDownOutside={true}
              dismissOnEscape={true}
              dismissIgnoreRefs={[triggerRef]}
            >
              {navigableNodes.map(node => {
                const isAgent = node.data.kind === 'agent'
                return (
                  <button
                    key={node.id}
                    type="button"
                    role="menuitem"
                    className="workspace-node-navigator__item"
                    onClick={() => {
                      handleSelectNode(node.id)
                    }}
                  >
                    <span className="workspace-node-navigator__item-icon" aria-hidden="true">
                      {isAgent ? <Bot size={14} /> : <TerminalSquare size={14} />}
                    </span>
                    <span className="workspace-node-navigator__item-title">
                      {node.data.title || (isAgent ? 'Agent' : 'Terminal')}
                    </span>
                    {isAgent && node.data.status ? (
                      <span
                        className={`workspace-node-navigator__item-status workspace-node-navigator__item-status--${node.data.status}`}
                      >
                        {node.data.status}
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </ViewportMenuSurface>
          ) : null}
        </>
      ) : null}

      {selectedNodeCount > 0 ? (
        <div className="workspace-selection-hint">
          {t('workspaceCanvas.selectionHint', { count: selectedNodeCount })}
        </div>
      ) : null}
    </div>
  )
}
