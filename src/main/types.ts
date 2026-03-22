export interface Company {
  id: string
  name: string
  avatar: string // emoji
  createdAt: string
  updatedAt: string
}

export interface Department {
  id: string
  name: string
  color: string // tailwind color for badges
  createdAt: string
  updatedAt: string
}

export interface ContactAccess {
  mode: 'none' | 'specific' | 'all'
  allowedEmployeeIds: string[]
  allowedDepartmentIds: string[]
}

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
  memory: string
  departmentId: string | null
  status: 'active' | 'terminated'
  terminatedAt: string | null
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
  contactAccess: ContactAccess
  autoApproveAll: boolean
}

export interface KnowledgeDocument {
  id: string
  title: string
  content: string
  tags: string[]
  lastVerifiedAt: string | null
  docType: 'living' | 'reference'
  reviewIntervalDays: number | null
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

export interface Task {
  id: string
  fromEmployeeId: string
  toEmployeeId: string
  priority: 'high' | 'medium' | 'low'
  deadline: string
  objective: string
  context: string
  deliverable: string
  acceptanceCriteria: string
  escalateIf: string
  status: 'pending' | 'in_progress' | 'completed' | 'escalated'
  response?: string
  createdAt: string
  updatedAt: string
}

export interface RecurringTask {
  id: string
  employeeId: string
  name: string
  brief: string
  schedule: 'hourly' | 'daily' | 'weekly'
  scheduleTime?: string
  enabled: boolean
  lastRunAt: string | null
  nextRunAt: string
  createdAt: string
  updatedAt: string
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
    id: 'vercel-ai-gateway',
    name: 'Vercel AI Gateway',
    apiKey: '',
    baseUrl: 'https://ai-gateway.vercel.sh/v1',
    models: [
      // Anthropic
      'anthropic/claude-opus-4.6',
      'anthropic/claude-sonnet-4.6',
      'anthropic/claude-haiku-4.5',
      'anthropic/claude-sonnet-4.5',
      'anthropic/claude-opus-4.5',
      'anthropic/claude-opus-4.1',
      'anthropic/claude-sonnet-4',
      'anthropic/claude-opus-4',
      // OpenAI
      'openai/gpt-5.4',
      'openai/gpt-5.4-mini',
      'openai/gpt-5.3-codex',
      'openai/gpt-5.2',
      'openai/gpt-5',
      'openai/gpt-5-mini',
      'openai/gpt-4.1',
      'openai/gpt-4.1-mini',
      'openai/gpt-4o',
      'openai/gpt-4o-mini',
      'openai/o3',
      'openai/o3-mini',
      // Google
      'google/gemini-3-pro',
      'google/gemini-3-flash',
      'google/gemini-2.5-pro',
      'google/gemini-2.5-flash',
      'google/gemini-2.5-flash-lite',
      'google/gemini-2.0-flash',
      // xAI
      'xai/grok-4.1-fast-reasoning',
      'xai/grok-4.1-fast-non-reasoning',
      'xai/grok-4-fast-reasoning',
      'xai/grok-3',
      'xai/grok-code-fast-1',
      // DeepSeek
      'deepseek/deepseek-v3.2',
      'deepseek/deepseek-v3.2-thinking',
      'deepseek/deepseek-v3',
      'deepseek/deepseek-r1',
      // Mistral
      'mistral/mistral-large-3',
      'mistral/mistral-medium-3.1',
      'mistral/mistral-small-3',
      'mistral/codestral',
      // Meta
      'meta/llama-4-maverick',
      'meta/llama-3.3-70b',
      'meta/llama-3.1-70b',
      'meta/llama-3.1-8b',
      // Alibaba / Qwen
      'alibaba/qwen3-max',
      'alibaba/qwen3-pro',
      'alibaba/qwen-2.5-72b',
      // Minimax
      'minimax/minimax-m2.7',
      'minimax/minimax-m2.5'
    ],
    enabled: false
  },
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
    id: 'ollama-cloud',
    name: 'Ollama Cloud',
    apiKey: '',
    baseUrl: 'https://ollama.com/api',
    models: [
      'deepseek-v3.2',
      'deepseek-v3.1:671b',
      'qwen3-coder:480b',
      'qwen3.5:397b',
      'qwen3-next:80b',
      'gpt-oss:120b',
      'gpt-oss:20b',
      'glm-5',
      'glm-4.7',
      'nemotron-3-super',
      'devstral-2:123b',
      'cogito-2.1:671b',
      'minimax-m2.7',
      'minimax-m2.5',
      'kimi-k2.5',
      'kimi-k2-thinking',
      'mistral-large-3:675b'
    ],
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

export const COMPANY_AVATARS = [
  '🏢', '🏗️', '🏭', '🏦', '🏛️', '🏠', '🔥', '⚡',
  '🚀', '🌊', '🌿', '🎯', '💎', '🌟', '🔮', '🧬'
]

export const DEPARTMENT_COLORS = [
  'flame', 'sky', 'emerald', 'violet', 'amber', 'rose', 'cyan', 'indigo'
]
