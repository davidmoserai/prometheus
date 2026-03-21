import { Plus, Search, MoreHorizontal, MessageSquare, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { EmployeeEditor } from './employee-editor'
import { useAppStore, type Employee } from '@/stores/app-store'

export function EmployeesPage() {
  const {
    employees,
    isCreatingEmployee,
    editingEmployeeId,
    setCreatingEmployee,
    setEditingEmployee,
    deleteEmployee,
    setSelectedEmployee,
    setActiveView
  } = useAppStore()

  const [search, setSearch] = useState('')
  const [menuOpen, setMenuOpen] = useState<string | null>(null)

  const filtered = employees.filter(
    (e) =>
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.role.toLowerCase().includes(search.toLowerCase())
  )

  if (isCreatingEmployee || editingEmployeeId) {
    const editing = editingEmployeeId
      ? employees.find((e) => e.id === editingEmployeeId)
      : undefined
    return (
      <EmployeeEditor
        employee={editing}
        onClose={() => {
          setCreatingEmployee(false)
          setEditingEmployee(null)
        }}
      />
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-text-primary">Employees</h2>
            <p className="text-text-tertiary mt-1">Manage your AI workforce</p>
          </div>
          <Button onClick={() => setCreatingEmployee(true)}>
            <Plus className="w-4 h-4" />
            Hire Employee
          </Button>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
          <Input
            placeholder="Search employees..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Employee Grid */}
        {filtered.length > 0 ? (
          <div className="grid grid-cols-2 gap-4">
            {filtered.map((employee) => (
              <EmployeeCard
                key={employee.id}
                employee={employee}
                menuOpen={menuOpen === employee.id}
                onMenuToggle={() => setMenuOpen(menuOpen === employee.id ? null : employee.id)}
                onChat={() => {
                  setSelectedEmployee(employee.id)
                  setActiveView('chat')
                }}
                onEdit={() => setEditingEmployee(employee.id)}
                onDelete={() => {
                  deleteEmployee(employee.id)
                  setMenuOpen(null)
                }}
              />
            ))}
          </div>
        ) : employees.length === 0 ? (
          <EmptyState onHire={() => setCreatingEmployee(true)} />
        ) : (
          <div className="text-center py-12 text-text-tertiary">
            No employees match &quot;{search}&quot;
          </div>
        )}
      </div>
    </div>
  )
}

function EmployeeCard({
  employee,
  menuOpen,
  onMenuToggle,
  onChat,
  onEdit,
  onDelete
}: {
  employee: Employee
  menuOpen: boolean
  onMenuToggle: () => void
  onChat: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const activeTools = employee.tools.filter((t) => t.enabled).length

  return (
    <Card className="group hover:border-border-bright transition-all animate-fade-in">
      <CardContent>
        <div className="flex items-start gap-4">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-bg-surface text-xl shrink-0">
            {employee.avatar}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-text-primary truncate">{employee.name}</h3>
              <div className="relative">
                <button
                  onClick={onMenuToggle}
                  className="p-1 rounded-md text-text-tertiary hover:text-text-primary hover:bg-bg-surface transition-all cursor-pointer"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>
                {menuOpen && (
                  <div className="absolute right-0 top-8 z-10 w-40 rounded-lg border border-border-subtle bg-bg-elevated shadow-xl py-1 animate-fade-in">
                    <button
                      onClick={onChat}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-bg-surface transition-all cursor-pointer"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      Chat
                    </button>
                    <button
                      onClick={onEdit}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-bg-surface transition-all cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Edit
                    </button>
                    <button
                      onClick={onDelete}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-ember-400 hover:bg-ember-500/10 transition-all cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
            <p className="text-sm text-text-tertiary mt-0.5 truncate">{employee.role}</p>
            <div className="flex items-center gap-2 mt-3">
              <Badge variant="secondary">{employee.provider}</Badge>
              <Badge variant={activeTools > 0 ? 'default' : 'secondary'}>
                {activeTools} tools
              </Badge>
              {employee.knowledgeIds.length > 0 && (
                <Badge variant="success">{employee.knowledgeIds.length} docs</Badge>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border-subtle">
          <Button variant="secondary" size="sm" className="flex-1" onClick={onChat}>
            <MessageSquare className="w-3.5 h-3.5" />
            Chat
          </Button>
          <Button variant="ghost" size="sm" onClick={onEdit}>
            <Pencil className="w-3.5 h-3.5" />
            Edit
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function EmptyState({ onHire }: { onHire: () => void }) {
  return (
    <Card className="border-dashed border-border-default">
      <CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <div className="text-5xl mb-4">🔥</div>
        <h3 className="text-lg font-semibold text-text-primary mb-1">Build your team</h3>
        <p className="text-sm text-text-tertiary mb-6 max-w-md">
          Create AI employees with specialized roles, tools, and knowledge.
          They can work independently or hand off tasks to each other.
        </p>
        <Button onClick={onHire}>
          <Plus className="w-4 h-4" />
          Hire First Employee
        </Button>
      </CardContent>
    </Card>
  )
}
