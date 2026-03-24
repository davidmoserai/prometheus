import { readFileSync, writeFileSync, mkdtempSync, unlinkSync } from 'fs'
import { execSync } from 'child_process'
import { join } from 'path'
import { homedir, tmpdir } from 'os'
import { Agent } from '@mastra/core/agent'
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { EmployeeStore } from './store'
import { ChatAttachment, ChatMessage, Employee, ProviderConfig, Task, TaskMessage, TOOL_IDS } from './types'
import type { MCPManager } from './mcp-manager'
import type { ConversationService } from './conversation-service'
import { runClaudeCode, TOOL_MAP } from './claude-code-runner'
import { COMPOSIO_MCP_SERVER_ID, composioMcpConfig } from './composio-manager'
import { startApprovalServer } from './claude-code-approval-server'
// ⚠️  CLAUDE CODE ONLY: internal HTTP API bridging memory/knowledge tools to Claude Code's MCP server.
// Mastra agents use native createTool() functions and never touch this import.
import { startInternalServer } from './prometheus-internal-server'
import { getMemory, isSemanticRecallEnabled } from './memory'
import type { Memory } from '@mastra/memory'

// ============================================================
// Mastra model string/object builders
// ============================================================

type MastraModel = string | { id: `${string}/${string}`; url: string; apiKey?: string; headers?: Record<string, string> }

/**
 * Map our provider + model config to a Mastra-compatible model reference.
 * Inline objects are used so we never pollute process.env with API keys.
 */
function buildModelRef(provider: ProviderConfig, model: string): MastraModel {
  // Set env vars for registered providers (Mastra reads these automatically)
  switch (provider.id) {
    case 'openai':
      process.env.OPENAI_API_KEY = provider.apiKey
      return `openai/${model}`

    case 'anthropic':
      process.env.ANTHROPIC_API_KEY = provider.apiKey
      return `anthropic/${model}`

    case 'google':
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = provider.apiKey
      return `google/${model}`

    case 'mistral':
      process.env.MISTRAL_API_KEY = provider.apiKey
      return `mistral/${model}`

    case 'ollama-cloud':
      // Registered provider in Mastra — uses magic string
      process.env.OLLAMA_API_KEY = provider.apiKey
      return `ollama-cloud/${model}`

    case 'vercel-ai-gateway':
      // Uses inline object with custom URL
      process.env.AI_GATEWAY_API_KEY = provider.apiKey
      return `vercel/${model}`

    case 'ollama':
      // Local Ollama — custom URL, needs inline object
      return {
        id: `ollama/${model}`,
        url: (provider.baseUrl || 'http://localhost:11434') + '/v1',
        apiKey: 'not-needed'
      }

    default:
      return {
        id: (model.includes('/') ? model : `openai/${model}`) as `${string}/${string}`,
        url: provider.baseUrl || 'https://api.openai.com/v1',
        apiKey: provider.apiKey
      }
  }
}

/**
 * Build provider-specific options for caching and zero data retention.
 */
function buildProviderOptions(provider: ProviderConfig, hasTools: boolean): Record<string, unknown> | undefined {
  switch (provider.id) {
    case 'vercel-ai-gateway':
      return {
        gateway: { caching: 'auto', zeroDataRetention: true }
      }
    case 'anthropic':
      return {
        anthropic: { cacheControl: { type: 'ephemeral' } }
      }
    case 'ollama-cloud':
      return undefined
    default:
      return undefined
  }
}

// ============================================================
// Tool builders — created dynamically per request via closure
// ============================================================

