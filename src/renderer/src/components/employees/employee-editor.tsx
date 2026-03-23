import { useState, useEffect } from 'react'
import { ArrowLeft, Save, Sparkles, ArrowRight, Brain, Trash2, Plus, ChevronDown, ChevronRight } from 'lucide-react'
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
  { id: 'code-execute', name: 'Execute Code', source: 'builtin', enabled: false, requiresApproval: true }
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

// Employee templates for quick creation
interface EmployeeTemplate {
  id: string
  emoji: string
  label: string
  role: string
  systemPrompt: string
  enabledToolIds: string[]
}

const TEMPLATES: EmployeeTemplate[] = [
  {
    id: 'researcher',
    emoji: '🔍',
    label: 'Researcher',
    role: 'Senior Research Analyst',
    systemPrompt: 'You are a thorough research analyst. When given a topic, provide comprehensive, well-sourced analysis. Structure findings clearly with key insights, supporting evidence, and actionable recommendations. Always verify claims and note uncertainty levels.',
    enabledToolIds: ['web-search', 'web-browse']
  },
  {
    id: 'carousel-designer',
    emoji: '🎨',
    label: 'Carousel Designer',
    role: 'Instagram Carousel Designer',
    systemPrompt: `You are an Instagram carousel design system. When a user asks you to create a carousel, generate a fully self-contained, swipeable HTML carousel where every slide is designed to be exported as an individual image for Instagram posting.

## Step 1: Collect Brand Details

Before generating any carousel, ask the user for the following (if not already provided):

1. **Brand name** — displayed on the first and last slides
2. **Instagram handle** — shown in the IG frame header and caption
3. **Primary brand color** — the main accent color (hex code, or describe it)
4. **Logo** — ask if they have an SVG path, want to use their brand initial, or skip
5. **Font preference** — serif headings + sans body (editorial), all sans-serif (modern), or specific Google Fonts
6. **Tone** — professional, casual, playful, bold, minimal, etc.
7. **Images** — any images to include (profile photo, screenshots, product images)

If the user provides a website URL or brand assets, derive colors and style from those. If they just say "make me a carousel about X" without brand details, ask before generating.

## Step 2: Color System

From the user's single primary brand color, generate the full 6-token palette:

- BRAND_PRIMARY = user's color (main accent — progress bar, icons, tags)
- BRAND_LIGHT = primary lightened ~20% (secondary accent — tags on dark, pills)
- BRAND_DARK = primary darkened ~30% (CTA text, gradient anchor)
- LIGHT_BG = warm or cool off-white (light slide background, never pure #fff)
- LIGHT_BORDER = slightly darker than LIGHT_BG (dividers on light slides)
- DARK_BG = near-black with brand tint (dark slide background)

Brand gradient: linear-gradient(165deg, BRAND_DARK 0%, BRAND_PRIMARY 50%, BRAND_LIGHT 100%)

## Step 3: Typography

Pick a heading font and body font from Google Fonts. Font size scale: Headings 28–34px weight 600, Body 14px weight 400, Tags 10px weight 600 uppercase, Step numbers 26px weight 300, Small text 11–12px.

## Slide Architecture

- Aspect ratio: 4:5 (Instagram standard), 420×525px viewport
- Each slide is self-contained with baked-in UI elements
- Alternate LIGHT_BG and DARK_BG backgrounds for visual rhythm
- Progress bar at bottom of every slide showing position (fills up as user swipes)
- Swipe arrow on right edge of every slide EXCEPT the last

## Standard Slide Sequence (7 slides ideal, 5–10 flex)

1. Hero (LIGHT_BG) — Hook with bold statement, logo lockup
2. Problem (DARK_BG) — Pain point
3. Solution (Brand gradient) — The answer
4. Features (LIGHT_BG) — Feature list with icons
5. Details (DARK_BG) — Depth, differentiators
6. How-to (LIGHT_BG) — Numbered steps
7. CTA (Brand gradient) — Call to action, logo, tagline, CTA button. No arrow. Full progress bar.

## Instagram Frame Preview

Wrap carousel in IG-style frame: header with avatar + handle, 4:5 viewport with swipeable slides, dot indicators, action icons, caption. Frame must be exactly 420px wide.

## Exporting as PNGs

Export each slide as 1080×1350px PNG using Playwright. Keep 420px layout width, use device_scale_factor=2.5714 to scale up. Use Python for HTML generation (never shell scripts). Embed images as base64. Wait for fonts to load before screenshotting.

## Design Principles

- Every slide is export-ready (arrow + progress bar are part of the image)
- Light/dark alternation for visual rhythm
- Heading + body font pairing for impact + readability
- Brand-derived palette from one primary color
- Last slide is special — no arrow, full progress bar, clear CTA
- Iterate fast — show preview, get feedback, fix specific slides`,
    enabledToolIds: ['web-search', 'file-write', 'code-execute']
  },
  {
    id: 'developer',
    emoji: '💻',
    label: 'Developer',
    role: 'Full-Stack Developer',
    systemPrompt: 'You are a senior software developer. Write clean, well-structured code following best practices. Explain your technical decisions. Always consider security, performance, and maintainability. Ask clarifying questions before implementing.',
    enabledToolIds: ['file-read', 'file-write', 'code-execute']
  }
]

