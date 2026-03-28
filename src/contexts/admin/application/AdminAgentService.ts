import { OPENCOVE_TOOLS } from './tools'

export interface AdminMessage {
  role: 'user' | 'assistant'
  content: string
  toolCalls?: { name: string; input: Record<string, unknown>; result: string }[]
}

export interface ToolExecutor {
  executeToolCall: (name: string, input: Record<string, unknown>) => Promise<string>
}

export interface LLMConfig {
  provider: 'anthropic' | 'openai-compatible'
  apiKey: string
  model: string
  baseUrl?: string // For OpenAI-compatible endpoints (Ollama, vLLM, Qwen, etc.)
}

const SYSTEM_PROMPT = `You are an OpenCove workspace operator. OpenCove is a spatial canvas app with terminals, AI agents, notes, and tasks.

## Core Rules
- Call tools immediately to fulfill requests. Do NOT explain \u2014 just do it.
- You can call tools MULTIPLE TIMES in sequence to complete complex tasks.
- After writing to an agent, you can read its response and then forward it to another agent.
- Always respond in the same language as the user. Be concise.

## Tool Routing
- "terminal" / "\u7EC8\u7AEF" / "window" / "\u7A97\u53E3" / "shell" \u2192 create_terminal
- "note" / "\u7B14\u8BB0" / "\u5907\u5FD8" / "jot down" / "\u8BB0\u4E00\u4E0B" \u2192 create_note
- "list" / "\u5217\u51FA" / "\u770B\u770B" / "\u6709\u54EA\u4E9B" / "what's on" \u2192 list_nodes
- "maximize" / "\u6700\u5927\u5316" / "\u653E\u5927" / "fullscreen" \u2192 maximize_node
- "close" / "\u5173\u95ED" / "\u5220\u9664" / "remove" \u2192 close_node
- "focus" / "\u805A\u7126" / "\u5B9A\u4F4D" / "\u8DF3\u8F6C" / "go to" \u2192 focus_node
- "type" / "write" / "run" / "execute" / "\u8F93\u5165" / "\u6267\u884C" / "\u8FD0\u884C" / "\u8DD1" \u2192 write_to_terminal
- "read output" / "\u8BFB\u53D6" / "\u770B\u770B\u8F93\u51FA" / "what did it say" / "\u8BF4\u4E86\u5565" \u2192 read_agent_last_message

## Multi-Agent Orchestration
When the user asks you to coordinate between agents:
1. First call list_nodes to see what's available
2. Write instructions to the target agent using write_to_terminal
3. Wait and read the response using read_agent_last_message
4. Forward, summarize, or act on the response as needed
5. You can chain as many steps as needed

When user says "\u5E2E\u6211\u8DDF X\u8BF4" / "\u544A\u8BC9X" / "tell X to" / "ask X to":
- Convert the third-person instruction to a direct second-person prompt
- Write it to the correct agent node
- If the user wants a response, read it back and report

When user says "\u8BA9X\u603B\u7ED3\u7ED9Y" / "forward X's summary to Y":
1. Write to X asking for a summary
2. Read X's response
3. Reformat and write it to Y
4. Report completion

## Usage & Status Commands
When user asks about usage/status/compact for a specific agent:
- For /usage: write "/usage" to that terminal
- For /compact: write "/compact" to that terminal
- For any CLI command: write it directly to the terminal
- Read back the response and summarize it

## Agent Profiles
Available specialist profiles: Architect (\u{1F3D7}\uFE0F), Builder (\u{1F528}), QA Lead (\u{1F9EA}), Reviewer (\u{1F50D}), Release Engineer (\u{1F680}), Investigator (\u{1F52C}).
When creating an agent, suggest an appropriate profile based on the task.
Use the create_profiled_agent tool to launch a specialist agent with a profile and task.`

