import React from 'react'
import ReactDOM from 'react-dom/client'
import { I18nProvider } from '../i18n'
import AppShell from '../shell/AppShell'
import '../styles.css'

export function renderApp(): void {
  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <I18nProvider>
        <AppShell />
      </I18nProvider>
    </React.StrictMode>,
  )

  // Expose live node state for the web server proxy to read via executeJavaScript.
  // This lets remote web clients know current sessionIds and attach to live terminals.
  // Expose live node state for remote web clients via executeJavaScript.
  // We delay registration to ensure the store is available after hydration.
  setTimeout(() => {
    try {
      // Import at module level won't work in packaged builds via require(),
      // so we use dynamic import pattern that esbuild/vite preserves.
      import('../shell/store/useAppStore').then(({ useAppStore }) => {
        ;(window as unknown as Record<string, unknown>).__opencoveGetLiveNodes = () => {
          try {
            const state = useAppStore.getState()
            const result: Array<{
              id: string
              sessionId: string | null
              kind: string
              status: string | null
            }> = []
            for (const ws of state.workspaces) {
              for (const node of ws.nodes) {
                result.push({
                  id: node.id,
                  sessionId: node.data?.sessionId ?? null,
                  kind: node.data?.kind ?? 'unknown',
                  status: node.data?.status ?? null,
                })
              }
            }
            return JSON.stringify(result)
          } catch {
            return '[]'
          }
        }
      })
    } catch {
      // ignore
    }
  }, 3000)
}
