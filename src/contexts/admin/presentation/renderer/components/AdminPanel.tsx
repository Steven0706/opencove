import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { useReactFlow, type Node } from '@xyflow/react'
import { X, Send, ChevronRight, ChevronDown, Trash2, ExternalLink, Settings2, ClipboardPaste } from 'lucide-react'
import { AdminAgentService, type AdminMessage, type LLMConfig, type ToolExecutor } from '@contexts/admin/application/AdminAgentService'
import { getProfileById } from '@contexts/agent/domain/profiles'
import { adminBridge } from '../adminBridge'
import type { TerminalNodeData } from '@contexts/workspace/presentation/renderer/types'

const CONFIG_STORAGE_KEY = 'opencove-admin-llm-config'
const CHAT_HISTORY_KEY = 'opencove-admin-chat-history'

function loadConfig(): LLMConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as LLMConfig) : null
  } catch { return null }
}

function saveConfig(config: LLMConfig): void {
  localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config))
}

function loadChatHistory(): AdminMessage[] {
  try {
    const raw = localStorage.getItem(CHAT_HISTORY_KEY)
    return raw ? (JSON.parse(raw) as AdminMessage[]) : []
  } catch { return [] }
}

function saveChatHistory(msgs: AdminMessage[]): void {
  // Keep last 200 messages to avoid localStorage bloat
  const trimmed = msgs.slice(-200)
  localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(trimmed))
}

interface AdminPanelProps {
  onClose: () => void
}

// Preset configurations
const PRESETS = [
  { label: 'Ollama (Local)', provider: 'openai-compatible' as const, model: 'qwen3.5:35b', baseUrl: 'http://localhost:11434', needsKey: false, placeholder: '' },
  { label: 'Anthropic (Claude)', provider: 'anthropic' as const, model: 'claude-sonnet-4-6', baseUrl: '', needsKey: true, placeholder: 'sk-ant-api03-...' },
  { label: 'Custom', provider: 'openai-compatible' as const, model: '', baseUrl: '', needsKey: false, placeholder: '' },
]

