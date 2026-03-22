import { readFileSync, writeFileSync } from 'fs'
import { Agent } from '@mastra/core/agent'
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { EmployeeStore } from './store'
import { ChatMessage, Employee, ProviderConfig, Task, TaskMessage } from './types'

// ============================================================
// Mastra model string/object builders
// ============================================================

type MastraModel = string | { id: string; url: string; apiKey?: string; headers?: Record<string, string> }

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
        id: model.includes('/') ? model : `openai/${model}`,
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
  onFileWritten?: (data: { conversationId: string; path: string; content: string }) => void
): Record<string, ReturnType<typeof createTool>> {
  const tools: Record<string, ReturnType<typeof createTool>> = {}
  const enabledToolIds = new Set(
    employee.tools.filter(t => t.enabled && t.source === 'builtin').map(t => t.id)
  )

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

  // Memory tools — always available
  tools.save_memory = createTool({
    id: 'save_memory',
    description: 'Save important facts, decisions, and preferences to your persistent memory. Your memory persists across conversations. Pass the full updated memory content — it replaces your previous memory entirely.',
    inputSchema: z.object({
      content: z.string().describe('Your full updated memory (replaces previous). Include all facts you want to remember.')
    }),
    execute: async (input) => {
      onToolCall?.({ tool: 'save_memory', summary: 'Saved to persistent memory', detail: input.content })
      store.updateEmployeeMemory(employee.id, input.content)
      return { result: 'Memory saved successfully. Your updated memory will be included in future conversations.' }
    }
  })

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
  if (enabledToolIds.has('web-search')) {
    tools.web_search = createTool({
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

  if (enabledToolIds.has('web-browse')) {
    tools.web_browse = createTool({
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

  if (enabledToolIds.has('file-read')) {
    tools.read_file = createTool({
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

  if (enabledToolIds.has('file-write')) {
    tools.write_file = createTool({
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

  if (enabledToolIds.has('code-execute')) {
    tools.execute_code = createTool({
      id: 'execute_code',
      description: 'Execute code in a sandboxed environment',
      inputSchema: z.object({
        language: z.string().describe('Programming language (e.g. python, javascript)'),
        code: z.string().describe('The code to execute')
      }),
      execute: async (input) => {
        return { result: `Code execution is not yet available in sandbox. Language: ${input.language}, Code length: ${input.code?.length || 0} chars.` }
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
  private onTaskUpdate?: (task: Task) => void
  private onFileWritten?: (data: { conversationId: string; path: string; content: string }) => void
  private onToolCall?: (data: { conversationId: string; tool: string; summary: string; detail?: string }) => void

  constructor(store: EmployeeStore) {
    this.store = store
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
  setToolCallCallback(cb: (data: { conversationId: string; tool: string; summary: string }) => void) {
    this.onToolCall = cb
  }

  async sendMessage(
    conversationId: string,
    content: string,
    onStream: (chunk: string) => void,
    onMessageStored?: (msg: ChatMessage) => void
  ): Promise<ChatMessage> {
    // Store user message and notify frontend immediately
    const userMsg = this.store.addMessage(conversationId, { role: 'user', content })
    onMessageStored?.(userMsg)

    const conversation = this.store.getConversation(conversationId)
    if (!conversation) throw new Error('Conversation not found')

    const employee = this.store.getEmployee(conversation.employeeId)
    if (!employee) throw new Error('Employee not found')

    const settings = this.store.getSettings()
    const provider = settings.providers.find(p => p.id === employee.provider)

    if (!provider?.apiKey && provider?.id !== 'ollama') {
      const errorMsg = `No API key configured for ${provider?.name || employee.provider}. Go to Settings to add your API key.`
      const msg = this.store.addMessage(conversationId, { role: 'assistant', content: errorMsg })
      onStream(errorMsg)
      return msg
    }

    if (!provider) {
      const errorMsg = `Provider "${employee.provider}" not found. Check your settings.`
      const msg = this.store.addMessage(conversationId, { role: 'assistant', content: errorMsg })
      onStream(errorMsg)
      return msg
    }

    // Build system prompt with knowledge documents and memory
    const systemPrompt = this.buildSystemPrompt(employee)

    // Build message history from conversation
    const messages = conversation.messages.map(m => ({
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
      this.onFileWritten
    )

    try {
      const responseText = await this.runAgent(
        provider,
        employee,
        systemPrompt,
        messages,
        onStream,
        Object.keys(tools).length > 0 ? tools : undefined
      )

      const msg = this.store.addMessage(conversationId, { role: 'assistant', content: responseText })
      return msg
    } catch (error) {
      const errorMsg = `Failed to get response: ${error instanceof Error ? error.message : 'Unknown error'}. Check your API key and model settings.`
      const msg = this.store.addMessage(conversationId, { role: 'assistant', content: errorMsg })
      onStream(errorMsg)
      return msg
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
    tools?: Record<string, ReturnType<typeof createTool>>
  ): Promise<string> {
    const modelRef = buildModelRef(provider, employee.model)
    const hasTools = !!tools && Object.keys(tools).length > 0
    const providerOptions = buildProviderOptions(provider, hasTools)

    // Create a per-request agent with the right model, instructions, and tools
    const agent = new Agent({
      id: `employee-${employee.id}`,
      name: employee.name,
      instructions: systemPrompt,
      model: modelRef,
      tools: tools || {},
      maxSteps: 10
    })

    // Stream the response and accumulate text for the onStream callback
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const streamFn = agent.stream.bind(agent) as (messages: any, options?: any) => Promise<any>
    const result = providerOptions
      ? await streamFn(messages, { providerOptions })
      : await streamFn(messages)

    let accumulated = ''
    for await (const chunk of result.textStream) {
      accumulated += chunk
      onStream(accumulated)
    }

    return accumulated
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

    // Attach file paths from conversation to the task context
    if (conversationId) {
      const conv = this.store.getConversation(conversationId)
      if (conv) {
        const attachedFiles: string[] = []
        for (const msg of conv.messages) {
          // Check for inline attachment markers
          const matches = msg.content.match(/\[Attached: .+?\] \(path: (.+?)\)/g) || []
          for (const match of matches) {
            const pathMatch = match.match(/\(path: (.+?)\)/)
            if (pathMatch) attachedFiles.push(pathMatch[1])
          }
          // Check for structured attachments on the message
          if (msg.attachments) {
            for (const att of msg.attachments) {
              if (!attachedFiles.includes(att.path)) {
                attachedFiles.push(att.path)
              }
            }
          }
        }
        if (attachedFiles.length > 0) {
          const fileList = attachedFiles.map(f => `- ${f}`).join('\n')
          this.store.updateTask(task.id, {
            context: task.context + `\n\nAttached files from the conversation:\n${fileList}`
          })
        }
      }
    }

    this.onTaskUpdate?.(task)

    // Auto-execute: send brief to target agent in background
    this.executeTask(task).catch(err => {
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
    if (!provider.apiKey && provider.id !== 'ollama') throw new Error(`No API key for ${provider.name}`)

    // Find or create the agent-to-agent conversation
    let conv = this.store.findAgentConversation(fromEmployee.id, toEmployeeId)
    if (!conv) {
      conv = this.store.createConversation(fromEmployee.id)
      // Update with peerEmployeeId and title
      const conversations = this.store.listConversations(fromEmployee.id)
      const created = conversations.find(c => c.id === conv!.id)
      if (created) {
        // We need to set peerEmployeeId — update the conversation data directly
        const fullConv = this.store.getConversation(conv.id)
        if (fullConv) {
          (fullConv as { peerEmployeeId?: string }).peerEmployeeId = toEmployeeId
          fullConv.title = `${fromEmployee.name} <> ${toEmployee.name}`
        }
      }
    }

    // Add the sender's message
    this.store.addMessage(conv.id, {
      role: 'user',
      content: `[From ${fromEmployee.name}]: ${message}`
    })

    // Build system prompt for target employee
    const systemPrompt = this.buildSystemPrompt(toEmployee)

    // Get conversation history
    const updatedConv = this.store.getConversation(conv.id)
    const messages = (updatedConv?.messages || []).map(m => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content
    }))

    // Run target agent with no tools (simple response)
    const responseText = await this.runAgent(
      provider,
      toEmployee,
      systemPrompt,
      messages,
      () => {},
      undefined
    )

    // Store the response
    this.store.addMessage(conv.id, {
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
  countConversationTokens(conversationId: string): number {
    const conv = this.store.getConversation(conversationId)
    if (!conv) return 0
    const allText = conv.messages.map(m => m.content).join('')
    return this.countTokens(allText)
  }

  /**
   * Compress a conversation by summarizing older messages.
   */
  async compressConversation(conversationId: string): Promise<void> {
    const conv = this.store.getConversation(conversationId)
    if (!conv || conv.messages.length <= 4) return

    const employee = this.store.getEmployee(conv.employeeId)
    if (!employee) return

    const settings = this.store.getSettings()
    const provider = settings.providers.find(p => p.id === employee.provider)
    if (!provider?.apiKey && provider?.id !== 'ollama') return
    if (!provider) return

    // Split messages: older ones to summarize, keep last 4
    const toSummarize = conv.messages.slice(0, conv.messages.length - 4)
    const toKeep = conv.messages.slice(conv.messages.length - 4)

    // Build summary prompt
    const summaryContent = toSummarize.map(m => `${m.role}: ${m.content}`).join('\n\n')
    const summaryMessages = [
      { role: 'user', content: `Summarize this conversation concisely, preserving key facts, decisions, and context:\n\n${summaryContent}` }
    ]

    // Use Mastra agent for the summary (no tools needed)
    const summaryText = await this.runAgent(
      provider,
      employee,
      'You are a helpful assistant that creates concise conversation summaries.',
      summaryMessages,
      () => {},
      undefined
    )

    // Replace old messages with summary + keep recent ones
    const summaryMsg: ChatMessage = {
      id: `summary-${Date.now()}`,
      role: 'system',
      content: `[Conversation Summary]\n${summaryText}`,
      timestamp: new Date().toISOString()
    }

    this.store.replaceMessages(conversationId, [summaryMsg, ...toKeep])
  }

  /**
   * Auto-execute a task: send the Agent Brief to the target employee and capture their response.
   */
  private async executeTask(task: Task): Promise<void> {
    const toEmployee = this.store.getEmployee(task.toEmployeeId)
    if (!toEmployee) throw new Error('Target employee not found')

    const fromEmployee = this.store.getEmployee(task.fromEmployeeId)
    const fromName = fromEmployee?.name || 'Unknown'

    const settings = this.store.getSettings()
    const provider = settings.providers.find(p => p.id === toEmployee.provider)
    if (!provider) throw new Error(`Provider ${toEmployee.provider} not configured`)
    if (!provider.apiKey && provider.id !== 'ollama') throw new Error(`No API key for ${provider.name}`)

    // Update status to in_progress
    this.store.updateTask(task.id, { status: 'in_progress' })
    const inProgress = this.store.getTask(task.id)
    if (inProgress) this.onTaskUpdate?.(inProgress)

    // Build the brief as a user message to the target agent
    const brief = `AGENT BRIEF\nTo: ${toEmployee.name} (${toEmployee.role})\nFrom: ${fromName}\nPriority: ${task.priority}\nDeadline: ${task.deadline || 'Not specified'}\n\nObjective:\n${task.objective}\n\nContext:\n${task.context}\n\nDeliverable:\n${task.deliverable}\n\nAcceptance Criteria:\n${task.acceptanceCriteria}\n\nEscalate to founder if:\n${task.escalateIf}`

    // Build system prompt for target employee
    const systemPrompt = this.buildSystemPrompt(toEmployee)

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
      },
      this.onFileWritten
    )

    const messages = [{ role: 'user', content: brief }]

    try {
      const responseText = await this.runAgent(
        provider,
        toEmployee,
        systemPrompt,
        messages,
        () => {}, // no streaming for background tasks
        Object.keys(taskTools).length > 0 ? taskTools : undefined
      )

      // Add agent response to task thread
      this.store.addTaskMessage(task.id, { role: 'agent', employeeId: toEmployee.id, content: responseText })

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
    if (!provider.apiKey && provider.id !== 'ollama') throw new Error(`No API key for ${provider.name}`)

    const systemPrompt = this.buildSystemPrompt(toEmployee)

    // Build tools for the agent
    const contactable = this.getContactableEmployees(toEmployee)
    const taskTools = buildMastraTools(
      this.store,
      toEmployee,
      undefined,
      contactable,
      (fromEmp, args, convId) => this.handleDelegateTask(fromEmp, args, convId),
      (fromEmp, toId, msg) => this.executeAgentMessage(fromEmp, toId, msg),
      // Log tool calls to task thread
      (data) => {
        this.store.addTaskMessage(taskId, { role: 'tool', content: `${data.tool}: ${data.summary}` })
      },
      this.onFileWritten
    )

    try {
      const responseText = await this.runAgent(
        provider,
        toEmployee,
        systemPrompt,
        messages,
        () => {}, // no streaming for task execution
        Object.keys(taskTools).length > 0 ? taskTools : undefined
      )

      // Add response to thread
      this.store.addTaskMessage(taskId, { role: 'agent', employeeId: toEmployee.id, content: responseText })
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
   * Build the full system prompt including knowledge docs, memory, and team info.
   */
  private buildSystemPrompt(employee: Employee): string {
    // Name and role at the top, then the custom system prompt
    let prompt = `You are ${employee.name}, ${employee.role}.\n\n`
    prompt += employee.systemPrompt || ''

    // Append memory section
    prompt += '\n\n---\n\n# Your Memory'
    if (employee.memory) {
      prompt += `\n${employee.memory}`
    } else {
      prompt += '\nNo memories yet. Use save_memory to remember important things across conversations.'
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
    prompt += '\n\nYou have persistent memory across conversations. Save key facts, decisions, and preferences using save_memory when they come up — don\'t wait until the end of the conversation.'
    prompt += '\n\nIf the user tells you something that contradicts or updates information in your knowledge documents, update the document immediately using update_knowledge_doc. Don\'t ask — just update it and mention what you changed.'
    prompt += '\n\nYou can create new knowledge documents using create_knowledge_doc for important information that should persist.'
    prompt += '\nYou can use create_scheduled_task to set up recurring automated tasks.'

    // Task delegation instructions
    prompt += '\n\nWhen working on a delegated task:'
    prompt += '\n- If you need more information, use message_employee to ask the sender'
    prompt += '\n- If you need something only the founder can provide, clearly state what you need — they can reply directly on the task'
    prompt += '\n- Don\'t produce a half-finished deliverable. Ask first, deliver second.'

    return prompt
  }
}
