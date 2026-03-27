import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../../../shared/contracts/ipc'
import type {
  PgConnectInput,
  PgConnectResult,
  PgDisconnectInput,
  PgListTablesInput,
  PgListTablesResult,
  PgQueryInput,
  PgQueryResult,
} from '../../../../shared/contracts/dto'
import type { IpcRegistrationDisposable } from '../../../../app/main/ipc/types'
import { registerHandledIpc } from '../../../../app/main/ipc/handle'
import { PgConnectionManager } from '../../application/PgConnectionManager'

export function registerPgViewerIpcHandlers(): IpcRegistrationDisposable {
  const connectionManager = new PgConnectionManager()

  registerHandledIpc(
    IPC_CHANNELS.pgConnect,
    async (_event, payload: PgConnectInput): Promise<PgConnectResult> => {
      return await connectionManager.connect(payload)
    },
    { defaultErrorCode: 'pg.connect_failed' },
  )

  registerHandledIpc(
    IPC_CHANNELS.pgDisconnect,
    async (_event, payload: PgDisconnectInput): Promise<void> => {
      await connectionManager.disconnect(payload.connectionId)
    },
    { defaultErrorCode: 'pg.disconnect_failed' },
  )

  registerHandledIpc(
    IPC_CHANNELS.pgListTables,
    async (_event, payload: PgListTablesInput): Promise<PgListTablesResult> => {
      return await connectionManager.listTables(payload.connectionId)
    },
    { defaultErrorCode: 'pg.list_tables_failed' },
  )

  registerHandledIpc(
    IPC_CHANNELS.pgQuery,
    async (_event, payload: PgQueryInput): Promise<PgQueryResult> => {
      return await connectionManager.query(payload.connectionId, payload.query, payload.maxRows)
    },
    { defaultErrorCode: 'pg.query_failed' },
  )

  return {
    dispose: () => {
      void connectionManager.disposeAll()
      ipcMain.removeHandler(IPC_CHANNELS.pgConnect)
      ipcMain.removeHandler(IPC_CHANNELS.pgDisconnect)
      ipcMain.removeHandler(IPC_CHANNELS.pgListTables)
      ipcMain.removeHandler(IPC_CHANNELS.pgQuery)
    },
  }
}