function buildMastraTools(
  store: EmployeeStore,
  employee: Employee,
  conversationId: string | undefined,
  contactable: Employee[],
  onDelegateTask: (fromEmployee: Employee, args: Record<string, string>, conversationId?: string) => { task: Task; message: string },
  onMessageEmployee?: (fromEmployee: Employee, toEmployeeId: string, message: string) => Promise<string>,
  onToolCall?: (data: { tool: string; summary: string; detail?: string }) => void,
  onFileWritten?: (data: { conversationId: string; path: string; content: string }) => void,
  memory?: Memory
): Record<string, ReturnType<typeof createTool>> {
  const tools: Record<string, ReturnType<typeof createTool>> = {}
  const enabledToolIds = new Set(
    employee.tools.filter(t => t.enabled && t.source === 'builtin').map(t => t.id)
  )

  // Capture contactable IDs for runtime validation in tool execute closures
  const contactableIds = new Set(contactable.map(e => e.id))

  // Delegation tool (only if employee can contact others)
  if (contactable.length > 0) {
    tools.delegate_task = createTool({
      id: 'delegate_task',
      description: 'Delegate a task to another employee. Use this when work should be handled by a team member with the right expertise.',
      inputSchema: z.object({
        to_employee_id: z.string().describe('ID of the employee to delegate to'),
        priority: z.enum(['high', 'medium', 'low']),
        deadline: z.string().describe('When the task should be completed'),
        objective: z.string().describe('One sentence: what outcome is required'),
        context: z.string().describe('Minimum context the agent needs'),
        deliverable: z.string().describe('Exact output format expected'),
        acceptance_criteria: z.string().describe('What makes this done correctly'),
        escalate_if: z.string().describe("Condition requiring founder's input")
      }),
      execute: async (input) => {
        // Validate target employee is in the contactable list
        if (!contactableIds.has(input.to_employee_id)) {
          return { result: "You don't have permission to contact that employee." }
        }
        const toEmp = store.getEmployee(input.to_employee_id)
        const briefDetail = `To: ${toEmp?.name || 'Unknown'} (${toEmp?.role || 'unknown role'})\nPriority: ${input.priority}\nDeadline: ${input.deadline || 'Not specified'}\n\nObjective:\n${input.objective}\n\nContext:\n${input.context}\n\nDeliverable:\n${input.deliverable}\n\nAcceptance Criteria:\n${input.acceptance_criteria}\n\nEscalate if:\n${input.escalate_if}`
        onToolCall?.({ tool: 'delegate_task', summary: `Delegated task to ${toEmp?.name || 'employee'}: ${input.objective}`, detail: briefDetail })
        const { message } = onDelegateTask(employee, input as Record<string, string>, conversationId)
        return { result: message }
      }
    })

    // Message employee tool — for lightweight collaboration
    tools.message_employee = createTool({
      id: 'message_employee',
      description: 'Send a message to another employee and get their response. Use this for quick questions, clarifications, or lightweight collaboration — not for formal task assignments.',
      inputSchema: z.object({
        to_employee_id: z.string().describe('ID of the employee to message'),
        message: z.string().describe('Your message to them')
      }),
      execute: async (input) => {
        // Validate target employee is in the contactable list
        if (!contactableIds.has(input.to_employee_id)) {
          return { result: "You don't have permission to contact that employee." }
        }
        const toEmp = store.getEmployee(input.to_employee_id)
        onToolCall?.({ tool: 'message_employee', summary: `Messaged ${toEmp?.name || 'employee'}: ${input.message.slice(0, 80)}` })
        try {
          const response = await onMessageEmployee?.(employee, input.to_employee_id, input.message)
          return { result: response || 'No response received.' }
        } catch (err) {
          return { result: `Failed to message employee: ${err instanceof Error ? err.message : 'Unknown error'}` }
        }
      }
    })
  }

  // Semantic search tool — allows agents to search past conversations on-demand
  // (Mastra's update_working_memory tool is auto-provided by the Agent when memory is attached)
  if (memory && conversationId && isSemanticRecallEnabled()) {
    tools.search_memory = createTool({
      id: 'search_memory',
      description: 'Search through your past conversations for relevant information using semantic similarity. Use this when you need to recall something from a previous conversation.',
      inputSchema: z.object({
        query: z.string().describe('What to search for in past conversations')
      }),
      execute: async (input) => {
        onToolCall?.({ tool: 'search_memory', summary: `Searching memory: ${input.query.slice(0, 60)}` })
        try {
          // threadId is required by the API but scope: 'resource' ensures cross-conversation search
          const results = await memory.recall({
            threadId: conversationId,
            vectorSearchString: input.query,
            threadConfig: {
              semanticRecall: { topK: 5, messageRange: 1, scope: 'resource' },
              lastMessages: false,
            }
          })
          if (results.messages.length === 0) return { result: 'No relevant memories found.' }
          const formatted = results.messages
            .map(m => `[${m.role}]: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`)
            .join('\n\n')
          return { result: formatted }
        } catch (err) {
          return { result: `Memory search failed: ${err instanceof Error ? err.message : 'Unknown error'}` }
        }
      }
    })
  }

  // Fallback: legacy save_memory when Mastra memory system isn't available
  if (!memory) {
    tools.save_memory = createTool({
      id: 'save_memory',
      description: 'Save important facts, decisions, and preferences to your persistent memory.',
      inputSchema: z.object({
        content: z.string().describe('Your full updated memory (replaces previous). Include all facts you want to remember.')
      }),
      execute: async (input) => {
        onToolCall?.({ tool: 'save_memory', summary: 'Saved to persistent memory', detail: input.content })
        store.updateEmployeeMemory(employee.id, input.content)
        return { result: 'Memory saved successfully.' }
      }
    })
  }

  tools.create_knowledge_doc = createTool({
    id: 'create_knowledge_doc',
    description: 'Create a new knowledge document that you and other employees can reference. Use this for important information that should be shared.',
    inputSchema: z.object({
      title: z.string().describe('Title for the knowledge document'),
      content: z.string().describe('The document content'),
      tags: z.array(z.string()).optional().describe('Tags for categorization')
    }),
    execute: async (input) => {
      onToolCall?.({ tool: 'create_knowledge_doc', summary: `Created knowledge doc: ${input.title}`, detail: input.content.slice(0, 500) })
      const doc = store.createKnowledge({
        title: input.title,
        content: input.content,
        tags: input.tags || []
      })

      // Auto-assign to this employee
      const emp = store.getEmployee(employee.id)
      if (emp) {
        store.updateEmployee(employee.id, {
          knowledgeIds: [...emp.knowledgeIds, doc.id]
        })
      }

      return { result: `Knowledge document "${input.title}" created (ID: ${doc.id}) and assigned to you. Other employees can also be assigned this document.` }
    }
  })

  tools.update_knowledge_doc = createTool({
    id: 'update_knowledge_doc',
    description: 'Update the content of an existing knowledge document by its ID.',
    inputSchema: z.object({
      doc_id: z.string().describe('ID of the document to update'),
      content: z.string().describe('New content for the document')
    }),
    execute: async (input) => {
      const updated = store.updateKnowledge(input.doc_id, { content: input.content })
      onToolCall?.({ tool: 'update_knowledge_doc', summary: `Updated knowledge doc: ${updated?.title || input.doc_id}`, detail: input.content.slice(0, 500) })
      if (!updated) return { result: `Document with ID "${input.doc_id}" not found.` }
      return { result: `Document "${updated.title}" updated successfully.` }
    }
  })

  // Builtin tools based on employee configuration
  if (enabledToolIds.has(TOOL_IDS.WEB_SEARCH)) {
    tools[TOOL_IDS.WEB_SEARCH] = createTool({
      id: 'web_search',
      description: 'Search the web for information',
      inputSchema: z.object({
        query: z.string().describe('The search query')
      }),
      execute: async (input) => {
        try {
          const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(input.query)}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Prometheus/1.0)' }
          })
          const html = await response.text()
          const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
          return { result: text.slice(0, 5000) || `Web search executed for: ${input.query}` }
        } catch {
          return { result: `Web search executed for: ${input.query}. (Could not fetch results — check network connection.)` }
        }
      }
    })
  }

  if (enabledToolIds.has(TOOL_IDS.WEB_BROWSE)) {
    tools[TOOL_IDS.WEB_BROWSE] = createTool({
      id: 'web_browse',
      description: 'Visit a URL and read its content',
      inputSchema: z.object({
        url: z.string().describe('The URL to visit')
      }),
      execute: async (input) => {
        try {
          const response = await fetch(input.url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Prometheus/1.0)' }
          })
          const html = await response.text()
          const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
          return { result: text.slice(0, 5000) }
        } catch (err) {
          return { result: `Failed to browse ${input.url}: ${err instanceof Error ? err.message : 'Unknown error'}` }
        }
      }
    })
  }

  if (enabledToolIds.has(TOOL_IDS.READ_FILE)) {
    tools[TOOL_IDS.READ_FILE] = createTool({
      id: 'read_file',
      description: 'Read a file from the local filesystem',
      inputSchema: z.object({
        path: z.string().describe('Path to the file')
      }),
      execute: async (input) => {
        try {
          const content = readFileSync(input.path, 'utf-8')
          return { result: content.slice(0, 10000) }
        } catch (err) {
          return { result: `Failed to read file ${input.path}: ${err instanceof Error ? err.message : 'Unknown error'}` }
        }
      }
    })
  }

  if (enabledToolIds.has(TOOL_IDS.WRITE_FILE)) {
    tools[TOOL_IDS.WRITE_FILE] = createTool({
      id: 'write_file',
      description: 'Write content to a file',
      inputSchema: z.object({
        path: z.string().describe('Path to the file'),
        content: z.string().describe('Content to write')
      }),
      execute: async (input) => {
        try {
          writeFileSync(input.path, input.content)
          if (conversationId) {
            onFileWritten?.({ conversationId, path: input.path, content: input.content })
          }
          return { result: `File written successfully to ${input.path} (${input.content.length} bytes)` }
        } catch (err) {
          return { result: `Failed to write file ${input.path}: ${err instanceof Error ? err.message : 'Unknown error'}` }
        }
      }
    })
  }

  if (enabledToolIds.has(TOOL_IDS.EXECUTE_CODE)) {
    tools[TOOL_IDS.EXECUTE_CODE] = createTool({
      id: 'execute_code',
      description: 'Execute code locally. Supports python and javascript/node. Code runs with a 30 second timeout. Output (stdout + stderr) is returned.',
      inputSchema: z.object({
        language: z.enum(['python', 'javascript', 'node', 'bash', 'sh']).describe('Programming language'),
        code: z.string().describe('The code to execute')
      }),
      execute: async (input) => {
        const lang = input.language.toLowerCase()
        try {
          const tempDir = mkdtempSync(join(tmpdir(), 'prometheus-exec-'))
          let filePath: string
          let cmd: string

          if (lang === 'python') {
            filePath = join(tempDir, 'script.py')
            writeFileSync(filePath, input.code)
            cmd = `python3 "${filePath}"`
          } else if (lang === 'javascript' || lang === 'node') {
            filePath = join(tempDir, 'script.js')
            writeFileSync(filePath, input.code)
            cmd = `node "${filePath}"`
          } else if (lang === 'bash' || lang === 'sh') {
            filePath = join(tempDir, 'script.sh')
            writeFileSync(filePath, input.code)
            cmd = `bash "${filePath}"`
          } else {
            return { result: `Unsupported language: ${lang}. Use python, javascript, or bash.` }
          }

          // Minimal env to prevent executed code from reading API keys or secrets
          const output = execSync(cmd, {
            timeout: 30000,
            maxBuffer: 1024 * 1024,
            encoding: 'utf-8',
            cwd: tempDir,
            env: {
              PATH: process.env.PATH || '/usr/bin:/bin:/usr/local/bin',
              HOME: homedir(),
              TMPDIR: tmpdir(),
              LANG: process.env.LANG || 'en_US.UTF-8',
            },
          })

          // Clean up
          try { unlinkSync(filePath) } catch {}

          return { result: output.slice(0, 5000) || '(no output)' }
        } catch (err) {
          const error = err as { stderr?: string; stdout?: string; message?: string }
          const stderr = error.stderr || ''
          const stdout = error.stdout || ''
          const output = [stdout, stderr].filter(Boolean).join('\n').slice(0, 5000)
          return { result: output || `Execution failed: ${error.message || 'Unknown error'}` }
        }
      }
    })
  }

  // Scheduled tasks — always available
  tools.create_scheduled_task = createTool({
    id: 'create_scheduled_task',
    description: 'Create a recurring scheduled task that runs automatically. Use this to set up daily reports, weekly check-ins, or any recurring work.',
    inputSchema: z.object({
      name: z.string().describe('Short name for the task'),
      employee_id: z.string().optional().describe('ID of the employee who should execute this task. Omit to assign to yourself.'),
      brief: z.string().describe('The task description/instructions to execute each time'),
      schedule: z.enum(['hourly', 'daily', 'weekly']).describe('How often to run'),
      schedule_time: z.string().optional().describe('When to run, e.g. "08:00" for daily or "monday 09:00" for weekly')
    }),
    execute: async (input) => {
      try {
        const targetEmployeeId = input.employee_id || employee.id
        const schedule = input.schedule
        const now = new Date()
        let nextRunAt: Date

        if (schedule === 'hourly') {
          nextRunAt = new Date(now.getTime() + 60 * 60 * 1000)
        } else if (schedule === 'weekly') {
          nextRunAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
        } else {
          nextRunAt = new Date(now.getTime() + 24 * 60 * 60 * 1000)
        }

        const recurringTask = store.createRecurringTask({
          employeeId: targetEmployeeId,
          name: input.name,
          brief: input.brief,
          schedule,
          scheduleTime: input.schedule_time || undefined,
          enabled: true,
          lastRunAt: null,
          nextRunAt: nextRunAt.toISOString()
        })

        return { result: `Scheduled task "${recurringTask.name}" created. Runs ${schedule}${input.schedule_time ? ` at ${input.schedule_time}` : ''}. Next run: ${nextRunAt.toLocaleString()}` }
      } catch (err) {
        return { result: `Failed to create scheduled task: ${err instanceof Error ? err.message : 'Unknown error'}` }
      }
    }
  })

  return tools
}

