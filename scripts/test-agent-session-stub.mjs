#!/usr/bin/env node

import fs from 'node:fs/promises'
import os from 'node:os'
import { dirname, join, resolve } from 'node:path'

function sleep(ms) {
  return new Promise(resolveSleep => {
    setTimeout(resolveSleep, ms)
  })
}

function toDateDirectoryParts(timestampMs) {
  const date = new Date(timestampMs)
  const year = String(date.getFullYear())
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return [year, month, day]
}

async function runCodexStandbyNoNewlineScenario(cwd) {
  const startedAtMs = Date.now()
  const sessionId = `cove-test-session-${startedAtMs}`
  const [year, month, day] = toDateDirectoryParts(startedAtMs)
  const sessionFilePath = join(
    os.homedir(),
    '.codex',
    'sessions',
    year,
    month,
    day,
    `rollout-${sessionId}.jsonl`,
  )

  await fs.mkdir(dirname(sessionFilePath), { recursive: true })
  await fs.writeFile(
    sessionFilePath,
    `${JSON.stringify({ payload: { id: sessionId, cwd } })}\n`,
    'utf8',
  )

  await sleep(800)
  await fs.appendFile(
    sessionFilePath,
    `${JSON.stringify({
      type: 'response_item',
      payload: {
        type: 'reasoning',
        summary: [],
      },
    })}\n`,
    'utf8',
  )

  await sleep(1200)
  await fs.appendFile(
    sessionFilePath,
    JSON.stringify({
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'output_text',
            text: 'All set.',
          },
        ],
      },
    }),
    'utf8',
  )

  await sleep(20_000)
}

async function main() {
  const [
    provider = 'codex',
    rawCwd = process.cwd(),
    mode = 'new',
    model = 'default-model',
    scenario = '',
  ] = process.argv.slice(2)
  const cwd = resolve(rawCwd)

  process.stdout.write(`[cove-test-agent] ${provider} ${mode} ${model}\n`)

  if (provider === 'codex' && scenario === 'codex-standby-no-newline') {
    await runCodexStandbyNoNewlineScenario(cwd)
    return
  }

  await sleep(120_000)
}

await main()
