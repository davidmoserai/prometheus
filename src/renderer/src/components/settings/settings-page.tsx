import { useState, useEffect, useCallback } from 'react'
import { Key, Save, Eye, EyeOff, Check, AlertCircle, Plus, Trash2, Server, Loader2, Wrench, Terminal, LogIn, CheckCircle2, ExternalLink, Puzzle } from 'lucide-react'
import { IntegrationsSection } from './integrations-section'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { useAppStore, type ProviderConfig, type MCPServerConfig } from '@/stores/app-store'

const PROVIDER_INFO: Record<string, { description: string; signupUrl: string; color: string; icon: string; glowColor: string }> = {
  'vercel-ai-gateway': {
    description: 'One API key, all models. Claude, GPT, Gemini, Grok & more.',
    signupUrl: 'https://vercel.com/docs/ai-gateway',
    color: 'text-white',
    icon: '▲',
    glowColor: 'rgba(255, 255, 255, 0.15)'
  },
  openai: {
    description: 'GPT-4o, o1, and more. Best for general tasks.',
    signupUrl: 'https://platform.openai.com/api-keys',
    color: 'text-emerald-400',
    icon: 'O',
    glowColor: 'rgba(16, 185, 129, 0.15)'
  },
  anthropic: {
    description: 'Claude Opus, Sonnet, Haiku. Strong reasoning.',
    signupUrl: 'https://console.anthropic.com/',
    color: 'text-orange-400',
    icon: 'A',
    glowColor: 'rgba(251, 146, 60, 0.15)'
  },
  google: {
    description: 'Gemini 2.5 Pro & Flash. Great multimodal.',
    signupUrl: 'https://aistudio.google.com/apikey',
    color: 'text-blue-400',
    icon: 'G',
    glowColor: 'rgba(96, 165, 250, 0.15)'
  },
  mistral: {
    description: 'Fast European models. Good value.',
    signupUrl: 'https://console.mistral.ai/',
    color: 'text-purple-400',
    icon: 'M',
    glowColor: 'rgba(192, 132, 252, 0.15)'
  },
  'ollama-cloud': {
    description: 'DeepSeek 671B, Qwen 480B & more via subscription. $20-100/mo.',
    signupUrl: 'https://ollama.com',
    color: 'text-teal-400',
    icon: 'O+',
    glowColor: 'rgba(45, 212, 191, 0.15)'
  },
  ollama: {
    description: 'Run models locally for free. Requires Ollama installed.',
    signupUrl: 'https://ollama.ai',
    color: 'text-sky-400',
    icon: 'L',
    glowColor: 'rgba(56, 189, 248, 0.15)'
  },
  'claude-code': {
    description: 'Use your Claude Code subscription. No API key needed.',
    signupUrl: 'https://claude.ai',
    color: 'text-amber-400',
    icon: 'CC',
    glowColor: 'rgba(251, 191, 36, 0.15)'
  }
}

