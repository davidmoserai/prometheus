import * as http from 'http'

type HookRequestHandler = (toolName: string, toolInput: Record<string, unknown>) => Promise<boolean>

/**
 * Start a local HTTP server that Claude Code's PreToolUse hooks call to request approval.
 * The handler is called with the tool name and input; return true to allow, false to block.
 */
export async function startApprovalServer(
  onHookRequest: HookRequestHandler
): Promise<{ port: number; close: () => void }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (req.method !== 'POST' || req.url !== '/hook') {
        res.writeHead(404)
        res.end()
        return
      }

      let body = ''
      req.on('data', (chunk) => { body += chunk })
      req.on('end', async () => {
        try {
          const { tool_name, tool_input } = JSON.parse(body) as {
            tool_name: string
            tool_input?: Record<string, unknown>
          }
          const approved = await onHookRequest(tool_name, tool_input || {})
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ approved }))
        } catch {
          // On parse/handler error, allow the tool call to proceed
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ approved: true }))
        }
      })
    })

    server.on('error', reject)

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number }
      resolve({
        port: addr.port,
        close: () => server.close()
      })
    })
  })
}
