import type { AppErrorCode, AppErrorDescriptor } from '../shared/contracts/dto'
import type { IpcInvokeResult } from '../shared/contracts/ipc'
import { toAppErrorDescriptor } from '../shared/errors/appError'

type HandlerFn = (event: SyntheticIpcEvent, payload: unknown) => Promise<unknown> | unknown

export interface SyntheticIpcEvent {
  sender: { id: number }
}

const handlers = new Map<string, HandlerFn>()

export function registerHandler(channel: string, handler: HandlerFn): void {
  handlers.set(channel, handler)
}

export function removeHandler(channel: string): void {
  handlers.delete(channel)
}

function isIpcEnvelope(value: unknown): value is IpcInvokeResult<unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    (value as Record<string, unknown>).__opencoveIpcEnvelope === true
  )
}

export async function invokeHandler(
  channel: string,
  clientId: number,
  payload: unknown,
): Promise<IpcInvokeResult<unknown>> {
  const handler = handlers.get(channel)
  if (!handler) {
    return {
      __opencoveIpcEnvelope: true,
      ok: false,
      error: {
        code: 'common.unavailable' as AppErrorCode,
        debugMessage: `No handler registered for channel: ${channel}`,
      } as AppErrorDescriptor,
    }
  }

  const syntheticEvent: SyntheticIpcEvent = { sender: { id: clientId } }

  try {
    const result = await handler(syntheticEvent, payload)

    // Handlers registered via ipcMain.handle shim already return IpcInvokeResult
    // (because handle.ts wraps them). Don't double-wrap.
    if (isIpcEnvelope(result)) {
      return result
    }

    return { __opencoveIpcEnvelope: true, ok: true, value: result }
  } catch (error) {
    return {
      __opencoveIpcEnvelope: true,
      ok: false,
      error: toAppErrorDescriptor(error, 'common.unexpected'),
    }
  }
}

export function hasHandler(channel: string): boolean {
  return handlers.has(channel)
}
