import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import https from 'node:https'
import http from 'node:http'
import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../../../shared/contracts/ipc'
import { registerHandledIpc } from '../../../../app/main/ipc/handle'
import type {
  WhisperTranscribeInput,
  WhisperTranscribeResult,
} from '../../../../shared/contracts/dto'
import type { IpcRegistrationDisposable } from '../../../../app/main/ipc/types'

// Load .env.local if present (for Whisper config)
function loadEnvLocal(): Record<string, string> {
  const vars: Record<string, string> = {}
  const candidates = [
    join(process.cwd(), '.env.local'),
    join(__dirname, '../../.env.local'),
  ]
  for (const path of candidates) {
    try {
      const content = readFileSync(path, 'utf-8')
      for (const line of content.split('\n')) {
        const match = line.match(/^([A-Z_]+)=(.*)$/)
        if (match) {
          vars[match[1]] = match[2].trim()
        }
      }
      break
    } catch {
      /* try next */
    }
  }
  return vars
}

const envLocal = loadEnvLocal()
const WHISPER_API_BASE =
  process.env.OPENCOVE_WHISPER_URL ||
  envLocal.OPENCOVE_WHISPER_URL ||
  'http://localhost:9000/api'
const WHISPER_PASSWORD =
  process.env.OPENCOVE_WHISPER_PASSWORD || envLocal.OPENCOVE_WHISPER_PASSWORD || ''

// Helper for HTTPS requests that tolerates self-signed certificates
function whisperRequest(
  url: string,
  options: { method: string; headers: Record<string, string>; body?: string },
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const transport = parsed.protocol === 'https:' ? https : http
    const req = transport.request(
      parsed,
      {
        method: options.method,
        headers: options.headers,
        rejectUnauthorized: false,
      },
      res => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => {
          chunks.push(c)
        })
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString(),
          })
        })
      },
    )
    req.on('error', reject)
    if (options.body) {
      req.write(options.body)
    }
    req.end()
  })
}

async function fetchAuthToken(): Promise<string | null> {
  if (WHISPER_PASSWORD.length === 0) {
    return null
  }
  const res = await whisperRequest(`${WHISPER_API_BASE}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `password=${WHISPER_PASSWORD}`,
  })
  if (res.status < 200 || res.status >= 300) {
    return null
  }
  try {
    const parsed = JSON.parse(res.body) as { token?: string }
    return parsed.token ?? null
  } catch {
    return null
  }
}

export function registerWhisperIpcHandlers(): IpcRegistrationDisposable {
  registerHandledIpc<WhisperTranscribeResult, WhisperTranscribeInput>(
    IPC_CHANNELS.whisperTranscribe,
    async (_event, payload) => {
      const token = await fetchAuthToken()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) {
        headers.Authorization = `Bearer ${token}`
      }

      const res = await whisperRequest(`${WHISPER_API_BASE}/transcribe/json`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          audio: payload.audioBase64,
          filename: payload.filename ?? 'audio.webm',
          language: null,
          task: 'transcribe',
          ...(token ? { token } : {}),
        }),
      })

      if (res.status < 200 || res.status >= 300) {
        throw new Error(`Whisper API returned ${res.status}: ${res.body.slice(0, 200)}`)
      }

      const result = JSON.parse(res.body) as {
        text?: string
        success?: boolean
        processing_time?: number
      }
      return {
        text: result.text ?? '',
        success: result.success !== false,
        processingTime: result.processing_time,
      }
    },
    { defaultErrorCode: 'whisper.transcribe_failed' },
  )

  return {
    dispose: () => {
      ipcMain.removeHandler(IPC_CHANNELS.whisperTranscribe)
    },
  }
}
