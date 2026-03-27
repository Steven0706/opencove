import { ipcMain } from 'electron'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { IPC_CHANNELS } from '../../../../shared/contracts/ipc'
import { registerHandledIpc } from '../../../../app/main/ipc/handle'
import type {
  WhisperTranscribeInput,
  WhisperTranscribeResult,
  WhisperAuthResult,
  WhisperHistoryInput,
  WhisperHistoryResult,
} from '../../../../shared/contracts/dto/whisper'

// Load .env.local if present (for Whisper config)
function loadEnvLocal(): Record<string, string> {
  const vars: Record<string, string> = {}
  try {
    // Try project root (dev) then app resources (prod)
    const candidates = [
      join(process.cwd(), '.env.local'),
      join(__dirname, '../../.env.local'),
    ]
    for (const path of candidates) {
      try {
        const content = readFileSync(path, 'utf-8')
        for (const line of content.split('\n')) {
          const match = line.match(/^([A-Z_]+)=(.*)$/)
          if (match) vars[match[1]] = match[2].trim()
        }
        break
      } catch { /* try next */ }
    }
  } catch { /* ignore */ }
  return vars
}

const envLocal = loadEnvLocal()
const WHISPER_API_BASE = process.env.OPENCOVE_WHISPER_URL || envLocal.OPENCOVE_WHISPER_URL || 'http://localhost:9000/api'
const WHISPER_PASSWORD = process.env.OPENCOVE_WHISPER_PASSWORD || envLocal.OPENCOVE_WHISPER_PASSWORD || ''

export interface IpcRegistrationDisposable {
  dispose: () => void
}

export function registerWhisperIpcHandlers(): IpcRegistrationDisposable {
  registerHandledIpc<WhisperTranscribeResult, WhisperTranscribeInput>(
    IPC_CHANNELS.whisperTranscribe,
    async (_event, payload) => {
      const response = await fetch(`${WHISPER_API_BASE}/transcribe/json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audio: payload.audioBase64,
          filename: payload.filename,
          language: null,
          task: 'transcribe',
        }),
      })

      if (!response.ok) {
        throw new Error(`Whisper API returned ${response.status}: ${response.statusText}`)
      }

      const result = (await response.json()) as { text?: string; success?: boolean; processing_time?: number }
      return {
        text: result.text ?? '',
        success: result.success !== false,
        processingTime: result.processing_time,
      }
    },
    { defaultErrorCode: 'whisper.transcribe_failed' },
  )

  registerHandledIpc<WhisperAuthResult>(
    IPC_CHANNELS.whisperAuth,
    async () => {
      const response = await fetch(`${WHISPER_API_BASE}/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `password=${WHISPER_PASSWORD}`,
      })

      if (!response.ok) {
        throw new Error(`Whisper auth returned ${response.status}: ${response.statusText}`)
      }

      const result = (await response.json()) as { token?: string }
      if (!result.token) {
        throw new Error('Whisper auth response missing token')
      }

      return { token: result.token }
    },
    { defaultErrorCode: 'whisper.auth_failed' },
  )

  registerHandledIpc<WhisperHistoryResult, WhisperHistoryInput>(
    IPC_CHANNELS.whisperHistory,
    async (_event, payload) => {
      const url = `${WHISPER_API_BASE}/history?limit=5&offset=0&token=${encodeURIComponent(payload.token)}`
      const response = await fetch(url)

      if (!response.ok) {
        throw new Error(`Whisper history returned ${response.status}: ${response.statusText}`)
      }

      const result = (await response.json()) as { items?: Array<{ text: string; timestamp: string }> }
      return { items: result.items ?? [] }
    },
    { defaultErrorCode: 'whisper.history_failed' },
  )

  return {
    dispose: () => {
      ipcMain.removeHandler(IPC_CHANNELS.whisperTranscribe)
      ipcMain.removeHandler(IPC_CHANNELS.whisperAuth)
      ipcMain.removeHandler(IPC_CHANNELS.whisperHistory)
    },
  }
}
