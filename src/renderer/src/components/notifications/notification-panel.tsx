import { useRef, useEffect } from 'react'
import { CheckCircle2, AlertTriangle, RotateCw, Info, CheckCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore, type AppNotification } from '@/stores/app-store'

function formatRelativeTime(timestamp: string): string {
  const now = Date.now()
  const then = new Date(timestamp).getTime()
  const diffSeconds = Math.floor((now - then) / 1000)

  if (diffSeconds < 60) return 'just now'
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`
  return `${Math.floor(diffSeconds / 86400)}d ago`
}

function notificationIcon(type: AppNotification['type']) {
  switch (type) {
    case 'task_completed':
      return <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
    case 'task_escalated':
      return <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
    case 'recurring_executed':
      return <RotateCw className="w-4 h-4 text-sky-400 shrink-0" />
    case 'tool_approval':
      return <AlertTriangle className="w-4 h-4 text-flame-400 shrink-0" />
    default:
      return <Info className="w-4 h-4 text-text-tertiary shrink-0" />
  }
}

interface NotificationPanelProps {
  onClose: () => void
}

export function NotificationPanel({ onClose }: NotificationPanelProps) {
  const { notifications, tasks, markNotificationRead, markAllNotificationsRead, setActiveView } = useAppStore()
  const panelRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const unreadCount = notifications.filter(n => !n.read).length

  const handleNotificationClick = (notification: AppNotification) => {
    markNotificationRead(notification.id)

    // Navigate to tasks page for task-related notifications
    if (notification.type === 'task_completed' || notification.type === 'task_escalated' || notification.type === 'recurring_executed') {
      setActiveView('tasks')
    }

    // Navigate for tool approval notifications
    if (notification.type === 'tool_approval') {
      const convId = notification.metadata?.conversationId
      // Check if this approval belongs to a task conversation
      const isTaskApproval = convId && tasks.some(t => t.conversationId === convId)
      if (isTaskApproval) {
        setActiveView('tasks')
      } else {
        setActiveView('chat')
      }
    }
    onClose()
  }

  return (
    <div
      ref={panelRef}
      className="fixed z-50 rounded-xl border border-border-bright animate-fade-in"
      style={{
        bottom: '60px',
        left: '16px',
        width: '320px',
        maxHeight: '420px',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#1e1e23',
        boxShadow: '0 16px 48px -8px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.06)'
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06]" style={{ padding: '14px 16px' }}>
        <div className="flex items-center" style={{ gap: '8px' }}>
          <span className="text-[14px] font-semibold text-text-primary">Notifications</span>
          {unreadCount > 0 && (
            <span className="flex items-center justify-center min-w-[20px] h-5 rounded-full bg-flame-500/20 text-flame-400 text-[11px] font-semibold tabular-nums" style={{ padding: '0 6px' }}>
              {unreadCount}
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllNotificationsRead}
            className="flex items-center text-[12px] text-text-tertiary hover:text-text-secondary transition-colors cursor-pointer"
            style={{ gap: '4px' }}
          >
            <CheckCheck className="w-3.5 h-3.5" />
            Mark all read
          </button>
        )}
      </div>

      {/* Notification list */}
      <div style={{ overflow: 'auto', flex: 1 }}>
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-text-tertiary" style={{ padding: '32px 16px', gap: '8px' }}>
            <Info className="w-8 h-8 opacity-40" />
            <span className="text-[13px]">No notifications yet</span>
          </div>
        ) : (
          notifications.map((notification) => (
            <button
              key={notification.id}
              onClick={() => handleNotificationClick(notification)}
              className={cn(
                'flex w-full text-left transition-all cursor-pointer hover:bg-white/[0.03]',
                !notification.read && 'bg-white/[0.02]'
              )}
              style={{ padding: '12px 16px', gap: '10px' }}
            >
              {/* Unread dot */}
              <div className="flex items-start" style={{ paddingTop: '2px', width: '8px' }}>
                {!notification.read && (
                  <div className="w-[6px] h-[6px] rounded-full bg-flame-400 shadow-[0_0_6px_rgba(249,115,22,0.4)]" />
                )}
              </div>

              {/* Icon */}
              <div style={{ paddingTop: '1px' }}>
                {notificationIcon(notification.type)}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0" style={{ gap: '2px' }}>
                <p className="text-[13px] font-medium text-text-primary truncate">{notification.title}</p>
                <p className="text-[12px] text-text-tertiary line-clamp-2" style={{ lineHeight: '1.4' }}>{notification.body}</p>
                <p className="text-[11px] text-text-tertiary" style={{ marginTop: '4px' }}>{formatRelativeTime(notification.timestamp)}</p>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
