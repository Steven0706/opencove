/**
 * Electron API shim for server mode.
 * Satisfies `import { ... } from 'electron'` in existing handler files
 * without pulling in Electron as a dependency.
 *
 * Key trick: ipcMain.handle() delegates to our handler registry, so existing
 * handler registration code (which calls ipcMain.handle via registerHandledIpc)
 * automatically registers handlers that the web server can invoke.
 */
import { registerHandler, removeHandler } from '../handleRegistry'

const noopFn = (..._args: unknown[]): void => {}
const noopAsync = async (..._args: unknown[]): Promise<unknown> => ({})

// --- ipcMain ---
// The handle() method delegates to our server handler registry.
// This is the critical bridge: when existing code does
//   ipcMain.handle(channel, wrappedHandler)
// the wrappedHandler already returns IpcInvokeResult (wrapped by handle.ts),
// so we store it directly in the registry.
export const ipcMain = {
  handle: (channel: string, handler: (_event: unknown, payload: unknown) => Promise<unknown>) => {
    registerHandler(channel, async (event, payload) => {
      const result = await handler(event, payload)
      // The result is already wrapped in IpcInvokeResult envelope by handle.ts
      return result
    })
  },
  removeHandler: (channel: string) => {
    removeHandler(channel)
  },
  on: noopFn,
  removeListener: noopFn,
}

// --- ipcRenderer (should never be imported in server, but just in case) ---
export const ipcRenderer = {
  invoke: noopAsync,
  on: noopFn,
  removeListener: noopFn,
  send: noopFn,
}

// --- app ---
export const app = {
  getPath: (_name: string): string => {
    return process.env.OPENCOVE_DATA_DIR || ''
  },
  getName: () => 'opencove-server',
  getVersion: () => '0.0.0',
  isPackaged: false,
  quit: noopFn,
}

// --- clipboard ---
export const clipboard = {
  readText: () => '',
  writeText: noopFn,
}

// --- dialog ---
export const dialog = {
  showOpenDialog: async () => ({ canceled: true, filePaths: [] as string[] }),
  showSaveDialog: async () => ({ canceled: true, filePath: undefined }),
}

// --- shell ---
export const shell = {
  openPath: noopAsync,
  openExternal: noopAsync,
}

// --- BrowserWindow ---
export class BrowserWindow {
  static getAllWindows() {
    return []
  }
  static fromWebContents() {
    return null
  }
  getContentBounds() {
    return { x: 0, y: 0, width: 1920, height: 1080 }
  }
}

// --- webContents ---
export const webContents = {
  getAllWebContents: () => [],
  fromId: (_id: number) => null,
}

// --- session ---
export const session = {
  defaultSession: {
    setPermissionRequestHandler: noopFn,
  },
}

// --- utilityProcess ---
export const utilityProcess = {
  fork: (_modulePath: string, _args?: string[], _options?: unknown) => {
    throw new Error('utilityProcess.fork is not available in server mode. Use createServerPtyRuntime.')
  },
}

// --- contextBridge ---
export const contextBridge = {
  exposeInMainWorld: noopFn,
}

// Default export for `import Electron from 'electron'` patterns
export default {
  ipcMain,
  ipcRenderer,
  app,
  clipboard,
  dialog,
  shell,
  BrowserWindow,
  webContents,
  session,
  utilityProcess,
  contextBridge,
}
