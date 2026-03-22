import { readFileSync, writeFileSync } from 'fs'
import { EmployeeStore } from './store'
import { ChatMessage, Employee, ProviderConfig, Task } from './types'
import { z, ZodObject, ZodRawShape } from 'zod'

/**
 * Unified tool definition — define once, generate both OpenAI and Anthropic formats.
 */
interface ToolDef {
  name: string
  description: string
  schema: ZodObject<ZodRawShape>
  required: string[]
}

/**
 * Convert a Zod schema to JSON Schema properties for API tool definitions.
 */
function zodToJsonProperties(schema: ZodObject<ZodRawShape>): {
  properties: Record<string, unknown>
} {
  const shape = schema.shape
  const properties: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(shape)) {
    const zodType = value as z.ZodTypeAny
    const desc = zodType._def?.description || ''

    if (zodType instanceof z.ZodString) {
      properties[key] = { type: 'string', ...(desc ? { description: desc } : {}) }
    } else if (zodType instanceof z.ZodNumber) {
      properties[key] = { type: 'number', ...(desc ? { description: desc } : {}) }
    } else if (zodType instanceof z.ZodBoolean) {
      properties[key] = { type: 'boolean', ...(desc ? { description: desc } : {}) }
    } else if (zodType instanceof z.ZodEnum) {
      properties[key] = { type: 'string', enum: zodType._def.values, ...(desc ? { description: desc } : {}) }
    } else if (zodType instanceof z.ZodArray) {
      properties[key] = { type: 'array', items: { type: 'string' }, ...(desc ? { description: desc } : {}) }
    } else if (zodType instanceof z.ZodOptional) {
      // Unwrap optional and recurse
      const inner = zodType._def.innerType as z.ZodTypeAny
      if (inner instanceof z.ZodString) {
        properties[key] = { type: 'string', ...(desc || inner._def?.description ? { description: desc || inner._def?.description } : {}) }
      } else if (inner instanceof z.ZodArray) {
        properties[key] = { type: 'array', items: { type: 'string' }, ...(desc || inner._def?.description ? { description: desc || inner._def?.description } : {}) }
      } else {
        properties[key] = { type: 'string', ...(desc ? { description: desc } : {}) }
      }
    } else {
      properties[key] = { type: 'string', ...(desc ? { description: desc } : {}) }
    }
  }

  return { properties }
}

/**
 * Convert a ToolDef to OpenAI function calling format.
 */
function toOpenAITool(def: ToolDef): Record<string, unknown> {
  const { properties } = zodToJsonProperties(def.schema)
  return {
    type: 'function',
    function: {
      name: def.name,
      description: def.description,
      parameters: {
        type: 'object',
        properties,
        required: def.required
      }
    }
  }
}

/**
 * Convert a ToolDef to Anthropic tool format.
 */
function toAnthropicTool(def: ToolDef): Record<string, unknown> {
  const { properties } = zodToJsonProperties(def.schema)
  return {
    name: def.name,
    description: def.description,
    input_schema: {
      type: 'object',
      properties,
      required: def.required
    }
  }
}

// ============================================================
// Tool Schema Definitions (defined once with Zod)
// ============================================================

const delegateTaskSchema = z.object({
  to_employee_id: z.string().describe('ID of the employee to delegate to'),
  priority: z.enum(['high', 'medium', 'low']),
  deadline: z.string().describe('When the task should be completed'),
  objective: z.string().describe('One sentence: what outcome is required'),
  context: z.string().describe('Minimum context the agent needs'),
  deliverable: z.string().describe('Exact output format expected'),
  acceptance_criteria: z.string().describe('What makes this done correctly'),
  escalate_if: z.string().describe("Condition requiring founder's input")
})

const saveMemorySchema = z.object({
  content: z.string().describe('Your full updated memory (replaces previous). Include all facts you want to remember.')
})

const createKnowledgeDocSchema = z.object({
  title: z.string().describe('Title for the knowledge document'),
  content: z.string().describe('The document content'),
  tags: z.array(z.string()).optional().describe('Tags for categorization')
})

const updateKnowledgeDocSchema = z.object({
  doc_id: z.string().describe('ID of the document to update'),
  content: z.string().describe('New content for the document')
})