function applyTemplate(template: EmployeeTemplate): {
  avatar: string
  role: string
  systemPrompt: string
  tools: ToolAssignment[]
} {
  const tools = DEFAULT_TOOLS.map(t => ({
    ...t,
    enabled: template.enabledToolIds.includes(t.id)
  }))
  return {
    avatar: template.emoji,
    role: template.role,
    systemPrompt: template.systemPrompt,
    tools
  }
}

interface EmployeeEditorProps {
  employee?: Employee
  onClose: () => void
}

export function EmployeeEditor({ employee, onClose }: EmployeeEditorProps) {
  const { createEmployee, updateEmployee, knowledge, settings, departments, createDepartment, mcpServers, mcpToolNames, loadMcpServers } = useAppStore()
  const isEditing = !!employee

  // Template selection phase (only for new employees)
  const [templateSelected, setTemplateSelected] = useState(isEditing)

  const [name, setName] = useState(employee?.name || '')
  const [role, setRole] = useState(employee?.role || '')
  const [avatar, setAvatar] = useState(employee?.avatar || '🔥')
  const [systemPrompt, setSystemPrompt] = useState(employee?.systemPrompt || '')
  const [selectedKnowledge, setSelectedKnowledge] = useState<string[]>(employee?.knowledgeIds || [])
  const [tools, setTools] = useState<ToolAssignment[]>(employee?.tools || DEFAULT_TOOLS)
  const [provider, setProvider] = useState(employee?.provider || settings?.defaultProvider || 'openai')
  const initialModel = employee?.model || settings?.defaultModel || 'gpt-4o'
  const providerModels = settings?.providers.find(p => p.id === (employee?.provider || settings?.defaultProvider || 'openai'))?.models || []
  const validModel = providerModels.includes(initialModel) ? initialModel : (providerModels[0] || initialModel)
  const [model, setModel] = useState(validModel)
  const [permissions, setPermissions] = useState<PermissionSet>(employee?.permissions || DEFAULT_PERMISSIONS)
  const [departmentId, setDepartmentId] = useState<string | null>(employee?.departmentId ?? null)
  const [creatingDept, setCreatingDept] = useState(false)
  const [newDeptName, setNewDeptName] = useState('')
  const [memoryText, setMemoryText] = useState(employee?.memory || '')
  const [activeTab, setActiveTab] = useState<'basic' | 'tools' | 'knowledge' | 'permissions'>('basic')
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({})

  const enabledProviders = settings?.providers.filter(p => p.enabled || p.id === 'ollama') || []

  // Load MCP servers on mount
  useEffect(() => {
    loadMcpServers()
  }, [])

  const handleCreateDept = async () => {
    if (!newDeptName.trim()) return
    const dept = await createDepartment({ name: newDeptName.trim(), color: 'flame' })
    setDepartmentId(dept.id)
    setNewDeptName('')
    setCreatingDept(false)
  }

  // Handle selecting a template
  const handleSelectTemplate = (template: EmployeeTemplate) => {
    const preset = applyTemplate(template)
    setAvatar(preset.avatar)
    setRole(preset.role)
    setSystemPrompt(preset.systemPrompt)
    setTools(preset.tools)
    setTemplateSelected(true)
  }

  // Handle "start from scratch"
  const handleStartFromScratch = () => {
    setTemplateSelected(true)
  }

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
      memory: employee?.memory || '',
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

  // Template selection step (only when creating, not editing)
  if (!templateSelected) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="relative max-w-[720px] mx-auto" style={{ padding: '40px' }}>
          <div className="ambient-orb ambient-orb-1" style={{ top: '-80px', right: '-150px' }} />
          <div className="ambient-orb ambient-orb-2" style={{ bottom: '40px', left: '-100px' }} />

          {/* Header */}
          <div className="flex items-center" style={{ gap: '12px', marginBottom: '40px' }}>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h2 className="text-xl font-bold tracking-tight">
                <span className="gradient-text">Hire New Employee</span>
              </h2>
              <p className="text-[13px] text-text-tertiary mt-0.5">
                Choose a template to get started quickly, or start from scratch
              </p>
            </div>
          </div>

          {/* Template Cards */}
          <div className="flex flex-col" style={{ gap: '16px', marginBottom: '24px' }}>
            {TEMPLATES.map((template, i) => (
              <button
                key={template.id}
                className="group relative flex items-center rounded-2xl bg-bg-elevated border border-border-default overflow-hidden transition-all duration-500 cursor-pointer text-left hover:bg-bg-surface hover:border-flame-500/30"
                style={{
                  gap: '20px',
                  padding: '28px',
                  animationDelay: `${i * 80}ms`,
                  animation: 'scale-in 0.5s cubic-bezier(0.16, 1, 0.3, 1) both',
                }}
                onClick={() => handleSelectTemplate(template)}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-flame-500/[0.04] via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                <div className="relative flex items-center justify-center w-14 h-14 rounded-xl bg-gradient-to-br from-flame-500/20 to-flame-600/10 text-2xl shadow-[0_0_20px_-4px_rgba(249,115,22,0.15)]">
                  {template.emoji}
                </div>
                <div className="relative flex-1 min-w-0">
                  <h3 className="font-semibold text-text-primary text-[15px]">{template.label}</h3>
                  <p className="text-[13px] text-text-tertiary" style={{ marginTop: '4px' }}>{template.role}</p>
                  <p className="text-[12px] text-text-tertiary line-clamp-2 leading-relaxed" style={{ marginTop: '8px' }}>
                    {template.systemPrompt.slice(0, 120)}...
                  </p>
                  <div className="flex flex-wrap" style={{ gap: '6px', marginTop: '10px' }}>
                    {template.enabledToolIds.map(toolId => {
                      const tool = DEFAULT_TOOLS.find(t => t.id === toolId)
                      return tool ? (
                        <Badge key={toolId} variant="secondary">{tool.name}</Badge>
                      ) : null
                    })}
                  </div>
                </div>
                <ArrowRight className="relative w-4 h-4 text-text-tertiary opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-300" />
              </button>
            ))}
          </div>

          {/* Start from scratch */}
          <button
            className="group relative flex items-center justify-center w-full rounded-2xl border border-dashed border-border-default bg-bg-secondary hover:bg-bg-elevated hover:border-border-bright transition-all duration-500 cursor-pointer"
            style={{
              padding: '24px',
              animation: 'scale-in 0.5s cubic-bezier(0.16, 1, 0.3, 1) both',
              animationDelay: '240ms',
            }}
            onClick={handleStartFromScratch}
          >
            <div className="relative flex items-center" style={{ gap: '12px' }}>
              <Sparkles className="w-5 h-5 text-text-tertiary group-hover:text-flame-400 transition-colors duration-300" />
              <span className="text-[14px] font-medium text-text-secondary group-hover:text-text-primary transition-colors duration-300">
                Start from scratch
              </span>
            </div>
          </button>
        </div>
      </div>
    )
  }

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
                    <div className="flex items-center" style={{ gap: '8px' }}>
                      <select
                        value={departmentId || ''}
                        onChange={(e) => {
                          if (e.target.value === '__create__') {
                            setCreatingDept(true)
                          } else {
                            setDepartmentId(e.target.value || null)
                          }
                        }}
                        className="flex w-full rounded-xl border border-border-default bg-bg-tertiary text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-flame-500/25 cursor-pointer transition-all duration-300"
                        style={{ height: '44px', padding: '10px 16px', borderRadius: '12px' }}
                      >
                        <option value="">No department</option>
                        {departments.map((d) => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                        <option value="__create__">+ Create new...</option>
                      </select>
                    </div>
                    {creatingDept && (
                      <div className="flex items-center animate-fade-in" style={{ gap: '8px', marginTop: '8px' }}>
                        <input
                          value={newDeptName}
                          onChange={(e) => setNewDeptName(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleCreateDept()}
                          placeholder="Department name..."
                          autoFocus
                          className="flex-1 rounded-lg bg-bg-tertiary border border-border-default text-[13px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-flame-500/30"
                          style={{ padding: '8px 12px' }}
                        />
                        <button onClick={handleCreateDept} className="text-[13px] text-flame-400 font-medium cursor-pointer hover:text-flame-300">Create</button>
                        <button onClick={() => { setCreatingDept(false); setNewDeptName('') }} className="text-[13px] text-text-tertiary cursor-pointer hover:text-text-secondary">Cancel</button>
                      </div>
                    )}
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

              {/* Memory (editable, only shown when editing) */}
              {isEditing && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center" style={{ gap: '8px' }}>
                      <Brain className="w-4 h-4 text-flame-400 drop-shadow-[0_0_6px_rgba(249,115,22,0.4)]" />
                      Persistent Memory
                    </CardTitle>
                    <CardDescription>
                      Long-term memory that persists across conversations. Agents update this automatically, but you can edit it too.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col" style={{ gap: '12px' }}>
                      <Textarea
                        value={memoryText}
                        onChange={(e) => setMemoryText(e.target.value)}
                        rows={6}
                        placeholder="No memories yet. The agent will save important facts here during conversations, or you can add context manually."
                        className="font-mono text-[13px]"
                      />
                      <div className="flex justify-between">
                        {memoryText !== (employee?.memory || '') && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={async () => {
                              await updateEmployee(employee!.id, { memory: memoryText })
                            }}
                          >
                            <Save className="w-3.5 h-3.5" />
                            Save Memory
                          </Button>
                        )}
                        {memoryText && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              await updateEmployee(employee!.id, { memory: '' })
                              setMemoryText('')
                            }}
                            className="text-red-400 hover:text-red-300 hover:bg-red-500/10 ml-auto"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Clear
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {activeTab === 'tools' && (
            <div className="flex flex-col" style={{ gap: '16px' }}>
              <Card>
                <CardHeader>
                  <CardTitle>Available Tools</CardTitle>
                  <CardDescription>
                    Select which tools this employee can use. Toggle approval to require your confirmation before execution.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col" style={{ gap: '12px' }}>
                    {/* Built-in Tools Section */}
                    {(() => {
                      const builtinTools = tools.filter(t => t.source === 'builtin')
                      const enabledCount = builtinTools.filter(t => t.enabled).length
                      const isCollapsed = collapsedSections['builtin'] ?? false

                      return (
                        <div className="rounded-xl border border-border-default overflow-hidden">
                          {/* Section header */}
                          <button
                            onClick={() => setCollapsedSections(prev => ({ ...prev, builtin: !isCollapsed }))}
                            className="flex items-center justify-between w-full text-left bg-bg-tertiary hover:bg-bg-surface transition-colors cursor-pointer"
                            style={{ padding: '14px 16px' }}
                          >
                            <div className="flex items-center" style={{ gap: '10px' }}>
                              {isCollapsed
                                ? <ChevronRight className="w-4 h-4 text-text-tertiary" />
                                : <ChevronDown className="w-4 h-4 text-text-tertiary" />
                              }
                              <span className="text-[13px] font-semibold text-text-primary">Built-in</span>
                            </div>
                            <Badge variant="secondary">{enabledCount}/{builtinTools.length} enabled</Badge>
                          </button>

                          {/* Tool list */}
                          {!isCollapsed && (
                            <div className="flex flex-col" style={{ gap: '2px', padding: '4px' }}>
                              {builtinTools.map((tool) => (
                                <div
                                  key={tool.id}
                                  className={`flex items-center justify-between rounded-lg transition-all duration-300 ${
                                    tool.enabled
                                      ? 'bg-flame-500/[0.04]'
                                      : 'hover:bg-white/[0.03]'
                                  }`}
                                  style={{ padding: '10px 12px' }}
                                >
                                  <div className="flex items-center" style={{ gap: '10px' }}>
                                    <Switch
                                      checked={tool.enabled}
                                      onCheckedChange={() => toggleTool(tool.id)}
                                    />
                                    <p className="text-[13px] font-medium text-text-primary">{tool.name}</p>
                                  </div>
                                  {tool.enabled && (
                                    <div className="flex items-center" style={{ gap: '8px' }}>
                                      <span className="text-[11px] text-text-tertiary">Approval</span>
                                      <Switch
                                        checked={tool.requiresApproval}
                                        onCheckedChange={() => toggleToolApproval(tool.id)}
                                      />
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })()}

                    {/* MCP Server Tool Sections */}
                    {mcpServers.filter(s => s.enabled).map((server) => {
                      const serverToolNames = mcpToolNames[server.id] || []
                      if (serverToolNames.length === 0) return null

                      const isCollapsed = collapsedSections[server.id] ?? true

                      // Build tool assignments for this MCP server's tools
                      const mcpToolAssignments = serverToolNames.map(toolName => {
                        const assignmentId = `mcp_${server.id}_${toolName}`
                        const existing = tools.find(t => t.id === assignmentId)
                        return existing || {
                          id: assignmentId,
                          name: toolName,
                          source: 'mcp' as const,
                          mcpServerId: server.id,
                          enabled: false,
                          requiresApproval: false
                        }
                      })

                      const enabledCount = mcpToolAssignments.filter(t => t.enabled).length

                      const toggleMcpTool = (toolId: string) => {
                        const existing = tools.find(t => t.id === toolId)
                        if (existing) {
                          setTools(tools.map(t => t.id === toolId ? { ...t, enabled: !t.enabled } : t))
                        } else {
                          // Add new MCP tool assignment
                          const toolName = toolId.replace(`mcp_${server.id}_`, '')
                          setTools([...tools, {
                            id: toolId,
                            name: toolName,
                            source: 'mcp',
                            mcpServerId: server.id,
                            enabled: true,
                            requiresApproval: false
                          }])
                        }
                      }

                      const toggleMcpToolApproval = (toolId: string) => {
                        const existing = tools.find(t => t.id === toolId)
                        if (existing) {
                          setTools(tools.map(t => t.id === toolId ? { ...t, requiresApproval: !t.requiresApproval } : t))
                        }
                      }

                      return (
                        <div key={server.id} className="rounded-xl border border-border-default overflow-hidden">
                          {/* Section header */}
                          <button
                            onClick={() => setCollapsedSections(prev => ({ ...prev, [server.id]: !isCollapsed }))}
                            className="flex items-center justify-between w-full text-left bg-bg-tertiary hover:bg-bg-surface transition-colors cursor-pointer"
                            style={{ padding: '14px 16px' }}
                          >
                            <div className="flex items-center" style={{ gap: '10px' }}>
                              {isCollapsed
                                ? <ChevronRight className="w-4 h-4 text-text-tertiary" />
                                : <ChevronDown className="w-4 h-4 text-text-tertiary" />
                              }
                              <span className="text-[13px] font-semibold text-text-primary">MCP: {server.name}</span>
                            </div>
                            <Badge variant="secondary">{enabledCount}/{mcpToolAssignments.length} enabled</Badge>
                          </button>

                          {/* Tool list */}
                          {!isCollapsed && (
                            <div className="flex flex-col" style={{ gap: '2px', padding: '4px' }}>
                              {mcpToolAssignments.map((tool) => (
                                <div
                                  key={tool.id}
                                  className={`flex items-center justify-between rounded-lg transition-all duration-300 ${
                                    tool.enabled
                                      ? 'bg-flame-500/[0.04]'
                                      : 'hover:bg-white/[0.03]'
                                  }`}
                                  style={{ padding: '10px 12px' }}
                                >
                                  <div className="flex items-center" style={{ gap: '10px' }}>
                                    <Switch
                                      checked={tool.enabled}
                                      onCheckedChange={() => toggleMcpTool(tool.id)}
                                    />
                                    <p className="text-[13px] font-medium text-text-primary font-mono">{tool.name}</p>
                                  </div>
                                  {tool.enabled && (
                                    <div className="flex items-center" style={{ gap: '8px' }}>
                                      <span className="text-[11px] text-text-tertiary">Approval</span>
                                      <Switch
                                        checked={tool.requiresApproval}
                                        onCheckedChange={() => toggleMcpToolApproval(tool.id)}
                                      />
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}

                    {/* No MCP servers message */}
                    {mcpServers.filter(s => s.enabled).length === 0 && (
                      <div className="rounded-xl border border-dashed border-border-default bg-bg-secondary text-center" style={{ padding: '24px' }}>
                        <p className="text-[12px] text-text-tertiary">
                          No MCP servers configured. Add servers in Settings to unlock external tools.
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
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
