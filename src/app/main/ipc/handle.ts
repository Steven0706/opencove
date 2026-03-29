import { ipcMain } from 'electron'
import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron'
import type { AppErrorCode } from '../../../shared/contracts/dto'
import type { IpcChannel } from '../../../shared/contracts/ipc'
import type { IpcInvokeResult } from '../../../shared/contracts/ipc'
import { toAppErrorDescriptor } from '../../../shared/errors/appError'

/**
 * Parallel handler registry — stores wrapped handlers so they can be
 * called programmatically by the web server proxy (not just via Electron IPC).
 */
const handlerRegistry = new Map<
  string,
  (event: unknown, payload: unknown) => Promise<IpcInvokeResult<unknown>>
>()

export function registerHandledIpc<
  TResult,
  TPayload = undefined,
  TEvent extends IpcMainInvokeEvent | IpcMainEvent = IpcMainInvokeEvent,
>(
  channel: IpcChannel,
  handler: (event: TEvent, payload: TPayload) => Promise<TResult> | TResult,
  options: { defaultErrorCode: AppErrorCode },
): void {
  const wrappedHandler = async (event: unknown, payload: unknown): Promise<IpcInvokeResult<TResult>> => {
    try {
      const value = await handler(event as TEvent, payload as TPayload)
      return { __opencoveIpcEnvelope: true, ok: true, value }
    } catch (error) {
      return {
        __opencoveIpcEnvelope: true,
        ok: false,
        error: toAppErrorDescriptor(error, options.defaultErrorCode),
      }
    }
  }

  // Register with Electron IPC (for renderer)
  ipcMain.handle(channel, async (event, payload): Promise<IpcInvokeResult<TResult>> => {
    return wrappedHandler(event, payload)
  })

  // Also store in parallel registry (for web server proxy)
  handlerRegistry.set(channel, wrappedHandler as (e: unknown, p: unknown) => Promise<IpcInvokeResult<unknown>>)
}

/**
 * Invoke a registered handler programmatically.
 * Used by the web server proxy to forward requests from remote browsers.
 */
export async function invokeRegisteredHandler(
  channel: string,
  senderId: number,
  payload: unknown,
): Promise<IpcInvokeResult<unknown>> {
  const handler = handlerRegistry.get(channel)
  if (!handler) {
    return {
      __opencoveIpcEnvelope: true,
      ok: false,
      error: {
        code: 'common.unavailable',
        debugMessage: `No handler for channel: ${channel}`,
      },
    }
  }

  // Create a synthetic event with sender.id for PTY attach/detach
  const syntheticEvent = { sender: { id: senderId } }
  return handler(syntheticEvent, payload)
}
