import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../../../shared/contracts/ipc'
import { registerHandledIpc } from '../../../../app/main/ipc/handle'

export interface LlmProxyInput {
  url: string
  method: string
  headers: Record<string, string>
  body: string
}

export interface LlmProxyResult {
  status: number
  body: string
}

interface IpcRegistrationDisposable {
  dispose: () => void
}

export function registerAdminIpcHandlers(): IpcRegistrationDisposable {
  registerHandledIpc<LlmProxyResult, LlmProxyInput>(
    IPC_CHANNELS.adminLlmProxy,
    async (_event, payload) => {
      const response = await fetch(payload.url, {
        method: payload.method,
        headers: payload.headers,
        body: payload.body,
      })
      const body = await response.text()
      return { status: response.status, body }
    },
    { defaultErrorCode: 'common.unexpected' },
  )

  return {
    dispose: () => {
      ipcMain.removeHandler(IPC_CHANNELS.adminLlmProxy)
    },
  }
}
