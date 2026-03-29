/**
 * OpenCove Web Server
 *
 * Standalone Node.js server (no Electron) that serves the OpenCove React SPA
 * and provides the same backend capabilities as the Electron main process.
 *
 * Usage:
 *   node out/server/index.js [--port=3200] [--host=0.0.0.0] [--data-dir=~/.opencove-server] [--token=xxx]
 *
 * Token can also be set via OPENCOVE_TOKEN environment variable.
 * If not provided, a random token is generated on each startup.
 *
 * Connection info is always written to: {data-dir}/web-server.json
 * You can read the token from there at any time:
 *   cat ~/.opencove-server/web-server.json
 *
 * In development:
 *   tsx src/server/index.ts --dev
 */
// MUST run before any other imports: re-prioritize NODE_PATH modules
// so server-modules (system-node-compatible) is found before
// app.asar.unpacked/node_modules (Electron-ABI-compiled).
import Module from 'node:module'
if (process.env.NODE_PATH) {
  ;(Module as unknown as { _initPaths: () => void })._initPaths()
}

import express from 'express'
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs'
import { hostname, networkInterfaces } from 'node:os'
import { resolveServerConfig } from './config'
import { invokeHandler } from './handleRegistry'
import { createWebSocketServer } from './wsServer'
import { createServerPtyRuntime } from './createServerPtyRuntime'
import { createServerApprovedWorkspaceStore } from './approvedWorkspaceStore'
import { registerAllServerHandlers } from './registerAllHandlers'

// Set OPENCOVE_DATA_DIR so the electron shim can use it
const config = resolveServerConfig()
process.env.OPENCOVE_DATA_DIR = config.userDataDir

// Ensure data directory exists
if (!existsSync(config.userDataDir)) {
  mkdirSync(config.userDataDir, { recursive: true })
}

// --- Create core services ---
const approvedWorkspaces = createServerApprovedWorkspaceStore(config.userDataDir)
const ptyRuntime = createServerPtyRuntime(config.userDataDir)

// --- Register all IPC handlers ---
const handlerDisposable = registerAllServerHandlers({
  ptyRuntime,
  approvedWorkspaces,
  userDataDir: config.userDataDir,
})

// --- Express app ---
const app = express()
const httpServer = createServer(app)

// JSON body parser for /api/invoke
app.use('/api', express.json({ limit: '50mb' }))

// Auth middleware for /api routes (skipped when --no-auth)
if (!config.noAuth) {
  app.use('/api', (req, res, next) => {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const requestToken = authHeader.slice(7)
    if (requestToken !== config.token) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    next()
  })
}

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() })
})

// Universal IPC invoke endpoint
app.post('/api/invoke', async (req, res) => {
  const { channel, payload } = req.body as { channel?: string; payload?: unknown }
  if (!channel || typeof channel !== 'string') {
    res.status(400).json({ error: 'Missing or invalid channel' })
    return
  }

  // Use a default clientId for HTTP requests (0 = no WebSocket association)
  const clientIdHeader = req.headers['x-client-id']
  const clientId = clientIdHeader ? Number(clientIdHeader) : 0

  const result = await invokeHandler(channel, clientId, payload)
  res.json(result)
})

// --- WebSocket server ---
createWebSocketServer(httpServer, config.token, ptyRuntime, config.noAuth)

// --- Static file serving (production SPA) ---
const webDistCandidates = [
  process.env.OPENCOVE_WEB_DIST,                  // passed by Electron host
  resolve(__dirname, '..', 'web'),                 // out/server/ → out/web/
].filter(Boolean) as string[]
const webDistDir = webDistCandidates.find(d => existsSync(d)) || webDistCandidates[0] || resolve(__dirname, '..', 'web')
const indexHtml = existsSync(resolve(webDistDir, 'index.html'))
  ? resolve(webDistDir, 'index.html')
  : resolve(webDistDir, 'index-web.html')

if (existsSync(webDistDir) && existsSync(indexHtml)) {
  app.use(express.static(webDistDir))
  // SPA fallback: serve index.html for non-API routes
  app.get('/{*path}', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(indexHtml)
    }
  })
} else if (config.isDev) {
  // In dev mode, proxy to Vite dev server
  app.get('/', (_req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html>
        <head><title>OpenCove Dev</title></head>
        <body>
          <h2>OpenCove Web Server (dev mode)</h2>
          <p>The API server is running. Start the Vite dev server separately:</p>
          <pre>pnpm exec vite --config vite.config.web.ts</pre>
          <p>Then open the Vite dev server URL in your browser.</p>
        </body>
      </html>
    `)
  })
}

// --- Resolve LAN IP addresses ---
function getLanAddresses(): string[] {
  const addrs: string[] = []
  const nets = networkInterfaces()
  for (const iface of Object.values(nets)) {
    if (!iface) continue
    for (const info of iface) {
      if (info.family === 'IPv4' && !info.internal) {
        addrs.push(info.address)
      }
    }
  }
  return addrs
}

// --- Write connection info to file ---
const connectionInfoPath = resolve(config.userDataDir, 'web-server.json')

function writeConnectionInfo(): void {
  const lanAddrs = getLanAddresses()
  const info = {
    pid: process.pid,
    hostname: hostname(),
    host: config.host,
    port: config.port,
    token: config.token,
    url: `http://localhost:${config.port}`,
    lanUrls: lanAddrs.map(ip => `http://${ip}:${config.port}?token=${config.token}`),
    dataDir: config.userDataDir,
    startedAt: new Date().toISOString(),
  }

  try {
    writeFileSync(connectionInfoPath, JSON.stringify(info, null, 2) + '\n', {
      encoding: 'utf-8',
      mode: 0o600,
    })
  } catch {
    // ignore
  }
}

function removeConnectionInfo(): void {
  try {
    unlinkSync(connectionInfoPath)
  } catch {
    // ignore
  }
}

// --- Start ---
httpServer.listen(config.port, config.host, () => {
  writeConnectionInfo()

  const lanAddrs = getLanAddresses()

  console.log('')
  console.log('╔══════════════════════════════════════════════════════════╗')
  console.log('║              OpenCove Web Server                        ║')
  console.log('╠══════════════════════════════════════════════════════════╣')
  console.log(`║  Port:   ${config.port}`)
  console.log(`║  Data:   ${config.userDataDir}`)
  console.log(`║  Token:  ${config.token}`)
  console.log('║                                                          ║')
  console.log('║  Open in browser (copy the full URL):                    ║')
  console.log(`║  Local:  http://localhost:${config.port}?token=${config.token}`)
  for (const ip of lanAddrs) {
    console.log(`║  LAN:    http://${ip}:${config.port}?token=${config.token}`)
  }
  console.log('║                                                          ║')
  console.log(`║  Connection info saved to:                               ║`)
  console.log(`║  ${connectionInfoPath}`)
  console.log('╚══════════════════════════════════════════════════════════╝')
  console.log('')
})

// --- Graceful shutdown ---
function shutdown() {
  console.log('\nShutting down...')
  removeConnectionInfo()
  handlerDisposable.dispose()
  ptyRuntime.dispose()
  httpServer.close(() => {
    process.exit(0)
  })

  // Force exit after 5 seconds
  setTimeout(() => {
    process.exit(1)
  }, 5000)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
