import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { v4 as uuid } from 'uuid'
import {
  Company,
  Department,
  Employee,
  KnowledgeDocument,
  Conversation,
  ChatMessage,
  AppSettings,
  DEFAULT_SETTINGS
} from './types'

interface CompanyData {
  employees: Employee[]
  knowledge: KnowledgeDocument[]
  conversations: Conversation[]
  departments: Department[]
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
  conversations?: Conversation[]
  settings?: AppSettings
}

function emptyCompanyData(): CompanyData {
  return { employees: [], knowledge: [], conversations: [], departments: [] }
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
          conversations: legacy.conversations || [],
          departments: []
        }
      },
      settings: legacy.settings || DEFAULT_SETTINGS
    }
  }

  private save(): void {
    writeFileSync(this.dataPath, JSON.stringify(this.data, null, 2))
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

  // Conversations (scoped to active company)
  listConversations(employeeId: string): Conversation[] {
    return this.getActiveData().conversations.filter(c => c.employeeId === employeeId)
  }

  getConversation(id: string): Conversation | undefined {
    return this.getActiveData().conversations.find(c => c.id === id)
  }

  createConversation(employeeId: string): Conversation {
    const conv: Conversation = {
      id: uuid(),
      employeeId,
      title: 'New conversation',
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    this.getActiveData().conversations.push(conv)
    this.save()
    return conv
  }

  deleteConversation(id: string): boolean {
    const data = this.getActiveData()
    const before = data.conversations.length
    data.conversations = data.conversations.filter(c => c.id !== id)
    if (data.conversations.length < before) {
      this.save()
      return true
    }
    return false
  }

  addMessage(conversationId: string, message: Omit<ChatMessage, 'id' | 'timestamp'>): ChatMessage {
    const conv = this.getActiveData().conversations.find(c => c.id === conversationId)
    if (!conv) throw new Error(`Conversation ${conversationId} not found`)
    const msg: ChatMessage = {
      ...message,
      id: uuid(),
      timestamp: new Date().toISOString()
    }
    conv.messages.push(msg)
    conv.updatedAt = new Date().toISOString()
    if (conv.messages.length === 1 && message.role === 'user') {
      conv.title = message.content.slice(0, 60) + (message.content.length > 60 ? '...' : '')
    }
    this.save()
    return msg
  }

  // Settings (global, not per-company)
  getSettings(): AppSettings {
    return this.data.settings
  }

  updateSettings(settings: Partial<AppSettings>): AppSettings {
    this.data.settings = { ...this.data.settings, ...settings }
    this.save()
    return this.data.settings
  }

}
