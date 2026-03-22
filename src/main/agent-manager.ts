import { EmployeeStore } from './store'
import { ChatMessage, Employee, ProviderConfig, Task } from './types'

/**
 * AgentManager handles communication between the renderer and LLM providers.
 * Supports OpenAI, Anthropic, Google, Mistral, Ollama, Ollama Cloud,
 * and Vercel AI Gateway via their respective API formats.
 */
export class AgentManager {
  private store: EmployeeStore

  constructor(store: EmployeeStore) {
    this.store = store
  }

  async sendMessage(
    conversationId: string,
    content: string,
    onStream: (chunk: string) => void
  ): Promise<ChatMessage> {
    // Store user message
    this.store.addMessage(conversationId, { role: 'user', content })

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

    // Build tools array if employee can contact others
    const contactable = this.getContactableEmployees(employee)
    const tools = contactable.length > 0
      ? (provider.id === 'anthropic'
          ? [this.buildDelegateToolAnthropic()]
          : [this.buildDelegateToolOpenAI()])
      : undefined

    try {
      const responseText = await this.callProvider(
        provider,
        employee,
        systemPrompt,
        messages,
        onStream,
        tools
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
   * Handle a delegate_task tool call by creating a Task in the store.
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

    const message = `Task delegated to **${toName}** (${toEmployee?.role || 'unknown role'}).\n\n**Objective:** ${args.objective}\n**Priority:** ${args.priority}\n**Deadline:** ${args.deadline || 'Not specified'}`

    return { task, message }
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
    const contactable = this.getContactableEmployees(employee)
    if (contactable.length > 0) {
      const departments = this.store.listDepartments()
      prompt += '\n\n---\n\n## Your Team\nYou can delegate tasks to these team members:\n'
      for (const e of contactable) {
        const dept = departments.find(d => d.id === e.departmentId)
        const deptLabel = dept ? ` — ${dept.name}` : ''
        prompt += `- ${e.name} (${e.role}${deptLabel}) [ID: ${e.id}]\n`
      }
      prompt += '\nUse the delegate_task tool when work should be handled by someone else.'
    }

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
    tools?: Record<string, unknown>[]
  ): Promise<string> {
    const model = employee.model
    switch (provider.id) {
      case 'anthropic':
        return this.callAnthropic(provider, employee, systemPrompt, messages, onStream, tools)
      case 'ollama':
        return this.callOllama(provider, model, systemPrompt, messages, onStream)
      case 'ollama-cloud':
        return this.callOllamaCloud(provider, model, systemPrompt, messages, onStream)
      case 'vercel-ai-gateway':
      case 'openai':
      case 'google':
      case 'mistral':
      default:
        return this.callOpenAICompatible(provider, employee, systemPrompt, messages, onStream, tools)
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
    tools?: Record<string, unknown>[]
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
      return this.callOpenAIWithToolHandling(provider, employee, systemPrompt, apiMessages, tools, onStream)
    }

    return result
  }

  /**
   * Non-streaming OpenAI call that handles tool use responses.
   */
  private async callOpenAIWithToolHandling(
    provider: ProviderConfig,
    employee: Employee,
    systemPrompt: string,
    apiMessages: Record<string, unknown>[],
    tools: Record<string, unknown>[],
    onStream: (chunk: string) => void
  ): Promise<string> {
    const baseUrl = this.getBaseUrl(provider)
    const url = `${baseUrl}/chat/completions`

    const body: Record<string, unknown> = {
      model: employee.model,
      messages: apiMessages,
      stream: false,
      tools
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${provider.apiKey}`
    }

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

    const json = await response.json() as Record<string, unknown>
    const choice = (json.choices as Record<string, unknown>[])?.[0]
    const message = choice?.message as Record<string, unknown> | undefined
    const toolCalls = message?.tool_calls as Record<string, unknown>[] | undefined

    if (toolCalls && toolCalls.length > 0) {
      const toolCall = toolCalls[0]
      const fn = toolCall.function as { name: string; arguments: string }

      if (fn.name === 'delegate_task') {
        const args = JSON.parse(fn.arguments) as Record<string, string>
        const { message: delegateMsg } = this.handleDelegateTask(employee, args)
        const fullResponse = ((message?.content as string) || '') + '\n\n' + delegateMsg
        onStream(fullResponse)
        return fullResponse
      }
    }

    // Regular text response
    const text = (message?.content as string) || ''
    onStream(text)
    return text
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
    tools?: Record<string, unknown>[]
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
      return this.callAnthropicWithToolHandling(provider, employee, systemPrompt, apiMessages, tools, onStream)
    }

    return result
  }

  /**
   * Non-streaming Anthropic call that handles tool use responses.
   */
  private async callAnthropicWithToolHandling(
    provider: ProviderConfig,
    employee: Employee,
    systemPrompt: string,
    apiMessages: { role: string; content: string }[],
    tools: Record<string, unknown>[],
    onStream: (chunk: string) => void
  ): Promise<string> {
    const baseUrl = provider.baseUrl || 'https://api.anthropic.com'
    const url = `${baseUrl}/v1/messages`

    const system = systemPrompt
      ? [{ type: 'text' as const, text: systemPrompt, cache_control: { type: 'ephemeral' as const } }]
      : undefined

    const body: Record<string, unknown> = {
      model: employee.model,
      max_tokens: 8192,
      stream: false,
      system,
      messages: apiMessages,
      tools
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

    const json = await response.json() as Record<string, unknown>
    const content = json.content as { type: string; text?: string; name?: string; input?: Record<string, string> }[]

    let textParts = ''
    for (const block of content) {
      if (block.type === 'text' && block.text) {
        textParts += block.text
      }
      if (block.type === 'tool_use' && block.name === 'delegate_task' && block.input) {
        const { message: delegateMsg } = this.handleDelegateTask(employee, block.input)
        textParts += '\n\n' + delegateMsg
      }
    }

    onStream(textParts)
    return textParts
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
