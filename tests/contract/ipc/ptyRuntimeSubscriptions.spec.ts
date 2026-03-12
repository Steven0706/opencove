import { describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS } from '../../../src/shared/constants/ipc'

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void

  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
}

describe('Pty runtime subscriptions', () => {
  it('cleans session subscriptions after exit and preserves the last snapshot', async () => {
    vi.useFakeTimers()
    vi.resetModules()

    const send = vi.fn()
    const destroyedHandlers: Array<() => void> = []

    const content = {
      isDestroyed: () => false,
      getType: () => 'window',
      send,
      once: (_event: string, handler: () => void) => {
        destroyedHandlers.push(handler)
      },
    }

    let onDataHandler: ((data: string) => void) | null = null
    let onExitHandler: ((event: { exitCode: number }) => void) | null = null
    const snapshotBySession = new Map<string, string>()

    const pty = {
      onData: (handler: (data: string) => void) => {
        onDataHandler = handler
      },
      onExit: (handler: (event: { exitCode: number }) => void) => {
        onExitHandler = handler
      },
    }

    class MockPtyManager {
      public appendSnapshotData(sessionId: string, data: string): void {
        snapshotBySession.set(sessionId, `${snapshotBySession.get(sessionId) ?? ''}${data}`)
      }
      public snapshot(sessionId: string): string {
        return snapshotBySession.get(sessionId) ?? ''
      }
      public write(): void {}
      public resize(): void {}
      public kill(): void {}
      public delete(sessionId: string, options: { keepSnapshot?: boolean } = {}): void {
        if (options.keepSnapshot === true) {
          return
        }

        snapshotBySession.delete(sessionId)
      }
      public disposeAll(): void {}

      public spawnSession(): { sessionId: string; pty: typeof pty } {
        return { sessionId: 'session-1', pty }
      }
    }

    vi.doMock('electron', () => ({
      webContents: {
        getAllWebContents: () => [content],
        fromId: (id: number) => (id === 1 ? content : null),
      },
    }))

    vi.doMock('../../../src/platform/process/pty/PtyManager', () => ({
      PtyManager: MockPtyManager,
    }))

    const { createPtyRuntime } =
      await import('../../../src/contexts/terminal/presentation/main-ipc/runtime')

    const runtime = createPtyRuntime()
    runtime.spawnSession({ cwd: '/tmp', cols: 80, rows: 24 })
    runtime.attach(1, 'session-1')

    onDataHandler?.('hello')
    await vi.advanceTimersByTimeAsync(40)

    expect(send.mock.calls.filter(([channel]) => channel === IPC_CHANNELS.ptyData)).toEqual([
      [IPC_CHANNELS.ptyData, { sessionId: 'session-1', data: 'hello' }],
    ])
    expect(runtime.snapshot('session-1')).toBe('hello')

    onExitHandler?.({ exitCode: 0 })

    expect(send.mock.calls.some(([channel]) => channel === IPC_CHANNELS.ptyExit)).toBe(true)
    expect(runtime.snapshot('session-1')).toBe('hello')

    send.mockClear()

    onDataHandler?.('after-exit')
    await vi.advanceTimersByTimeAsync(40)

    expect(send.mock.calls.filter(([channel]) => channel === IPC_CHANNELS.ptyData)).toEqual([])

    runtime.dispose()
    vi.useRealTimers()
  })

  it('cleans session subscriptions when killed', async () => {
    vi.useFakeTimers()
    vi.resetModules()

    const send = vi.fn()
    const content = {
      isDestroyed: () => false,
      getType: () => 'window',
      send,
      once: vi.fn(),
    }

    let onDataHandler: ((data: string) => void) | null = null

    const pty = {
      onData: (handler: (data: string) => void) => {
        onDataHandler = handler
      },
      onExit: (_handler: (event: { exitCode: number }) => void) => {},
    }

    const killDeferred = createDeferred<void>()

    class MockPtyManager {
      public appendSnapshotData(): void {}
      public snapshot(): string {
        return ''
      }
      public write(): void {}
      public resize(): void {}
      public kill(): void {
        killDeferred.resolve()
      }
      public delete(): void {}
      public disposeAll(): void {}

      public spawnSession(): { sessionId: string; pty: typeof pty } {
        return { sessionId: 'session-1', pty }
      }
    }

    vi.doMock('electron', () => ({
      webContents: {
        getAllWebContents: () => [content],
        fromId: (id: number) => (id === 1 ? content : null),
      },
    }))

    vi.doMock('../../../src/platform/process/pty/PtyManager', () => ({
      PtyManager: MockPtyManager,
    }))

    const { createPtyRuntime } =
      await import('../../../src/contexts/terminal/presentation/main-ipc/runtime')

    const runtime = createPtyRuntime()
    runtime.spawnSession({ cwd: '/tmp', cols: 80, rows: 24 })
    runtime.attach(1, 'session-1')

    onDataHandler?.('hello')
    await vi.advanceTimersByTimeAsync(40)

    expect(send.mock.calls.filter(([channel]) => channel === IPC_CHANNELS.ptyData).length).toBe(1)

    runtime.kill('session-1')
    await killDeferred.promise

    send.mockClear()

    onDataHandler?.('after-kill')
    await vi.advanceTimersByTimeAsync(40)

    expect(send.mock.calls.filter(([channel]) => channel === IPC_CHANNELS.ptyData)).toEqual([])

    runtime.dispose()
    vi.useRealTimers()
  })

  it('restores probe fallback after the last subscriber detaches', async () => {
    vi.useFakeTimers()
    vi.resetModules()

    const send = vi.fn()
    const write = vi.fn()
    const resize = vi.fn()
    const content = {
      isDestroyed: () => false,
      getType: () => 'window',
      send,
      once: vi.fn(),
    }

    let onDataHandler: ((data: string) => void) | null = null

    const pty = {
      onData: (handler: (data: string) => void) => {
        onDataHandler = handler
      },
      onExit: (_handler: (event: { exitCode: number }) => void) => {},
    }

    class MockPtyManager {
      public appendSnapshotData(): void {}
      public snapshot(): string {
        return ''
      }
      public write = write
      public resize = resize
      public kill(): void {}
      public delete(): void {}
      public disposeAll(): void {}

      public spawnSession(): { sessionId: string; pty: typeof pty } {
        return { sessionId: 'session-1', pty }
      }
    }

    vi.doMock('electron', () => ({
      webContents: {
        getAllWebContents: () => [content],
        fromId: (id: number) => (id === 1 ? content : null),
      },
    }))

    vi.doMock('../../../src/platform/process/pty/PtyManager', () => ({
      PtyManager: MockPtyManager,
    }))

    const { createPtyRuntime } =
      await import('../../../src/contexts/terminal/presentation/main-ipc/runtime')

    const runtime = createPtyRuntime()
    runtime.spawnSession({ cwd: '/tmp', cols: 80, rows: 24 })
    runtime.attach(1, 'session-1')
    runtime.resize('session-1', 120, 40)

    onDataHandler?.('\u001b[6n\u001b[c\u001b[?u')
    expect(write).toHaveBeenCalledTimes(0)

    runtime.detach(1, 'session-1')

    onDataHandler?.('\u001b[6n\u001b[c\u001b[?u')
    expect(write.mock.calls).toEqual([
      ['session-1', '\u001b[1;1R'],
      ['session-1', '\u001b[?1;2c'],
      ['session-1', '\u001b[?0u'],
    ])

    runtime.dispose()
    vi.useRealTimers()
  })

  it('restores probe fallback when webContents cleanup removes the last subscriber', async () => {
    vi.useFakeTimers()
    vi.resetModules()

    const destroyedHandlers: Array<() => void> = []
    const write = vi.fn()
    const content = {
      isDestroyed: () => false,
      getType: () => 'window',
      send: vi.fn(),
      once: (_event: string, handler: () => void) => {
        destroyedHandlers.push(handler)
      },
    }

    let onDataHandler: ((data: string) => void) | null = null

    const pty = {
      onData: (handler: (data: string) => void) => {
        onDataHandler = handler
      },
      onExit: (_handler: (event: { exitCode: number }) => void) => {},
    }

    class MockPtyManager {
      public appendSnapshotData(): void {}
      public snapshot(): string {
        return ''
      }
      public write = write
      public resize(): void {}
      public kill(): void {}
      public delete(): void {}
      public disposeAll(): void {}

      public spawnSession(): { sessionId: string; pty: typeof pty } {
        return { sessionId: 'session-1', pty }
      }
    }

    vi.doMock('electron', () => ({
      webContents: {
        getAllWebContents: () => [content],
        fromId: (id: number) => (id === 1 ? content : null),
      },
    }))

    vi.doMock('../../../src/platform/process/pty/PtyManager', () => ({
      PtyManager: MockPtyManager,
    }))

    const { createPtyRuntime } =
      await import('../../../src/contexts/terminal/presentation/main-ipc/runtime')

    const runtime = createPtyRuntime()
    runtime.spawnSession({ cwd: '/tmp', cols: 80, rows: 24 })
    runtime.attach(1, 'session-1')

    onDataHandler?.('\u001b[>c')
    expect(write).toHaveBeenCalledTimes(0)

    destroyedHandlers[0]?.()

    onDataHandler?.('\u001b[>c')
    expect(write).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledWith('session-1', '\u001b[>0;115;0c')

    runtime.dispose()
    vi.useRealTimers()
  })

  it('coalesces snapshot writes and broadcasts per flush window', async () => {
    vi.useFakeTimers()
    vi.resetModules()

    const send = vi.fn()
    const content = {
      isDestroyed: () => false,
      getType: () => 'window',
      send,
      once: vi.fn(),
    }

    let onDataHandler: ((data: string) => void) | null = null
    const snapshotBySession = new Map<string, string>()
    const appendSnapshotData = vi.fn((sessionId: string, data: string) => {
      snapshotBySession.set(sessionId, `${snapshotBySession.get(sessionId) ?? ''}${data}`)
    })

    const pty = {
      onData: (handler: (data: string) => void) => {
        onDataHandler = handler
      },
      onExit: (_handler: (event: { exitCode: number }) => void) => {},
    }

    class MockPtyManager {
      public appendSnapshotData = appendSnapshotData
      public snapshot(sessionId: string): string {
        return snapshotBySession.get(sessionId) ?? ''
      }
      public write(): void {}
      public resize(): void {}
      public kill(): void {}
      public delete(): void {}
      public disposeAll(): void {}

      public spawnSession(): { sessionId: string; pty: typeof pty } {
        return { sessionId: 'session-1', pty }
      }
    }

    vi.doMock('electron', () => ({
      webContents: {
        getAllWebContents: () => [content],
        fromId: (id: number) => (id === 1 ? content : null),
      },
    }))

    vi.doMock('../../../src/platform/process/pty/PtyManager', () => ({
      PtyManager: MockPtyManager,
    }))

    const { createPtyRuntime } =
      await import('../../../src/contexts/terminal/presentation/main-ipc/runtime')

    const runtime = createPtyRuntime()
    runtime.spawnSession({ cwd: '/tmp', cols: 80, rows: 24 })
    runtime.attach(1, 'session-1')

    onDataHandler?.('hel')
    onDataHandler?.('lo')
    await vi.advanceTimersByTimeAsync(40)

    expect(appendSnapshotData).toHaveBeenCalledTimes(1)
    expect(appendSnapshotData).toHaveBeenCalledWith('session-1', 'hello')
    expect(send.mock.calls.filter(([channel]) => channel === IPC_CHANNELS.ptyData)).toEqual([
      [IPC_CHANNELS.ptyData, { sessionId: 'session-1', data: 'hello' }],
    ])

    runtime.dispose()
    vi.useRealTimers()
  })

  it('flushes pending output before serving snapshots', async () => {
    vi.useFakeTimers()
    vi.resetModules()

    let onDataHandler: ((data: string) => void) | null = null
    const snapshotBySession = new Map<string, string>()
    const appendSnapshotData = vi.fn((sessionId: string, data: string) => {
      snapshotBySession.set(sessionId, `${snapshotBySession.get(sessionId) ?? ''}${data}`)
    })

    const pty = {
      onData: (handler: (data: string) => void) => {
        onDataHandler = handler
      },
      onExit: (_handler: (event: { exitCode: number }) => void) => {},
    }

    class MockPtyManager {
      public appendSnapshotData = appendSnapshotData
      public snapshot(sessionId: string): string {
        return snapshotBySession.get(sessionId) ?? ''
      }
      public write(): void {}
      public resize(): void {}
      public kill(): void {}
      public delete(): void {}
      public disposeAll(): void {}

      public spawnSession(): { sessionId: string; pty: typeof pty } {
        return { sessionId: 'session-1', pty }
      }
    }

    vi.doMock('electron', () => ({
      webContents: {
        getAllWebContents: () => [],
        fromId: () => null,
      },
    }))

    vi.doMock('../../../src/platform/process/pty/PtyManager', () => ({
      PtyManager: MockPtyManager,
    }))

    const { createPtyRuntime } =
      await import('../../../src/contexts/terminal/presentation/main-ipc/runtime')

    const runtime = createPtyRuntime()
    runtime.spawnSession({ cwd: '/tmp', cols: 80, rows: 24 })

    onDataHandler?.('snap')
    onDataHandler?.('shot')

    expect(runtime.snapshot('session-1')).toBe('snapshot')
    expect(appendSnapshotData).toHaveBeenCalledTimes(1)
    expect(appendSnapshotData).toHaveBeenCalledWith('session-1', 'snapshot')

    await vi.advanceTimersByTimeAsync(40)
    expect(appendSnapshotData).toHaveBeenCalledTimes(1)

    runtime.dispose()
    vi.useRealTimers()
  })
})