const webSearchSchema = z.object({
  query: z.string().describe('The search query')
})

const webBrowseSchema = z.object({
  url: z.string().describe('The URL to visit')
})

const readFileSchema = z.object({
  path: z.string().describe('Path to the file')
})

const writeFileSchema = z.object({
  path: z.string().describe('Path to the file'),
  content: z.string().describe('Content to write')
})

const executeCodeSchema = z.object({
  language: z.string().describe('Programming language (e.g. python, javascript)'),
  code: z.string().describe('The code to execute')
})

const createScheduledTaskSchema = z.object({
  name: z.string().describe('Short name for the task'),
  employee_id: z.string().describe('ID of the employee who should execute this task (use your own ID to schedule for yourself)'),
  brief: z.string().describe('The task description/instructions to execute each time'),
  schedule: z.enum(['hourly', 'daily', 'weekly']).describe('How often to run'),
  schedule_time: z.string().optional().describe('When to run, e.g. "08:00" for daily or "monday 09:00" for weekly')
})

// Build ToolDef objects
const TOOL_DEFS: Record<string, ToolDef> = {
  delegate_task: {
    name: 'delegate_task',
    description: 'Delegate a task to another employee. Use this when work should be handled by a team member with the right expertise.',
    schema: delegateTaskSchema,
    required: ['to_employee_id', 'priority', 'objective', 'context', 'deliverable', 'acceptance_criteria', 'escalate_if']
  },
  save_memory: {
    name: 'save_memory',
    description: 'Save important facts, decisions, and preferences to your persistent memory. Your memory persists across conversations. Pass the full updated memory content — it replaces your previous memory entirely.',
    schema: saveMemorySchema,
    required: ['content']
  },
  create_knowledge_doc: {
    name: 'create_knowledge_doc',
    description: 'Create a new knowledge document that you and other employees can reference. Use this for important information that should be shared.',
    schema: createKnowledgeDocSchema,
    required: ['title', 'content']
  },
  update_knowledge_doc: {
    name: 'update_knowledge_doc',
    description: 'Update the content of an existing knowledge document by its ID.',
    schema: updateKnowledgeDocSchema,
    required: ['doc_id', 'content']
  },
  web_search: {
    name: 'web_search',
    description: 'Search the web for information',
    schema: webSearchSchema,
    required: ['query']
  },
  web_browse: {
    name: 'web_browse',
    description: 'Visit a URL and read its content',
    schema: webBrowseSchema,
    required: ['url']
  },
  read_file: {
    name: 'read_file',
    description: 'Read a file from the local filesystem',
    schema: readFileSchema,
    required: ['path']
  },
  write_file: {
    name: 'write_file',
    description: 'Write content to a file',
    schema: writeFileSchema,
    required: ['path', 'content']
  },
  execute_code: {
    name: 'execute_code',
    description: 'Execute code in a sandboxed environment',
    schema: executeCodeSchema,
    required: ['language', 'code']
  },
  create_scheduled_task: {
    name: 'create_scheduled_task',
    description: 'Create a recurring scheduled task that runs automatically. Use this to set up daily reports, weekly check-ins, or any recurring work.',
    schema: createScheduledTaskSchema,
    required: ['name', 'employee_id', 'brief', 'schedule']
  }
}

