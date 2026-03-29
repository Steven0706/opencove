/**
 * PTY host entry point for server mode.
 *
 * Adapts the child_process.fork IPC protocol to match the parentPort API
 * expected by the original PTY host entry, then delegates to the same
 * PTY management logic.
 */
import process from 'node:process'
import type { IPty } from 'node-pty'
import { spawn } from 'node-pty'
import {
  isPtyHostRequest,
  PTY_HOST_PROTOCOL_VERSION,
  type PtyHostMessage,
  type PtyHostSpawnRequest,
  type PtyHostWriteRequest,
  type PtyHostResizeRequest,
  type PtyHostKillRequest,
  type PtyHostShutdownRequest,
} from '../platform/process/ptyHost/protocol'
import { convertHighByteX10MouseReportsToSgr } from '../platform/process/pty/x10Mouse'

const sessions = new Map<string, IPty>()

function send(message: PtyHostMessage): void {
  if (process.send) {
    process.send(message)
  }
}

function respondOk(requestId: string, sessionId: string): void {
  send({ type: 'response', requestId, ok: true, result: { sessionId } })
}

function respondError(requestId: string, error: unknown): void {
  const name = error instanceof Error ? error.name : undefined
  const message = error instanceof Error ? error.message : 'unknown error'
  send({ type: 'response', requestId, ok: false, error: { name, message } })
}

function onPtyData(sessionId: string, data: string): void {
  send({ type: 'data', sessionId, data })
}

function onPtyExit(sessionId: string, exitCode: number): void {
  sessions.delete(sessionId)
  send({ type: 'exit', sessionId, exitCode })
}

function spawnPtySession(request: PtyHostSpawnRequest): void {
  const sessionId = crypto.randomUUID()
  const pty = spawn(request.command, request.args, {
    cwd: request.cwd,
    env: request.env,
    cols: request.cols,
    rows: request.rows,
    name: 'xterm-256color',
  })

  sessions.set(sessionId, pty)
  pty.onData(data => onPtyData(sessionId, data))
  pty.onExit(exit => onPtyExit(sessionId, exit.exitCode))
  respondOk(request.requestId, sessionId)
}

function writeToSession(request: PtyHostWriteRequest): void {
  const pty = sessions.get(request.sessionId)
  if (!pty) return

  if (request.encoding === 'binary') {
    if (process.platform === 'win32') {
      pty.write(convertHighByteX10MouseReportsToSgr(request.data))
    } else {
      pty.write(Buffer.from(request.data, 'binary'))
    }
    return
  }

  pty.write(request.data)
}

function resizeSession(request: PtyHostResizeRequest): void {
  const pty = sessions.get(request.sessionId)
  if (!pty) return
  pty.resize(request.cols, request.rows)
}

function killSession(request: PtyHostKillRequest): void {
  const pty = sessions.get(request.sessionId)
  if (!pty) return
  sessions.delete(request.sessionId)
  pty.kill()
}

function shutdown(_request: PtyHostShutdownRequest): void {
  for (const [sessionId, pty] of sessions.entries()) {
    sessions.delete(sessionId)
    try { pty.kill() } catch { /* ignore */ }
  }
  process.exit(0)
}

// Listen for IPC messages from parent (child_process.fork protocol)
process.on('message', (raw: unknown) => {
  if (!isPtyHostRequest(raw)) return

  switch (raw.type) {
    case 'spawn':
      try { spawnPtySession(raw) } catch (error) { respondError(raw.requestId, error) }
      break
    case 'write':
      writeToSession(raw)
      break
    case 'resize':
      resizeSession(raw)
      break
    case 'kill':
      killSession(raw)
      break
    case 'shutdown':
      shutdown(raw)
      break
    case 'crash':
      process.exit(1)
      break
  }
})

// Signal readiness
send({ type: 'ready', protocolVersion: PTY_HOST_PROTOCOL_VERSION })
