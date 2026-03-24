import { app } from 'electron'
import { join } from 'path'
import { existsSync, rmSync } from 'fs'
import { v4 as uuid } from 'uuid'
import type { Conversation, ChatMessage, ChatAttachment, ToolCallRecord } from './types'
import { getMemory } from './memory'

/**
 * Thin translation layer over Mastra Memory thread/message APIs.
 * Converts between Mastra types (StorageThreadType, MastraDBMessage) and our app types (Conversation, ChatMessage).
 * Uses getMemory() dynamically so it always reflects the latest Memory instance after settings changes.
 */
export class ConversationService {
  private get memory() { return getMemory() }

  // List conversations for an employee in a company (messages not loaded)
  async listConversations(employeeId: string, companyId: string): Promise<Conversation[]> {
    const result = await this.memory.listThreads({
      filter: { resourceId: employeeId, metadata: { companyId } },
      perPage: false,
      orderBy: { field: 'createdAt', direction: 'DESC' }
    })

    return result.threads.map(thread => this.toConversation(thread))
  }

  // Get a single conversation with all messages
  async getConversation(id: string): Promise<Conversation | undefined> {
    const thread = await this.memory.getThreadById({ threadId: id })
    if (!thread) return undefined

    const result = await this.memory.recall({
      threadId: id,
      perPage: false,
      threadConfig: { lastMessages: false, semanticRecall: false }
    })

    // Sort chronologically — Mastra's default ordering isn't guaranteed
    const sorted = [...result.messages].sort((a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    )
    return this.toConversation(thread, sorted)
  }

  // Create a new conversation
  async createConversation(employeeId: string, companyId: string, peerEmployeeId?: string): Promise<Conversation> {
    const id = uuid()
    const metadata: Record<string, unknown> = { employeeId, companyId }
    if (peerEmployeeId) metadata.peerEmployeeId = peerEmployeeId

    const thread = await this.memory.saveThread({
      thread: {
        id,
        title: 'New conversation',
        resourceId: employeeId,
        metadata,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    })

    return this.toConversation(thread)
  }

  // Delete a conversation and clean up files
  async deleteConversation(id: string): Promise<boolean> {
    const thread = await this.memory.getThreadById({ threadId: id })
    if (!thread) return false

    await this.memory.deleteThread(id)

    // Clean up uploaded files
    const filesDir = this.getConversationFilesDir(id)
    if (existsSync(filesDir)) {
      rmSync(filesDir, { recursive: true, force: true })
    }

    return true
  }

  // Find an existing agent-to-agent conversation
  async findAgentConversation(employeeId1: string, employeeId2: string, companyId: string): Promise<Conversation | null> {
    // Check threads owned by employee1 with peerEmployeeId = employee2
    const result1 = await this.memory.listThreads({
      filter: { resourceId: employeeId1, metadata: { companyId, peerEmployeeId: employeeId2 } },
      perPage: 1
    })
    if (result1.threads.length > 0) return this.toConversation(result1.threads[0])

    // Check reverse direction
    const result2 = await this.memory.listThreads({
      filter: { resourceId: employeeId2, metadata: { companyId, peerEmployeeId: employeeId1 } },
      perPage: 1
    })
    if (result2.threads.length > 0) return this.toConversation(result2.threads[0])

    return null
  }

  // Add a message to a conversation
  async addMessage(threadId: string, message: Omit<ChatMessage, 'id' | 'timestamp'>): Promise<ChatMessage> {
    const id = uuid()
    const now = new Date()

    // Build metadata for extra fields (attachments, handoff, tool calls)
    const metadata: Record<string, unknown> = {}
    if (message.attachments?.length) metadata.attachments = message.attachments
    if (message.handoffTo) metadata.handoffTo = message.handoffTo
    if (message.handoffFrom) metadata.handoffFrom = message.handoffFrom
    if (message.toolCalls?.length) metadata.toolCalls = message.toolCalls

    // Get thread to find resourceId
    const thread = await this.memory.getThreadById({ threadId })
    const resourceId = thread?.resourceId || ''

    await this.memory.saveMessages({
      messages: [{
        id,
        role: message.role,
        content: { format: 2, parts: [{ type: 'text' as const, text: message.content }] } as any,
        threadId,
        resourceId,
        createdAt: now,
        type: 'text',
        ...(Object.keys(metadata).length > 0 ? { metadata } : {})
      } as any]
    })

    // Auto-set title from first user message
    if (message.role === 'user' && thread) {
      const titleFromContent = message.content.slice(0, 60) + (message.content.length > 60 ? '...' : '')
      // Only update title if it's still the default
      if (!thread.title || thread.title === 'New conversation') {
        await this.memory.updateThread({
          id: threadId,
          title: titleFromContent,
          metadata: (thread.metadata || {}) as Record<string, unknown>
        })
      }
    }

    return {
      id,
      role: message.role,
      content: message.content,
      timestamp: now.toISOString(),
      ...(message.attachments?.length ? { attachments: message.attachments } : {}),
      ...(message.handoffTo ? { handoffTo: message.handoffTo } : {}),
      ...(message.handoffFrom ? { handoffFrom: message.handoffFrom } : {}),
      ...(message.toolCalls?.length ? { toolCalls: message.toolCalls } : {})
    }
  }

  // Replace all messages in a conversation (used by compression)
  async replaceMessages(threadId: string, messages: ChatMessage[]): Promise<void> {
    // Get thread for resourceId
    const thread = await this.memory.getThreadById({ threadId })
    const resourceId = thread?.resourceId || ''

    // Get existing message IDs to delete after saving new ones (safer ordering)
    const existing = await this.memory.recall({
      threadId,
      perPage: false,
      threadConfig: { lastMessages: false, semanticRecall: false }
    })
    const oldIds = existing.messages.map(m => m.id)

    // Save new messages first to avoid data loss if app crashes mid-operation
    if (messages.length > 0) {
      await this.memory.saveMessages({
        messages: messages.map(msg => ({
          id: msg.id || uuid(),
          role: msg.role,
          content: { format: 2, parts: [{ type: 'text' as const, text: msg.content }] } as any,
          threadId,
          resourceId,
          createdAt: new Date(msg.timestamp),
          type: 'text'
        } as any))
      })
    }

    // Then delete old messages (excluding any that were kept — compare by ID)
    const newIds = new Set(messages.map(m => m.id).filter(Boolean))
    const toDelete = oldIds.filter(id => !newIds.has(id))
    if (toDelete.length > 0) {
      await this.memory.deleteMessages(toDelete)
    }
  }

  // Count tokens in a conversation
  async countTokens(threadId: string): Promise<number> {
    const conv = await this.getConversation(threadId)
    if (!conv) return 0
    return conv.messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0)
  }

  // Get filesystem path for conversation files
  private getConversationFilesDir(conversationId: string): string {
    const userDataPath = app.getPath('userData')
    return join(userDataPath, 'prometheus-data', 'files', conversationId)
  }

  // Convert Mastra StorageThreadType → our Conversation type
  private toConversation(thread: any, messages?: any[]): Conversation {
    const meta = (thread.metadata || {}) as Record<string, any>
    return {
      id: thread.id,
      employeeId: meta.employeeId || thread.resourceId || '',
      peerEmployeeId: meta.peerEmployeeId || undefined,
      title: thread.title || 'New conversation',
      messages: messages ? messages.map(m => this.toChatMessage(m)) : [],
      createdAt: thread.createdAt instanceof Date ? thread.createdAt.toISOString() : String(thread.createdAt),
      updatedAt: thread.updatedAt instanceof Date ? thread.updatedAt.toISOString() : String(thread.updatedAt)
    }
  }

  // Convert Mastra MastraDBMessage → our ChatMessage type
  private toChatMessage(msg: any): ChatMessage {
    // Extract text from content (can be string or MastraMessageContentV2)
    let content: string
    if (typeof msg.content === 'string') {
      content = msg.content
    } else if (msg.content?.parts) {
      content = msg.content.parts
        .filter((p: any) => p.type === 'text')
        .map((p: any) => p.text)
        .join('')
    } else if (msg.content?.content) {
      content = msg.content.content
    } else {
      content = JSON.stringify(msg.content)
    }

    // Extract metadata fields
    const meta = (msg.metadata || {}) as Record<string, any>
    const attachments = meta.attachments as ChatAttachment[] | undefined
    const handoffTo = meta.handoffTo as string | undefined
    const handoffFrom = meta.handoffFrom as string | undefined
    const toolCalls = meta.toolCalls as ToolCallRecord[] | undefined

    return {
      id: msg.id,
      role: msg.role as 'user' | 'assistant' | 'system',
      content,
      timestamp: msg.createdAt instanceof Date ? msg.createdAt.toISOString() : String(msg.createdAt),
      ...(attachments?.length ? { attachments } : {}),
      ...(handoffTo ? { handoffTo } : {}),
      ...(handoffFrom ? { handoffFrom } : {}),
      ...(toolCalls?.length ? { toolCalls } : {})
    }
  }
}
