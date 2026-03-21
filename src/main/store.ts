import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { v4 as uuid } from 'uuid'
import {
  Employee,
  KnowledgeDocument,
  Conversation,
  ChatMessage,
  AppSettings,
  DEFAULT_SETTINGS
} from './types'

interface StoreData {
  employees: Employee[]
  knowledge: KnowledgeDocument[]
  conversations: Conversation[]
  settings: AppSettings
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
        return JSON.parse(readFileSync(this.dataPath, 'utf-8'))
      }
    } catch {
      // Corrupt file, start fresh
    }
    return {
      employees: [],
      knowledge: [],
      conversations: [],
      settings: DEFAULT_SETTINGS
    }
  }

  private save(): void {
    writeFileSync(this.dataPath, JSON.stringify(this.data, null, 2))
  }

  // Employees
  listEmployees(): Employee[] {
    return this.data.employees
  }

  getEmployee(id: string): Employee | undefined {
    return this.data.employees.find(e => e.id === id)
  }

  createEmployee(data: Omit<Employee, 'id' | 'createdAt' | 'updatedAt'>): Employee {
    const employee: Employee = {
      ...data,
      id: uuid(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    this.data.employees.push(employee)
    this.save()
    return employee
  }

  updateEmployee(id: string, data: Partial<Employee>): Employee | undefined {
    const idx = this.data.employees.findIndex(e => e.id === id)
    if (idx === -1) return undefined
    this.data.employees[idx] = {
      ...this.data.employees[idx],
      ...data,
      id,
      updatedAt: new Date().toISOString()
    }
    this.save()
    return this.data.employees[idx]
  }

  deleteEmployee(id: string): boolean {
    const len = this.data.employees.length
    this.data.employees = this.data.employees.filter(e => e.id !== id)
    if (this.data.employees.length < len) {
      this.save()
      return true
    }
    return false
  }

  // Knowledge
  listKnowledge(): KnowledgeDocument[] {
    return this.data.knowledge
  }

  createKnowledge(data: Omit<KnowledgeDocument, 'id' | 'createdAt' | 'updatedAt'>): KnowledgeDocument {
    const doc: KnowledgeDocument = {
      ...data,
      id: uuid(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    this.data.knowledge.push(doc)
    this.save()
    return doc
  }

  updateKnowledge(id: string, data: Partial<KnowledgeDocument>): KnowledgeDocument | undefined {
    const idx = this.data.knowledge.findIndex(k => k.id === id)
    if (idx === -1) return undefined
    this.data.knowledge[idx] = {
      ...this.data.knowledge[idx],
      ...data,
      id,
      updatedAt: new Date().toISOString()
    }
    this.save()
    return this.data.knowledge[idx]
  }

  deleteKnowledge(id: string): boolean {
    const len = this.data.knowledge.length
    this.data.knowledge = this.data.knowledge.filter(k => k.id !== id)
    if (this.data.knowledge.length < len) {
      this.save()
      return true
    }
    return false
  }

  // Conversations
  listConversations(employeeId: string): Conversation[] {
    return this.data.conversations.filter(c => c.employeeId === employeeId)
  }

  getConversation(id: string): Conversation | undefined {
    return this.data.conversations.find(c => c.id === id)
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
    this.data.conversations.push(conv)
    this.save()
    return conv
  }

  addMessage(conversationId: string, message: Omit<ChatMessage, 'id' | 'timestamp'>): ChatMessage {
    const conv = this.data.conversations.find(c => c.id === conversationId)
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

  // Settings
  getSettings(): AppSettings {
    return this.data.settings
  }

  updateSettings(settings: Partial<AppSettings>): AppSettings {
    this.data.settings = { ...this.data.settings, ...settings }
    this.save()
    return this.data.settings
  }
}
