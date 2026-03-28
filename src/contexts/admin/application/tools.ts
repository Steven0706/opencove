import type Anthropic from '@anthropic-ai/sdk'

export const OPENCOVE_TOOLS: Anthropic.Tool[] = [
  {
    name: 'list_nodes',
    description: 'List all nodes on the canvas with their id, kind, title, position, and size',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'create_terminal',
    description: 'Create a new terminal node on the canvas',
    input_schema: {
      type: 'object' as const,
      properties: { title: { type: 'string', description: 'Optional title for the terminal' } },
      required: [],
    },
  },
  {
    name: 'create_note',
    description: 'Create a new note node on the canvas with the given text',
    input_schema: {
      type: 'object' as const,
      properties: { text: { type: 'string', description: 'Text content for the note' } },
      required: ['text'],
    },
  },
  {
    name: 'write_to_terminal',
    description: 'Write text to a terminal or agent node. The text is sent as keyboard input to the PTY.',
    input_schema: {
      type: 'object' as const,
      properties: {
        nodeId: { type: 'string', description: 'The node ID of the terminal/agent' },
        text: { type: 'string', description: 'Text to type into the terminal' },
      },
      required: ['nodeId', 'text'],
    },
  },
  {
    name: 'read_agent_last_message',
    description: 'Read the last assistant message from an agent node',
    input_schema: {
      type: 'object' as const,
      properties: {
        nodeId: { type: 'string', description: 'The node ID of the agent' },
      },
      required: ['nodeId'],
    },
  },
  {
    name: 'maximize_node',
    description: 'Maximize a node to fill the viewport, or restore it if already maximized',
    input_schema: {
      type: 'object' as const,
      properties: { nodeId: { type: 'string', description: 'The node ID to maximize' } },
      required: ['nodeId'],
    },
  },
  {
    name: 'close_node',
    description: 'Close and remove a node from the canvas',
    input_schema: {
      type: 'object' as const,
      properties: { nodeId: { type: 'string', description: 'The node ID to close' } },
      required: ['nodeId'],
    },
  },
  {
    name: 'focus_node',
    description: 'Center the viewport on a specific node',
    input_schema: {
      type: 'object' as const,
      properties: { nodeId: { type: 'string', description: 'The node ID to focus on' } },
      required: ['nodeId'],
    },
  },
  {
    name: 'create_profiled_agent',
    description:
      'Create a new agent with a specialist profile. Available profiles: architect, builder, qa, reviewer, release, investigator',
    input_schema: {
      type: 'object' as const,
      properties: {
        profile: {
          type: 'string',
          description: 'Profile ID: architect, builder, qa, reviewer, release, investigator',
        },
        task: {
          type: 'string',
          description: 'The specific task for this agent',
        },
      },
      required: ['profile', 'task'],
    },
  },
]
