/**
 * Prometheus Internal API Server
 *
 * A local HTTP server that exposes memory and knowledge doc operations
 * to Claude Code's internal MCP server subprocess.
 *
 * ⚠️  THIS SERVER EXISTS SOLELY FOR CLAUDE CODE CLI INTEGRATION ⚠️
 * Mastra agents (OpenAI, Anthropic, Google, etc.) access these same operations
 * through their native Mastra createTool() functions in agent-manager.ts.
 * Do NOT use this server for anything outside of the Claude Code subprocess bridge.
 */

import { createServer, IncomingMessage, ServerResponse } from 'http'
import type { Memory } from '@mastra/memory'
import type { EmployeeStore } from './store'

// Forward declaration to avoid circular import
interface DelegationHandler {
  handleDelegateTask(fromEmployeeId: string, args: Record<string, string>, conversationId?: string): { task: unknown; message: string }
  executeAgentMessage(fromEmployeeId: string, toEmployeeId: string, message: string): Promise<string>
  getContactableEmployeeIds(employeeId: string): string[]
}

export interface InternalServerContext {
  memory: Memory
  store: EmployeeStore
  delegation?: DelegationHandler
}

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', c => { data += c })
    req.on('end', () => { try { resolve(JSON.parse(data)) } catch { reject(new Error('Invalid JSON')) } })
    req.on('error', reject)
  })
}

// Format a task for API response
function formatTaskForResponse(task: { id: string; status: string; objective: string; priority: string; deadline: string; response?: string; messages: { role: string; content: string }[] }, toName: string): string {
  let result = `**Task ${task.id}** — ${task.status.toUpperCase()}\nAssigned to: ${toName}\nObjective: ${task.objective}\nPriority: ${task.priority}\nDeadline: ${task.deadline || 'Not specified'}`
  if (task.response) {
    result += `\n\nResponse:\n${task.response.slice(0, 1000)}${task.response.length > 1000 ? '...' : ''}`
  }
  const recentMessages = task.messages.slice(-5)
  if (recentMessages.length > 0) {
    result += '\n\nRecent activity:'
    for (const m of recentMessages) {
      result += `\n- [${m.role}]: ${m.content.slice(0, 200)}`
    }
  }
  return result
}

function respond(res: ServerResponse, status: number, body: unknown) {
  const json = JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(json) })
  res.end(json)
}

/**
 * Start the internal HTTP API server.
 * Returns the port and a close() function.
 *
 * ⚠️  Only started when a Claude Code agent invocation begins. ⚠️
 */