// Convert our tool schemas to OpenAI function-calling format
function toolsToOpenAIFormat(): Array<Record<string, unknown>> {
  return OPENCOVE_TOOLS.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description ?? '',
      parameters: t.input_schema as Record<string, unknown>,
    },
  }))
}

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>
  tool_call_id?: string
}

interface OpenAIResponse {
  choices: Array<{
    message: {
      role: 'assistant'
      content: string | null
      reasoning?: string | null
      tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>
    }
    finish_reason: string
  }>
}

// Anthropic types (minimal)
interface AnthropicTextBlock { type: 'text'; text: string }
interface AnthropicToolUseBlock { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
type AnthropicContentBlock = AnthropicTextBlock | AnthropicToolUseBlock
interface AnthropicResponse { content: AnthropicContentBlock[]; stop_reason: string }

export class AdminAgentService {
  private config: LLMConfig
  private anthropicMessages: Array<{ role: string; content: unknown }> = []
  private openaiMessages: OpenAIMessage[] = []

  constructor(config: LLMConfig) {
    this.config = config
  }

  /** Restore prior conversation so the LLM has context from previous sessions. */
  restoreHistory(messages: AdminMessage[]): void {
    for (const msg of messages) {
      if (msg.role === 'user') {
        if (this.config.provider === 'anthropic') {
          this.anthropicMessages.push({ role: 'user', content: msg.content })
        } else {
          this.openaiMessages.push({ role: 'user', content: msg.content })
        }
      } else {
        if (this.config.provider === 'anthropic') {
          this.anthropicMessages.push({ role: 'assistant', content: [{ type: 'text', text: msg.content }] })
        } else {
          this.openaiMessages.push({ role: 'assistant', content: msg.content })
        }
      }
    }
  }

  async sendMessage(
    userMessage: string,
    toolExecutor: ToolExecutor,
    onUpdate?: (messages: AdminMessage[]) => void,
  ): Promise<AdminMessage[]> {
    if (this.config.provider === 'anthropic') {
      return this.sendAnthropicMessage(userMessage, toolExecutor, onUpdate)
    }
    return this.sendOpenAIMessage(userMessage, toolExecutor, onUpdate)
  }

