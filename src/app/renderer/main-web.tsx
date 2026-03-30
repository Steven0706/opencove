/**
 * Web mode entry point for OpenCove.
 *
 * Injects the WebSocket/HTTP-based opencoveApi before mounting the React app.
 * The same React components and hooks run in both Electron and web mode.
 */
// Polyfill crypto.randomUUID for insecure contexts (HTTP over LAN IP)
if (typeof crypto.randomUUID !== 'function') {
  crypto.randomUUID = () =>
    '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c =>
      (+c ^ (crypto.getRandomValues(new Uint8Array(1))[0]! & (15 >> (+c / 4)))).toString(16),
    ) as `${string}-${string}-${string}-${string}-${string}`
}

import { createWebApi } from '../web-bridge/createWebApi'

// Extract token from URL query param or sessionStorage
const params = new URLSearchParams(window.location.search)
const urlToken = params.get('token') || ''
const storedToken = sessionStorage.getItem('opencove-token') || ''
const token = urlToken || storedToken

if (token) {
  // Store token and strip from URL for security
  sessionStorage.setItem('opencove-token', token)
  if (urlToken) {
    const cleanUrl = window.location.pathname + window.location.hash
    window.history.replaceState(null, '', cleanUrl)
  }
}

// Determine WebSocket URL
const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
const wsUrl = `${wsProtocol}//${window.location.host}/api/ws?token=${encodeURIComponent(token)}`

// Inject the web bridge as window.opencoveApi
;(window as unknown as { opencoveApi: unknown }).opencoveApi = createWebApi({ token, wsUrl })

// Now boot the app (same as Electron mode)
import('./bootstrap/renderApp').then(m => m.renderApp())
