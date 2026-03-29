import { resolve } from 'node:path'
import { homedir } from 'node:os'
import crypto from 'node:crypto'

export interface ServerConfig {
  port: number
  host: string
  userDataDir: string
  token: string
  noAuth: boolean
  isDev: boolean
}

export function resolveServerConfig(): ServerConfig {
  const args = process.argv.slice(2)

  const portArg = args.find(a => a.startsWith('--port='))
  const port = portArg ? Number(portArg.split('=')[1]) : 3200

  const hostArg = args.find(a => a.startsWith('--host='))
  const host = hostArg ? hostArg.split('=')[1]! : '0.0.0.0'

  const dataDirArg = args.find(a => a.startsWith('--data-dir='))
  const userDataDir = dataDirArg
    ? resolve(dataDirArg.split('=')[1]!)
    : resolve(homedir(), '.opencove-server')

  // Token priority: --token= arg > OPENCOVE_TOKEN env > generate random
  const tokenArg = args.find(a => a.startsWith('--token='))
  const token = tokenArg
    ? tokenArg.split('=')[1]!
    : process.env.OPENCOVE_TOKEN || crypto.randomBytes(32).toString('base64url')

  const noAuth = args.includes('--no-auth') || process.env.OPENCOVE_NO_AUTH === '1'
  const isDev = process.env.NODE_ENV === 'development' || args.includes('--dev')

  return { port, host, userDataDir, token, noAuth, isDev }
}
