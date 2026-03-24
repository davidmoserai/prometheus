import { app, safeStorage } from 'electron'
import { join, basename, extname } from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, statSync, rmSync } from 'fs'
import { v4 as uuid } from 'uuid'
import {
  Company,
  Department,
  Employee,
  KnowledgeDocument,
  ChatAttachment,
  Task,
  TaskMessage,
  RecurringTask,
  AppSettings,
  DEFAULT_SETTINGS,
  DEFAULT_PROVIDERS,
  DEFAULT_MCP_SERVERS,
  LEGACY_TOOL_ID_MAP
} from './types'

interface CompanyData {
  employees: Employee[]
  knowledge: KnowledgeDocument[]
  departments: Department[]
  tasks: Task[]
  recurringTasks: RecurringTask[]
}

interface StoreData {
  companies: Company[]
  activeCompanyId: string | null
  companyData: Record<string, CompanyData>
  settings: AppSettings
}

// Legacy format for migration — uses unknown permissions shape
interface LegacyEmployee {
  id: string
  name: string
  role: string
  avatar: string
  systemPrompt: string
  knowledgeIds: string[]
  tools: Employee['tools']
  provider: string
  model: string
  permissions: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

interface LegacyStoreData {
  employees?: LegacyEmployee[]
  knowledge?: KnowledgeDocument[]
  conversations?: any[] // Legacy — migrated to Mastra Memory
  settings?: AppSettings
}

function encryptString(value: string): string {
  if (!value || !safeStorage.isEncryptionAvailable()) return value
  const encrypted = safeStorage.encryptString(value)
  return 'encrypted:v1:' + encrypted.toString('base64')
}

function decryptString(value: string): string {
  if (!value || !value.startsWith('encrypted:v1:')) return value
  if (!safeStorage.isEncryptionAvailable()) return value
  try {
    const buffer = Buffer.from(value.slice('encrypted:v1:'.length), 'base64')
    return safeStorage.decryptString(buffer)
  } catch {
    console.error('Failed to decrypt stored key — returning empty')
    return ''
  }
}

function emptyCompanyData(): CompanyData {
  return { employees: [], knowledge: [], departments: [], tasks: [], recurringTasks: [] }
}

export class EmployeeStore {
  private dataPath: string
  private data: StoreData

  constructor() {
    const userDataPath = app.getPath('userData')
    const storePath = join(userDataPath, 'prometheus-data')
    if (!existsSync(storePath)) mkdirSync(storePath, { recursive: true })
    this.dataPath = join(storePath, 'store.json')
    this.data = this.load()
  }

  private load(): StoreData {
    try {
      if (existsSync(this.dataPath)) {
        const raw = JSON.parse(readFileSync(this.dataPath, 'utf-8'))

        // Already new format
        if (raw.companies && raw.companyData) {
          // Migrations for existing data
          for (const companyId of Object.keys(raw.companyData)) {
            const data = raw.companyData[companyId]
            if (data?.employees) {
              for (const emp of data.employees) {
                // Ensure memory field exists
                if (emp.memory === undefined) emp.memory = ''
                // Migrate legacy tool IDs to match Mastra keys
                if (emp.tools) {
                  for (const tool of emp.tools) {
                    if (LEGACY_TOOL_ID_MAP[tool.id]) {
                      tool.id = LEGACY_TOOL_ID_MAP[tool.id]
                    }
                  }
                }
              }
            }
          }
          // Decrypt API keys after loading from disk
          if (raw.settings?.providers) {
            for (const prov of raw.settings.providers) {
              if (prov.apiKey) prov.apiKey = decryptString(prov.apiKey)
            }
          }
          if (raw.settings?.composioApiKey) {
            raw.settings.composioApiKey = decryptString(raw.settings.composioApiKey)
          }

          // Decrypt MCP server env var values
          if (raw.settings?.mcpServers) {
            for (const server of raw.settings.mcpServers) {
              if (server.env) {
                for (const key of Object.keys(server.env)) {
                  if (server.env[key]) server.env[key] = decryptString(server.env[key])
                }
              }
            }
          }

          return raw as StoreData
        }

        // Migrate from legacy flat format
        return this.migrate(raw as LegacyStoreData)
      }
    } catch {
      // Corrupt file, start fresh
    }

    // Fresh install: create default company
    const defaultCompanyId = uuid()
    return {
      companies: [{
        id: defaultCompanyId,
        name: 'My Company',
        avatar: '🏢',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }],
      activeCompanyId: defaultCompanyId,
      companyData: { [defaultCompanyId]: emptyCompanyData() },
      settings: DEFAULT_SETTINGS
    }
  }

