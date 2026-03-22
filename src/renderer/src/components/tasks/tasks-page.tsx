import { useState } from 'react'
import {
  ClipboardList,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Clock,
  PlayCircle,
  CheckCircle2,
  Trash2,
  ArrowUpRight,
  CalendarClock,
  Plus,
  X,
  Pencil,
  Wrench,
  Bot,
  User
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useAppStore, type Task, type RecurringTask } from '@/stores/app-store'

const STATUS_CONFIG = {
  escalated: {
    label: 'Escalated',
    icon: AlertTriangle,
    color: 'text-rose-400',
    bg: 'from-rose-500/20 via-rose-600/10 to-transparent',
    border: 'border-rose-500/30',
    badgeClass: 'bg-rose-500/15 text-rose-300 border-rose-500/20'
  },
  pending: {
    label: 'Pending',
    icon: Clock,
    color: 'text-amber-400',
    bg: 'from-amber-500/20 via-amber-600/10 to-transparent',
    border: 'border-amber-500/30',
    badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/20'
  },
  in_progress: {
    label: 'In Progress',
    icon: PlayCircle,
    color: 'text-sky-400',
    bg: 'from-sky-500/20 via-sky-600/10 to-transparent',
    border: 'border-sky-500/30',
    badgeClass: 'bg-sky-500/15 text-sky-300 border-sky-500/20'
  },
  completed: {
    label: 'Completed',
    icon: CheckCircle2,
    color: 'text-emerald-400',
    bg: 'from-emerald-500/20 via-emerald-600/10 to-transparent',
    border: 'border-emerald-500/30',
    badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20'
  }
} as const