export function SettingsPage() {
  const { settings, updateSettings, mcpServers, mcpToolNames, loadMcpServers, addMcpServer, removeMcpServer, updateMcpServer, testMcpConnection } = useAppStore()
  const [providers, setProviders] = useState<ProviderConfig[]>(settings?.providers || [])
  const [defaultProvider, setDefaultProvider] = useState(settings?.defaultProvider || 'openai')
  const [defaultModel, setDefaultModel] = useState(settings?.defaultModel || 'gpt-4o')
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})
  const [saved, setSaved] = useState(false)

  // Claude Code auth state
  const [ccInstalled, setCcInstalled] = useState<boolean | null>(null)
  const [ccAuth, setCcAuth] = useState<{ authenticated: boolean; loginMethod?: string; email?: string; error?: string } | null>(null)
  const [ccLoggingIn, setCcLoggingIn] = useState(false)

  const checkClaudeCode = useCallback(async () => {
    try {
      const installed = await window.api.claudeCode.isInstalled()
      setCcInstalled(installed)
      if (installed) {
        const status = await window.api.claudeCode.authStatus()
        setCcAuth(status)
      }
    } catch {
      setCcInstalled(false)
    }
  }, [])

  useEffect(() => {
    checkClaudeCode()
  }, [checkClaudeCode])

  const handleClaudeCodeLogin = async () => {
    setCcLoggingIn(true)
    try {
      const status = await window.api.claudeCode.login()
      setCcAuth(status)
    } catch {
      setCcAuth({ authenticated: false, error: 'Login failed' })
    }
    setCcLoggingIn(false)
  }

  // MCP form state
  const [showMcpForm, setShowMcpForm] = useState(false)
  const [mcpFormMode, setMcpFormMode] = useState<'json' | 'manual'>('json')
  const [mcpName, setMcpName] = useState('')
  const [mcpCommand, setMcpCommand] = useState('')
  const [mcpArgs, setMcpArgs] = useState('')
  const [mcpEnv, setMcpEnv] = useState('')
  const [mcpGithubUrl, setMcpGithubUrl] = useState('')
  const [mcpJsonInput, setMcpJsonInput] = useState('')
  const [mcpParsedConfig, setMcpParsedConfig] = useState<{ name: string; command: string; args: string[]; env?: Record<string, string> } | null>(null)
  const [mcpParseError, setMcpParseError] = useState<string | null>(null)
  const [mcpConnecting, setMcpConnecting] = useState(false)
  const [mcpError, setMcpError] = useState<string | null>(null)
  const [mcpDiscoveredTools, setMcpDiscoveredTools] = useState<string[] | null>(null)
  const [showEnvValues, setShowEnvValues] = useState<Record<string, boolean>>({})

  // Native integrations state
  const [nativeIntegrations, setNativeIntegrations] = useState<Array<{ id: string; name: string; description: string; icon: string; enabled: boolean }>>([])
  const [nativeToggling, setNativeToggling] = useState<string | null>(null)

  // Load native integrations on mount
  useEffect(() => {
    window.api?.native?.list().then(setNativeIntegrations).catch(() => {})
  }, [])

  const handleNativeToggle = async (id: string, enabled: boolean) => {
    setNativeToggling(id)
    try {
      const result = await window.api.native.toggle(id, enabled)
      if (result.success) {
        setNativeIntegrations(prev => prev.map(n => n.id === id ? { ...n, enabled } : n))
        // Reload MCP tool names so employee editor picks up new tools
        await loadMcpServers()
      }
    } catch {}
    setNativeToggling(null)
  }

  useEffect(() => {
    if (settings) {
      setProviders(settings.providers)
      setDefaultProvider(settings.defaultProvider)
      setDefaultModel(settings.defaultModel)
    }
  }, [settings])

  // Load MCP servers on mount
  useEffect(() => {
    loadMcpServers()
  }, [])

  const handleSave = async () => {
    await updateSettings({ providers, defaultProvider, defaultModel })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const updateProvider = (id: string, updates: Partial<ProviderConfig>) => {
    setProviders(providers.map((p) => (p.id === id ? { ...p, ...updates } : p)))
  }

  // Parse Claude Desktop / single-server JSON config into a normalized config object
  const parseClaudeDesktopConfig = (input: string): { name: string; command: string; args: string[]; env?: Record<string, string> } | null => {
    try {
      const parsed = JSON.parse(input)

      // Format 1: Claude Desktop format — { "mcpServers": { "name": { "command": ... } } }
      if (parsed.mcpServers && typeof parsed.mcpServers === 'object') {
        const entries = Object.entries(parsed.mcpServers)
        if (entries.length === 0) return null
        const [name, serverConfig] = entries[0] as [string, { command?: string; args?: string[]; env?: Record<string, string> }]
        if (!serverConfig?.command) return null
        return { name, command: serverConfig.command, args: serverConfig.args || [], env: serverConfig.env }
      }

      // Format 2: Single server object — { "command": "npx", "args": [...] }
      if (parsed.command && typeof parsed.command === 'string') {
        // Try to derive a name from args (the package name)
        const args = parsed.args || []
        const pkgName = args.find((a: string) => !a.startsWith('-')) || 'mcp-server'
        const name = pkgName.replace(/^@[^/]+\//, '').replace(/^server-/, '')
        return { name, command: parsed.command, args, env: parsed.env }
      }

      // Format 3: Named wrapper — { "name": { "command": "npx", "args": [...] } }
      const entries = Object.entries(parsed)
      if (entries.length === 1) {
        const [name, serverConfig] = entries[0] as [string, { command?: string; args?: string[]; env?: Record<string, string> }]
        if (serverConfig?.command && typeof serverConfig.command === 'string') {
          return { name, command: serverConfig.command, args: serverConfig.args || [], env: serverConfig.env }
        }
      }

      return null
    } catch {
      return null
    }
  }

  // Auto-parse JSON input on change
  const handleJsonInputChange = (value: string) => {
    setMcpJsonInput(value)
    setMcpParseError(null)
    setMcpParsedConfig(null)
    setMcpDiscoveredTools(null)
    setMcpError(null)

    if (!value.trim()) return

    const config = parseClaudeDesktopConfig(value)
    if (config) {
      setMcpParsedConfig(config)
      setMcpName(config.name)
    } else {
      setMcpParseError('Could not parse config. Supported formats: Claude Desktop JSON, single server object, or named wrapper.')
    }
  }

  // Test-first flow: test connection, show tools, then save
  const handleTestAndAddMcpServer = async () => {
    setMcpConnecting(true)
    setMcpError(null)
    setMcpDiscoveredTools(null)

    let configName: string
    let configCommand: string
    let configArgs: string[]
    let configEnv: Record<string, string> | undefined
    let configGithubUrl: string | undefined

    if (mcpFormMode === 'json' && mcpParsedConfig) {
      configName = mcpName.trim() || mcpParsedConfig.name
      configCommand = mcpParsedConfig.command
      configArgs = mcpParsedConfig.args
      configEnv = mcpParsedConfig.env && Object.keys(mcpParsedConfig.env).length > 0 ? mcpParsedConfig.env : undefined
      configGithubUrl = undefined
    } else {
      if (!mcpName.trim() || !mcpCommand.trim()) { setMcpConnecting(false); return }
      configName = mcpName.trim()
      configCommand = mcpCommand.trim()
      configArgs = mcpArgs.split(',').map(a => a.trim()).filter(Boolean)
      const env: Record<string, string> = {}
      if (mcpEnv.trim()) {
        for (const line of mcpEnv.split('\n')) {
          const eqIdx = line.indexOf('=')
          if (eqIdx > 0) {
            env[line.slice(0, eqIdx).trim()] = line.slice(eqIdx + 1).trim()
          }
        }
      }
      configEnv = Object.keys(env).length > 0 ? env : undefined
      configGithubUrl = mcpGithubUrl.trim() || undefined
    }

    // Generate unique ID (append suffix if duplicate exists)
    let baseId = configName.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    let id = baseId
    const existingIds = new Set(mcpServers.filter(s => !s.isComposio && !s.isNative).map(s => s.id))
    let suffix = 2
    while (existingIds.has(id)) {
      id = `${baseId}-${suffix++}`
    }

    const config: MCPServerConfig = {
      id,
      name: configName,
      command: configCommand,
      args: configArgs,
      env: configEnv,
      githubUrl: configGithubUrl,
      enabled: true
    }

    // Test connection first — don't save broken configs
    const testResult = await testMcpConnection(config)
    if (!testResult.success) {
      setMcpConnecting(false)
      setMcpError(testResult.error || 'Connection test failed')
      return
    }

    setMcpDiscoveredTools(testResult.tools || [])

    // Test passed — now save
    const result = await addMcpServer(config)
    setMcpConnecting(false)

    if (result.success) {
      resetMcpForm()
    } else {
      setMcpError(result.error || 'Failed to save server')
    }
  }

  const resetMcpForm = () => {
    setShowMcpForm(false)
    setMcpFormMode('json')
    setMcpName('')
    setMcpCommand('')
    setMcpArgs('')
    setMcpEnv('')
    setMcpGithubUrl('')
    setMcpJsonInput('')
    setMcpParsedConfig(null)
    setMcpParseError(null)
    setMcpError(null)
    setMcpDiscoveredTools(null)
  }

  const handleRemoveMcpServer = async (id: string) => {
    await removeMcpServer(id)
  }

  const handleToggleMcpServer = async (id: string, enabled: boolean) => {
    await updateMcpServer(id, { enabled })
  }

  const getConnectionStatus = (provider: ProviderConfig): { label: string; variant: 'success' | 'warning' | 'secondary' } => {
    if (provider.id === 'claude-code') {
      if (ccAuth?.authenticated) return { label: 'Connected', variant: 'success' }
      if (ccInstalled === false) return { label: 'CLI not found', variant: 'warning' }
      return { label: 'Not logged in', variant: 'warning' }
    }
    if (provider.apiKey) {
      return { label: 'API Key Set', variant: 'success' }
    }
    if (provider.id === 'ollama') {
      return { label: 'Local', variant: 'secondary' }
    }
    return { label: 'Not configured', variant: 'warning' }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="relative max-w-[720px] mx-auto" style={{ padding: '48px', paddingBottom: '120px' }}>
        {/* Ambient orbs */}
        <div className="ambient-orb ambient-orb-1" style={{ top: '-60px', right: '-100px' }} />
        <div className="ambient-orb ambient-orb-3" style={{ bottom: '100px', left: '-80px' }} />

        {/* Header */}
        <div className="flex items-center justify-between" style={{ marginBottom: '40px' }}>
          <div>
            <h2 className="text-[28px] font-bold tracking-tight">
              <span className="gradient-text">Settings</span>
            </h2>
            <p className="text-text-tertiary text-[15px]" style={{ marginTop: '8px' }}>Configure API providers and defaults</p>
          </div>
          <Button onClick={handleSave}>
            {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saved ? 'Saved!' : 'Save Settings'}
          </Button>
        </div>

        {/* Info Banner */}
        <div className="flex items-start rounded-2xl bg-flame-500/[0.06] border border-flame-500/15 shadow-[0_0_24px_-8px_rgba(249,115,22,0.08)]" style={{ gap: '12px', padding: '20px', marginBottom: '40px' }}>
          <AlertCircle className="w-4 h-4 text-flame-400 shrink-0 mt-0.5 drop-shadow-[0_0_6px_rgba(249,115,22,0.4)]" />
          <div>
            <p className="text-[13px] text-text-primary font-medium">API Key Authentication</p>
            <p className="text-[12px] text-text-tertiary mt-0.5 leading-relaxed">
              Each provider requires an <strong className="text-text-secondary">API key</strong> to connect.
              Your credentials are stored locally and never leave your device.
            </p>
          </div>
        </div>

        {/* Defaults */}
        <Card style={{ marginBottom: '40px' }}>
          <CardHeader>
            <CardTitle>Default Configuration</CardTitle>
            <CardDescription>Default provider and model for new employees</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col" style={{ gap: '16px' }}>
            <div>
              <label className="block text-[13px] font-medium text-text-secondary" style={{ marginBottom: '8px' }}>Default Provider</label>
              <select
                value={defaultProvider}
                onChange={(e) => {
                  setDefaultProvider(e.target.value)
                  const prov = providers.find((p) => p.id === e.target.value)
                  if (prov?.models[0]) setDefaultModel(prov.models[0])
                }}
                className="flex w-full rounded-xl border border-border-default bg-bg-tertiary text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-flame-500/25 cursor-pointer transition-all duration-300"
                style={{ height: '44px', padding: '10px 16px', borderRadius: '12px' }}
              >
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[13px] font-medium text-text-secondary" style={{ marginBottom: '8px' }}>Default Model</label>
              <select
                value={defaultModel}
                onChange={(e) => setDefaultModel(e.target.value)}
                className="flex w-full rounded-xl border border-border-default bg-bg-tertiary text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-flame-500/25 cursor-pointer transition-all duration-300"
                style={{ height: '44px', padding: '10px 16px', borderRadius: '12px' }}
              >
                {(providers.find((p) => p.id === defaultProvider)?.models || []).map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            </div>
          </CardContent>
        </Card>

        {/* Provider Cards */}
        <div className="flex flex-col" style={{ gap: '12px' }}>
          <h3 className="text-[16px] font-semibold text-text-primary tracking-tight" style={{ marginBottom: '20px' }}>Providers</h3>
          {providers.map((provider, i) => {
            const info = PROVIDER_INFO[provider.id]
            const status = getConnectionStatus(provider)
            const isLocalOllama = provider.id === 'ollama'
            const isOllamaCloud = provider.id === 'ollama-cloud'
            const isClaudeCode = provider.id === 'claude-code'

            return (
              <div
                key={provider.id}
                className={`relative rounded-2xl border transition-all duration-500 overflow-hidden card-hover-glow ${
                  provider.enabled
                    ? 'bg-bg-elevated border-border-default'
                    : 'bg-bg-secondary border-border-subtle'
                }`}
                style={{
                  padding: '28px',
                  animationDelay: `${i * 60}ms`,
                  animation: 'scale-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) both',
                }}
              >
                {/* Gradient highlight when enabled */}
                {provider.enabled && (
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/[0.02] via-transparent to-transparent pointer-events-none" />
                )}

                {/* Provider Header */}
                <div className="relative flex items-start justify-between">
                  <div className="flex items-center" style={{ gap: '14px' }}>
                    <div
                      className={`flex items-center justify-center w-10 h-10 rounded-xl bg-white/[0.07] font-bold text-[13px] ${info?.color || 'text-text-tertiary'} transition-all duration-300`}
                      style={provider.enabled ? { boxShadow: `0 0 16px -4px ${info?.glowColor || 'transparent'}` } : undefined}
                    >
                      {info?.icon || '?'}
                    </div>
                    <div>
                      <div className="flex items-center" style={{ gap: '10px' }}>
                        <h4 className="font-semibold text-text-primary text-[14px]">{provider.name}</h4>
                        {provider.enabled && (
                          <Badge variant={status.variant}>{status.label}</Badge>
                        )}
                      </div>
                      <p className="text-[12px] text-text-tertiary mt-0.5">{info?.description}</p>
                    </div>
                  </div>
                  <Switch
                    checked={provider.enabled}
                    onCheckedChange={(checked) => updateProvider(provider.id, { enabled: checked })}
                  />
                </div>

                {/* Expanded Config */}
                {provider.enabled && (
                  <div className="relative flex flex-col border-t border-white/[0.08] animate-fade-in" style={{ gap: '16px', marginTop: '20px', paddingTop: '20px' }}>

                    {/* Claude Code Auth Section */}
                    {isClaudeCode && (
                      <div className="rounded-xl bg-bg-tertiary border border-border-subtle" style={{ padding: '20px' }}>
                        <div className="flex items-center" style={{ gap: '8px', marginBottom: '12px' }}>
                          <Terminal className="w-4 h-4 text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.4)]" />
                          <span className="text-[13px] font-medium text-text-primary">Claude Code CLI</span>
                        </div>

                        {ccInstalled === false && (
                          <div>
                            <p className="text-[13px] text-red-300" style={{ marginBottom: '8px' }}>
                              Claude Code CLI not found. Install it first:
                            </p>
                            <code className="block text-[12px] font-mono text-text-secondary bg-bg-primary rounded-lg" style={{ padding: '10px 14px' }}>
                              npm install -g @anthropic-ai/claude-code
                            </code>
                          </div>
                        )}

                        {ccInstalled && !ccAuth?.authenticated && (
                          <div>
                            <p className="text-[13px] text-text-secondary" style={{ marginBottom: '12px' }}>
                              Log in to your Claude account to use your subscription.
                            </p>
                            <Button size="sm" onClick={handleClaudeCodeLogin} disabled={ccLoggingIn}>
                              {ccLoggingIn ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogIn className="w-3.5 h-3.5" />}
                              {ccLoggingIn ? 'Opening browser...' : 'Connect Claude Account'}
                            </Button>
                          </div>
                        )}

                        {ccInstalled && ccAuth?.authenticated && (
                          <div className="flex items-center" style={{ gap: '10px' }}>
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            <div>
                              <p className="text-[13px] text-text-primary">{ccAuth.email}</p>
                              <p className="text-[11px] text-text-tertiary">{ccAuth.loginMethod}</p>
                            </div>
                          </div>
                        )}

                        <p className="text-[11px] text-text-tertiary" style={{ marginTop: '12px' }}>
                          Uses your existing Claude subscription — no API key or extra charges. Agents run as Claude Code subprocesses with full tool access.
                        </p>
                      </div>
                    )}

                    {/* API Key Section */}
                    {!isLocalOllama && !isClaudeCode && (
                      <div className="rounded-xl bg-bg-tertiary border border-border-subtle" style={{ padding: '20px' }}>
                        <div className="flex items-center" style={{ gap: '8px', marginBottom: '12px' }}>
                          <Key className="w-4 h-4 text-flame-400 drop-shadow-[0_0_6px_rgba(249,115,22,0.4)]" />
                          <span className="text-[13px] font-medium text-text-primary">API Key</span>
                        </div>
                        <div className="relative">
                          <Input
                            type={showKeys[provider.id] ? 'text' : 'password'}
                            placeholder={`Enter your ${provider.name} API key`}
                            value={provider.apiKey}
                            onChange={(e) => updateProvider(provider.id, { apiKey: e.target.value })}
                          />
                          <button
                            onClick={() => setShowKeys({ ...showKeys, [provider.id]: !showKeys[provider.id] })}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary transition-colors cursor-pointer"
                          >
                            {showKeys[provider.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                        {info?.signupUrl && (
                          <p className="text-[11px] text-text-tertiary" style={{ marginTop: '10px' }}>
                            Get your key at{' '}
                            <a
                              href={info.signupUrl}
                              className="text-flame-400 hover:underline"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {info.signupUrl.replace('https://', '')}
                            </a>
                          </p>
                        )}
                      </div>
                    )}

                    {/* Ollama Local Config */}
                    {isLocalOllama && (
                      <div className="rounded-xl bg-bg-tertiary border border-border-subtle" style={{ padding: '20px' }}>
                        <label className="block text-[12px] font-medium text-text-secondary" style={{ marginBottom: '6px' }}>Base URL</label>
                        <Input
                          placeholder="http://localhost:11434"
                          value={provider.baseUrl || ''}
                          onChange={(e) => updateProvider(provider.id, { baseUrl: e.target.value })}
                        />
                        <p className="text-[11px] text-text-tertiary" style={{ marginTop: '8px' }}>
                          Install Ollama from{' '}
                          <a href="https://ollama.ai" className="text-flame-400 hover:underline" target="_blank" rel="noopener noreferrer">
                            ollama.ai
                          </a>{' '}
                          to run models locally for free. No API key needed.
                        </p>
                      </div>
                    )}

                    {/* Ollama Cloud Info */}
                    {isOllamaCloud && (
                      <p className="text-[11px] text-text-tertiary">
                        Create an API key at{' '}
                        <a href="https://ollama.com" className="text-flame-400 hover:underline" target="_blank" rel="noopener noreferrer">
                          ollama.com
                        </a>
                        {' '}(Account Settings). Subscription: Free / $20 Pro / $100 Max.
                      </p>
                    )}

                    {/* Models */}
                    <div>
                      <label className="block text-[12px] font-medium text-text-tertiary uppercase tracking-wider" style={{ marginBottom: '8px' }}>Available Models</label>
                      <div className="flex flex-wrap" style={{ gap: '6px' }}>
                        {provider.models.map((model) => (
                          <Badge key={model} variant="secondary">{model}</Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
        {/* Integrations Section */}
        <div style={{ marginTop: '56px', marginBottom: '56px' }}>
          <div className="flex items-center" style={{ gap: '10px', marginBottom: '32px' }}>
            <Puzzle className="w-4 h-4 text-flame-400 drop-shadow-[0_0_6px_rgba(249,115,22,0.4)]" />
            <h3 className="text-[16px] font-semibold text-text-primary tracking-tight">Integrations</h3>
          </div>
          <IntegrationsSection />
        </div>

        {/* Native Integrations Section */}
        {nativeIntegrations.length > 0 && (
          <div style={{ marginBottom: '56px' }}>
            <div className="flex items-center" style={{ gap: '10px', marginBottom: '20px' }}>
              <Wrench className="w-4 h-4 text-flame-400 drop-shadow-[0_0_6px_rgba(249,115,22,0.4)]" />
              <div>
                <h3 className="text-[16px] font-semibold text-text-primary tracking-tight">Built-in Tools</h3>
                <p className="text-xs text-text-tertiary" style={{ marginTop: '2px' }}>Toggle pre-built integrations on or off</p>
              </div>
            </div>
            <div className="flex flex-col" style={{ gap: '10px' }}>
              {nativeIntegrations.map((integration) => (
                <div
                  key={integration.id}
                  className={`flex items-center justify-between rounded-2xl border transition-all duration-300 bg-bg-secondary ${
                    integration.enabled
                      ? 'border-border-default'
                      : 'border-border-subtle opacity-60'
                  }`}
                  style={{ padding: '20px 24px' }}
                >
                  <div className="flex items-center" style={{ gap: '16px' }}>
                    <span className="text-xl">{integration.icon}</span>
                    <div>
                      <h4 className="font-semibold text-text-primary text-[14px]">{integration.name}</h4>
                      <p className="text-[12px] text-text-tertiary" style={{ marginTop: '2px' }}>{integration.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center" style={{ gap: '8px' }}>
                    {nativeToggling === integration.id && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-text-tertiary" />
                    )}
                    <Switch
                      checked={integration.enabled}
                      onCheckedChange={(checked) => handleNativeToggle(integration.id, checked)}
                      disabled={nativeToggling === integration.id}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Custom Integrations (Advanced) Section */}
        <div className="flex flex-col" style={{ gap: '12px', marginTop: '0' }}>
          <div className="flex items-center justify-between" style={{ marginBottom: '20px' }}>
            <div className="flex items-center" style={{ gap: '10px' }}>
              <Server className="w-4 h-4 text-flame-400 drop-shadow-[0_0_6px_rgba(249,115,22,0.4)]" />
              <div>
                <h3 className="text-[16px] font-semibold text-text-primary tracking-tight">Custom Integrations</h3>
                <p className="text-xs text-text-tertiary" style={{ marginTop: '2px' }}>Advanced: add your own MCP servers</p>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => setShowMcpForm(!showMcpForm)}>
              <Plus className="w-3.5 h-3.5" />
              Add Server
            </Button>
          </div>

          <p className="text-[12px] text-text-tertiary" style={{ marginTop: '-12px', marginBottom: '8px' }}>
            Connect to Model Context Protocol servers to give employees access to external tools like GitHub, Slack, databases, and more.
          </p>

          {/* Add MCP Server Form */}
          {showMcpForm && (
            <Card style={{ marginBottom: '12px' }}>
              <CardHeader>
                <CardTitle>New MCP Server</CardTitle>
                <CardDescription>Paste a JSON config from any MCP server README, or configure manually</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col" style={{ gap: '16px' }}>
                  {/* Mode tabs */}
                  <div className="flex rounded-xl border border-border-default overflow-hidden" style={{ height: '36px' }}>
                    <button
                      onClick={() => setMcpFormMode('json')}
                      className={`flex-1 text-[13px] font-medium transition-colors cursor-pointer ${
                        mcpFormMode === 'json'
                          ? 'bg-bg-elevated text-text-primary'
                          : 'bg-bg-tertiary text-text-tertiary hover:text-text-secondary'
                      }`}
                    >
                      Paste JSON
                    </button>
                    <button
                      onClick={() => setMcpFormMode('manual')}
                      className={`flex-1 text-[13px] font-medium transition-colors border-l border-border-default cursor-pointer ${
                        mcpFormMode === 'manual'
                          ? 'bg-bg-elevated text-text-primary'
                          : 'bg-bg-tertiary text-text-tertiary hover:text-text-secondary'
                      }`}
                    >
                      Manual
                    </button>
                  </div>

                  {/* JSON mode */}
                  {mcpFormMode === 'json' && (
                    <>
                      <div>
                        <label className="block text-[13px] font-medium text-text-secondary" style={{ marginBottom: '8px' }}>Server Config (JSON)</label>
                        <textarea
                          placeholder={'{\n  "mcpServers": {\n    "server-name": {\n      "command": "npx",\n      "args": ["-y", "@modelcontextprotocol/server-github"],\n      "env": { "GITHUB_TOKEN": "ghp_..." }\n    }\n  }\n}'}
                          value={mcpJsonInput}
                          onChange={(e) => handleJsonInputChange(e.target.value)}
                          rows={8}
                          className="flex w-full rounded-xl border border-border-default bg-bg-tertiary text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-flame-500/25 font-mono"
                          style={{ padding: '10px 16px', borderRadius: '12px', resize: 'vertical' }}
                        />
                      </div>

                      {mcpParseError && (
                        <div className="flex items-center rounded-xl bg-red-500/[0.06] border border-red-500/15" style={{ gap: '8px', padding: '12px 16px' }}>
                          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                          <p className="text-[12px] text-red-300">{mcpParseError}</p>
                        </div>
                      )}

                      {/* Parsed config preview */}
                      {mcpParsedConfig && (
                        <div className="rounded-xl border border-border-default bg-bg-tertiary" style={{ padding: '16px' }}>
                          <div className="flex items-center" style={{ gap: '8px', marginBottom: '12px' }}>
                            <Check className="w-4 h-4 text-emerald-400" />
                            <span className="text-[13px] font-medium text-emerald-300">Config parsed successfully</span>
                          </div>
                          <div className="flex flex-col" style={{ gap: '10px' }}>
                            <div>
                              <label className="block text-[12px] font-medium text-text-tertiary" style={{ marginBottom: '4px' }}>Name (editable)</label>
                              <Input
                                value={mcpName}
                                onChange={(e) => setMcpName(e.target.value)}
                                placeholder="Server name"
                              />
                            </div>
                            <div>
                              <label className="block text-[12px] font-medium text-text-tertiary" style={{ marginBottom: '4px' }}>Command</label>
                              <p className="text-[13px] text-text-secondary font-mono">{mcpParsedConfig.command} {mcpParsedConfig.args.join(' ')}</p>
                            </div>
                            {mcpParsedConfig.env && Object.keys(mcpParsedConfig.env).length > 0 && (
                              <div>
                                <label className="block text-[12px] font-medium text-text-tertiary" style={{ marginBottom: '4px' }}>Environment Variables</label>
                                <div className="flex flex-wrap" style={{ gap: '6px' }}>
                                  {Object.keys(mcpParsedConfig.env).map(key => (
                                    <Badge key={key} variant="secondary">{key}</Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* Manual mode */}
                  {mcpFormMode === 'manual' && (
                    <>
                      <div>
                        <label className="block text-[13px] font-medium text-text-secondary" style={{ marginBottom: '8px' }}>Name</label>
                        <Input
                          placeholder="e.g. GitHub, Slack, Filesystem..."
                          value={mcpName}
                          onChange={(e) => setMcpName(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-[13px] font-medium text-text-secondary" style={{ marginBottom: '8px' }}>Command</label>
                        <Input
                          placeholder="e.g. npx"
                          value={mcpCommand}
                          onChange={(e) => setMcpCommand(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-[13px] font-medium text-text-secondary" style={{ marginBottom: '8px' }}>Arguments (comma-separated)</label>
                        <Input
                          placeholder="e.g. -y, @modelcontextprotocol/server-github"
                          value={mcpArgs}
                          onChange={(e) => setMcpArgs(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-[13px] font-medium text-text-secondary" style={{ marginBottom: '8px' }}>Environment Variables (one per line, KEY=VALUE)</label>
                        <textarea
                          placeholder={'GITHUB_TOKEN=ghp_...\nANOTHER_VAR=value'}
                          value={mcpEnv}
                          onChange={(e) => setMcpEnv(e.target.value)}
                          rows={3}
                          className="flex w-full rounded-xl border border-border-default bg-bg-tertiary text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-flame-500/25 font-mono"
                          style={{ padding: '10px 16px', borderRadius: '12px', resize: 'vertical' }}
                        />
                      </div>
                      <div>
                        <label className="block text-[13px] font-medium text-text-secondary" style={{ marginBottom: '8px' }}>GitHub Repository (optional)</label>
                        <Input
                          placeholder="e.g. https://github.com/user/repo"
                          value={mcpGithubUrl}
                          onChange={(e) => setMcpGithubUrl(e.target.value)}
                        />
                      </div>
                    </>
                  )}

                  {/* Discovered tools (shown after successful test) */}
                  {mcpDiscoveredTools && mcpDiscoveredTools.length > 0 && (
                    <div className="flex items-start rounded-xl bg-emerald-500/[0.06] border border-emerald-500/15" style={{ gap: '8px', padding: '12px 16px' }}>
                      <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[12px] text-emerald-300 font-medium">Connection successful — {mcpDiscoveredTools.length} tool{mcpDiscoveredTools.length !== 1 ? 's' : ''} discovered</p>
                        <div className="flex flex-wrap" style={{ gap: '4px', marginTop: '6px' }}>
                          {mcpDiscoveredTools.slice(0, 10).map(name => (
                            <Badge key={name} variant="secondary">{name}</Badge>
                          ))}
                          {mcpDiscoveredTools.length > 10 && (
                            <Badge variant="secondary">+{mcpDiscoveredTools.length - 10} more</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {mcpError && (
                    <div className="flex items-center rounded-xl bg-red-500/[0.06] border border-red-500/15" style={{ gap: '8px', padding: '12px 16px' }}>
                      <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                      <p className="text-[12px] text-red-300">{mcpError}</p>
                    </div>
                  )}

                  <div className="flex justify-end" style={{ gap: '8px' }}>
                    <Button variant="ghost" size="sm" onClick={resetMcpForm}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleTestAndAddMcpServer}
                      disabled={
                        mcpConnecting ||
                        (mcpFormMode === 'json' ? !mcpParsedConfig : (!mcpName.trim() || !mcpCommand.trim()))
                      }
                    >
                      {mcpConnecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Server className="w-3.5 h-3.5" />}
                      {mcpConnecting ? 'Testing...' : 'Test & Add'}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* MCP Server List (exclude Composio — shown in Integrations section above) */}
          {mcpServers.filter(s => !s.isComposio && !s.isNative).length === 0 && !showMcpForm && (
            <div className="rounded-2xl border border-dashed border-border-default bg-bg-secondary text-center" style={{ padding: '40px' }}>
              <Server className="w-8 h-8 text-text-tertiary mx-auto" style={{ marginBottom: '12px' }} />
              <p className="text-[13px] text-text-tertiary">No MCP servers configured.</p>
              <p className="text-[12px] text-text-tertiary" style={{ marginTop: '4px' }}>Add a server to unlock external tool integrations for your employees.</p>
            </div>
          )}

          {mcpServers.filter(s => !s.isComposio && !s.isNative).map((server, i) => {
            const toolNames = mcpToolNames[server.id] || []
            const isConnected = server.enabled && toolNames.length > 0

            return (
              <div
                key={server.id}
                className={`relative rounded-2xl border transition-all duration-500 overflow-hidden ${
                  server.enabled
                    ? 'bg-bg-elevated border-border-default'
                    : 'bg-bg-secondary border-border-subtle'
                }`}
                style={{
                  padding: '28px',
                  animationDelay: `${i * 60}ms`,
                  animation: 'scale-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) both',
                }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center" style={{ gap: '14px' }}>
                    <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-white/[0.07] text-flame-400 transition-all duration-300">
                      <Wrench className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center" style={{ gap: '10px' }}>
                        <h4 className="font-semibold text-text-primary text-[14px]">{server.name}</h4>
                        {server.enabled && (
                          <Badge variant={isConnected ? 'success' : 'warning'}>
                            {isConnected ? `${toolNames.length} tools` : 'Connecting...'}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center mt-0.5" style={{ gap: '8px' }}>
                        <p className="text-[12px] text-text-tertiary font-mono">
                          {server.command} {server.args.join(' ')}
                        </p>
                        {server.githubUrl && (
                          <a
                            href={server.githubUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-text-tertiary hover:text-flame-400 transition-colors"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center" style={{ gap: '8px' }}>
                    <Switch
                      checked={server.enabled}
                      onCheckedChange={(checked) => handleToggleMcpServer(server.id, checked)}
                    />
                    {!server.isDefault && (
                      <button
                        onClick={() => handleRemoveMcpServer(server.id)}
                        className="text-text-tertiary hover:text-red-400 transition-colors cursor-pointer"
                        style={{ padding: '4px' }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Show discovered tools */}
                {server.enabled && toolNames.length > 0 && (
                  <div className="border-t border-white/[0.08] animate-fade-in" style={{ marginTop: '16px', paddingTop: '16px' }}>
                    <label className="block text-[12px] font-medium text-text-tertiary uppercase tracking-wider" style={{ marginBottom: '8px' }}>Discovered Tools</label>
                    <div className="flex flex-wrap" style={{ gap: '6px' }}>
                      {toolNames.map((name) => (
                        <Badge key={name} variant="secondary">{name}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Show env vars (masked) */}
                {server.env && Object.keys(server.env).length > 0 && server.enabled && (
                  <div className="border-t border-white/[0.08]" style={{ marginTop: '16px', paddingTop: '16px' }}>
                    <label className="block text-[12px] font-medium text-text-tertiary uppercase tracking-wider" style={{ marginBottom: '8px' }}>Environment Variables</label>
                    <div className="flex flex-col" style={{ gap: '4px' }}>
                      {Object.entries(server.env).map(([key, value]) => (
                        <div key={key} className="flex items-center text-[12px] font-mono" style={{ gap: '8px' }}>
                          <span className="text-text-secondary">{key}</span>
                          <span className="text-text-tertiary">=</span>
                          <span className="text-text-tertiary">
                            {showEnvValues[`${server.id}_${key}`] ? value : '****'}
                          </span>
                          <button
                            onClick={() => setShowEnvValues(prev => ({
                              ...prev,
                              [`${server.id}_${key}`]: !prev[`${server.id}_${key}`]
                            }))}
                            className="text-text-tertiary hover:text-text-primary transition-colors cursor-pointer"
                          >
                            {showEnvValues[`${server.id}_${key}`] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
