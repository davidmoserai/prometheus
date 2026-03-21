export interface Employee {
  id: string
  name: string
  role: string
  avatar: string
  systemPrompt: string
  knowledgeIds: string[]
  tools: ToolAssignment[]
  provider: string
  model: string
  permissions: PermissionSet
  createdAt: string
  updatedAt: string
}

export interface ToolAssignment {
  id: string
  name: string
  source: 'builtin' | 'mcp'
  enabled: boolean
  requiresApproval: boolean
}

export interface PermissionSet {
  canBrowseWeb: boolean
  canReadFiles: boolean
  canWriteFiles: boolean
  canExecuteCode: boolean
  canContactEmployees: boolean
  autoApproveAll: boolean
}

export interface KnowledgeDocument {
  id: string
  title: string
  content: string
  tags: string[]
  createdAt: string
  updatedAt: string
}

export interface Conversation {
  id: string
  employeeId: string
  title: string
  messages: ChatMessage[]
  createdAt: string
  updatedAt: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
  handoffTo?: string
  handoffFrom?: string
}

export interface AppSettings {
  providers: ProviderConfig[]
  defaultProvider: string
  defaultModel: string
  theme: 'dark' | 'light'
}

export interface ProviderConfig {
  id: string
  name: string
  apiKey: string
  baseUrl?: string
  models: string[]
  enabled: boolean
}

export const DEFAULT_PROVIDERS: ProviderConfig[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    apiKey: '',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1', 'o1-mini'],
    enabled: false
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    apiKey: '',
    models: ['claude-opus-4-20250514', 'claude-sonnet-4-20250514', 'claude-haiku-4-5-20251001'],
    enabled: false
  },
  {
    id: 'google',
    name: 'Google',
    apiKey: '',
    models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],
    enabled: false
  },
  {
    id: 'mistral',
    name: 'Mistral',
    apiKey: '',
    models: ['mistral-large-latest', 'mistral-medium-latest', 'mistral-small-latest'],
    enabled: false
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    apiKey: '',
    baseUrl: 'http://localhost:11434',
    models: ['llama3', 'mistral', 'codellama', 'phi3'],
    enabled: false
  }
]

export const DEFAULT_SETTINGS: AppSettings = {
  providers: DEFAULT_PROVIDERS,
  defaultProvider: 'openai',
  defaultModel: 'gpt-4o',
  theme: 'dark'
}

export const AVAILABLE_TOOLS: ToolAssignment[] = [
  { id: 'web-search', name: 'Web Search', source: 'builtin', enabled: false, requiresApproval: false },
  { id: 'web-browse', name: 'Web Browse', source: 'builtin', enabled: false, requiresApproval: false },
  { id: 'file-read', name: 'Read Files', source: 'builtin', enabled: false, requiresApproval: false },
  { id: 'file-write', name: 'Write Files', source: 'builtin', enabled: false, requiresApproval: true },
  { id: 'code-execute', name: 'Execute Code', source: 'builtin', enabled: false, requiresApproval: true },
  { id: 'email-send', name: 'Send Email', source: 'mcp', enabled: false, requiresApproval: true },
  { id: 'calendar-manage', name: 'Calendar', source: 'mcp', enabled: false, requiresApproval: true },
  { id: 'github', name: 'GitHub', source: 'mcp', enabled: false, requiresApproval: false },
  { id: 'slack', name: 'Slack', source: 'mcp', enabled: false, requiresApproval: true },
  { id: 'database', name: 'Database', source: 'mcp', enabled: false, requiresApproval: true }
]

export const EMPLOYEE_AVATARS = [
  '🔥', '⚡', '🧠', '🎯', '🚀', '💡', '🔮', '⭐',
  '🛡️', '🎨', '📊', '🔬', '📝', '🤖', '🦾', '🧬'
]