const PRIORITY_CONFIG = {
  high: { label: 'High', className: 'bg-rose-500/15 text-rose-300 border-rose-500/20' },
  medium: { label: 'Medium', className: 'bg-amber-500/15 text-amber-300 border-amber-500/20' },
  low: { label: 'Low', className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20' }
} as const

const STATUS_ORDER: Task['status'][] = ['escalated', 'pending', 'in_progress', 'completed']

export function TasksPage() {
  const {
    tasks,
    employees,
    recurringTasks,
    updateTask,
    deleteTask,
    replyToTask,
    createRecurringTask,
    updateRecurringTask,
    deleteRecurringTask
  } = useAppStore()
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [replyText, setReplyText] = useState('')
  const [isReplying, setIsReplying] = useState(false)
  const [showScheduledForm, setShowScheduledForm] = useState(false)
  const [editingRecurringId, setEditingRecurringId] = useState<string | null>(null)
  const [scheduledForm, setScheduledForm] = useState({
    employeeId: '',
    name: '',
    brief: '',
    schedule: 'daily' as RecurringTask['schedule'],
    scheduleTime: '08:00',
    enabled: true
  })

  // Group tasks by status
  const grouped = STATUS_ORDER.map(status => ({
    status,
    config: STATUS_CONFIG[status],
    tasks: tasks.filter(t => t.status === status)
  })).filter(g => g.tasks.length > 0)

  const getEmployeeName = (id: string) => {
    const emp = employees.find(e => e.id === id)
    return emp ? `${emp.avatar} ${emp.name}` : 'Unknown'
  }

  const getEmployeeShort = (id: string) => {
    const emp = employees.find(e => e.id === id)
    return emp?.name || 'Unknown'
  }

  const toggleGroup = (status: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(status)) next.delete(status)
      else next.add(status)
      return next
    })
  }

  const handleReply = async (taskId: string) => {
    if (!replyText.trim() || isReplying) return
    setIsReplying(true)
    try {
      await replyToTask(taskId, replyText.trim())
      setReplyText('')
    } finally {
      setIsReplying(false)
    }
  }

  const handleStatusChange = async (taskId: string, newStatus: Task['status']) => {
    await updateTask(taskId, { status: newStatus })
  }

  const calculateNextRun = (schedule: RecurringTask['schedule'], scheduleTime?: string): string => {
    const now = new Date()
    if (schedule === 'hourly') return new Date(now.getTime() + 60 * 60 * 1000).toISOString()
    if (schedule === 'daily') {
      const [h, m] = (scheduleTime || '08:00').split(':').map(Number)
      const next = new Date(now)
      next.setHours(h, m, 0, 0)
      if (next <= now) next.setDate(next.getDate() + 1)
      return next.toISOString()
    }
    // weekly
    const parts = (scheduleTime || 'monday 08:00').split(' ')
    const dayName = parts[0]?.toLowerCase() || 'monday'
    const [h, m] = (parts[1] || '08:00').split(':').map(Number)
    const dayMap: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 }
    const targetDay = dayMap[dayName] ?? 1
    const next = new Date(now)
    next.setHours(h, m, 0, 0)
    let daysUntil = targetDay - next.getDay()
    if (daysUntil < 0) daysUntil += 7
    if (daysUntil === 0 && next <= now) daysUntil = 7
    next.setDate(next.getDate() + daysUntil)
    return next.toISOString()
  }

  const handleScheduledSubmit = async () => {
    if (!scheduledForm.name || !scheduledForm.employeeId || !scheduledForm.brief) return
    const timeValue = scheduledForm.schedule === 'weekly'
      ? `monday ${scheduledForm.scheduleTime}`
      : scheduledForm.scheduleTime

    if (editingRecurringId) {
      await updateRecurringTask(editingRecurringId, {
        employeeId: scheduledForm.employeeId,
        name: scheduledForm.name,
        brief: scheduledForm.brief,
        schedule: scheduledForm.schedule,
        scheduleTime: timeValue,
        enabled: scheduledForm.enabled,
        nextRunAt: calculateNextRun(scheduledForm.schedule, timeValue)
      })
    } else {
      await createRecurringTask({
        employeeId: scheduledForm.employeeId,
        name: scheduledForm.name,
        brief: scheduledForm.brief,
        schedule: scheduledForm.schedule,
        scheduleTime: timeValue,
        enabled: scheduledForm.enabled,
        lastRunAt: null,
        nextRunAt: calculateNextRun(scheduledForm.schedule, timeValue)
      })
    }
    setShowScheduledForm(false)
    setEditingRecurringId(null)
    setScheduledForm({ employeeId: '', name: '', brief: '', schedule: 'daily', scheduleTime: '08:00', enabled: true })
  }

  const handleEditRecurring = (task: RecurringTask) => {
    const time = task.scheduleTime || '08:00'
    const cleanTime = task.schedule === 'weekly' ? time.split(' ')[1] || '08:00' : time
    setScheduledForm({
      employeeId: task.employeeId,
      name: task.name,
      brief: task.brief,
      schedule: task.schedule,
      scheduleTime: cleanTime,
      enabled: task.enabled
    })
    setEditingRecurringId(task.id)
    setShowScheduledForm(true)
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="relative max-w-[960px] mx-auto" style={{ padding: '48px' }}>
        {/* Ambient orbs */}
        <div className="ambient-orb ambient-orb-1" style={{ top: '-50px', right: '-100px' }} />
        <div className="ambient-orb ambient-orb-3" style={{ bottom: '50px', left: '-60px' }} />

        {/* Header */}
        <div className="flex items-center justify-between" style={{ marginBottom: '48px' }}>
          <div>
            <h2 className="text-[28px] font-bold tracking-tight">
              <span className="gradient-text">Task Delegation</span>
            </h2>
            <p className="text-text-tertiary text-[15px]" style={{ marginTop: '8px' }}>
              Inter-agent tasks created when employees delegate work to each other
            </p>
          </div>
        </div>

        {/* Scheduled Tasks Section */}
        <div style={{ marginBottom: '48px' }}>
          <div className="flex items-center justify-between" style={{ marginBottom: '20px' }}>
            <div className="flex items-center" style={{ gap: '10px' }}>
              <CalendarClock className="w-[18px] h-[18px] text-flame-400" />
              <span className="text-[15px] font-semibold text-text-primary tracking-tight">Scheduled Tasks</span>
              <span className="text-[13px] text-text-tertiary tabular-nums">{recurringTasks.length}</span>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setShowScheduledForm(true)
                setEditingRecurringId(null)
                setScheduledForm({ employeeId: '', name: '', brief: '', schedule: 'daily', scheduleTime: '08:00', enabled: true })
              }}
            >
              <Plus className="w-3.5 h-3.5" />
              Schedule Task
            </Button>
          </div>

          {/* Scheduled form */}
          {showScheduledForm && (
            <div
              className="rounded-2xl bg-bg-elevated border border-border-default animate-fade-in"
              style={{ padding: '24px', marginBottom: '20px' }}
            >
              <div className="flex items-center justify-between" style={{ marginBottom: '20px' }}>
                <h4 className="text-[14px] font-semibold text-text-primary">
                  {editingRecurringId ? 'Edit Scheduled Task' : 'New Scheduled Task'}
                </h4>
                <button
                  onClick={() => { setShowScheduledForm(false); setEditingRecurringId(null) }}
                  className="text-text-tertiary hover:text-text-primary transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex flex-col" style={{ gap: '16px' }}>
                {/* Employee select */}
                <div>
                  <label className="text-[12px] text-text-tertiary font-medium" style={{ display: 'block', marginBottom: '6px' }}>Assign to Employee</label>
                  <select
                    value={scheduledForm.employeeId}
                    onChange={(e) => setScheduledForm(f => ({ ...f, employeeId: e.target.value }))}
                    className="w-full rounded-xl bg-bg-tertiary border border-border-default text-[13px] text-text-primary focus:outline-none focus:ring-2 focus:ring-flame-500/25 focus:border-flame-500/40"
                    style={{ padding: '10px 14px' }}
                  >
                    <option value="">Select employee...</option>
                    {employees.map(e => (
                      <option key={e.id} value={e.id}>{e.avatar} {e.name} — {e.role}</option>
                    ))}
                  </select>
                </div>

                {/* Name */}
                <div>
                  <label className="text-[12px] text-text-tertiary font-medium" style={{ display: 'block', marginBottom: '6px' }}>Task Name</label>
                  <input
                    type="text"
                    value={scheduledForm.name}
                    onChange={(e) => setScheduledForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Daily standup report"
                    className="w-full rounded-xl bg-bg-tertiary border border-border-default text-[13px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-flame-500/25 focus:border-flame-500/40"
                    style={{ padding: '10px 14px' }}
                  />
                </div>

                {/* Brief */}
                <div>
                  <label className="text-[12px] text-text-tertiary font-medium" style={{ display: 'block', marginBottom: '6px' }}>Brief / Instructions</label>
                  <textarea
                    value={scheduledForm.brief}
                    onChange={(e) => setScheduledForm(f => ({ ...f, brief: e.target.value }))}
                    placeholder="Describe what the employee should do..."
                    rows={3}
                    className="w-full rounded-xl bg-bg-tertiary border border-border-default text-[13px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-flame-500/25 focus:border-flame-500/40 resize-none"
                    style={{ padding: '10px 14px' }}
                  />
                </div>

                {/* Schedule type + time */}
                <div className="flex" style={{ gap: '12px' }}>
                  <div className="flex-1">
                    <label className="text-[12px] text-text-tertiary font-medium" style={{ display: 'block', marginBottom: '6px' }}>Schedule</label>
                    <select
                      value={scheduledForm.schedule}
                      onChange={(e) => setScheduledForm(f => ({ ...f, schedule: e.target.value as RecurringTask['schedule'] }))}
                      className="w-full rounded-xl bg-bg-tertiary border border-border-default text-[13px] text-text-primary focus:outline-none focus:ring-2 focus:ring-flame-500/25 focus:border-flame-500/40"
                      style={{ padding: '10px 14px' }}
                    >
                      <option value="hourly">Hourly</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                    </select>
                  </div>
                  {scheduledForm.schedule !== 'hourly' && (
                    <div className="flex-1">
                      <label className="text-[12px] text-text-tertiary font-medium" style={{ display: 'block', marginBottom: '6px' }}>Time</label>
                      <input
                        type="time"
                        value={scheduledForm.scheduleTime}
                        onChange={(e) => setScheduledForm(f => ({ ...f, scheduleTime: e.target.value }))}
                        className="w-full rounded-xl bg-bg-tertiary border border-border-default text-[13px] text-text-primary focus:outline-none focus:ring-2 focus:ring-flame-500/25 focus:border-flame-500/40"
                        style={{ padding: '10px 14px' }}
                      />
                    </div>
                  )}
                </div>

                {/* Submit */}
                <div className="flex justify-end" style={{ gap: '8px' }}>
                  <Button variant="secondary" size="sm" onClick={() => { setShowScheduledForm(false); setEditingRecurringId(null) }}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleScheduledSubmit}
                    disabled={!scheduledForm.name || !scheduledForm.employeeId || !scheduledForm.brief}
                  >
                    {editingRecurringId ? 'Update' : 'Create'}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Recurring task cards */}
          {recurringTasks.length > 0 ? (
            <div className="flex flex-col" style={{ gap: '10px' }}>
              {recurringTasks.map((rt, i) => {
                const emp = employees.find(e => e.id === rt.employeeId)
                const scheduleLabel = rt.schedule === 'hourly' ? 'Every hour' : rt.schedule === 'daily' ? `Daily at ${rt.scheduleTime || '08:00'}` : `Weekly — ${rt.scheduleTime || 'monday 08:00'}`

                return (
                  <div
                    key={rt.id}
                    className="group relative flex items-center rounded-xl bg-bg-elevated border border-border-default hover:border-border-bright transition-all duration-300"
                    style={{
                      padding: '16px 20px',
                      gap: '16px',
                      animationDelay: `${i * 60}ms`,
                      animation: 'scale-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) both'
                    }}
                  >
                    <Switch
                      checked={rt.enabled}
                      onCheckedChange={(checked) => updateRecurringTask(rt.id, { enabled: checked })}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center" style={{ gap: '8px', marginBottom: '4px' }}>
                        <p className="text-[13px] font-medium text-text-primary truncate">{rt.name}</p>
                        <Badge variant="secondary" className="text-[11px]">{scheduleLabel}</Badge>
                      </div>
                      <div className="flex items-center text-[11px] text-text-tertiary" style={{ gap: '12px' }}>
                        <span>{emp ? `${emp.avatar} ${emp.name}` : 'Unknown'}</span>
                        {rt.lastRunAt && <span>Last: {new Date(rt.lastRunAt).toLocaleString()}</span>}
                        <span>Next: {new Date(rt.nextRunAt).toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity" style={{ gap: '4px' }}>
                      <button
                        onClick={() => handleEditRecurring(rt)}
                        className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-white/[0.05] transition-all cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => deleteRecurringTask(rt.id)}
                        className="p-1.5 rounded-lg text-text-tertiary hover:text-rose-400 hover:bg-white/[0.05] transition-all cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : !showScheduledForm ? (
            <p className="text-[13px] text-text-tertiary text-center" style={{ padding: '20px 0' }}>
              No scheduled tasks yet. Create one to automate recurring work.
            </p>
          ) : null}
        </div>

        {/* Task Groups */}
        {grouped.length > 0 ? (
          <div className="flex flex-col" style={{ gap: '40px' }}>
            {grouped.map(({ status, config, tasks: groupTasks }) => {
              const StatusIcon = config.icon
              const isCollapsed = collapsedGroups.has(status)

              return (
                <div key={status}>
                  {/* Group header */}
                  <button
                    onClick={() => toggleGroup(status)}
                    className="flex items-center w-full text-left cursor-pointer group"
                    style={{ gap: '12px', marginBottom: isCollapsed ? '0px' : '20px' }}
                  >
                    {isCollapsed
                      ? <ChevronRight className="w-4 h-4 text-text-tertiary" />
                      : <ChevronDown className="w-4 h-4 text-text-tertiary" />
                    }
                    <StatusIcon className={`w-[18px] h-[18px] ${config.color}`} />
                    <span className="text-[15px] font-semibold text-text-primary tracking-tight">
                      {config.label}
                    </span>
                    <span className="text-[13px] text-text-tertiary tabular-nums">
                      {groupTasks.length}
                    </span>
                  </button>

                  {/* Task cards */}
                  {!isCollapsed && (
                    <div className="flex flex-col" style={{ gap: '12px' }}>
                      {groupTasks.map((task, i) => {
                        const isExpanded = expandedTaskId === task.id
                        const priorityConf = PRIORITY_CONFIG[task.priority]

                        return (
                          <div
                            key={task.id}
                            className={`group relative rounded-2xl bg-bg-elevated border transition-all duration-500 overflow-hidden ${
                              status === 'escalated'
                                ? 'border-rose-500/20 hover:border-rose-500/40'
                                : 'border-border-default hover:border-border-bright'
                            }`}
                            style={{
                              animationDelay: `${i * 60}ms`,
                              animation: 'scale-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) both',
                            }}
                          >
                            {/* Escalated glow */}
                            {status === 'escalated' && (
                              <div className="absolute inset-0 bg-gradient-to-r from-rose-500/[0.04] via-transparent to-transparent pointer-events-none" />
                            )}

                            {/* Summary row */}
                            <button
                              className="relative flex items-center w-full text-left cursor-pointer"
                              style={{ gap: '16px', padding: '20px 24px' }}
                              onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
                            >
                              {isExpanded
                                ? <ChevronDown className="w-4 h-4 text-text-tertiary shrink-0" />
                                : <ChevronRight className="w-4 h-4 text-text-tertiary shrink-0" />
                              }

                              <div className="flex-1 min-w-0">
                                <p className="text-[14px] font-medium text-text-primary truncate">
                                  {task.objective}
                                </p>
                                <p className="text-[12px] text-text-tertiary" style={{ marginTop: '4px' }}>
                                  {getEmployeeShort(task.fromEmployeeId)} → {getEmployeeShort(task.toEmployeeId)}
                                </p>
                              </div>

                              <Badge className={priorityConf.className}>
                                {priorityConf.label}
                              </Badge>

                              {task.deadline && (
                                <span className="text-[12px] text-text-tertiary shrink-0">
                                  {task.deadline}
                                </span>
                              )}
                            </button>

                            {/* Expanded details */}
                            {isExpanded && (
                              <div
                                className="relative border-t border-white/[0.04] animate-fade-in"
                                style={{ padding: '24px' }}
                              >
                                {/* Agent Brief */}
                                <div
                                  className="rounded-xl bg-white/[0.02] border border-white/[0.04] font-mono text-[13px]"
                                  style={{ padding: '20px', marginBottom: '20px' }}
                                >
                                  <p className="text-text-secondary font-semibold" style={{ marginBottom: '12px' }}>AGENT BRIEF</p>
                                  <div className="flex flex-col text-text-tertiary" style={{ gap: '4px' }}>
                                    <p><span className="text-text-secondary">To:</span> {getEmployeeName(task.toEmployeeId)}</p>
                                    <p><span className="text-text-secondary">From:</span> {getEmployeeName(task.fromEmployeeId)}</p>
                                    <p><span className="text-text-secondary">Priority:</span> <span className={PRIORITY_CONFIG[task.priority].className.split(' ')[1]}>{task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}</span></p>
                                    {task.deadline && <p><span className="text-text-secondary">Deadline:</span> {task.deadline}</p>}
                                  </div>

                                  <div style={{ marginTop: '16px' }}>
                                    <p className="text-text-secondary font-semibold" style={{ marginBottom: '4px' }}>Objective:</p>
                                    <p className="text-text-tertiary">{task.objective}</p>
                                  </div>

                                  <div style={{ marginTop: '12px' }}>
                                    <p className="text-text-secondary font-semibold" style={{ marginBottom: '4px' }}>Context:</p>
                                    <p className="text-text-tertiary whitespace-pre-wrap">{task.context}</p>
                                  </div>

                                  <div style={{ marginTop: '12px' }}>
                                    <p className="text-text-secondary font-semibold" style={{ marginBottom: '4px' }}>Deliverable:</p>
                                    <p className="text-text-tertiary whitespace-pre-wrap">{task.deliverable}</p>
                                  </div>

                                  <div style={{ marginTop: '12px' }}>
                                    <p className="text-text-secondary font-semibold" style={{ marginBottom: '4px' }}>Acceptance Criteria:</p>
                                    <p className="text-text-tertiary whitespace-pre-wrap">{task.acceptanceCriteria}</p>
                                  </div>

                                  <div style={{ marginTop: '12px' }}>
                                    <p className="text-text-secondary font-semibold" style={{ marginBottom: '4px' }}>Escalate to founder if:</p>
                                    <p className="text-text-tertiary whitespace-pre-wrap">{task.escalateIf}</p>
                                  </div>
                                </div>

                                {/* Task Thread */}
                                {task.messages && task.messages.length > 0 && (
                                  <div style={{ marginTop: '16px', marginBottom: '20px' }}>
                                    <p className="text-[12px] font-medium text-text-tertiary uppercase tracking-wider" style={{ marginBottom: '12px' }}>Activity</p>
                                    <div className="flex flex-col" style={{ gap: '8px' }}>
                                      {task.messages.map((msg) => (
                                        <div key={msg.id} className={`rounded-lg ${
                                          msg.role === 'tool' ? 'bg-white/[0.02]' : msg.role === 'user' ? 'bg-flame-500/[0.06] border border-flame-500/15' : 'bg-bg-tertiary border border-border-default'
                                        }`} style={{ padding: '10px 14px' }}>
                                          <div className="flex items-center" style={{ gap: '6px', marginBottom: '4px' }}>
                                            {msg.role === 'tool' && <Wrench className="w-3 h-3 text-text-tertiary" />}
                                            {msg.role === 'agent' && <Bot className="w-3 h-3 text-sky-400" />}
                                            {msg.role === 'user' && <User className="w-3 h-3 text-flame-400" />}
                                            <span className="text-[11px] text-text-tertiary">
                                              {msg.role === 'tool' ? 'Tool' : msg.role === 'user' ? 'You' : employees.find(e => e.id === msg.employeeId)?.name || 'Agent'}
                                            </span>
                                            <span className="text-[10px] text-text-tertiary ml-auto">
                                              {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                          </div>
                                          <p className={`text-[13px] ${msg.role === 'tool' ? 'text-text-tertiary' : 'text-text-primary'} whitespace-pre-wrap`}>{msg.content}</p>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Fallback: show response if no messages but response exists */}
                                {(!task.messages || task.messages.length === 0) && task.response && (
                                  <div
                                    className="rounded-xl bg-emerald-500/[0.04] border border-emerald-500/10"
                                    style={{ padding: '20px', marginBottom: '20px' }}
                                  >
                                    <p className="text-[13px] text-emerald-400 font-semibold" style={{ marginBottom: '8px' }}>Response</p>
                                    <p className="text-[13px] text-text-secondary whitespace-pre-wrap">{task.response}</p>
                                  </div>
                                )}

                                {/* Reply input */}
                                {(task.status === 'in_progress' || task.status === 'escalated') && (
                                  <div style={{ marginBottom: '20px' }}>
                                    <div className="flex" style={{ gap: '8px' }}>
                                      <input
                                        value={expandedTaskId === task.id ? replyText : ''}
                                        onChange={(e) => setReplyText(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleReply(task.id)}
                                        placeholder="Reply to this task..."
                                        className="flex-1 rounded-lg bg-bg-tertiary border border-border-default text-[13px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-flame-500/30"
                                        style={{ padding: '10px 14px' }}
                                        disabled={isReplying}
                                      />
                                      <Button size="sm" onClick={() => handleReply(task.id)} disabled={!replyText.trim() || isReplying}>
                                        {isReplying ? 'Sending...' : 'Send'}
                                      </Button>
                                    </div>
                                  </div>
                                )}

                                {/* Actions */}
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center" style={{ gap: '8px' }}>
                                    {status !== 'in_progress' && status !== 'completed' && (
                                      <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => handleStatusChange(task.id, 'in_progress')}
                                      >
                                        <PlayCircle className="w-3.5 h-3.5" />
                                        Start
                                      </Button>
                                    )}
                                    {status !== 'completed' && (
                                      <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => handleStatusChange(task.id, 'completed')}
                                      >
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                        Complete
                                      </Button>
                                    )}
                                    {status !== 'escalated' && (
                                      <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => handleStatusChange(task.id, 'escalated')}
                                      >
                                        <ArrowUpRight className="w-3.5 h-3.5" />
                                        Escalate
                                      </Button>
                                    )}
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-text-tertiary hover:text-rose-400"
                                    onClick={() => deleteTask(task.id)}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </div>

                                <p className="text-[11px] text-text-tertiary" style={{ marginTop: '16px' }}>
                                  Created {new Date(task.createdAt).toLocaleString()}
                                  {task.updatedAt !== task.createdAt && ` · Updated ${new Date(task.updatedAt).toLocaleString()}`}
                                </p>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="relative flex flex-col items-center justify-center text-center rounded-2xl border border-dashed border-border-default bg-bg-secondary overflow-hidden" style={{ paddingTop: '80px', paddingBottom: '80px' }}>
            <div className="absolute inset-0 gradient-mesh opacity-60" />
            <div className="relative flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-flame-500/15 to-ember-500/10 shadow-[0_0_24px_-6px_rgba(249,115,22,0.2)]" style={{ marginBottom: '20px' }}>
              <ClipboardList className="w-7 h-7 text-flame-400" />
            </div>
            <h3 className="relative text-[18px] font-bold gradient-text" style={{ marginBottom: '8px' }}>No tasks yet</h3>
            <p className="relative text-[13px] text-text-tertiary max-w-md leading-relaxed" style={{ marginBottom: '24px' }}>
              Tasks appear here when AI employees delegate work to each other using the Agent Brief format.
              Configure contact access in employee settings to enable delegation.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
