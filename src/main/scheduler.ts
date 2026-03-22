import { EmployeeStore } from './store'
import { AgentManager } from './agent-manager'
import { RecurringTask } from './types'

/**
 * Scheduler checks recurring tasks every 60 seconds and executes any that are due.
 */
export class Scheduler {
  private intervalId: NodeJS.Timeout | null = null
  private store: EmployeeStore
  private agentManager: AgentManager
  private onTaskRun?: (task: RecurringTask) => void

  constructor(store: EmployeeStore, agentManager: AgentManager) {
    this.store = store
    this.agentManager = agentManager
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
    const tasks = this.store.listRecurringTasks()
    const now = new Date()

    for (const task of tasks) {
      if (!task.enabled) continue
      if (new Date(task.nextRunAt) <= now) {
        await this.executeRecurringTask(task)
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
        status: 'pending'
      })

      // Create a conversation for the task execution
      const conv = this.store.createConversation(task.employeeId)

      // Send the brief as a message
      await this.agentManager.sendMessage(
        conv.id,
        `[Scheduled Task: ${task.name}]\n\n${task.brief}`,
        () => {},
        undefined
      )

      // Mark the delegated task as completed
      this.store.updateTask(delegatedTask.id, { status: 'completed' })
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