// ============================================================
// AgentManager — Mastra-powered agent orchestration
// ============================================================

export class AgentManager {
  private store: EmployeeStore
  private mcpManager?: MCPManager
  private convService?: ConversationService
  private onTaskUpdate?: (task: Task) => void
  private onFileWritten?: (data: { conversationId: string; path: string; content: string }) => void
  private onToolCall?: (data: { conversationId: string; tool: string; summary: string; detail?: string }) => void
  private onApprovalRequest?: (data: { conversationId: string; approvalId: string; tool: string; args: Record<string, unknown>; summary: string }) => void
  private pendingApprovals: Map<string, { resolve: (approved: boolean) => void; timer: ReturnType<typeof setTimeout> }> = new Map()
  private activeAbortControllers: Map<string, AbortController> = new Map()
  private activeClaudeCodeAborts: Map<string, () => void> = new Map()

  constructor(store: EmployeeStore, mcpManager?: MCPManager, convService?: ConversationService) {
    this.store = store
    this.mcpManager = mcpManager
    this.convService = convService
  }

  // Conversation helpers — delegate to ConversationService (required)
  private async addMessage(conversationId: string, message: Omit<ChatMessage, 'id' | 'timestamp'>): Promise<ChatMessage> {
    if (!this.convService) throw new Error('ConversationService not initialized')
    return this.convService.addMessage(conversationId, message)
  }

  private async getConversation(conversationId: string) {
    if (!this.convService) throw new Error('ConversationService not initialized')
    return this.convService.getConversation(conversationId)
  }

  /** Set callback for notifying frontend when tasks are created/updated */
  setTaskUpdateCallback(cb: (task: Task) => void) {
    this.onTaskUpdate = cb
  }

  /** Set callback for notifying frontend when a file is written by a tool */
  setFileWrittenCallback(cb: (data: { conversationId: string; path: string; content: string }) => void) {
    this.onFileWritten = cb
  }

  /** Set callback for notifying frontend when a tool is called */
  setToolCallCallback(cb: (data: { conversationId: string; tool: string; summary: string; detail?: string }) => void) {
    this.onToolCall = cb
  }

  /** Set callback for requesting tool approval from the user */
  setApprovalRequestCallback(cb: (data: { conversationId: string; approvalId: string; tool: string; args: Record<string, unknown>; summary: string }) => void) {
    this.onApprovalRequest = cb
  }

  /** Respond to a pending tool approval */
  respondToApproval(approvalId: string, approved: boolean) {
    const pending = this.pendingApprovals.get(approvalId)
    if (pending) {
      clearTimeout(pending.timer)
      pending.resolve(approved)
      this.pendingApprovals.delete(approvalId)
    }
  }

  /** Cancel all pending approvals (e.g. on app quit) */
  cancelAllPendingApprovals() {
    for (const [id, pending] of this.pendingApprovals) {
      clearTimeout(pending.timer)
      pending.resolve(false)
    }
    this.pendingApprovals.clear()
  }

  /** Abort the active stream for a conversation */
  abortStream(conversationId: string) {
    const controller = this.activeAbortControllers.get(conversationId)
    if (controller) {
      controller.abort()
      this.activeAbortControllers.delete(conversationId)
    }
    const ccAbort = this.activeClaudeCodeAborts.get(conversationId)
    if (ccAbort) {
      ccAbort()
      this.activeClaudeCodeAborts.delete(conversationId)
    }
  }

  /** Abort all active streams (used on app quit) */
  abortAllStreams() {
    for (const conversationId of this.activeAbortControllers.keys()) {
      this.abortStream(conversationId)
    }
  }

