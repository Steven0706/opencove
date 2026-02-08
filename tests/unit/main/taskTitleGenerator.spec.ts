import { describe, expect, it } from 'vitest'
import { suggestTaskTitle } from '../../../src/main/infrastructure/task/TaskTitleGenerator'

describe('suggestTaskTitle', () => {
  it('returns deterministic title in test mode', async () => {
    const result = await suggestTaskTitle({
      provider: 'codex',
      cwd: '/tmp',
      requirement: 'Implement login retry with exponential backoff and jitter',
      model: 'gpt-5.2-codex',
    })

    expect(result.provider).toBe('codex')
    expect(result.effectiveModel).toBe('gpt-5.2-codex')
    expect(result.title.startsWith('Auto:')).toBe(true)
  })
})
