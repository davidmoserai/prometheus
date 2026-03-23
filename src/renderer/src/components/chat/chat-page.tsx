import { useState, useEffect, useRef, useCallback } from 'react'
import { Send, Plus, MessageSquare, ChevronLeft, ChevronDown, Users, ArrowRight, Trash2, Minimize2, FileText, Download, Paperclip, X, Brain, Terminal, Search, Globe, Edit3, Code } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAppStore, type Conversation, type ChatMessage, type ChatAttachment, type StreamPart } from '@/stores/app-store'

export function ChatPage() {
  const {
    employees,
    conversations,
    selectedEmployeeId,
    selectedConversationId,
    streamingParts,
    setSelectedEmployee,
    setSelectedConversation,
    loadConversations,
    createConversation,
    deleteConversation,
    sendMessage,
    setActiveView,
    setCreatingEmployee,
    getTokenCount,
    compressConversation,
    uploadFile
  } = useAppStore()

  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [tokenCount, setTokenCount] = useState(0)
  const [isCompressing, setIsCompressing] = useState(false)
  const [isUserScrolledUp, setIsUserScrolledUp] = useState(false)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const [stagedAttachments, setStagedAttachments] = useState<ChatAttachment[]>([])
  const [expandedToolCalls, setExpandedToolCalls] = useState<Set<string>>(new Set())
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const dropZoneRef = useRef<HTMLDivElement>(null)

  const selectedEmployee = employees.find((e) => e.id === selectedEmployeeId)
  const activeConversation = conversations.find((c) => c.id === selectedConversationId)
  const currentParts = selectedConversationId ? streamingParts[selectedConversationId] : undefined
  const hasStreamingContent = currentParts && currentParts.length > 0

  useEffect(() => {
    if (selectedEmployeeId) {
      loadConversations(selectedEmployeeId)
    }
  }, [selectedEmployeeId, loadConversations])

  // Auto-scroll to bottom only if user hasn't scrolled up
  useEffect(() => {
    if (!isUserScrolledUp) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [activeConversation?.messages, currentParts, isUserScrolledUp])

  // Reset scroll lock when conversation changes or sending completes
  useEffect(() => {
    setIsUserScrolledUp(false)
  }, [selectedConversationId])

  // Detect if user scrolled up
  const handleMessagesScroll = () => {
    const container = messagesContainerRef.current
    if (!container) return
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight
    setIsUserScrolledUp(distanceFromBottom > 100)
  }

  // Update token count when conversation changes
  useEffect(() => {
    if (selectedConversationId) {
      getTokenCount(selectedConversationId).then(setTokenCount)
    } else {
      setTokenCount(0)
    }
  }, [selectedConversationId, activeConversation?.messages?.length, getTokenCount])

  // Reset expanded tool calls when conversation changes
  useEffect(() => {
    setExpandedToolCalls(new Set())
  }, [selectedConversationId])

  const handlePickFiles = useCallback(async () => {
    if (!window.api?.files?.pick) return
    const result = await window.api.files.pick()
    if (result.canceled || !result.filePaths?.length) return

    let convId = selectedConversationId
    if (!convId && selectedEmployeeId) {
      const conv = await createConversation(selectedEmployeeId)
      convId = conv.id
    }
    if (!convId) return

    for (const filePath of result.filePaths) {
      const attachment = await uploadFile(convId, filePath)
      setStagedAttachments(prev => [...prev, attachment])
    }
  }, [selectedConversationId, selectedEmployeeId, createConversation, uploadFile])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const files = Array.from(e.dataTransfer.files)
    if (!files.length) return

    let convId = selectedConversationId
    if (!convId && selectedEmployeeId) {
      const conv = await createConversation(selectedEmployeeId)
      convId = conv.id
    }
    if (!convId) return

    // For drag-and-drop in Electron, we can access the file path
    for (const file of files) {
      if ((file as unknown as { path?: string }).path) {
        const attachment = await uploadFile(convId, (file as unknown as { path: string }).path)
        setStagedAttachments(prev => [...prev, attachment])
      }
    }
  }, [selectedConversationId, selectedEmployeeId, createConversation, uploadFile])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleSend = async () => {
    if (!input.trim() && stagedAttachments.length === 0) return
    if (isSending) return
    let msg = input.trim()

    // Append attachment info to message for the agent
    if (stagedAttachments.length > 0) {
      const attachInfo = stagedAttachments.map(a =>
        `\n[Attached: ${a.filename}] (path: ${a.path})`
      ).join('')
      msg = msg + attachInfo
    }

    setInput('')
    const attachmentsToSend = [...stagedAttachments]
    setStagedAttachments([])

    let convId = selectedConversationId
    if (!convId && selectedEmployeeId) {
      const conv = await createConversation(selectedEmployeeId)
      convId = conv.id
    }
    if (!convId) return

    setIsSending(true)
    setExpandedToolCalls(new Set())
    try {
      await sendMessage(convId, msg)
    } finally {
      setIsSending(false)
      inputRef.current?.focus()
    }
  }

  const handleCompress = async () => {
    if (!selectedConversationId || isCompressing) return
    setIsCompressing(true)
    try {
      await compressConversation(selectedConversationId)
      const count = await getTokenCount(selectedConversationId)
      setTokenCount(count)
    } finally {
      setIsCompressing(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const removeStagedAttachment = (id: string) => {
    setStagedAttachments(prev => prev.filter(a => a.id !== id))
  }

  // Tool call icon helper
  const getToolIcon = (tool: string) => {
    if (tool === 'save_memory') return <Brain className="w-3.5 h-3.5 text-violet-400" />
    if (tool === 'create_knowledge_doc' || tool === 'update_knowledge_doc') return <FileText className="w-3.5 h-3.5 text-sky-400" />
    if (tool === 'delegate_task' || tool === 'message_employee') return <Users className="w-3.5 h-3.5 text-flame-400" />
    if (tool === 'Read' || tool === 'Grep' || tool === 'Glob') return <Search className="w-3.5 h-3.5 text-sky-400" />
    if (tool === 'Edit' || tool === 'Write') return <Edit3 className="w-3.5 h-3.5 text-emerald-400" />
    if (tool === 'Bash') return <Terminal className="w-3.5 h-3.5 text-amber-400" />
    if (tool === 'WebSearch' || tool === 'WebFetch') return <Globe className="w-3.5 h-3.5 text-blue-400" />
    if (tool === 'execute_code') return <Code className="w-3.5 h-3.5 text-amber-400" />
    if (tool === 'web_search') return <Search className="w-3.5 h-3.5 text-blue-400" />
    if (tool === 'web_browse') return <Globe className="w-3.5 h-3.5 text-blue-400" />
    if (tool === 'read_file') return <FileText className="w-3.5 h-3.5 text-sky-400" />
    if (tool === 'write_file') return <Edit3 className="w-3.5 h-3.5 text-emerald-400" />
    return <Code className="w-3.5 h-3.5 text-text-tertiary" />
  }

  const toggleToolCallExpanded = (id: string) => {
    setExpandedToolCalls(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleFileDownload = (path: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = path.split('/').pop() || 'file'
    a.click()
    URL.revokeObjectURL(url)
  }

  const isImageFile = (path: string) => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(path)

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
          {conversations.map((conv) => {
            const peerEmp = conv.peerEmployeeId ? employees.find(e => e.id === conv.peerEmployeeId) : null
            const isAgentChat = !!conv.peerEmployeeId

            return (
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
                {isAgentChat ? (
                  <div className="flex items-center shrink-0" style={{ gap: '2px' }}>
                    <span className="text-[11px]">{selectedEmployee?.avatar}</span>
                    <span className="text-[10px] text-text-tertiary">x</span>
                    <span className="text-[11px]">{peerEmp?.avatar || '?'}</span>
                  </div>
                ) : (
                  <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${selectedConversationId === conv.id ? 'text-flame-400' : ''}`} />
                )}
                <span className="text-[13px] truncate flex-1">{conv.title}</span>
                {isAgentChat && (
                  <Badge variant="secondary" className="text-[9px] shrink-0">Agent</Badge>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id) }}
                  className="opacity-0 group-hover/conv:opacity-100 text-text-tertiary hover:text-ember-400 transition-all cursor-pointer shrink-0"
                  style={{ padding: '2px' }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )
          })}
          {conversations.length === 0 && (
            <p className="text-[11px] text-text-tertiary text-center" style={{ paddingTop: '24px', paddingBottom: '24px' }}>No conversations yet</p>
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col relative" onDragOver={handleDragOver} onDrop={handleDrop}>
        {activeConversation ? (
          <>
            {/* Token counter header */}
            <div className="flex items-center justify-end border-b border-border-default" style={{ padding: '8px 32px', gap: '12px' }}>
              {/* Show peer employee info for agent-to-agent chats */}
              {activeConversation.peerEmployeeId && (() => {
                const peer = employees.find(e => e.id === activeConversation.peerEmployeeId)
                return peer ? (
                  <div className="flex items-center flex-1" style={{ gap: '8px' }}>
                    <span className="text-[12px]">{selectedEmployee?.avatar}</span>
                    <span className="text-[11px] text-text-tertiary">with</span>
                    <span className="text-[12px]">{peer.avatar}</span>
                    <span className="text-[11px] text-text-secondary font-medium">{peer.name}</span>
                    <Badge variant="secondary" className="text-[9px]">Agent Chat</Badge>
                  </div>
                ) : null
              })()}
              <span className="text-[11px] text-text-tertiary tabular-nums">
                ~{tokenCount.toLocaleString()} tokens
              </span>
              {tokenCount > 4000 && (
                <button
                  onClick={handleCompress}
                  disabled={isCompressing}
                  className="flex items-center text-[11px] text-flame-400 hover:text-flame-300 transition-colors cursor-pointer disabled:opacity-50"
                  style={{ gap: '4px' }}
                >
                  <Minimize2 className="w-3 h-3" />
                  {isCompressing ? 'Compressing...' : 'Compress'}
                </button>
              )}
            </div>

            {/* Messages */}
            <div ref={messagesContainerRef} onScroll={handleMessagesScroll} className="flex-1 overflow-y-auto flex flex-col" style={{ paddingLeft: '32px', paddingRight: '32px', paddingTop: '24px', paddingBottom: '24px', gap: '20px' }}>
              {activeConversation.messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} employeeName={selectedEmployee?.name} employeeAvatar={selectedEmployee?.avatar} />
              ))}
              {/* Thinking indicator — shows when waiting for response */}
              {isSending && !hasStreamingContent && (
                <div className="flex animate-fade-in" style={{ gap: '14px' }}>
                  <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-bg-elevated text-sm shrink-0">
                    {selectedEmployee?.avatar}
                  </div>
                  <div className="flex-1 max-w-2xl">
                    <div className="rounded-2xl rounded-tl-lg bg-bg-elevated border border-border-default" style={{ padding: '12px 16px' }}>
                      <div className="flex items-center" style={{ gap: '6px' }}>
                        <div className="flex" style={{ gap: '4px' }}>
                          <span className="w-2 h-2 rounded-full bg-text-tertiary" style={{ animation: 'pulse-dot 1.4s ease-in-out infinite', animationDelay: '0s' }} />
                          <span className="w-2 h-2 rounded-full bg-text-tertiary" style={{ animation: 'pulse-dot 1.4s ease-in-out infinite', animationDelay: '0.2s' }} />
                          <span className="w-2 h-2 rounded-full bg-text-tertiary" style={{ animation: 'pulse-dot 1.4s ease-in-out infinite', animationDelay: '0.4s' }} />
                        </div>
                        <span className="text-[13px] text-text-tertiary" style={{ marginLeft: '4px' }}>Thinking...</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {/* Unified streaming turn — text, tool calls, files all chronological */}
              {hasStreamingContent && (
                <div className="flex animate-fade-in" style={{ gap: '14px' }}>
                  <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-bg-elevated text-sm shrink-0" style={{ marginTop: '2px' }}>
                    {selectedEmployee?.avatar}
                  </div>
                  <div className="flex-1 max-w-2xl flex flex-col" style={{ gap: '6px' }}>
                    {currentParts!.map((part, i) => {
                      if (part.type === 'text') {
                        return (
                          <div key={`text-${i}`} className="rounded-2xl rounded-tl-lg bg-bg-elevated border border-border-default" style={{ padding: '12px 16px' }}>
                            <div className="chat-markdown">
                              <ReactMarkdown>{part.content}</ReactMarkdown>
                            </div>
                          </div>
                        )
                      }
                      if (part.type === 'tool_call') {
                        const isExpanded = expandedToolCalls.has(part.id)
                        return (
                          <div
                            key={part.id}
                            className="rounded-xl bg-white/[0.03] border-l-2 border-border-default overflow-hidden"
                            style={{ borderLeftColor: 'rgba(249,115,22,0.4)' }}
                          >
                            <button
                              className="flex items-center w-full cursor-pointer text-left transition-colors hover:bg-white/[0.02]"
                              style={{ gap: '8px', padding: '6px 12px' }}
                              onClick={() => part.detail && toggleToolCallExpanded(part.id)}
                            >
                              {getToolIcon(part.tool)}
                              <span className="text-[12px] text-text-tertiary flex-1 truncate">{part.summary}</span>
                              {part.detail && (
                                <ChevronDown className={`w-3 h-3 text-text-tertiary transition-transform duration-200 shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
                              )}
                            </button>
                            {isExpanded && part.detail && (
                              <div className="border-t border-white/[0.06]" style={{ padding: '8px 12px' }}>
                                <pre className="text-[11px] text-text-secondary whitespace-pre-wrap font-mono leading-relaxed">{part.detail}</pre>
                              </div>
                            )}
                          </div>
                        )
                      }
                      if (part.type === 'file_written') {
                        const filename = part.path.split('/').pop() || 'file'
                        if (isImageFile(part.path)) {
                          return (
                            <div key={`file-${i}`} className="rounded-xl overflow-hidden border border-border-default">
                              <img
                                src={`file://${part.path}`}
                                alt={filename}
                                style={{ maxWidth: '100%', maxHeight: '400px', display: 'block' }}
                              />
                              <div className="flex items-center bg-bg-elevated" style={{ gap: '8px', padding: '8px 12px' }}>
                                <FileText className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                <span className="text-[12px] text-text-secondary flex-1 truncate">{filename}</span>
                                <button
                                  onClick={() => handleFileDownload(part.path, part.content)}
                                  className="flex items-center text-[11px] text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
                                  style={{ gap: '4px' }}
                                >
                                  <Download className="w-3 h-3" />
                                  Save
                                </button>
                              </div>
                            </div>
                          )
                        }
                        return (
                          <div
                            key={`file-${i}`}
                            className="flex items-center rounded-xl bg-emerald-500/[0.06] border border-emerald-500/20"
                            style={{ gap: '12px', padding: '10px 14px' }}
                          >
                            <FileText className="w-4 h-4 text-emerald-400 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] text-text-primary truncate">{filename}</p>
                              <p className="text-[11px] text-text-tertiary truncate">{part.path}</p>
                            </div>
                            <button
                              onClick={() => handleFileDownload(part.path, part.content)}
                              className="flex items-center text-[11px] text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
                              style={{ gap: '4px' }}
                            >
                              <Download className="w-3.5 h-3.5" />
                              Download
                            </button>
                          </div>
                        )
                      }
                      return null
                    })}
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Staged attachments preview */}
            {stagedAttachments.length > 0 && (
              <div className="border-t border-border-default" style={{ paddingLeft: '32px', paddingRight: '32px', paddingTop: '10px', paddingBottom: '4px' }}>
                <div className="flex flex-wrap max-w-3xl mx-auto" style={{ gap: '8px' }}>
                  {stagedAttachments.map((att) => {
                    const isImage = att.mimetype.startsWith('image/')
                    return (
                      <div
                        key={att.id}
                        className="relative group rounded-lg border border-border-default bg-bg-elevated overflow-hidden"
                        style={{ width: isImage ? '64px' : 'auto', height: isImage ? '64px' : 'auto', padding: isImage ? '0' : '6px 10px' }}
                      >
                        {isImage ? (
                          <img
                            src={`file://${att.path}`}
                            alt={att.filename}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="flex items-center" style={{ gap: '6px' }}>
                            <FileText className="w-3.5 h-3.5 text-text-tertiary shrink-0" />
                            <span className="text-[11px] text-text-secondary truncate max-w-[120px]">{att.filename}</span>
                          </div>
                        )}
                        <button
                          onClick={() => removeStagedAttachment(att.id)}
                          className="absolute top-0 right-0 flex items-center justify-center w-5 h-5 rounded-bl-lg bg-bg-primary/80 text-text-tertiary hover:text-ember-400 transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Input */}
            <div
              style={{ paddingLeft: '32px', paddingRight: '32px', paddingTop: '20px', paddingBottom: '20px' }}
            >
              <div className="flex items-end max-w-3xl mx-auto" style={{ gap: '10px' }}>
                <button
                  onClick={handlePickFiles}
                  className="shrink-0 flex items-center justify-center w-[48px] h-[48px] rounded-2xl border border-border-default bg-bg-tertiary text-text-tertiary hover:text-text-primary hover:border-border-bright transition-all cursor-pointer"
                  title="Attach files"
                >
                  <Paperclip className="w-4 h-4" />
                </button>
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
                  disabled={(!input.trim() && stagedAttachments.length === 0) || isSending}
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

  // Extract file paths from inline markers and strip them from display
  const attachmentPattern = /\[Attached: .+?\] \(path: (.+?)\)/g
  const inlineFilePaths: string[] = []
  let match
  while ((match = attachmentPattern.exec(message.content)) !== null) {
    inlineFilePaths.push(match[1])
  }
  const displayContent = message.content.replace(/\n?\[Attached: .+?\] \(path: .+?\)/g, '').trim()

  // Combine structured attachments + inline parsed paths
  const structuredImages = (message.attachments || []).filter(a => a.mimetype.startsWith('image/'))
  const inlineImages = inlineFilePaths.filter(p => /\.(jpg|jpeg|png|gif|webp)$/i.test(p))
  const allImagePaths = [
    ...structuredImages.map(a => a.path),
    ...inlineImages.filter(p => !structuredImages.some(a => a.path === p))
  ]

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
            {displayContent && (
              <div className="chat-markdown">
                <ReactMarkdown>{displayContent}</ReactMarkdown>
              </div>
            )}
            {/* Inline image attachments */}
            {allImagePaths.length > 0 && (
              <div className="flex flex-wrap" style={{ gap: '8px', marginTop: displayContent ? '10px' : '0' }}>
                {allImagePaths.map((filePath, i) => (
                  <img
                    key={i}
                    src={`file://${filePath}`}
                    alt=""
                    className="rounded-lg border border-white/10"
                    style={{ maxWidth: '240px', maxHeight: '200px', objectFit: 'cover' }}
                  />
                ))}
              </div>
            )}
          </div>
          <p className={`text-[11px] ${isUser ? 'text-right' : ''} text-text-tertiary`} style={{ marginTop: '6px' }}>
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>
    </div>
  )
}
