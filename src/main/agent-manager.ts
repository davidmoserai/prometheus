import { readFileSync, writeFileSync } from 'fs'
import { Agent } from '@mastra/core/agent'
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { EmployeeStore } from './store'
import { ChatMessage, Employee, ProviderConfig, Task } from './types'

// ============================================================
// Mastra model string/object builders
// ============================================================

type MastraModel = string | { id: string; url: string; apiKey?: string; headers?: Record<string, string> }

/**
 * Map our provider + model config to a Mastra-compatible model reference.
 * Inline objects are used so we never pollute process.env with API keys.
 */
function buildModelRef(provider: ProviderConfig, model: string): MastraModel {
  switch (provider.id) {
    case 'vercel-ai-gateway':
      // Model strings already have format "anthropic/claude-sonnet-4.6"
      // Vercel gateway uses "vercel/{provider}/{model}"
      return {
        id: `vercel/${model}`,
        url: provider.baseUrl || 'https://ai-gateway.vercel.sh/v1',
        apiKey: provider.apiKey
      }

    case 'openai':
      return {
        id: `openai/${model}`,
        url: 'https://api.openai.com/v1',
        apiKey: provider.apiKey
      }

    case 'anthropic':
      return {
        id: `anthropic/${model}`,
        url: 'https://api.anthropic.com/v1',
        apiKey: provider.apiKey
      }

    case 'google':
      return {
        id: `google/${model}`,
        url: 'https://generativelanguage.googleapis.com/v1beta/openai',
        apiKey: provider.apiKey,
        headers: { 'x-goog-api-key': provider.apiKey }
      }

    case 'mistral':
      return {
        id: `mistral/${model}`,
        url: 'https://api.mistral.ai/v1',
        apiKey: provider.apiKey
      }

    case 'ollama':
      return {
        id: `ollama/${model}`,
        url: (provider.baseUrl || 'http://localhost:11434') + '/v1',
        apiKey: 'not-needed'
      }

    case 'ollama-cloud':
      return {
        id: `ollama-cloud/${model}`,
        url: (provider.baseUrl || 'https://ollama.com/api').replace(/\/api$/, '') + '/v1',
        apiKey: provider.apiKey
      }

    default:
      return {
        id: model,
        url: provider.baseUrl || 'https://api.openai.com/v1',
        apiKey: provider.apiKey
      }
  }
}

/**
 * Build provider-specific options for caching and zero data retention.
 */
function buildProviderOptions(provider: ProviderConfig): Record<string, unknown> | undefined {
  switch (provider.id) {
    case 'vercel-ai-gateway':
      return {
        gateway: { caching: 'auto', zeroDataRetention: true }
      }
    case 'anthropic':
      return {
        anthropic: { cacheControl: { type: 'ephemeral' } }
      }
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
  onDelegateTask: (fromEmployee: Employee, args: Record<string, string>) => { task: Task; message: string },
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
        const { message } = onDelegateTask(employee, input as Record<string, string>)
        return { result: message }
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
      const doc = store.createKnowledge({
        title: input.title,
        content: input.content,
        tags: input.tags || [],
        lastVerifiedAt: null,
        docType: 'living',
        reviewIntervalDays: null
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
      employee_id: z.string().describe('ID of the employee who should execute this task (use your own ID to schedule for yourself)'),
      brief: z.string().describe('The task description/instructions to execute each time'),
      schedule: z.enum(['hourly', 'daily', 'weekly']).describe('How often to run'),
      schedule_time: z.string().optional().describe('When to run, e.g. "08:00" for daily or "monday 09:00" for weekly')
    }),
    execute: async (input) => {
      try {
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
          employeeId: input.employee_id,
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
    const tools = buildMastraTools(
      this.store,
      employee,
      conversationId,
      contactable,
      (fromEmp, args) => this.handleDelegateTask(fromEmp, args),
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
    const providerOptions = buildProviderOptions(provider)

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
    args: Record<string, string>
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
      status: 'pending'
    })

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

    // Send to LLM (no tools for task execution — just get the response)
    const messages = [{ role: 'user', content: brief }]

    const responseText = await this.runAgent(
      provider,
      toEmployee,
      systemPrompt,
      messages,
      () => {}, // no streaming for background tasks
      undefined  // no tools
    )

    // Save response and mark completed
    this.store.updateTask(task.id, {
      status: 'completed',
      response: responseText
    })

    const completed = this.store.getTask(task.id)
    if (completed) this.onTaskUpdate?.(completed)
  }

  /**
   * Build the full system prompt including knowledge docs, memory, and team info.
   */
  private buildSystemPrompt(employee: Employee): string {
    let prompt = employee.systemPrompt || ''

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

    // Append employee identity
    prompt += `\n\n---\n\nYour ID: ${employee.id}\nYour name: ${employee.name}`

    // Append team delegation info
    const contactable = this.getContactableEmployees(employee)
    if (contactable.length > 0) {
      const departments = this.store.listDepartments()
      prompt += '\n\n## Your Team\nYou can delegate tasks to these team members:\n'
      for (const e of contactable) {
        const dept = departments.find(d => d.id === e.departmentId)
        const deptLabel = dept ? ` — ${dept.name}` : ''
        prompt += `- ${e.name} (${e.role}${deptLabel}) [ID: ${e.id}]\n`
      }
      prompt += '\nUse the delegate_task tool when work should be handled by someone else.'
    }

    // Memory and knowledge instructions
    prompt += '\n\nYou have persistent memory across conversations. Before finishing important conversations, save key facts, decisions, and preferences using save_memory.'
    prompt += '\nYou can create and update knowledge documents using create_knowledge_doc and update_knowledge_doc.'
    prompt += '\nYou can use create_scheduled_task to set up recurring automated tasks for yourself or any team member.'

    return prompt
  }
}