  private migrate(legacy: LegacyStoreData): StoreData {
    const companyId = uuid()
    const now = new Date().toISOString()

    // Migrate employees to have new fields
    const employees: Employee[] = (legacy.employees || []).map(e => {
      const perms = e.permissions
      const hasContactAccess = perms.contactAccess && typeof perms.contactAccess === 'object'
      const contactAccess = hasContactAccess
        ? perms.contactAccess as Employee['permissions']['contactAccess']
        : {
            mode: (perms.canContactEmployees ? 'all' : 'none') as 'all' | 'none',
            allowedEmployeeIds: [] as string[],
            allowedDepartmentIds: [] as string[]
          }

      return {
        id: e.id,
        name: e.name,
        role: e.role,
        avatar: e.avatar,
        systemPrompt: e.systemPrompt,
        knowledgeIds: e.knowledgeIds,
        tools: e.tools,
        provider: e.provider,
        model: e.model,
        memory: '',
        departmentId: null,
        status: 'active' as const,
        terminatedAt: null,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
        permissions: {
          canBrowseWeb: !!perms.canBrowseWeb,
          canReadFiles: !!perms.canReadFiles,
          canWriteFiles: !!perms.canWriteFiles,
          canExecuteCode: !!perms.canExecuteCode,
          autoApproveAll: !!perms.autoApproveAll,
          contactAccess
        }
      }
    })

    return {
      companies: [{
        id: companyId,
        name: 'My Company',
        avatar: '🏢',
        createdAt: now,
        updatedAt: now
      }],
      activeCompanyId: companyId,
      companyData: {
        [companyId]: {
          employees,
          knowledge: legacy.knowledge || [],
          departments: [],
          tasks: [],
          recurringTasks: []
        }
      },
      settings: legacy.settings || DEFAULT_SETTINGS
    }
  }

  private save(): void {
    // Deep-clone so in-memory state stays decrypted
    const clone = JSON.parse(JSON.stringify(this.data))

    // Encrypt API keys before writing to disk
    if (clone.settings?.providers) {
      for (const prov of clone.settings.providers) {
        if (prov.apiKey) prov.apiKey = encryptString(prov.apiKey)
      }
    }
    if (clone.settings?.composioApiKey) {
      clone.settings.composioApiKey = encryptString(clone.settings.composioApiKey)
    }

    // Encrypt MCP server env var values
    if (clone.settings?.mcpServers) {
      for (const server of clone.settings.mcpServers) {
        if (server.env) {
          for (const key of Object.keys(server.env)) {
            if (server.env[key]) server.env[key] = encryptString(server.env[key])
          }
        }
      }
    }

    writeFileSync(this.dataPath, JSON.stringify(clone, null, 2))
  }

  private getActiveData(): CompanyData {
    const id = this.data.activeCompanyId
    if (!id || !this.data.companyData[id]) {
      throw new Error('No active company')
    }
    return this.data.companyData[id]
  }

  // Companies
  listCompanies(): Company[] {
    return this.data.companies
  }

  getActiveCompanyId(): string | null {
    return this.data.activeCompanyId
  }

  setActiveCompany(id: string): void {
    if (!this.data.companies.find(c => c.id === id)) return
    this.data.activeCompanyId = id
    this.save()
  }

