import { MCPClient } from '@mastra/mcp'
import type { Tool } from '@mastra/core/tools'
import type { MCPServerConfig } from './types'

// ============================================================
// MCPManager — manages MCP server connections and tool discovery
// ============================================================

export class MCPManager {
  private clients: Map<string, MCPClient> = new Map()
  private toolCache: Map<string, Record<string, Tool>> = new Map()

  /**
   * Connect to an MCP server and discover its tools.
   * Returns the list of discovered tool names.
   */
  async connect(config: MCPServerConfig): Promise<string[]> {
    // Disconnect existing client if reconnecting
    await this.disconnect(config.id)

    const client = new MCPClient({
      id: `prometheus-mcp-${config.id}`,
      servers: {
        [config.id]: {
          command: config.command,
          args: config.args,
          env: config.env
        }
      }
    })

    this.clients.set(config.id, client)

    // Discover tools (listToolsets returns tools grouped by server, without namespace prefix)
    const toolsets = await client.listToolsets()
    const serverTools = toolsets[config.id] || {}
    this.toolCache.set(config.id, serverTools)

    return Object.keys(serverTools)
  }

  /**
   * Get tools from a connected MCP server (returns Mastra Tool objects).
   */
  getTools(serverId: string): Record<string, Tool> {
    return this.toolCache.get(serverId) || {}
  }

  /**
   * Get tool names from a connected MCP server.
   */
  getToolNames(serverId: string): string[] {
    return Object.keys(this.toolCache.get(serverId) || {})
  }

  /**
   * Get all tools from all connected servers, prefixed with serverId to avoid collisions.
   */
  getAllTools(): Record<string, Tool> {
    const allTools: Record<string, Tool> = {}
    for (const [serverId, tools] of this.toolCache) {
      for (const [name, tool] of Object.entries(tools)) {
        allTools[`mcp_${serverId}_${name}`] = tool
      }
    }
    return allTools
  }

  /**
   * Get all tools grouped by server ID.
   */
  getToolsByServer(): Record<string, Record<string, Tool>> {
    const result: Record<string, Record<string, Tool>> = {}
    for (const [serverId, tools] of this.toolCache) {
      result[serverId] = tools
    }
    return result
  }

  /**
   * Disconnect a single MCP server.
   */
  async disconnect(serverId: string): Promise<void> {
    const client = this.clients.get(serverId)
    if (client) {
      try {
        await client.disconnect()
      } catch {
        // Server may already be disconnected
      }
      this.clients.delete(serverId)
      this.toolCache.delete(serverId)
    }
  }

  /**
   * Disconnect all MCP servers.
   */
  async disconnectAll(): Promise<void> {
    const ids = Array.from(this.clients.keys())
    await Promise.allSettled(ids.map(id => this.disconnect(id)))
  }

  /**
   * Connect to all enabled MCP servers from config.
   * Returns a map of serverId -> tool names (or error message).
   */
  async connectAll(configs: MCPServerConfig[]): Promise<Record<string, { tools?: string[]; error?: string }>> {
    const results: Record<string, { tools?: string[]; error?: string }> = {}

    await Promise.allSettled(
      configs.filter(c => c.enabled).map(async (config) => {
        try {
          const toolNames = await this.connect(config)
          results[config.id] = { tools: toolNames }
        } catch (err) {
          results[config.id] = {
            error: err instanceof Error ? err.message : 'Unknown connection error'
          }
        }
      })
    )

    return results
  }

  /**
   * Test connection to an MCP server. Returns tool names on success or throws on failure.
   */
  async testConnection(config: MCPServerConfig): Promise<string[]> {
    const toolNames = await this.connect(config)
    return toolNames
  }
}