  private async sendAnthropicMessage(
    userMessage: string,
    toolExecutor: ToolExecutor,
    onUpdate?: (messages: AdminMessage[]) => void,
  ): Promise<AdminMessage[]> {
    this.anthropicMessages.push({ role: 'user', content: userMessage })
    const result: AdminMessage[] = [{ role: 'user', content: userMessage }]

    let continueLoop = true
    while (continueLoop) {
      const response = await this.fetchAnthropic()

      if (response.stop_reason === 'tool_use') {
        const toolUseBlocks = response.content.filter((b): b is AnthropicToolUseBlock => b.type === 'tool_use')
        const textBlocks = response.content.filter((b): b is AnthropicTextBlock => b.type === 'text')

        const assistantMsg: AdminMessage = {
          role: 'assistant',
          content: textBlocks.map(b => b.text).join('\n'),
          toolCalls: [],
        }

        this.anthropicMessages.push({ role: 'assistant', content: response.content })

        const toolResults: Array<{ type: 'tool_result'; tool_use_id: string; content: string }> = []
        for (const toolUse of toolUseBlocks) {
          const toolResult = await toolExecutor.executeToolCall(toolUse.name, toolUse.input)
          assistantMsg.toolCalls?.push({ name: toolUse.name, input: toolUse.input, result: toolResult })
          toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: toolResult })
        }

        this.anthropicMessages.push({ role: 'user', content: toolResults })
        result.push(assistantMsg)
        onUpdate?.(result)
      } else {
        const textContent = response.content
          .filter((b): b is AnthropicTextBlock => b.type === 'text')
          .map(b => b.text).join('\n')
        this.anthropicMessages.push({ role: 'assistant', content: response.content })
        result.push({ role: 'assistant', content: textContent })
        onUpdate?.(result)
        continueLoop = false
      }
    }
    return result
  }

  private async sendOpenAIMessage(
    userMessage: string,
    toolExecutor: ToolExecutor,
    onUpdate?: (messages: AdminMessage[]) => void,
  ): Promise<AdminMessage[]> {
    if (this.openaiMessages.length === 0) {
      this.openaiMessages.push({ role: 'system', content: SYSTEM_PROMPT })
    }
    this.openaiMessages.push({ role: 'user', content: userMessage })
    const result: AdminMessage[] = [{ role: 'user', content: userMessage }]

    let continueLoop = true
    while (continueLoop) {
      const response = await this.fetchOpenAI()
      const choice = response.choices[0]
      if (!choice) { continueLoop = false; break }

      const msg = choice.message
      const toolCalls = msg.tool_calls

      // Extract text content (some models like Qwen put thinking in 'reasoning' and answer in 'content')
      const textContent = msg.content ?? ''

      if (toolCalls && toolCalls.length > 0) {
        this.openaiMessages.push({
          role: 'assistant', content: msg.content,
          tool_calls: toolCalls,
        })

        const assistantMsg: AdminMessage = {
          role: 'assistant',
          content: textContent,
          toolCalls: [],
        }

        for (const tc of toolCalls) {
          let parsedInput: Record<string, unknown>
          try {
            parsedInput = JSON.parse(tc.function.arguments) as Record<string, unknown>
          } catch {
            parsedInput = {}
          }
          const toolResult = await toolExecutor.executeToolCall(tc.function.name, parsedInput)
          assistantMsg.toolCalls?.push({ name: tc.function.name, input: parsedInput, result: toolResult })
          this.openaiMessages.push({
            role: 'tool', content: toolResult, tool_call_id: tc.id,
          })
        }

        result.push(assistantMsg)
        onUpdate?.(result)
      } else {
        this.openaiMessages.push({ role: 'assistant', content: msg.content })
        result.push({ role: 'assistant', content: textContent })
        onUpdate?.(result)
        continueLoop = false
      }
    }
    return result
  }

  private async proxyFetch(url: string, headers: Record<string, string>, body: string): Promise<{ status: number; body: string }> {
    // Route through Electron main process to avoid CSP/CORS issues
    return (window as unknown as { opencoveApi: { admin: { llmProxy: (p: { url: string; method: string; headers: Record<string, string>; body: string }) => Promise<{ status: number; body: string }> } } }).opencoveApi.admin.llmProxy({ url, method: 'POST', headers, body })
  }

  private async fetchAnthropic(): Promise<AnthropicResponse> {
    const baseUrl = this.config.baseUrl || 'https://api.anthropic.com'
    const result = await this.proxyFetch(
      `${baseUrl}/v1/messages`,
      {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      JSON.stringify({
        model: this.config.model,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools: OPENCOVE_TOOLS,
        messages: this.anthropicMessages,
      }),
    )
    if (result.status < 200 || result.status >= 300) {
      throw new Error(`Anthropic API error ${result.status}: ${result.body}`)
    }
    return JSON.parse(result.body) as AnthropicResponse
  }

  private async fetchOpenAI(): Promise<OpenAIResponse> {
    const baseUrl = this.config.baseUrl || 'https://api.openai.com'
    const result = await this.proxyFetch(
      `${baseUrl}/v1/chat/completions`,
      {
        'Content-Type': 'application/json',
        ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}),
      },
      JSON.stringify({
        model: this.config.model,
        max_tokens: 1024,
        messages: this.openaiMessages,
        tools: toolsToOpenAIFormat(),
      }),
    )
    if (result.status < 200 || result.status >= 300) {
      throw new Error(`API error ${result.status}: ${result.body}`)
    }
    return JSON.parse(result.body) as OpenAIResponse
  }

  clearHistory(): void {
    this.anthropicMessages = []
    this.openaiMessages = []
  }
}
