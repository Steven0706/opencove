import { spawn } from 'node:child_process'
import { readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SuggestTaskTitleInput, SuggestTaskTitleResult } from '../../../shared/types/api'
import { buildTaskTitleCommand } from './TaskTitleCommandFactory'

const TASK_TITLE_TIMEOUT_MS = 30_000
const TASK_TITLE_MAX_LENGTH = 96

interface CommandExecutionResult {
  exitCode: number
  stdout: string
  stderr: string
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }

  if (typeof error === 'string' && error.length > 0) {
    return error
  }

  return 'Unknown error'
}

function fallbackTaskTitle(requirement: string): string {
  const cleaned = requirement.replace(/\s+/g, ' ').trim()
  if (cleaned.length <= 24) {
    return cleaned
  }

  return `${cleaned.slice(0, 24)}...`
}

function normalizeTaskTitle(raw: string, requirement: string): string {
  const line = raw
    .split(/\r?\n/)
    .map(item => item.trim())
    .find(item => item.length > 0)

  const normalized = (line ?? '')
    .replace(/^['"`]+|['"`]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (normalized.length === 0) {
    return fallbackTaskTitle(requirement)
  }

  if (normalized.length > TASK_TITLE_MAX_LENGTH) {
    return `${normalized.slice(0, TASK_TITLE_MAX_LENGTH)}...`
  }

  return normalized
}

function testModeTitle(requirement: string): string {
  const normalized = fallbackTaskTitle(requirement)
  return `Auto: ${normalized}`
}

async function executeCommand(
  command: string,
  args: string[],
  cwd: string,
): Promise<CommandExecutionResult> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    let timedOut = false

    const timeoutHandle = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, TASK_TITLE_TIMEOUT_MS)

    child.stdout.on('data', chunk => {
      stdout += chunk.toString()
    })

    child.stderr.on('data', chunk => {
      stderr += chunk.toString()
    })

    child.on('error', error => {
      clearTimeout(timeoutHandle)
      reject(error)
    })

    child.on('close', exitCode => {
      clearTimeout(timeoutHandle)

      if (timedOut) {
        reject(new Error('Task title generation timed out'))
        return
      }

      resolve({
        exitCode: typeof exitCode === 'number' ? exitCode : 1,
        stdout,
        stderr,
      })
    })
  })
}

export async function suggestTaskTitle(
  input: SuggestTaskTitleInput,
): Promise<SuggestTaskTitleResult> {
  const requirement = input.requirement.trim()
  const cwd = input.cwd.trim()

  if (requirement.length === 0) {
    throw new Error('Task requirement cannot be empty')
  }

  if (cwd.length === 0) {
    throw new Error('Task title generation requires cwd')
  }

  if (process.env.NODE_ENV === 'test') {
    return {
      title: testModeTitle(requirement),
      provider: input.provider,
      effectiveModel: input.model ?? null,
    }
  }

  const outputFilePath = join(tmpdir(), `cove-task-title-${crypto.randomUUID()}.txt`)

  const command = buildTaskTitleCommand({
    provider: input.provider,
    requirement,
    model: input.model ?? null,
    outputFilePath,
  })

  try {
    const result = await executeCommand(command.command, command.args, cwd)

    let rawOutput = result.stdout
    if (command.outputMode === 'file') {
      try {
        rawOutput = await readFile(outputFilePath, 'utf8')
      } catch {
        rawOutput = result.stdout
      }
    }

    const title = normalizeTaskTitle(rawOutput, requirement)

    if (title.length === 0 && result.exitCode !== 0) {
      throw new Error(`Task title generation failed: ${result.stderr}`)
    }

    return {
      title,
      provider: command.provider,
      effectiveModel: command.effectiveModel,
    }
  } catch (error) {
    if (!(error instanceof Error)) {
      throw error
    }

    throw new Error(`Task title generation failed: ${toErrorMessage(error)}`, {
      cause: error,
    })
  } finally {
    await rm(outputFilePath, { force: true })
  }
}
