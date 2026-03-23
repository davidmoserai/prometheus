import { create } from 'zustand'

// Streaming parts for chronological rendering of text + tool calls + files
export type StreamPart =
  | { type: 'text'; content: string }
  | { type: 'tool_call'; id: string; tool: string; summary: string; detail?: string; status: 'running' | 'done' }
  | { type: 'file_written'; path: string; content: string }

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

interface ToolAssignment {
  id: string
  name: string
  source: 'builtin' | 'mcp'
  mcpServerId?: string
  enabled: boolean
  requiresApproval: boolean
}

interface MCPServerConfig {
  id: string
  name: string
  command: string
  args: string[]
  env?: Record<string, string>
  enabled: boolean
  githubUrl?: string
  isDefault?: boolean
}

interface PermissionSet {
  canBrowseWeb: boolean
  canReadFiles: boolean
  canWriteFiles: boolean
  canExecuteCode: boolean
  contactAccess: ContactAccess
  autoApproveAll: boolean
}

interface KnowledgeDocument {
  id: string
  title: string
  content: string
  tags: string[]
  createdAt: string
  updatedAt: string
}

interface ChatAttachment {
  id: string
  filename: string
  path: string
  mimetype: string
  size: number
}

interface Conversation {
  id: string
  employeeId: string
  peerEmployeeId?: string
  title: string
  messages: ChatMessage[]
  createdAt: string
  updatedAt: string
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
  handoffTo?: string
  handoffFrom?: string
  attachments?: ChatAttachment[]
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

interface ProviderConfig {
  id: string
  name: string
  apiKey: string
  baseUrl?: string
  models: string[]
  enabled: boolean
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

interface AppNotification {
  id: string
  type: 'task_completed' | 'task_escalated' | 'recurring_executed' | 'tool_approval' | 'info'
  title: string
  body: string
  read: boolean
  timestamp: string
}

interface AppSettings {
  providers: ProviderConfig[]
  defaultProvider: string
  defaultModel: string
  theme: 'dark' | 'light'
  mcpServers: MCPServerConfig[]
}

interface AppState {
  // Company data
  companies: Company[]
  activeCompanyId: string | null

  // Scoped data
  employees: Employee[]
  terminatedEmployees: Employee[]
  departments: Department[]
  knowledge: KnowledgeDocument[]
  conversations: Conversation[]
  settings: AppSettings | null

  // Task data
  tasks: Task[]
  recurringTasks: RecurringTask[]

  // Notifications
  notifications: AppNotification[]

  // MCP
  mcpServers: MCPServerConfig[]
  mcpToolNames: Record<string, string[]> // serverId -> tool names

  // UI State
  activeView: 'dashboard' | 'employees' | 'chat' | 'knowledge' | 'tasks' | 'settings'
  selectedEmployeeId: string | null
  selectedConversationId: string | null
  isCreatingEmployee: boolean
  editingEmployeeId: string | null
  streamingParts: Record<string, StreamPart[]>
  isLoading: boolean
  sidebarCollapsed: boolean

  // Actions — UI
  setActiveView: (view: AppState['activeView']) => void
  setSidebarCollapsed: (collapsed: boolean) => void
  toggleSidebar: () => void
  setSelectedEmployee: (id: string | null) => void
  setSelectedConversation: (id: string | null) => void
  setCreatingEmployee: (creating: boolean) => void
  setEditingEmployee: (id: string | null) => void
  appendStreamText: (convId: string, delta: string) => void
  appendStreamPart: (convId: string, part: StreamPart) => void
  clearStreamingParts: (convId: string) => void

  // Actions — Companies
  loadCompanies: () => Promise<void>
  createCompany: (data: { name: string; avatar: string }) => Promise<Company>
  updateCompany: (id: string, data: Partial<Company>) => Promise<void>
  deleteCompany: (id: string) => Promise<void>
  switchCompany: (id: string) => Promise<void>

  // Actions — Departments
  loadDepartments: () => Promise<void>
  createDepartment: (data: { name: string; color: string }) => Promise<Department>
  updateDepartment: (id: string, data: Partial<Department>) => Promise<void>
  deleteDepartment: (id: string) => Promise<void>

