import { useState } from 'react'
import { ArrowLeft, Save, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { useAppStore, type Employee, type ToolAssignment, type PermissionSet } from '@/stores/app-store'

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

const DEFAULT_PERMISSIONS: PermissionSet = {
  canBrowseWeb: false,
  canReadFiles: false,
  canWriteFiles: false,
  canExecuteCode: false,
  canContactEmployees: false,
  autoApproveAll: false
}

interface EmployeeEditorProps {
  employee?: Employee
  onClose: () => void
}

export function EmployeeEditor({ employee, onClose }: EmployeeEditorProps) {
  const { createEmployee, updateEmployee, knowledge, settings } = useAppStore()
  const isEditing = !!employee

  const [name, setName] = useState(employee?.name || '')
  const [role, setRole] = useState(employee?.role || '')
  const [avatar, setAvatar] = useState(employee?.avatar || '🔥')
  const [systemPrompt, setSystemPrompt] = useState(employee?.systemPrompt || '')
  const [selectedKnowledge, setSelectedKnowledge] = useState<string[]>(employee?.knowledgeIds || [])
  const [tools, setTools] = useState<ToolAssignment[]>(employee?.tools || DEFAULT_TOOLS)
  const [provider, setProvider] = useState(employee?.provider || settings?.defaultProvider || 'openai')
  const [model, setModel] = useState(employee?.model || settings?.defaultModel || 'gpt-4o')
  const [permissions, setPermissions] = useState<PermissionSet>(employee?.permissions || DEFAULT_PERMISSIONS)
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
      permissions
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
    { id: 'permissions' as const, label: 'Permissions' }
  ]

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={onClose}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h2 className="text-xl font-bold text-text-primary">
                {isEditing ? `Edit ${employee.name}` : 'Hire New Employee'}
              </h2>
              <p className="text-sm text-text-tertiary">
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
        <div className="flex gap-1 p-1 bg-bg-secondary rounded-lg border border-border-subtle mb-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-all cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-bg-surface text-text-primary shadow-sm'
                  : 'text-text-tertiary hover:text-text-secondary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="animate-fade-in">
          {activeTab === 'basic' && (
            <div className="space-y-6">
              {/* Avatar Selection */}
              <Card>
                <CardHeader>
                  <CardTitle>Avatar</CardTitle>
                  <CardDescription>Pick an icon for this employee</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {AVATARS.map((a) => (
                      <button
                        key={a}
                        onClick={() => setAvatar(a)}
                        className={`flex items-center justify-center w-11 h-11 rounded-xl text-xl transition-all cursor-pointer ${
                          avatar === a
                            ? 'bg-flame-500/15 border-2 border-flame-500 scale-110'
                            : 'bg-bg-surface border border-border-subtle hover:border-border-bright'
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
                <CardContent className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1.5">Name</label>
                    <Input
                      placeholder="e.g. Atlas, Spark, Oracle..."
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1.5">Role</label>
                    <Input
                      placeholder="e.g. Research Analyst, Code Reviewer, Writer..."
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* System Prompt */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    System Instructions
                    <Sparkles className="w-4 h-4 text-flame-400" />
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
                    className="font-mono text-sm"
                  />
                </CardContent>
              </Card>

              {/* Provider & Model */}
              <Card>
                <CardHeader>
                  <CardTitle>AI Provider</CardTitle>
                  <CardDescription>Choose which LLM powers this employee</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1.5">Provider</label>
                    <select
                      value={provider}
                      onChange={(e) => {
                        setProvider(e.target.value)
                        const prov = settings?.providers.find(p => p.id === e.target.value)
                        if (prov?.models[0]) setModel(prov.models[0])
                      }}
                      className="flex h-10 w-full rounded-lg border border-border-subtle bg-bg-secondary px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-flame-500/30 focus:border-flame-500/50 cursor-pointer"
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
                    <label className="block text-sm font-medium text-text-secondary mb-1.5">Model</label>
                    <select
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      className="flex h-10 w-full rounded-lg border border-border-subtle bg-bg-secondary px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-flame-500/30 focus:border-flame-500/50 cursor-pointer"
                    >
                      {(settings?.providers.find(p => p.id === provider)?.models || []).map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
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
                <div className="space-y-1">
                  {tools.map((tool) => (
                    <div
                      key={tool.id}
                      className={`flex items-center justify-between p-3 rounded-lg transition-all ${
                        tool.enabled ? 'bg-flame-500/5 border border-flame-500/15' : 'hover:bg-bg-surface'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Switch
                          checked={tool.enabled}
                          onCheckedChange={() => toggleTool(tool.id)}
                        />
                        <div>
                          <p className="text-sm font-medium text-text-primary">{tool.name}</p>
                          <Badge variant="secondary" className="mt-0.5">{tool.source}</Badge>
                        </div>
                      </div>
                      {tool.enabled && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-text-tertiary">Needs approval</span>
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
                  Select documents this employee has access to. These provide context and expertise.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {knowledge.length > 0 ? (
                  <div className="space-y-2">
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
                          className={`flex items-center gap-3 w-full p-3 rounded-lg text-left transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-flame-500/8 border border-flame-500/20'
                              : 'hover:bg-bg-surface border border-transparent'
                          }`}
                        >
                          <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                            isSelected ? 'bg-flame-600 border-flame-600' : 'border-border-default'
                          }`}>
                            {isSelected && <span className="text-xs text-white">✓</span>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-text-primary truncate">{doc.title}</p>
                            <p className="text-xs text-text-tertiary truncate">{doc.content.slice(0, 80)}...</p>
                          </div>
                          <div className="flex gap-1">
                            {doc.tags.slice(0, 2).map(tag => (
                              <Badge key={tag} variant="secondary">{tag}</Badge>
                            ))}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-text-tertiary text-sm">No knowledge documents yet.</p>
                    <p className="text-text-tertiary text-xs mt-1">Go to Knowledge to create shared documents.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {activeTab === 'permissions' && (
            <Card>
              <CardHeader>
                <CardTitle>Permissions</CardTitle>
                <CardDescription>
                  Control what this employee is allowed to do autonomously.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {([
                    { key: 'canBrowseWeb' as const, label: 'Browse the web', desc: 'Search and visit websites' },
                    { key: 'canReadFiles' as const, label: 'Read files', desc: 'Access local file system for reading' },
                    { key: 'canWriteFiles' as const, label: 'Write files', desc: 'Create and modify local files' },
                    { key: 'canExecuteCode' as const, label: 'Execute code', desc: 'Run code in a sandboxed environment' },
                    { key: 'canContactEmployees' as const, label: 'Contact other employees', desc: 'Send tasks and messages to other team members' },
                    { key: 'autoApproveAll' as const, label: 'Auto-approve all actions', desc: 'Skip confirmation for all tool uses (use with caution)' }
                  ]).map(({ key, label, desc }) => (
                    <div key={key} className="flex items-center justify-between py-2">
                      <div>
                        <p className="text-sm font-medium text-text-primary">{label}</p>
                        <p className="text-xs text-text-tertiary">{desc}</p>
                      </div>
                      <Switch
                        checked={permissions[key]}
                        onCheckedChange={(checked) =>
                          setPermissions({ ...permissions, [key]: checked })
                        }
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
