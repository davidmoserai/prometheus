import { EmployeeStore } from './store'
import { ChatMessage, Employee, ProviderConfig } from './types'

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

    try {
      const responseText = await this.callProvider(
        provider,
        employee.model,
        systemPrompt,
        messages,
        onStream
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
   * Build the full system prompt by appending knowledge documents.
   */
  private buildSystemPrompt(employee: Employee): string {
    let prompt = employee.systemPrompt || ''

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

    return prompt
  }

  /**
   * Route API call to the correct provider format.
   */
  private async callProvider(
    provider: ProviderConfig,
    model: string,
    systemPrompt: string,
    messages: { role: string; content: string }[],
    onStream: (chunk: string) => void
  ): Promise<string> {
    switch (provider.id) {
      case 'anthropic':
        return this.callAnthropic(provider, model, systemPrompt, messages, onStream)
      case 'ollama':
        return this.callOllama(provider, model, systemPrompt, messages, onStream)
      case 'ollama-cloud':
        return this.callOllamaCloud(provider, model, systemPrompt, messages, onStream)
      case 'vercel-ai-gateway':
      case 'openai':
      case 'google':
      case 'mistral':
      default:
        return this.callOpenAICompatible(provider, model, systemPrompt, messages, onStream)
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
   */
  private async callOpenAICompatible(
    provider: ProviderConfig,
    model: string,
    systemPrompt: string,
    messages: { role: string; content: string }[],
    onStream: (chunk: string) => void
  ): Promise<string> {
    const baseUrl = this.getBaseUrl(provider)
    const url = `${baseUrl}/chat/completions`

    const apiMessages = [
      ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
      ...messages
    ]

    // Build request body
    const body: Record<string, unknown> = {
      model,
      messages: apiMessages,
      stream: true
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

    return this.parseSSEStream(response, onStream)
  }

  /**
   * Anthropic Messages API — uses their native format with caching support.
   */
  private async callAnthropic(
    provider: ProviderConfig,
    model: string,
    systemPrompt: string,
    messages: { role: string; content: string }[],
    onStream: (chunk: string) => void
  ): Promise<string> {
    const baseUrl = provider.baseUrl || 'https://api.anthropic.com'
    const url = `${baseUrl}/v1/messages`

    // Filter out system messages from the messages array (system is separate in Anthropic)
    const apiMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role, content: m.content }))

    // Build system with cache_control for prompt caching
    const system = systemPrompt
      ? [{ type: 'text' as const, text: systemPrompt, cache_control: { type: 'ephemeral' as const } }]
      : undefined

    const body = {
      model,
      max_tokens: 8192,
      stream: true,
      system,
      messages: apiMessages
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

    return this.parseAnthropicSSEStream(response, onStream)
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
