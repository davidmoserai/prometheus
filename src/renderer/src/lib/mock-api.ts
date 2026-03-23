// Mock API for web preview mode (when running outside Electron)
import { v4 as uuid } from 'uuid'

interface Company {
  id: string
  name: string
  avatar: string
  createdAt: string
  updatedAt: string
}

interface Department {
  id: string
  name: string
  color: string
  createdAt: string
  updatedAt: string
}

interface ContactAccess {
  mode: 'none' | 'specific' | 'all'
  allowedEmployeeIds: string[]
  allowedDepartmentIds: string[]
}

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
  permissions: {
    canBrowseWeb: boolean
    canReadFiles: boolean
    canWriteFiles: boolean
    canExecuteCode: boolean
    contactAccess: ContactAccess
    autoApproveAll: boolean
  }
  memory: string
  departmentId: string | null
  status: 'active' | 'terminated'
  terminatedAt: string | null
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

interface TaskMessage {
  id: string
  role: 'agent' | 'user' | 'tool'
  employeeId?: string
  content: string
  timestamp: string
}

interface Task {
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
  messages: TaskMessage[]
  createdAt: string
  updatedAt: string
}

interface RecurringTask {
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

interface CompanyData {
  employees: Employee[]
  knowledge: KnowledgeDocument[]
  conversations: Conversation[]
  departments: Department[]
  tasks: Task[]
  recurringTasks: RecurringTask[]
}

const now = () => new Date().toISOString()

// Default company
const defaultCompanyId = uuid()
const engineeringDeptId = uuid()
const creativeDeptId = uuid()

const defaultContactAccess: ContactAccess = { mode: 'all', allowedEmployeeIds: [], allowedDepartmentIds: [] }

let companies: Company[] = [
  { id: defaultCompanyId, name: 'My Company', avatar: '🏢', createdAt: now(), updatedAt: now() }
]

let activeCompanyId: string = defaultCompanyId

// Company-scoped data
let companyData: Record<string, CompanyData> = {
  [defaultCompanyId]: {
    departments: [
      { id: engineeringDeptId, name: 'Engineering', color: 'sky', createdAt: now(), updatedAt: now() },
      { id: creativeDeptId, name: 'Creative', color: 'violet', createdAt: now(), updatedAt: now() }
    ],
    employees: [
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
        permissions: { canBrowseWeb: true, canReadFiles: true, canWriteFiles: false, canExecuteCode: false, contactAccess: defaultContactAccess, autoApproveAll: false },
        memory: '',
        departmentId: null,
        status: 'active',
        terminatedAt: null,
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
        permissions: { canBrowseWeb: false, canReadFiles: true, canWriteFiles: true, canExecuteCode: true, contactAccess: defaultContactAccess, autoApproveAll: false },
        memory: '',
        departmentId: engineeringDeptId,
        status: 'active',
        terminatedAt: null,
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
        permissions: { canBrowseWeb: true, canReadFiles: false, canWriteFiles: false, canExecuteCode: false, contactAccess: defaultContactAccess, autoApproveAll: false },
        memory: '',
        departmentId: creativeDeptId,
        status: 'active',
        terminatedAt: null,
        createdAt: now(),
        updatedAt: now()
      }
    ],
    knowledge: [
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
    ],
    conversations: [],
    tasks: [],
    recurringTasks: []
  }
}

function getActive(): CompanyData {
  if (!companyData[activeCompanyId]) {
    companyData[activeCompanyId] = { employees: [], knowledge: [], conversations: [], departments: [], tasks: [], recurringTasks: [] }
  }
  return companyData[activeCompanyId]
}

