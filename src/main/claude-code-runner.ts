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
    type?: 'stdio' | 'http' | 'sse'
    command?: string
    args?: string[]
    env?: Record<string, string>
    url?: string
    headers?: Record<string, string>
  }>
}

export interface MCPServerForCLI {
  id: string
  command?: string
  args?: string[]
  env?: Record<string, string>
  // HTTP transport
  url?: string
  headers?: Record<string, string>
}

/**
 * Write a temporary MCP config file for Claude Code CLI.
 * Supports both stdio (command/args) and HTTP (url/headers) transports.
 * Returns the path to the temp file.
 */
function writeTempMcpConfig(servers: MCPServerForCLI[]): string {
  const config: MCPConfigForCLI = { mcpServers: {} }
  for (const server of servers) {
    if (server.url) {
      // HTTP transport — Claude Code requires "type" field
      config.mcpServers[server.id] = { type: 'http', url: server.url, headers: server.headers }
    } else if (server.command) {
      // Stdio transport
      config.mcpServers[server.id] = { command: server.command, args: server.args || [], env: server.env }
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
  mcpServers?: MCPServerForCLI[]
  mcpToolNames?: string[]
  conversationHistory?: { role: string; content: string }[]
  approvalServerPort?: number    // if set, inject PreToolUse hook into subprocess CWD
  /**
   * ⚠️  CLAUDE CODE ONLY — internal MCP server for memory + knowledge tools.
   * Mastra agents use native createTool() functions instead (see agent-manager.ts).
   * When set, a prometheus-internal MCP server script is written to the temp dir
   * and registered in --mcp-config so Claude Code can call memory/knowledge APIs.
   */
  internalServerPort?: number
  internalEmployeeId?: string
  internalConversationId?: string
  onStream: (text: string) => void
  onToolCall?: (data: { tool: string; summary: string; detail?: string }) => void
  onFileWritten?: (data: { path: string; content: string }) => void
}

/**
 * Run a Claude Code CLI subprocess and stream the response.
 * Returns the final accumulated text.
 */
// ============================================================
// Internal MCP server script (Claude Code only)
// ============================================================

/**
 * ⚠️  CLAUDE CODE ONLY ⚠️
 * Writes a self-contained Node.js MCP server script to tempDir.
 * This script bridges Claude Code's MCP protocol to the Prometheus internal HTTP API
 * (prometheus-internal-server.ts), giving Claude Code access to memory + knowledge tools.
 *
 * Mastra agents do NOT use this — they get the same tools as native createTool() functions.
 */
function writeInternalMcpScript(tempDir: string, port: number, employeeId: string, conversationId: string): string {
  const scriptPath = join(tempDir, 'prometheus-internal-mcp.js')

  // Inline MCP server script — implements JSON-RPC 2.0 over stdio (MCP protocol)
  const script = `
const http = require('http')
const readline = require('readline')
const PORT = ${port}
const EMPLOYEE_ID = ${JSON.stringify(employeeId)}
const CONVERSATION_ID = ${JSON.stringify(conversationId)}

const TOOLS = [
  {
    name: 'update_working_memory',
    description: 'Update your persistent working memory. Use this to remember facts about the user, preferences, decisions, and anything you want to recall in future conversations. Replaces previous memory content.',
    inputSchema: { type: 'object', properties: { content: { type: 'string', description: 'Your full updated working memory (replaces previous).' } }, required: ['content'] }
  },
  {
    name: 'search_memory',
    description: 'Search your past conversations and memories using semantic similarity. Use this to recall something from a previous conversation.',
    inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'What to search for in past conversations.' } }, required: ['query'] }
  },
  {
    name: 'create_knowledge_doc',
    description: 'Create a new persistent knowledge document that you and other employees can reference.',
    inputSchema: { type: 'object', properties: { title: { type: 'string' }, content: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } }, required: ['title', 'content'] }
  },
  {
    name: 'update_knowledge_doc',
    description: 'Update an existing knowledge document by its ID.',
    inputSchema: { type: 'object', properties: { doc_id: { type: 'string', description: 'ID of the document to update.' }, content: { type: 'string', description: 'New content.' } }, required: ['doc_id', 'content'] }
  }
]

const URL_MAP = {
  update_working_memory: '/memory/update',
  search_memory: '/memory/search',
  create_knowledge_doc: '/knowledge/create',
  update_knowledge_doc: '/knowledge/update'
}

function post(path, body) {
  return new Promise((resolve, reject) => {
    const str = JSON.stringify(body)
    const req = http.request({ hostname: '127.0.0.1', port: PORT, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(str) }
    }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)) } catch { resolve({ result: d }) } }) })
    req.on('error', reject); req.write(str); req.end()
  })
}

function reply(id, result) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\\n') }
function replyErr(id, msg) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32603, message: msg } }) + '\\n') }

readline.createInterface({ input: process.stdin, terminal: false }).on('line', async line => {
  let msg; try { msg = JSON.parse(line) } catch { return }
  const { id, method, params } = msg
  if (method === 'initialize') {
    reply(id, { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'prometheus-internal', version: '1.0' } })
  } else if (method === 'notifications/initialized') {
    // no response
  } else if (method === 'tools/list') {
    reply(id, { tools: TOOLS })
  } else if (method === 'tools/call') {
    const { name, arguments: args } = params
    const path = URL_MAP[name]
    if (!path) { replyErr(id, 'Unknown tool: ' + name); return }
    try {
      const res = await post(path, { ...args, employeeId: EMPLOYEE_ID, conversationId: CONVERSATION_ID })
      reply(id, { content: [{ type: 'text', text: res.result || JSON.stringify(res) }] })
    } catch (err) { replyErr(id, String(err)) }
  } else {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } }) + '\\n')
  }
})
`
  writeFileSync(scriptPath, script)
  return scriptPath
}

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
    internalServerPort,
    internalEmployeeId,
    internalConversationId,
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

    // Map employee's enabled builtin tools to Claude Code tool names, plus any MCP tool names.
    // MCP tool names must be in --tools so Claude Code allows them (it's a strict allowlist).
    // The resolved command in --mcp-config ensures the MCP server starts correctly.
    //
    // ⚠️  CLAUDE CODE ONLY: internal memory/knowledge tools exposed via prometheus-internal MCP.
    // Mastra agents get the same capabilities via native createTool() functions (no MCP needed).
    const internalMcpToolNames = internalServerPort ? [
      'mcp__prometheus-internal__update_working_memory',
      'mcp__prometheus-internal__search_memory',
      'mcp__prometheus-internal__create_knowledge_doc',
      'mcp__prometheus-internal__update_knowledge_doc'
    ] : []

    const ccTools = [
      ...mapToolsForCLI(enabledToolIds),
      ...(mcpToolNames || []),
      ...internalMcpToolNames
    ]
    if (ccTools.length > 0) {
      args.push('--tools', ccTools.join(','))
    } else {
      // No tools — empty string disables all built-in tools
      args.push('--tools', '')
    }

    // Block user's personal MCP servers — only use what we explicitly provide
    args.push('--strict-mcp-config')

    // ⚠️  CLAUDE CODE ONLY: build MCP config including prometheus-internal server (if port set).
    // The internal server bridges Claude Code to our memory/knowledge HTTP API.
    // Mastra agents never touch this code path.
    const allMcpServers = [...(mcpServers || [])]
    let internalMcpScriptPath: string | null = null
    if (internalServerPort && internalEmployeeId && internalConversationId) {
      // Write internal MCP script to a temp dir (reuse hookDir if available, else create one)
      const scriptDir = tempHookDir || mkdtempSync(join(tmpdir(), 'prometheus-cc-'))
      if (!tempHookDir) tempHookDir = scriptDir
      internalMcpScriptPath = writeInternalMcpScript(scriptDir, internalServerPort, internalEmployeeId, internalConversationId)
      allMcpServers.push({ id: 'prometheus-internal', command: 'node', args: [internalMcpScriptPath] })
    }

    tempMcpPath = writeTempMcpConfig(allMcpServers)
    args.push('--mcp-config', tempMcpPath)

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
