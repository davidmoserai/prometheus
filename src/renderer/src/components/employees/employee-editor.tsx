import { useState } from 'react'
import { ArrowLeft, Save, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { ContactAccessEditor } from './contact-access-editor'
import { useAppStore, type Employee, type ToolAssignment, type PermissionSet, type ContactAccess } from '@/stores/app-store'

const AVATARS = ['🔥', '⚡', '🧠', '🎯', '🚀', '💡', '🔮', '⭐', '🛡️', '🎨', '📊', '🔬', '📝', '🤖', '🦾', '🧬']

const DEFAULT_TOOLS: ToolAssignment[] = [
  { id: 'web-search', name: 'Web Search', source: 'builtin', enabled: false, requiresApproval: false },
  { id: 'web-browse', name: 'Web Browse', source: 'builtin', enabled: false, requiresApproval: false },
  { id: 'file-read', name: 'Read Files', source: 'builtin', enabled: false, requiresApproval: false },
  { id: 'file-write', name: 'Write Files', source: 'builtin', enabled: false, requiresApproval: true },
  { id: 'code-execute', name: 'Execute Code', source: 'builtin', enabled: false, requiresApproval: true },
  { id: 'email-send', name: 'Send Email', source: 'mcp', enabled: false, requiresApproval: true },
  { id: 'calendar-manage', name: 'Calendar', source: 'mcp', enabled: false, requiresApproval: true },
  { id: 'github', name: 'GitHub', source: 'mcp', enabled: false, requiresApproval: false },
  { id: 'slack', name: 'Slack', source: 'mcp', enabled: false, requiresApproval: true },
  { id: 'database', name: 'Database', source: 'mcp', enabled: false, requiresApproval: true }
]

const DEFAULT_CONTACT_ACCESS: ContactAccess = {
  mode: 'none',
  allowedEmployeeIds: [],
  allowedDepartmentIds: []
}

const DEFAULT_PERMISSIONS: PermissionSet = {
  canBrowseWeb: false,
  canReadFiles: false,
  canWriteFiles: false,
  canExecuteCode: false,
  contactAccess: DEFAULT_CONTACT_ACCESS,
  autoApproveAll: false
}

interface EmployeeEditorProps {
  employee?: Employee
  onClose: () => void
}

export function EmployeeEditor({ employee, onClose }: EmployeeEditorProps) {
  const { createEmployee, updateEmployee, knowledge, settings, departments } = useAppStore()
  const isEditing = !!employee

  const [name, setName] = useState(employee?.name || '')
  const [role, setRole] = useState(employee?.role || '')
  const [avatar, setAvatar] = useState(employee?.avatar || '🔥')
  const [systemPrompt, setSystemPrompt] = useState(employee?.systemPrompt || '')
  const [selectedKnowledge, setSelectedKnowledge] = useState<string[]>(employee?.knowledgeIds || [])
  const [tools, setTools] = useState<ToolAssignment[]>(employee?.tools || DEFAULT_TOOLS)
  const [provider, setProvider] = useState(employee?.provider || settings?.defaultProvider || 'openai')
  const initialModel = employee?.model || settings?.defaultModel || 'gpt-4o'
  // If saved model no longer exists in provider's model list, fallback to first available
  const providerModels = settings?.providers.find(p => p.id === (employee?.provider || settings?.defaultProvider || 'openai'))?.models || []
  const validModel = providerModels.includes(initialModel) ? initialModel : (providerModels[0] || initialModel)
  const [model, setModel] = useState(validModel)
  const [permissions, setPermissions] = useState<PermissionSet>(employee?.permissions || DEFAULT_PERMISSIONS)
  const [departmentId, setDepartmentId] = useState<string | null>(employee?.departmentId ?? null)
  const [activeTab, setActiveTab] = useState<'basic' | 'tools' | 'knowledge' | 'permissions'>('basic')

  const enabledProviders = settings?.providers.filter(p => p.enabled || p.id === 'ollama') || []

  const handleSave = async () => {
    if (!name.trim()) return
    const data = {
      name: name.trim(),
      role: role.trim(),
      avatar,
      systemPrompt,
      knowledgeIds: selectedKnowledge,
      tools,
      provider,
      model,
      permissions,
      departmentId,
      status: 'active' as const,
      terminatedAt: null
    }
    if (isEditing && employee) {
      await updateEmployee(employee.id, data)
    } else {
      await createEmployee(data)
    }
    onClose()
  }

  const toggleTool = (toolId: string) => {
    setTools(tools.map(t => t.id === toolId ? { ...t, enabled: !t.enabled } : t))
  }

  const toggleToolApproval = (toolId: string) => {
    setTools(tools.map(t => t.id === toolId ? { ...t, requiresApproval: !t.requiresApproval } : t))
  }

  const tabs = [
    { id: 'basic' as const, label: 'Basic Info' },
    { id: 'tools' as const, label: 'Tools' },
    { id: 'knowledge' as const, label: 'Knowledge' },
    { id: 'permissions' as const, label: 'Access' }
  ]

  return (
    <div className="h-full overflow-y-auto">
      <div className="relative max-w-[720px] mx-auto" style={{ padding: '40px' }}>
        {/* Ambient orb */}
        <div className="ambient-orb ambient-orb-1" style={{ top: '-80px', right: '-150px' }} />

        {/* Header */}
        <div className="flex items-center justify-between" style={{ marginBottom: '32px' }}>
          <div className="flex items-center" style={{ gap: '12px' }}>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h2 className="text-xl font-bold tracking-tight">
                <span className="gradient-text">{isEditing ? `Edit ${employee.name}` : 'Hire New Employee'}</span>
              </h2>
              <p className="text-[13px] text-text-tertiary mt-0.5">
                {isEditing ? 'Update their configuration' : 'Configure your new AI team member'}
              </p>
            </div>
          </div>
          <Button onClick={handleSave} disabled={!name.trim()}>
            <Save className="w-4 h-4" />
            {isEditing ? 'Save Changes' : 'Hire Employee'}
          </Button>
        </div>

        {/* Tabs */}
        <div className="relative flex bg-bg-tertiary rounded-xl border border-border-default overflow-hidden" style={{ gap: '2px', padding: '6px', marginBottom: '40px' }}>
          {/* Gradient border effect */}
          <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-flame-500/[0.03] via-transparent to-flame-500/[0.03] pointer-events-none" />
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex-1 rounded-lg text-[13px] font-medium transition-all duration-300 cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-white/[0.07] text-text-primary shadow-[0_0_16px_-4px_rgba(249,115,22,0.1)]'
                  : 'text-text-tertiary hover:text-text-secondary'
              }`}
              style={{ padding: '8px 16px' }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="animate-fade-in">
          {activeTab === 'basic' && (
            <div className="flex flex-col" style={{ gap: '16px' }}>
              {/* Avatar Selection */}
              <Card>
                <CardHeader>
                  <CardTitle>Avatar</CardTitle>
                  <CardDescription>Pick an icon for this employee</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap" style={{ gap: '8px' }}>
                    {AVATARS.map((a) => (
                      <button
                        key={a}
                        onClick={() => setAvatar(a)}
                        className={`flex items-center justify-center w-11 h-11 rounded-xl text-xl transition-all duration-300 cursor-pointer ${
                          avatar === a
                            ? 'bg-flame-500/12 ring-2 ring-flame-500/50 scale-110 shadow-[0_0_16px_-4px_rgba(249,115,22,0.3)]'
                            : 'bg-white/[0.04] hover:bg-white/[0.07] hover:scale-105'
                        }`}
                      >
                        {a}
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Name & Role */}
              <Card>
                <CardHeader>
                  <CardTitle>Identity</CardTitle>
                  <CardDescription>Give your employee a name and role</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col" style={{ gap: '16px' }}>
                  <div>
                    <label className="block text-[13px] font-medium text-text-secondary" style={{ marginBottom: '8px' }}>Name</label>
                    <Input
                      placeholder="e.g. Atlas, Spark, Oracle..."
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-[13px] font-medium text-text-secondary" style={{ marginBottom: '8px' }}>Role</label>
                    <Input
                      placeholder="e.g. Research Analyst, Code Reviewer, Writer..."
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-[13px] font-medium text-text-secondary" style={{ marginBottom: '8px' }}>Department</label>
                    <select
                      value={departmentId || ''}
                      onChange={(e) => setDepartmentId(e.target.value || null)}
                      className="flex w-full rounded-xl border border-border-default bg-bg-tertiary text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-flame-500/25 cursor-pointer transition-all duration-300"
                      style={{ height: '44px', padding: '10px 16px', borderRadius: '12px' }}
                    >
                      <option value="">No department</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                  </div>
                </CardContent>
              </Card>

              {/* System Prompt */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center" style={{ gap: '8px' }}>
                    System Instructions
                    <Sparkles className="w-4 h-4 text-flame-400 drop-shadow-[0_0_6px_rgba(249,115,22,0.4)]" />
                  </CardTitle>
                  <CardDescription>
                    Define how this employee behaves. This is their core personality and expertise.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    placeholder="You are a senior research analyst specializing in..."
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    rows={8}
                    className="font-mono text-[13px]"
                  />
                </CardContent>
              </Card>

              {/* Provider & Model */}
              <Card>
                <CardHeader>
                  <CardTitle>AI Provider</CardTitle>
                  <CardDescription>Choose which LLM powers this employee</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col" style={{ gap: '16px' }}>
                  <div>
                    <label className="block text-[13px] font-medium text-text-secondary" style={{ marginBottom: '8px' }}>Provider</label>
                    <select
                      value={provider}
                      onChange={(e) => {
                        setProvider(e.target.value)
                        const prov = settings?.providers.find(p => p.id === e.target.value)
                        if (prov?.models[0]) setModel(prov.models[0])
                      }}
                      className="flex w-full rounded-xl border border-border-default bg-bg-tertiary text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-flame-500/25 cursor-pointer transition-all duration-300"
                      style={{ height: '44px', padding: '10px 16px', borderRadius: '12px' }}
                    >
                      {enabledProviders.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                      {enabledProviders.length === 0 && (
                        <option value="">No providers configured</option>
                      )}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[13px] font-medium text-text-secondary" style={{ marginBottom: '8px' }}>Model</label>
                    <select
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      className="flex w-full rounded-xl border border-border-default bg-bg-tertiary text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-flame-500/25 cursor-pointer transition-all duration-300"
                      style={{ height: '44px', padding: '10px 16px', borderRadius: '12px' }}
                    >
                      {(settings?.providers.find(p => p.id === provider)?.models || []).map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === 'tools' && (
            <Card>
              <CardHeader>
                <CardTitle>Available Tools</CardTitle>
                <CardDescription>
                  Select which tools this employee can use. Toggle approval to require your confirmation before execution.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col" style={{ gap: '4px' }}>
                  {tools.map((tool) => (
                    <div
                      key={tool.id}
                      className={`flex items-center justify-between rounded-xl transition-all duration-300 ${
                        tool.enabled
                          ? 'bg-flame-500/[0.04] border border-flame-500/10 shadow-[0_0_16px_-6px_rgba(249,115,22,0.1)]'
                          : 'hover:bg-white/[0.05] border border-transparent'
                      }`}
                      style={{ padding: '14px' }}
                    >
                      <div className="flex items-center" style={{ gap: '12px' }}>
                        <Switch
                          checked={tool.enabled}
                          onCheckedChange={() => toggleTool(tool.id)}
                        />
                        <div>
                          <p className="text-[13px] font-medium text-text-primary">{tool.name}</p>
                          <Badge variant="secondary" className="mt-0.5">{tool.source}</Badge>
                        </div>
                      </div>
                      {tool.enabled && (
                        <div className="flex items-center" style={{ gap: '10px' }}>
                          <span className="text-[12px] text-text-tertiary">Needs approval</span>
                          <Switch
                            checked={tool.requiresApproval}
                            onCheckedChange={() => toggleToolApproval(tool.id)}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'knowledge' && (
            <Card>
              <CardHeader>
                <CardTitle>Knowledge Base</CardTitle>
                <CardDescription>
                  Selected documents are sent with every message as additional context.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {knowledge.length > 0 ? (
                  <div className="flex flex-col" style={{ gap: '6px' }}>
                    {knowledge.map((doc) => {
                      const isSelected = selectedKnowledge.includes(doc.id)
                      return (
                        <button
                          key={doc.id}
                          onClick={() => {
                            setSelectedKnowledge(
                              isSelected
                                ? selectedKnowledge.filter(id => id !== doc.id)
                                : [...selectedKnowledge, doc.id]
                            )
                          }}
                          className={`flex items-center w-full rounded-xl text-left transition-all duration-300 cursor-pointer ${
                            isSelected
                              ? 'bg-flame-500/[0.05] border border-flame-500/15 shadow-[0_0_16px_-6px_rgba(249,115,22,0.1)]'
                              : 'hover:bg-white/[0.05] border border-transparent'
                          }`}
                          style={{ gap: '12px', padding: '14px' }}
                        >
                          <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all duration-300 ${
                            isSelected
                              ? 'bg-gradient-to-br from-flame-500 to-flame-600 border-flame-500 shadow-[0_0_8px_-2px_rgba(249,115,22,0.4)]'
                              : 'border-white/[0.12]'
                          }`}>
                            {isSelected && <span className="text-[11px] text-white">&#10003;</span>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-medium text-text-primary truncate">{doc.title}</p>
                            <p className="text-[12px] text-text-tertiary truncate">{doc.content.slice(0, 80)}...</p>
                          </div>
                          <div className="flex" style={{ gap: '6px' }}>
                            {doc.tags.slice(0, 2).map(tag => (
                              <Badge key={tag} variant="secondary">{tag}</Badge>
                            ))}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-center" style={{ paddingTop: '40px', paddingBottom: '40px' }}>
                    <p className="text-text-tertiary text-[13px]">No knowledge documents yet.</p>
                    <p className="text-text-tertiary text-[12px]" style={{ marginTop: '4px' }}>Go to Knowledge to create shared documents.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {activeTab === 'permissions' && (
            <ContactAccessEditor
              value={permissions.contactAccess}
              onChange={(contactAccess) => setPermissions({ ...permissions, contactAccess })}
              currentEmployeeId={employee?.id}
            />
          )}
        </div>
      </div>
    </div>
  )
}