const defaultProviders = [
  { id: 'vercel-ai-gateway', name: 'Vercel AI Gateway', apiKey: '', baseUrl: 'https://ai-gateway.vercel.sh/v1', models: [
    'anthropic/claude-opus-4.6', 'anthropic/claude-sonnet-4.6', 'anthropic/claude-haiku-4.5', 'anthropic/claude-sonnet-4.5', 'anthropic/claude-opus-4.5', 'anthropic/claude-opus-4.1', 'anthropic/claude-sonnet-4', 'anthropic/claude-opus-4',
    'openai/gpt-5.4', 'openai/gpt-5.4-mini', 'openai/gpt-5.3-codex', 'openai/gpt-5.2', 'openai/gpt-5', 'openai/gpt-5-mini', 'openai/gpt-4.1', 'openai/gpt-4.1-mini', 'openai/gpt-4o', 'openai/gpt-4o-mini', 'openai/o3', 'openai/o3-mini',
    'google/gemini-3-pro', 'google/gemini-3-flash', 'google/gemini-2.5-pro', 'google/gemini-2.5-flash', 'google/gemini-2.5-flash-lite', 'google/gemini-2.0-flash',
    'xai/grok-4.1-fast-reasoning', 'xai/grok-4.1-fast-non-reasoning', 'xai/grok-4-fast-reasoning', 'xai/grok-3', 'xai/grok-code-fast-1',
    'deepseek/deepseek-v3.2', 'deepseek/deepseek-v3.2-thinking', 'deepseek/deepseek-v3', 'deepseek/deepseek-r1',
    'mistral/mistral-large-3', 'mistral/mistral-medium-3.1', 'mistral/mistral-small-3', 'mistral/codestral',
    'meta/llama-4-maverick', 'meta/llama-3.3-70b', 'meta/llama-3.1-70b', 'meta/llama-3.1-8b',
    'alibaba/qwen3-max', 'alibaba/qwen3-pro', 'alibaba/qwen-2.5-72b',
    'minimax/minimax-m2.7', 'minimax/minimax-m2.5'
  ], enabled: false },
  { id: 'openai', name: 'OpenAI', apiKey: '', models: ['gpt-4o', 'gpt-4o-mini', 'o1', 'o1-mini'], enabled: true },
  { id: 'anthropic', name: 'Anthropic', apiKey: '', models: ['claude-opus-4-20250514', 'claude-sonnet-4-20250514', 'claude-haiku-4-5-20251001'], enabled: true },
  { id: 'google', name: 'Google', apiKey: '', models: ['gemini-2.5-pro', 'gemini-2.5-flash'], enabled: false },
  { id: 'mistral', name: 'Mistral', apiKey: '', models: ['mistral-large-latest', 'mistral-small-latest'], enabled: false },
  { id: 'ollama-cloud', name: 'Ollama Cloud', apiKey: '', baseUrl: 'https://ollama.com/api', models: ['deepseek-v3.2', 'deepseek-v3.1:671b', 'qwen3-coder:480b', 'qwen3.5:397b', 'qwen3-next:80b', 'gpt-oss:120b', 'gpt-oss:20b', 'glm-5', 'glm-4.7', 'nemotron-3-super', 'devstral-2:123b', 'cogito-2.1:671b', 'minimax-m2.7', 'kimi-k2.5', 'mistral-large-3:675b'], enabled: false },
  { id: 'ollama', name: 'Ollama (Local)', apiKey: '', baseUrl: 'http://localhost:11434', models: ['llama3', 'mistral', 'codellama'], enabled: false }
]

let settings = { providers: defaultProviders, defaultProvider: 'openai', defaultModel: 'gpt-4o', theme: 'dark' as const, mcpServers: [] as { id: string; name: string; command: string; args: string[]; env?: Record<string, string>; enabled: boolean }[] }

