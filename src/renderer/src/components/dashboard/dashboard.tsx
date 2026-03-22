import { Users, BookOpen, MessageSquare, ClipboardList, Plus, ArrowRight, Flame, Settings, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAppStore } from '@/stores/app-store'

export function Dashboard() {
  const { employees, knowledge, conversations, tasks, companies, activeCompanyId, departments, setActiveView, setCreatingEmployee } = useAppStore()

  const activeCompany = companies.find(c => c.id === activeCompanyId)

  // Onboarding: show when there are zero employees, zero knowledge docs, and zero conversations
  const isOnboarding = employees.length === 0 && knowledge.length === 0 && conversations.length === 0

  if (isOnboarding) {
    return <OnboardingView />
  }

  const stats = [
    {
      label: 'Active Employees',
      value: employees.length,
      icon: Users,
      gradient: 'from-flame-500/20 via-flame-600/10 to-transparent',
      iconColor: 'text-flame-400',
      accentBorder: 'hover:border-flame-500/30'
    },
    {
      label: 'Knowledge Docs',
      value: knowledge.length,
      icon: BookOpen,
      gradient: 'from-sky-500/20 via-sky-600/10 to-transparent',
      iconColor: 'text-sky-400',
      accentBorder: 'hover:border-sky-500/30'
    },
    {
      label: 'Conversations',
      value: conversations.length,
      icon: MessageSquare,
      gradient: 'from-emerald-500/20 via-emerald-600/10 to-transparent',
      iconColor: 'text-emerald-400',
      accentBorder: 'hover:border-emerald-500/30'
    },
    {
      label: 'Pending Tasks',
      value: tasks.filter(t => t.status === 'pending' || t.status === 'in_progress').length,
      icon: ClipboardList,
      gradient: 'from-violet-500/20 via-violet-600/10 to-transparent',
      iconColor: 'text-violet-400',
      accentBorder: 'hover:border-violet-500/30'
    }
  ]

  return (
    <div className="h-full overflow-y-auto">
      <div className="relative max-w-[960px] mx-auto" style={{ padding: '48px' }}>
        {/* Ambient orbs */}
        <div className="ambient-orb ambient-orb-1" style={{ top: '-50px', right: '-100px' }} />
        <div className="ambient-orb ambient-orb-2" style={{ top: '200px', left: '-80px' }} />

        {/* Hero Header */}
        <div className="relative" style={{ marginBottom: '56px' }}>
          <h2 className="text-[32px] font-bold tracking-tight">
            <span className="gradient-text">{activeCompany?.name || 'Welcome back'}</span>
          </h2>
          <p className="text-text-tertiary text-[15px]" style={{ marginTop: '12px' }}>
            Here is your workforce at a glance
            {departments.length > 0 && ` \u00B7 ${departments.length} department${departments.length !== 1 ? 's' : ''}`}
          </p>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-4" style={{ gap: '24px', marginBottom: '56px' }}>
          {stats.map((stat, i) => {
            const Icon = stat.icon
            return (
              <div
                key={stat.label}
                className={`group relative rounded-2xl bg-bg-elevated border border-border-default transition-all duration-500 cursor-default hover:bg-bg-surface hover:border-border-bright ${stat.accentBorder}`}
                style={{
                  padding: '28px',
                  animationDelay: `${i * 80}ms`,
                  animation: 'scale-in 0.5s cubic-bezier(0.16, 1, 0.3, 1) both',
                }}
              >
                {/* Subtle gradient fill on hover */}
                <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${stat.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />

                <div className="relative">
                  <div className={`flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br ${stat.gradient}`} style={{ marginBottom: '20px' }}>
                    <Icon className={`w-[20px] h-[20px] ${stat.iconColor}`} />
                  </div>
                  <p className="text-[32px] font-bold text-text-primary tracking-tight leading-none">
                    {stat.value}
                  </p>
                  <p className="text-[13px] text-text-tertiary font-medium" style={{ marginTop: '12px' }}>{stat.label}</p>
                </div>
              </div>
            )
          })}
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2" style={{ gap: '24px', marginBottom: '56px' }}>
          <button
            className="group relative flex items-center rounded-2xl bg-bg-elevated border border-border-default overflow-hidden transition-all duration-500 cursor-pointer text-left hover:bg-bg-surface hover:border-flame-500/30"
            style={{ gap: '20px', padding: '28px' }}
            onClick={() => {
              setActiveView('employees')
              setCreatingEmployee(true)
            }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-flame-500/[0.06] via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

            <div className="relative flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-flame-500/25 to-flame-600/15 shadow-[0_0_20px_-4px_rgba(249,115,22,0.2)] transition-all duration-500">
              <Plus className="w-5 h-5 text-flame-400 group-hover:rotate-90 transition-transform duration-500" />
            </div>
            <div className="relative flex-1">
              <h3 className="font-semibold text-text-primary text-[14px]">Hire New Employee</h3>
              <p className="text-[13px] text-text-tertiary" style={{ marginTop: '4px' }}>Create a new AI agent with custom skills</p>
            </div>
            <ArrowRight className="relative w-4 h-4 text-text-tertiary opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-300" />
          </button>

          <button
            className="group relative flex items-center rounded-2xl bg-bg-elevated border border-border-default overflow-hidden transition-all duration-500 cursor-pointer text-left hover:bg-bg-surface hover:border-sky-500/30"
            style={{ gap: '20px', padding: '28px' }}
            onClick={() => setActiveView('knowledge')}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-sky-500/[0.06] via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

            <div className="relative flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-sky-500/25 to-blue-500/15 shadow-[0_0_20px_-4px_rgba(56,189,248,0.15)] transition-all duration-500">
              <BookOpen className="w-5 h-5 text-sky-400" />
            </div>
            <div className="relative flex-1">
              <h3 className="font-semibold text-text-primary text-[14px]">Add Knowledge</h3>
              <p className="text-[13px] text-text-tertiary" style={{ marginTop: '4px' }}>Create shared documents for your team</p>
            </div>
            <ArrowRight className="relative w-4 h-4 text-text-tertiary opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-300" />
          </button>
        </div>

        {/* Employee List */}
        {employees.length > 0 ? (
          <div className="relative">
            <div className="flex items-center justify-between" style={{ marginBottom: '24px' }}>
              <h3 className="text-[16px] font-semibold text-text-primary tracking-tight">Your Team</h3>
              <Button variant="ghost" size="sm" onClick={() => setActiveView('employees')}>
                View all <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </div>
            <div className="flex flex-col" style={{ gap: '16px' }}>
              {employees.slice(0, 4).map((employee, i) => {
                const dept = departments.find(d => d.id === employee.departmentId)
                return (
                  <button
                    key={employee.id}
                    className="group flex items-center w-full rounded-2xl bg-bg-elevated border border-border-default hover:bg-bg-surface hover:border-border-bright transition-all duration-400 cursor-pointer text-left"
                    style={{
                      gap: '20px',
                      padding: '24px',
                      animationDelay: `${i * 60}ms`,
                      animation: 'scale-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) both',
                    }}
                    onClick={() => {
                      useAppStore.getState().setSelectedEmployee(employee.id)
                      setActiveView('chat')
                    }}
                  >
                    <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-bg-surface text-xl">
                      {employee.avatar}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-text-primary text-[15px] truncate">{employee.name}</p>
                      <p className="text-[13px] text-text-tertiary truncate" style={{ marginTop: '4px' }}>{employee.role}</p>
                    </div>
                    {dept && (
                      <Badge variant="secondary">
                        <span className={`inline-block w-2 h-2 rounded-full bg-${dept.color}-400 shrink-0`} style={{ marginRight: '6px' }} />
                        {dept.name}
                      </Badge>
                    )}
                    <Badge variant="secondary">
                      {employee.tools.filter(t => t.enabled).length} tools
                    </Badge>
                    <ArrowRight className="w-4 h-4 text-text-tertiary opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-300" />
                  </button>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="relative flex flex-col items-center justify-center text-center rounded-2xl border border-dashed border-border-default bg-bg-secondary overflow-hidden" style={{ paddingTop: '80px', paddingBottom: '80px' }}>
            <div className="absolute inset-0 gradient-mesh opacity-60" />

            <div className="relative flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-flame-500/15 to-ember-500/10 breathe-flame" style={{ marginBottom: '24px' }}>
              <Flame className="w-8 h-8 text-flame-400 fire-flicker" />
            </div>
            <h3 className="relative text-[18px] font-bold text-text-primary gradient-text" style={{ marginBottom: '8px' }}>No employees yet</h3>
            <p className="relative text-[13px] text-text-tertiary max-w-sm leading-relaxed" style={{ marginBottom: '32px' }}>
              Start building your AI workforce. Create your first employee and give them a role, tools, and knowledge to work with.
            </p>
            <Button className="relative" onClick={() => {
              setActiveView('employees')
              setCreatingEmployee(true)
            }}>
              <Plus className="w-4 h-4" />
              Hire First Employee
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

// Onboarding component for first-time users
function OnboardingView() {
  const { setActiveView, setCreatingEmployee } = useAppStore()

  const steps = [
    {
      number: 1,
      title: 'Configure a Provider',
      description: 'Go to Settings and add your API key for at least one provider.',
      icon: Settings,
      gradient: 'from-violet-500/20 via-violet-600/10 to-transparent',
      iconColor: 'text-violet-400',
      accentBorder: 'hover:border-violet-500/30',
      buttonLabel: 'Go to Settings',
      onClick: () => setActiveView('settings')
    },
    {
      number: 2,
      title: 'Hire Your First Employee',
      description: 'Create an AI team member with a role, tools, and knowledge.',
      icon: Users,
      gradient: 'from-flame-500/20 via-flame-600/10 to-transparent',
      iconColor: 'text-flame-400',
      accentBorder: 'hover:border-flame-500/30',
      buttonLabel: 'Hire Employee',
      onClick: () => {
        setActiveView('employees')
        setCreatingEmployee(true)
      }
    },
    {
      number: 3,
      title: 'Start Working',
      description: 'Chat with your employees, delegate tasks, and build your team.',
      icon: MessageSquare,
      gradient: 'from-emerald-500/20 via-emerald-600/10 to-transparent',
      iconColor: 'text-emerald-400',
      accentBorder: 'hover:border-emerald-500/30',
      buttonLabel: null,
      onClick: null
    }
  ]

  return (
    <div className="h-full overflow-y-auto">
      <div className="relative max-w-[960px] mx-auto" style={{ padding: '48px' }}>
        {/* Ambient orbs */}
        <div className="ambient-orb ambient-orb-1" style={{ top: '-50px', right: '-100px' }} />
        <div className="ambient-orb ambient-orb-2" style={{ top: '300px', left: '-80px' }} />
        <div className="ambient-orb ambient-orb-3" style={{ bottom: '100px', right: '-60px' }} />

        {/* Hero Header */}
        <div className="relative flex flex-col items-center text-center" style={{ marginBottom: '64px' }}>
          <div
            className="flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-flame-500/20 to-ember-500/10 breathe-flame"
            style={{
              marginBottom: '32px',
              animation: 'scale-in 0.6s cubic-bezier(0.16, 1, 0.3, 1) both',
            }}
          >
            <Flame className="w-10 h-10 text-flame-400 fire-flicker" />
          </div>
          <h2
            className="text-[32px] font-bold tracking-tight"
            style={{
              animation: 'scale-in 0.6s cubic-bezier(0.16, 1, 0.3, 1) both',
              animationDelay: '80ms',
            }}
          >
            <span className="gradient-text">Welcome to Prometheus</span>
          </h2>
          <p
            className="text-text-tertiary text-[16px] max-w-lg leading-relaxed"
            style={{
              marginTop: '16px',
              animation: 'scale-in 0.6s cubic-bezier(0.16, 1, 0.3, 1) both',
              animationDelay: '160ms',
            }}
          >
            Your AI workforce starts here. Here is how to get started:
          </p>
        </div>

        {/* Onboarding Steps */}
        <div className="flex flex-col" style={{ gap: '20px', marginBottom: '48px' }}>
          {steps.map((step, i) => {
            const Icon = step.icon
            return (
              <div
                key={step.number}
                className={`group relative rounded-2xl bg-bg-elevated border border-border-default overflow-hidden transition-all duration-500 ${step.accentBorder}`}
                style={{
                  padding: '32px',
                  animationDelay: `${(i + 2) * 100}ms`,
                  animation: 'scale-in 0.5s cubic-bezier(0.16, 1, 0.3, 1) both',
                }}
              >
                {/* Gradient background on hover */}
                <div className={`absolute inset-0 bg-gradient-to-r ${step.gradient} opacity-0 group-hover:opacity-40 transition-opacity duration-500`} />

                <div className="relative flex items-start" style={{ gap: '24px' }}>
                  {/* Step number + icon */}
                  <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-white/[0.06] to-white/[0.02] border border-white/[0.06] shrink-0">
                    <Icon className={`w-5 h-5 ${step.iconColor}`} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center" style={{ gap: '10px', marginBottom: '6px' }}>
                      <span className="text-[12px] font-bold text-flame-400">STEP {step.number}</span>
                    </div>
                    <h3 className="text-[16px] font-semibold text-text-primary">{step.title}</h3>
                    <p className="text-[13px] text-text-tertiary leading-relaxed" style={{ marginTop: '6px' }}>
                      {step.description}
                    </p>
                  </div>

                  {/* Action button */}
                  {step.buttonLabel && step.onClick && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={step.onClick}
                      className="shrink-0 self-center"
                    >
                      {step.buttonLabel}
                      <ArrowRight className="w-3.5 h-3.5 ml-1" />
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Tip */}
        <div
          className="relative rounded-2xl bg-gradient-to-r from-flame-500/[0.04] via-transparent to-flame-500/[0.04] border border-flame-500/10 overflow-hidden"
          style={{
            padding: '24px 32px',
            animation: 'scale-in 0.5s cubic-bezier(0.16, 1, 0.3, 1) both',
            animationDelay: '500ms',
          }}
        >
          <div className="flex items-center" style={{ gap: '16px' }}>
            <Sparkles className="w-5 h-5 text-flame-400 shrink-0 drop-shadow-[0_0_8px_rgba(249,115,22,0.4)]" />
            <p className="text-[13px] text-text-secondary leading-relaxed">
              <span className="font-semibold text-text-primary">Tip:</span>{' '}
              Try one of our templates — Researcher, Writer, or Developer — to get started quickly.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
