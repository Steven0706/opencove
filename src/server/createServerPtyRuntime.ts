/**
 * Server-mode PtyRuntime.
 *
 * Replaces the Electron-based createPtyRuntime() from
 * src/contexts/terminal/presentation/main-ipc/runtime.ts
 *
 * Key differences:
 * - Uses child_process.fork instead of utilityProcess.fork
 * - Broadcasts via WebSocket client manager instead of webContents
 * - Gets userDataDir from config instead of app.getPath
 */
import { fork, type ChildProcess } from 'node:child_process'
import { resolve } from 'node:path'
import { mkdirSync, existsSync } from 'node:fs'

/** Find a real system node binary (not Electron's) for spawning pty host */
function findSystemNode(): string {
  const candidates = [
    '/opt/homebrew/bin/node',
    '/usr/local/bin/node',
    '/usr/bin/node',
  ]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  // Fallback: search PATH
  const pathDirs = (process.env.PATH || '').split(':')
  for (const dir of pathDirs) {
    const p = resolve(dir, 'node')
    if (existsSync(p)) return p
  }
  return 'node'
}
import { IPC_CHANNELS } from '../shared/contracts/ipc'
import type {
  SpawnTerminalInput,
  SpawnTerminalResult,
  TerminalDataEvent,
  TerminalWriteEncoding,
} from '../shared/contracts/dto'
import { resolveDefaultShell } from '../platform/process/pty/defaultShell'
import type { SpawnPtyOptions } from '../platform/process/pty/types'
import { PtyHostSupervisor } from '../platform/process/ptyHost/supervisor'
import type { PtyHostProcess } from '../platform/process/ptyHost/supervisor'
import { TerminalProfileResolver } from '../platform/terminal/TerminalProfileResolver'
import { createSessionStateWatcherController } from '../contexts/terminal/presentation/main-ipc/sessionStateWatcher'
import { TerminalSessionManager } from '../contexts/terminal/presentation/main-ipc/sessionManager'
import type { PtyRuntime } from '../contexts/terminal/presentation/main-ipc/runtime'
import * as wsClientManager from './wsClientManager'

function reportIssue(message: string): void {
  process.stderr.write(`[pty-server] ${message}\n`)
}

function createChildProcessAdapter(modulePath: string): PtyHostProcess {
  // Use system node for pty host, NOT Electron binary.
  // node-pty's posix_spawnp fails when the parent is Electron due to codesign.
  const systemNode = findSystemNode()
  // Ensure PATH includes common shell locations (Finder launch has minimal PATH)
  const systemPath = '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin'
  const currentPath = process.env.PATH || ''
  const fullPath = currentPath.includes('/usr/local/bin') ? currentPath : `${systemPath}:${currentPath}`

  // CRITICAL: Only include server-modules in NODE_PATH for ptyHost.
  // The app.asar.unpacked/node_modules has Electron-ABI-compiled node-pty
  // which is incompatible with system node. If we include it, Node's module
  // resolution finds it first (parent dir of the script) and spawn fails.
  const serverModulesPath = (process.env.NODE_PATH || '').split(':')
    .find(p => p.includes('server-modules')) || process.env.NODE_PATH || ''

  const child: ChildProcess = fork(modulePath, [], {
    execPath: systemNode,
    stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    serialization: 'advanced',
    env: {
      ...process.env,
      NODE_PATH: serverModulesPath,
      PATH: fullPath,
    },
  })

  return {
    on(event: string, listener: (...args: unknown[]) => void) {
      child.on(event as 'message', listener as (m: unknown) => void)
    },
    postMessage(message: unknown) {
      child.send(message)
    },
    kill() {
      return child.kill()
    },
    get stdout() {
      return child.stdout
    },
    get stderr() {
      return child.stderr
    },
    get pid() {
      return child.pid
    },
  }
}

