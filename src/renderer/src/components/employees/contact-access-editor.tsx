import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useAppStore, type ContactAccess } from '@/stores/app-store'

interface ContactAccessEditorProps {
  value: ContactAccess
  onChange: (access: ContactAccess) => void
  currentEmployeeId?: string
}

const modes = [
  { value: 'none' as const, label: 'No Access', desc: 'Cannot contact any other employees' },
  { value: 'specific' as const, label: 'Specific', desc: 'Can only contact selected employees and departments' },
  { value: 'all' as const, label: 'Everyone', desc: 'Can contact any employee in the company' }
]

export function ContactAccessEditor({ value, onChange, currentEmployeeId }: ContactAccessEditorProps) {
  const { employees, departments } = useAppStore()

  // Exclude current employee from contact list
  const otherEmployees = employees.filter(e => e.id !== currentEmployeeId)

  // Employees covered by selected departments
  const coveredByDept = new Set(
    otherEmployees
      .filter(e => e.departmentId && value.allowedDepartmentIds.includes(e.departmentId))
      .map(e => e.id)
  )

  const toggleDepartment = (deptId: string) => {
    const ids = value.allowedDepartmentIds.includes(deptId)
      ? value.allowedDepartmentIds.filter(id => id !== deptId)
      : [...value.allowedDepartmentIds, deptId]
    onChange({ ...value, allowedDepartmentIds: ids })
  }

  const toggleEmployee = (empId: string) => {
    const ids = value.allowedEmployeeIds.includes(empId)
      ? value.allowedEmployeeIds.filter(id => id !== empId)
      : [...value.allowedEmployeeIds, empId]
    onChange({ ...value, allowedEmployeeIds: ids })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Contact Access</CardTitle>
        <CardDescription>
          Control which other employees this team member can send tasks and messages to.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col" style={{ gap: '16px' }}>
        {/* Mode selector */}
        <div className="flex bg-white/[0.05] rounded-xl border border-white/[0.08]" style={{ gap: '4px', padding: '4px' }}>
          {modes.map((m) => (
            <button
              key={m.value}
              onClick={() => onChange({ ...value, mode: m.value })}
              className={`flex-1 rounded-lg text-[13px] font-medium transition-all duration-200 cursor-pointer ${
                value.mode === m.value
                  ? 'bg-white/[0.07] text-text-primary'
                  : 'text-text-tertiary hover:text-text-secondary'
              }`}
              style={{ padding: '8px 12px' }}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="text-[12px] text-text-tertiary">
          {modes.find(m => m.value === value.mode)?.desc}
        </p>

        {/* Specific mode: department + employee pickers */}
        {value.mode === 'specific' && (
          <div className="flex flex-col" style={{ gap: '16px', paddingTop: '8px' }}>
            {/* Departments */}
            {departments.length > 0 && (
              <div>
                <p className="text-[12px] font-medium text-text-secondary" style={{ marginBottom: '8px' }}>Departments</p>
                <div className="flex flex-col" style={{ gap: '4px' }}>
                  {departments.map((dept) => {
                    const isSelected = value.allowedDepartmentIds.includes(dept.id)
                    const memberCount = otherEmployees.filter(e => e.departmentId === dept.id).length
                    return (
                      <button
                        key={dept.id}
                        onClick={() => toggleDepartment(dept.id)}
                        className={`flex items-center w-full rounded-xl text-left transition-all duration-200 cursor-pointer ${
                          isSelected
                            ? 'bg-flame-500/[0.05] border border-flame-500/15'
                            : 'hover:bg-white/[0.05] border border-transparent'
                        }`}
                        style={{ gap: '12px', padding: '12px' }}
                      >
                        <div className={`w-4 h-4 rounded-md border-2 flex items-center justify-center transition-all ${
                          isSelected ? 'bg-flame-600 border-flame-600' : 'border-white/[0.12]'
                        }`}>
                          {isSelected && <span className="text-[10px] text-white">✓</span>}
                        </div>
                        <div className="flex-1">
                          <span className="text-[13px] font-medium text-text-primary">{dept.name}</span>
                          <span className="text-[12px] text-text-tertiary ml-2">({memberCount} members)</span>
                        </div>
                        <Badge variant="secondary">
                          <span className={`inline-block w-2 h-2 rounded-full bg-${dept.color}-400 mr-1`} />
                          dept
                        </Badge>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Individual employees */}
            {otherEmployees.length > 0 && (
              <div>
                <p className="text-[12px] font-medium text-text-secondary" style={{ marginBottom: '8px' }}>Individual Employees</p>
                <div className="flex flex-col" style={{ gap: '4px' }}>
                  {otherEmployees.map((emp) => {
                    const isCoveredByDept = coveredByDept.has(emp.id)
                    const isDirectlySelected = value.allowedEmployeeIds.includes(emp.id)
                    const isEffectivelySelected = isDirectlySelected || isCoveredByDept
                    return (
                      <button
                        key={emp.id}
                        onClick={() => !isCoveredByDept && toggleEmployee(emp.id)}
                        className={`flex items-center w-full rounded-xl text-left transition-all duration-200 ${
                          isCoveredByDept ? 'opacity-60' : 'cursor-pointer'
                        } ${
                          isEffectivelySelected
                            ? 'bg-flame-500/[0.05] border border-flame-500/15'
                            : 'hover:bg-white/[0.05] border border-transparent'
                        }`}
                        style={{ gap: '12px', padding: '12px' }}
                      >
                        <div className={`w-4 h-4 rounded-md border-2 flex items-center justify-center transition-all ${
                          isEffectivelySelected ? 'bg-flame-600 border-flame-600' : 'border-white/[0.12]'
                        }`}>
                          {isEffectivelySelected && <span className="text-[10px] text-white">✓</span>}
                        </div>
                        <span className="text-lg">{emp.avatar}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium text-text-primary truncate">{emp.name}</p>
                          <p className="text-[11px] text-text-tertiary truncate">{emp.role}</p>
                        </div>
                        {isCoveredByDept && (
                          <span className="text-[11px] text-text-tertiary">via department</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {otherEmployees.length === 0 && departments.length === 0 && (
              <p className="text-[13px] text-text-tertiary text-center" style={{ paddingTop: '16px', paddingBottom: '16px' }}>
                No other employees or departments to select.
              </p>
            )}
          </div>
        )}
        </div>
      </CardContent>
    </Card>
  )
}
