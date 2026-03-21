import { EmployeeStore } from './store'
import { ChatMessage } from './types'

/**
 * AgentManager handles communication between the renderer and LLM providers.
 * This is the integration point for Mastra or any other agent framework.
 * Currently implements a mock response system for UI development.
 *
 * TODO: Integrate Mastra for real multi-provider agent orchestration
 * TODO: Add MCP server connections for tool execution
 * TODO: Add inter-employee message routing
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

    // TODO: Replace with real Mastra agent call
    // For now, return a helpful mock response showing the system works
    const mockResponse = this.generateMockResponse(employee.name, content)

    // Simulate streaming
    const words = mockResponse.split(' ')
    let accumulated = ''
    for (const word of words) {
      accumulated += (accumulated ? ' ' : '') + word
      onStream(accumulated)
      await new Promise(r => setTimeout(r, 30))
    }

    const msg = this.store.addMessage(conversationId, {
      role: 'assistant',
      content: mockResponse
    })

    return msg
  }

  private generateMockResponse(employeeName: string, userMessage: string): string {
    const responses = [
      `I'm ${employeeName}, and I've received your message. Once my AI backend is connected, I'll be able to help you with: "${userMessage.slice(0, 80)}..." \n\nFor now, head to **Settings** to configure your LLM provider API key, and I'll be ready to work!`,
      `Hey! ${employeeName} here. I understood your request about "${userMessage.slice(0, 60)}..." — once the Mastra agent framework is integrated, I'll process this using my assigned tools and knowledge base. Stay tuned!`,
      `As ${employeeName}, I'm designed to help with tasks like this. The agent integration is being built out — soon I'll be able to use my tools, access shared knowledge, and even hand off tasks to other employees. Configure your provider in **Settings** to get started.`
    ]
    return responses[Math.floor(Math.random() * responses.length)]
  }
}
