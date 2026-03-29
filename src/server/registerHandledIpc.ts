/**
 * Server-side drop-in replacement for src/app/main/ipc/handle.ts
 *
 * Same signature so existing handler registration files work unchanged
 * when this module is aliased in place of the Electron version.
 */
import type { AppErrorCode } from '../shared/contracts/dto'
import type { IpcChannel } from '../shared/contracts/ipc'
import { toAppErrorDescriptor } from '../shared/errors/appError'
import { registerHandler, removeHandler } from './handleRegistry'

export function registerHandledIpc<TResult, TPayload = undefined>(
  channel: IpcChannel,
  handler: (event: unknown, payload: TPayload) => Promise<TResult> | TResult,
  options: { defaultErrorCode: AppErrorCode },
): void {
  registerHandler(channel, async (event, payload) => {
    try {
      return await handler(event, payload as TPayload)
    } catch (error) {
      throw toAppErrorDescriptor(error, options.defaultErrorCode)
    }
  })
}

export { removeHandler }
