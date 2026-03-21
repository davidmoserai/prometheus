// Mock API for web preview mode (when running outside Electron)
import { v4 as uuid } from 'uuid'

interface Employee {
  id: string
  name: string
  role: string
  avatar: string
  systemPrompt: string
  knowledgeIds: string[]
  tools: { id: string; name: string; source: string; enabled: boolean; requiresApproval: boolean }[]
  provider: string
  model: string
  permissions: Record<string, boolean>
  createdAt: string
  updatedAt: string
}

interface KnowledgeDocument {
  id: string
  title: string
  content: string
  tags: string[]
  createdAt: string
  updatedAt: string
}

interface Conversation {
  id: string
  employeeId: string
  title: string
  messages: { id: string; role: string; content: string; timestamp: string }[]
  createdAt: string
  updatedAt: string
}

const now = () => new Date().toISOString()

// In-memory store
let employees: Employee[] = [
  {
    id: uuid(),
    name: 'Atlas',
    role: 'Senior Research Analyst',
    avatar: '🧠',
    systemPrompt: 'You are Atlas, a senior research analyst. You excel at finding information, synthesizing data, and providing well-sourced answers.',
    knowledgeIds: [],
    tools: [
      { id: 'web-search', name: 'Web Search', source: 'builtin', enabled: true, requiresApproval: false },
      { id: 'web-browse', name: 'Web Browse', source: 'builtin', enabled: true, requiresApproval: false },
      { id: 'file-read', name: 'Read Files', source: 'builtin', enabled: true, requiresApproval: false },
    ],
    provider: 'openai',
    model: 'gpt-4o',
    permissions: { canBrowseWeb: true, canReadFiles: true, canWriteFiles: false, canExecuteCode: false, canContactEmployees: true, autoApproveAll: false },
    createdAt: now(),
    updatedAt: now()
  },
  {
    id: uuid(),
    name: 'Spark',
    role: 'Full-Stack Developer',
    avatar: '⚡',
    systemPrompt: 'You are Spark, an expert full-stack developer. You write clean, efficient code and can debug complex issues.',
    knowledgeIds: [],
    tools: [
      { id: 'file-read', name: 'Read Files', source: 'builtin', enabled: true, requiresApproval: false },
      { id: 'file-write', name: 'Write Files', source: 'builtin', enabled: true, requiresApproval: true },
      { id: 'code-execute', name: 'Execute Code', source: 'builtin', enabled: true, requiresApproval: true },
      { id: 'github', name: 'GitHub', source: 'mcp', enabled: true, requiresApproval: false },
    ],
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    permissions: { canBrowseWeb: false, canReadFiles: true, canWriteFiles: true, canExecuteCode: true, canContactEmployees: true, autoApproveAll: false },
    createdAt: now(),
    updatedAt: now()
  },
  {
    id: uuid(),
    name: 'Muse',
    role: 'Creative Writer & Copywriter',
    avatar: '🎨',
    systemPrompt: 'You are Muse, a talented creative writer and copywriter. You craft compelling narratives, marketing copy, and creative content.',
    knowledgeIds: [],
    tools: [
      { id: 'web-search', name: 'Web Search', source: 'builtin', enabled: true, requiresApproval: false },
    ],
    provider: 'openai',
    model: 'gpt-4o',
    permissions: { canBrowseWeb: true, canReadFiles: false, canWriteFiles: false, canExecuteCode: false, canContactEmployees: true, autoApproveAll: false },
    createdAt: now(),
    updatedAt: now()
  }
]

let knowledge: KnowledgeDocument[] = [
  {
    id: uuid(),
    title: 'Company Brand Guidelines',
    content: '# Brand Guidelines\n\n## Voice & Tone\n- Professional yet approachable\n- Clear and concise\n- Technically accurate\n\n## Values\n- Innovation first\n- User-centric design\n- Transparency in all communications',
    tags: ['brand', 'guidelines'],
    createdAt: now(),
    updatedAt: now()
  },
  {
    id: uuid(),
    title: 'Code Standards',
    content: '# Code Standards\n\n## TypeScript\n- Use strict mode\n- Prefer interfaces over types\n- No `any` types\n\n## React\n- Functional components only\n- Use hooks for state\n- Keep components small and focused',
    tags: ['code', 'standards', 'engineering'],
    createdAt: now(),
    updatedAt: now()
  }
]

let conversations: Conversation[] = []