export function createServerPtyRuntime(userDataDir: string): PtyRuntime {
  const profileResolver = new TerminalProfileResolver()

  const sendToAllWindows = <Payload>(channel: string, payload: Payload): void => {
    wsClientManager.sendToAllClients(channel, payload)
  }

  const sessionStateWatcher = createSessionStateWatcherController({
    sendToAllWindows,
    reportIssue,
  })

  const sendPtyDataToSubscriber = (contentsId: number, eventPayload: TerminalDataEvent): void => {
    wsClientManager.sendToClient(contentsId, IPC_CHANNELS.ptyData, eventPayload)
  }

  const trackWebContentsDestroyed = (contentsId: number, onDestroyed: () => void): boolean => {
    return wsClientManager.onClientDisconnect(contentsId, onDestroyed)
  }

  const logsDir = resolve(userDataDir, 'logs')
  if (!existsSync(logsDir)) {
    mkdirSync(logsDir, { recursive: true })
  }
  const ptyHostLogFilePath = resolve(logsDir, 'pty-host.log')

  // Copy ptyHost.js to server-modules dir so it resolves node-pty from there
  // (not from app.asar.unpacked/node_modules which has Electron-ABI binaries).
  const serverModulesDir = (process.env.NODE_PATH || '').split(':')
    .find(p => p.includes('server-modules')) || ''
  const ptyHostBaseDir = serverModulesDir
    ? resolve(serverModulesDir, '..')
    : __dirname

  if (serverModulesDir) {
    const srcPtyHost = resolve(__dirname, 'ptyHost.js')
    const dstPtyHost = resolve(ptyHostBaseDir, 'ptyHost.js')
    try {
      const srcContent = require('node:fs').readFileSync(srcPtyHost, 'utf-8')
      require('node:fs').writeFileSync(dstPtyHost, srcContent)
    } catch {
      // fall through to use original location
    }
  }

  const ptyHost = new PtyHostSupervisor({
    baseDir: ptyHostBaseDir,
    logFilePath: ptyHostLogFilePath,
    reportIssue,
    createProcess: (modulePath: string) => {
      return createChildProcessAdapter(modulePath)
    },
  })

  // --- Probe state ---
  const terminalProbeBufferBySession = new Map<string, string>()

  const registerSessionProbeState = (sessionId: string): void => {
    terminalProbeBufferBySession.set(sessionId, '')
  }

  const clearSessionProbeState = (sessionId: string): void => {
    terminalProbeBufferBySession.delete(sessionId)
  }

  const resolveTerminalProbeReplies = (sessionId: string, outputChunk: string): void => {
    if (outputChunk.includes('\u001b[6n')) {
      ptyHost.write(sessionId, '\u001b[1;1R')
    }
    if (outputChunk.includes('\u001b[?6n')) {
      ptyHost.write(sessionId, '\u001b[?1;1R')
    }
    if (outputChunk.includes('\u001b[c')) {
      ptyHost.write(sessionId, '\u001b[?1;2c')
    }
    if (outputChunk.includes('\u001b[>c')) {
      ptyHost.write(sessionId, '\u001b[>0;115;0c')
    }
    if (outputChunk.includes('\u001b[?u')) {
      ptyHost.write(sessionId, '\u001b[?0u')
    }
  }

  // --- Session manager ---
  const manager = new TerminalSessionManager({
    sendToAllWindows,
    sendPtyDataToSubscriber,
    trackWebContentsDestroyed,
    sessionStateWatcher,
    onProbeSubscriptionChanged(sessionId: string) {
      if (manager.hasPtyDataSubscribers(sessionId)) {
        terminalProbeBufferBySession.delete(sessionId)
        return
      }
      terminalProbeBufferBySession.set(sessionId, '')
    },
  })

  // --- PtyHost event wiring ---
  ptyHost.onData(({ sessionId, data }) => {
    if (!manager.hasPtyDataSubscribers(sessionId)) {
      const probeBuffer = `${terminalProbeBufferBySession.get(sessionId) ?? ''}${data}`
      resolveTerminalProbeReplies(sessionId, probeBuffer)
      terminalProbeBufferBySession.set(sessionId, probeBuffer.slice(-32))
    }
    manager.handleData(sessionId, data)
  })

  ptyHost.onExit(({ sessionId, exitCode }) => {
    manager.handleExit(sessionId, exitCode)
    clearSessionProbeState(sessionId)
  })

  // --- PtyRuntime interface ---
  return {
    listProfiles: async () => await profileResolver.listProfiles(),
    spawnTerminalSession: async (input: SpawnTerminalInput) => {
      const resolved = await profileResolver.resolveTerminalSpawn(input)
      const { sessionId } = await ptyHost.spawn({
        cwd: resolved.cwd,
        command: resolved.command,
        args: resolved.args,
        env: resolved.env,
        cols: input.cols,
        rows: input.rows,
      })

      manager.registerSession(sessionId)
      registerSessionProbeState(sessionId)

      return {
        sessionId,
        profileId: resolved.profileId,
        runtimeKind: resolved.runtimeKind,
      }
    },
    spawnSession: async (options: SpawnPtyOptions) => {
      const command = options.command ?? options.shell ?? resolveDefaultShell()
      const args = options.command ? (options.args ?? []) : []

      const { sessionId } = await ptyHost.spawn({
        cwd: options.cwd,
        command,
        args,
        env: options.env,
        cols: options.cols,
        rows: options.rows,
      })

      manager.registerSession(sessionId)
      registerSessionProbeState(sessionId)
      return { sessionId }
    },
    write: (sessionId: string, data: string, encoding: TerminalWriteEncoding = 'utf8') => {
      ptyHost.write(sessionId, data, encoding)
      sessionStateWatcher.noteInteraction(sessionId, data)
    },
    resize: (sessionId: string, cols: number, rows: number) => {
      ptyHost.resize(sessionId, cols, rows)
    },
    kill: (sessionId: string) => {
      manager.kill(sessionId)
      clearSessionProbeState(sessionId)
      ptyHost.kill(sessionId)
    },
    attach: (contentsId: number, sessionId: string) => {
      manager.attach(contentsId, sessionId)
    },
    detach: (contentsId: number, sessionId: string) => {
      manager.detach(contentsId, sessionId)
    },
    snapshot: (sessionId: string) => {
      return manager.snapshot(sessionId)
    },
    startSessionStateWatcher: (input) => {
      manager.startSessionStateWatcher(input)
    },
    dispose: () => {
      manager.dispose()
      terminalProbeBufferBySession.clear()
      ptyHost.dispose()
    },
  }
}
