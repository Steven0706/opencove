/**
 * WebSocket connection manager for web mode.
 *
 * Provides:
 * - Auto-reconnect with exponential backoff
 * - Event subscription (on/off) for server push events
 * - Request/response correlation for WS-based invoke
 * - Heartbeat pong responses
 */

type EventListener = (payload: unknown) => void
type UnsubscribeFn = () => void

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

const REQUEST_TIMEOUT_MS = 30_000
const RECONNECT_BASE_DELAY_MS = 500
const RECONNECT_MAX_DELAY_MS = 15_000

export class WsConnection {
  private ws: WebSocket | null = null
  private url: string
  private listeners = new Map<string, Set<EventListener>>()
  private pendingRequests = new Map<string, PendingRequest>()
  private reconnectAttempt = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private disposed = false
  private clientId: number = 0
  private onConnected: (() => void) | null = null

  constructor(url: string) {
    this.url = url
    this.connect()
  }

  private connect(): void {
    if (this.disposed) return

    try {
      this.ws = new WebSocket(this.url)
    } catch {
      this.scheduleReconnect()
      return
    }

    this.ws.onopen = () => {
      this.reconnectAttempt = 0
    }

    this.ws.onmessage = (event) => {
      let msg: Record<string, unknown>
      try {
        msg = JSON.parse(event.data as string) as Record<string, unknown>
      } catch {
        return
      }

      switch (msg.type) {
        case 'hello': {
          this.clientId = msg.clientId as number
          if (this.onConnected) this.onConnected()
          break
        }

        case 'event': {
          const channel = msg.channel as string
          const payload = msg.payload
          const channelListeners = this.listeners.get(channel)
          if (channelListeners) {
            for (const listener of channelListeners) {
              try {
                listener(payload)
              } catch {
                // ignore listener errors
              }
            }
          }
          break
        }

        case 'response': {
          const id = msg.id as string
          const pending = this.pendingRequests.get(id)
          if (pending) {
            this.pendingRequests.delete(id)
            clearTimeout(pending.timer)

            if (msg.ok) {
              pending.resolve(msg.value)
            } else {
              const error = msg.error as { debugMessage?: string; code?: string } | undefined
              pending.reject(new Error(error?.debugMessage || error?.code || 'Request failed'))
            }
          }
          break
        }

        case 'ping': {
          this.send({ type: 'pong', ts: Date.now() })
          break
        }
      }
    }

    this.ws.onclose = () => {
      this.ws = null
      // Reject all pending requests
      for (const [id, pending] of this.pendingRequests) {
        clearTimeout(pending.timer)
        pending.reject(new Error('WebSocket connection closed'))
        this.pendingRequests.delete(id)
      }
      this.scheduleReconnect()
    }

    this.ws.onerror = () => {
      // onclose will fire after onerror
    }
  }

  private scheduleReconnect(): void {
    if (this.disposed || this.reconnectTimer) return

    const delay = Math.min(
      RECONNECT_BASE_DELAY_MS * 2 ** this.reconnectAttempt,
      RECONNECT_MAX_DELAY_MS,
    )
    this.reconnectAttempt++

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, delay)
  }

  private send(data: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data))
    }
  }

  on(channel: string, listener: EventListener): UnsubscribeFn {
    let set = this.listeners.get(channel)
    if (!set) {
      set = new Set()
      this.listeners.set(channel, set)
    }
    set.add(listener)

    return () => {
      set!.delete(listener)
      if (set!.size === 0) {
        this.listeners.delete(channel)
      }
    }
  }

  async invoke<T>(channel: string, payload?: unknown): Promise<T> {
    // crypto.randomUUID() is unavailable in insecure contexts (HTTP over LAN IP)
    const id = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new Error(`Request timeout: ${channel}`))
      }, REQUEST_TIMEOUT_MS)

      this.pendingRequests.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
        timer,
      })

      this.send({ type: 'request', id, channel, payload })
    })
  }

  sendPtyWrite(sessionId: string, data: string, encoding: string = 'utf8'): void {
    this.send({ type: 'pty-write', sessionId, data, encoding })
  }

  sendPtyResize(sessionId: string, cols: number, rows: number): void {
    this.send({ type: 'pty-resize', sessionId, cols, rows })
  }

  getClientId(): number {
    return this.clientId
  }

  setOnConnected(callback: () => void): void {
    this.onConnected = callback
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN
  }

  dispose(): void {
    this.disposed = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
    }
    if (this.ws) {
      this.ws.close()
    }
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timer)
      pending.reject(new Error('Connection disposed'))
    }
    this.pendingRequests.clear()
    this.listeners.clear()
  }
}
