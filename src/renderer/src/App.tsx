import { useEffect } from 'react'
import { Sidebar } from '@/components/layout/sidebar'
import { Dashboard } from '@/components/dashboard/dashboard'
import { EmployeesPage } from '@/components/employees/employees-page'
import { ChatPage } from '@/components/chat/chat-page'
import { KnowledgePage } from '@/components/knowledge/knowledge-page'
import { SettingsPage } from '@/components/settings/settings-page'
import { useAppStore } from '@/stores/app-store'

export default function App() {
  const { activeView, loadEmployees, loadKnowledge, loadSettings } = useAppStore()

  useEffect(() => {
    loadEmployees()
    loadKnowledge()
    loadSettings()
  }, [loadEmployees, loadKnowledge, loadSettings])

  // Set up streaming listener
  useEffect(() => {
    if (!window.api?.chat?.onStream) return
    const unsub = window.api.chat.onStream((data) => {
      useAppStore.getState().setStreamingContent(data.conversationId, data.chunk)
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
      case 'settings':
        return <SettingsPage />
    }
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg-primary">
      <Sidebar />
      <main className="flex-1 overflow-hidden">
        {renderView()}
      </main>
    </div>
  )
}
