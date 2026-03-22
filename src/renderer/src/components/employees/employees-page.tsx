import { Plus, Search, MoreHorizontal, MessageSquare, Pencil, UserX, UserCheck, ChevronDown, X, Flame } from 'lucide-react'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { EmployeeEditor } from './employee-editor'
import { useAppStore, type Employee, type Department } from '@/stores/app-store'

export function EmployeesPage() {
  const {
    employees,
    terminatedEmployees,
    departments,
    isCreatingEmployee,
    editingEmployeeId,
    setCreatingEmployee,
    setEditingEmployee,
    fireEmployee,
    rehireEmployee,
    setSelectedEmployee,
    setActiveView,
    createDepartment,
    deleteDepartment
  } = useAppStore()

  const [search, setSearch] = useState('')
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const [showTerminated, setShowTerminated] = useState(false)
  const [showDeptForm, setShowDeptForm] = useState(false)
  const [newDeptName, setNewDeptName] = useState('')
  const [newDeptColor, setNewDeptColor] = useState('flame')

  const deptColors = ['flame', 'sky', 'emerald', 'violet', 'amber', 'rose', 'cyan', 'indigo']

  // Close menu on click outside
  useEffect(() => {
    if (!menuOpen) return
    const handler = () => setMenuOpen(null)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [menuOpen])

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

  const handleCreateDept = async () => {
    if (!newDeptName.trim()) return
    await createDepartment({ name: newDeptName.trim(), color: newDeptColor })
    setNewDeptName('')
    setShowDeptForm(false)
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="relative max-w-[960px] mx-auto" style={{ padding: '48px' }}>
        {/* Ambient background orbs */}
        <div className="ambient-orb ambient-orb-1" style={{ top: '-60px', right: '-120px' }} />
        <div className="ambient-orb ambient-orb-2" style={{ bottom: '100px', left: '-100px' }} />

        {/* Header */}
        <div className="flex items-center justify-between" style={{ marginBottom: '40px' }}>
          <div>
            <h2 className="text-[28px] font-bold tracking-tight">
              <span className="gradient-text">Employees</span>
            </h2>
            <p className="text-text-tertiary text-[15px]" style={{ marginTop: '8px' }}>Manage your AI workforce</p>
          </div>
          <Button onClick={() => setCreatingEmployee(true)}>
            <Plus className="w-4 h-4" />
            Hire Employee
          </Button>
        </div>

        {/* Departments bar */}
        <div className="flex items-center flex-wrap" style={{ gap: '10px', marginBottom: '32px' }}>
          {departments.map((dept) => (
            <div key={dept.id} className="group flex items-center" style={{ gap: '6px' }}>
              <Badge variant="secondary" className="pr-1.5">
                <span className={`inline-block w-2 h-2 rounded-full bg-${dept.color}-400 mr-1.5`} />
                {dept.name}
                <button
                  onClick={() => deleteDepartment(dept.id)}
                  className="rounded hover:bg-white/[0.1] opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  style={{ marginLeft: '6px', padding: '2px' }}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </Badge>
            </div>
          ))}
          {showDeptForm ? (
            <div className="flex items-center animate-fade-in" style={{ gap: '8px' }}>
              <div className="flex" style={{ gap: '2px' }}>
                {deptColors.map(c => (
                  <button
                    key={c}
                    onClick={() => setNewDeptColor(c)}
                    className={`w-5 h-5 rounded-md bg-${c}-400 transition-all cursor-pointer ${newDeptColor === c ? 'ring-2 ring-white/30 scale-110' : 'opacity-50 hover:opacity-80'}`}
                  />
                ))}
              </div>
              <input
                value={newDeptName}
                onChange={(e) => setNewDeptName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateDept()}
                placeholder="Department name..."
                autoFocus
                className="rounded-lg bg-bg-tertiary border border-border-default text-[12px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-flame-500/30 w-36"
                style={{ padding: '6px 12px' }}
              />
              <button onClick={handleCreateDept} className="text-[12px] text-flame-400 font-medium cursor-pointer hover:text-flame-300">Add</button>
              <button onClick={() => setShowDeptForm(false)} className="text-[12px] text-text-tertiary cursor-pointer hover:text-text-secondary">Cancel</button>
            </div>
          ) : (
            <button
              onClick={() => setShowDeptForm(true)}
              className="flex items-center text-[12px] text-text-tertiary hover:text-text-secondary transition-colors cursor-pointer rounded-lg hover:bg-bg-tertiary"
              style={{ gap: '4px', padding: '4px 8px' }}
            >
              <Plus className="w-3 h-3" />
              Department
            </button>
          )}
        </div>

        {/* Search */}
        <div className="relative" style={{ marginBottom: '40px' }}>
          <Search className="absolute top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" style={{ left: '16px' }} />
          <Input
            placeholder="Search employees..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: '44px' }}
          />
        </div>

        {/* Employee Grid */}
        {filtered.length > 0 ? (
          <div className="grid grid-cols-2" style={{ gap: '24px' }}>
            {filtered.map((employee, i) => (
              <EmployeeCard
                key={employee.id}
                employee={employee}
                department={departments.find(d => d.id === employee.departmentId)}
                index={i}
                menuOpen={menuOpen === employee.id}
                onMenuToggle={() => setMenuOpen(menuOpen === employee.id ? null : employee.id)}
                onChat={() => {
                  setSelectedEmployee(employee.id)
                  setActiveView('chat')
                }}
                onEdit={() => setEditingEmployee(employee.id)}
                onFire={() => {
                  fireEmployee(employee.id)
                  setMenuOpen(null)
                }}
              />
            ))}
          </div>
        ) : employees.length === 0 ? (
          <EmptyState onHire={() => setCreatingEmployee(true)} />
        ) : (
          <div className="text-center text-text-tertiary" style={{ paddingTop: '64px', paddingBottom: '64px' }}>
            No employees match &quot;{search}&quot;
          </div>
        )}

        {/* Terminated employees section */}
        {terminatedEmployees.length > 0 && (
          <div style={{ marginTop: '48px' }}>
            <button
              onClick={() => setShowTerminated(!showTerminated)}
              className="flex items-center text-[14px] font-medium text-text-tertiary hover:text-text-secondary transition-colors cursor-pointer"
              style={{ gap: '8px', marginBottom: '20px' }}
            >
              <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${showTerminated ? 'rotate-0' : '-rotate-90'}`} />
              Terminated ({terminatedEmployees.length})
            </button>
            {showTerminated && (
              <div className="flex flex-col animate-fade-in" style={{ gap: '12px' }}>
                {terminatedEmployees.map((employee) => (
                  <div
                    key={employee.id}
                    className="flex items-center rounded-2xl bg-bg-secondary border border-border-subtle opacity-60"
                    style={{ gap: '16px', padding: '20px' }}
                  >
                    <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-bg-tertiary text-lg grayscale">
                      {employee.avatar}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-text-secondary text-[14px] truncate line-through">{employee.name}</p>
                      <p className="text-[12px] text-text-tertiary truncate mt-0.5">{employee.role}</p>
                    </div>
                    <span className="text-[11px] text-text-tertiary">
                      Terminated {employee.terminatedAt ? new Date(employee.terminatedAt).toLocaleDateString() : ''}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => rehireEmployee(employee.id)}
                      className="text-emerald-400 hover:text-emerald-300"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      Rehire
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function EmployeeCard({
  employee,
  department,
  index,
  menuOpen,
  onMenuToggle,
  onChat,
  onEdit,
  onFire
}: {
  employee: Employee
  department?: Department
  index: number
  menuOpen: boolean
  onMenuToggle: () => void
  onChat: () => void
  onEdit: () => void
  onFire: () => void
}) {
  const activeTools = employee.tools.filter((t) => t.enabled).length

  return (
    <div
      className="group relative rounded-2xl bg-bg-elevated hover:bg-bg-surface border border-border-default hover:border-border-bright transition-all duration-500 card-hover-glow overflow-hidden"
      style={{
        padding: '28px',
        animationDelay: `${index * 60}ms`,
        animation: 'scale-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) both',
      }}
    >
      {/* Gradient highlight on hover */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-flame-500/[0.06] via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

      <div className="relative flex items-start" style={{ gap: '20px' }}>
        <div className="flex items-center justify-center w-13 h-13 rounded-xl bg-bg-surface text-2xl shrink-0">
          {employee.avatar}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-text-primary text-[15px] truncate">{employee.name}</h3>
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); onMenuToggle() }}
                className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-bg-surface transition-all cursor-pointer opacity-0 group-hover:opacity-100"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-9 z-10 w-40 border border-border-default animate-fade-in" style={{ padding: '4px', borderRadius: '12px', backgroundColor: '#2a2a32', boxShadow: '0 16px 48px -8px rgba(0,0,0,0.7)' }}>
                  <button
                    onClick={onEdit}
                    className="flex items-center w-full text-[13px] text-text-secondary hover:text-text-primary hover:bg-bg-surface transition-all cursor-pointer"
                    style={{ gap: '10px', padding: '8px 12px', borderRadius: '8px' }}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Edit
                  </button>
                  <button
                    onClick={onFire}
                    className="flex items-center w-full text-[13px] text-ember-400 hover:bg-ember-500/10 transition-all cursor-pointer"
                    style={{ gap: '10px', padding: '8px 12px', borderRadius: '8px' }}
                  >
                    <UserX className="w-3.5 h-3.5" />
                    Fire
                  </button>
                </div>
              )}
            </div>
          </div>
          <p className="text-[13px] text-text-tertiary truncate" style={{ marginTop: '6px' }}>{employee.role}</p>
          <div className="flex items-center" style={{ gap: '8px', marginTop: '20px' }}>
            {department && (
              <Badge variant="secondary">
                <span className={`inline-block w-2 h-2 rounded-full bg-${department.color}-400 mr-1.5`} />
                {department.name}
              </Badge>
            )}
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

      <div className="relative flex items-center border-t border-border-subtle" style={{ marginTop: '24px', paddingTop: '24px' }}>
        <Button variant="secondary" size="sm" className="flex-1" onClick={onChat}>
          <MessageSquare className="w-3.5 h-3.5" />
          Chat
        </Button>
      </div>
    </div>
  )
}

function EmptyState({ onHire }: { onHire: () => void }) {
  return (
    <div className="relative flex flex-col items-center justify-center text-center rounded-2xl border border-dashed border-border-default bg-bg-secondary overflow-hidden" style={{ paddingTop: '80px', paddingBottom: '80px' }}>
      <div className="absolute inset-0 gradient-mesh opacity-60" />

      <div className="relative flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-flame-500/15 to-ember-500/10 breathe-flame" style={{ marginBottom: '24px' }}>
        <Flame className="w-8 h-8 text-flame-400 fire-flicker" />
      </div>
      <h3 className="relative text-[18px] font-bold gradient-text" style={{ marginBottom: '12px' }}>Build your team</h3>
      <p className="relative text-[13px] text-text-tertiary max-w-md leading-relaxed" style={{ marginBottom: '32px' }}>
        Create AI employees with specialized roles, tools, and knowledge.
        They can work independently or hand off tasks to each other.
      </p>
      <Button className="relative" onClick={onHire}>
        <Plus className="w-4 h-4" />
        Hire First Employee
      </Button>
    </div>
  )
}
