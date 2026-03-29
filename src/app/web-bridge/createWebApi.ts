/**
 * Creates a browser-compatible implementation of window.opencoveApi.
 *
 * This replaces the Electron preload bridge. Request-response calls go through
 * HTTP POST /api/invoke. Event streams come through WebSocket.
 */
import { IPC_CHANNELS } from '../../shared/contracts/ipc'
import type { OpenCoveApi } from '../preload/index.d'
import { invokeHttp, setToken } from './httpInvoke'
import { WsConnection } from './wsConnection'

type UnsubscribeFn = () => void

export interface WebApiConfig {
  token: string
  wsUrl: string
}

export function createWebApi(config: WebApiConfig): OpenCoveApi {
  setToken(config.token)

  const ws = new WsConnection(config.wsUrl)

  // Helper: create event subscription that maps to WebSocket
  function onEvent<T>(channel: string) {
    return (listener: (event: T) => void): UnsubscribeFn => {
      return ws.on(channel, listener as (payload: unknown) => void)
    }
  }

  return {
    meta: {
      isTest: false,
      allowWhatsNewInTests: false,
      platform: 'web',
    },

    windowChrome: {
      setTheme: async () => {
        // No-op in web mode — browser handles its own chrome
      },
    },

    windowMetrics: {
      getDisplayInfo: async () => ({
        contentWidthDip: window.innerWidth,
        contentHeightDip: window.innerHeight,
        displayScaleFactor: window.devicePixelRatio || 1,
        effectiveWidthPx: window.innerWidth * (window.devicePixelRatio || 1),
        effectiveHeightPx: window.innerHeight * (window.devicePixelRatio || 1),
      }),
    },

    clipboard: {
      readText: async () => {
        try {
          return await navigator.clipboard.readText()
        } catch {
          return ''
        }
      },
      writeText: async (text: string) => {
        try {
          await navigator.clipboard.writeText(text)
        } catch {
          // Fallback: create a temporary textarea
          const ta = document.createElement('textarea')
          ta.value = text
          ta.style.position = 'fixed'
          ta.style.opacity = '0'
          document.body.appendChild(ta)
          ta.select()
          document.execCommand('copy')
          document.body.removeChild(ta)
        }
      },
    },

    persistence: {
      readWorkspaceStateRaw: () =>
        invokeHttp(IPC_CHANNELS.persistenceReadWorkspaceStateRaw),
      writeWorkspaceStateRaw: (payload) =>
        invokeHttp(IPC_CHANNELS.persistenceWriteWorkspaceStateRaw, payload),
      readAppState: () =>
        invokeHttp(IPC_CHANNELS.persistenceReadAppState),
      writeAppState: (payload) =>
        invokeHttp(IPC_CHANNELS.persistenceWriteAppState, payload),
      readNodeScrollback: (payload) =>
        invokeHttp(IPC_CHANNELS.persistenceReadNodeScrollback, payload),
      writeNodeScrollback: (payload) =>
        invokeHttp(IPC_CHANNELS.persistenceWriteNodeScrollback, payload),
    },

    workspace: {
      selectDirectory: async () => {
        // In web mode, prompt user for a path string
        const path = window.prompt('Enter workspace directory path:')
        if (!path || path.trim().length === 0) {
          return null
        }
        return { path: path.trim() }
      },
      ensureDirectory: (payload) =>
        invokeHttp(IPC_CHANNELS.workspaceEnsureDirectory, payload),
      copyPath: async (payload) => {
        // Client-side clipboard write
        try {
          await navigator.clipboard.writeText(payload.path)
        } catch {
          // ignore
        }
      },
      listPathOpeners: async () => {
        // Server can still detect openers
        return invokeHttp(IPC_CHANNELS.workspaceListPathOpeners)
      },
      openPath: (payload) =>
        invokeHttp(IPC_CHANNELS.workspaceOpenPath, payload),
      writeCanvasImage: (payload) =>
        invokeHttp(IPC_CHANNELS.workspaceWriteCanvasImage, payload),
      readCanvasImage: (payload) =>
        invokeHttp(IPC_CHANNELS.workspaceReadCanvasImage, payload),
      deleteCanvasImage: (payload) =>
        invokeHttp(IPC_CHANNELS.workspaceDeleteCanvasImage, payload),
    },

    worktree: {
      listBranches: (payload) =>
        invokeHttp(IPC_CHANNELS.worktreeListBranches, payload),
      listWorktrees: (payload) =>
        invokeHttp(IPC_CHANNELS.worktreeListWorktrees, payload),
      statusSummary: (payload) =>
        invokeHttp(IPC_CHANNELS.worktreeStatusSummary, payload),
      getDefaultBranch: (payload) =>
        invokeHttp(IPC_CHANNELS.worktreeGetDefaultBranch, payload),
      create: (payload) =>
        invokeHttp(IPC_CHANNELS.worktreeCreate, payload),
      remove: (payload) =>
        invokeHttp(IPC_CHANNELS.worktreeRemove, payload),
      renameBranch: (payload) =>
        invokeHttp(IPC_CHANNELS.worktreeRenameBranch, payload),
      suggestNames: (payload) =>
        invokeHttp(IPC_CHANNELS.worktreeSuggestNames, payload),
    },

    integration: {
      github: {
        resolvePullRequests: (payload) =>
          invokeHttp(IPC_CHANNELS.integrationGithubResolvePullRequests, payload),
      },
    },

    update: {
      getState: async () => ({
        status: 'idle' as const,
        channel: 'stable' as const,
        currentVersion: '0.0.0',
      }),
      configure: async () => ({
        status: 'idle' as const,
        channel: 'stable' as const,
        currentVersion: '0.0.0',
      }),
      checkForUpdates: async () => ({
        status: 'idle' as const,
        channel: 'stable' as const,
        currentVersion: '0.0.0',
      }),
      downloadUpdate: async () => ({
        status: 'idle' as const,
        channel: 'stable' as const,
        currentVersion: '0.0.0',
      }),
      installUpdate: async () => {},
      onState: () => () => {},
    },

    releaseNotes: {
      getCurrent: (payload) =>
        invokeHttp(IPC_CHANNELS.releaseNotesGetCurrent, payload),
    },

    pty: {
      listProfiles: () =>
        invokeHttp(IPC_CHANNELS.ptyListProfiles),
      spawn: (payload) =>
        invokeHttp(IPC_CHANNELS.ptySpawn, payload),
      write: async (payload) => {
        // Fire-and-forget via WebSocket for low latency
        ws.sendPtyWrite(payload.sessionId, payload.data, payload.encoding)
      },
      resize: async (payload) => {
        // Fire-and-forget via WebSocket for low latency
        ws.sendPtyResize(payload.sessionId, payload.cols, payload.rows)
      },
      kill: (payload) =>
        invokeHttp(IPC_CHANNELS.ptyKill, payload),
      attach: async (payload) => {
        // Use WebSocket invoke so event.sender.id = our WS clientId
        await ws.invoke(IPC_CHANNELS.ptyAttach, payload)
      },
      detach: async (payload) => {
        await ws.invoke(IPC_CHANNELS.ptyDetach, payload)
      },
      snapshot: (payload) =>
        invokeHttp(IPC_CHANNELS.ptySnapshot, payload),
      debugCrashHost: async () => {},
      onData: onEvent(IPC_CHANNELS.ptyData),
      onExit: onEvent(IPC_CHANNELS.ptyExit),
      onState: onEvent(IPC_CHANNELS.ptyState),
      onMetadata: onEvent(IPC_CHANNELS.ptySessionMetadata),
    },

    agent: {
      listModels: (payload) =>
        invokeHttp(IPC_CHANNELS.agentListModels, payload),
      listInstalledProviders: () =>
        invokeHttp(IPC_CHANNELS.agentListInstalledProviders),
      launch: (payload) =>
        invokeHttp(IPC_CHANNELS.agentLaunch, payload),
      readLastMessage: (payload) =>
        invokeHttp(IPC_CHANNELS.agentReadLastMessage, payload),
      resolveResumeSessionId: (payload) =>
        invokeHttp(IPC_CHANNELS.agentResolveResumeSession, payload),
    },

    task: {
      suggestTitle: (payload) =>
        invokeHttp(IPC_CHANNELS.taskSuggestTitle, payload),
    },

    whisper: {
      transcribe: (payload) =>
        invokeHttp(IPC_CHANNELS.whisperTranscribe, payload),
      auth: () =>
        invokeHttp(IPC_CHANNELS.whisperAuth),
      history: (payload) =>
        invokeHttp(IPC_CHANNELS.whisperHistory, payload),
    },

    admin: {
      llmProxy: (payload) =>
        invokeHttp(IPC_CHANNELS.adminLlmProxy, payload),
      saveProjectFile: (payload) =>
        invokeHttp(IPC_CHANNELS.adminSaveProjectFile, payload),
      listProjectFiles: (payload) =>
        invokeHttp(IPC_CHANNELS.adminListProjectFiles, payload),
      readProjectFile: (payload) =>
        invokeHttp(IPC_CHANNELS.adminReadProjectFile, payload),
    },

    pg: {
      connect: (payload) =>
        invokeHttp(IPC_CHANNELS.pgConnect, payload),
      disconnect: (payload) =>
        invokeHttp(IPC_CHANNELS.pgDisconnect, payload),
      listTables: (payload) =>
        invokeHttp(IPC_CHANNELS.pgListTables, payload),
      query: (payload) =>
        invokeHttp(IPC_CHANNELS.pgQuery, payload),
    },

    webServer: {
      start: async () => ({ running: false, port: 0, lanUrl: null }),
      stop: async () => ({ running: false, port: 0, lanUrl: null }),
      getState: async () => ({ running: false, port: 0, lanUrl: null }),
      onState: () => () => {},
    },
  }
}
