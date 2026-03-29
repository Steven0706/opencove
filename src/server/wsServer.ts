/**
 * WebSocket server for OpenCove web mode.
 *
 * Handles:
 * - PTY event streaming (data, exit, state, metadata)
 * - Request/response over WebSocket (alternative to HTTP POST)
 * - PTY write/resize fire-and-forget messages
 * - Heartbeat ping/pong
 */
import { WebSocketServer, type WebSocket } from 'ws'
import type { Server as HttpServer, IncomingMessage } from 'node:http'
import { URL } from 'node:url'
import crypto from 'node:crypto'
import { addClient, getClientWs } from './wsClientManager'
import { invokeHandler } from './handleRegistry'
import type { PtyRuntime } from '../contexts/terminal/presentation/main-ipc/runtime'

const PING_INTERVAL_MS = 30_000

interface WsClientRequest {
  type: 'request'
  id: string
  channel: string
  payload?: unknown
}

interface WsClientPtyWrite {
  type: 'pty-write'
  sessionId: string
  data: string
  encoding?: 'utf8' | 'binary'
}

interface WsClientPtyResize {
  type: 'pty-resize'
  sessionId: string
  cols: number
  rows: number
}

interface WsClientPong {
  type: 'pong'
  ts: number
}

type WsClientMessage = WsClientRequest | WsClientPtyWrite | WsClientPtyResize | WsClientPong

function isValidMessage(data: unknown): data is WsClientMessage {
  return data !== null && typeof data === 'object' && 'type' in (data as Record<string, unknown>)
}

export function createWebSocketServer(
  httpServer: HttpServer,
  token: string,
  ptyRuntime: PtyRuntime,
  noAuth: boolean = false,
): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true })

  // Handle HTTP upgrade
  httpServer.on('upgrade', (request: IncomingMessage, socket, head) => {
    const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)

    if (url.pathname !== '/api/ws') {
      socket.destroy()
      return
    }

    // Validate token (skipped in no-auth mode)
    if (!noAuth) {
      const requestToken = url.searchParams.get('token')
      if (!requestToken || !timingSafeEqual(requestToken, token)) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
        socket.destroy()
        return
      }
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request)
    })
  })

  // Handle new connections
  wss.on('connection', (ws: WebSocket) => {
    const clientId = addClient(ws)

    // Send hello message
    ws.send(JSON.stringify({
      type: 'hello',
      clientId,
    }))

    // Heartbeat
    const pingInterval = setInterval(() => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: 'ping', ts: Date.now() }))
      }
    }, PING_INTERVAL_MS)

    ws.on('close', () => {
      clearInterval(pingInterval)
    })

    // Handle messages
    ws.on('message', async (rawData) => {
      let msg: unknown
      try {
        msg = JSON.parse(rawData.toString())
      } catch {
        return
      }

      if (!isValidMessage(msg)) {
        return
      }

      switch (msg.type) {
        case 'request': {
          const result = await invokeHandler(msg.channel, clientId, msg.payload)
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({
              type: 'response',
              id: msg.id,
              ...result,
            }))
          }
          break
        }

        case 'pty-write': {
          try {
            ptyRuntime.write(msg.sessionId, msg.data, msg.encoding ?? 'utf8')
          } catch {
            // ignore write errors for fire-and-forget
          }
          break
        }

        case 'pty-resize': {
          try {
            ptyRuntime.resize(msg.sessionId, msg.cols, msg.rows)
          } catch {
            // ignore resize errors for fire-and-forget
          }
          break
        }

        case 'pong': {
          // Client responded to ping — connection is alive
          break
        }
      }
    })
  })

  return wss
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false
  }

  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  return crypto.timingSafeEqual(bufA, bufB)
}
