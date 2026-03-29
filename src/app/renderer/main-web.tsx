/**
 * Web mode entry point for OpenCove.
 *
 * Injects the WebSocket/HTTP-based opencoveApi before mounting the React app.
 * The same React components and hooks run in both Electron and web mode.
 */
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
