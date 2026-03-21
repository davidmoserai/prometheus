import { useState, useEffect, useRef } from 'react'
import { Send, Plus, MessageSquare, ChevronLeft, Users, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAppStore, type Conversation, type ChatMessage } from '@/stores/app-store'

export function ChatPage() {
  const {
    employees,
    conversations,
    selectedEmployeeId,
    selectedConversationId,
    streamingContent,
    setSelectedEmployee,
    setSelectedConversation,
    loadConversations,
    createConversation,
    sendMessage,
    setActiveView,
    setCreatingEmployee
  } = useAppStore()

  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const selectedEmployee = employees.find((e) => e.id === selectedEmployeeId)
  const activeConversation = conversations.find((c) => c.id === selectedConversationId)
  const currentStreaming = selectedConversationId ? streamingContent[selectedConversationId] : undefined

  useEffect(() => {
    if (selectedEmployeeId) {
      loadConversations(selectedEmployeeId)
    }
  }, [selectedEmployeeId, loadConversations])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeConversation?.messages, currentStreaming])

  const handleSend = async () => {
    if (!input.trim() || isSending) return
    const msg = input.trim()
    setInput('')

    let convId = selectedConversationId
    if (!convId && selectedEmployeeId) {
      const conv = await createConversation(selectedEmployeeId)
      convId = conv.id
    }
    if (!convId) return

    setIsSending(true)
    try {
      await sendMessage(convId, msg)
    } finally {
      setIsSending(false)
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // No employee selected — show employee picker
  if (!selectedEmployeeId) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-flame-500/10 border border-flame-500/20 mx-auto mb-4">
            <MessageSquare className="w-8 h-8 text-flame-400" />
          </div>
          <h2 className="text-xl font-bold text-text-primary mb-2">Start a Conversation</h2>
          <p className="text-text-tertiary mb-6">Select an employee to chat with</p>

          {employees.length > 0 ? (
            <div className="space-y-2">
              {employees.map((emp) => (
                <button
                  key={emp.id}
                  onClick={() => setSelectedEmployee(emp.id)}
                  className="flex items-center gap-3 w-full p-3 rounded-xl border border-border-subtle hover:border-flame-500/30 bg-bg-secondary hover:bg-bg-tertiary transition-all cursor-pointer"
                >
                  <span className="text-xl">{emp.avatar}</span>
                  <div className="text-left flex-1">
                    <p className="font-medium text-text-primary text-sm">{emp.name}</p>
                    <p className="text-xs text-text-tertiary">{emp.role}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-text-tertiary" />
                </button>
              ))}
            </div>
          ) : (
            <div>
              <p className="text-sm text-text-tertiary mb-4">You don&apos;t have any employees yet.</p>
              <Button onClick={() => {
                setActiveView('employees')
                setCreatingEmployee(true)
              }}>
                <Users className="w-4 h-4" />
                Hire First Employee
              </Button>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex">
      {/* Conversation Sidebar */}
      <div className="w-64 border-r border-border-subtle bg-bg-secondary flex flex-col">
        <div className="p-4 border-b border-border-subtle">
          <div className="flex items-center gap-2 mb-3">
            <button
              onClick={() => setSelectedEmployee(null)}
              className="p-1 rounded-md text-text-tertiary hover:text-text-primary hover:bg-bg-surface transition-all cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-lg">{selectedEmployee?.avatar}</span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-text-primary truncate">{selectedEmployee?.name}</p>
                <p className="text-xs text-text-tertiary truncate">{selectedEmployee?.role}</p>
              </div>
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            onClick={async () => {
              if (selectedEmployeeId) {
                await createConversation(selectedEmployeeId)
              }
            }}
          >
            <Plus className="w-3.5 h-3.5" />
            New Chat
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => setSelectedConversation(conv.id)}
              className={`flex items-center gap-2 w-full px-3 py-2.5 rounded-lg text-left transition-all cursor-pointer ${
                selectedConversationId === conv.id
                  ? 'bg-flame-500/10 text-flame-400'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-surface'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5 shrink-0" />
              <span className="text-sm truncate">{conv.title}</span>
            </button>
          ))}
          {conversations.length === 0 && (
            <p className="text-xs text-text-tertiary text-center py-4">No conversations yet</p>
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        {activeConversation ? (
          <>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {activeConversation.messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} employeeName={selectedEmployee?.name} employeeAvatar={selectedEmployee?.avatar} />
              ))}
              {currentStreaming && !activeConversation.messages.find(m => m.content === currentStreaming) && (
                <div className="flex gap-3 animate-fade-in">
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-bg-surface text-sm shrink-0">
                    {selectedEmployee?.avatar}
                  </div>
                  <div className="flex-1 max-w-2xl">
                    <div className="rounded-2xl rounded-tl-md bg-bg-secondary border border-border-subtle px-4 py-3">
                      <p className="text-sm text-text-primary whitespace-pre-wrap">{currentStreaming}</p>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 border-t border-border-subtle">
              <div className="flex gap-2 items-end max-w-3xl mx-auto">
                <div className="flex-1 relative">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={`Message ${selectedEmployee?.name}...`}
                    rows={1}
                    className="flex w-full rounded-xl border border-border-subtle bg-bg-secondary px-4 py-3 pr-12 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-flame-500/30 focus:border-flame-500/50 transition-all resize-none"
                    style={{ minHeight: '44px', maxHeight: '120px' }}
                  />
                </div>
                <Button
                  size="icon"
                  onClick={handleSend}
                  disabled={!input.trim() || isSending}
                  className="shrink-0 h-11 w-11 rounded-xl"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="text-4xl mb-3">{selectedEmployee?.avatar}</div>
              <h3 className="text-lg font-semibold text-text-primary">{selectedEmployee?.name}</h3>
              <p className="text-sm text-text-tertiary mt-1 mb-4">{selectedEmployee?.role}</p>
              <div className="flex gap-2 justify-center mb-4">
                {selectedEmployee?.tools.filter(t => t.enabled).slice(0, 3).map(t => (
                  <Badge key={t.id} variant="secondary">{t.name}</Badge>
                ))}
              </div>
              <Button
                onClick={async () => {
                  if (selectedEmployeeId) {
                    await createConversation(selectedEmployeeId)
                  }
                }}
              >
                <MessageSquare className="w-4 h-4" />
                Start Conversation
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function MessageBubble({
  message,
  employeeName,
  employeeAvatar
}: {
  message: ChatMessage
  employeeName?: string
  employeeAvatar?: string
}) {
  const isUser = message.role === 'user'

  return (
    <div className={`flex gap-3 animate-fade-in ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`flex items-center justify-center w-8 h-8 rounded-lg shrink-0 text-sm ${
        isUser ? 'bg-flame-600 text-white font-medium' : 'bg-bg-surface'
      }`}>
        {isUser ? 'You' : employeeAvatar || '🤖'}
      </div>
      <div className={`flex-1 ${isUser ? 'flex justify-end' : ''}`}>
        <div className="max-w-2xl">
          {!isUser && (
            <p className="text-xs text-text-tertiary mb-1 font-medium">{employeeName}</p>
          )}
          <div className={`rounded-2xl px-4 py-3 ${
            isUser
              ? 'bg-flame-600 text-white rounded-tr-md'
              : 'bg-bg-secondary border border-border-subtle rounded-tl-md'
          }`}>
            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
          </div>
          <p className={`text-xs mt-1 ${isUser ? 'text-right' : ''} text-text-tertiary`}>
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>
    </div>
  )
}
