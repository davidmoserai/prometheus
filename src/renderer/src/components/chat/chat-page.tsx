import { useState, useEffect, useRef, useCallback } from 'react'
import { Send, Square, Plus, MessageSquare, ChevronLeft, ChevronDown, Users, ArrowRight, Trash2, Minimize2, FileText, Download, Paperclip, X, Brain, Terminal, Search, Globe, Edit3, Code, ShieldAlert, Check, XIcon } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useAppStore, type Conversation, type ChatMessage, type ChatAttachment, type StreamPart } from '@/stores/app-store'

// Open links externally; used by both ReactMarkdown instances
const markdownComponents = {
  a: ({ href, children }: { href?: string; children: React.ReactNode }) => (
    <a
      href={href}
      onClick={(e) => { e.preventDefault(); if (href) window.api?.shell?.openExternal(href) }}
      className="text-flame-500 underline cursor-pointer"
    >
      {children}
    </a>
  )
}

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
    stopMessage,
    setActiveView,
    setCreatingEmployee,
    getTokenCount,
    compressConversation,
    uploadFile,
    respondToApproval
  } = useAppStore()

  const [input, setInput] = useState('')
  const [tokenCount, setTokenCount] = useState(0)
  const [isCompressing, setIsCompressing] = useState(false)
  const [isUserScrolledUp, setIsUserScrolledUp] = useState(false)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const [stagedAttachments, setStagedAttachments] = useState<ChatAttachment[]>([])
  const [expandedToolCalls, setExpandedToolCalls] = useState<Set<string>>(new Set())
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const dropZoneRef = useRef<HTMLDivElement>(null)

  const isSending = useAppStore(s => s.sendingConversationIds.has(selectedConversationId || ''))
  const selectedEmployee = employees.find((e) => e.id === selectedEmployeeId)
  const activeConversation = conversations.find((c) => c.id === selectedConversationId)
  const currentParts = selectedConversationId ? streamingParts[selectedConversationId] : undefined
  const hasStreamingContent = currentParts && currentParts.length > 0
  const hasStreamingText = currentParts?.some(p => p.type === 'text') ?? false

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

    setExpandedToolCalls(new Set())
    await sendMessage(convId, msg, attachmentsToSend.length > 0 ? attachmentsToSend : undefined)
    inputRef.current?.focus()
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

  const handleStop = () => {
    if (!selectedConversationId) return
    stopMessage(selectedConversationId)
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
                  onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(conv.id) }}
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
              {/* Unified streaming turn — text, tool calls, files, approvals all chronological */}
              {(hasStreamingContent || (isSending && !hasStreamingText)) && (
                <div className="flex animate-fade-in" style={{ gap: '14px' }}>
                  <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-bg-elevated text-sm shrink-0" style={{ marginTop: '2px' }}>
                    {selectedEmployee?.avatar}
                  </div>
                  <div className="flex-1 max-w-2xl flex flex-col" style={{ gap: '6px' }}>
                    {(currentParts ?? []).map((part, i) => {
                      if (part.type === 'text') {
                        return (
                          <div key={`text-${i}`} className="rounded-2xl rounded-tl-lg bg-bg-elevated border border-border-default" style={{ padding: '12px 16px' }}>
                            <div className="chat-markdown">
                              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{part.content}</ReactMarkdown>
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
                      if (part.type === 'tool_approval') {
                        const isExpanded = expandedToolCalls.has(part.approvalId)
                        const argsStr = JSON.stringify(part.args, null, 2)
                        return (
                          <div
                            key={part.approvalId}
                            className={`rounded-xl overflow-hidden border-l-2 ${
                              part.status === 'pending'
                                ? 'bg-amber-500/[0.06] border-amber-500/50'
                                : part.status === 'approved'
                                  ? 'bg-emerald-500/[0.04] border-emerald-500/40'
                                  : 'bg-red-500/[0.04] border-red-500/40'
                            }`}
                          >
                            <div className="flex items-center" style={{ gap: '8px', padding: '8px 12px' }}>
                              <ShieldAlert className={`w-4 h-4 shrink-0 ${
                                part.status === 'pending' ? 'text-amber-400' : part.status === 'approved' ? 'text-emerald-400' : 'text-red-400'
                              }`} />
                              <div className="flex-1 min-w-0">
                                <p className="text-[12px] text-text-primary truncate">{part.summary}</p>
                              </div>
                              {part.status === 'pending' ? (
                                <div className="flex items-center shrink-0" style={{ gap: '6px' }}>
                                  <button
                                    onClick={() => respondToApproval(part.approvalId, false)}
                                    className="flex items-center text-[11px] text-red-400 hover:text-red-300 transition-colors cursor-pointer rounded-lg hover:bg-red-500/10"
                                    style={{ gap: '4px', padding: '4px 10px' }}
                                  >
                                    <XIcon className="w-3 h-3" />
                                    Deny
                                  </button>
                                  <button
                                    onClick={() => respondToApproval(part.approvalId, true)}
                                    className="flex items-center text-[11px] text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20"
                                    style={{ gap: '4px', padding: '4px 10px' }}
                                  >
                                    <Check className="w-3 h-3" />
                                    Approve
                                  </button>
                                </div>
                              ) : (
                                <Badge variant={part.status === 'approved' ? 'success' : 'destructive'}>
                                  {part.status === 'approved' ? 'Approved' : 'Denied'}
                                </Badge>
                              )}
                              {argsStr.length > 4 && (
                                <button
                                  onClick={() => toggleToolCallExpanded(part.approvalId)}
                                  className="text-text-tertiary hover:text-text-secondary transition-colors cursor-pointer shrink-0"
                                >
                                  <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                                </button>
                              )}
                            </div>
                            {isExpanded && argsStr.length > 4 && (
                              <div className="border-t border-white/[0.06]" style={{ padding: '8px 12px' }}>
                                <pre className="text-[11px] text-text-secondary whitespace-pre-wrap font-mono leading-relaxed">{argsStr}</pre>
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
                    {/* Inline thinking dots — shown when agent is working but no text yet */}
                    {isSending && !hasStreamingText && (
                      <div className="rounded-2xl rounded-tl-lg bg-bg-elevated border border-border-default" style={{ padding: '12px 16px' }}>
                        <div className="flex items-center" style={{ gap: '6px' }}>
                          <div className="flex" style={{ gap: '4px' }}>
                            <span className="w-2 h-2 rounded-full bg-text-tertiary" style={{ animation: 'pulse-dot 1.4s ease-in-out infinite', animationDelay: '0s' }} />
                            <span className="w-2 h-2 rounded-full bg-text-tertiary" style={{ animation: 'pulse-dot 1.4s ease-in-out infinite', animationDelay: '0.2s' }} />
                            <span className="w-2 h-2 rounded-full bg-text-tertiary" style={{ animation: 'pulse-dot 1.4s ease-in-out infinite', animationDelay: '0.4s' }} />
                          </div>
                        </div>
                      </div>
                    )}
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
                {isSending ? (
                  <button
                    onClick={handleStop}
                    className="shrink-0 h-[48px] w-[48px] rounded-2xl flex items-center justify-center bg-bg-elevated border border-border-default hover:border-flame-500/50 hover:bg-flame-500/10 transition-all cursor-pointer"
                    title="Stop generating"
                  >
                    <Square className="w-4 h-4 text-flame-400 fill-flame-400" />
                  </button>
                ) : (
                  <Button
                    size="icon"
                    onClick={handleSend}
                    disabled={!input.trim() && stagedAttachments.length === 0}
                    className="shrink-0 h-[48px] w-[48px] rounded-2xl"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                )}
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

      <ConfirmDialog
        open={!!deleteConfirmId}
        title="Delete conversation?"
        description="This will permanently delete this conversation and all its messages. This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => {
          if (deleteConfirmId) deleteConversation(deleteConfirmId)
          setDeleteConfirmId(null)
        }}
        onCancel={() => setDeleteConfirmId(null)}
      />
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
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{displayContent}</ReactMarkdown>
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