  createCompany(data: { name: string; avatar: string }): Company {
    const company: Company = {
      id: uuid(),
      name: data.name,
      avatar: data.avatar,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    this.data.companies.push(company)
    this.data.companyData[company.id] = emptyCompanyData()
    this.save()
    return company
  }

  updateCompany(id: string, data: Partial<Company>): Company | undefined {
    const idx = this.data.companies.findIndex(c => c.id === id)
    if (idx === -1) return undefined
    this.data.companies[idx] = {
      ...this.data.companies[idx],
      ...data,
      id,
      updatedAt: new Date().toISOString()
    }
    this.save()
    return this.data.companies[idx]
  }

  deleteCompany(id: string): boolean {
    if (this.data.companies.length <= 1) return false
    const len = this.data.companies.length
    this.data.companies = this.data.companies.filter(c => c.id !== id)
    delete this.data.companyData[id]
    if (this.data.activeCompanyId === id) {
      this.data.activeCompanyId = this.data.companies[0]?.id || null
    }
    if (this.data.companies.length < len) {
      this.save()
      return true
    }
    return false
  }

  // Departments (scoped to active company)
  listDepartments(): Department[] {
    return this.getActiveData().departments
  }

  createDepartment(data: { name: string; color: string }): Department {
    const dept: Department = {
      id: uuid(),
      name: data.name,
      color: data.color,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    this.getActiveData().departments.push(dept)
    this.save()
    return dept
  }

  updateDepartment(id: string, data: Partial<Department>): Department | undefined {
    const depts = this.getActiveData().departments
    const idx = depts.findIndex(d => d.id === id)
    if (idx === -1) return undefined
    depts[idx] = { ...depts[idx], ...data, id, updatedAt: new Date().toISOString() }
    this.save()
    return depts[idx]
  }

  deleteDepartment(id: string): boolean {
    const active = this.getActiveData()
    const len = active.departments.length
    active.departments = active.departments.filter(d => d.id !== id)
    // Unassign employees from deleted department
    active.employees.forEach(e => {
      if (e.departmentId === id) e.departmentId = null
    })
    if (active.departments.length < len) {
      this.save()
      return true
    }
    return false
  }

  // Employees (scoped to active company)
  listEmployees(): Employee[] {
    return this.getActiveData().employees.filter(e => e.status === 'active')
  }

  listTerminatedEmployees(): Employee[] {
    return this.getActiveData().employees.filter(e => e.status === 'terminated')
  }

  getEmployee(id: string): Employee | undefined {
    return this.getActiveData().employees.find(e => e.id === id)
  }

  createEmployee(data: Omit<Employee, 'id' | 'createdAt' | 'updatedAt'>): Employee {
    const employee: Employee = {
      ...data,
      memory: data.memory ?? '',
      departmentId: data.departmentId ?? null,
      status: data.status ?? 'active',
      terminatedAt: data.terminatedAt ?? null,
      id: uuid(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    this.getActiveData().employees.push(employee)
    this.save()
    return employee
  }

  updateEmployee(id: string, data: Partial<Employee>): Employee | undefined {
    const emps = this.getActiveData().employees
    const idx = emps.findIndex(e => e.id === id)
    if (idx === -1) return undefined
    emps[idx] = {
      ...emps[idx],
      ...data,
      id,
      updatedAt: new Date().toISOString()
    }
    this.save()
    return emps[idx]
  }

  updateEmployeeMemory(id: string, memory: string): Employee | undefined {
    return this.updateEmployee(id, { memory })
  }

  deleteEmployee(id: string): boolean {
    const active = this.getActiveData()
    const len = active.employees.length
    active.employees = active.employees.filter(e => e.id !== id)
    if (active.employees.length < len) {
      this.save()
      return true
    }
    return false
  }

  fireEmployee(id: string): Employee | undefined {
    const emps = this.getActiveData().employees
    const idx = emps.findIndex(e => e.id === id)
    if (idx === -1) return undefined
    emps[idx] = {
      ...emps[idx],
      status: 'terminated',
      terminatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    this.save()
    return emps[idx]
  }

  rehireEmployee(id: string): Employee | undefined {
    const emps = this.getActiveData().employees
    const idx = emps.findIndex(e => e.id === id)
    if (idx === -1) return undefined
    emps[idx] = {
      ...emps[idx],
      status: 'active',
      terminatedAt: null,
      updatedAt: new Date().toISOString()
    }
    this.save()
    return emps[idx]
  }

  // Knowledge (scoped to active company)
  listKnowledge(): KnowledgeDocument[] {
    return this.getActiveData().knowledge
  }

  getKnowledge(id: string): KnowledgeDocument | undefined {
    return this.getActiveData().knowledge.find(k => k.id === id)
  }

  createKnowledge(data: Omit<KnowledgeDocument, 'id' | 'createdAt' | 'updatedAt'>): KnowledgeDocument {
    const doc: KnowledgeDocument = {
      ...data,
      id: uuid(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    this.getActiveData().knowledge.push(doc)
    this.save()
    return doc
  }

  updateKnowledge(id: string, data: Partial<KnowledgeDocument>): KnowledgeDocument | undefined {
    const docs = this.getActiveData().knowledge
    const idx = docs.findIndex(k => k.id === id)
    if (idx === -1) return undefined
    docs[idx] = {
      ...docs[idx],
      ...data,
      id,
      updatedAt: new Date().toISOString()
    }
    this.save()
    return docs[idx]
  }

  deleteKnowledge(id: string): boolean {
    const active = this.getActiveData()
    const len = active.knowledge.length
    active.knowledge = active.knowledge.filter(k => k.id !== id)
    if (active.knowledge.length < len) {
      this.save()
      return true
    }
    return false
  }

  // File upload support (conversations now stored in Mastra Memory, but files stay on filesystem)
  getConversationFilesDir(conversationId: string): string {
    const userDataPath = app.getPath('userData')
    return join(userDataPath, 'prometheus-data', 'files', conversationId)
  }

  uploadFile(conversationId: string, sourcePath: string): ChatAttachment {
    const dir = this.getConversationFilesDir(conversationId)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

    const filename = basename(sourcePath)
    const ext = extname(filename).toLowerCase()
    const id = uuid()
    const destPath = join(dir, `${id}${ext}`)

    copyFileSync(sourcePath, destPath)

    const stats = statSync(destPath)
    const mimeMap: Record<string, string> = {
      '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
      '.gif': 'image/gif', '.webp': 'image/webp', '.pdf': 'application/pdf',
      '.txt': 'text/plain', '.md': 'text/markdown', '.json': 'application/json',
      '.csv': 'text/csv'
    }

    return {
      id,
      filename,
      path: destPath,
      mimetype: mimeMap[ext] || 'application/octet-stream',
      size: stats.size
    }
  }

  // Settings (global, not per-company)
  // Models always come from code (DEFAULT_PROVIDERS), user data (apiKey, enabled, baseUrl) from store
  getSettings(): AppSettings {
    const saved = this.data.settings
    const merged = {
      ...saved,
      providers: DEFAULT_PROVIDERS.map(defaultProv => {
        const savedProv = saved.providers.find(p => p.id === defaultProv.id)
        if (savedProv) {
          // Keep user's apiKey, enabled, baseUrl — but always use code's models and name
          return {
            ...defaultProv,
            apiKey: savedProv.apiKey,
            enabled: savedProv.enabled,
            baseUrl: savedProv.baseUrl || defaultProv.baseUrl
          }
        }
        return defaultProv
      }),
      // Merge default MCP servers (add missing defaults, preserve user's enabled state)
      mcpServers: [
        ...DEFAULT_MCP_SERVERS.map(defaultMcp => {
          const savedMcp = (saved.mcpServers || []).find(s => s.id === defaultMcp.id)
          if (savedMcp) {
            return { ...defaultMcp, enabled: savedMcp.enabled, env: savedMcp.env }
          }
          return defaultMcp
        }),
        // Exclude Composio MCP config — it's ephemeral and rebuilt on each app launch
      ...(saved.mcpServers || []).filter(s => !DEFAULT_MCP_SERVERS.find(d => d.id === s.id) && !s.isComposio)
      ]
    }
    // Never expose the Composio API key to the renderer
    const { composioApiKey: _stripped, ...safe } = merged as typeof merged & { composioApiKey?: string }
    return safe
  }

  updateSettings(settings: Partial<AppSettings>): AppSettings {
    this.data.settings = { ...this.data.settings, ...settings }
    this.save()
    return this.data.settings
  }

  // Composio API key (stored in settings, never exposed to renderer)
  getComposioApiKey(): string | undefined {
    return this.data.settings.composioApiKey
  }

  setComposioApiKey(key: string): void {
    this.data.settings = { ...this.data.settings, composioApiKey: key }
    this.save()
  }

  // Tasks (scoped to active company)
  listTasks(): Task[] {
    return this.getActiveData().tasks || []
  }

  getTask(id: string): Task | undefined {
    return (this.getActiveData().tasks || []).find(t => t.id === id)
  }

  createTask(data: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Task {
    const active = this.getActiveData()
    if (!active.tasks) active.tasks = []
    const task: Task = {
      ...data,
      messages: data.messages || [],
      id: uuid(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    active.tasks.push(task)
    this.save()
    return task
  }

  updateTask(id: string, data: Partial<Task>): Task | undefined {
    const tasks = this.getActiveData().tasks || []
    const idx = tasks.findIndex(t => t.id === id)
    if (idx === -1) return undefined
    tasks[idx] = {
      ...tasks[idx],
      ...data,
      id,
      updatedAt: new Date().toISOString()
    }
    this.save()
    return tasks[idx]
  }

  deleteTask(id: string): boolean {
    const active = this.getActiveData()
    if (!active.tasks) return false
    const len = active.tasks.length
    active.tasks = active.tasks.filter(t => t.id !== id)
    if (active.tasks.length < len) {
      this.save()
      return true
    }
    return false
  }

  addTaskMessage(taskId: string, msg: Omit<TaskMessage, 'id' | 'timestamp'>): TaskMessage {
    const tasks = this.getActiveData().tasks || []
    const task = tasks.find(t => t.id === taskId)
    if (!task) throw new Error(`Task ${taskId} not found`)
    if (!task.messages) task.messages = []
    const taskMsg: TaskMessage = {
      ...msg,
      id: uuid(),
      timestamp: new Date().toISOString()
    }
    task.messages.push(taskMsg)
    task.updatedAt = new Date().toISOString()
    this.save()
    return taskMsg
  }

  // Recurring Tasks (scoped to active company)
  listRecurringTasks(): RecurringTask[] {
    return this.getActiveData().recurringTasks || []
  }

  getRecurringTask(id: string): RecurringTask | undefined {
    return (this.getActiveData().recurringTasks || []).find(t => t.id === id)
  }

  createRecurringTask(data: Omit<RecurringTask, 'id' | 'createdAt' | 'updatedAt'>): RecurringTask {
    const active = this.getActiveData()
    if (!active.recurringTasks) active.recurringTasks = []
    const task: RecurringTask = {
      ...data,
      id: uuid(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    active.recurringTasks.push(task)
    this.save()
    return task
  }

  updateRecurringTask(id: string, data: Partial<RecurringTask>): RecurringTask | undefined {
    const tasks = this.getActiveData().recurringTasks || []
    const idx = tasks.findIndex(t => t.id === id)
    if (idx === -1) return undefined
    tasks[idx] = {
      ...tasks[idx],
      ...data,
      id,
      updatedAt: new Date().toISOString()
    }
    this.save()
    return tasks[idx]
  }

  deleteRecurringTask(id: string): boolean {
    const active = this.getActiveData()
    if (!active.recurringTasks) return false
    const len = active.recurringTasks.length
    active.recurringTasks = active.recurringTasks.filter(t => t.id !== id)
    if (active.recurringTasks.length < len) {
      this.save()
      return true
    }
    return false
  }

}
