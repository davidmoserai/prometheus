import { spawn, execSync, ChildProcess } from 'child_process'
import { writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// ============================================================
// Types for Claude Code stream-json output
// ============================================================

export interface ClaudeStreamMessage {
  type: 'system' | 'assistant' | 'result'
  subtype?: string
  // assistant messages
  content?: string
  // result messages
  result?: string
  is_error?: boolean
  // tool use
  tool_use_id?: string
  tool_name?: string
  tool_input?: Record<string, unknown>
  // partial content delta
  content_block_delta?: { type: string; text?: string }
}

export interface ClaudeAuthStatus {
  authenticated: boolean
  loginMethod?: string
  email?: string
  organization?: string
  error?: string
}

// ============================================================
// Auth helpers
// ============================================================

/**
 * Check if Claude Code CLI is installed and accessible.
 */
// Build env without Electron vars that break child CLI processes
// Also ensure common bin paths are in PATH (Electron strips them)
function cleanEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  const home = env.HOME || ''
  const extraPaths = [
    `${home}/.local/bin`,
    `${home}/.nvm/current/bin`,
    '/usr/local/bin',
    '/opt/homebrew/bin'
  ]
  const currentPath = env.PATH || ''
  env.PATH = [...extraPaths, currentPath].join(':')
  return env
}

// Cache resolved claude binary path
let _claudeBinPath: string | null = null
function getClaudeBin(): string {
  if (_claudeBinPath) return _claudeBinPath
  try {
    _claudeBinPath = execSync('which claude', { encoding: 'utf-8', env: cleanEnv(), timeout: 5000, stdio: 'pipe' }).trim()
  } catch {
    _claudeBinPath = 'claude'
  }
  return _claudeBinPath
}

export function isClaudeCodeInstalled(): boolean {
  try {
    execSync(`${getClaudeBin()} --version`, { encoding: 'utf-8', timeout: 5000, stdio: 'pipe', env: cleanEnv() })
    return true
  } catch {
    return false
  }
}

/**
 * Get the current Claude Code authentication status.
 */
export function getAuthStatus(): ClaudeAuthStatus {
  try {
    const output = execSync(`${getClaudeBin()} auth status --text`, {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: 'pipe',
      env: cleanEnv()
    }).trim()

    // Parse the text output
    const loginMethod = output.match(/Login method:\s*(.+)/)?.[1]?.trim()
    const email = output.match(/Email:\s*(.+)/)?.[1]?.trim()
    const organization = output.match(/Organization:\s*(.+)/)?.[1]?.trim()

    return {
      authenticated: true,
      loginMethod,
      email,
      organization
    }
  } catch (err) {
    return {
      authenticated: false,
      error: err instanceof Error ? err.message : 'Unknown error'
    }
  }
}

/**
 * Launch Claude Code login flow (opens browser).
 * Returns a promise that resolves when login completes.
 */
export function launchLogin(): Promise<ClaudeAuthStatus> {
  return new Promise((resolve) => {
    const child = spawn(getClaudeBin(), ['auth', 'login'], {
      stdio: 'inherit',
      shell: true,
      env: cleanEnv()
    })

    child.on('close', () => {
      // Check status after login completes
      const status = getAuthStatus()
      resolve(status)
    })

    child.on('error', () => {
      resolve({ authenticated: false, error: 'Failed to launch Claude Code login' })
    })
  })
}

// ============================================================
// Tool mapping: Prometheus builtin tools -> Claude Code tools
// ============================================================

const TOOL_MAP: Record<string, string[]> = {
  'web-search': ['WebSearch'],
  'web-browse': ['WebFetch'],
  'file-read': ['Read', 'Glob', 'Grep'],
  'file-write': ['Write', 'Edit'],
  'code-execute': ['Bash']
}

/**
 * Map employee's enabled builtin tool IDs to Claude Code tool names.
 */
function mapToolsForCLI(enabledToolIds: string[]): string[] {
  const ccTools: string[] = []
  for (const toolId of enabledToolIds) {
    const mapped = TOOL_MAP[toolId]
    if (mapped) ccTools.push(...mapped)
  }
  return [...new Set(ccTools)]
}

// ============================================================
// MCP config file helper
// ============================================================

interface MCPConfigForCLI {
  mcpServers: Record<string, {
    command: string
    args: string[]
    env?: Record<string, string>
  }>
}

/**
 * Write a temporary MCP config file for Claude Code CLI.
 * Returns the path to the temp file.
 */
function writeTempMcpConfig(servers: { id: string; command: string; args: string[]; env?: Record<string, string> }[]): string {
  const config: MCPConfigForCLI = { mcpServers: {} }
  for (const server of servers) {
    config.mcpServers[server.id] = {
      command: server.command,
      args: server.args,
      env: server.env
    }
  }
  const filePath = join(tmpdir(), `prometheus-mcp-${Date.now()}.json`)
  writeFileSync(filePath, JSON.stringify(config, null, 2))
  return filePath
}

// ============================================================
// Claude Code Runner
// ============================================================

