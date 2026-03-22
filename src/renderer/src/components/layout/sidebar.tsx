import { useState, useRef, useEffect } from 'react'
import {
  LayoutDashboard,
  Users,
  MessageSquare,
  BookOpen,
  ClipboardList,
  Settings,
  Flame,
  ChevronDown,
  Plus,
  Check,
  Pencil,
  Trash2,
  PanelLeftClose,
  PanelLeftOpen,
  Bell
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/app-store'
import { NotificationPanel } from '@/components/notifications/notification-panel'

const COMPANY_AVATARS = [
  '🏢', '🏗️', '🏭', '🏦', '🏛️', '🏠', '🔥', '⚡',
  '🚀', '🌊', '🌿', '🎯', '💎', '🌟', '🔮', '🧬'
]

const navItems = [
  { id: 'dashboard' as const, label: 'Dashboard', icon: LayoutDashboard },
  { id: 'employees' as const, label: 'Employees', icon: Users },
  { id: 'chat' as const, label: 'Chat', icon: MessageSquare },
  { id: 'tasks' as const, label: 'Tasks', icon: ClipboardList },
  { id: 'knowledge' as const, label: 'Knowledge', icon: BookOpen },
  { id: 'settings' as const, label: 'Settings', icon: Settings }
]

export function Sidebar() {
  const {
    activeView, setActiveView, employees, tasks, companies, activeCompanyId,
    switchCompany, createCompany, updateCompany, deleteCompany,
    sidebarCollapsed, toggleSidebar, notifications
  } = useAppStore()

  const [notificationPanelOpen, setNotificationPanelOpen] = useState(false)
  const [companySwitcherOpen, setCompanySwitcherOpen] = useState(false)
  const [isCreatingCompany, setIsCreatingCompany] = useState(false)
  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null)
  const [newCompanyName, setNewCompanyName] = useState('')
  const [newCompanyAvatar, setNewCompanyAvatar] = useState('🏢')
  const [editName, setEditName] = useState('')
  const [editAvatar, setEditAvatar] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const editInputRef = useRef<HTMLInputElement>(null)

  const activeCompany = companies.find(c => c.id === activeCompanyId)

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setCompanySwitcherOpen(false)
        setIsCreatingCompany(false)
        setEditingCompanyId(null)
      }
    }
    if (companySwitcherOpen) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [companySwitcherOpen])

  // Focus input when creating or editing
  useEffect(() => {
    if (isCreatingCompany) inputRef.current?.focus()
  }, [isCreatingCompany])
  useEffect(() => {
    if (editingCompanyId) editInputRef.current?.focus()
  }, [editingCompanyId])

  const handleCreateCompany = async () => {
    if (!newCompanyName.trim()) return
    const company = await createCompany({ name: newCompanyName.trim(), avatar: newCompanyAvatar })
    await switchCompany(company.id)
    setNewCompanyName('')
    setNewCompanyAvatar('🏢')
    setIsCreatingCompany(false)
    setCompanySwitcherOpen(false)
  }

  const handleStartEdit = (company: { id: string; name: string; avatar: string }) => {
    setEditingCompanyId(company.id)
    setEditName(company.name)
    setEditAvatar(company.avatar)
    setIsCreatingCompany(false)
  }

  const handleSaveEdit = async () => {
    if (!editingCompanyId || !editName.trim()) return
    await updateCompany(editingCompanyId, { name: editName.trim(), avatar: editAvatar })
    setEditingCompanyId(null)
  }

  const handleDeleteCompany = async (id: string) => {
    if (companies.length <= 1) return
    await deleteCompany(id)
    setEditingCompanyId(null)
  }

  // Collapsed sidebar
  if (sidebarCollapsed) {
    return (
      <aside className="relative flex flex-col w-[60px] h-full bg-bg-secondary border-r border-border-default overflow-hidden transition-all duration-300">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[80px] h-[80px] bg-gradient-to-b from-flame-500/[0.04] to-transparent pointer-events-none" />

        {/* Company avatar */}
        <div className="flex justify-center" style={{ paddingTop: '44px', paddingBottom: '16px' }}>
          <button
            onClick={() => setCompanySwitcherOpen(!companySwitcherOpen)}
            className="relative flex items-center justify-center w-9 h-9 rounded-[10px] bg-gradient-to-br from-white/[0.08] to-white/[0.03] text-lg shadow-[0_0_16px_-4px_rgba(249,115,22,0.15)] hover:shadow-[0_0_20px_-4px_rgba(249,115,22,0.25)] transition-all cursor-pointer"
            title={activeCompany?.name}
          >
            {activeCompany?.avatar || '🏢'}
          </button>
        </div>

        {/* Nav icons */}
        <nav className="flex-1 flex flex-col z-10" style={{ paddingLeft: '8px', paddingRight: '8px', gap: '6px' }}>
          {navItems.map((item) => {
            const isActive = activeView === item.id
            const Icon = item.icon
            return (
              <button
                key={item.id}
                onClick={() => setActiveView(item.id)}
                title={item.label}
                className={cn(
                  'relative flex items-center justify-center w-full h-11 rounded-xl text-[13px] font-medium transition-all duration-300 cursor-pointer',
                  isActive
                    ? 'bg-bg-tertiary text-text-primary nav-active-indicator'
                    : 'text-text-tertiary hover:text-text-secondary hover:bg-bg-tertiary/50'
                )}
              >
                <Icon className={cn(
                  'w-[18px] h-[18px] transition-all duration-300',
                  isActive ? 'text-flame-400 drop-shadow-[0_0_6px_rgba(249,115,22,0.4)]' : ''
                )} />
              </button>
            )
          })}
        </nav>

        {/* Notification bell + Expand + brand */}
        <div className="relative flex flex-col items-center z-10" style={{ gap: '12px', paddingTop: '20px', paddingBottom: '20px' }}>
          <button
            onClick={() => setNotificationPanelOpen(!notificationPanelOpen)}
            className="relative flex items-center justify-center w-8 h-8 rounded-lg text-text-tertiary hover:text-text-secondary hover:bg-white/[0.04] transition-all cursor-pointer"
            title="Notifications"
          >
            <Bell className="w-4 h-4" />
            {notifications.filter(n => !n.read).length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[16px] h-4 rounded-full bg-flame-500 text-white text-[10px] font-bold tabular-nums shadow-[0_0_8px_rgba(249,115,22,0.4)]" style={{ padding: '0 4px' }}>
                {notifications.filter(n => !n.read).length}
              </span>
            )}
          </button>
          <button
            onClick={toggleSidebar}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-text-tertiary hover:text-text-secondary hover:bg-white/[0.04] transition-all cursor-pointer"
            title="Expand sidebar"
          >
            <PanelLeftOpen className="w-4 h-4" />
          </button>
          <div className="relative flex items-center justify-center w-6 h-6 rounded-lg bg-gradient-to-br from-flame-500/25 to-flame-700/20 shadow-[0_0_12px_-2px_rgba(249,115,22,0.25)]">
            <Flame className="w-3.5 h-3.5 text-flame-400 fire-flicker" />
          </div>
          {notificationPanelOpen && (
            <NotificationPanel onClose={() => setNotificationPanelOpen(false)} />
          )}
        </div>
      </aside>
    )
  }

  return (
    <aside className="relative flex flex-col w-[260px] h-full bg-bg-secondary border-r border-border-default overflow-hidden transition-all duration-300">
      {/* Ambient glow at top */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[200px] h-[120px] bg-gradient-to-b from-flame-500/[0.04] to-transparent pointer-events-none" />
      {/* Subtle bottom ember glow */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[160px] h-[80px] bg-gradient-to-t from-flame-600/[0.03] to-transparent pointer-events-none" />

      {/* Company switcher */}
      <div className="relative z-10" style={{ paddingLeft: '16px', paddingRight: '16px', paddingTop: '32px', paddingBottom: '24px' }} ref={dropdownRef}>
        {/* Inline company edit form */}
        {editingCompanyId === activeCompanyId && activeCompany ? (
          <div className="rounded-xl bg-white/[0.06] animate-fade-in" style={{ padding: '10px 12px' }}>
            <div className="flex flex-col" style={{ gap: '10px' }}>
            <div className="flex flex-wrap" style={{ gap: '6px' }}>
              {COMPANY_AVATARS.slice(0, 8).map(a => (
                <button
                  key={a}
                  onClick={() => setEditAvatar(a)}
                  className={cn(
                    'w-7 h-7 rounded-lg text-sm flex items-center justify-center transition-all cursor-pointer',
                    editAvatar === a ? 'bg-flame-500/15 ring-1 ring-flame-500/40 shadow-[0_0_8px_-2px_rgba(249,115,22,0.3)]' : 'hover:bg-white/[0.06]'
                  )}
                >
                  {a}
                </button>
              ))}
            </div>
            <input
              ref={editInputRef}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveEdit()
                if (e.key === 'Escape') setEditingCompanyId(null)
              }}
              className="w-full rounded-lg bg-white/[0.04] border border-white/[0.06] text-[13px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-flame-500/30 focus:shadow-[0_0_12px_-4px_rgba(249,115,22,0.2)]"
              style={{ padding: '6px 10px' }}
            />
            <div className="flex" style={{ gap: '6px' }}>
              <button
                onClick={handleSaveEdit}
                disabled={!editName.trim()}
                className="flex-1 rounded-lg bg-gradient-to-b from-flame-500 to-flame-600 text-white text-[12px] font-medium hover:from-flame-400 hover:to-flame-500 transition-all disabled:opacity-40 cursor-pointer shadow-[0_2px_8px_-2px_rgba(249,115,22,0.3)]"
                style={{ padding: '6px 10px' }}
              >
                Save
              </button>
              {companies.length > 1 && (
                <button
                  onClick={() => handleDeleteCompany(activeCompany.id)}
                  className="rounded-lg text-ember-400 text-[12px] hover:bg-ember-500/10 transition-colors cursor-pointer"
                  style={{ padding: '6px 10px' }}
                  title="Delete company"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={() => setEditingCompanyId(null)}
                className="rounded-lg text-text-tertiary text-[12px] hover:bg-white/[0.04] transition-colors cursor-pointer"
                style={{ padding: '6px 10px' }}
              >
                Cancel
              </button>
            </div>
            </div>
          </div>
        ) : (
          /* Company name + switcher button */
          <button
            onClick={() => setCompanySwitcherOpen(!companySwitcherOpen)}
            style={{ gap: '12px', padding: '10px 12px' }}
            className="flex items-center w-full rounded-xl hover:bg-bg-tertiary/50 transition-all duration-300 cursor-pointer"
          >
            <div className="relative flex items-center justify-center w-9 h-9 rounded-[10px] bg-bg-elevated text-lg shrink-0">
              {activeCompany?.avatar || '🏢'}
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-[14px] font-semibold text-text-primary tracking-tight truncate">
                {activeCompany?.name || 'My Company'}
              </p>
              <p className="text-[10px] text-text-tertiary font-medium uppercase tracking-[0.12em]">AI Workforce</p>
            </div>
            <ChevronDown className={cn(
              'w-3.5 h-3.5 text-text-tertiary transition-transform duration-300 shrink-0',
              companySwitcherOpen && 'rotate-180'
            )} />
          </button>
        )}

        {/* Company dropdown */}
        {companySwitcherOpen && (
          <div className="rounded-xl border border-border-bright animate-fade-in" style={{ marginTop: '8px', paddingTop: '8px', paddingBottom: '8px', backgroundColor: '#2a2a32' }}>
            {/* Company list */}
            {companies.map((company) => (
              <button
                key={company.id}
                onClick={() => {
                  switchCompany(company.id)
                  setCompanySwitcherOpen(false)
                }}
                className="flex items-center w-full text-left hover:bg-white/[0.05] transition-all cursor-pointer"
                style={{ gap: '12px', padding: '8px 12px' }}
              >
                <span className="text-lg">{company.avatar}</span>
                <span className="flex-1 text-[13px] font-medium text-text-primary truncate">{company.name}</span>
                {company.id === activeCompanyId && (
                  <Check className="w-3.5 h-3.5 text-flame-400 shrink-0" />
                )}
              </button>
            ))}

            <div className="border-t border-white/[0.06]" style={{ marginTop: '6px', marginBottom: '6px' }} />

            {/* Create company */}
            {isCreatingCompany ? (
              <div style={{ padding: '8px 12px' }}>
                <div className="flex flex-col" style={{ gap: '10px' }}>
                <div className="flex flex-wrap" style={{ gap: '6px' }}>
                  {COMPANY_AVATARS.slice(0, 8).map(a => (
                    <button
                      key={a}
                      onClick={() => setNewCompanyAvatar(a)}
                      className={cn(
                        'w-7 h-7 rounded-lg text-sm flex items-center justify-center transition-all cursor-pointer',
                        newCompanyAvatar === a ? 'bg-flame-500/15 ring-1 ring-flame-500/40 shadow-[0_0_8px_-2px_rgba(249,115,22,0.3)]' : 'hover:bg-white/[0.06]'
                      )}
                    >
                      {a}
                    </button>
                  ))}
                </div>
                <input
                  ref={inputRef}
                  value={newCompanyName}
                  onChange={(e) => setNewCompanyName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateCompany()}
                  placeholder="Company name..."
                  className="w-full rounded-lg bg-white/[0.04] border border-white/[0.06] text-[13px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-flame-500/30 focus:shadow-[0_0_12px_-4px_rgba(249,115,22,0.2)]"
                  style={{ padding: '6px 10px' }}
                />
                <div className="flex" style={{ gap: '6px' }}>
                  <button
                    onClick={handleCreateCompany}
                    disabled={!newCompanyName.trim()}
                    className="flex-1 rounded-lg bg-gradient-to-b from-flame-500 to-flame-600 text-white text-[12px] font-medium hover:from-flame-400 hover:to-flame-500 transition-all disabled:opacity-40 cursor-pointer shadow-[0_2px_8px_-2px_rgba(249,115,22,0.3)]"
                    style={{ padding: '6px 10px' }}
                  >
                    Create
                  </button>
                  <button
                    onClick={() => setIsCreatingCompany(false)}
                    className="rounded-lg text-text-tertiary text-[12px] hover:bg-white/[0.04] transition-colors cursor-pointer"
                    style={{ padding: '6px 10px' }}
                  >
                    Cancel
                  </button>
                </div>
                </div>
              </div>
            ) : (
              <button
                onClick={() => { setIsCreatingCompany(true); setEditingCompanyId(null) }}
                className="flex items-center w-full text-[13px] text-text-tertiary hover:text-text-primary hover:bg-white/[0.05] transition-all cursor-pointer"
                style={{ gap: '10px', padding: '8px 12px' }}
              >
                <Plus className="w-3.5 h-3.5" />
                Create Company
              </button>
            )}

            {activeCompany && (
              <>
                <div className="border-t border-white/[0.06]" style={{ marginTop: '6px', marginBottom: '6px' }} />
                <button
                  onClick={() => {
                    handleStartEdit(activeCompany)
                    setCompanySwitcherOpen(false)
                  }}
                  className="flex items-center w-full text-[13px] text-text-tertiary hover:text-text-primary hover:bg-white/[0.05] transition-all cursor-pointer"
                  style={{ gap: '10px', padding: '8px 12px' }}
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Edit Company
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 flex flex-col z-10" style={{ paddingLeft: '16px', paddingRight: '16px', gap: '8px' }}>
        {navItems.map((item) => {
          const isActive = activeView === item.id
          const Icon = item.icon
          return (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id)}
              style={{ gap: '14px', padding: '14px 16px' }}
              className={cn(
                'relative flex items-center w-full rounded-xl text-[14px] font-medium transition-all duration-300 cursor-pointer',
                isActive
                  ? 'bg-bg-elevated text-text-primary nav-active-indicator'
                  : 'text-text-tertiary hover:text-text-secondary hover:bg-bg-tertiary'
              )}
            >
              <Icon className={cn(
                'w-[20px] h-[20px] transition-all duration-300',
                isActive ? 'text-flame-400' : ''
              )} />
              {item.label}
              {item.id === 'employees' && employees.length > 0 && (
                <span className={cn(
                  'ml-auto text-[12px] tabular-nums',
                  isActive ? 'text-text-secondary' : 'text-text-tertiary'
                )}>
                  {employees.length}
                </span>
              )}
              {item.id === 'tasks' && tasks.filter(t => t.status === 'escalated').length > 0 && (
                <span className="ml-auto flex items-center justify-center min-w-[20px] h-5 rounded-full bg-rose-500/20 text-rose-400 text-[11px] font-semibold tabular-nums" style={{ padding: '0 6px' }}>
                  {tasks.filter(t => t.status === 'escalated').length}
                </span>
              )}
              {item.id === 'tasks' && tasks.filter(t => t.status === 'escalated').length === 0 && tasks.length > 0 && (
                <span className={cn(
                  'ml-auto text-[12px] tabular-nums',
                  isActive ? 'text-text-secondary' : 'text-text-tertiary'
                )}>
                  {tasks.length}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {/* Bottom section */}
      <div className="relative flex items-center justify-between z-10" style={{ paddingLeft: '16px', paddingRight: '16px', paddingTop: '20px', paddingBottom: '20px' }}>
        <div className="flex items-center" style={{ gap: '10px' }}>
          <div className="relative flex items-center justify-center w-6 h-6 rounded-lg bg-gradient-to-br from-flame-500/25 to-flame-700/20 shadow-[0_0_12px_-2px_rgba(249,115,22,0.25)]">
            <Flame className="w-3.5 h-3.5 text-flame-400 fire-flicker" />
          </div>
          <span className="text-[11px] font-semibold tracking-wide gradient-text-static">Prometheus</span>
        </div>
        <div className="flex items-center" style={{ gap: '4px' }}>
          <button
            onClick={() => setNotificationPanelOpen(!notificationPanelOpen)}
            className="relative flex items-center justify-center w-7 h-7 rounded-lg text-text-tertiary hover:text-text-secondary hover:bg-white/[0.04] transition-all cursor-pointer"
            title="Notifications"
          >
            <Bell className="w-3.5 h-3.5" />
            {notifications.filter(n => !n.read).length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[14px] h-[14px] rounded-full bg-flame-500 text-white text-[9px] font-bold tabular-nums shadow-[0_0_8px_rgba(249,115,22,0.4)]" style={{ padding: '0 3px' }}>
                {notifications.filter(n => !n.read).length}
              </span>
            )}
          </button>
          <button
            onClick={toggleSidebar}
            className="flex items-center justify-center w-7 h-7 rounded-lg text-text-tertiary hover:text-text-secondary hover:bg-white/[0.04] transition-all cursor-pointer"
            title="Collapse sidebar"
          >
            <PanelLeftClose className="w-3.5 h-3.5" />
          </button>
        </div>
        {notificationPanelOpen && (
          <NotificationPanel onClose={() => setNotificationPanelOpen(false)} />
        )}
      </div>
    </aside>
  )
}