const defaultProviders = [
  { id: 'openai', name: 'OpenAI', authMethod: 'api_key', apiKey: '', oauth: null, oauthSupported: true, oauthClientId: '', oauthAuthUrl: '', oauthTokenUrl: '', oauthScopes: [], models: ['gpt-4o', 'gpt-4o-mini', 'o1', 'o1-mini'], enabled: true },
  { id: 'anthropic', name: 'Anthropic', authMethod: 'api_key', apiKey: '', oauth: null, oauthSupported: true, oauthClientId: '', oauthAuthUrl: '', oauthTokenUrl: '', oauthScopes: [], models: ['claude-opus-4-20250514', 'claude-sonnet-4-20250514', 'claude-haiku-4-5-20251001'], enabled: true },
  { id: 'google', name: 'Google', authMethod: 'api_key', apiKey: '', oauth: null, oauthSupported: true, oauthClientId: '', oauthAuthUrl: '', oauthTokenUrl: '', oauthScopes: [], models: ['gemini-2.5-pro', 'gemini-2.5-flash'], enabled: false },
  { id: 'mistral', name: 'Mistral', authMethod: 'api_key', apiKey: '', oauth: null, oauthSupported: false, models: ['mistral-large-latest', 'mistral-small-latest'], enabled: false },
  { id: 'ollama', name: 'Ollama (Local)', authMethod: 'api_key', apiKey: '', oauth: null, oauthSupported: false, baseUrl: 'http://localhost:11434', models: ['llama3', 'mistral', 'codellama'], enabled: false }
]

let settings = { providers: defaultProviders, defaultProvider: 'openai', defaultModel: 'gpt-4o', theme: 'dark' as const }

// Install mock API on window if not in Electron
export function installMockApi() {
  if (window.api) return // Real Electron API exists

  const mockApi = {
    employees: {
      list: async () => employees,
      get: async (id: string) => employees.find(e => e.id === id),
      create: async (data: Omit<Employee, 'id' | 'createdAt' | 'updatedAt'>) => {
        const emp = { ...data, id: uuid(), createdAt: now(), updatedAt: now() } as Employee
        employees.push(emp)
        return emp
      },
      update: async (id: string, data: Partial<Employee>) => {
        employees = employees.map(e => e.id === id ? { ...e, ...data, updatedAt: now() } : e)
        return employees.find(e => e.id === id)
      },
      delete: async (id: string) => { employees = employees.filter(e => e.id !== id); return true }
    },
    knowledge: {
      list: async () => knowledge,
      create: async (data: Omit<KnowledgeDocument, 'id' | 'createdAt' | 'updatedAt'>) => {
        const doc = { ...data, id: uuid(), createdAt: now(), updatedAt: now() } as KnowledgeDocument
        knowledge.push(doc)
        return doc
      },
      update: async (id: string, data: Partial<KnowledgeDocument>) => {
        knowledge = knowledge.map(k => k.id === id ? { ...k, ...data, updatedAt: now() } : k)
        return knowledge.find(k => k.id === id)
      },
      delete: async (id: string) => { knowledge = knowledge.filter(k => k.id !== id); return true }
    },
    conversations: {
      list: async (employeeId: string) => conversations.filter(c => c.employeeId === employeeId),
      get: async (id: string) => conversations.find(c => c.id === id),
      create: async (employeeId: string) => {
        const conv: Conversation = { id: uuid(), employeeId, title: 'New conversation', messages: [], createdAt: now(), updatedAt: now() }
        conversations.push(conv)
        return conv
      }
    },
    chat: {
      send: async (conversationId: string, message: string) => {
        const conv = conversations.find(c => c.id === conversationId)
        if (!conv) return
        const emp = employees.find(e => e.id === conv.employeeId)
        conv.messages.push({ id: uuid(), role: 'user', content: message, timestamp: now() })
        if (conv.messages.length === 1) conv.title = message.slice(0, 60)
        const reply = `Hey! I'm **${emp?.name || 'your employee'}**, and I received your message. Once the agent backend is connected with a real API key, I'll be fully operational.\n\nFor now, head to **Settings** to configure a provider.`
        conv.messages.push({ id: uuid(), role: 'assistant', content: reply, timestamp: now() })
        conv.updatedAt = now()
        return conv.messages[conv.messages.length - 1]
      },
      onStream: () => () => {}
    },
    settings: {
      get: async () => settings,
      update: async (s: Partial<typeof settings>) => { settings = { ...settings, ...s }; return settings }
    },
    oauth: {
      start: async () => ({ state: 'mock', redirectUri: 'mock' }),
      exchange: async () => ({}),
      disconnect: async () => {},
      onCallback: () => () => {}
    }
  }

  ;(window as unknown as { api: typeof mockApi }).api = mockApi
}
