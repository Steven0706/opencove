import { BrowserWindow, webContents } from 'electron'
import { IPC_CHANNELS } from '../../../shared/contracts/ipc'
import { registerHandledIpc } from './handle'
import type { IpcRegistrationDisposable } from './types'
import {
  startWebServer,
  stopWebServer,
  getWebServerState,
  onWebServerStateChange,
  type WebServerState,
} from '../webServerManager'

export function registerWebServerIpcHandlers(): IpcRegistrationDisposable {
  console.log('[web-server-ipc] Registering handlers...')

  // Auto-start web server after 5 seconds
  setTimeout(() => {
    console.log('[web-server-ipc] Auto-starting web server...')
    try {
      const result = startWebServer(3200)
      console.log('[web-server-ipc] Auto-start result:', JSON.stringify(result))
    } catch (e) {
      console.error('[web-server-ipc] Auto-start error:', e)
    }
  }, 5000)

  // Returns live node→sessionId mapping from the host's renderer Zustand store.
  // Web clients call this to attach to existing terminal sessions.
  registerHandledIpc<string>(
    'web-server:get-live-nodes' as Parameters<typeof registerHandledIpc>[0],
    async () => {
      const win = BrowserWindow.getAllWindows()[0]
      if (!win) return '[]'
      try {
        const result = await win.webContents.executeJavaScript(
          `typeof window.__opencoveGetLiveNodes === 'function' ? window.__opencoveGetLiveNodes() : '[]'`,
          true,
        )
        return typeof result === 'string' ? result : '[]'
      } catch {
        return '[]'
      }
    },
    { defaultErrorCode: 'common.unexpected' },
  )
  registerHandledIpc<WebServerState, { port?: number }>(
    IPC_CHANNELS.webServerStart,
    async (_event, payload) => {
      console.log('[web-server-ipc] start requested, port:', payload?.port ?? 3200)
      const result = startWebServer(payload?.port ?? 3200)
      console.log('[web-server-ipc] start result:', JSON.stringify(result))
      return result
    },
    { defaultErrorCode: 'common.unexpected' },
  )

  registerHandledIpc<WebServerState>(
    IPC_CHANNELS.webServerStop,
    async () => {
      return stopWebServer()
    },
    { defaultErrorCode: 'common.unexpected' },
  )

  registerHandledIpc<WebServerState>(
    IPC_CHANNELS.webServerGetState,
    async () => {
      return getWebServerState()
    },
    { defaultErrorCode: 'common.unexpected' },
  )

  // Broadcast state changes to all renderer windows
  const unsubscribe = onWebServerStateChange((state) => {
    for (const content of webContents.getAllWebContents()) {
      if (content.isDestroyed() || content.getType() !== 'window') continue
      try {
        content.send(IPC_CHANNELS.webServerState, state)
      } catch {
        // ignore
      }
    }
  })

  return {
    dispose: () => {
      unsubscribe()
    },
  }
}
