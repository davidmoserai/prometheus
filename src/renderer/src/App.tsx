import { useEffect, useState } from 'react'
import { Sidebar } from '@/components/layout/sidebar'
import { Dashboard } from '@/components/dashboard/dashboard'
import { EmployeesPage } from '@/components/employees/employees-page'
import { ChatPage } from '@/components/chat/chat-page'
import { KnowledgePage } from '@/components/knowledge/knowledge-page'
import { TasksPage } from '@/components/tasks/tasks-page'
import { SettingsPage } from '@/components/settings/settings-page'
import { useAppStore, type ChatMessage } from '@/stores/app-store'

export default function App() {
  const { activeView, loadCompanies, loadEmployees, loadTerminatedEmployees, loadDepartments, loadKnowledge, loadTasks, loadRecurringTasks, loadSettings, loadMcpServers, loadComposioStatus } = useAppStore()
  const [updateReady, setUpdateReady] = useState(false)

  // Load companies first, then scoped data
  useEffect(() => {
    const init = async () => {
      await loadCompanies()
      await Promise.all([
        loadEmployees(),
        loadTerminatedEmployees(),
        loadDepartments(),
        loadKnowledge(),
        loadTasks(),
        loadRecurringTasks(),
        loadSettings(),
        loadMcpServers(),
        loadComposioStatus()
      ])
    }
    init()
  }, [loadCompanies, loadEmployees, loadTerminatedEmployees, loadDepartments, loadKnowledge, loadTasks, loadRecurringTasks, loadSettings, loadMcpServers, loadComposioStatus])

  // Set up streaming listener (receives text deltas)
  useEffect(() => {
    if (!window.api?.chat?.onStream) return
    const unsub = window.api.chat.onStream((data) => {
      useAppStore.getState().appendStreamText(data.conversationId, data.chunk)
    })
    return unsub
  }, [])

  // Set up tool call listener (chronological inline rendering)
  useEffect(() => {
    if (!window.api?.chat?.onToolCall) return
    const unsub = window.api.chat.onToolCall((data) => {
      useAppStore.getState().appendStreamPart(data.conversationId, {
        type: 'tool_call',
        id: data.id,
        tool: data.tool,
        summary: data.summary,
        detail: data.detail,
        status: 'done'
      })
    })
    return unsub
  }, [])

  // Set up file written listener (inline rendering with images)
  useEffect(() => {
    if (!window.api?.chat?.onFileWritten) return
    const unsub = window.api.chat.onFileWritten((data) => {
      useAppStore.getState().appendStreamPart(data.conversationId, {
        type: 'file_written',
        path: data.path,
        content: data.content
      })
    })
    return unsub
  }, [])

  // Set up tool approval request listener
  useEffect(() => {
    if (!window.api?.chat?.onApprovalRequest) return
    const unsub = window.api.chat.onApprovalRequest((data) => {
      useAppStore.getState().appendStreamPart(data.conversationId, {
        type: 'tool_approval',
        approvalId: data.approvalId,
        tool: data.tool,
        args: data.args,
        summary: data.summary,
        status: 'pending'
      })
      useAppStore.getState().addNotification({
        type: 'tool_approval',
        title: 'Tool Approval Needed',
        body: `${data.tool} requires your approval`
      })
    })
    return unsub
  }, [])

  // Set up message stored listener (backend confirms user/assistant messages)
  useEffect(() => {
    if (!window.api?.chat?.onMessageStored) return
    const unsub = window.api.chat.onMessageStored((data) => {
      const msg = data.message as ChatMessage
      useAppStore.setState((state) => {
        const newState: Record<string, unknown> = {
          conversations: state.conversations.map(c =>
            c.id === data.conversationId
              ? { ...c, messages: [...c.messages.filter(m => !m.id.startsWith('temp-') && m.id !== msg.id), msg] }
              : c
          )
        }
        // Remove text parts from streaming when assistant message is stored to prevent duplicates
        // Keep tool_call, file_written, and tool_approval parts as they're not in the persisted message
        if (msg.role === 'assistant' && state.streamingParts[data.conversationId]) {
          const nonTextParts = state.streamingParts[data.conversationId].filter(p => p.type !== 'text')
          if (nonTextParts.length > 0) {
            newState.streamingParts = { ...state.streamingParts, [data.conversationId]: nonTextParts }
          } else {
            const { [data.conversationId]: _, ...rest } = state.streamingParts
            newState.streamingParts = rest
          }
        }
        return newState
      })
    })
    return unsub
  }, [])

  // Set up task update listener (real-time updates from background task execution)
  useEffect(() => {
    if (!window.api?.tasks?.onUpdate) return
    const unsub = window.api.tasks.onUpdate(() => {
      useAppStore.getState().loadTasks()
    })
    return unsub
  }, [])

  // Set up recurring task executed listener
  useEffect(() => {
    if (!window.api?.recurringTasks?.onExecuted) return
    const unsub = window.api.recurringTasks.onExecuted(() => {
      useAppStore.getState().loadRecurringTasks()
      useAppStore.getState().loadTasks()
    })
    return unsub
  }, [])

  // Set up notification listener from main process
  useEffect(() => {
    if (!window.api?.notifications?.onNotification) return
    const unsub = window.api.notifications.onNotification((data) => {
      useAppStore.getState().addNotification({
        type: data.type as 'task_completed' | 'task_escalated' | 'recurring_executed' | 'tool_approval' | 'info',
        title: data.title,
        body: data.body
      })
    })
    return unsub
  }, [])

  // Listen for MCP server status changes (health check failures, idle disconnects)
  useEffect(() => {
    if (!window.api?.mcp?.onStatusChange) return
    const unsub = window.api.mcp.onStatusChange((data) => {
      if (data.status === 'error' || data.status === 'disconnected') {
        const mcpServers = useAppStore.getState().mcpServers
        const serverName = mcpServers.find(s => s.id === data.serverId)?.name || data.serverId
        useAppStore.getState().addNotification({
          type: 'info',
          title: 'MCP Server Disconnected',
          body: `${serverName} disconnected${data.error ? `: ${data.error}` : ''}`
        })
        // Reload MCP server list to reflect updated connection status
        useAppStore.getState().loadMcpServers()
      }
    })
    return unsub
  }, [])

  // Listen for auto-update downloaded event
  useEffect(() => {
    if (!window.api?.updates?.onDownloaded) return
    const unsub = window.api.updates.onDownloaded(() => {
      setUpdateReady(true)
    })
    return unsub
  }, [])

  const renderView = () => {
    switch (activeView) {
      case 'dashboard':
        return <Dashboard />
      case 'employees':
        return <EmployeesPage />
      case 'chat':
        return <ChatPage />
      case 'knowledge':
        return <KnowledgePage />
      case 'tasks':
        return <TasksPage />
      case 'settings':
        return <SettingsPage />
    }
  }

  return (
    <div className="flex bg-bg-primary" style={{ height: '100vh', overflow: 'hidden' }}>
      <Sidebar />
      <main className="relative flex-1" style={{ height: '100%', overflow: 'hidden' }}>
        {updateReady && (
          <div className="relative z-50 flex items-center justify-center gap-3 bg-flame-500/90 px-4 py-2 text-sm font-medium text-white">
            <span>Update available. Restart to update.</span>
            <button
              onClick={() => window.api?.updates?.install()}
              className="rounded-lg bg-white/20 px-3 py-1 text-xs font-semibold transition-colors hover:bg-white/30"
            >
              Restart
            </button>
          </div>
        )}
        <div className="absolute inset-0 gradient-mesh pointer-events-none" />
        <div className="relative h-full">
          {renderView()}
        </div>
      </main>
    </div>
  )
}
