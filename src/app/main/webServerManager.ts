/**
 * Web Server Manager — proxy architecture.
 *
 * The web server child is a PURE PROXY. All API calls are forwarded to
 * Electron's real handlers via IPC.
 *
 * For live terminal content, we periodically push snapshots of all active
 * PTY sessions from Electron to the web server, which forwards them to
 * WebSocket clients.
 */
import { fork, type ChildProcess } from 'node:child_process'
import { resolve } from 'node:path'
import { appendFileSync, existsSync } from 'node:fs'
import { app, BrowserWindow, ipcMain } from 'electron'
import { networkInterfaces } from 'node:os'
import { IPC_CHANNELS } from '../../shared/contracts/ipc'
import { invokeRegisteredHandler } from './ipc/handle'

export interface WebServerState {
  running: boolean
  port: number
  lanUrl: string | null
}

let serverProcess: ChildProcess | null = null
let currentPort = 3200
const listeners = new Set<(state: WebServerState) => void>()

function log(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}\n`
  process.stdout.write(`[web-server] ${line}`)
  try {
    appendFileSync(resolve(app.getPath('userData'), 'web-server.log'), line)
  } catch { /* ignore */ }
}

function getLanAddress(): string | null {
  const nets = networkInterfaces()
  for (const iface of Object.values(nets)) {
    if (!iface) continue
    for (const info of iface) {
      if (info.family === 'IPv4' && !info.internal) return info.address
    }
  }
  return null
}

function getState(): WebServerState {
  const lanIp = getLanAddress()
  return {
    running: serverProcess !== null && !serverProcess.killed,
    port: currentPort,
    lanUrl: serverProcess && !serverProcess.killed && lanIp
      ? `http://${lanIp}:${currentPort}` : null,
  }
}

function notifyListeners(): void {
  const state = getState()
  for (const fn of listeners) {
    try { fn(state) } catch { /* ignore */ }
  }
}

export function startWebServer(port: number = 3200): WebServerState {
  if (serverProcess && !serverProcess.killed) return getState()

  currentPort = port
  log(`Starting proxy on port ${port}...`)

  const nodeCandidates = ['/opt/homebrew/bin/node', '/usr/local/bin/node', '/usr/bin/node']
  const systemNode = nodeCandidates.find(p => existsSync(p))
  if (!systemNode) { log('ERROR: No system node.'); return getState() }

  const rawPath = resolve(__dirname, '..', 'server', 'proxy.js')
  const proxyPath = rawPath.replace('app.asar', 'app.asar.unpacked')
  const originalFs = require('original-fs') as typeof import('node:fs')
  if (!originalFs.existsSync(proxyPath)) { log(`ERROR: No proxy at ${proxyPath}`); return getState() }

  const webDistBase = rawPath.includes('app.asar')
    ? rawPath.split('app.asar')[0] + 'app.asar.unpacked'
    : resolve(__dirname, '..')
  const webDistDir = resolve(webDistBase, 'out', 'web')

  try {
    serverProcess = fork(proxyPath, [`--port=${port}`], {
      execPath: systemNode,
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      env: {
        PATH: `${resolve(systemNode, '..')}:/usr/bin:/bin:/usr/sbin:/sbin`,
        HOME: process.env.HOME || '',
        OPENCOVE_WEB_DIST: webDistDir,
      },
    })
    log('Fork OK, pid: ' + serverProcess.pid)
  } catch (err) {
    log(`Fork error: ${err instanceof Error ? err.message : err}`)
    return getState()
  }

  // Handle invoke requests from child → forward to Electron handlers
  serverProcess.on('message', handleChildMessage)

  serverProcess.stdout?.on('data', (d: Buffer) => process.stdout.write(`[web-server] ${d}`))
  serverProcess.stderr?.on('data', (d: Buffer) => process.stderr.write(`[web-server] ${d}`))
  serverProcess.on('exit', code => { log(`Exited: ${code}`); serverProcess = null; notifyListeners() })
  serverProcess.on('error', err => { log(`Error: ${err.message}`); serverProcess = null; notifyListeners() })

  // Forward PTY events from renderer → main → child → WebSocket clients
  setupPtyEventForwarding()

  setTimeout(() => notifyListeners(), 2500)
  return getState()
}

function handleChildMessage(msg: unknown): void {
  if (!msg || typeof msg !== 'object') return
  const m = msg as Record<string, unknown>
  if (m.type !== 'invoke') return

  const { id, channel, payload, senderId } = m as {
    id: string; channel: string; payload: unknown; senderId: number
  }

  invokeRegisteredHandler(channel, senderId ?? 0, payload)
    .then(result => { serverProcess?.send({ type: 'invoke-result', id, result }) })
    .catch(() => {
      serverProcess?.send({
        type: 'invoke-result', id,
        result: { __opencoveIpcEnvelope: true, ok: false, error: { code: 'common.unexpected' } },
      })
    })
}

/**
 * Listen for PTY events forwarded from the Electron renderer via preload.
 * The preload script echoes pty:data/exit/state/metadata back to main
 * via 'web-server:forward-pty-event'. We forward them to the child process.
 */
function setupPtyEventForwarding(): void {
  const handler = (_event: Electron.IpcMainEvent, msg: { channel: string; payload: unknown }) => {
    if (serverProcess && !serverProcess.killed && msg?.channel) {
      try {
        serverProcess.send({ type: 'event', channel: msg.channel, payload: msg.payload })
      } catch { /* ignore */ }
    }
  }

  ipcMain.on('web-server:forward-pty-event', handler)

  // Clean up when server stops
  const checkInterval = setInterval(() => {
    if (!serverProcess || serverProcess.killed) {
      ipcMain.removeListener('web-server:forward-pty-event', handler)
      clearInterval(checkInterval)
    }
  }, 5000)
}

export function stopWebServer(): WebServerState {
  if (serverProcess && !serverProcess.killed) { serverProcess.kill('SIGTERM'); serverProcess = null }
  notifyListeners()
  return getState()
}

export function getWebServerState(): WebServerState { return getState() }

export function onWebServerStateChange(listener: (state: WebServerState) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
