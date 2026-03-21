import {
  LayoutDashboard,
  Users,
  MessageSquare,
  BookOpen,
  Settings,
  Flame
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/app-store'

const navItems = [
  { id: 'dashboard' as const, label: 'Dashboard', icon: LayoutDashboard },
  { id: 'employees' as const, label: 'Employees', icon: Users },
  { id: 'chat' as const, label: 'Chat', icon: MessageSquare },
  { id: 'knowledge' as const, label: 'Knowledge', icon: BookOpen },
  { id: 'settings' as const, label: 'Settings', icon: Settings }
]

export function Sidebar() {
  const { activeView, setActiveView, employees } = useAppStore()

  return (
    <aside className="flex flex-col w-[220px] h-full bg-bg-secondary border-r border-border-subtle">
      {/* Logo area — draggable title bar region */}
      <div className="flex items-center gap-3 px-5 pt-10 pb-6">
        <div className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-flame-500 to-ember-600 shadow-lg shadow-flame-600/20">
          <Flame className="w-5 h-5 text-white" />
          <div className="absolute inset-0 rounded-xl bg-gradient-to-t from-transparent to-white/10" />
        </div>
        <div>
          <h1 className="text-base font-bold text-text-primary tracking-tight">Prometheus</h1>
          <p className="text-[10px] text-text-tertiary font-medium uppercase tracking-widest">AI Workforce</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-1">
        {navItems.map((item) => {
          const isActive = activeView === item.id
          const Icon = item.icon
          return (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id)}
              className={cn(
                'flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer',
                isActive
                  ? 'bg-flame-500/12 text-flame-400'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-surface'
              )}
            >
              <Icon className={cn('w-4.5 h-4.5', isActive && 'text-flame-400')} />
              {item.label}
              {item.id === 'employees' && employees.length > 0 && (
                <span className={cn(
                  'ml-auto text-xs px-1.5 py-0.5 rounded-md',
                  isActive
                    ? 'bg-flame-500/20 text-flame-400'
                    : 'bg-bg-surface text-text-tertiary'
                )}>
                  {employees.length}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {/* Bottom section */}
      <div className="px-4 py-4 border-t border-border-subtle">
        <div className="flex items-center gap-2 px-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 glow-pulse" />
          <span className="text-xs text-text-tertiary">System ready</span>
        </div>
      </div>
    </aside>
  )
}
