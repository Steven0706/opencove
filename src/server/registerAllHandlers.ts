/**
 * Server-mode handler registration.
 *
 * Mirrors src/app/main/ipc/registerIpcHandlers.ts but uses the server-side
 * registerHandledIpc and skips Electron-only handlers.
 */
import { resolve } from 'node:path'
import { mkdirSync, existsSync } from 'node:fs'
import type { PersistenceStore } from '../platform/persistence/sqlite/PersistenceStore'
import { createPersistenceStore } from '../platform/persistence/sqlite/PersistenceStore'
import { registerPersistenceIpcHandlers } from '../platform/persistence/sqlite/ipc/register'
import { registerWorkspaceIpcHandlers } from '../contexts/workspace/presentation/main-ipc/register'
import { registerWorktreeIpcHandlers } from '../contexts/worktree/presentation/main-ipc/register'
import { registerIntegrationIpcHandlers } from '../contexts/integration/presentation/main-ipc/register'
import { registerPtyIpcHandlers } from '../contexts/terminal/presentation/main-ipc/register'
import { registerAgentIpcHandlers } from '../contexts/agent/presentation/main-ipc/register'
import { registerTaskIpcHandlers } from '../contexts/task/presentation/main-ipc/register'
import { registerWhisperIpcHandlers } from '../contexts/whisper/presentation/main-ipc/register'
import { registerPgViewerIpcHandlers } from '../contexts/pgViewer/presentation/main-ipc/register'
import { registerAdminIpcHandlers } from '../contexts/admin/presentation/main-ipc/register'
import { registerReleaseNotesIpcHandlers } from '../contexts/releaseNotes/presentation/main-ipc/register'
import { createReleaseNotesService } from '../contexts/releaseNotes/infrastructure/main/ReleaseNotesService'
import type { PtyRuntime } from '../contexts/terminal/presentation/main-ipc/runtime'
import type { ApprovedWorkspaceStore } from '../contexts/workspace/infrastructure/approval/ApprovedWorkspaceStore'

export interface ServerHandlerDeps {
  ptyRuntime: PtyRuntime
  approvedWorkspaces: ApprovedWorkspaceStore
  userDataDir: string
}

interface Disposable {
  dispose: () => void
}

export function registerAllServerHandlers(deps: ServerHandlerDeps): Disposable {
  const { ptyRuntime, approvedWorkspaces, userDataDir } = deps

  // Ensure data directory exists
  if (!existsSync(userDataDir)) {
    mkdirSync(userDataDir, { recursive: true })
  }

  const releaseNotesService = createReleaseNotesService()

  // Lazy persistence store (same pattern as Electron)
  let persistenceStorePromise: Promise<PersistenceStore> | null = null
  const getPersistenceStore = async (): Promise<PersistenceStore> => {
    if (persistenceStorePromise) {
      return await persistenceStorePromise
    }

    const dbPath = resolve(userDataDir, 'opencove.db')
    const nextStorePromise = createPersistenceStore({ dbPath }).catch(error => {
      if (persistenceStorePromise === nextStorePromise) {
        persistenceStorePromise = null
      }
      throw error
    })
    persistenceStorePromise = nextStorePromise
    return await persistenceStorePromise
  }

  const disposables: Disposable[] = [
    // Skip: registerClipboardIpcHandlers (handled client-side in browser)
    // Skip: registerAppUpdateIpcHandlers (not applicable in web mode)
    // Skip: registerWindowChromeIpcHandlers (not applicable in web mode)
    // Skip: registerWindowMetricsIpcHandlers (handled client-side in browser)
    registerReleaseNotesIpcHandlers(releaseNotesService),
    registerWorkspaceIpcHandlers(approvedWorkspaces),
    registerPersistenceIpcHandlers(getPersistenceStore),
    registerWorktreeIpcHandlers(approvedWorkspaces),
    registerIntegrationIpcHandlers(approvedWorkspaces),
    registerPtyIpcHandlers(ptyRuntime, approvedWorkspaces),
    registerAgentIpcHandlers(ptyRuntime, approvedWorkspaces),
    registerTaskIpcHandlers(approvedWorkspaces),
    registerWhisperIpcHandlers(),
    registerPgViewerIpcHandlers(),
    registerAdminIpcHandlers(),
  ]

  return {
    dispose: () => {
      for (let i = disposables.length - 1; i >= 0; i--) {
        disposables[i]?.dispose()
      }

      const storePromise = persistenceStorePromise
      persistenceStorePromise = null
      storePromise
        ?.then(store => store.dispose())
        .catch(() => {})
    },
  }
}