export function startInternalServer(ctx: InternalServerContext): Promise<{ port: number; close: () => void }> {
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      if (req.method !== 'POST') { respond(res, 405, { error: 'Method not allowed' }); return }

      let body: Record<string, unknown>
      try { body = await readBody(req) } catch { respond(res, 400, { error: 'Invalid JSON' }); return }

      const employeeId = body.employeeId as string
      const conversationId = body.conversationId as string

      try {
        // ── Working Memory ────────────────────────────────────────────────────────
        if (req.url === '/memory/update') {
          const content = body.content as string
          await ctx.memory.updateWorkingMemory({
            threadId: conversationId,
            resourceId: employeeId,
            workingMemory: content
          })
          respond(res, 200, { result: 'Working memory updated.' })

        } else if (req.url === '/memory/search') {
          const query = body.query as string
          const results = await ctx.memory.recall({
            threadId: conversationId,
            vectorSearchString: query,
            threadConfig: {
              semanticRecall: { topK: 5, messageRange: 1, scope: 'resource' },
              lastMessages: false
            }
          })
          if (results.messages.length === 0) {
            respond(res, 200, { result: 'No relevant memories found.' })
          } else {
            const formatted = results.messages
              .map((m: { role: string; content: unknown }) =>
                `[${m.role}]: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`)
              .join('\n\n')
            respond(res, 200, { result: formatted })
          }

        // ── Knowledge Documents ───────────────────────────────────────────────────
        } else if (req.url === '/knowledge/create') {
          const doc = ctx.store.createKnowledge({
            title: body.title as string,
            content: body.content as string,
            tags: (body.tags as string[]) || []
          })
          // Auto-assign to this employee
          const emp = ctx.store.getEmployee(employeeId)
          if (emp) ctx.store.updateEmployee(employeeId, { knowledgeIds: [...emp.knowledgeIds, doc.id] })
          respond(res, 200, { result: `Knowledge document "${doc.title}" created (ID: ${doc.id}).` })

        } else if (req.url === '/knowledge/update') {
          const updated = ctx.store.updateKnowledge(body.doc_id as string, { content: body.content as string })
          if (!updated) respond(res, 404, { result: `Document "${body.doc_id}" not found.` })
          else respond(res, 200, { result: `Document "${updated.title}" updated.` })

        // ── Task Delegation ──────────────────────────────────────────────────────
        } else if (req.url === '/task/delegate') {
          if (!ctx.delegation) { respond(res, 501, { error: 'Delegation not available' }); return }
          const toId = body.to_employee_id as string
          const contactableIds = ctx.delegation.getContactableEmployeeIds(employeeId)
          if (!contactableIds.includes(toId)) {
            respond(res, 403, { result: "You don't have permission to contact that employee." })
            return
          }
          const fromEmp = ctx.store.getEmployee(employeeId)
          if (!fromEmp) { respond(res, 404, { result: 'Employee not found.' }); return }
          const args: Record<string, string> = {
            to_employee_id: toId,
            objective: (body.objective as string) || '',
            context: (body.context as string) || '',
            deliverable: (body.deliverable as string) || '',
            acceptance_criteria: (body.acceptance_criteria as string) || '',
            escalate_if: (body.escalate_if as string) || ''
          }
          const result = ctx.delegation.handleDelegateTask(employeeId, args, conversationId)
          respond(res, 200, { result: result.message })

        // ── Task Status ────────────────────────────────────────────────────────
        } else if (req.url === '/task/status') {
          const taskId = body.task_id as string | undefined
          const allTasks = ctx.store.listTasks().filter(t => t.fromEmployeeId === employeeId)
          if (taskId) {
            const task = allTasks.find(t => t.id === taskId)
            if (!task) { respond(res, 404, { result: `Task "${taskId}" not found or you are not the delegator.` }); return }
            const toEmp = ctx.store.getEmployee(task.toEmployeeId)
            respond(res, 200, { result: formatTaskForResponse(task, toEmp?.name || 'Unknown') })
          } else {
            const activeTasks = allTasks.filter(t => t.status !== 'completed')
            if (activeTasks.length === 0) { respond(res, 200, { result: 'No active delegated tasks.' }); return }
            const formatted = activeTasks.map(t => {
              const toEmp = ctx.store.getEmployee(t.toEmployeeId)
              return formatTaskForResponse(t, toEmp?.name || 'Unknown')
            }).join('\n\n---\n\n')
            respond(res, 200, { result: formatted })
          }

        } else if (req.url === '/employee/message') {
          if (!ctx.delegation) { respond(res, 501, { error: 'Delegation not available' }); return }
          const toId = body.to_employee_id as string
          let msg = body.message as string
          const taskId = body.task_id as string | undefined
          const contactableIds = ctx.delegation.getContactableEmployeeIds(employeeId)
          if (!contactableIds.includes(toId)) {
            respond(res, 403, { result: "You don't have permission to contact that employee." })
            return
          }
          // Prepend task context if task_id is provided
          if (taskId) {
            const task = ctx.store.getTask(taskId)
            if (task) {
              msg = `[Re: Task "${task.objective}" (${task.status})]\n\n${msg}`
            }
          }
          const response = await ctx.delegation.executeAgentMessage(employeeId, toId, msg)
          respond(res, 200, { result: response || 'No response received.' })

        } else {
          respond(res, 404, { error: 'Unknown endpoint' })
        }
      } catch (err) {
        respond(res, 500, { error: err instanceof Error ? err.message : 'Internal error' })
      }
    })

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number }
      resolve({
        port: addr.port,
        close: () => server.close()
      })
    })

    server.on('error', reject)
  })
}