export function AdminPanel({ onClose }: AdminPanelProps): JSX.Element {
  const [config, setConfig] = useState<LLMConfig | null>(() => loadConfig())
  const [selectedPreset, setSelectedPreset] = useState(0)
  const [draftBaseUrl, setDraftBaseUrl] = useState(PRESETS[0].baseUrl)
  const [draftModel, setDraftModel] = useState(PRESETS[0].model)
  const [draftApiKey, setDraftApiKey] = useState('')
  const [messages, setMessages] = useState<AdminMessage[]>(() => loadChatHistory())
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set())
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const serviceRef = useRef<AdminAgentService | null>(null)
  const reactFlow = useReactFlow<Node<TerminalNodeData>>()

  const isReady = config !== null

  useEffect(() => {
    if (isReady && config) {
      const svc = new AdminAgentService(config)
      // Restore prior conversation for LLM context
      if (messages.length > 0) svc.restoreHistory(messages)
      serviceRef.current = svc
    } else {
      serviceRef.current = null
    }
  }, [config, isReady]) // eslint-disable-line react-hooks/exhaustive-deps -- messages only needed on init

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    if (messages.length > 0) saveChatHistory(messages)
  }, [messages])

  useEffect(() => {
    if (isReady) inputRef.current?.focus()
  }, [isReady])

  const toolExecutor: ToolExecutor = useMemo(() => ({
    executeToolCall: async (name: string, toolInput: Record<string, unknown>): Promise<string> => {
      switch (name) {
        case 'list_nodes': {
          const nodes = adminBridge.getNodes?.() ?? reactFlow.getNodes()
          return JSON.stringify(nodes.map(n => ({
            id: n.id, kind: n.data.kind, title: n.data.title,
            position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
            width: n.data.width, height: n.data.height,
            sessionId: n.data.sessionId, status: n.data.status,
          })), null, 2)
        }
        case 'create_terminal': {
          if (!adminBridge.createTerminalNode) return JSON.stringify({ error: 'Not available' })
          const nodeId = await adminBridge.createTerminalNode()
          return nodeId ? JSON.stringify({ success: true, nodeId }) : JSON.stringify({ error: 'Failed' })
        }
        case 'create_note': {
          if (!adminBridge.createNoteNode) return JSON.stringify({ error: 'Not available' })
          const nodeId = adminBridge.createNoteNode((toolInput.text as string) ?? '')
          return nodeId ? JSON.stringify({ success: true, nodeId }) : JSON.stringify({ error: 'Failed' })
        }
        case 'write_to_terminal': {
          const nodes = adminBridge.getNodes?.() ?? reactFlow.getNodes()
          const node = nodes.find(n => n.id === toolInput.nodeId)
          if (!node?.data.sessionId) return JSON.stringify({ error: 'Node/session not found' })
          await window.opencoveApi.pty.write({ sessionId: node.data.sessionId, data: (toolInput.text as string) + '\n' })
          return JSON.stringify({ success: true })
        }
        case 'read_agent_last_message': {
          const nodes = adminBridge.getNodes?.() ?? reactFlow.getNodes()
          const node = nodes.find(n => n.id === toolInput.nodeId)
          if (!node || node.data.kind !== 'agent' || !node.data.agent || !node.data.startedAt) return JSON.stringify({ error: 'Not a running agent' })
          try {
            const r = await window.opencoveApi.agent.readLastMessage({ provider: node.data.agent.provider, cwd: node.data.agent.executionDirectory, startedAt: node.data.startedAt, resumeSessionId: node.data.agent.resumeSessionId ?? null })
            return JSON.stringify({ message: r.message ?? '(empty)' })
          } catch (e) { return JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown' }) }
        }
        case 'maximize_node': { adminBridge.toggleMaximizeNode?.(toolInput.nodeId as string); return JSON.stringify({ success: true }) }
        case 'close_node': { await adminBridge.closeNode?.(toolInput.nodeId as string); return JSON.stringify({ success: true }) }
        case 'focus_node': { adminBridge.focusNode?.(toolInput.nodeId as string); return JSON.stringify({ success: true }) }
        case 'create_profiled_agent': {
          const profileId = toolInput.profile as string
          const task = toolInput.task as string
          const profile = getProfileById(profileId)
          if (!profile) return JSON.stringify({ error: `Unknown profile: ${profileId}. Available: architect, builder, qa, reviewer, release, investigator` })
          if (!adminBridge.createTerminalNode) return JSON.stringify({ error: 'Not available' })
          const nodeId = await adminBridge.createTerminalNode()
          if (!nodeId) return JSON.stringify({ error: 'Failed to create terminal' })
          const nodes = adminBridge.getNodes?.() ?? reactFlow.getNodes()
          const node = nodes.find(n => n.id === nodeId)
          if (!node?.data.sessionId) return JSON.stringify({ error: 'No session found for terminal' })
          const prompt = `${profile.systemInstruction}\n\n---\n\nTask: ${task}`
          const escaped = prompt.replace(/'/g, "'\\''")
          await window.opencoveApi.pty.write({ sessionId: node.data.sessionId, data: `claude -p '${escaped}'\n` })
          return JSON.stringify({ success: true, nodeId, profile: profile.name, emoji: profile.emoji })
        }
        default: return JSON.stringify({ error: `Unknown tool: ${name}` })
      }
    },
  }), [reactFlow])

  // Buffered message queue — user can type while LLM is thinking
  const pendingQueueRef = useRef<string[]>([])
  const isProcessingRef = useRef(false)

  const processQueue = useCallback(async () => {
    if (isProcessingRef.current || !serviceRef.current) return
    if (pendingQueueRef.current.length === 0) return

    // Merge all pending messages into one
    const merged = pendingQueueRef.current.join('\n\n')
    pendingQueueRef.current = []

    isProcessingRef.current = true
    setIsLoading(true)
    setMessages(prev => [...prev, { role: 'user', content: merged }])

    try {
      const baseLength = messages.length + 1
      await serviceRef.current.sendMessage(merged, toolExecutor, (partial) => {
        setMessages(prev => [...prev.slice(0, baseLength), ...partial.filter(m => m.role === 'assistant')])
      })
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err instanceof Error ? err.message : 'Unknown'}` }])
    } finally {
      isProcessingRef.current = false
      setIsLoading(false)
      // Process next batch if more messages arrived while we were thinking
      if (pendingQueueRef.current.length > 0) {
        void processQueue()
      }
    }
  }, [messages.length, toolExecutor])

  const handleSend = useCallback(() => {
    const trimmed = input.trim()
    if (!trimmed || !serviceRef.current) return
    setInput('')
    pendingQueueRef.current.push(trimmed)
    if (!isProcessingRef.current) {
      void processQueue()
    }
    // If LLM is busy, message stays in queue — shown as "(queued)" in UI
  }, [input, processQueue])

  const handlePaste = useCallback(async () => {
    const text = await window.opencoveApi.clipboard.readText()
    if (text) setInput(prev => prev + text)
  }, [])

  const handleConnect = useCallback(() => {
    const preset = PRESETS[selectedPreset]
    const newConfig: LLMConfig = {
      provider: preset.provider,
      apiKey: draftApiKey.trim(),
      model: draftModel.trim() || preset.model,
      baseUrl: draftBaseUrl.trim() || preset.baseUrl || undefined,
    }
    saveConfig(newConfig)
    setConfig(newConfig)
  }, [selectedPreset, draftApiKey, draftModel, draftBaseUrl])

  const handleDisconnect = useCallback(() => {
    localStorage.removeItem(CONFIG_STORAGE_KEY)
    setConfig(null)
    setMessages([])
    serviceRef.current = null
  }, [])

  const toggleToolExpand = useCallback((key: string) => {
    setExpandedTools(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }, [])

  // Setup screen
  if (!isReady) {
    const preset = PRESETS[selectedPreset]
    return (
      <div className="admin-panel">
        <div className="admin-panel__header">
          <span className="admin-panel__title">Admin Agent</span>
          <button type="button" className="admin-panel__close-btn" onClick={onClose}><X size={14} /></button>
        </div>
        <div className="admin-panel__api-key-form">
          <p className="admin-panel__api-key-desc">Connect an LLM to control your workspace.</p>

          <div className="admin-panel__preset-tabs">
            {PRESETS.map((p, i) => (
              <button
                key={i}
                type="button"
                className={`admin-panel__preset-tab ${i === selectedPreset ? 'admin-panel__preset-tab--active' : ''}`}
                onClick={() => { setSelectedPreset(i); setDraftBaseUrl(p.baseUrl); setDraftModel(p.model); setDraftApiKey('') }}
              >
                {p.label}
              </button>
            ))}
          </div>

          {preset.provider === 'anthropic' && (
            <button type="button" className="admin-panel__generate-key-btn" onClick={() => window.open('https://console.anthropic.com/settings/keys', '_blank')}>
              <ExternalLink size={13} /> Get API Key from Anthropic Console
            </button>
          )}

          {preset.needsKey && (
            <>
              <label className="admin-panel__api-key-label">API Key</label>
              <input type="password" className="admin-panel__api-key-input" placeholder={preset.placeholder} value={draftApiKey} onChange={e => setDraftApiKey(e.target.value)} />
            </>
          )}

          <label className="admin-panel__api-key-label">Base URL</label>
          <input type="text" className="admin-panel__api-key-input" placeholder={preset.baseUrl || 'https://api.example.com'} value={draftBaseUrl} onChange={e => setDraftBaseUrl(e.target.value)} />

          <label className="admin-panel__api-key-label">Model</label>
          <input type="text" className="admin-panel__api-key-input" placeholder={preset.model || 'model-name'} value={draftModel} onChange={e => setDraftModel(e.target.value)} />

          <button type="button" className="admin-panel__api-key-save-btn" style={{ width: '100%', marginTop: 4 }}
            onClick={handleConnect}
            disabled={preset.needsKey && draftApiKey.trim().length === 0}
          >
            Connect
          </button>
        </div>
      </div>
    )
  }

  // Chat interface
  const providerLabel = config.provider === 'anthropic' ? 'Anthropic' : (config.baseUrl ?? 'OpenAI')
  return (
    <div className="admin-panel">
      <div className="admin-panel__header">
        <span className="admin-panel__title">Admin <span className="admin-panel__auth-badge">{config.model}</span></span>
        <div className="admin-panel__header-actions">
          <button type="button" className="admin-panel__header-action-btn" onClick={() => { setMessages([]); serviceRef.current?.clearHistory() }} title="Clear"><Trash2 size={13} /></button>
          <button type="button" className="admin-panel__header-action-btn" onClick={handleDisconnect} title={`Connected to ${providerLabel}. Click to change.`}><Settings2 size={13} /></button>
          <button type="button" className="admin-panel__close-btn" onClick={onClose}><X size={14} /></button>
        </div>
      </div>
      <div className="admin-panel__messages">
        {messages.length === 0 && <div className="admin-panel__empty">Ask the Admin Agent to control your workspace.</div>}
        {messages.map((msg, i) => (
          <div key={i} className={`admin-panel__message admin-panel__message--${msg.role}`}>
            <div className="admin-panel__message-role">{msg.role === 'user' ? 'You' : 'Agent'}</div>
            {msg.content.length > 0 && <div className="admin-panel__message-content">{msg.content}</div>}
            {msg.toolCalls?.map((tc, j) => {
              const k = `${i}-${j}`; const exp = expandedTools.has(k)
              return (
                <div key={j} className="admin-panel__tool-call">
                  <button type="button" className="admin-panel__tool-call-toggle" onClick={() => toggleToolExpand(k)}>
                    {exp ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    <span className="admin-panel__tool-call-name">{tc.name}</span>
                  </button>
                  {exp && <div className="admin-panel__tool-call-detail">
                    <div className="admin-panel__tool-call-section"><span className="admin-panel__tool-call-label">Input:</span><pre className="admin-panel__tool-call-pre">{JSON.stringify(tc.input, null, 2)}</pre></div>
                    <div className="admin-panel__tool-call-section"><span className="admin-panel__tool-call-label">Result:</span><pre className="admin-panel__tool-call-pre">{tc.result}</pre></div>
                  </div>}
                </div>
              )
            })}
          </div>
        ))}
        {isLoading && <div className="admin-panel__message admin-panel__message--assistant"><div className="admin-panel__message-role">Agent</div><div className="admin-panel__message-content admin-panel__thinking">Thinking...</div></div>}
        {pendingQueueRef.current.length > 0 && (
          <div className="admin-panel__message admin-panel__message--user admin-panel__message--queued">
            <div className="admin-panel__message-role">Queued ({pendingQueueRef.current.length})</div>
            <div className="admin-panel__message-content">{pendingQueueRef.current.join(' | ')}</div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="admin-panel__input">
        <button type="button" className="admin-panel__paste-btn" onClick={() => void handlePaste()} title="Paste from clipboard"><ClipboardPaste size={14} /></button>
        <input ref={inputRef} type="text" className="admin-panel__input-field" placeholder={isLoading ? 'Type to queue...' : 'Type a command...'} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }} />
        <button type="button" className="admin-panel__send-btn" onClick={() => handleSend()} disabled={input.trim().length === 0}><Send size={14} /></button>
      </div>
    </div>
  )
}
