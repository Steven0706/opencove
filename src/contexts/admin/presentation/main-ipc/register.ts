import * as fs from 'node:fs'
import * as path from 'node:path'
import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../../../shared/contracts/ipc'
import { registerHandledIpc } from '../../../../app/main/ipc/handle'

export interface LlmProxyInput {
  url: string
  method: string
  headers: Record<string, string>
  body: string
}

export interface LlmProxyResult {
  status: number
  body: string
}

export interface SaveProjectFileInput {
  workspacePath: string
  filename: string
  content: string
  purpose: string
}

export interface SaveProjectFileResult {
  success: boolean
  path: string
}

export interface ListProjectFilesInput {
  workspacePath: string
}

export interface ListProjectFilesResult {
  files: Array<{ filename: string; purpose: string; path: string }>
}

export interface ReadProjectFileInput {
  workspacePath: string
  filename: string
}

export interface ReadProjectFileResult {
  content: string
}

interface ProjectFileRegistryEntry {
  filename: string
  purpose: string
  createdAt: string
}

function getRegistryPath(workspacePath: string): string {
  return path.join(workspacePath, '.opencove', 'registry.json')
}

function readRegistry(workspacePath: string): ProjectFileRegistryEntry[] {
  const registryPath = getRegistryPath(workspacePath)
  try {
    const raw = fs.readFileSync(registryPath, 'utf-8')
    return JSON.parse(raw) as ProjectFileRegistryEntry[]
  } catch {
    return []
  }
}

function writeRegistry(workspacePath: string, entries: ProjectFileRegistryEntry[]): void {
  const registryPath = getRegistryPath(workspacePath)
  const dir = path.dirname(registryPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(registryPath, JSON.stringify(entries, null, 2), 'utf-8')
}

interface IpcRegistrationDisposable {
  dispose: () => void
}

export function registerAdminIpcHandlers(): IpcRegistrationDisposable {
  registerHandledIpc<LlmProxyResult, LlmProxyInput>(
    IPC_CHANNELS.adminLlmProxy,
    async (_event, payload) => {
      const response = await fetch(payload.url, {
        method: payload.method,
        headers: payload.headers,
        body: payload.body,
      })
      const body = await response.text()
      return { status: response.status, body }
    },
    { defaultErrorCode: 'common.unexpected' },
  )

  registerHandledIpc<SaveProjectFileResult, SaveProjectFileInput>(
    IPC_CHANNELS.adminSaveProjectFile,
    async (_event, payload) => {
      const dir = path.join(payload.workspacePath, '.opencove')
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      const filePath = path.join(dir, payload.filename)
      fs.writeFileSync(filePath, payload.content, 'utf-8')

      const registry = readRegistry(payload.workspacePath)
      const existingIndex = registry.findIndex(e => e.filename === payload.filename)
      const entry: ProjectFileRegistryEntry = {
        filename: payload.filename,
        purpose: payload.purpose,
        createdAt: new Date().toISOString(),
      }
      if (existingIndex >= 0) {
        registry[existingIndex] = entry
      } else {
        registry.push(entry)
      }
      writeRegistry(payload.workspacePath, registry)

      return { success: true, path: filePath }
    },
    { defaultErrorCode: 'common.unexpected' },
  )

  registerHandledIpc<ListProjectFilesResult, ListProjectFilesInput>(
    IPC_CHANNELS.adminListProjectFiles,
    async (_event, payload) => {
      const registry = readRegistry(payload.workspacePath)
      return {
        files: registry.map(e => ({
          filename: e.filename,
          purpose: e.purpose,
          path: path.join(payload.workspacePath, '.opencove', e.filename),
        })),
      }
    },
    { defaultErrorCode: 'common.unexpected' },
  )

  registerHandledIpc<ReadProjectFileResult, ReadProjectFileInput>(
    IPC_CHANNELS.adminReadProjectFile,
    async (_event, payload) => {
      const filePath = path.join(payload.workspacePath, '.opencove', payload.filename)
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${payload.filename}`)
      }
      const content = fs.readFileSync(filePath, 'utf-8')
      return { content }
    },
    { defaultErrorCode: 'common.unexpected' },
  )

  return {
    dispose: () => {
      ipcMain.removeHandler(IPC_CHANNELS.adminLlmProxy)
      ipcMain.removeHandler(IPC_CHANNELS.adminSaveProjectFile)
      ipcMain.removeHandler(IPC_CHANNELS.adminListProjectFiles)
      ipcMain.removeHandler(IPC_CHANNELS.adminReadProjectFile)
    },
  }
}
