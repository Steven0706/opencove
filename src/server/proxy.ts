/**
 * OpenCove Web Server — Proxy Mode
 *
 * A pure proxy that forwards ALL API calls to the Electron main process via IPC.
 * No PtyRuntime, no SQLite, no native modules — just HTTP/WebSocket ↔ IPC bridge.
 *
 * This ensures remote browsers see the EXACT same state as the host Electron app.
 */
import express from 'express'
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { existsSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs'
import { hostname, networkInterfaces } from 'node:os'
import { WebSocketServer, type WebSocket } from 'ws'
import type { IncomingMessage } from 'node:http'
import crypto from 'node:crypto'

// --- Config ---
const args = process.argv.slice(2)
const portArg = args.find(a => a.startsWith('--port='))
const port = portArg ? Number(portArg.split('=')[1]) : 3200

// --- Pending invoke requests (waiting for Electron to respond) ---
const pendingInvokes = new Map<string, {
  resolve: (result: unknown) => void
  timer: ReturnType<typeof setTimeout>
}>()

function invokeElectron(channel: string, payload: unknown, senderId: number = 0): Promise<unknown> {
  const id = crypto.randomUUID()

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingInvokes.delete(id)
      reject(new Error(`Invoke timeout: ${channel}`))
    }, 30_000)

    pendingInvokes.set(id, { resolve, timer })

    if (process.send) {
      process.send({ type: 'invoke', id, channel, payload, senderId })
    } else {
      clearTimeout(timer)
      pendingInvokes.delete(id)
      reject(new Error('No IPC channel to parent'))
    }
  })
}

// --- Handle messages from Electron parent ---
const wsClients = new Map<number, WebSocket>()
let nextWsClientId = 1

process.on('message', (msg: unknown) => {
  if (!msg || typeof msg !== 'object') return
  const m = msg as Record<string, unknown>

  // Invoke result from Electron
  if (m.type === 'invoke-result') {
    const id = m.id as string
    const pending = pendingInvokes.get(id)
    if (pending) {
      pendingInvokes.delete(id)
      clearTimeout(pending.timer)
      pending.resolve(m.result)
    }
  }

  // Event from Electron (PTY data, exit, state, metadata)
  if (m.type === 'event') {
    const channel = m.channel as string
    const payload = m.payload
    const message = JSON.stringify({ type: 'event', channel, payload })

    // Broadcast to all WebSocket clients
    for (const ws of wsClients.values()) {
      if (ws.readyState === ws.OPEN) {
        try { ws.send(message) } catch { /* ignore */ }
      }
    }
  }
})

// --- Express ---
const app = express()
const httpServer = createServer(app)

app.use('/api', express.json({ limit: '50mb' }))

// No auth needed (internal network)

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', mode: 'proxy', uptime: process.uptime() })
})

app.post('/api/invoke', async (req, res) => {
  const { channel, payload } = req.body as { channel?: string; payload?: unknown }
  if (!channel || typeof channel !== 'string') {
    res.status(400).json({ error: 'Missing channel' })
    return
  }

  // Get the WS client ID from header (for PTY attach/detach)
  const clientIdHeader = req.headers['x-client-id']
  const senderId = clientIdHeader ? Number(clientIdHeader) : 0

  try {
    const result = await invokeElectron(channel, payload, senderId)
    res.json(result)
  } catch (err) {
    res.status(500).json({
      __opencoveIpcEnvelope: true,
      ok: false,
      error: { code: 'common.unexpected', debugMessage: String(err) },
    })
  }
})

// --- WebSocket ---
const wss = new WebSocketServer({ noServer: true })

httpServer.on('upgrade', (request: IncomingMessage, socket, head) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)
  if (url.pathname !== '/api/ws') {
    socket.destroy()
    return
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws)
  })
})

wss.on('connection', (ws: WebSocket) => {
  const clientId = nextWsClientId++
  wsClients.set(clientId, ws)

  ws.send(JSON.stringify({ type: 'hello', clientId }))

  const pingInterval = setInterval(() => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: 'ping', ts: Date.now() }))
    }
  }, 30_000)

  ws.on('close', () => {
    clearInterval(pingInterval)
    wsClients.delete(clientId)
  })

  ws.on('message', async (rawData) => {
    let msg: Record<string, unknown>
    try { msg = JSON.parse(rawData.toString()) } catch { return }

    if (msg.type === 'request') {
      // Forward invoke to Electron
      try {
        const result = await invokeElectron(
          msg.channel as string,
          msg.payload,
          clientId,
        )
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({ type: 'response', id: msg.id, ...result as object }))
        }
      } catch {
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({
            type: 'response', id: msg.id,
            __opencoveIpcEnvelope: true, ok: false,
            error: { code: 'common.unexpected' },
          }))
        }
      }
    }

    if (msg.type === 'pty-write') {
      // Fire-and-forget PTY write via Electron
      invokeElectron('pty:write', {
        sessionId: msg.sessionId,
        data: msg.data,
        encoding: msg.encoding || 'utf8',
      }).catch(() => {})
    }

    if (msg.type === 'pty-resize') {
      invokeElectron('pty:resize', {
        sessionId: msg.sessionId,
        cols: msg.cols,
        rows: msg.rows,
      }).catch(() => {})
    }

    if (msg.type === 'pong') {
      // heartbeat ok
    }
  })
})

// --- Static SPA ---
const webDistCandidates = [
  process.env.OPENCOVE_WEB_DIST,
  resolve(__dirname, '..', 'web'),
].filter(Boolean) as string[]
const webDistDir = webDistCandidates.find(d => existsSync(d)) || ''
const indexHtml = webDistDir
  ? (existsSync(resolve(webDistDir, 'index.html'))
    ? resolve(webDistDir, 'index.html')
    : resolve(webDistDir, 'index-web.html'))
  : ''

if (webDistDir && existsSync(webDistDir) && indexHtml && existsSync(indexHtml)) {
  app.use(express.static(webDistDir))
  app.get('/{*path}', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(indexHtml)
    }
  })
}

// --- LAN info ---
function getLanAddresses(): string[] {
  const addrs: string[] = []
  const nets = networkInterfaces()
  for (const iface of Object.values(nets)) {
    if (!iface) continue
    for (const info of iface) {
      if (info.family === 'IPv4' && !info.internal) addrs.push(info.address)
    }
  }
  return addrs
}

// --- Start ---
httpServer.listen(port, '0.0.0.0', () => {
  const lanAddrs = getLanAddresses()
  console.log(`OpenCove Proxy Server on port ${port}`)
  for (const ip of lanAddrs) {
    console.log(`  LAN: http://${ip}:${port}`)
  }
})

process.on('SIGTERM', () => {
  httpServer.close()
  process.exit(0)
})
