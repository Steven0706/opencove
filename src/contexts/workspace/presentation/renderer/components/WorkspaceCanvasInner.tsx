import React, { useEffect } from 'react'
import { useReactFlow, type Edge, type Node } from '@xyflow/react'
import type { TerminalNodeData } from '../types'
import * as workspaceCanvasHooks from './workspaceCanvas/hooks'
import { WorkspaceCanvasView } from './workspaceCanvas/WorkspaceCanvasView'
import type { WorkspaceCanvasProps } from './workspaceCanvas/types'
import { adminBridge } from '@contexts/admin/presentation/renderer/adminBridge'
import { maximizeNode } from '../utils/nodeMaximize'
import { createTerminalNodeAtFlowPosition } from './workspaceCanvas/hooks/useInteractions.paneNodeCreation'
import {
  resolveDefaultTerminalWindowSize,
  resolveDefaultAgentWindowSize,
} from './workspaceCanvas/constants'
import { resolveNodePlacementAnchorFromViewportCenter } from './workspaceCanvas/helpers'
import { resolveAgentModel } from '@contexts/settings/domain/agentSettings'
import { clearResumeSessionBinding } from '@contexts/agent/domain/agentResumeBinding'
export function WorkspaceCanvasInner({
  workspaceId,
  onShowMessage,
  workspacePath,
  worktreesRoot,
  nodes,
  onNodesChange,
  onRequestPersistFlush,
  spaces,
  activeSpaceId,
  onSpacesChange,
  onActiveSpaceChange,
  shortcutsEnabled = true,
  onAppendSpaceArchiveRecord,
  viewport,
  isMinimapVisible: persistedMinimapVisible,
  onViewportChange,
  onMinimapVisibilityChange,
  agentSettings,
  isFocusNodeTargetZoomPreviewing = false,
  focusNodeId,
  focusSequence,
}: WorkspaceCanvasProps): React.JSX.Element {
  const reactFlow = useReactFlow<Node<TerminalNodeData>, Edge>()
  const {
    nodeDragPointerAnchorRef,
    nodeSpaceFramePreview,
    nodeSpaceFramePreviewRef,
    setNodeSpaceFramePreview,
  } = workspaceCanvasHooks.useWorkspaceCanvasNodeDragPreviewState(workspaceId)

  const canvasState = workspaceCanvasHooks.useWorkspaceCanvasState({
    nodes,
    spaces,
    viewport,
    persistedMinimapVisible,
  })
  const exclusiveNodeDragAnchorIdRef =
    workspaceCanvasHooks.useWorkspaceCanvasWorkspaceReset(workspaceId)
  const actionRefs = workspaceCanvasHooks.useWorkspaceCanvasActionRefs()
  const idsRef = canvasState.selectedNodeIdsRef
  const nodeStore = workspaceCanvasHooks.useWorkspaceCanvasNodesStore({
    nodes: canvasState.flowNodes,
    spacesRef: canvasState.spacesRef,
    onNodesChange,
    onSpacesChange,
    onRequestPersistFlush,
    onShowMessage,
    standardWindowSizeBucket: agentSettings.standardWindowSizeBucket,
  })
  const { updateSpaceDirectory, getSpaceBlockingNodes, closeNodesById } =
    workspaceCanvasHooks.useWorkspaceCanvasSpaceDirectoryOps({
      workspacePath,
      spacesRef: canvasState.spacesRef,
      nodesRef: nodeStore.nodesRef,
      setNodes: nodeStore.setNodes,
      onSpacesChange,
      onRequestPersistFlush,
      closeNode: nodeStore.closeNode,
    })
  const {
    editingSpaceId,
    spaceRenameDraft,
    setSpaceRenameDraft,
    spaceRenameInputRef,
    startSpaceRename,
    cancelSpaceRename,
    commitSpaceRename,
    setSpaceLabelColor,
    createSpaceFromSelectedNodes,
    spaceVisuals,
    activateSpace,
    activateAllSpaces,
  } = workspaceCanvasHooks.useWorkspaceCanvasSpaces({
    workspaceId,
    activeSpaceId,
    onActiveSpaceChange,
    workspacePath,
    reactFlow,
    nodes: canvasState.flowNodes,
    nodesRef: nodeStore.nodesRef,
    setNodes: nodeStore.setNodes,
    spaces,
    spacesRef: canvasState.spacesRef,
    selectedNodeIds: canvasState.selectedNodeIds,
    selectedNodeIdsRef: canvasState.selectedNodeIdsRef,
    onSpacesChange,
    onRequestPersistFlush,
    setContextMenu: canvasState.setContextMenu,
    setEmptySelectionPrompt: canvasState.setEmptySelectionPrompt,
    onShowMessage,
  })
  const { spaceFramePreview, handleSpaceDragHandlePointerDown } =
    workspaceCanvasHooks.useWorkspaceCanvasSpaceDrag({
      workspaceId,
      reactFlow,
      nodesRef: nodeStore.nodesRef,
      spacesRef: canvasState.spacesRef,
      selectedNodeIdsRef: canvasState.selectedNodeIdsRef,
      selectedSpaceIdsRef: canvasState.selectedSpaceIdsRef,
      setNodes: nodeStore.setNodes,
      onSpacesChange,
      setSelectedNodeIds: canvasState.setSelectedNodeIds,
      setSelectedSpaceIds: canvasState.setSelectedSpaceIds,
      magneticSnappingEnabledRef: canvasState.magneticSnappingEnabledRef,
      setSnapGuides: canvasState.setSnapGuides,
      onRequestPersistFlush,
      setContextMenu: canvasState.setContextMenu,
      cancelSpaceRename,
      setEmptySelectionPrompt: canvasState.setEmptySelectionPrompt,
    })
  const {
    handleNodeDragStart,
    handleSelectionDragStart,
    handleNodeDragStop,
    handleSelectionDragStop,
    spaceWorktreeMismatchDropWarning,
    cancelSpaceWorktreeMismatchDropWarning,
    continueSpaceWorktreeMismatchDropWarning,
  } = workspaceCanvasHooks.useWorkspaceCanvasSpaceOwnership({
    workspacePath,
    reactFlow,
    spacesRef: canvasState.spacesRef,
    selectedNodeIdsRef: canvasState.selectedNodeIdsRef,
    setSelectedNodeIds: canvasState.setSelectedNodeIds,
    selectedSpaceIdsRef: canvasState.selectedSpaceIdsRef,
    setSelectedSpaceIds: canvasState.setSelectedSpaceIds,
    dragSelectedSpaceIdsRef: canvasState.dragSelectedSpaceIdsRef,
    exclusiveNodeDragAnchorIdRef,
    setNodes: nodeStore.setNodes,
    onSpacesChange,
    onRequestPersistFlush,
    onShowMessage,
    hideWorktreeMismatchDropWarning: agentSettings.hideWorktreeMismatchDropWarning === true,
    nodeDragPointerAnchorRef,
    nodeSpaceFramePreviewRef,
  })
  const {
    buildAgentNodeTitle,
    launchAgentInNode,
    openAgentLauncher,
    openAgentLauncherForProvider,
  } = workspaceCanvasHooks.useWorkspaceCanvasAgentSupport({
    nodesRef: nodeStore.nodesRef,
    setNodes: nodeStore.setNodes,
    bumpAgentLaunchToken: nodeStore.bumpAgentLaunchToken,
    isAgentLaunchTokenCurrent: nodeStore.isAgentLaunchTokenCurrent,
    agentSettings,
    workspacePath,
    spacesRef: canvasState.spacesRef,
    onSpacesChange,
    onRequestPersistFlush,
    onShowMessage,
    contextMenu: canvasState.contextMenu,
    setContextMenu: canvasState.setContextMenu,
    createNodeForSession: nodeStore.createNodeForSession,
    standardWindowSizeBucket: agentSettings.standardWindowSizeBucket,
  })
  const {
    taskTagOptions,
    taskCreator,
    setTaskCreator,
    openTaskCreator,
    closeTaskCreator,
    generateTaskTitle,
    createTask,
    taskEditor,
    setTaskEditor,
    closeTaskEditor,
    generateTaskEditorTitle,
    saveTaskEdits,
    nodeDeleteConfirmation,
    setNodeDeleteConfirmation,
    confirmNodeDelete,
    requestNodeClose,
  } = workspaceCanvasHooks.useWorkspaceCanvasTaskUi({
    agentTaskTagOptions: agentSettings.taskTagOptions,
    contextMenu: canvasState.contextMenu,
    setContextMenu: canvasState.setContextMenu,
    nodesRef: nodeStore.nodesRef,
    setNodes: nodeStore.setNodes,
    spacesRef: canvasState.spacesRef,
    onSpacesChange,
    onRequestPersistFlush,
    createNodeForSession: nodeStore.createNodeForSession,
    buildAgentNodeTitle,
    launchAgentInNode,
    agentSettings,
    workspacePath,
    standardWindowSizeBucket: agentSettings.standardWindowSizeBucket,
    createTaskNode: nodeStore.createTaskNode,
    closeNode: nodeStore.closeNode,
    actionRefs,
  })
  const {
    resolvedCanvasInputMode,
    isTrackpadCanvasMode,
    useManualCanvasWheelGestures,
    handleCanvasWheelCapture,
  } = workspaceCanvasHooks.useWorkspaceCanvasInputMode({
    canvasInputModeSetting: agentSettings.canvasInputMode,
    detectedCanvasInputMode: canvasState.detectedCanvasInputMode,
    inputModalityStateRef: canvasState.inputModalityStateRef,
    setDetectedCanvasInputMode: canvasState.setDetectedCanvasInputMode,
    canvasRef: canvasState.canvasRef,
    trackpadGestureLockRef: canvasState.trackpadGestureLockRef,
    viewportRef: canvasState.viewportRef,
    reactFlow,
    onViewportChange,
  })
  workspaceCanvasHooks.useWorkspaceCanvasLifecycleBindings({
    workspaceId,
    persistedMinimapVisible,
    canvasState,
    cancelSpaceRename,
    reactFlow,
    viewport,
    agentSettings,
    focusNodeId,
    focusSequence,
    isFocusNodeTargetZoomPreviewing,
    nodesRef: nodeStore.nodesRef,
    requestNodeDeleteRef: actionRefs.requestNodeDeleteRef,
  })
  const nodeTypes = workspaceCanvasHooks.useWorkspaceCanvasComposedNodeTypes({
    setNodes: nodeStore.setNodes,
    setSelectedNodeIds: canvasState.setSelectedNodeIds,
    setSelectedSpaceIds: canvasState.setSelectedSpaceIds,
    selectedNodeIdsRef: canvasState.selectedNodeIdsRef,
    selectedSpaceIdsRef: canvasState.selectedSpaceIdsRef,
    spacesRef: canvasState.spacesRef,
    workspacePath,
    agentSettings,
    actionRefs,
  })
  const {
    clearNodeSelection,
    handleNodeClick,
    handleSelectionContextMenu,
    handleNodeContextMenu,
    handlePaneContextMenu,
    handleSelectionChange,
    handleCanvasPointerDownCapture,
    handleCanvasPointerMoveCapture,
    handleCanvasPointerUpCapture,
    handleCanvasDoubleClickCapture,
    handlePaneClick,
    createTerminalNode,
    createNoteNodeFromContextMenu,
    createPgViewerNodeFromContextMenu,
    handleCanvasPaste,
    handleCanvasDragOver,
    handleCanvasDrop,
  } = workspaceCanvasHooks.useWorkspaceCanvasInteractions({
    canvasRef: canvasState.canvasRef,
    isTrackpadCanvasMode,
    focusNodeOnClick: agentSettings.focusNodeOnClick,
    focusNodeTargetZoom: agentSettings.focusNodeTargetZoom,
    isShiftPressedRef: canvasState.isShiftPressedRef,
    selectionDraftRef: canvasState.selectionDraftRef,
    setSelectionDraftUi: canvasState.setSelectionDraftUi,
    reactFlow,
    setNodes: nodeStore.setNodes,
    setSelectedNodeIds: canvasState.setSelectedNodeIds,
    setSelectedSpaceIds: canvasState.setSelectedSpaceIds,
    setContextMenu: canvasState.setContextMenu,
    setEmptySelectionPrompt: canvasState.setEmptySelectionPrompt,
    cancelSpaceRename,
    selectedNodeIdsRef: canvasState.selectedNodeIdsRef,
    selectedSpaceIdsRef: canvasState.selectedSpaceIdsRef,
    contextMenu: canvasState.contextMenu,
    workspacePath,
    defaultTerminalProfileId: agentSettings.defaultTerminalProfileId,
    spacesRef: canvasState.spacesRef,
    onSpacesChange,
    nodesRef: nodeStore.nodesRef,
    standardWindowSizeBucket: agentSettings.standardWindowSizeBucket,
    createNodeForSession: nodeStore.createNodeForSession,
    createNoteNode: nodeStore.createNoteNode,
    createPgViewerNode: nodeStore.createPgViewerNode,
    onShowMessage,
    createImageNode: nodeStore.createImageNode,
  })
  workspaceCanvasHooks.useWorkspaceCanvasShortcutActions({
    enabled: shortcutsEnabled,
    activeSpaceId,
    spaces,
    agentSettings,
    workspacePath,
    canvasRef: canvasState.canvasRef,
    setContextMenu: canvasState.setContextMenu,
    setEmptySelectionPrompt: canvasState.setEmptySelectionPrompt,
    cancelSpaceRename,
    reactFlow,
    spacesRef: canvasState.spacesRef,
    nodesRef: nodeStore.nodesRef,
    setNodes: nodeStore.setNodes,
    onSpacesChange,
    createNodeForSession: nodeStore.createNodeForSession,
    createNoteNode: nodeStore.createNoteNode,
    createSpaceFromSelectedNodes,
    activateSpace,
  })
  const {
    canConvertSelectedNoteToTask,
    isConvertSelectedNoteToTaskDisabled,
    convertSelectedNoteToTask,
    arrangeAll,
    arrangeCanvas,
    arrangeInSpace,
  } = workspaceCanvasHooks.useWorkspaceCanvasMenuActions({
    selectedNodeIds: canvasState.selectedNodeIds,
    selectedNodeIdsRef: canvasState.selectedNodeIdsRef,
    flowNodes: canvasState.flowNodes,
    nodesRef: nodeStore.nodesRef,
    setNodes: nodeStore.setNodes,
    onRequestPersistFlush,
    onShowMessage,
    setContextMenu: canvasState.setContextMenu,
    reactFlow,
    spacesRef: canvasState.spacesRef,
    onSpacesChange,
    standardWindowSizeBucket: agentSettings.standardWindowSizeBucket,
  })
  workspaceCanvasHooks.useWorkspaceCanvasRuntimeBindings({
    setNodes: nodeStore.setNodes,
    onRequestPersistFlush,
    actionRefs,
    clearNodeSelection,
    closeNode: requestNodeClose,
    resizeNode: nodeStore.resizeNode,
    updateNoteText: nodeStore.updateNoteText,
    updateNodeScrollback: nodeStore.updateNodeScrollback,
    updateTerminalTitle: nodeStore.updateTerminalTitle,
    renameTerminalTitle: nodeStore.renameTerminalTitle,
    focusNodeOnClick: agentSettings.focusNodeOnClick,
    focusNodeTargetZoom: agentSettings.focusNodeTargetZoom,
    nodesRef: nodeStore.nodesRef,
    reactFlow,
    onShowMessage,
  })
  const applyChanges = workspaceCanvasHooks.useWorkspaceCanvasApplyNodeChanges({
    nodesRef: nodeStore.nodesRef,
    onNodesChange,
    clearAgentLaunchToken: nodeStore.clearAgentLaunchToken,
    normalizePosition: nodeStore.normalizePosition,
    applyPendingScrollbacks: nodeStore.applyPendingScrollbacks,
    isNodeDraggingRef: nodeStore.isNodeDraggingRef,
    spacesRef: canvasState.spacesRef,
    selectedSpaceIdsRef: canvasState.selectedSpaceIdsRef,
    dragSelectedSpaceIdsRef: canvasState.dragSelectedSpaceIdsRef,
    magneticSnappingEnabledRef: canvasState.magneticSnappingEnabledRef,
    setSnapGuides: canvasState.setSnapGuides,
    exclusiveNodeDragAnchorIdRef,
    onSpacesChange,
    onRequestPersistFlush,
    setSpaceFramePreview: setNodeSpaceFramePreview,
    nodeDragPointerAnchorRef,
  })
  const {
    taskTitleProviderLabel,
    taskTitleModelLabel,
    handleViewportMoveEnd,
    minimapNodeColor,
    taskAgentEdges,
    spaceUi,
  } = workspaceCanvasHooks.useWorkspaceCanvasViewModel({
    agentSettings,
    viewportRef: canvasState.viewportRef,
    onViewportChange,
    flowNodes: canvasState.flowNodes,
    contextMenu: canvasState.contextMenu,
    setContextMenu: canvasState.setContextMenu,
    setEmptySelectionPrompt: canvasState.setEmptySelectionPrompt,
    cancelSpaceRename,
    workspacePath,
    spacesRef: canvasState.spacesRef,
    handlePaneClick,
    handlePaneContextMenu,
    handleNodeContextMenu,
    handleSelectionContextMenu,
  })
  useEffect(() => {
    adminBridge.getNodes = () => reactFlow.getNodes()
    adminBridge.createTerminalNode = async () => {
      const centerScreen = {
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      }
      const flowCenter = reactFlow.screenToFlowPosition(centerScreen)
      const size = resolveDefaultTerminalWindowSize(agentSettings.standardWindowSizeBucket)
      const anchor = resolveNodePlacementAnchorFromViewportCenter(flowCenter, size)
      let createdNodeId: string | null = null
      const originalCreateNodeForSession = nodeStore.createNodeForSession
      await createTerminalNodeAtFlowPosition({
        anchor,
        defaultTerminalProfileId: agentSettings.defaultTerminalProfileId,
        standardWindowSizeBucket: agentSettings.standardWindowSizeBucket,
        workspacePath,
        spacesRef: canvasState.spacesRef,
        nodesRef: nodeStore.nodesRef,
        setNodes: nodeStore.setNodes,
        onSpacesChange,
        createNodeForSession: async (input) => {
          const node = await originalCreateNodeForSession(input)
          if (node) createdNodeId = node.id
          return node
        },
      })
      return createdNodeId
    }
    adminBridge.createAgentNode = async ({ prompt, profileName, profileEmoji }) => {
      const provider = agentSettings.defaultProvider
      const model = resolveAgentModel(agentSettings, provider)
      const centerScreen = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
      const flowCenter = reactFlow.screenToFlowPosition(centerScreen)
      const size = resolveDefaultAgentWindowSize(agentSettings.standardWindowSizeBucket)
      const anchor = resolveNodePlacementAnchorFromViewportCenter(flowCenter, size)
      const launched = await window.opencoveApi.agent.launch({
        provider,
        cwd: workspacePath,
        prompt,
        mode: 'new',
        model,
        agentFullAccess: agentSettings.agentFullAccess,
        cols: 80,
        rows: 24,
      })
      const modelLabel = launched.effectiveModel ?? model
      const titlePrefix = profileName ? `${profileEmoji ?? ''} ${profileName} | ` : ''
      const created = await nodeStore.createNodeForSession({
        sessionId: launched.sessionId,
        title: `${titlePrefix}${buildAgentNodeTitle(provider, modelLabel)}`,
        anchor,
        kind: 'agent',
        agent: {
          provider,
          prompt,
          model,
          effectiveModel: launched.effectiveModel,
          launchMode: launched.launchMode,
          ...clearResumeSessionBinding(),
          executionDirectory: workspacePath,
          expectedDirectory: workspacePath,
          directoryMode: 'workspace' as const,
          customDirectory: null,
          shouldCreateDirectory: false,
          taskId: null,
        },
      })
      return created?.id ?? null
    }
    adminBridge.createNoteNode = (text?: string) => {
      const centerScreen = {
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      }
      const flowCenter = reactFlow.screenToFlowPosition(centerScreen)
      const node = nodeStore.createNoteNode(flowCenter)
      if (node && text) {
        nodeStore.updateNoteText(node.id, text)
      }
      return node?.id ?? null
    }
    adminBridge.closeNode = async (nodeId: string) => {
      await requestNodeClose(nodeId)
    }
    adminBridge.toggleMaximizeNode = (nodeId: string) => {
      maximizeNode(reactFlow, nodeId, nodeStore.setNodes)
    }
    adminBridge.focusNode = (nodeId: string) => {
      const node = reactFlow.getNode(nodeId)
      if (node) {
        reactFlow.setCenter(
          node.position.x + node.data.width / 2,
          node.position.y + node.data.height / 2,
          { duration: 200, zoom: 1 },
        )
      }
    }
    adminBridge.updateNodeTitle = (nodeId: string, title: string) => {
      nodeStore.setNodes(prevNodes =>
        prevNodes.map(n =>
          n.id === nodeId ? { ...n, data: { ...n.data, title, titlePinnedByUser: true } } : n,
        ),
      )
      onRequestPersistFlush?.()
    }
    adminBridge.updateNodeDescription = (nodeId: string, description: string) => {
      nodeStore.setNodes(prevNodes =>
        prevNodes.map(n =>
          n.id === nodeId ? { ...n, data: { ...n.data, description } } : n,
        ),
      )
      onRequestPersistFlush?.()
    }
    adminBridge.createPgViewerNode = () => {
      const center = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
      const flowCenter = reactFlow.screenToFlowPosition(center)
      const node = nodeStore.createPgViewerNode(flowCenter)
      return node?.id ?? null
    }
    adminBridge.updatePgViewerConnection = (nodeId, data) => {
      nodeStore.setNodes(prev =>
        prev.map(n => {
          if (n.id !== nodeId) return n
          return {
            ...n,
            data: {
              ...n.data,
              pgViewer: { ...n.data.pgViewer, ...data, activeTable: n.data.pgViewer?.activeTable ?? null },
            },
          }
        }),
      )
      onRequestPersistFlush?.()
    }
    adminBridge.workspacePath = workspacePath
    return () => {
      adminBridge.getNodes = undefined
      adminBridge.createTerminalNode = undefined
      adminBridge.createAgentNode = undefined
      adminBridge.createNoteNode = undefined
      adminBridge.closeNode = undefined
      adminBridge.toggleMaximizeNode = undefined
      adminBridge.focusNode = undefined
      adminBridge.updateNodeTitle = undefined
      adminBridge.updateNodeDescription = undefined
      adminBridge.createPgViewerNode = undefined
      adminBridge.updatePgViewerConnection = undefined
      adminBridge.workspacePath = undefined
    }
  }, [
    reactFlow,
    nodeStore.createNodeForSession,
    nodeStore.createNoteNode,
    nodeStore.updateNoteText,
    nodeStore.setNodes,
    nodeStore.nodesRef,
    canvasState.spacesRef,
    requestNodeClose,
    nodeStore.createPgViewerNode,
    workspacePath,
    agentSettings.defaultTerminalProfileId,
    agentSettings.standardWindowSizeBucket,
    agentSettings.defaultProvider,
    agentSettings.agentFullAccess,
    buildAgentNodeTitle,
    onSpacesChange,
    onRequestPersistFlush,
  ])
  return (
    <WorkspaceCanvasView
      canvasRef={canvasState.canvasRef}
      resolvedCanvasInputMode={resolvedCanvasInputMode}
      onCanvasClick={spaceUi.handleCanvasClick}
      handleCanvasPointerDownCapture={handleCanvasPointerDownCapture}
      handleCanvasPointerMoveCapture={handleCanvasPointerMoveCapture}
      handleCanvasPointerUpCapture={handleCanvasPointerUpCapture}
      handleCanvasDoubleClickCapture={handleCanvasDoubleClickCapture}
      handleCanvasWheelCapture={handleCanvasWheelCapture}
      handleCanvasPaste={handleCanvasPaste}
      handleCanvasDragOver={handleCanvasDragOver}
      handleCanvasDrop={handleCanvasDrop}
      nodes={canvasState.flowNodes}
      edges={taskAgentEdges}
      nodeTypes={nodeTypes}
      onNodesChange={applyChanges}
      onPaneClick={spaceUi.handlePaneClickWithSpaceMenuClose}
      onPaneContextMenu={spaceUi.handlePaneContextMenuWithSpaceMenuClose}
      onNodeClick={handleNodeClick}
      onNodeContextMenu={spaceUi.handleNodeContextMenuWithSpaceMenuClose}
      onSelectionContextMenu={spaceUi.handleSelectionContextMenuWithSpaceMenuClose}
      onSelectionChange={handleSelectionChange}
      onNodeDragStart={handleNodeDragStart}
      onSelectionDragStart={handleSelectionDragStart}
      onNodeDragStop={handleNodeDragStop}
      onSelectionDragStop={handleSelectionDragStop}
      onMoveEnd={handleViewportMoveEnd}
      viewport={viewport}
      isTrackpadCanvasMode={isTrackpadCanvasMode}
      useManualCanvasWheelGestures={useManualCanvasWheelGestures}
      isShiftPressed={canvasState.isShiftPressed}
      selectionDraft={canvasState.selectionDraftUi}
      snapGuides={canvasState.snapGuides}
      spaceVisuals={spaceVisuals}
      spaceFramePreview={spaceFramePreview ?? nodeSpaceFramePreview}
      selectedSpaceIds={canvasState.selectedSpaceIds}
      handleSpaceDragHandlePointerDown={handleSpaceDragHandlePointerDown}
      editingSpaceId={editingSpaceId}
      spaceRenameInputRef={spaceRenameInputRef}
      spaceRenameDraft={spaceRenameDraft}
      setSpaceRenameDraft={setSpaceRenameDraft}
      commitSpaceRename={commitSpaceRename}
      cancelSpaceRename={cancelSpaceRename}
      startSpaceRename={startSpaceRename}
      setSpaceLabelColor={setSpaceLabelColor}
      selectedNodeCount={canvasState.selectedNodeIds.length}
      isMinimapVisible={canvasState.isMinimapVisible}
      minimapNodeColor={minimapNodeColor}
      setIsMinimapVisible={canvasState.setIsMinimapVisible}
      onMinimapVisibilityChange={onMinimapVisibilityChange}
      spaces={spaces}
      activateSpace={activateSpace}
      activateAllSpaces={activateAllSpaces}
      contextMenu={canvasState.contextMenu}
      closeContextMenu={spaceUi.closeContextMenu}
      magneticSnappingEnabled={canvasState.magneticSnappingEnabled}
      onToggleMagneticSnapping={() => canvasState.setMagneticSnappingEnabled(enabled => !enabled)}
      createTerminalNode={createTerminalNode}
      createNoteNodeFromContextMenu={createNoteNodeFromContextMenu}
      createPgViewerNode={createPgViewerNodeFromContextMenu}
      arrangeAll={arrangeAll}
      arrangeCanvas={arrangeCanvas}
      arrangeInSpace={arrangeInSpace}
      openTaskCreator={openTaskCreator}
      openAgentLauncher={openAgentLauncher}
      openAgentLauncherForProvider={openAgentLauncherForProvider}
      createSpaceFromSelectedNodes={createSpaceFromSelectedNodes}
      clearNodeSelection={clearNodeSelection}
      canConvertSelectedNoteToTask={canConvertSelectedNoteToTask}
      isConvertSelectedNoteToTaskDisabled={isConvertSelectedNoteToTaskDisabled}
      convertSelectedNoteToTask={convertSelectedNoteToTask}
      setSelectedNodeLabelColorOverride={override =>
        nodeStore.setNodeLabelColorOverride(idsRef.current, override)
      }
      taskCreator={taskCreator}
      taskTitleProviderLabel={taskTitleProviderLabel}
      taskTitleModelLabel={taskTitleModelLabel}
      taskTagOptions={taskTagOptions}
      setTaskCreator={setTaskCreator}
      closeTaskCreator={closeTaskCreator}
      generateTaskTitle={generateTaskTitle}
      createTask={createTask}
      taskEditor={taskEditor}
      setTaskEditor={setTaskEditor}
      closeTaskEditor={closeTaskEditor}
      generateTaskEditorTitle={generateTaskEditorTitle}
      saveTaskEdits={saveTaskEdits}
      nodeDeleteConfirmation={nodeDeleteConfirmation}
      setNodeDeleteConfirmation={setNodeDeleteConfirmation}
      confirmNodeDelete={confirmNodeDelete}
      spaceWorktreeMismatchDropWarning={spaceWorktreeMismatchDropWarning}
      cancelSpaceWorktreeMismatchDropWarning={cancelSpaceWorktreeMismatchDropWarning}
      continueSpaceWorktreeMismatchDropWarning={continueSpaceWorktreeMismatchDropWarning}
      agentSettings={agentSettings}
      workspacePath={workspacePath}
      spaceActionMenu={spaceUi.spaceActionMenu}
      availablePathOpeners={spaceUi.availablePathOpeners}
      openSpaceActionMenu={spaceUi.openSpaceActionMenu}
      closeSpaceActionMenu={spaceUi.closeSpaceActionMenu}
      copySpacePath={spaceUi.copySpacePath}
      openSpacePath={spaceUi.openSpacePath}
      spaceWorktreeDialog={spaceUi.spaceWorktreeDialog}
      worktreesRoot={worktreesRoot}
      openSpaceCreateWorktree={spaceUi.openSpaceCreateWorktree}
      openSpaceArchive={spaceUi.openSpaceArchive}
      closeSpaceWorktree={spaceUi.closeSpaceWorktree}
      onShowMessage={onShowMessage}
      onAppendSpaceArchiveRecord={onAppendSpaceArchiveRecord}
      updateSpaceDirectory={updateSpaceDirectory}
      getSpaceBlockingNodes={getSpaceBlockingNodes}
      closeNodesById={closeNodesById}
    />
  )
}
