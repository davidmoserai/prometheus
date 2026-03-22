import { useState, useEffect, useRef } from 'react'
import { Send, Plus, MessageSquare, ChevronLeft, Users, ArrowRight, Flame, Trash2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
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
    deleteConversation,
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

    // Optimistically add user message to conversation immediately
    const optimisticMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: msg,
      timestamp: new Date().toISOString()
    }
    useAppStore.setState((state) => ({
      conversations: state.conversations.map(c =>
        c.id === convId ? { ...c, messages: [...c.messages, optimisticMsg] } : c
      )
    }))

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

  // No employee selected -- show employee picker
  if (!selectedEmployeeId) {
    return (
      <div className="h-full flex flex-col items-center justify-center relative" style={{ padding: '40px' }}>
        {/* Ambient orbs */}
        <div className="ambient-orb ambient-orb-1" style={{ top: '20%', right: '10%' }} />
        <div className="ambient-orb ambient-orb-2" style={{ bottom: '20%', left: '15%' }} />

        <div className="relative flex flex-col items-center w-full max-w-sm">
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-flame-500/15 to-ember-500/10 breathe-flame" style={{ marginBottom: '24px' }}>
            <MessageSquare className="w-8 h-8 text-flame-400" />
          </div>
          <h2 className="text-xl font-bold text-text-primary tracking-tight gradient-text" style={{ marginBottom: '8px' }}>Start a Conversation</h2>
          <p className="text-text-tertiary text-[14px]" style={{ marginBottom: '40px' }}>Select an employee to chat with</p>

          {employees.length > 0 ? (
            <div className="flex flex-col w-full" style={{ gap: '12px' }}>
              {employees.map((emp, i) => (
                <button
                  key={emp.id}
                  onClick={() => setSelectedEmployee(emp.id)}
                  className="flex items-center w-full rounded-xl bg-bg-elevated hover:bg-bg-surface border border-border-default hover:border-border-bright transition-all duration-400 cursor-pointer group"
                  style={{
                    gap: '16px',
                    padding: '16px',
                    animationDelay: `${i * 60}ms`,
                    animation: 'scale-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) both',
                  }}
                >
                  <span className="text-xl">{emp.avatar}</span>
                  <div className="text-left flex-1">
                    <p className="font-medium text-text-primary text-[13px]">{emp.name}</p>
                    <p className="text-[12px] text-text-tertiary">{emp.role}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-text-tertiary opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-300" />
                </button>
              ))}
            </div>
          ) : (
            <div>
              <p className="text-[13px] text-text-tertiary" style={{ marginBottom: '20px' }}>You don&apos;t have any employees yet.</p>
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
      <div className="relative w-[256px] border-r border-border-default bg-bg-secondary flex flex-col overflow-hidden">
        {/* Subtle glow at top */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[180px] h-[80px] bg-gradient-to-b from-flame-500/[0.03] to-transparent pointer-events-none" />

        <div className="relative z-10" style={{ padding: '16px', paddingBottom: '12px' }}>
          <div className="flex items-center" style={{ gap: '8px', marginBottom: '16px' }}>
            <button
              onClick={() => setSelectedEmployee(null)}
              className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-white/[0.05] transition-all cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center flex-1 min-w-0" style={{ gap: '10px' }}>
              <span className="text-lg">{selectedEmployee?.avatar}</span>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-text-primary truncate">{selectedEmployee?.name}</p>
                <p className="text-[11px] text-text-tertiary truncate">{selectedEmployee?.role}</p>
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

        <div className="relative flex-1 overflow-y-auto z-10 flex flex-col" style={{ paddingLeft: '8px', paddingRight: '8px', paddingBottom: '8px', gap: '2px' }}>
          {conversations.map((conv) => (
            <div
              key={conv.id}
              onClick={() => setSelectedConversation(conv.id)}
              className={`group/conv flex items-center w-full rounded-xl text-left transition-all duration-300 cursor-pointer ${
                selectedConversationId === conv.id
                  ? 'bg-bg-tertiary text-text-primary'
                  : 'text-text-tertiary hover:text-text-secondary hover:bg-bg-tertiary/50'
              }`}
              style={{ gap: '10px', padding: '8px 12px' }}
            >
              <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${selectedConversationId === conv.id ? 'text-flame-400' : ''}`} />
              <span className="text-[13px] truncate flex-1">{conv.title}</span>
              <button
                onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id) }}
                className="opacity-0 group-hover/conv:opacity-100 text-text-tertiary hover:text-ember-400 transition-all cursor-pointer shrink-0"
                style={{ padding: '2px' }}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          {conversations.length === 0 && (
            <p className="text-[11px] text-text-tertiary text-center" style={{ paddingTop: '24px', paddingBottom: '24px' }}>No conversations yet</p>
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col relative">
        {activeConversation ? (
          <>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto flex flex-col" style={{ paddingLeft: '32px', paddingRight: '32px', paddingTop: '24px', paddingBottom: '24px', gap: '20px' }}>
              {activeConversation.messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} employeeName={selectedEmployee?.name} employeeAvatar={selectedEmployee?.avatar} />
              ))}
              {currentStreaming && !activeConversation.messages.find(m => m.content === currentStreaming) && (
                <div className="flex animate-fade-in" style={{ gap: '14px' }}>
                  <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-bg-elevated text-sm shrink-0">
                    {selectedEmployee?.avatar}
                  </div>
                  <div className="flex-1 max-w-2xl">
                    <div className="rounded-2xl rounded-tl-lg bg-bg-elevated border border-border-default" style={{ padding: '12px 16px' }}>
                      <div className="text-[14px] text-text-primary leading-relaxed prose prose-invert prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-code:bg-white/10 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-[13px] prose-pre:bg-black/30 prose-pre:rounded-lg">
                        <ReactMarkdown>{currentStreaming}</ReactMarkdown>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div style={{ paddingLeft: '32px', paddingRight: '32px', paddingTop: '20px', paddingBottom: '20px' }}>
              <div className="flex items-end max-w-3xl mx-auto" style={{ gap: '10px' }}>
                <div className="flex-1 relative">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={`Message ${selectedEmployee?.name}...`}
                    rows={1}
                    className="flex w-full rounded-2xl border border-border-default bg-bg-tertiary text-[14px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-flame-500/25 focus:border-flame-500/40 transition-all duration-300 resize-none leading-relaxed"
                    style={{ minHeight: '48px', maxHeight: '120px', padding: '14px 48px 14px 20px' }}
                  />
                </div>
                <Button
                  size="icon"
                  onClick={handleSend}
                  disabled={!input.trim() || isSending}
                  className="shrink-0 h-[48px] w-[48px] rounded-2xl"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center relative">
            {/* Ambient orbs in empty state */}
            <div className="ambient-orb ambient-orb-1" style={{ top: '30%', right: '20%' }} />

            <div className="relative flex flex-col items-center">
              <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-bg-elevated" style={{ marginBottom: '16px' }}>
                <span className="text-3xl">{selectedEmployee?.avatar}</span>
              </div>
              <h3 className="text-lg font-bold text-text-primary tracking-tight">{selectedEmployee?.name}</h3>
              <p className="text-[13px] text-text-tertiary" style={{ marginTop: '4px', marginBottom: '20px' }}>{selectedEmployee?.role}</p>
              <div className="flex" style={{ gap: '6px', marginBottom: '20px' }}>
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
    <div className={`flex animate-fade-in ${isUser ? 'flex-row-reverse' : ''}`} style={{ gap: '14px' }}>
      <div className={`flex items-center justify-center w-8 h-8 rounded-xl shrink-0 text-[12px] font-medium transition-all duration-300 ${
        isUser
          ? 'bg-gradient-to-br from-flame-500 to-flame-600 text-white shadow-[0_0_12px_-3px_rgba(249,115,22,0.3)]'
          : 'bg-bg-elevated'
      }`}>
        {isUser ? 'You' : employeeAvatar || '?'}
      </div>
      <div className={`flex-1 ${isUser ? 'flex justify-end' : ''}`}>
        <div className="max-w-2xl">
          {!isUser && (
            <p className="text-[11px] text-text-tertiary font-medium" style={{ marginBottom: '6px' }}>{employeeName}</p>
          )}
          <div className={`rounded-2xl transition-all duration-300 ${
            isUser
              ? 'bg-gradient-to-br from-flame-500 to-flame-600 text-white rounded-tr-lg shadow-[0_4px_20px_-4px_rgba(249,115,22,0.25)]'
              : 'bg-bg-elevated border border-border-default rounded-tl-lg'
          }`} style={{ padding: '12px 16px' }}>
            <div className="text-[14px] leading-relaxed prose prose-invert prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-code:bg-white/10 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-[13px] prose-pre:bg-black/30 prose-pre:rounded-lg">
              <ReactMarkdown>{message.content}</ReactMarkdown>
            </div>
          </div>
          <p className={`text-[11px] ${isUser ? 'text-right' : ''} text-text-tertiary`} style={{ marginTop: '6px' }}>
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>
    </div>
  )
}
