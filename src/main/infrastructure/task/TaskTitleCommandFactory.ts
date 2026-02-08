import type { AgentProviderId } from '../../../shared/types/api'

interface BuildTaskTitleCommandInput {
  provider: AgentProviderId
  requirement: string
  model: string | null
  outputFilePath: string
}

export interface TaskTitleCommand {
  command: string
  args: string[]
  provider: AgentProviderId
  effectiveModel: string | null
  outputMode: 'stdout' | 'file'
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function normalizeRequirement(value: string): string {
  const normalized = value.trim()

  if (normalized.length === 0) {
    throw new Error('Task requirement cannot be empty')
  }

  return normalized
}

function buildTaskTitlePrompt(requirement: string): string {
  return [
    'You are a concise task naming assistant.',
    'Generate exactly one task title based on the requirement below.',
    'Rules:',
    '- Return only one line.',
    '- No quotes, no numbering, no markdown.',
    '- Keep the same language as the requirement.',
    '- Keep it concise (<= 8 English words or <= 16 Chinese characters).',
    '',
    'Task requirement:',
    requirement,
  ].join('\n')
}

export function buildTaskTitleCommand(input: BuildTaskTitleCommandInput): TaskTitleCommand {
  const requirement = normalizeRequirement(input.requirement)
  const effectiveModel = normalizeOptionalText(input.model)
  const prompt = buildTaskTitlePrompt(requirement)

  if (input.provider === 'claude-code') {
    const args = ['-p', '--tools', '']

    if (effectiveModel) {
      args.push('--model', effectiveModel)
    }

    args.push(prompt)

    return {
      command: 'claude',
      args,
      provider: input.provider,
      effectiveModel,
      outputMode: 'stdout',
    }
  }

  const args = ['exec', '--skip-git-repo-check', '--sandbox', 'read-only']

  if (effectiveModel) {
    args.push('--model', effectiveModel)
  }

  args.push('-o', input.outputFilePath)
  args.push(prompt)

  return {
    command: 'codex',
    args,
    provider: input.provider,
    effectiveModel,
    outputMode: 'file',
  }
}
