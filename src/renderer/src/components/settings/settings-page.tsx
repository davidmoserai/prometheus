import { useState, useEffect } from 'react'
import { Key, Save, Eye, EyeOff, Check, AlertCircle, LogIn, LogOut, Globe, Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { useAppStore, type ProviderConfig, type AuthMethod } from '@/stores/app-store'

const PROVIDER_INFO: Record<string, { description: string; signupUrl: string; color: string; icon: string }> = {
  openai: {
    description: 'GPT-4o, o1, and more. Best for general tasks.',
    signupUrl: 'https://platform.openai.com/api-keys',
    color: 'text-emerald-400',
    icon: 'O'
  },
  anthropic: {
    description: 'Claude Opus, Sonnet, Haiku. Strong reasoning.',
    signupUrl: 'https://console.anthropic.com/',
    color: 'text-orange-400',
    icon: 'A'
  },
  google: {
    description: 'Gemini 2.5 Pro & Flash. Great multimodal.',
    signupUrl: 'https://aistudio.google.com/apikey',
    color: 'text-blue-400',
    icon: 'G'
  },
  mistral: {
    description: 'Fast European models. Good value.',
    signupUrl: 'https://console.mistral.ai/',
    color: 'text-purple-400',
    icon: 'M'
  },
  ollama: {
    description: 'Run models locally for free. Requires Ollama installed.',
    signupUrl: 'https://ollama.ai',
    color: 'text-sky-400',
    icon: 'L'
  }
}

export function SettingsPage() {
  const { settings, updateSettings, loadSettings } = useAppStore()
  const [providers, setProviders] = useState<ProviderConfig[]>(settings?.providers || [])
  const [defaultProvider, setDefaultProvider] = useState(settings?.defaultProvider || 'openai')
  const [defaultModel, setDefaultModel] = useState(settings?.defaultModel || 'gpt-4o')
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})
  const [saved, setSaved] = useState(false)
  const [oauthLoading, setOauthLoading] = useState<string | null>(null)

  useEffect(() => {
    if (settings) {
      setProviders(settings.providers)
      setDefaultProvider(settings.defaultProvider)
      setDefaultModel(settings.defaultModel)
    }
  }, [settings])

  // Listen for OAuth callbacks
  useEffect(() => {
    if (!window.api?.oauth?.onCallback) return
    const unsub = window.api.oauth.onCallback(async (data) => {
      try {
        await window.api.oauth.exchange(data.providerId, data.code)
        await loadSettings()
        setOauthLoading(null)
      } catch (err) {
        console.error('OAuth exchange failed:', err)
        setOauthLoading(null)
      }
    })
    return unsub
  }, [loadSettings])

  const handleSave = async () => {
    await updateSettings({ providers, defaultProvider, defaultModel })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const updateProvider = (id: string, updates: Partial<ProviderConfig>) => {
    setProviders(providers.map((p) => (p.id === id ? { ...p, ...updates } : p)))
  }

  const handleOAuthConnect = async (providerId: string) => {
    const provider = providers.find(p => p.id === providerId)
    if (!provider?.oauthClientId) {
      alert('Please enter your OAuth Client ID first, then click Connect.')
      return
    }
    // Save the client ID first
    await updateSettings({ providers })
    setOauthLoading(providerId)
    try {
      await window.api.oauth.start(providerId)
    } catch (err) {
      console.error('OAuth start failed:', err)
      setOauthLoading(null)
    }
  }

  const handleOAuthDisconnect = async (providerId: string) => {
    await window.api.oauth.disconnect(providerId)
    await loadSettings()
  }

  const getConnectionStatus = (provider: ProviderConfig): { label: string; variant: 'success' | 'warning' | 'secondary' } => {
    if (provider.authMethod === 'oauth' && provider.oauth?.accessToken) {
      return { label: 'OAuth Connected', variant: 'success' }
    }
    if (provider.authMethod === 'api_key' && provider.apiKey) {
      return { label: 'API Key Set', variant: 'success' }
    }
    if (provider.id === 'ollama') {
      return { label: 'Local', variant: 'secondary' }
    }
    return { label: 'Not configured', variant: 'warning' }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-text-primary">Settings</h2>
            <p className="text-text-tertiary mt-1">Configure API providers and defaults</p>
          </div>
          <Button onClick={handleSave}>
            {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saved ? 'Saved!' : 'Save Settings'}
          </Button>
        </div>

        {/* Info Banner */}
        <div className="flex items-start gap-3 p-4 rounded-xl bg-flame-500/5 border border-flame-500/15 mb-6">
          <AlertCircle className="w-5 h-5 text-flame-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-text-primary font-medium">Connect Your Way</p>
            <p className="text-xs text-text-tertiary mt-0.5">
              Each provider can be connected via <strong>API key</strong> (pay-per-token) or <strong>OAuth</strong> (use your existing subscription).
              Your credentials are stored locally and never leave your device.
              For free usage, enable Ollama and run models locally.
            </p>
          </div>
        </div>

        {/* Defaults */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Default Configuration</CardTitle>
            <CardDescription>Default provider and model for new employees</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Default Provider</label>
              <select
                value={defaultProvider}
                onChange={(e) => {
                  setDefaultProvider(e.target.value)
                  const prov = providers.find((p) => p.id === e.target.value)
                  if (prov?.models[0]) setDefaultModel(prov.models[0])
                }}
                className="flex h-10 w-full rounded-lg border border-border-subtle bg-bg-secondary px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-flame-500/30 cursor-pointer"
              >
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Default Model</label>
              <select
                value={defaultModel}
                onChange={(e) => setDefaultModel(e.target.value)}
                className="flex h-10 w-full rounded-lg border border-border-subtle bg-bg-secondary px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-flame-500/30 cursor-pointer"
              >
                {(providers.find((p) => p.id === defaultProvider)?.models || []).map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </CardContent>
        </Card>

        {/* Provider Cards */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-text-primary">Providers</h3>
          {providers.map((provider) => {
            const info = PROVIDER_INFO[provider.id]
            const status = getConnectionStatus(provider)
            const isOllama = provider.id === 'ollama'
            const supportsOAuth = provider.oauthSupported

            return (
              <Card
                key={provider.id}
                className={`transition-all ${
                  provider.enabled ? 'border-flame-500/20' : ''
                }`}
              >
                <CardContent>
                  {/* Provider Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`flex items-center justify-center w-10 h-10 rounded-xl bg-bg-surface font-bold text-sm ${info?.color || 'text-text-tertiary'}`}>
                        {info?.icon || '?'}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold text-text-primary">{provider.name}</h4>
                          {provider.enabled && (
                            <Badge variant={status.variant}>{status.label}</Badge>
                          )}
                        </div>
                        <p className="text-xs text-text-tertiary mt-0.5">{info?.description}</p>
                      </div>
                    </div>
                    <Switch
                      checked={provider.enabled}
                      onCheckedChange={(checked) => updateProvider(provider.id, { enabled: checked })}
                    />
                  </div>

                  {/* Expanded Config */}
                  {provider.enabled && (
                    <div className="space-y-4 animate-fade-in">

                      {/* Auth Method Picker (only for providers that support both) */}
                      {!isOllama && (
                        <div>
                          <label className="block text-xs font-medium text-text-secondary mb-2">Authentication Method</label>
                          <div className="flex gap-2">
                            <AuthMethodButton
                              active={provider.authMethod === 'api_key'}
                              onClick={() => updateProvider(provider.id, { authMethod: 'api_key' as AuthMethod })}
                              icon={<Key className="w-3.5 h-3.5" />}
                              label="API Key"
                              description="Pay per token"
                            />
                            {supportsOAuth && (
                              <AuthMethodButton
                                active={provider.authMethod === 'oauth'}
                                onClick={() => updateProvider(provider.id, { authMethod: 'oauth' as AuthMethod })}
                                icon={<Globe className="w-3.5 h-3.5" />}
                                label="OAuth"
                                description="Use subscription"
                              />
                            )}
                          </div>
                        </div>
                      )}

                      {/* API Key Auth Section */}
                      {!isOllama && provider.authMethod === 'api_key' && (
                        <div className="p-4 rounded-lg bg-bg-primary border border-border-subtle">
                          <div className="flex items-center gap-2 mb-3">
                            <Key className="w-4 h-4 text-flame-400" />
                            <span className="text-sm font-medium text-text-primary">API Key</span>
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
                            <p className="text-xs text-text-tertiary mt-2">
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

                      {/* OAuth Auth Section */}
                      {!isOllama && provider.authMethod === 'oauth' && (
                        <div className="p-4 rounded-lg bg-bg-primary border border-border-subtle">
                          <div className="flex items-center gap-2 mb-3">
                            <Shield className="w-4 h-4 text-flame-400" />
                            <span className="text-sm font-medium text-text-primary">OAuth Connection</span>
                          </div>

                          {provider.oauth?.accessToken ? (
                            // Connected state
                            <div className="space-y-3">
                              <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/15">
                                <div className="w-2 h-2 rounded-full bg-emerald-500 glow-pulse" />
                                <div className="flex-1">
                                  <p className="text-sm font-medium text-emerald-400">Connected via OAuth</p>
                                  <p className="text-xs text-text-tertiary">
                                    Using your {provider.name} subscription
                                    {provider.oauth.expiresAt && (
                                      <> &middot; Expires {new Date(provider.oauth.expiresAt).toLocaleDateString()}</>
                                    )}
                                  </p>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleOAuthDisconnect(provider.id)}
                                  className="text-ember-400 hover:text-ember-300"
                                >
                                  <LogOut className="w-3.5 h-3.5" />
                                  Disconnect
                                </Button>
                              </div>
                            </div>
                          ) : (
                            // Not connected state
                            <div className="space-y-3">
                              <div>
                                <label className="block text-xs font-medium text-text-secondary mb-1">
                                  OAuth Client ID
                                </label>
                                <Input
                                  placeholder={`Your ${provider.name} OAuth Client ID`}
                                  value={provider.oauthClientId || ''}
                                  onChange={(e) => updateProvider(provider.id, { oauthClientId: e.target.value })}
                                />
                                <p className="text-xs text-text-tertiary mt-1">
                                  Create an OAuth app in your {provider.name} developer console to get a Client ID
                                </p>
                              </div>
                              <Button
                                onClick={() => handleOAuthConnect(provider.id)}
                                disabled={!provider.oauthClientId || oauthLoading === provider.id}
                                className="w-full"
                              >
                                <LogIn className="w-4 h-4" />
                                {oauthLoading === provider.id
                                  ? 'Waiting for authorization...'
                                  : `Sign in with ${provider.name}`
                                }
                              </Button>
                              <div className="flex items-start gap-2 mt-2">
                                <AlertCircle className="w-3.5 h-3.5 text-text-tertiary shrink-0 mt-0.5" />
                                <p className="text-xs text-text-tertiary">
                                  OAuth lets you use your existing {provider.name} subscription.
                                  Note that some providers may restrict third-party OAuth usage — if it doesn&apos;t work,
                                  use an API key instead.
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Ollama Config */}
                      {isOllama && (
                        <div className="p-4 rounded-lg bg-bg-primary border border-border-subtle">
                          <label className="block text-xs font-medium text-text-secondary mb-1">Base URL</label>
                          <Input
                            placeholder="http://localhost:11434"
                            value={provider.baseUrl || ''}
                            onChange={(e) => updateProvider(provider.id, { baseUrl: e.target.value })}
                          />
                          <p className="text-xs text-text-tertiary mt-1.5">
                            Install Ollama from{' '}
                            <a href="https://ollama.ai" className="text-flame-400 hover:underline" target="_blank" rel="noopener noreferrer">
                              ollama.ai
                            </a>{' '}
                            to run models locally for free. No API key or subscription needed.
                          </p>
                        </div>
                      )}

                      {/* Models */}
                      <div>
                        <label className="block text-xs font-medium text-text-secondary mb-1.5">Available Models</label>
                        <div className="flex flex-wrap gap-1.5">
                          {provider.models.map((model) => (
                            <Badge key={model} variant="secondary">{model}</Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function AuthMethodButton({
  active,
  onClick,
  icon,
  label,
  description
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  description: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer ${
        active
          ? 'bg-flame-500/8 border-flame-500/30 text-text-primary'
          : 'bg-bg-primary border-border-subtle text-text-tertiary hover:text-text-secondary hover:border-border-default'
      }`}
    >
      <div className={`flex items-center justify-center w-8 h-8 rounded-lg ${
        active ? 'bg-flame-500/15 text-flame-400' : 'bg-bg-surface'
      }`}>
        {icon}
      </div>
      <div className="text-left">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-text-tertiary">{description}</p>
      </div>
      {active && (
        <div className="ml-auto w-2 h-2 rounded-full bg-flame-500" />
      )}
    </button>
  )
}
