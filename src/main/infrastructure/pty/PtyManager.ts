import os from 'node:os'
import process from 'node:process'
import type { IPty } from 'node-pty'
import { spawn } from 'node-pty'

export interface SpawnPtyOptions {
  cwd: string
  shell?: string
  cols: number
  rows: number
}

export class PtyManager {
  private sessions = new Map<string, IPty>()

  public spawnSession(options: SpawnPtyOptions): { sessionId: string; pty: IPty } {
    const sessionId = crypto.randomUUID()
    const shell = options.shell ?? this.resolveDefaultShell()
    const pty = spawn(shell, [], {
      cols: options.cols,
      rows: options.rows,
      cwd: options.cwd,
      env: process.env,
      name: 'xterm-256color',
    })

    this.sessions.set(sessionId, pty)

    return { sessionId, pty }
  }

  public write(sessionId: string, data: string): void {
    const pty = this.sessions.get(sessionId)
    if (!pty) {
      return
    }

    pty.write(data)
  }

  public resize(sessionId: string, cols: number, rows: number): void {
    const pty = this.sessions.get(sessionId)
    if (!pty) {
      return
    }

    pty.resize(cols, rows)
  }

  public kill(sessionId: string): void {
    const pty = this.sessions.get(sessionId)
    if (!pty) {
      return
    }

    pty.kill()
    this.sessions.delete(sessionId)
  }

  public delete(sessionId: string): void {
    this.sessions.delete(sessionId)
  }

  public disposeAll(): void {
    for (const [sessionId, pty] of this.sessions.entries()) {
      pty.kill()
      this.sessions.delete(sessionId)
    }
  }

  private resolveDefaultShell(): string {
    if (process.platform === 'win32') {
      return 'powershell.exe'
    }

    return process.env.SHELL || (os.platform() === 'darwin' ? '/bin/zsh' : '/bin/bash')
  }
}
