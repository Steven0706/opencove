import type { Terminal } from '@xterm/xterm'

const terminals = new Map<string, Terminal>()

export function registerTerminal(nodeId: string, terminal: Terminal): void {
  terminals.set(nodeId, terminal)
}

export function unregisterTerminal(nodeId: string): void {
  terminals.delete(nodeId)
}

export function getRegisteredTerminal(nodeId: string): Terminal | null {
  return terminals.get(nodeId) ?? null
}
