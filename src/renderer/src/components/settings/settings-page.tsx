import { useState, useEffect } from 'react'
import { Key, Save, Eye, EyeOff, Check, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { useAppStore, type ProviderConfig } from '@/stores/app-store'

const PROVIDER_INFO: Record<string, { description: string; signupUrl: string; color: string }> = {
  openai: {
    description: 'GPT-4o, o1, and more. Best for general tasks.',
    signupUrl: 'https://platform.openai.com/api-keys',
    color: 'text-emerald-400'
  },
  anthropic: {
    description: 'Claude Opus, Sonnet, Haiku. Strong reasoning.',
    signupUrl: 'https://console.anthropic.com/',
    color: 'text-orange-400'
  },
  google: {
    description: 'Gemini 2.5 Pro & Flash. Great multimodal.',
    signupUrl: 'https://aistudio.google.com/apikey',
    color: 'text-blue-400'
  },
  mistral: {
    description: 'Fast European models. Good value.',
    signupUrl: 'https://console.mistral.ai/',
    color: 'text-purple-400'
  },
  ollama: {
    description: 'Run models locally for free. Requires Ollama installed.',
    signupUrl: 'https://ollama.ai',
    color: 'text-sky-400'
  }
}

export function SettingsPage() {
  const { settings, updateSettings } = useAppStore()
  const [providers, setProviders] = useState<ProviderConfig[]>(settings?.providers || [])
  const [defaultProvider, setDefaultProvider] = useState(settings?.defaultProvider || 'openai')
  const [defaultModel, setDefaultModel] = useState(settings?.defaultModel || 'gpt-4o')
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (settings) {
      setProviders(settings.providers)
      setDefaultProvider(settings.defaultProvider)
      setDefaultModel(settings.defaultModel)
    }
  }, [settings])

  const handleSave = async () => {
    await updateSettings({ providers, defaultProvider, defaultModel })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const updateProvider = (id: string, updates: Partial<ProviderConfig>) => {
    setProviders(providers.map((p) => (p.id === id ? { ...p, ...updates } : p)))
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
            <p className="text-sm text-text-primary font-medium">API Keys Required</p>
            <p className="text-xs text-text-tertiary mt-0.5">
              Each provider requires its own API key. Your keys are stored locally on your device and never sent to our servers.
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
          <h3 className="text-lg font-semibold text-text-primary">API Providers</h3>
          {providers.map((provider) => {
            const info = PROVIDER_INFO[provider.id]
            return (
              <Card
                key={provider.id}
                className={`transition-all ${
                  provider.enabled ? 'border-flame-500/20' : ''
                }`}
              >
                <CardContent>
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-bg-surface">
                        <Key className={`w-5 h-5 ${info?.color || 'text-text-tertiary'}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold text-text-primary">{provider.name}</h4>
                          {provider.enabled && provider.apiKey && (
                            <Badge variant="success">Connected</Badge>
                          )}
                          {provider.enabled && !provider.apiKey && provider.id !== 'ollama' && (
                            <Badge variant="warning">No key</Badge>
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

                  {provider.enabled && (
                    <div className="space-y-3 animate-fade-in">
                      {provider.id !== 'ollama' ? (
                        <div>
                          <label className="block text-xs font-medium text-text-secondary mb-1">API Key</label>
                          <div className="flex gap-2">
                            <div className="relative flex-1">
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
                          </div>
                          {info?.signupUrl && (
                            <p className="text-xs text-text-tertiary mt-1.5">
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
                      ) : (
                        <div>
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
                            to run models locally for free
                          </p>
                        </div>
                      )}

                      <div>
                        <label className="block text-xs font-medium text-text-secondary mb-1">Available Models</label>
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