  async sendMessage(
    conversationId: string,
    content: string,
    onStream: (chunk: string) => void,
    onMessageStored?: (msg: ChatMessage) => void,
    skipApproval = false,
    attachments?: ChatAttachment[]
  ): Promise<ChatMessage> {
    // Store user message via conversation service and notify frontend immediately
    const userMsg = await this.addMessage(conversationId, {
      role: 'user',
      content,
      ...(attachments?.length ? { attachments } : {})
    })
    onMessageStored?.(userMsg)

    const conversation = await this.getConversation(conversationId)
    if (!conversation) throw new Error('Conversation not found')

    const employee = this.store.getEmployee(conversation.employeeId)
    if (!employee) throw new Error('Employee not found')

    const settings = this.store.getSettings()
    const provider = settings.providers.find(p => p.id === employee.provider)

    if (!provider) {
      const errorMsg = `Provider "${employee.provider}" not found. Check your settings.`
      const msg = await this.addMessage(conversationId, { role: 'assistant', content: errorMsg })
      onStream(errorMsg)
      return msg
    }

    // Claude Code provider uses CLI auth, not API key
    if (!provider.apiKey && provider.id !== 'ollama' && provider.id !== 'claude-code') {
      const errorMsg = `No API key configured for ${provider.name}. Go to Settings to add your API key.`
      const msg = await this.addMessage(conversationId, { role: 'assistant', content: errorMsg })
      onStream(errorMsg)
      return msg
    }

    // Build system prompt with knowledge documents
    const systemPrompt = await this.buildSystemPrompt(employee, conversationId)

    // Get Mastra memory instance (if available)
    let mem: Memory | undefined
    try { mem = getMemory() } catch { /* unavailable */ }

    // Build full conversation history for the agent (Mastra doesn't auto-retrieve via threadId since we don't pass one)
    const messages: { role: 'user' | 'assistant' | 'system'; content: string }[] = conversation.messages.map((m: ChatMessage) => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content
    }))

    // Build tools via closure
    const contactable = this.getContactableEmployees(employee)
    const toolCallCb = this.onToolCall
      ? (data: { tool: string; summary: string; detail?: string }) => this.onToolCall?.({ conversationId, ...data })
      : undefined
    const tools = buildMastraTools(
      this.store,
      employee,
      conversationId,
      contactable,
      (fromEmp, args, convId) => this.handleDelegateTask(fromEmp, args, convId),
      (fromEmp, toId, msg) => this.executeAgentMessage(fromEmp, toId, msg),
      toolCallCb,
      this.onFileWritten,
      mem
    )

    // Merge MCP tools that the employee has enabled (lazily connects MCP servers as needed)
    const allTools = await this.mergeEmployeeMcpTools(employee, tools)

    // Wrap tools that require approval (unless autoApproveAll is set or this is an automated call)
    if (!skipApproval && !employee.permissions.autoApproveAll && this.onApprovalRequest) {
      this.wrapToolsWithApproval(allTools, employee, conversationId)
    }

    const abortController = new AbortController()
    this.activeAbortControllers.set(conversationId, abortController)
    let streamedText = ''
    const wrappedOnStream = (chunk: string) => {
      streamedText += chunk
      onStream(chunk)
    }

    try {
      let responseText: string

      if (provider.id === 'claude-code') {
        // Claude Code needs full history (no Mastra memory integration)
        const fullMessages = conversation.messages.map((m: ChatMessage) => ({
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content
        }))
        responseText = await this.runClaudeCodeAgent(
          employee,
          systemPrompt,
          fullMessages,
          wrappedOnStream,
          conversationId,
          toolCallCb ? (data) => toolCallCb(data) : undefined,
          conversationId ? (data) => this.onFileWritten?.({ conversationId, ...data }) : undefined,
          skipApproval
        )
      } else {
        responseText = await this.runAgent(
          provider,
          employee,
          systemPrompt,
          messages,
          wrappedOnStream,
          Object.keys(allTools).length > 0 ? allTools : undefined,
          mem,
          abortController.signal
        )
      }

      const msg = await this.addMessage(conversationId, { role: 'assistant', content: responseText })
      onMessageStored?.(msg)
      return msg
    } catch (error) {
      if (abortController.signal.aborted) {
        const content = streamedText.trim() || '[Stopped]'
        const msg = await this.addMessage(conversationId, { role: 'assistant', content })
        onMessageStored?.(msg)
        return msg
      }
      const errorMsg = `Failed to get response: ${error instanceof Error ? error.message : 'Unknown error'}. Check your API key and model settings.`
      const msg = await this.addMessage(conversationId, { role: 'assistant', content: errorMsg })
      onStream(errorMsg)
      onMessageStored?.(msg)
      return msg
    } finally {
      this.activeAbortControllers.delete(conversationId)
      this.activeClaudeCodeAborts.delete(conversationId)
    }
  }

  /**
   * Create a Mastra Agent and run it with streaming, returning the final text.
   * Handles tool calling automatically via Mastra's built-in loop.
   */
  private async runAgent(
    provider: ProviderConfig,
    employee: Employee,
    systemPrompt: string,
    messages: { role: 'user' | 'assistant' | 'system'; content: string }[],
    onStream: (chunk: string) => void,
    tools?: Record<string, ReturnType<typeof createTool>>,
    mem?: Memory,
    abortSignal?: AbortSignal
  ): Promise<string> {
    const modelRef = buildModelRef(provider, employee.model)
    const hasTools = !!tools && Object.keys(tools).length > 0
    const providerOptions = buildProviderOptions(provider, hasTools)

    // Attach memory for working memory injection (but don't pass threadId —
    // we handle message persistence ourselves via ConversationService)
    const agent = new Agent({
      id: `employee-${employee.id}`,
      name: employee.name,
      instructions: systemPrompt,
      model: modelRef,
      tools: tools || {},
      memory: mem
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const streamFn = agent.stream.bind(agent) as (messages: any, options?: any) => Promise<any>
    const streamOptions: Record<string, unknown> = {
      maxSteps: 5,
      // Pass resourceId for working memory injection, but NOT threadId
      // (threadId triggers Mastra auto-persistence — we handle that via ConversationService)
      resourceId: employee.id
    }
    if (abortSignal) streamOptions.abortSignal = abortSignal
    if (providerOptions) streamOptions.providerOptions = providerOptions
    const result = await streamFn(messages, streamOptions)

    let accumulated = ''
    for await (const chunk of result.textStream) {
      if (abortSignal?.aborted) break
      accumulated += chunk
      onStream(chunk)
    }

    return accumulated
  }

  /**
   * Run an employee via Claude Code CLI subprocess.
   * Used when the employee's provider is 'claude-code'.
   */
  private async runClaudeCodeAgent(
    employee: Employee,
    systemPrompt: string,
    messages: { role: 'user' | 'assistant' | 'system'; content: string }[],
    onStream: (chunk: string) => void,
    conversationId?: string,
    onToolCall?: (data: { tool: string; summary: string; detail?: string }) => void,
    onFileWritten?: (data: { path: string; content: string }) => void,
    skipApproval = false
  ): Promise<string> {
    // All enabled builtin tools are passed — approval is handled per-invocation via hooks
    const enabledToolIds = employee.tools
      .filter(t => t.enabled && t.source === 'builtin')
      .map(t => t.id)

    // Determine which Claude Code tool names require per-invocation approval via hooks
    const requiresApprovalClaudeNames = new Set<string>()
    if (!skipApproval && !employee.permissions.autoApproveAll && this.onApprovalRequest) {
      for (const tool of employee.tools.filter(t => t.enabled && t.requiresApproval)) {
        if (tool.source === 'builtin') {
          // Map builtin tool ID → Claude Code tool names (e.g. read_file → Read, Glob, Grep)
          const ccNames = TOOL_MAP[tool.id] || []
          ccNames.forEach(n => requiresApprovalClaudeNames.add(n))
        } else if (tool.source === 'mcp' && tool.mcpServerId && tool.name) {
          // MCP tools in Claude Code are referenced as mcp__serverId__toolName
          requiresApprovalClaudeNames.add(`mcp__${tool.mcpServerId}__${tool.name}`)
        }
      }
    }

    // ⚠️  CLAUDE CODE ONLY: start internal HTTP API server for memory/knowledge tools.
    // This bridges the prometheus-internal MCP server subprocess (running inside Claude Code)
    // back to our main process Memory instance and EmployeeStore.
    // Mastra agents never reach this code — they use native createTool() functions instead.
    const mem = getMemory()
    const internalServer = mem
      ? await startInternalServer({ memory: mem, store: this.store })
      : null

    // Start approval HTTP server if any tools need per-invocation approval
    let approvalServer: { port: number; close: () => void } | null = null
    if (requiresApprovalClaudeNames.size > 0) {
      approvalServer = await startApprovalServer(async (toolName, toolInput) => {
        if (!requiresApprovalClaudeNames.has(toolName)) return true
        return new Promise<boolean>((resolve) => {
          const approvalId = `approval-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
          const timer = setTimeout(() => {
            this.pendingApprovals.delete(approvalId)
            resolve(false)
          }, 5 * 60 * 1000)
          this.pendingApprovals.set(approvalId, { resolve, timer })
          const firstVal = Object.values(toolInput)[0]
          const summary = typeof firstVal === 'string' && firstVal.length < 80
            ? `${toolName}: ${firstVal}`
            : toolName
          this.onApprovalRequest?.({
            conversationId: conversationId || '',
            approvalId,
            tool: toolName,
            args: toolInput,
            summary
          })
        })
      })
    }

    // Get enabled MCP servers for this employee (both stdio and HTTP)
    const mcpAssignments = employee.tools.filter(t => t.source === 'mcp' && t.enabled && t.mcpServerId)
    const mcpServerIds = [...new Set(mcpAssignments.map(t => t.mcpServerId!))]
    const settings = this.store.getSettings()
    const mcpServers: { id: string; command?: string; args?: string[]; env?: Record<string, string>; url?: string; headers?: Record<string, string> }[] = []
    for (const id of mcpServerIds) {
      // Check settings for stdio servers
      const fromSettings = settings.mcpServers.find(s => s.id === id)
      if (fromSettings) {
        const resolved = this.mcpManager?.resolveCommand(fromSettings) || { command: fromSettings.command, args: fromSettings.args }
        mcpServers.push({ id: fromSettings.id, command: resolved.command, args: resolved.args, env: fromSettings.env })
      } else if (id === COMPOSIO_MCP_SERVER_ID && composioMcpConfig) {
        // Composio is ephemeral (not in settings) — use in-memory config
        mcpServers.push({ id, url: composioMcpConfig.url, headers: composioMcpConfig.headers })
      } else {
        // Check native integrations (not in mcpServers, resolved at runtime)
        const nativeConfig = this.mcpManager?.getRegisteredConfig(id)
        if (nativeConfig) {
          mcpServers.push({ id: nativeConfig.id, command: nativeConfig.command, args: nativeConfig.args, env: nativeConfig.env })
        }
      }
    }

    // Collect MCP tool names in Claude Code format: mcp__serverId__toolName
    const mcpToolNames: string[] = []
    if (this.mcpManager) {
      for (const serverId of mcpServerIds) {
        const serverTools = this.mcpManager.getTools(serverId)
        for (const toolName of Object.keys(serverTools)) {
          mcpToolNames.push(`mcp__${serverId}__${toolName}`)
        }
      }
    }

    // Extract the latest user message as the prompt
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
    const prompt = lastUserMsg?.content || ''

    // History is everything except the last user message
    const history = lastUserMsg
      ? messages.filter(m => m !== lastUserMsg)
      : messages

    try {
      // For tools that require approval, suppress the tool_call bubble — the approval card already shows the info
      const filteredOnToolCall = onToolCall && requiresApprovalClaudeNames.size > 0
        ? (data: { tool: string; summary: string; detail?: string }) => {
            if (!requiresApprovalClaudeNames.has(data.tool)) onToolCall(data)
          }
        : onToolCall

      const { promise, abort } = runClaudeCode({
        prompt,
        systemPrompt,
        model: employee.model,
        enabledToolIds,
        mcpServers,
        mcpToolNames,
        conversationHistory: history.length > 0 ? history : undefined,
        approvalServerPort: approvalServer?.port,
        // ⚠️  CLAUDE CODE ONLY: internal MCP server context for memory/knowledge tools
        internalServerPort: internalServer?.port,
        internalEmployeeId: employee.id,
        internalConversationId: conversationId,
        onStream,
        onToolCall: filteredOnToolCall,
        onFileWritten
      })
      if (conversationId) this.activeClaudeCodeAborts.set(conversationId, abort)
      return await promise
    } finally {
      approvalServer?.close()
      internalServer?.close()
    }
  }

  /**
   * Get the list of employees this employee can contact based on permissions.
   */
  private getContactableEmployees(employee: Employee): Employee[] {
    const contactAccess = employee.permissions.contactAccess
    if (contactAccess.mode === 'none') return []

    const allEmployees = this.store.listEmployees().filter(e => e.id !== employee.id)

    if (contactAccess.mode === 'all') return allEmployees

    // mode === 'specific'
    return allEmployees.filter(e => {
      if (contactAccess.allowedEmployeeIds.includes(e.id)) return true
      if (e.departmentId && contactAccess.allowedDepartmentIds.includes(e.departmentId)) return true
      return false
    })
  }

  /**
   * Handle a delegate_task tool call: create task, auto-execute with target agent, return result.
   */
  private handleDelegateTask(
    fromEmployee: Employee,
    args: Record<string, string>,
    conversationId?: string
  ): { task: Task; message: string } {
    const toEmployee = this.store.getEmployee(args.to_employee_id)
    const toName = toEmployee?.name || 'Unknown'

    const task = this.store.createTask({
      fromEmployeeId: fromEmployee.id,
      toEmployeeId: args.to_employee_id,
      priority: (args.priority || 'medium') as Task['priority'],
      deadline: args.deadline || '',
      objective: args.objective,
      context: args.context,
      deliverable: args.deliverable,
      acceptanceCriteria: args.acceptance_criteria,
      escalateIf: args.escalate_if,
      status: 'pending',
      messages: []
    })

    // Attach file paths from conversation to the task context (async, fire-and-forget)
    if (conversationId && this.convService) {
      this.convService.getConversation(conversationId).then(conv => {
        if (!conv) return
        const attachedFiles: string[] = []
        for (const msg of conv.messages) {
          const matches = msg.content.match(/\[Attached: .+?\] \(path: (.+?)\)/g) || []
          for (const match of matches) {
            const pathMatch = match.match(/\(path: (.+?)\)/)
            if (pathMatch) attachedFiles.push(pathMatch[1])
          }
          if (msg.attachments) {
            for (const att of msg.attachments) {
              if (!attachedFiles.includes(att.path)) attachedFiles.push(att.path)
            }
          }
        }
        if (attachedFiles.length > 0) {
          const fileList = attachedFiles.map(f => `- ${f}`).join('\n')
          this.store.updateTask(task.id, {
            context: task.context + `\n\nAttached files from the conversation:\n${fileList}`
          })
        }
      }).catch(() => { /* ignore */ })
    }

    this.onTaskUpdate?.(task)

    // Auto-execute: send brief to target agent in background
    this.executeTask(task, conversationId).catch(err => {
      console.error('Task auto-execution failed:', err)
      this.store.updateTask(task.id, {
        status: 'escalated',
        response: `Auto-execution failed: ${err instanceof Error ? err.message : 'Unknown error'}`
      })
      const updated = this.store.getTask(task.id)
      if (updated) this.onTaskUpdate?.(updated)
    })

    const message = `Task delegated to **${toName}** (${toEmployee?.role || 'unknown role'}). They're working on it now.\n\n**Objective:** ${args.objective}\n**Priority:** ${args.priority}\n**Deadline:** ${args.deadline || 'Not specified'}`

    return { task, message }
  }

  /**
   * Execute an agent-to-agent message: find or create a conversation, add message, run target agent, return response.
   */
  async executeAgentMessage(fromEmployee: Employee, toEmployeeId: string, message: string): Promise<string> {
    const toEmployee = this.store.getEmployee(toEmployeeId)
    if (!toEmployee) throw new Error('Target employee not found')

    const settings = this.store.getSettings()
    const provider = settings.providers.find(p => p.id === toEmployee.provider)
    if (!provider) throw new Error(`Provider ${toEmployee.provider} not configured`)
    if (!provider.apiKey && provider.id !== 'ollama' && provider.id !== 'claude-code') throw new Error(`No API key for ${provider.name}`)

    // Find or create the agent-to-agent conversation
    const companyId = this.store.getActiveCompanyId() || ''
    if (!this.convService) throw new Error('ConversationService not initialized')
    let conv = await this.convService.findAgentConversation(fromEmployee.id, toEmployeeId, companyId)
    if (!conv) {
      conv = await this.convService.createConversation(fromEmployee.id, companyId, toEmployeeId)
    }

    // Add the sender's message
    await this.addMessage(conv.id, {
      role: 'user',
      content: `[From ${fromEmployee.name}]: ${message}`
    })

    // Build system prompt for target employee
    const systemPrompt = await this.buildSystemPrompt(toEmployee)

    // Get Mastra memory instance (if available)
    let mem: Memory | undefined
    try { mem = getMemory() } catch { /* unavailable */ }

    // Build tools for the target agent so it can use its assigned capabilities
    const targetContactable = this.getContactableEmployees(toEmployee)
    const targetTools = buildMastraTools(
      this.store,
      toEmployee,
      conv.id,
      targetContactable,
      (fromEmp, args, convId) => this.handleDelegateTask(fromEmp, args, convId),
      (fromEmp, toId, msg) => this.executeAgentMessage(fromEmp, toId, msg),
      undefined,
      this.onFileWritten,
      mem
    )
    const allTargetTools = await this.mergeEmployeeMcpTools(toEmployee, targetTools)

    // Build full conversation history for the target agent
    const fullConv = await this.getConversation(conv.id)
    const messages: { role: 'user' | 'assistant' | 'system'; content: string }[] = (fullConv?.messages || []).map((m: ChatMessage) => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content
    }))

    // Run target agent with its tools
    let responseText: string
    if (provider.id === 'claude-code') {
      responseText = await this.runClaudeCodeAgent(toEmployee, systemPrompt, messages, () => {})
    } else {
      responseText = await this.runAgent(
        provider, toEmployee, systemPrompt, messages, () => {},
        Object.keys(allTargetTools).length > 0 ? allTargetTools : undefined,
        mem
      )
    }

    // Store the response
    await this.addMessage(conv.id, {
      role: 'assistant',
      content: responseText
    })

    return responseText
  }

  /**
   * Estimate token count for a piece of text using a simple heuristic.
   */
  countTokens(text: string): number {
    return Math.ceil(text.length / 4)
  }

  /**
   * Count total tokens in a conversation.
   */
  async countConversationTokens(conversationId: string): Promise<number> {
    if (!this.convService) throw new Error('ConversationService not initialized')
    return this.convService.countTokens(conversationId)
  }

  /**
   * Compress a conversation by summarizing older messages.
   */
  async compressConversation(conversationId: string): Promise<void> {
    const conv = await this.getConversation(conversationId)
    if (!conv || conv.messages.length <= 4) return

    const employee = this.store.getEmployee(conv.employeeId)
    if (!employee) return

    const settings = this.store.getSettings()
    const provider = settings.providers.find(p => p.id === employee.provider)
    if (!provider?.apiKey && provider?.id !== 'ollama' && provider?.id !== 'claude-code') return
    if (!provider) return

    // Split messages: older ones to summarize, keep last 4
    const toSummarize = conv.messages.slice(0, conv.messages.length - 4)
    const toKeep = conv.messages.slice(conv.messages.length - 4)

    // Build summary prompt
    const summaryContent = toSummarize.map(m => `${m.role}: ${m.content}`).join('\n\n')
    const summaryMessages: { role: 'user' | 'assistant' | 'system'; content: string }[] = [
      { role: 'user', content: `Summarize this conversation concisely, preserving key facts, decisions, and context:\n\n${summaryContent}` }
    ]

    // Use agent for the summary (no tools needed)
    let summaryText: string
    if (provider.id === 'claude-code') {
      summaryText = await this.runClaudeCodeAgent(
        { ...employee, tools: [] },
        'You are a helpful assistant that creates concise conversation summaries.',
        summaryMessages,
        () => {}
      )
    } else {
      summaryText = await this.runAgent(provider, employee, 'You are a helpful assistant that creates concise conversation summaries.', summaryMessages, () => {}, undefined)
    }

    // Replace old messages with summary + keep recent ones
    const summaryMsg: ChatMessage = {
      id: `summary-${Date.now()}`,
      role: 'system',
      content: `[Conversation Summary]\n${summaryText}`,
      timestamp: new Date().toISOString()
    }

    if (!this.convService) throw new Error('ConversationService not initialized')
    await this.convService.replaceMessages(conversationId, [summaryMsg, ...toKeep])
  }

  /**
   * Auto-execute a task: send the Agent Brief to the target employee and capture their response.
   */
  private async executeTask(task: Task, originConversationId?: string): Promise<void> {
    const toEmployee = this.store.getEmployee(task.toEmployeeId)
    if (!toEmployee) throw new Error('Target employee not found')

    const fromEmployee = this.store.getEmployee(task.fromEmployeeId)
    const fromName = fromEmployee?.name || 'Unknown'

    const settings = this.store.getSettings()
    const provider = settings.providers.find(p => p.id === toEmployee.provider)
    if (!provider) throw new Error(`Provider ${toEmployee.provider} not configured`)
    if (!provider.apiKey && provider.id !== 'ollama' && provider.id !== 'claude-code') throw new Error(`No API key for ${provider.name}`)

    // Update status to in_progress
    this.store.updateTask(task.id, { status: 'in_progress' })
    const inProgress = this.store.getTask(task.id)
    if (inProgress) this.onTaskUpdate?.(inProgress)

    // Build the brief as a user message to the target agent
    const brief = `AGENT BRIEF\nTo: ${toEmployee.name} (${toEmployee.role})\nFrom: ${fromName}\nPriority: ${task.priority}\nDeadline: ${task.deadline || 'Not specified'}\n\nObjective:\n${task.objective}\n\nContext:\n${task.context}\n\nDeliverable:\n${task.deliverable}\n\nAcceptance Criteria:\n${task.acceptanceCriteria}\n\nEscalate to founder if:\n${task.escalateIf}`

    // Build system prompt for target employee
    const systemPrompt = await this.buildSystemPrompt(toEmployee)

    // Build tools for the target agent so they can read files, write files, etc.
    const contactable = this.getContactableEmployees(toEmployee)
    const taskTools = buildMastraTools(
      this.store,
      toEmployee,
      undefined, // no conversation context
      contactable,
      (fromEmp, args, convId) => this.handleDelegateTask(fromEmp, args, convId),
      (fromEmp, toId, msg) => this.executeAgentMessage(fromEmp, toId, msg),
      // Log tool calls to task thread
      (data) => {
        this.store.addTaskMessage(task.id, { role: 'tool', content: `${data.tool}: ${data.summary}` })
        // Notify frontend in real-time so activity thread updates live
        const current = this.store.getTask(task.id)
        if (current) this.onTaskUpdate?.(current)
      },
      this.onFileWritten
    )

    const messages: { role: 'user' | 'assistant' | 'system'; content: string }[] = [{ role: 'user', content: brief }]

    // Track a live message ID for real-time streaming updates
    let liveMsg = this.store.addTaskMessage(task.id, { role: 'agent', employeeId: toEmployee.id, content: '...' })
    const currentTask = this.store.getTask(task.id)
    if (currentTask) this.onTaskUpdate?.(currentTask)

    try {
      // Throttled streaming callback — accumulates text, saves at most every 500ms
      let taskAccumulated = ''
      let taskThrottleTimer: ReturnType<typeof setTimeout> | null = null
      const flushTaskStream = () => {
        const t = this.store.getTask(task.id)
        if (t) {
          const msgIdx = t.messages.findIndex(m => m.id === liveMsg.id)
          if (msgIdx >= 0) {
            t.messages[msgIdx].content = taskAccumulated
            this.store.updateTask(task.id, { messages: t.messages })
            this.onTaskUpdate?.(t)
          }
        }
      }
      const taskStreamCb = (chunk: string) => {
        taskAccumulated += chunk
        if (!taskThrottleTimer) {
          taskThrottleTimer = setTimeout(() => {
            taskThrottleTimer = null
            flushTaskStream()
          }, 500)
        }
      }

      // No threadId passed — task conversations are ephemeral and stored in task.messages, not Mastra memory
      let responseText: string
      if (provider.id === 'claude-code') {
        responseText = await this.runClaudeCodeAgent(
          toEmployee, systemPrompt, messages, taskStreamCb,
          undefined,
          (data: { tool: string; summary: string; detail?: string }) => {
            this.store.addTaskMessage(task.id, { role: 'tool', content: `${data.tool}: ${data.summary}` })
            const current = this.store.getTask(task.id)
            if (current) this.onTaskUpdate?.(current)
          }
        )
      } else {
        responseText = await this.runAgent(
          provider, toEmployee, systemPrompt, messages, taskStreamCb,
          Object.keys(taskTools).length > 0 ? taskTools : undefined
        )
      }

      // Clear any pending throttle timer and do a final flush
      if (taskThrottleTimer) clearTimeout(taskThrottleTimer)

      // Finalize the live message with complete text
      const finalTask = this.store.getTask(task.id)
      if (finalTask) {
        const msgIdx = finalTask.messages.findIndex(m => m.id === liveMsg.id)
        if (msgIdx >= 0) {
          finalTask.messages[msgIdx].content = responseText
          this.store.updateTask(task.id, { messages: finalTask.messages })
        }
      }

      // Save response but keep as in_progress — user reviews and marks complete
      this.store.updateTask(task.id, {
        status: 'in_progress',
        response: responseText
      })
    } catch (err) {
      const errorMsg = `Error: ${err instanceof Error ? err.message : 'Unknown error'}`
      this.store.addTaskMessage(task.id, { role: 'tool', content: errorMsg })
      this.store.updateTask(task.id, { status: 'escalated' })
    }

    const updated = this.store.getTask(task.id)
    if (updated) this.onTaskUpdate?.(updated)

    // Notify the delegating agent's conversation with a system message about the result
    if (originConversationId && this.convService) {
      try {
        const toName = toEmployee?.name || 'Unknown'
        const status = updated?.status || 'in_progress'
        const summary = (updated?.response || '').slice(0, 500)
        const feedbackContent = `[Task Update] Task "${task.objective}" ${status === 'escalated' ? 'was escalated' : 'completed'} by ${toName}.\n\nResponse summary: ${summary}${(updated?.response?.length || 0) > 500 ? '...' : ''}`
        await this.convService.addMessage(originConversationId, {
          role: 'system',
          content: feedbackContent
        })
      } catch {
        // Non-critical — don't fail the task if feedback message fails
      }
    }
  }

  /**
   * Continue a task conversation: add a user reply and run the agent again.
   */
  async continueTask(taskId: string, userMessage: string): Promise<void> {
    const task = this.store.getTask(taskId)
    if (!task) throw new Error('Task not found')

    const toEmployee = this.store.getEmployee(task.toEmployeeId)
    if (!toEmployee) throw new Error('Employee not found')

    // Add user message to thread
    this.store.addTaskMessage(taskId, { role: 'user', content: userMessage })

    // Update status back to in_progress if it was escalated
    if (task.status === 'escalated') {
      this.store.updateTask(taskId, { status: 'in_progress' })
    }

    // Rebuild conversation from task thread
    const updatedTask = this.store.getTask(taskId)!
    const fromEmployee = this.store.getEmployee(task.fromEmployeeId)
    const fromName = fromEmployee?.name || 'Unknown'

    const brief = `AGENT BRIEF\nTo: ${toEmployee.name} (${toEmployee.role})\nFrom: ${fromName}\nPriority: ${task.priority}\nDeadline: ${task.deadline || 'Not specified'}\n\nObjective:\n${task.objective}\n\nContext:\n${task.context}\n\nDeliverable:\n${task.deliverable}\n\nAcceptance Criteria:\n${task.acceptanceCriteria}\n\nEscalate to founder if:\n${task.escalateIf}`

    const messages: { role: 'user' | 'assistant' | 'system'; content: string }[] = [
      { role: 'user', content: brief },
      ...(updatedTask.messages || [])
        .filter(m => m.role !== 'tool')
        .map(m => ({
          role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
          content: m.content
        }))
    ]

    // Get provider
    const settings = this.store.getSettings()
    const provider = settings.providers.find(p => p.id === toEmployee.provider)
    if (!provider) throw new Error(`Provider "${toEmployee.provider}" not found in settings`)
    if (!provider.apiKey && provider.id !== 'ollama' && provider.id !== 'claude-code') throw new Error(`No API key for ${provider.name}`)

    const systemPrompt = await this.buildSystemPrompt(toEmployee)

    // Build tools for the agent
    const contactable = this.getContactableEmployees(toEmployee)
    const taskTools = buildMastraTools(
      this.store,
      toEmployee,
      undefined,
      contactable,
      (fromEmp, args, convId) => this.handleDelegateTask(fromEmp, args, convId),
      (fromEmp, toId, msg) => this.executeAgentMessage(fromEmp, toId, msg),
      // Log tool calls to task thread + notify frontend in real-time
      (data) => {
        this.store.addTaskMessage(taskId, { role: 'tool', content: `${data.tool}: ${data.summary}` })
        const current = this.store.getTask(taskId)
        if (current) this.onTaskUpdate?.(current)
      },
      this.onFileWritten
    )

    // Create live message for streaming
    let continueMsg = this.store.addTaskMessage(taskId, { role: 'agent', employeeId: toEmployee.id, content: '...' })
    const ct = this.store.getTask(taskId)
    if (ct) this.onTaskUpdate?.(ct)

    try {
      // Throttled streaming callback — accumulates text, saves at most every 500ms
      let contAccumulated = ''
      let contThrottleTimer: ReturnType<typeof setTimeout> | null = null
      const flushContStream = () => {
        const t = this.store.getTask(taskId)
        if (t) {
          const msgIdx = t.messages.findIndex(m => m.id === continueMsg.id)
          if (msgIdx >= 0) {
            t.messages[msgIdx].content = contAccumulated
            this.store.updateTask(taskId, { messages: t.messages })
            this.onTaskUpdate?.(t)
          }
        }
      }
      const continueStreamCb = (chunk: string) => {
        contAccumulated += chunk
        if (!contThrottleTimer) {
          contThrottleTimer = setTimeout(() => {
            contThrottleTimer = null
            flushContStream()
          }, 500)
        }
      }

      let responseText: string
      if (provider.id === 'claude-code') {
        responseText = await this.runClaudeCodeAgent(
          toEmployee, systemPrompt, messages, continueStreamCb,
          undefined,
          (data: { tool: string; summary: string; detail?: string }) => {
            this.store.addTaskMessage(taskId, { role: 'tool', content: `${data.tool}: ${data.summary}` })
            const current = this.store.getTask(taskId)
            if (current) this.onTaskUpdate?.(current)
          }
        )
      } else {
        responseText = await this.runAgent(
          provider, toEmployee, systemPrompt, messages, continueStreamCb,
          Object.keys(taskTools).length > 0 ? taskTools : undefined
        )
      }

      // Clear any pending throttle timer and do a final flush
      if (contThrottleTimer) clearTimeout(contThrottleTimer)

      // Finalize the live message
      const ft = this.store.getTask(taskId)
      if (ft) {
        const msgIdx = ft.messages.findIndex(m => m.id === continueMsg.id)
        if (msgIdx >= 0) {
          ft.messages[msgIdx].content = responseText
          this.store.updateTask(taskId, { messages: ft.messages })
        }
      }
      this.store.updateTask(taskId, { response: responseText })
    } catch (err) {
      const errorMsg = `Error: ${err instanceof Error ? err.message : 'Unknown error'}`
      this.store.addTaskMessage(taskId, { role: 'tool', content: errorMsg })
      this.store.updateTask(taskId, { status: 'escalated' })
    }

    const updated = this.store.getTask(taskId)
    if (updated) this.onTaskUpdate?.(updated)
  }

  /**
   * Build the full system prompt including knowledge docs, working memory, and team info.
   */
  private async buildSystemPrompt(employee: Employee, _conversationId?: string): Promise<string> {
    // Name and role at the top, then the custom system prompt
    let prompt = `You are ${employee.name}, ${employee.role}.\n\n`
    prompt += employee.systemPrompt || ''

    // Working memory is auto-injected by Mastra when memory is attached to the Agent.
    // Fall back to legacy string only when Mastra memory isn't available.
    let mastraMemAvailable = false
    try { getMemory(); mastraMemAvailable = true } catch { /* unavailable */ }
    if (!mastraMemAvailable && employee.memory) {
      prompt += '\n\n---\n\n# Your Memory'
      prompt += `\n${employee.memory}`
    }

    // Append knowledge documents with IDs so agents can reference them
    if (employee.knowledgeIds.length > 0) {
      const allKnowledge = this.store.listKnowledge()
      const docs = employee.knowledgeIds
        .map(id => allKnowledge.find(k => k.id === id))
        .filter(Boolean)

      if (docs.length > 0) {
        prompt += '\n\n---\n\n# Your Knowledge Documents'
        for (const doc of docs) {
          prompt += `\n\n## ${doc!.title} [ID: ${doc!.id}]\n${doc!.content}`
        }
      }
    }

    // Append team delegation info
    const contactable = this.getContactableEmployees(employee)
    if (contactable.length > 0) {
      const departments = this.store.listDepartments()
      const allKnowledge = this.store.listKnowledge()
      prompt += '\n\n## Your Team\nYou can delegate tasks to or message these team members:\n'
      for (const e of contactable) {
        const dept = departments.find(d => d.id === e.departmentId)
        const deptLabel = dept ? ` — ${dept.name}` : ''
        const enabledTools = e.tools.filter(t => t.enabled).map(t => t.name)
        const knowledgeDocs = e.knowledgeIds.map(id => allKnowledge.find(k => k.id === id)?.title).filter(Boolean)
        prompt += `- ${e.name} (${e.role}${deptLabel}) [ID: ${e.id}]\n`
        if (enabledTools.length > 0) prompt += `  Tools: ${enabledTools.join(', ')}\n`
        if (knowledgeDocs.length > 0) prompt += `  Knowledge: ${knowledgeDocs.join(', ')}\n`
      }
      prompt += '\nUse delegate_task for formal work assignments. Use message_employee for quick questions, clarifications, or collaboration.'
    }

    // Memory and knowledge instructions
    prompt += '\n\nYou have persistent working memory across conversations. Use update_working_memory to save key facts, decisions, and preferences when they come up — don\'t wait until the end.'
    if (isSemanticRecallEnabled()) {
      prompt += ' Use search_memory when you need to recall something from a past conversation.'
    }
    prompt += '\n\nIf the user tells you something that contradicts or updates information in your knowledge documents, update the document immediately using update_knowledge_doc. Don\'t ask — just update it and mention what you changed.'
    prompt += '\n\nYou can create new knowledge documents using create_knowledge_doc for important information that should persist.'
    prompt += '\nYou can use create_scheduled_task to set up recurring automated tasks.'

    // Composio integration instructions — tell the agent what apps it can use
    const composioTools = employee.tools.filter(t => t.source === 'mcp' && t.enabled && t.mcpServerId === 'composio-integrations')
    if (composioTools.length > 0) {
      prompt += '\n\n## Connected Integrations (via Composio)'
      prompt += '\nYou have access to external app integrations. Use these Composio tools to interact with connected apps:'
      prompt += '\n- COMPOSIO_SEARCH_TOOLS: Search for available actions in connected apps (e.g. search for "instagram" to find posting, analytics tools)'
      prompt += '\n- COMPOSIO_MULTI_EXECUTE_TOOL: Execute actions in connected apps'
      prompt += '\n- COMPOSIO_GET_TOOL_SCHEMAS: Get detailed schemas for specific tools before using them'
      prompt += '\nWhen the user asks you to do something with a connected app, first use COMPOSIO_SEARCH_TOOLS to find the right action, then use COMPOSIO_MULTI_EXECUTE_TOOL to execute it.'
    }

    // Task delegation instructions
    prompt += '\n\nWhen working on a delegated task:'
    prompt += '\n- If you need more information, use message_employee to ask the sender'
    prompt += '\n- If you need something only the founder can provide, clearly state what you need — they can reply directly on the task'
    prompt += '\n- Don\'t produce a half-finished deliverable. Ask first, deliver second.'

    return prompt
  }

  /**
   * Wrap tools that require approval with a blocking Promise.
   * The agent's tool execution pauses until the user approves or denies.
   */
  private wrapToolsWithApproval(
    allTools: Record<string, ReturnType<typeof createTool>>,
    employee: Employee,
    conversationId: string
  ) {
    for (const [toolKey, tool] of Object.entries(allTools)) {
      // Match tool key to employee's ToolAssignment
      const assignment = this.findToolAssignment(employee, toolKey)
      if (!assignment?.requiresApproval) continue

      const originalExecute = (tool as unknown as Record<string, unknown>).execute as (input: Record<string, unknown>) => Promise<Record<string, unknown>>
      const wrappedExecute = async (input: Record<string, unknown>) => {
        const approvalId = `approval-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

        // Build a readable summary of the tool call
        const firstVal = input ? Object.values(input)[0] : null
        const summary = typeof firstVal === 'string' && firstVal.length < 80
          ? `${assignment.name}: ${firstVal}`
          : assignment.name

        // Emit approval request to frontend
        this.onApprovalRequest?.({ conversationId, approvalId, tool: assignment.name, args: input || {}, summary })

        // Block until user responds or timeout
        const approved = await new Promise<boolean>((resolve) => {
          const timer = setTimeout(() => {
            this.pendingApprovals.delete(approvalId)
            resolve(false)
          }, 5 * 60 * 1000)
          this.pendingApprovals.set(approvalId, { resolve, timer })
        })

        if (!approved) {
          return { result: 'Tool call was denied by the user.' }
        }

        return originalExecute(input)
      }
      // Replace the tool entry with a new object to avoid frozen property issues
      allTools[toolKey] = { ...tool, execute: wrappedExecute } as ReturnType<typeof createTool>
    }
  }

  /**
   * Match a tool key to the employee's ToolAssignment.
   * IDs match directly since both use TOOL_IDS constants.
   */
  private findToolAssignment(employee: Employee, toolKey: string): { name: string; requiresApproval: boolean } | undefined {
    return employee.tools.find(t => t.id === toolKey && t.enabled)
  }

  /**
   * Merge MCP tools that the employee has enabled into the builtin tools record.
   * Only includes MCP tools the employee explicitly has in their tools array with enabled=true.
   * Lazily connects MCP servers as needed via ensureConnected.
   */
  private async mergeEmployeeMcpTools(
    employee: Employee,
    builtinTools: Record<string, ReturnType<typeof createTool>>
  ): Promise<Record<string, ReturnType<typeof createTool>>> {
    if (!this.mcpManager) return builtinTools

    const allTools = { ...builtinTools }

    // Get enabled MCP tool assignments for this employee
    const mcpAssignments = employee.tools.filter(t => t.source === 'mcp' && t.enabled && t.mcpServerId)
    // Group by server ID
    const byServer = new Map<string, string[]>()
    for (const assignment of mcpAssignments) {
      const serverId = assignment.mcpServerId!
      if (!byServer.has(serverId)) byServer.set(serverId, [])
      byServer.get(serverId)!.push(assignment.id)
    }

    // Lazily connect needed servers in parallel
    const connectResults = await Promise.allSettled(
      Array.from(byServer.keys()).map(sid => this.mcpManager!.ensureConnected(sid))
    )
    for (const result of connectResults) {
      if (result.status === 'rejected') {
        console.error('Failed to connect MCP server:', result.reason)
      }
    }

    // Merge tools from each MCP server
    for (const [serverId, enabledToolIds] of byServer) {
      const serverTools = this.mcpManager.getTools(serverId)
      for (const [toolName, tool] of Object.entries(serverTools)) {
        // Tool ID in assignments is formatted as mcp_{serverId}_{toolName}
        const assignmentId = `mcp_${serverId}_${toolName}`
        if (enabledToolIds.includes(assignmentId)) {
          allTools[`mcp_${serverId}_${toolName}`] = tool as ReturnType<typeof createTool>
        }
      }
    }

    return allTools
  }
}