export interface RunOptions {
  prompt: string
  systemPrompt: string
  model: string
  enabledToolIds: string[]
  mcpServers?: { id: string; command: string; args: string[]; env?: Record<string, string> }[]
  conversationHistory?: { role: string; content: string }[]
  onStream: (text: string) => void
  onToolCall?: (data: { tool: string; summary: string }) => void
}

/**
 * Run a Claude Code CLI subprocess and stream the response.
 * Returns the final accumulated text.
 */
export function runClaudeCode(options: RunOptions): { promise: Promise<string>; abort: () => void } {
  const {
    prompt,
    systemPrompt,
    model,
    enabledToolIds,
    mcpServers,
    conversationHistory,
    onStream,
    onToolCall
  } = options

  let child: ChildProcess | null = null
  let tempMcpPath: string | null = null

  const abort = () => {
    if (child && !child.killed) {
      child.kill('SIGTERM')
    }
  }

  const promise = new Promise<string>((resolve, reject) => {
    // Build CLI args
    const args: string[] = [
      '-p', // print mode (non-interactive)
      '--output-format', 'stream-json',
      '--verbose', // required for stream-json
      '--system-prompt', systemPrompt,
      '--model', model,
      '--no-session-persistence',
      '--dangerously-skip-permissions'
    ]

    // Map and set available tools
    const ccTools = mapToolsForCLI(enabledToolIds)
    if (ccTools.length > 0) {
      args.push('--tools', ccTools.join(','))
    } else {
      // No tools — empty string disables all
      args.push('--tools', '')
    }

    // MCP servers
    if (mcpServers && mcpServers.length > 0) {
      tempMcpPath = writeTempMcpConfig(mcpServers)
      args.push('--mcp-config', tempMcpPath)
    }

    // Build the full prompt with conversation history prepended
    let fullPrompt = ''
    if (conversationHistory && conversationHistory.length > 0) {
      fullPrompt += 'Previous conversation:\n'
      for (const msg of conversationHistory) {
        const label = msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Assistant' : 'System'
        fullPrompt += `${label}: ${msg.content}\n\n`
      }
      fullPrompt += '---\n\nCurrent message:\n'
    }
    fullPrompt += prompt

    // Spawn the process — pipe prompt via stdin (more reliable than positional arg from Electron)
    child = spawn(getClaudeBin(), args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: cleanEnv(),
      shell: false
    })

    // Write prompt to stdin and close it
    child.stdin?.write(fullPrompt)
    child.stdin?.end()

    let accumulated = ''
    let buffer = ''

    child.stdout?.on('data', (data: Buffer) => {
      buffer += data.toString()

      // Process complete NDJSON lines
      const lines = buffer.split('\n')
      buffer = lines.pop() || '' // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const msg: ClaudeStreamMessage = JSON.parse(line)
          handleStreamMessage(msg)
        } catch {
          // Skip malformed JSON lines
        }
      }
    })

    function handleStreamMessage(msg: Record<string, unknown>) {
      const type = msg.type as string

      // Handle assistant messages — extract text from content blocks
      if (type === 'assistant' && msg.message) {
        const message = msg.message as Record<string, unknown>
        const content = message.content as { type: string; text?: string }[] | undefined
        if (content) {
          const textParts = content.filter(c => c.type === 'text' && c.text).map(c => c.text)
          if (textParts.length > 0) {
            accumulated = textParts.join('')
            onStream(accumulated)
          }

          // Detect tool use blocks
          if (onToolCall) {
            for (const block of content) {
              if (block.type === 'tool_use') {
                const toolBlock = block as unknown as { name?: string; input?: Record<string, unknown> }
                const inputStr = toolBlock.input ? JSON.stringify(toolBlock.input).slice(0, 100) : ''
                onToolCall({ tool: toolBlock.name || 'unknown', summary: `${toolBlock.name}: ${inputStr}` })
              }
            }
          }
        }
      }

      // Handle final result
      if (type === 'result' && msg.result) {
        accumulated = msg.result as string
        onStream(accumulated)
      }
    }

    let stderrOutput = ''
    child.stderr?.on('data', (data: Buffer) => {
      stderrOutput += data.toString()
    })

    child.on('close', (code) => {
      // Clean up temp MCP config
      if (tempMcpPath) {
        try { unlinkSync(tempMcpPath) } catch {}
      }

      // Process any remaining buffer
      if (buffer.trim()) {
        try {
          const msg: ClaudeStreamMessage = JSON.parse(buffer)
          handleStreamMessage(msg)
        } catch {}
      }

      if (code !== 0 && !accumulated) {
        reject(new Error(stderrOutput || `Claude Code exited with code ${code}`))
      } else {
        resolve(accumulated)
      }
    })

    child.on('error', (err) => {
      if (tempMcpPath) {
        try { unlinkSync(tempMcpPath) } catch {}
      }
      reject(new Error(`Failed to spawn Claude Code: ${err.message}`))
    })
  })

  return { promise, abort }
}
