import { useEffect } from 'react'
import { Sidebar } from '@/components/layout/sidebar'
import { Dashboard } from '@/components/dashboard/dashboard'
import { EmployeesPage } from '@/components/employees/employees-page'
import { ChatPage } from '@/components/chat/chat-page'
import { KnowledgePage } from '@/components/knowledge/knowledge-page'
import { TasksPage } from '@/components/tasks/tasks-page'
import { SettingsPage } from '@/components/settings/settings-page'
import { useAppStore, type ChatMessage } from '@/stores/app-store'

export default function App() {
  const { activeView, loadCompanies, loadEmployees, loadTerminatedEmployees, loadDepartments, loadKnowledge, loadTasks, loadSettings } = useAppStore()

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
        loadSettings()
      ])
    }
    init()
  }, [loadCompanies, loadEmployees, loadTerminatedEmployees, loadDepartments, loadKnowledge, loadTasks, loadSettings])

  // Set up streaming listener
  useEffect(() => {
    if (!window.api?.chat?.onStream) return
    const unsub = window.api.chat.onStream((data) => {
      useAppStore.getState().setStreamingContent(data.conversationId, data.chunk)
    })
    return unsub
  }, [])

  // Set up message stored listener (backend confirms user/assistant messages)
  useEffect(() => {
    if (!window.api?.chat?.onMessageStored) return
    const unsub = window.api.chat.onMessageStored((data) => {
      const msg = data.message as ChatMessage
      useAppStore.setState((state) => ({
        conversations: state.conversations.map(c =>
          c.id === data.conversationId
            ? { ...c, messages: [...c.messages.filter(m => !m.id.startsWith('temp-')), msg] }
            : c
        )
      }))
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
        <div className="absolute inset-0 gradient-mesh pointer-events-none" />
        <div className="relative h-full">
          {renderView()}
        </div>
      </main>
    </div>
  )
}
