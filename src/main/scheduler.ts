import { EmployeeStore } from './store'
import { AgentManager } from './agent-manager'
import type { ConversationService } from './conversation-service'
import { RecurringTask } from './types'

/**
 * Scheduler checks recurring tasks every 60 seconds and executes any that are due.
 */
const STUCK_TASK_THRESHOLD_MS = 60 * 1000 // 1 minute
const MAX_RETRIES = 2

export class Scheduler {
  private intervalId: NodeJS.Timeout | null = null
  private store: EmployeeStore
  private agentManager: AgentManager
  private convService?: ConversationService
  private onTaskRun?: (task: RecurringTask) => void
  private taskRetries = new Map<string, number>()

  constructor(store: EmployeeStore, agentManager: AgentManager, convService?: ConversationService) {
    this.store = store
    this.agentManager = agentManager
    this.convService = convService
  }

  /** Set callback for notifying frontend when a recurring task runs */
  setTaskRunCallback(cb: (task: RecurringTask) => void) {
    this.onTaskRun = cb
  }

  start() {
    // Check immediately on start to catch up on missed tasks
    this.checkAndRun()
    // Then check every 60 seconds
    this.intervalId = setInterval(() => this.checkAndRun(), 60000)
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  private async checkAndRun() {
    // Check recurring tasks
    const recurringTasks = this.store.listRecurringTasks()
    const now = new Date()
    for (const task of recurringTasks) {
      if (!task.enabled) continue
      if (new Date(task.nextRunAt) <= now) {
        await this.executeRecurringTask(task)
      }
    }

    // Recover stuck delegated tasks
    await this.recoverStuckTasks()
  }

  private async recoverStuckTasks() {
    const tasks = this.store.listTasks()
    const now = Date.now()

    for (const task of tasks) {
      // Only recover tasks that should be active
      if (task.status !== 'in_progress' && task.status !== 'pending') continue

      // Skip if actively being worked on
      if (this.agentManager.isTaskActive(task.id)) continue

      // Skip if recently updated (not stale yet)
      const elapsed = now - new Date(task.updatedAt).getTime()
      if (elapsed < STUCK_TASK_THRESHOLD_MS) continue

      // Check retry count
      const retries = this.taskRetries.get(task.id) || 0
      if (retries >= MAX_RETRIES) {
        console.log(`Task "${task.id}" exceeded ${MAX_RETRIES} retries, escalating`)
        this.store.updateTask(task.id, { status: 'escalated' })
        this.taskRetries.delete(task.id)
        continue
      }

      // Check if the task already has a real response (agent did the work but task wasn't marked complete)
      const hasToolMessages = task.messages.some(m => m.role === 'tool')
      const hasSubstantialResponse = task.response && task.response.length > 200
      if (hasToolMessages || hasSubstantialResponse) {
        console.log(`Task "${task.id}" has work done but wasn't completed — marking complete`)
        this.store.updateTask(task.id, { status: 'completed' })
        this.taskRetries.delete(task.id)
        // Inject result back to delegating agent
        if (task.originConversationId) {
          const toEmp = this.store.getEmployee(task.toEmployeeId)
          const resultContent = `[Task Result from ${toEmp?.name || 'Agent'}] (task: ${task.id})\nTask: ${task.objective}\nStatus: completed\n\nResult:\n${task.response || task.messages.filter(m => m.role === 'agent').pop()?.content || '(no response)'}`
          this.agentManager.sendMessage(
            task.originConversationId, resultContent, () => {}, undefined, true
          ).catch(() => {})
        }
        continue
      }

      // Re-trigger the stuck task
      console.log(`Recovering stuck task "${task.id}" (attempt ${retries + 1}/${MAX_RETRIES})`)
      this.taskRetries.set(task.id, retries + 1)
      try {
        await this.agentManager.continueTask(
          task.id,
          'Your previous attempt did not complete. Please execute the task now and produce the deliverable.'
        )
        this.taskRetries.delete(task.id)
      } catch (err) {
        console.error(`Failed to recover task "${task.id}":`, err)
      }
    }
  }

  private async executeRecurringTask(task: RecurringTask) {
    const employee = this.store.getEmployee(task.employeeId)
    if (!employee) return

    try {
      // Create a one-off delegated Task in the store
      const delegatedTask = this.store.createTask({
        fromEmployeeId: task.employeeId,
        toEmployeeId: task.employeeId,
        priority: 'medium',
        deadline: '',
        objective: task.name,
        context: task.brief,
        deliverable: 'Complete the scheduled task as described',
        acceptanceCriteria: 'Task completed successfully',
        escalateIf: 'Unable to complete the task',
        status: 'pending',
        messages: []
      })

      // Create a conversation for the task execution
      if (!this.convService) throw new Error('ConversationService not initialized')
      const companyId = this.store.getActiveCompanyId() || ''
      const conv = await this.convService.createConversation(task.employeeId, companyId)

      // Send the brief as a message and wait for the agent to finish
      const result = await this.agentManager.sendMessage(
        conv.id,
        `[Scheduled Task: ${task.name}]\n\n${task.brief}`,
        () => {},
        undefined,
        true // skipApproval — automated tasks run without user approval gates
      )

      // Check the result before marking completed — only mark completed if we got a real response
      const isError = result.content.startsWith('Failed to get response:') || result.content === '[Stopped]'
      this.store.updateTask(delegatedTask.id, {
        status: isError ? 'escalated' : 'completed',
        response: result.content
      })
    } catch (err) {
      console.error('Recurring task execution failed:', err)
    }

    // Update lastRunAt and calculate nextRunAt
    const nextRunAt = this.calculateNextRun(task.schedule, task.scheduleTime)
    this.store.updateRecurringTask(task.id, {
      lastRunAt: new Date().toISOString(),
      nextRunAt
    })

    // Notify frontend
    const updated = this.store.getRecurringTask(task.id)
    if (updated) this.onTaskRun?.(updated)
  }

  /** Calculate the next run time based on schedule type */
  calculateNextRun(schedule: RecurringTask['schedule'], scheduleTime?: string): string {
    const now = new Date()

    switch (schedule) {
      case 'hourly': {
        const next = new Date(now.getTime() + 60 * 60 * 1000)
        return next.toISOString()
      }
      case 'daily': {
        // Parse time like "08:00"
        const [hours, minutes] = (scheduleTime || '08:00').split(':').map(Number)
        const next = new Date(now)
        next.setHours(hours, minutes, 0, 0)
        // If the time has already passed today, schedule for tomorrow
        if (next <= now) {
          next.setDate(next.getDate() + 1)
        }
        return next.toISOString()
      }
      case 'weekly': {
        // Parse time like "monday 08:00"
        const parts = (scheduleTime || 'monday 08:00').split(' ')
        const dayName = parts[0]?.toLowerCase() || 'monday'
        const [hours, minutes] = (parts[1] || '08:00').split(':').map(Number)

        const dayMap: Record<string, number> = {
          sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
          thursday: 4, friday: 5, saturday: 6
        }
        const targetDay = dayMap[dayName] ?? 1

        const next = new Date(now)
        next.setHours(hours, minutes, 0, 0)
        const currentDay = next.getDay()
        let daysUntil = targetDay - currentDay
        if (daysUntil < 0) daysUntil += 7
        if (daysUntil === 0 && next <= now) daysUntil = 7
        next.setDate(next.getDate() + daysUntil)
        return next.toISOString()
      }
      default:
        return new Date(now.getTime() + 60 * 60 * 1000).toISOString()
    }
  }
}
