import { Users, BookOpen, MessageSquare, Zap, Plus, ArrowRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAppStore } from '@/stores/app-store'

export function Dashboard() {
  const { employees, knowledge, conversations, setActiveView, setCreatingEmployee } = useAppStore()

  const stats = [
    {
      label: 'Employees',
      value: employees.length,
      icon: Users,
      color: 'text-flame-400',
      bgColor: 'bg-flame-500/10',
      borderColor: 'border-flame-500/20'
    },
    {
      label: 'Knowledge Docs',
      value: knowledge.length,
      icon: BookOpen,
      color: 'text-sky-400',
      bgColor: 'bg-sky-500/10',
      borderColor: 'border-sky-500/20'
    },
    {
      label: 'Conversations',
      value: conversations.length,
      icon: MessageSquare,
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-500/10',
      borderColor: 'border-emerald-500/20'
    },
    {
      label: 'Tools Active',
      value: employees.reduce((acc, e) => acc + e.tools.filter(t => t.enabled).length, 0),
      icon: Zap,
      color: 'text-violet-400',
      bgColor: 'bg-violet-500/10',
      borderColor: 'border-violet-500/20'
    }
  ]

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-text-primary">Welcome back</h2>
          <p className="text-text-tertiary mt-1">Here&apos;s your workforce at a glance</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          {stats.map((stat) => {
            const Icon = stat.icon
            return (
              <Card key={stat.label} className={`border ${stat.borderColor} hover:border-opacity-60 transition-all cursor-default`}>
                <CardContent className="flex items-center gap-4">
                  <div className={`flex items-center justify-center w-10 h-10 rounded-xl ${stat.bgColor}`}>
                    <Icon className={`w-5 h-5 ${stat.color}`} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-text-primary">{stat.value}</p>
                    <p className="text-xs text-text-tertiary">{stat.label}</p>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <Card className="group hover:border-flame-500/30 cursor-pointer transition-all" onClick={() => {
            setActiveView('employees')
            setCreatingEmployee(true)
          }}>
            <CardContent className="flex items-center gap-4">
              <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-flame-500/20 to-ember-500/20 border border-flame-500/20 group-hover:border-flame-500/40 transition-all">
                <Plus className="w-6 h-6 text-flame-400" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-text-primary">Hire New Employee</h3>
                <p className="text-sm text-text-tertiary">Create a new AI agent with custom skills</p>
              </div>
              <ArrowRight className="w-5 h-5 text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity" />
            </CardContent>
          </Card>

          <Card className="group hover:border-sky-500/30 cursor-pointer transition-all" onClick={() => setActiveView('knowledge')}>
            <CardContent className="flex items-center gap-4">
              <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-sky-500/20 to-blue-500/20 border border-sky-500/20 group-hover:border-sky-500/40 transition-all">
                <BookOpen className="w-6 h-6 text-sky-400" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-text-primary">Add Knowledge</h3>
                <p className="text-sm text-text-tertiary">Create shared documents for your team</p>
              </div>
              <ArrowRight className="w-5 h-5 text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity" />
            </CardContent>
          </Card>
        </div>

        {/* Employee List */}
        {employees.length > 0 ? (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-text-primary">Your Team</h3>
              <Button variant="ghost" size="sm" onClick={() => setActiveView('employees')}>
                View all <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {employees.slice(0, 4).map((employee) => (
                <Card
                  key={employee.id}
                  className="group hover:border-border-bright cursor-pointer transition-all"
                  onClick={() => {
                    useAppStore.getState().setSelectedEmployee(employee.id)
                    setActiveView('chat')
                  }}
                >
                  <CardContent className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-bg-surface text-lg">
                      {employee.avatar}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-text-primary truncate">{employee.name}</p>
                      <p className="text-xs text-text-tertiary truncate">{employee.role}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="secondary">
                        {employee.tools.filter(t => t.enabled).length} tools
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ) : (
          <Card className="border-dashed border-border-default">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-flame-500/10 to-ember-500/10 border border-flame-500/20 mb-4">
                <Users className="w-8 h-8 text-flame-400" />
              </div>
              <h3 className="text-lg font-semibold text-text-primary mb-1">No employees yet</h3>
              <p className="text-sm text-text-tertiary mb-4 max-w-sm">
                Start building your AI workforce. Create your first employee and give them a role, tools, and knowledge to work with.
              </p>
              <Button onClick={() => {
                setActiveView('employees')
                setCreatingEmployee(true)
              }}>
                <Plus className="w-4 h-4" />
                Hire First Employee
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