// Install mock API on window if not in Electron
export function installMockApi() {
  if (window.api) return // Real Electron API exists

  const mockApi = {
    companies: {
      list: async () => companies,
      getActive: async () => activeCompanyId,
      setActive: async (id: string) => { activeCompanyId = id },
      create: async (data: { name: string; avatar: string }) => {
        const company: Company = { ...data, id: uuid(), createdAt: now(), updatedAt: now() }
        companies.push(company)
        companyData[company.id] = { employees: [], knowledge: [], conversations: [], departments: [], tasks: [], recurringTasks: [] }
        return company
      },
      update: async (id: string, data: Partial<Company>) => {
        companies = companies.map(c => c.id === id ? { ...c, ...data, updatedAt: now() } : c)
        return companies.find(c => c.id === id)
      },
      delete: async (id: string) => {
        if (companies.length <= 1) return false
        companies = companies.filter(c => c.id !== id)
        delete companyData[id]
        if (activeCompanyId === id) activeCompanyId = companies[0]?.id || ''
        return true
      }
    },
    departments: {
      list: async () => getActive().departments,
      create: async (data: { name: string; color: string }) => {
        const dept: Department = { ...data, id: uuid(), createdAt: now(), updatedAt: now() }
        getActive().departments.push(dept)
        return dept
      },
      update: async (id: string, data: Partial<Department>) => {
        const active = getActive()
        active.departments = active.departments.map(d => d.id === id ? { ...d, ...data, updatedAt: now() } : d)
        return active.departments.find(d => d.id === id)
      },
      delete: async (id: string) => {
        const active = getActive()
        active.departments = active.departments.filter(d => d.id !== id)
        active.employees.forEach(e => { if (e.departmentId === id) e.departmentId = null })
        return true
      }
    },
    employees: {
      list: async () => getActive().employees.filter(e => e.status === 'active'),
      listTerminated: async () => getActive().employees.filter(e => e.status === 'terminated'),
      get: async (id: string) => getActive().employees.find(e => e.id === id),
      create: async (data: Omit<Employee, 'id' | 'createdAt' | 'updatedAt'>) => {
        const emp = {
          ...data,
          departmentId: data.departmentId ?? null,
          status: data.status ?? 'active' as const,
          terminatedAt: data.terminatedAt ?? null,
          id: uuid(),
          createdAt: now(),
          updatedAt: now()
        } as Employee
        getActive().employees.push(emp)
        return emp
      },
      update: async (id: string, data: Partial<Employee>) => {
        const active = getActive()
        active.employees = active.employees.map(e => e.id === id ? { ...e, ...data, updatedAt: now() } : e)
        return active.employees.find(e => e.id === id)
      },
      delete: async (id: string) => { getActive().employees = getActive().employees.filter(e => e.id !== id); return true },
      fire: async (id: string) => {
        const active = getActive()
        active.employees = active.employees.map(e =>
          e.id === id ? { ...e, status: 'terminated' as const, terminatedAt: now(), updatedAt: now() } : e
        )
        return active.employees.find(e => e.id === id)
      },
      rehire: async (id: string) => {
        const active = getActive()
        active.employees = active.employees.map(e =>
          e.id === id ? { ...e, status: 'active' as const, terminatedAt: null, updatedAt: now() } : e
        )
        return active.employees.find(e => e.id === id)
      }
    },
    knowledge: {
      list: async () => getActive().knowledge,
      create: async (data: Omit<KnowledgeDocument, 'id' | 'createdAt' | 'updatedAt'>) => {
        const doc = { ...data, id: uuid(), createdAt: now(), updatedAt: now() } as KnowledgeDocument
        getActive().knowledge.push(doc)
        return doc
      },
      update: async (id: string, data: Partial<KnowledgeDocument>) => {
        const active = getActive()
        active.knowledge = active.knowledge.map(k => k.id === id ? { ...k, ...data, updatedAt: now() } : k)
        return active.knowledge.find(k => k.id === id)
      },
      delete: async (id: string) => { getActive().knowledge = getActive().knowledge.filter(k => k.id !== id); return true }
    },
    files: {
      pick: async () => ({ canceled: true, filePaths: [] }),
      upload: async (_conversationId: string, _filePath: string) => ({
        id: uuid(), filename: 'mock-file.txt', path: '/tmp/mock-file.txt', mimetype: 'text/plain', size: 0
      })
    },
    conversations: {
      list: async (employeeId: string) => getActive().conversations.filter(c => c.employeeId === employeeId),
      get: async (id: string) => getActive().conversations.find(c => c.id === id),
      create: async (employeeId: string) => {
        const conv: Conversation = { id: uuid(), employeeId, title: 'New conversation', messages: [], createdAt: now(), updatedAt: now() }
        getActive().conversations.push(conv)
        return conv
      },
      delete: async (id: string) => {
        const data = getActive()
        data.conversations = data.conversations.filter(c => c.id !== id)
      }
    },
    tasks: {
      list: async () => getActive().tasks || [],
      get: async (id: string) => (getActive().tasks || []).find(t => t.id === id),
      create: async (data: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => {
        const active = getActive()
        if (!active.tasks) active.tasks = []
        const task = { ...data, messages: data.messages || [], id: uuid(), createdAt: now(), updatedAt: now() } as Task
        active.tasks.push(task)
        return task
      },
      update: async (id: string, data: Partial<Task>) => {
        const active = getActive()
        if (!active.tasks) active.tasks = []
        active.tasks = active.tasks.map(t => t.id === id ? { ...t, ...data, updatedAt: now() } : t)
        return active.tasks.find(t => t.id === id)
      },
      delete: async (id: string) => {
        const active = getActive()
        if (!active.tasks) return true
        active.tasks = active.tasks.filter(t => t.id !== id)
        return true
      },
      reply: async (taskId: string, message: string) => {
        const active = getActive()
        const task = (active.tasks || []).find(t => t.id === taskId)
        if (!task) return undefined
        if (!task.messages) task.messages = []
        // Add user message
        task.messages.push({ id: uuid(), role: 'user', content: message, timestamp: now() })
        // Add mock agent response
        const emp = active.employees.find(e => e.id === task.toEmployeeId)
        const reply = `[Mock] ${emp?.name || 'Agent'} received your reply. In the real app, this would trigger the agent to respond.`
        task.messages.push({ id: uuid(), role: 'agent', employeeId: task.toEmployeeId, content: reply, timestamp: now() })
        task.response = reply
        task.updatedAt = now()
        return task
      }
    },
    chat: {
      send: async (conversationId: string, message: string) => {
        const active = getActive()
        const conv = active.conversations.find(c => c.id === conversationId)
        if (!conv) return
        const emp = active.employees.find(e => e.id === conv.employeeId)
        conv.messages.push({ id: uuid(), role: 'user', content: message, timestamp: now() })
        if (conv.messages.length === 1) conv.title = message.slice(0, 60)
        const reply = `Hey! I'm **${emp?.name || 'your employee'}**, and I received your message. Once the agent backend is connected with a real API key, I'll be fully operational.\n\nFor now, head to **Settings** to configure a provider.`
        conv.messages.push({ id: uuid(), role: 'assistant', content: reply, timestamp: now() })
        conv.updatedAt = now()
        return conv.messages[conv.messages.length - 1]
      },
      countTokens: async (conversationId: string) => {
        const conv = getActive().conversations.find(c => c.id === conversationId)
        if (!conv) return 0
        const text = conv.messages.map(m => m.content).join('')
        return Math.ceil(text.length / 4)
      },
      compress: async (conversationId: string) => {
        const conv = getActive().conversations.find(c => c.id === conversationId)
        if (!conv || conv.messages.length <= 4) return conv
        const toKeep = conv.messages.slice(conv.messages.length - 4)
        const summaryMsg = { id: uuid(), role: 'system', content: '[Conversation Summary]\nPrevious messages were summarized.', timestamp: now() }
        conv.messages = [summaryMsg, ...toKeep]
        conv.updatedAt = now()
        return conv
      },
      onStream: () => () => {},
      onFileWritten: () => () => {},
      onToolCall: () => () => {}
    },
    recurringTasks: {
      list: async () => getActive().recurringTasks || [],
      get: async (id: string) => (getActive().recurringTasks || []).find(t => t.id === id),
      create: async (data: Omit<RecurringTask, 'id' | 'createdAt' | 'updatedAt'>) => {
        const active = getActive()
        if (!active.recurringTasks) active.recurringTasks = []
        const task = { ...data, id: uuid(), createdAt: now(), updatedAt: now() } as RecurringTask
        active.recurringTasks.push(task)
        return task
      },
      update: async (id: string, data: Partial<RecurringTask>) => {
        const active = getActive()
        if (!active.recurringTasks) active.recurringTasks = []
        active.recurringTasks = active.recurringTasks.map(t => t.id === id ? { ...t, ...data, updatedAt: now() } : t)
        return active.recurringTasks.find(t => t.id === id)
      },
      delete: async (id: string) => {
        const active = getActive()
        if (!active.recurringTasks) return true
        active.recurringTasks = active.recurringTasks.filter(t => t.id !== id)
        return true
      },
      onExecuted: () => () => {}
    },
    notifications: {
      onNotification: () => () => {}
    },
    claudeCode: {
      isInstalled: async () => false,
      authStatus: async () => ({ authenticated: false }),
      login: async () => ({ authenticated: false, error: 'Not available in web preview' })
    },
    mcp: {
      list: async () => (settings as Record<string, unknown>).mcpServers || [],
      add: async (_config: unknown) => ({ success: true, tools: ['mock_tool_1', 'mock_tool_2'] }),
      update: async (_id: string, _updates: unknown) => ({ success: true, tools: [] }),
      remove: async (_id: string) => ({ success: true }),
      getTools: async (_serverId: string) => ['mock_tool_1', 'mock_tool_2'],
      testConnection: async (_config: unknown) => ({ success: true, tools: ['mock_tool_1', 'mock_tool_2'] })
    },
    settings: {
      get: async () => settings,
      update: async (s: Partial<typeof settings>) => { settings = { ...settings, ...s }; return settings }
    }
  }

  ;(window as unknown as { api: typeof mockApi }).api = mockApi
}
