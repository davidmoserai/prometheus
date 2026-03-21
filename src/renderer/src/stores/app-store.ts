import { create } from 'zustand'

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
  canContactEmployees: boolean
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

type AuthMethod = 'api_key' | 'oauth'

interface OAuthState {
  accessToken: string
  refreshToken: string
  expiresAt: string
  scope: string
}

interface ProviderConfig {
  id: string
  name: string
  authMethod: AuthMethod
  apiKey: string
  oauth: OAuthState | null
  oauthSupported: boolean
  oauthClientId?: string
  oauthAuthUrl?: string
  oauthTokenUrl?: string
  oauthScopes?: string[]
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
  // Data
  employees: Employee[]
  knowledge: KnowledgeDocument[]
  conversations: Conversation[]
  settings: AppSettings | null

  // UI State
  activeView: 'dashboard' | 'employees' | 'chat' | 'knowledge' | 'settings'
  selectedEmployeeId: string | null
  selectedConversationId: string | null
  isCreatingEmployee: boolean
  editingEmployeeId: string | null
  streamingContent: Record<string, string>
  isLoading: boolean

  // Actions
  setActiveView: (view: AppState['activeView']) => void
  setSelectedEmployee: (id: string | null) => void
  setSelectedConversation: (id: string | null) => void
  setCreatingEmployee: (creating: boolean) => void
  setEditingEmployee: (id: string | null) => void
  setStreamingContent: (convId: string, content: string) => void
  clearStreamingContent: (convId: string) => void

  // Data actions
  loadEmployees: () => Promise<void>
  loadKnowledge: () => Promise<void>
  loadConversations: (employeeId: string) => Promise<void>
  loadSettings: () => Promise<void>
  createEmployee: (data: Omit<Employee, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Employee>
  updateEmployee: (id: string, data: Partial<Employee>) => Promise<void>
  deleteEmployee: (id: string) => Promise<void>
  createKnowledge: (data: Omit<KnowledgeDocument, 'id' | 'createdAt' | 'updatedAt'>) => Promise<KnowledgeDocument>
  updateKnowledge: (id: string, data: Partial<KnowledgeDocument>) => Promise<void>
  deleteKnowledge: (id: string) => Promise<void>
  createConversation: (employeeId: string) => Promise<Conversation>
  sendMessage: (conversationId: string, message: string) => Promise<void>
  updateSettings: (settings: Partial<AppSettings>) => Promise<void>
}

export const useAppStore = create<AppState>((set, get) => ({
  employees: [],
  knowledge: [],
  conversations: [],
  settings: null,
  activeView: 'dashboard',
  selectedEmployeeId: null,
  selectedConversationId: null,
  isCreatingEmployee: false,
  editingEmployeeId: null,
  streamingContent: {},
  isLoading: false,

  setActiveView: (view) => set({ activeView: view }),
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

  loadEmployees: async () => {
    const employees = await window.api.employees.list()
    set({ employees })
  },

  loadKnowledge: async () => {
    const knowledge = await window.api.knowledge.list()
    set({ knowledge })
  },

  loadConversations: async (employeeId: string) => {
    const conversations = await window.api.conversations.list(employeeId)
    set({ conversations })
  },

  loadSettings: async () => {
    const settings = await window.api.settings.get()
    set({ settings })
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

  createConversation: async (employeeId: string) => {
    const conv = await window.api.conversations.create(employeeId)
    await get().loadConversations(employeeId)
    set({ selectedConversationId: conv.id })
    return conv
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

  updateSettings: async (settings) => {
    await window.api.settings.update(settings)
    await get().loadSettings()
  }
}))

export type { Employee, KnowledgeDocument, Conversation, ChatMessage, AppSettings, ProviderConfig, ToolAssignment, PermissionSet, AuthMethod, OAuthState }
