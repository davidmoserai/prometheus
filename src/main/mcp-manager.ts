import { MCPClient } from '@mastra/mcp'
import { shell } from 'electron'
import { execSync } from 'child_process'
import { readFileSync } from 'fs'
import type { Tool } from '@mastra/core/tools'
import type { MCPServerConfig } from './types'

// Build env with proper PATH for MCP subprocesses (Electron strips user paths)
function mcpEnv(extra?: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) env[k] = v
  }
  delete env.ELECTRON_RUN_AS_NODE
  const home = env.HOME || ''
  const extraPaths = [
    `${home}/.local/bin`,
    `${home}/.nvm/current/bin`,
    '/usr/local/bin',
    '/opt/homebrew/bin'
  ]
  env.PATH = [...extraPaths, env.PATH || ''].join(':')

  // Resolve full path to npx/node so MCP servers can find them
  try {
    const npxPath = execSync('which npx', { encoding: 'utf-8', env, timeout: 3000, stdio: 'pipe' }).trim()
    if (npxPath) {
      const binDir = npxPath.replace(/\/npx$/, '')
      if (!env.PATH.includes(binDir)) env.PATH = `${binDir}:${env.PATH}`
    }
  } catch {}

  // Set BROWSER so MCP servers that use the `open` npm package can open the system browser
  // Use the full path to macOS `open` command
  env.BROWSER = '/usr/bin/open'

  if (extra) Object.assign(env, extra)
  return env
}

// Watch stderr for URLs and open them in the system browser
function watchStderrForUrls(client: MCPClient, serverId: string): void {
  try {
    const stderr = client.getServerStderr(serverId)
    if (!stderr) return
    stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      console.log(`[MCP:${serverId}] ${text.trim()}`)
      // Look for URLs that look like OAuth/auth redirects
      const urlMatch = text.match(/https?:\/\/[^\s"'<>)]+/)
      if (urlMatch) {
        console.log(`MCP server "${serverId}" requested browser auth: ${urlMatch[0]}`)
        shell.openExternal(urlMatch[0])
      }
    })
  } catch {
    // getServerStderr may not be available
  }
}

// ============================================================
// MCPManager — manages MCP server connections and tool discovery
// ============================================================

export class MCPManager {
  private clients: Map<string, MCPClient> = new Map()
  private toolCache: Map<string, Record<string, Tool>> = new Map()

  /**
   * Connect to an MCP server and discover its tools.
   * Pipes stderr and watches for OAuth URLs to open in the system browser.
   * Returns the list of discovered tool names.
   */
  /**
   * Resolve command for MCP servers that use npx with broken shebangs.
   * If the installed binary is a JS file without a node shebang, run it with node directly.
   */
  private resolveCommand(config: MCPServerConfig): { command: string; args: string[] } {
    if (config.command === 'npx') {
      try {
        const env = mcpEnv(config.env)
        // Get the package name (skip flags like -y)
        const pkgName = config.args.find(a => !a.startsWith('-'))
        if (pkgName) {
          // Resolve which binary the package provides by checking npm bin
          const binPath = execSync(
            `npm ls -g --parseable ${pkgName} 2>/dev/null | head -1`,
            { env, encoding: 'utf-8', timeout: 10000 }
          ).trim()

          if (binPath) {
            // Find the binary from the package's bin field
            const pkgJsonPath = `${binPath}/package.json`
            const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'))
            const binEntries = typeof pkgJson.bin === 'string'
              ? { [pkgJson.name]: pkgJson.bin }
              : pkgJson.bin || {}
            const binFile = Object.values(binEntries)[0] as string
            if (binFile) {
              const fullBinPath = `${binPath}/${binFile}`
              const head = readFileSync(fullBinPath, 'utf-8').slice(0, 100)
              if (!head.startsWith('#!') && /^(import |require\(|const |"use strict")/.test(head)) {
                console.log(`MCP "${config.name}": binary missing shebang, using node directly`)
                return { command: 'node', args: [fullBinPath] }
              }
            }
          }
        }
      } catch {
        // Fall through to default
      }
    }
    return { command: config.command, args: config.args }
  }

  async connect(config: MCPServerConfig): Promise<string[]> {
    // Disconnect existing client if reconnecting
    await this.disconnect(config.id)

    // Resolve command (fixes broken shebangs in npm packages)
    const resolved = this.resolveCommand(config)

    const client = new MCPClient({
      id: `prometheus-mcp-${config.id}`,
      servers: {
        [config.id]: {
          command: resolved.command,
          args: resolved.args,
          env: mcpEnv(config.env),
          stderr: 'pipe' as const
        }
      }
    })

    this.clients.set(config.id, client)

    // Watch stderr for OAuth URLs and open them in the system browser
    watchStderrForUrls(client, config.id)

    // Discover tools with a timeout (longer for servers that need auth + gateway startup)
    const timeoutMs = 90000
    const toolsetPromise = client.listToolsets()
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Connection timed out after ${timeoutMs / 1000}s — the server may need browser auth. Try running it manually first: ${config.command} ${config.args.join(' ')}`)), timeoutMs)
    )

    const toolsets = await Promise.race([toolsetPromise, timeoutPromise])
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
