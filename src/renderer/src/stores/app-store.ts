import { create } from 'zustand'

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
  enabled: boolean
  requiresApproval: boolean
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

interface Conversation {
  id: string
  employeeId: string
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

interface AppSettings {
  providers: ProviderConfig[]
  defaultProvider: string
  defaultModel: string
  theme: 'dark' | 'light'
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

  // UI State
  activeView: 'dashboard' | 'employees' | 'chat' | 'knowledge' | 'tasks' | 'settings'
  selectedEmployeeId: string | null
  selectedConversationId: string | null
  isCreatingEmployee: boolean
  editingEmployeeId: string | null
  streamingContent: Record<string, string>
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
  setStreamingContent: (convId: string, content: string) => void
  clearStreamingContent: (convId: string) => void

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

  // Actions — Tasks
  loadTasks: () => Promise<void>
  createTask: (data: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Task>
  updateTask: (id: string, data: Partial<Task>) => Promise<void>
  deleteTask: (id: string) => Promise<void>

  // Actions — Settings
  loadSettings: () => Promise<void>
  updateSettings: (settings: Partial<AppSettings>) => Promise<void>
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
  settings: null,
  activeView: 'dashboard',
  selectedEmployeeId: null,
  selectedConversationId: null,
  isCreatingEmployee: false,
  editingEmployeeId: null,
  streamingContent: {},
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
  setStreamingContent: (convId, content) =>
    set((state) => ({
      streamingContent: { ...state.streamingContent, [convId]: content }
    })),
  clearStreamingContent: (convId) =>
    set((state) => {
      const { [convId]: _, ...rest } = state.streamingContent
      return { streamingContent: rest }
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
      get().loadTasks()
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
    await window.api.chat.send(conversationId, message)
    const conv = await window.api.conversations.get(conversationId)
    if (conv) {
      set((state) => ({
        conversations: state.conversations.map(c =>
          c.id === conversationId ? conv : c
        )
      }))
    }
    get().clearStreamingContent(conversationId)
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

  // Settings
  loadSettings: async () => {
    const settings = await window.api.settings.get()
    set({ settings })
  },

  updateSettings: async (settings) => {
    await window.api.settings.update(settings)
    await get().loadSettings()
  }
}))

export type { Company, Department, ContactAccess, Employee, KnowledgeDocument, Conversation, ChatMessage, Task, AppSettings, ProviderConfig, ToolAssignment, PermissionSet }
