import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import type { ConversationService } from './conversation-service'
import { getMemory } from './memory'

/**
 * One-time migration of conversations from store.json to Mastra Memory (LibSQL).
 * Reads the raw JSON file directly to access conversation data.
 * Preserves conversation IDs so filesystem attachment directories remain valid.
 */
export async function migrateConversationsToMastra(conversationService: ConversationService): Promise<void> {
  const userDataPath = app.getPath('userData')
  const storePath = join(userDataPath, 'prometheus-data')
  const flagFile = join(storePath, '.conversations-migrated')

  // Skip if already migrated
  if (existsSync(flagFile)) return

  const storeFile = join(storePath, 'store.json')
  if (!existsSync(storeFile)) {
    writeFileSync(flagFile, new Date().toISOString())
    return
  }

  try {
    const raw = JSON.parse(readFileSync(storeFile, 'utf-8'))
    if (!raw.companyData) {
      writeFileSync(flagFile, new Date().toISOString())
      return
    }

    let migratedCount = 0

    for (const companyId of Object.keys(raw.companyData)) {
      const companyData = raw.companyData[companyId]
      const conversations = companyData?.conversations || []

      for (const conv of conversations) {
        try {
          // Check if thread already exists (idempotent)
          const existing = await conversationService.getConversation(conv.id)
          if (existing) continue

          // Create thread with the same ID
          const metadata: Record<string, unknown> = {
            employeeId: conv.employeeId,
            companyId
          }
          if (conv.peerEmployeeId) metadata.peerEmployeeId = conv.peerEmployeeId

          const mem = getMemory()
          await mem.saveThread({
            thread: {
              id: conv.id,
              title: conv.title || 'New conversation',
              resourceId: conv.employeeId,
              metadata,
              createdAt: new Date(conv.createdAt),
              updatedAt: new Date(conv.updatedAt)
            }
          })

          // Save all messages preserving order and timestamps
          if (conv.messages?.length > 0) {
            const messages = conv.messages.map((msg: any) => {
              const msgMeta: Record<string, unknown> = {}
              if (msg.attachments?.length) msgMeta.attachments = msg.attachments
              if (msg.handoffTo) msgMeta.handoffTo = msg.handoffTo
              if (msg.handoffFrom) msgMeta.handoffFrom = msg.handoffFrom

              return {
                id: msg.id,
                role: msg.role,
                content: { format: 2, parts: [{ type: 'text', text: msg.content }] },
                threadId: conv.id,
                resourceId: conv.employeeId,
                createdAt: new Date(msg.timestamp),
                type: 'text',
                ...(Object.keys(msgMeta).length > 0 ? { metadata: msgMeta } : {})
              }
            })

            await mem.saveMessages({ messages })
          }

          migratedCount++
        } catch (err) {
          console.error(`Failed to migrate conversation ${conv.id}:`, err)
        }
      }
    }

    if (migratedCount > 0) {
      console.log(`Migrated ${migratedCount} conversations to Mastra Memory`)
    }

    // Write flag file
    writeFileSync(flagFile, new Date().toISOString())

    // Strip conversations from store.json to save space
    for (const companyId of Object.keys(raw.companyData)) {
      if (raw.companyData[companyId]?.conversations) {
        raw.companyData[companyId].conversations = []
      }
    }
    writeFileSync(storeFile, JSON.stringify(raw, null, 2))
  } catch (err) {
    console.error('Conversation migration failed:', err)
    // Don't write flag file — retry on next launch
  }
}
