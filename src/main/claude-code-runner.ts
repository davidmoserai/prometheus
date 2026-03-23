import { spawn, execSync, ChildProcess } from 'child_process'
import { TOOL_IDS } from './types'
import { writeFileSync, unlinkSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { mkdtempSync } from 'fs'

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

export const TOOL_MAP: Record<string, string[]> = {
  [TOOL_IDS.WEB_SEARCH]: ['WebSearch'],
  [TOOL_IDS.WEB_BROWSE]: ['WebFetch'],
  [TOOL_IDS.READ_FILE]: ['Read', 'Glob', 'Grep'],
  [TOOL_IDS.WRITE_FILE]: ['Write', 'Edit'],
  [TOOL_IDS.EXECUTE_CODE]: ['Bash']
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
  mcpToolNames?: string[]
  conversationHistory?: { role: string; content: string }[]
  approvalServerPort?: number  // if set, inject PreToolUse hook into subprocess CWD
  onStream: (text: string) => void
  onToolCall?: (data: { tool: string; summary: string; detail?: string }) => void
  onFileWritten?: (data: { path: string; content: string }) => void
}

/**
 * Run a Claude Code CLI subprocess and stream the response.
 * Returns the final accumulated text.
 */
/** Write a temp directory with hook.js and .claude/settings.local.json for PreToolUse approval */
function writeTempHookDir(approvalServerPort: number): string {
  const tempDir = mkdtempSync(join(tmpdir(), 'prometheus-cc-'))

  // Hook script: reads tool JSON from stdin, POSTs to approval server, exits 0 or 2
  const hookScript = `const http = require('http'), port = +process.env.PROMETHEUS_APPROVAL_PORT
let data = ''
process.stdin.on('data', c => { data += c })
process.stdin.on('end', () => {
  try {
    const parsed = JSON.parse(data)
    const body = JSON.stringify({ tool_name: parsed.tool_name, tool_input: parsed.tool_input || {} })
    const req = http.request(
      { hostname: '127.0.0.1', port, path: '/hook', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => {
        let r = ''
        res.on('data', c => { r += c })
        res.on('end', () => {
          try { process.exit(JSON.parse(r).approved ? 0 : 2) } catch { process.exit(0) }
        })
      }
    )
    req.on('error', () => process.exit(0))
    req.write(body)
    req.end()
  } catch { process.exit(0) }
})
`
  const hookPath = join(tempDir, 'hook.js')
  writeFileSync(hookPath, hookScript)

  // Settings with PreToolUse hook pointing to our script, 310s timeout (covers 5-min approval window)
  const settings = {
    hooks: {
      PreToolUse: [{
        matcher: '.*',
        hooks: [{ type: 'command', command: `node ${hookPath}`, timeout: 310 }]
      }]
    }
  }
  mkdirSync(join(tempDir, '.claude'))
  writeFileSync(join(tempDir, '.claude', 'settings.local.json'), JSON.stringify(settings, null, 2))

  return tempDir
}

export function runClaudeCode(options: RunOptions): { promise: Promise<string>; abort: () => void } {
  const {
    prompt,
    systemPrompt,
    model,
    enabledToolIds,
    mcpServers,
    mcpToolNames,
    conversationHistory,
    approvalServerPort,
    onStream,
    onToolCall,
    onFileWritten
  } = options

  let child: ChildProcess | null = null
  let tempMcpPath: string | null = null
  let tempHookDir: string | null = null

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

    // Map employee's enabled builtin tools to Claude Code tool names, then append any MCP tool names
    const ccTools = [
      ...mapToolsForCLI(enabledToolIds),
      ...(mcpToolNames || [])
    ]
    if (ccTools.length > 0) {
      args.push('--tools', ccTools.join(','))
    } else {
      // No tools — empty string disables all built-in tools
      args.push('--tools', '')
    }

    // Block user's personal MCP servers — only use what we explicitly provide
    args.push('--strict-mcp-config')

    // MCP servers (only employee's assigned ones)
    if (mcpServers && mcpServers.length > 0) {
      tempMcpPath = writeTempMcpConfig(mcpServers)
      args.push('--mcp-config', tempMcpPath)
    } else {
      // Even with no MCP servers, we need --mcp-config for --strict-mcp-config to work
      tempMcpPath = writeTempMcpConfig([])
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

    // Set up temp hook dir if approval server is configured
    const spawnEnv = cleanEnv()
    let spawnCwd: string | undefined
    if (approvalServerPort) {
      tempHookDir = writeTempHookDir(approvalServerPort)
      spawnEnv.PROMETHEUS_APPROVAL_PORT = String(approvalServerPort)
      spawnCwd = tempHookDir
    }

    // Spawn the process — pipe prompt via stdin (more reliable than positional arg from Electron)
    child = spawn(getClaudeBin(), args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: spawnEnv,
      shell: false,
      ...(spawnCwd ? { cwd: spawnCwd } : {})
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
          const msg = JSON.parse(line) as Record<string, unknown>
          handleStreamMessage(msg)
        } catch {
          // Skip malformed JSON lines
        }
      }
    })

    let prevLen = 0

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
            // Send only the new delta
            if (accumulated.length > prevLen) {
              onStream(accumulated.slice(prevLen))
              prevLen = accumulated.length
            }
          }

          // Detect tool use blocks
          for (const block of content) {
            if (block.type === 'tool_use') {
              const toolBlock = block as unknown as { name?: string; input?: Record<string, unknown> }
              const toolName = toolBlock.name || 'unknown'
              // Short summary: just the tool name + key param (e.g. file path)
              let summary = toolName
              if (toolBlock.input) {
                const firstVal = Object.values(toolBlock.input)[0]
                if (typeof firstVal === 'string' && firstVal.length < 80) {
                  summary = `${toolName}: ${firstVal}`
                }
              }
              const detail = toolBlock.input ? JSON.stringify(toolBlock.input, null, 2) : undefined
              onToolCall?.({ tool: toolName, summary, detail })

              // Detect file writes from Claude Code's built-in Write tool
              if ((toolName === 'Write' || toolName === 'write_file') && toolBlock.input) {
                const filePath = (toolBlock.input.file_path || toolBlock.input.path) as string | undefined
                const fileContent = (toolBlock.input.content || '') as string
                if (filePath && onFileWritten) {
                  onFileWritten({ path: filePath, content: fileContent })
                }
              }
            }
          }
        }
      }

      // Handle final result
      if (type === 'result' && msg.result) {
        const resultText = msg.result as string
        if (resultText.length > prevLen) {
          onStream(resultText.slice(prevLen))
        }
        accumulated = resultText
      }
    }

    let stderrOutput = ''
    child.stderr?.on('data', (data: Buffer) => {
      stderrOutput += data.toString()
    })

    child.on('close', (code) => {
      // Clean up temp MCP config and hook dir
      if (tempMcpPath) {
        try { unlinkSync(tempMcpPath) } catch {}
      }
      if (tempHookDir) {
        try { rmSync(tempHookDir, { recursive: true, force: true }) } catch {}
      }

      // Process any remaining buffer
      if (buffer.trim()) {
        try {
          const msg = JSON.parse(buffer) as Record<string, unknown>
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
      if (tempHookDir) {
        try { rmSync(tempHookDir, { recursive: true, force: true }) } catch {}
      }
      reject(new Error(`Failed to spawn Claude Code: ${err.message}`))
    })
  })

  return { promise, abort }
}
