import { readFileSync, writeFileSync } from 'fs'
import { EmployeeStore } from './store'
import { ChatMessage, Employee, ProviderConfig, Task } from './types'

/**
 * AgentManager handles communication between the renderer and LLM providers.
 * Supports OpenAI, Anthropic, Google, Mistral, Ollama, Ollama Cloud,
 * and Vercel AI Gateway via their respective API formats.
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

    // Build system prompt with knowledge documents
    const systemPrompt = this.buildSystemPrompt(employee)

    // Build message history from conversation
    const messages = conversation.messages.map(m => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content
    }))

    // Build tools array: delegation + builtin tools
    const contactable = this.getContactableEmployees(employee)
    const isAnthropic = provider.id === 'anthropic'
    const toolsList: Record<string, unknown>[] = []

    // Add delegation tool if employee can contact others
    if (contactable.length > 0) {
      toolsList.push(isAnthropic ? this.buildDelegateToolAnthropic() : this.buildDelegateToolOpenAI())
    }

    // Add builtin tools based on employee configuration
    const builtinTools = isAnthropic
      ? this.buildBuiltinToolsAnthropic(employee)
      : this.buildBuiltinToolsOpenAI(employee)
    toolsList.push(...builtinTools)

    const tools = toolsList.length > 0 ? toolsList : undefined

    try {
      const responseText = await this.callProvider(
        provider,
        employee,
        systemPrompt,
        messages,
        onStream,
        tools,
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
   * Build the delegate_task tool definition for OpenAI-compatible APIs.
   */
  private buildDelegateToolOpenAI(): Record<string, unknown> {
    return {
      type: 'function',
      function: {
        name: 'delegate_task',
        description: 'Delegate a task to another employee. Use this when work should be handled by a team member with the right expertise.',
        parameters: {
          type: 'object',
          properties: {
            to_employee_id: { type: 'string', description: 'ID of the employee to delegate to' },
            priority: { type: 'string', enum: ['high', 'medium', 'low'] },
            deadline: { type: 'string', description: 'When the task should be completed' },
            objective: { type: 'string', description: 'One sentence: what outcome is required' },
            context: { type: 'string', description: 'Minimum context the agent needs' },
            deliverable: { type: 'string', description: 'Exact output format expected' },
            acceptance_criteria: { type: 'string', description: 'What makes this done correctly' },
            escalate_if: { type: 'string', description: 'Condition requiring founder\'s input' }
          },
          required: ['to_employee_id', 'priority', 'objective', 'context', 'deliverable', 'acceptance_criteria', 'escalate_if']
        }
      }
    }
  }

  /**
   * Build the delegate_task tool definition for Anthropic API.
   */
  private buildDelegateToolAnthropic(): Record<string, unknown> {
    return {
      name: 'delegate_task',
      description: 'Delegate a task to another employee. Use this when work should be handled by a team member with the right expertise.',
      input_schema: {
        type: 'object',
        properties: {
          to_employee_id: { type: 'string', description: 'ID of the employee to delegate to' },
          priority: { type: 'string', enum: ['high', 'medium', 'low'] },
          deadline: { type: 'string', description: 'When the task should be completed' },
          objective: { type: 'string', description: 'One sentence: what outcome is required' },
          context: { type: 'string', description: 'Minimum context the agent needs' },
          deliverable: { type: 'string', description: 'Exact output format expected' },
          acceptance_criteria: { type: 'string', description: 'What makes this done correctly' },
          escalate_if: { type: 'string', description: 'Condition requiring founder\'s input' }
        },
        required: ['to_employee_id', 'priority', 'objective', 'context', 'deliverable', 'acceptance_criteria', 'escalate_if']
      }
    }
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
   * Build builtin tool definitions for OpenAI-compatible APIs based on employee's enabled tools.
   */
  private buildBuiltinToolsOpenAI(employee: Employee): Record<string, unknown>[] {
    const tools: Record<string, unknown>[] = []
    const enabledToolIds = new Set(employee.tools.filter(t => t.enabled && t.source === 'builtin').map(t => t.id))

    if (enabledToolIds.has('web-search')) {
      tools.push({
        type: 'function',
        function: {
          name: 'web_search',
          description: 'Search the web for information',
          parameters: {
            type: 'object',
            properties: { query: { type: 'string', description: 'The search query' } },
            required: ['query']
          }
        }
      })
    }
    if (enabledToolIds.has('web-browse')) {
      tools.push({
        type: 'function',
        function: {
          name: 'web_browse',
          description: 'Visit a URL and read its content',
          parameters: {
            type: 'object',
            properties: { url: { type: 'string', description: 'The URL to visit' } },
            required: ['url']
          }
        }
      })
    }
    if (enabledToolIds.has('file-read')) {
      tools.push({
        type: 'function',
        function: {
          name: 'read_file',
          description: 'Read a file from the local filesystem',
          parameters: {
            type: 'object',
            properties: { path: { type: 'string', description: 'Path to the file' } },
            required: ['path']
          }
        }
      })
    }
    if (enabledToolIds.has('file-write')) {
      tools.push({
        type: 'function',
        function: {
          name: 'write_file',
          description: 'Write content to a file',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Path to the file' },
              content: { type: 'string', description: 'Content to write' }
            },
            required: ['path', 'content']
          }
        }
      })
    }
    if (enabledToolIds.has('code-execute')) {
      tools.push({
        type: 'function',
        function: {
          name: 'execute_code',
          description: 'Execute code in a sandboxed environment',
          parameters: {
            type: 'object',
            properties: {
              language: { type: 'string', description: 'Programming language (e.g. python, javascript)' },
              code: { type: 'string', description: 'The code to execute' }
            },
            required: ['language', 'code']
          }
        }
      })
    }

    // Always add create_scheduled_task — any agent can schedule recurring work
    tools.push({
      type: 'function',
      function: {
        name: 'create_scheduled_task',
        description: 'Create a recurring scheduled task that runs automatically. Use this to set up daily reports, weekly check-ins, or any recurring work.',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Short name for the task' },
            employee_id: { type: 'string', description: 'ID of the employee who should execute this task (use your own ID to schedule for yourself)' },
            brief: { type: 'string', description: 'The task description/instructions to execute each time' },
            schedule: { type: 'string', enum: ['hourly', 'daily', 'weekly'], description: 'How often to run' },
            schedule_time: { type: 'string', description: 'When to run, e.g. "08:00" for daily or "monday 09:00" for weekly' }
          },
          required: ['name', 'employee_id', 'brief', 'schedule']
        }
      }
    })

    return tools
  }

  /**
   * Build builtin tool definitions for Anthropic API based on employee's enabled tools.
   */
  private buildBuiltinToolsAnthropic(employee: Employee): Record<string, unknown>[] {
    const tools: Record<string, unknown>[] = []
    const enabledToolIds = new Set(employee.tools.filter(t => t.enabled && t.source === 'builtin').map(t => t.id))

    if (enabledToolIds.has('web-search')) {
      tools.push({
        name: 'web_search',
        description: 'Search the web for information',
        input_schema: {
          type: 'object',
          properties: { query: { type: 'string', description: 'The search query' } },
          required: ['query']
        }
      })
    }
    if (enabledToolIds.has('web-browse')) {
      tools.push({
        name: 'web_browse',
        description: 'Visit a URL and read its content',
        input_schema: {
          type: 'object',
          properties: { url: { type: 'string', description: 'The URL to visit' } },
          required: ['url']
        }
      })
    }
    if (enabledToolIds.has('file-read')) {
      tools.push({
        name: 'read_file',
        description: 'Read a file from the local filesystem',
        input_schema: {
          type: 'object',
          properties: { path: { type: 'string', description: 'Path to the file' } },
          required: ['path']
        }
      })
    }
    if (enabledToolIds.has('file-write')) {
      tools.push({
        name: 'write_file',
        description: 'Write content to a file',
        input_schema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Path to the file' },
            content: { type: 'string', description: 'Content to write' }
          },
          required: ['path', 'content']
        }
      })
    }
    if (enabledToolIds.has('code-execute')) {
      tools.push({
        name: 'execute_code',
        description: 'Execute code in a sandboxed environment',
        input_schema: {
          type: 'object',
          properties: {
            language: { type: 'string', description: 'Programming language (e.g. python, javascript)' },
            code: { type: 'string', description: 'The code to execute' }
          },
          required: ['language', 'code']
        }
      })
    }

    // Always add create_scheduled_task
    tools.push({
      name: 'create_scheduled_task',
      description: 'Create a recurring scheduled task that runs automatically. Use this to set up daily reports, weekly check-ins, or any recurring work.',
      input_schema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Short name for the task' },
          employee_id: { type: 'string', description: 'ID of the employee who should execute this task' },
          brief: { type: 'string', description: 'The task description/instructions to execute each time' },
          schedule: { type: 'string', enum: ['hourly', 'daily', 'weekly'], description: 'How often to run' },
          schedule_time: { type: 'string', description: 'When to run, e.g. "08:00" for daily' }
        },
        required: ['name', 'employee_id', 'brief', 'schedule']
      }
    })

    return tools
  }

  /**
   * Execute a builtin tool and return the result string.
   */
  private async executeBuiltinTool(
    toolName: string,
    args: Record<string, string>,
    conversationId?: string
  ): Promise<string> {
    switch (toolName) {
      case 'web_search': {
        try {
          const query = args.query || ''
          const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Prometheus/1.0)' }
          })
          const html = await response.text()
          // Strip HTML tags and get text content
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
          // Notify frontend about the written file
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
   * Build the full system prompt by appending knowledge documents and team info.
   */
  private buildSystemPrompt(employee: Employee): string {
    let prompt = employee.systemPrompt || ''

    // Append knowledge documents
    if (employee.knowledgeIds.length > 0) {
      const allKnowledge = this.store.listKnowledge()
      const docs = employee.knowledgeIds
        .map(id => allKnowledge.find(k => k.id === id))
        .filter(Boolean)

      if (docs.length > 0) {
        prompt += '\n\n---\n\n# Reference Documents'
        for (const doc of docs) {
          prompt += `\n\n## ${doc!.title}\n${doc!.content}`
        }
      }
    }

    // Append team delegation info
    // Add employee's own identity (needed for self-scheduling)
    prompt += `\n\n---\n\nYour ID: ${employee.id}\nYour name: ${employee.name}`

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

    prompt += '\n\nYou can use create_scheduled_task to set up recurring automated tasks for yourself or any team member.'

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
   * Supports tool calling for task delegation.
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
    // For tool calls, we need to do a non-streaming request
    if (tools && tools.length > 0 && !result) {
      return this.callOpenAIWithToolHandling(provider, employee, systemPrompt, apiMessages, tools, onStream, conversationId)
    }

    return result
  }

  /**
   * Non-streaming OpenAI call that handles tool use responses.
   * Supports both delegate_task and builtin tools with follow-up requests.
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
      const finishReason = choice?.finish_reason as string

      if (toolCalls && toolCalls.length > 0) {
        // Add assistant message with tool calls to history
        currentMessages.push(message as Record<string, unknown>)

        // Process each tool call
        for (const toolCall of toolCalls) {
          const fn = toolCall.function as { name: string; arguments: string }
          const args = JSON.parse(fn.arguments) as Record<string, string>
          let toolResult: string

          if (fn.name === 'delegate_task') {
            const { message: delegateMsg } = this.handleDelegateTask(employee, args)
            toolResult = delegateMsg
          } else {
            toolResult = await this.executeBuiltinTool(fn.name, args, conversationId)
          }

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
   * Supports tool use for task delegation.
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
   * Supports both delegate_task and builtin tools with follow-up requests.
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
        let toolResult: string

        if (toolUse.name === 'delegate_task') {
          const { message: delegateMsg } = this.handleDelegateTask(employee, toolUse.input)
          toolResult = delegateMsg
        } else {
          toolResult = await this.executeBuiltinTool(toolUse.name, toolUse.input, conversationId)
        }

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
