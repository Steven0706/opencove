import type { WebSocket } from 'ws'

interface ClientConnection {
  ws: WebSocket
  id: number
  disconnectCallbacks: Set<() => void>
}

let nextClientId = 1

const clients = new Map<number, ClientConnection>()

export function addClient(ws: WebSocket): number {
  const id = nextClientId++
  const connection: ClientConnection = {
    ws,
    id,
    disconnectCallbacks: new Set(),
  }

  clients.set(id, connection)

  ws.on('close', () => {
    const conn = clients.get(id)
    if (conn) {
      for (const cb of conn.disconnectCallbacks) {
        try {
          cb()
        } catch {
          // ignore callback errors
        }
      }
      clients.delete(id)
    }
  })

  return id
}

export function removeClient(id: number): void {
  clients.delete(id)
}

export function sendToClient(clientId: number, channel: string, payload: unknown): void {
  const conn = clients.get(clientId)
  if (!conn || conn.ws.readyState !== conn.ws.OPEN) {
    return
  }

  try {
    conn.ws.send(JSON.stringify({ type: 'event', channel, payload }))
  } catch {
    // ignore send failures
  }
}

export function sendToAllClients(channel: string, payload: unknown): void {
  const message = JSON.stringify({ type: 'event', channel, payload })
  for (const conn of clients.values()) {
    if (conn.ws.readyState === conn.ws.OPEN) {
      try {
        conn.ws.send(message)
      } catch {
        // ignore
      }
    }
  }
}

export function onClientDisconnect(clientId: number, callback: () => void): boolean {
  const conn = clients.get(clientId)
  if (!conn) {
    return false
  }

  conn.disconnectCallbacks.add(callback)
  return true
}

export function getClientIds(): number[] {
  return [...clients.keys()]
}

export function getClientWs(clientId: number): WebSocket | null {
  return clients.get(clientId)?.ws ?? null
}
