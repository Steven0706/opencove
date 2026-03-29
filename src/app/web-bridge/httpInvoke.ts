/**
 * HTTP-based IPC invoke for web mode.
 *
 * Replaces ipcRenderer.invoke() — sends request to /api/invoke endpoint,
 * unwraps the IpcInvokeResult envelope, and returns the value or throws.
 */

let _token: string = ''

export function setToken(token: string): void {
  _token = token
}

export function getToken(): string {
  return _token
}

interface IpcEnvelope {
  __opencoveIpcEnvelope: true
  ok: boolean
  value?: unknown
  error?: { code: string; debugMessage?: string; params?: Record<string, unknown> }
}

export async function invokeHttp<T>(channel: string, payload?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (_token) {
    headers.Authorization = `Bearer ${_token}`
  }

  const response = await fetch('/api/invoke', {
    method: 'POST',
    headers,
    body: JSON.stringify({ channel, payload }),
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }

  const result = (await response.json()) as IpcEnvelope

  if (result.__opencoveIpcEnvelope) {
    if (result.ok) {
      return result.value as T
    }
    const errorMsg = result.error?.debugMessage || result.error?.code || 'Unknown error'
    throw new Error(errorMsg)
  }

  // Non-envelope response (shouldn't happen but handle gracefully)
  return result as unknown as T
}