/**
 * AgentManager handles communication between the renderer and LLM providers.
 * Uses unified Zod-based tool definitions with provider-specific API routing.
 * Supports OpenAI, Anthropic, Google, Mistral, Ollama, Ollama Cloud,
 * and Vercel AI Gateway.
 */
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
      const msg = this.store.addMessage(conversationId, {
        role: 'assistant',
        content: errorMsg
      })
      onStream(errorMsg)
      return msg
    }

    if (!provider) {
      const errorMsg = `Provider "${employee.provider}" not found. Check your settings.`
      const msg = this.store.addMessage(conversationId, {
        role: 'assistant',
        content: errorMsg
      })
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

    // Build unified tools list
    const contactable = this.getContactableEmployees(employee)
    const isAnthropic = provider.id === 'anthropic'
    const toolDefs = this.buildToolDefs(employee, contactable.length > 0)
    const tools = toolDefs.map(def => isAnthropic ? toAnthropicTool(def) : toOpenAITool(def))
    const toolsParam = tools.length > 0 ? tools : undefined

    try {
      const responseText = await this.callProvider(
        provider,
        employee,
        systemPrompt,
        messages,
        onStream,
        toolsParam,
        conversationId
      )

      const msg = this.store.addMessage(conversationId, {
        role: 'assistant',
        content: responseText
      })
      return msg
    } catch (error) {
      const errorMsg = `Failed to get response: ${error instanceof Error ? error.message : 'Unknown error'}. Check your API key and model settings.`
      const msg = this.store.addMessage(conversationId, {
        role: 'assistant',
        content: errorMsg
      })
      onStream(errorMsg)
      return msg
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
   * Build the list of ToolDef objects for an employee based on their configuration.
   * Unified — no more dual OpenAI/Anthropic definitions.
   */
  private buildToolDefs(employee: Employee, canDelegate: boolean): ToolDef[] {
    const defs: ToolDef[] = []
    const enabledToolIds = new Set(employee.tools.filter(t => t.enabled && t.source === 'builtin').map(t => t.id))

    // Delegation tool (only if employee can contact others)
    if (canDelegate) {
      defs.push(TOOL_DEFS.delegate_task)
    }

    // Memory tools — always available
    defs.push(TOOL_DEFS.save_memory)
    defs.push(TOOL_DEFS.create_knowledge_doc)
    defs.push(TOOL_DEFS.update_knowledge_doc)

    // Builtin tools based on employee configuration
    if (enabledToolIds.has('web-search')) defs.push(TOOL_DEFS.web_search)
    if (enabledToolIds.has('web-browse')) defs.push(TOOL_DEFS.web_browse)
    if (enabledToolIds.has('file-read')) defs.push(TOOL_DEFS.read_file)
    if (enabledToolIds.has('file-write')) defs.push(TOOL_DEFS.write_file)
    if (enabledToolIds.has('code-execute')) defs.push(TOOL_DEFS.execute_code)

    // Scheduled tasks — always available
    defs.push(TOOL_DEFS.create_scheduled_task)

    return defs
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
   * Execute a tool and return the result string.
   * Handles all tools: delegation, memory, knowledge, builtin, and scheduled tasks.
   */
  private async executeTool(
    toolName: string,
    args: Record<string, string>,
    employee: Employee,
    conversationId?: string
  ): Promise<string> {
    switch (toolName) {
      case 'delegate_task': {
        const { message } = this.handleDelegateTask(employee, args)
        return message
      }
      case 'save_memory': {
        const content = args.content || ''
        this.store.updateEmployeeMemory(employee.id, content)
        return 'Memory saved successfully. Your updated memory will be included in future conversations.'
      }
      case 'create_knowledge_doc': {
        const title = args.title || 'Untitled Document'
        const content = args.content || ''
        let tags: string[] = []
        try {
          tags = args.tags ? JSON.parse(args.tags) : []
        } catch {
          tags = args.tags ? [args.tags] : []
        }

        const doc = this.store.createKnowledge({
          title,
          content,
          tags,
          lastVerifiedAt: null,
          docType: 'living',
          reviewIntervalDays: null
        })

        // Auto-assign to this employee
        const emp = this.store.getEmployee(employee.id)
        if (emp) {
          this.store.updateEmployee(employee.id, {
            knowledgeIds: [...emp.knowledgeIds, doc.id]
          })
        }

        return `Knowledge document "${title}" created (ID: ${doc.id}) and assigned to you. Other employees can also be assigned this document.`
      }
      case 'update_knowledge_doc': {
        const docId = args.doc_id || ''
        const content = args.content || ''
        const updated = this.store.updateKnowledge(docId, { content })
        if (!updated) return `Document with ID "${docId}" not found.`
        return `Document "${updated.title}" updated successfully.`
      }
      case 'web_search': {
        try {
          const query = args.query || ''
          const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Prometheus/1.0)' }
          })
          const html = await response.text()
          const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
          return text.slice(0, 5000) || `Web search executed for: ${query}`
        } catch {
          return `Web search executed for: ${args.query}. (Could not fetch results — check network connection.)`
        }
      }
      case 'web_browse': {
        try {
          const url = args.url || ''
          const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Prometheus/1.0)' }
          })
          const html = await response.text()
          const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
          return text.slice(0, 5000)
        } catch (err) {
          return `Failed to browse ${args.url}: ${err instanceof Error ? err.message : 'Unknown error'}`
        }
      }
      case 'read_file': {
        try {
          const content = readFileSync(args.path, 'utf-8')
          return content.slice(0, 10000)
        } catch (err) {
          return `Failed to read file ${args.path}: ${err instanceof Error ? err.message : 'Unknown error'}`
        }
      }
      case 'write_file': {
        try {
          writeFileSync(args.path, args.content)
          if (conversationId) {
            this.onFileWritten?.({ conversationId, path: args.path, content: args.content })
          }
          return `File written successfully to ${args.path} (${args.content.length} bytes)`
        } catch (err) {
          return `Failed to write file ${args.path}: ${err instanceof Error ? err.message : 'Unknown error'}`
        }
      }
      case 'execute_code': {
        return `Code execution is not yet available in sandbox. Language: ${args.language}, Code length: ${args.code?.length || 0} chars.`
      }
      case 'create_scheduled_task': {
        try {
          const schedule = (args.schedule || 'daily') as 'hourly' | 'daily' | 'weekly'
          const now = new Date()
          let nextRunAt: Date

          if (schedule === 'hourly') {
            nextRunAt = new Date(now.getTime() + 60 * 60 * 1000)
          } else if (schedule === 'weekly') {
            nextRunAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
          } else {
            nextRunAt = new Date(now.getTime() + 24 * 60 * 60 * 1000)
          }

          const recurringTask = this.store.createRecurringTask({
            employeeId: args.employee_id || '',
            name: args.name || 'Scheduled Task',
            brief: args.brief || '',
            schedule,
            scheduleTime: args.schedule_time || undefined,
            enabled: true,
            lastRunAt: null,
            nextRunAt: nextRunAt.toISOString()
          })

          this.onTaskUpdate?.(recurringTask as unknown as Task)
          return `Scheduled task "${recurringTask.name}" created. Runs ${schedule}${args.schedule_time ? ` at ${args.schedule_time}` : ''}. Next run: ${nextRunAt.toLocaleString()}`
        } catch (err) {
          return `Failed to create scheduled task: ${err instanceof Error ? err.message : 'Unknown error'}`
        }
      }
      default:
        return `Unknown tool: ${toolName}`
    }
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

    // Call the LLM to get a summary
    const summaryText = await this.callProvider(
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

    const responseText = await this.callProvider(
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

  /**
   * Route API call to the correct provider format.
   */
  private async callProvider(
    provider: ProviderConfig,
    employee: Employee,
    systemPrompt: string,
    messages: { role: string; content: string }[],
    onStream: (chunk: string) => void,
    tools?: Record<string, unknown>[],
    conversationId?: string
  ): Promise<string> {
    const model = employee.model
    switch (provider.id) {
      case 'anthropic':
        return this.callAnthropic(provider, employee, systemPrompt, messages, onStream, tools, conversationId)
      case 'ollama':
        return this.callOllama(provider, model, systemPrompt, messages, onStream)
      case 'ollama-cloud':
        return this.callOllamaCloud(provider, model, systemPrompt, messages, onStream)
      case 'vercel-ai-gateway':
      case 'openai':
      case 'google':
      case 'mistral':
      default:
        return this.callOpenAICompatible(provider, employee, systemPrompt, messages, onStream, tools, conversationId)
    }
  }

  /**
   * Get the base URL for a provider.
   */
  private getBaseUrl(provider: ProviderConfig): string {
    if (provider.baseUrl) return provider.baseUrl

    switch (provider.id) {
      case 'openai':
        return 'https://api.openai.com/v1'
      case 'mistral':
        return 'https://api.mistral.ai/v1'
      case 'google':
        return 'https://generativelanguage.googleapis.com/v1beta/openai'
      case 'vercel-ai-gateway':
        return 'https://ai-gateway.vercel.sh/v1'
      default:
        return 'https://api.openai.com/v1'
    }
  }

  /**
   * OpenAI Chat Completions format — works for OpenAI, Vercel AI Gateway,
   * Mistral, and Google (via their OpenAI-compatible endpoint).
   * Supports tool calling for all tools.
   */
  private async callOpenAICompatible(
    provider: ProviderConfig,
    employee: Employee,
    systemPrompt: string,
    messages: { role: string; content: string }[],
    onStream: (chunk: string) => void,
    tools?: Record<string, unknown>[],
    conversationId?: string
  ): Promise<string> {
    const baseUrl = this.getBaseUrl(provider)
    const url = `${baseUrl}/chat/completions`
    const model = employee.model

    const apiMessages: Record<string, unknown>[] = [
      ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
      ...messages
    ]

    // Build request body
    const body: Record<string, unknown> = {
      model,
      messages: apiMessages,
      stream: true
    }

    // Add tools if available
    if (tools && tools.length > 0) {
      body.tools = tools
    }

    // Vercel AI Gateway: enable caching + native zero data retention
    if (provider.id === 'vercel-ai-gateway') {
      body.providerOptions = {
        gateway: {
          caching: 'auto',
          zeroDataRetention: true
        }
      }
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${provider.apiKey}`
    }

    // Google uses API key differently
    if (provider.id === 'google') {
      delete headers['Authorization']
      headers['x-goog-api-key'] = provider.apiKey
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      const errorBody = await response.text()
      throw new Error(`${provider.name} API error ${response.status}: ${errorBody}`)
    }

    const result = await this.parseSSEStream(response, onStream)

    // Check if the non-streaming fallback captured a tool call
    if (tools && tools.length > 0 && !result) {
      return this.callOpenAIWithToolHandling(provider, employee, systemPrompt, apiMessages, tools, onStream, conversationId)
    }

    return result
  }

  /**
   * Non-streaming OpenAI call that handles tool use responses.
   * Supports all tools with follow-up requests.
   */
  private async callOpenAIWithToolHandling(
    provider: ProviderConfig,
    employee: Employee,
    systemPrompt: string,
    apiMessages: Record<string, unknown>[],
    tools: Record<string, unknown>[],
    onStream: (chunk: string) => void,
    conversationId?: string
  ): Promise<string> {
    const baseUrl = this.getBaseUrl(provider)
    const url = `${baseUrl}/chat/completions`

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${provider.apiKey}`
    }

    if (provider.id === 'google') {
      delete headers['Authorization']
      headers['x-goog-api-key'] = provider.apiKey
    }

    // Loop to handle multiple tool call rounds
    let currentMessages = [...apiMessages]
    let maxRounds = 5

    while (maxRounds-- > 0) {
      const body: Record<string, unknown> = {
        model: employee.model,
        messages: currentMessages,
        stream: false,
        tools
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      })

      if (!response.ok) {
        const errorBody = await response.text()
        throw new Error(`${provider.name} API error ${response.status}: ${errorBody}`)
      }

      const json = await response.json() as Record<string, unknown>
      const choice = (json.choices as Record<string, unknown>[])?.[0]
      const message = choice?.message as Record<string, unknown> | undefined
      const toolCalls = message?.tool_calls as Record<string, unknown>[] | undefined
      const _finishReason = choice?.finish_reason as string

      if (toolCalls && toolCalls.length > 0) {
        // Add assistant message with tool calls to history
        currentMessages.push(message as Record<string, unknown>)

        // Process each tool call
        for (const toolCall of toolCalls) {
          const fn = toolCall.function as { name: string; arguments: string }
          const args = JSON.parse(fn.arguments) as Record<string, string>
          const toolResult = await this.executeTool(fn.name, args, employee, conversationId)

          // Add tool result to messages
          currentMessages.push({
            role: 'tool',
            tool_call_id: (toolCall as Record<string, unknown>).id,
            content: toolResult
          })
        }

        // Continue loop to get the next response
        continue
      }

      // No tool calls — return text response
      const text = (message?.content as string) || ''
      onStream(text)
      return text
    }

    // Safety fallback if max rounds exceeded
    const fallback = 'Reached maximum tool call rounds.'
    onStream(fallback)
    return fallback
  }

  /**
   * Anthropic Messages API — uses their native format with caching support.
   * Supports tool use for all tools.
   */
  private async callAnthropic(
    provider: ProviderConfig,
    employee: Employee,
    systemPrompt: string,
    messages: { role: string; content: string }[],
    onStream: (chunk: string) => void,
    tools?: Record<string, unknown>[],
    conversationId?: string
  ): Promise<string> {
    const baseUrl = provider.baseUrl || 'https://api.anthropic.com'
    const url = `${baseUrl}/v1/messages`
    const model = employee.model

    // Filter out system messages from the messages array (system is separate in Anthropic)
    const apiMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role, content: m.content }))

    // Build system with cache_control for prompt caching
    const system = systemPrompt
      ? [{ type: 'text' as const, text: systemPrompt, cache_control: { type: 'ephemeral' as const } }]
      : undefined

    const body: Record<string, unknown> = {
      model,
      max_tokens: 8192,
      stream: true,
      system,
      messages: apiMessages
    }

    // Add tools if available
    if (tools && tools.length > 0) {
      body.tools = tools
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': provider.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      const errorBody = await response.text()
      throw new Error(`Anthropic API error ${response.status}: ${errorBody}`)
    }

    const result = await this.parseAnthropicSSEStream(response, onStream)

    // If streaming didn't capture tool use, try non-streaming for tool handling
    if (tools && tools.length > 0 && !result) {
      return this.callAnthropicWithToolHandling(provider, employee, systemPrompt, apiMessages, tools, onStream, conversationId)
    }

    return result
  }

  /**
   * Non-streaming Anthropic call that handles tool use responses.
   * Supports all tools with follow-up requests.
   */
  private async callAnthropicWithToolHandling(
    provider: ProviderConfig,
    employee: Employee,
    systemPrompt: string,
    apiMessages: { role: string; content: string }[],
    tools: Record<string, unknown>[],
    onStream: (chunk: string) => void,
    conversationId?: string
  ): Promise<string> {
    const baseUrl = provider.baseUrl || 'https://api.anthropic.com'
    const url = `${baseUrl}/v1/messages`

    const system = systemPrompt
      ? [{ type: 'text' as const, text: systemPrompt, cache_control: { type: 'ephemeral' as const } }]
      : undefined

    const requestHeaders = {
      'Content-Type': 'application/json',
      'x-api-key': provider.apiKey,
      'anthropic-version': '2023-06-01'
    }

    // Messages can have mixed content types for Anthropic tool flow
    let currentMessages: Record<string, unknown>[] = apiMessages.map(m => ({ role: m.role, content: m.content }))
    let maxRounds = 5
    let accumulatedText = ''

    while (maxRounds-- > 0) {
      const body: Record<string, unknown> = {
        model: employee.model,
        max_tokens: 8192,
        stream: false,
        system,
        messages: currentMessages,
        tools
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify(body)
      })

      if (!response.ok) {
        const errorBody = await response.text()
        throw new Error(`Anthropic API error ${response.status}: ${errorBody}`)
      }

      const json = await response.json() as Record<string, unknown>
      const content = json.content as { type: string; id?: string; text?: string; name?: string; input?: Record<string, string> }[]
      const stopReason = json.stop_reason as string

      // Collect text and tool use blocks
      const toolUseBlocks: { id: string; name: string; input: Record<string, string> }[] = []
      for (const block of content) {
        if (block.type === 'text' && block.text) {
          accumulatedText += block.text
        }
        if (block.type === 'tool_use' && block.name && block.id) {
          toolUseBlocks.push({ id: block.id, name: block.name, input: block.input || {} })
        }
      }

      // If no tool use, we're done
      if (stopReason !== 'tool_use' || toolUseBlocks.length === 0) {
        break
      }

      // Add assistant response with tool_use to messages
      currentMessages.push({ role: 'assistant', content })

      // Process tool calls and build tool_result
      const toolResults: Record<string, unknown>[] = []
      for (const toolUse of toolUseBlocks) {
        const toolResult = await this.executeTool(toolUse.name, toolUse.input, employee, conversationId)

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: toolResult
        })
      }

      // Add user message with tool results
      currentMessages.push({ role: 'user', content: toolResults })
    }

    onStream(accumulatedText)
    return accumulatedText
  }

  /**
   * Ollama local API — /api/chat endpoint.
   */
  private async callOllama(
    provider: ProviderConfig,
    model: string,
    systemPrompt: string,
    messages: { role: string; content: string }[],
    onStream: (chunk: string) => void
  ): Promise<string> {
    const baseUrl = provider.baseUrl || 'http://localhost:11434'
    const url = `${baseUrl}/api/chat`

    const apiMessages = [
      ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
      ...messages
    ]

    // keep_alive keeps model + KV cache in memory for faster subsequent requests
    const body = {
      model,
      messages: apiMessages,
      stream: true,
      keep_alive: '30m'
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      const errorBody = await response.text()
      throw new Error(`Ollama API error ${response.status}: ${errorBody}`)
    }

    return this.parseOllamaStream(response, onStream)
  }

  /**
   * Ollama Cloud API — same format as Ollama but with Bearer auth.
   */
  private async callOllamaCloud(
    provider: ProviderConfig,
    model: string,
    systemPrompt: string,
    messages: { role: string; content: string }[],
    onStream: (chunk: string) => void
  ): Promise<string> {
    const baseUrl = provider.baseUrl || 'https://ollama.com/api'
    const url = `${baseUrl}/chat`

    const apiMessages = [
      ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
      ...messages
    ]

    const body = {
      model,
      messages: apiMessages,
      stream: true,
      keep_alive: '30m'
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${provider.apiKey}`
      },
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      const errorBody = await response.text()
      throw new Error(`Ollama Cloud API error ${response.status}: ${errorBody}`)
    }

    return this.parseOllamaStream(response, onStream)
  }

  /**
   * Parse OpenAI-compatible SSE stream (data: {...} lines).
   */
  private async parseSSEStream(
    response: Response,
    onStream: (chunk: string) => void
  ): Promise<string> {
    const reader = response.body?.getReader()
    if (!reader) throw new Error('No response body')

    const decoder = new TextDecoder()
    let accumulated = ''
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // Process complete lines
      const lines = buffer.split('\n')
      // Keep the last potentially incomplete line in the buffer
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith(':')) continue
        if (trimmed === 'data: [DONE]') continue

        if (trimmed.startsWith('data: ')) {
          try {
            const json = JSON.parse(trimmed.slice(6))
            const delta = json.choices?.[0]?.delta?.content
            if (delta) {
              accumulated += delta
              onStream(accumulated)
            }
          } catch {
            // Skip malformed JSON chunks
          }
        }
      }
    }

    return accumulated
  }

  /**
   * Parse Anthropic SSE stream (event: content_block_delta, etc.).
   */
  private async parseAnthropicSSEStream(
    response: Response,
    onStream: (chunk: string) => void
  ): Promise<string> {
    const reader = response.body?.getReader()
    if (!reader) throw new Error('No response body')

    const decoder = new TextDecoder()
    let accumulated = ''
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('event:')) continue

        if (trimmed.startsWith('data: ')) {
          try {
            const json = JSON.parse(trimmed.slice(6))

            // Handle content_block_delta events
            if (json.type === 'content_block_delta' && json.delta?.text) {
              accumulated += json.delta.text
              onStream(accumulated)
            }

            // Handle error events
            if (json.type === 'error') {
              throw new Error(json.error?.message || 'Anthropic stream error')
            }
          } catch (e) {
            if (e instanceof Error && e.message.includes('stream error')) throw e
            // Skip malformed JSON
          }
        }
      }
    }

    return accumulated
  }

  /**
   * Parse Ollama NDJSON stream (one JSON object per line).
   */
  private async parseOllamaStream(
    response: Response,
    onStream: (chunk: string) => void
  ): Promise<string> {
    const reader = response.body?.getReader()
    if (!reader) throw new Error('No response body')

    const decoder = new TextDecoder()
    let accumulated = ''
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue

        try {
          const json = JSON.parse(trimmed)
          if (json.message?.content) {
            accumulated += json.message.content
            onStream(accumulated)
          }
          if (json.error) {
            throw new Error(json.error)
          }
        } catch (e) {
          if (e instanceof Error && e.message !== 'Unexpected end of JSON input') throw e
        }
      }
    }

    return accumulated
  }
}
