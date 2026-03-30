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
    name: 'read_terminal_content',
    description: 'Read the full visible content of a terminal or agent node, including all user input and output. Use this to see what the user typed and what the agent replied.',
    input_schema: {
      type: 'object' as const,
      properties: {
        nodeId: { type: 'string', description: 'The node ID of the terminal/agent' },
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
  {
    name: 'rename_node',
    description: 'Rename a node by its number. Example: rename_node(12, "Frontend Builder")',
    input_schema: {
      type: 'object' as const,
      properties: {
        nodeNumber: { type: 'number', description: 'The node number (e.g., 12)' },
        title: { type: 'string', description: 'New title' },
      },
      required: ['nodeNumber', 'title'],
    },
  },
  {
    name: 'set_node_description',
    description: 'Set a short description for a node by its number',
    input_schema: {
      type: 'object' as const,
      properties: {
        nodeNumber: { type: 'number', description: 'The node number' },
        description: { type: 'string', description: "Short description of this node's purpose" },
      },
      required: ['nodeNumber', 'description'],
    },
  },
  {
    name: 'create_database',
    description: 'Create a new PostgreSQL database viewer node on the canvas',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'connect_database',
    description: 'Connect a database viewer node to a PostgreSQL server. Provide connection details.',
    input_schema: {
      type: 'object' as const,
      properties: {
        nodeId: { type: 'string', description: 'The node ID of the database viewer (use list_nodes to find it)' },
        host: { type: 'string', description: 'Database host (e.g., localhost, 192.168.1.100)' },
        port: { type: 'number', description: 'Database port (default: 5432)' },
        database: { type: 'string', description: 'Database name' },
        user: { type: 'string', description: 'Database username' },
        password: { type: 'string', description: 'Database password' },
      },
      required: ['nodeId', 'host', 'database', 'user', 'password'],
    },
  },
  {
    name: 'query_database',
    description: 'Run a SQL query on a connected database node and return results',
    input_schema: {
      type: 'object' as const,
      properties: {
        nodeId: { type: 'string', description: 'The node ID of the connected database viewer' },
        sql: { type: 'string', description: 'SQL query to execute' },
      },
      required: ['nodeId', 'sql'],
    },
  },
  {
    name: 'save_project_file',
    description: 'Save content as a markdown file in the project .opencove/ directory and register it',
    input_schema: {
      type: 'object' as const,
      properties: {
        filename: { type: 'string', description: 'File name (e.g., "reviewer-feedback.md")' },
        content: { type: 'string', description: 'File content (markdown)' },
        purpose: { type: 'string', description: 'What this file is for (e.g., "Code review feedback from Reviewer agent")' },
      },
      required: ['filename', 'content', 'purpose'],
    },
  },
  {
    name: 'list_project_files',
    description: 'List all saved project files with their purposes',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'read_project_file',
    description: 'Read the content of a saved project file',
    input_schema: {
      type: 'object' as const,
      properties: {
        filename: { type: 'string', description: 'File name to read' },
      },
      required: ['filename'],
    },
  },
]