  // Actions — Employees
  loadEmployees: () => Promise<void>
  loadTerminatedEmployees: () => Promise<void>
  createEmployee: (data: Omit<Employee, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Employee>
  updateEmployee: (id: string, data: Partial<Employee>) => Promise<void>
  deleteEmployee: (id: string) => Promise<void>
  fireEmployee: (id: string) => Promise<void>
  rehireEmployee: (id: string) => Promise<void>

  // Actions — Knowledge
  loadKnowledge: () => Promise<void>
  createKnowledge: (data: Omit<KnowledgeDocument, 'id' | 'createdAt' | 'updatedAt'>) => Promise<KnowledgeDocument>
  updateKnowledge: (id: string, data: Partial<KnowledgeDocument>) => Promise<void>
  deleteKnowledge: (id: string) => Promise<void>

  // Actions — Conversations & Chat
  loadConversations: (employeeId: string) => Promise<void>
  createConversation: (employeeId: string) => Promise<Conversation>
  deleteConversation: (conversationId: string) => Promise<void>
  sendMessage: (conversationId: string, message: string) => Promise<void>
  uploadFile: (conversationId: string, filePath: string) => Promise<ChatAttachment>

  // Actions — Tasks
  loadTasks: () => Promise<void>
  createTask: (data: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Task>
  updateTask: (id: string, data: Partial<Task>) => Promise<void>
  deleteTask: (id: string) => Promise<void>
  replyToTask: (taskId: string, message: string) => Promise<void>

  // Actions — Recurring Tasks
  loadRecurringTasks: () => Promise<void>
  createRecurringTask: (data: Omit<RecurringTask, 'id' | 'createdAt' | 'updatedAt'>) => Promise<RecurringTask>
  updateRecurringTask: (id: string, data: Partial<RecurringTask>) => Promise<void>
  deleteRecurringTask: (id: string) => Promise<void>

  // Actions — Token counting & compression
  getTokenCount: (conversationId: string) => Promise<number>
  compressConversation: (conversationId: string) => Promise<void>

  // Actions — Notifications
  addNotification: (notification: Omit<AppNotification, 'id' | 'read' | 'timestamp'>) => void
  markNotificationRead: (id: string) => void
  markAllNotificationsRead: () => void
  clearNotifications: () => void

  // Actions — Settings
  loadSettings: () => Promise<void>
  updateSettings: (settings: Partial<AppSettings>) => Promise<void>

  // Actions — MCP
  loadMcpServers: () => Promise<void>
  addMcpServer: (config: MCPServerConfig) => Promise<{ success: boolean; tools?: string[]; error?: string }>
  updateMcpServer: (id: string, updates: Partial<MCPServerConfig>) => Promise<{ success: boolean; tools?: string[]; error?: string }>
  removeMcpServer: (id: string) => Promise<void>
  getMcpTools: (serverId: string) => Promise<string[]>
  testMcpConnection: (config: MCPServerConfig) => Promise<{ success: boolean; tools?: string[]; error?: string }>
}

export const useAppStore = create<AppState>((set, get) => ({
  companies: [],
  activeCompanyId: null,
  employees: [],
  terminatedEmployees: [],
  departments: [],
  knowledge: [],
  conversations: [],
  tasks: [],
  recurringTasks: [],
  notifications: [],
  mcpServers: [],
  mcpToolNames: {},
  settings: null,
  activeView: 'dashboard',
  selectedEmployeeId: null,
  selectedConversationId: null,
  isCreatingEmployee: false,
  editingEmployeeId: null,
  streamingParts: {},
  isLoading: false,
  sidebarCollapsed: false,

  // UI setters
  setActiveView: (view) => set({ activeView: view }),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setSelectedEmployee: (id) => set({ selectedEmployeeId: id }),
  setSelectedConversation: (id) => set({ selectedConversationId: id }),
  setCreatingEmployee: (creating) => set({ isCreatingEmployee: creating }),
  setEditingEmployee: (id) => set({ editingEmployeeId: id }),
  appendStreamText: (convId, delta) =>
    set((state) => {
      const parts = [...(state.streamingParts[convId] || [])]
      const last = parts[parts.length - 1]
      if (last && last.type === 'text') {
        parts[parts.length - 1] = { ...last, content: last.content + delta }
      } else {
        parts.push({ type: 'text', content: delta })
      }
      return { streamingParts: { ...state.streamingParts, [convId]: parts } }
    }),
  appendStreamPart: (convId, part) =>
    set((state) => {
      const parts = [...(state.streamingParts[convId] || []), part]
      return { streamingParts: { ...state.streamingParts, [convId]: parts } }
    }),
  clearStreamingParts: (convId) =>
    set((state) => {
      const { [convId]: _, ...rest } = state.streamingParts
      return { streamingParts: rest }
    }),

  // Companies
  loadCompanies: async () => {
    const companies = await window.api.companies.list()
    const activeCompanyId = await window.api.companies.getActive()
    set({ companies, activeCompanyId })
  },

  createCompany: async (data) => {
    const company = await window.api.companies.create(data)
    await get().loadCompanies()
    return company
  },

  updateCompany: async (id, data) => {
    await window.api.companies.update(id, data)
    await get().loadCompanies()
  },

  deleteCompany: async (id) => {
    await window.api.companies.delete(id)
    await get().loadCompanies()
    // Reload scoped data for new active company
    await get().loadEmployees()
    await get().loadTerminatedEmployees()
    await get().loadDepartments()
    await get().loadKnowledge()
  },

  switchCompany: async (id) => {
    await window.api.companies.setActive(id)
    set({ activeCompanyId: id, selectedEmployeeId: null, selectedConversationId: null, conversations: [] })
    // Reload all scoped data
    await Promise.all([
      get().loadEmployees(),
      get().loadTerminatedEmployees(),
      get().loadDepartments(),
      get().loadKnowledge(),
      get().loadTasks(),
      get().loadRecurringTasks()
    ])
  },

  // Departments
  loadDepartments: async () => {
    const departments = await window.api.departments.list()
    set({ departments })
  },

  createDepartment: async (data) => {
    const dept = await window.api.departments.create(data)
    await get().loadDepartments()
    return dept
  },

  updateDepartment: async (id, data) => {
    await window.api.departments.update(id, data)
    await get().loadDepartments()
  },

  deleteDepartment: async (id) => {
    await window.api.departments.delete(id)
    await get().loadDepartments()
    // Reload employees since departmentId may have been cleared
    await get().loadEmployees()
  },

  // Employees
  loadEmployees: async () => {
    const employees = await window.api.employees.list()
    set({ employees })
  },

  loadTerminatedEmployees: async () => {
    const terminatedEmployees = await window.api.employees.listTerminated()
    set({ terminatedEmployees })
  },

  createEmployee: async (data) => {
    const employee = await window.api.employees.create(data)
    await get().loadEmployees()
    return employee
  },

  updateEmployee: async (id, data) => {
    await window.api.employees.update(id, data)
    await get().loadEmployees()
  },

  deleteEmployee: async (id) => {
    await window.api.employees.delete(id)
    await get().loadEmployees()
    if (get().selectedEmployeeId === id) {
      set({ selectedEmployeeId: null })
    }
  },

  fireEmployee: async (id) => {
    await window.api.employees.fire(id)
    await get().loadEmployees()
    await get().loadTerminatedEmployees()
    if (get().selectedEmployeeId === id) {
      set({ selectedEmployeeId: null })
    }
  },

  rehireEmployee: async (id) => {
    await window.api.employees.rehire(id)
    await get().loadEmployees()
    await get().loadTerminatedEmployees()
  },

  // Knowledge
  loadKnowledge: async () => {
    const knowledge = await window.api.knowledge.list()
    set({ knowledge })
  },

  createKnowledge: async (data) => {
    const doc = await window.api.knowledge.create(data)
    await get().loadKnowledge()
    return doc
  },

  updateKnowledge: async (id, data) => {
    await window.api.knowledge.update(id, data)
    await get().loadKnowledge()
  },

  deleteKnowledge: async (id) => {
    await window.api.knowledge.delete(id)
    await get().loadKnowledge()
  },

  // Conversations
  loadConversations: async (employeeId: string) => {
    const conversations = await window.api.conversations.list(employeeId)
    set({ conversations })
  },

  createConversation: async (employeeId: string) => {
    const conv = await window.api.conversations.create(employeeId)
    await get().loadConversations(employeeId)
    set({ selectedConversationId: conv.id })
    return conv
  },

  deleteConversation: async (conversationId: string) => {
    await window.api.conversations.delete(conversationId)
    const { selectedConversationId, selectedEmployeeId } = get()
    if (selectedConversationId === conversationId) {
      set({ selectedConversationId: null })
    }
    if (selectedEmployeeId) {
      await get().loadConversations(selectedEmployeeId)
    }
  },

  sendMessage: async (conversationId, message) => {
    // Clear previous streaming parts at the start of a new turn
    get().clearStreamingParts(conversationId)
    await window.api.chat.send(conversationId, message)
    // Backend pushes messages via chat:messageStored events — no re-fetch needed
    // Just sync the final state to get proper IDs and clear streaming
    const conv = await window.api.conversations.get(conversationId)
    if (conv) {
      set((state) => ({
        conversations: state.conversations.map(c =>
          c.id === conversationId ? conv : c
        )
      }))
    }
    // Don't clear streaming parts here — they contain tool calls and files
    // that should stay visible. They get cleared when the next message starts streaming.
  },

  uploadFile: async (conversationId, filePath) => {
    return window.api.files.upload(conversationId, filePath)
  },

  // Tasks
  loadTasks: async () => {
    const tasks = await window.api.tasks.list()
    set({ tasks })
  },

  createTask: async (data) => {
    const task = await window.api.tasks.create(data)
    await get().loadTasks()
    return task
  },

  updateTask: async (id, data) => {
    await window.api.tasks.update(id, data)
    await get().loadTasks()
  },

  deleteTask: async (id) => {
    await window.api.tasks.delete(id)
    await get().loadTasks()
  },

  replyToTask: async (taskId, message) => {
    await window.api.tasks.reply(taskId, message)
    await get().loadTasks()
  },

  // Recurring Tasks
  loadRecurringTasks: async () => {
    const recurringTasks = await window.api.recurringTasks.list()
    set({ recurringTasks })
  },

  createRecurringTask: async (data) => {
    const task = await window.api.recurringTasks.create(data)
    await get().loadRecurringTasks()
    return task
  },

  updateRecurringTask: async (id, data) => {
    await window.api.recurringTasks.update(id, data)
    await get().loadRecurringTasks()
  },

  deleteRecurringTask: async (id) => {
    await window.api.recurringTasks.delete(id)
    await get().loadRecurringTasks()
  },

  // Token counting & compression
  getTokenCount: async (conversationId) => {
    if (!window.api?.chat?.countTokens) {
      // Fallback: estimate locally
      const conv = get().conversations.find(c => c.id === conversationId)
      if (!conv) return 0
      const text = conv.messages.map(m => m.content).join('')
      return Math.ceil(text.length / 4)
    }
    return window.api.chat.countTokens(conversationId)
  },

  compressConversation: async (conversationId) => {
    if (!window.api?.chat?.compress) return
    const conv = await window.api.chat.compress(conversationId)
    if (conv) {
      set((state) => ({
        conversations: state.conversations.map(c =>
          c.id === conversationId ? conv : c
        )
      }))
    }
  },

  // Notifications
  addNotification: (notification) =>
    set((state) => ({
      notifications: [
        {
          ...notification,
          id: crypto.randomUUID(),
          read: false,
          timestamp: new Date().toISOString()
        },
        ...state.notifications
      ].slice(0, 50) // Keep last 50 notifications
    })),

  markNotificationRead: (id) =>
    set((state) => ({
      notifications: state.notifications.map(n =>
        n.id === id ? { ...n, read: true } : n
      )
    })),

  markAllNotificationsRead: () =>
    set((state) => ({
      notifications: state.notifications.map(n => ({ ...n, read: true }))
    })),

  clearNotifications: () => set({ notifications: [] }),

  // Settings
  loadSettings: async () => {
    const settings = await window.api.settings.get()
    set({ settings })
  },

  updateSettings: async (settings) => {
    await window.api.settings.update(settings)
    await get().loadSettings()
  },

  // MCP
  loadMcpServers: async () => {
    if (!window.api?.mcp) return
    const servers = await window.api.mcp.list()
    set({ mcpServers: servers || [] })

    // Load tool names for each connected server
    const toolNames: Record<string, string[]> = {}
    for (const server of (servers || [])) {
      if (server.enabled) {
        try {
          const tools = await window.api.mcp.getTools(server.id)
          toolNames[server.id] = tools || []
        } catch {
          toolNames[server.id] = []
        }
      }
    }
    set({ mcpToolNames: toolNames })
  },

  addMcpServer: async (config) => {
    if (!window.api?.mcp) return { success: false, error: 'MCP not available' }
    const result = await window.api.mcp.add(config)
    await get().loadMcpServers()
    return result
  },

  updateMcpServer: async (id, updates) => {
    if (!window.api?.mcp) return { success: false, error: 'MCP not available' }
    const result = await window.api.mcp.update(id, updates)
    await get().loadMcpServers()
    return result
  },

  removeMcpServer: async (id) => {
    if (!window.api?.mcp) return
    await window.api.mcp.remove(id)
    await get().loadMcpServers()
  },

  getMcpTools: async (serverId) => {
    if (!window.api?.mcp) return []
    return window.api.mcp.getTools(serverId)
  },

  testMcpConnection: async (config) => {
    if (!window.api?.mcp) return { success: false, error: 'MCP not available' }
    return window.api.mcp.testConnection(config)
  }
}))

export type { Company, Department, ContactAccess, Employee, KnowledgeDocument, Conversation, ChatMessage, ChatAttachment, Task, TaskMessage, RecurringTask, AppNotification, AppSettings, ProviderConfig, ToolAssignment, PermissionSet, MCPServerConfig }
