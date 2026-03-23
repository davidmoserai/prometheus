import React, { useState, useEffect, useCallback } from 'react'
import { CheckCircle, Circle, Loader2, ExternalLink, Key } from 'lucide-react'
import { useAppStore } from '../../stores/app-store'
import type { IntegrationDefinition } from '../../../../main/integration-catalog'

export function IntegrationsSection(): React.JSX.Element {
  const {
    composioApiKeySet,
    composioConnectedApps,
    loadComposioStatus,
    setComposioApiKey,
    connectIntegration,
    waitForIntegrationConnection,
    disconnectIntegration
  } = useAppStore()

  const [catalog, setCatalog] = useState<IntegrationDefinition[]>([])
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [savingKey, setSavingKey] = useState(false)
  const [keyError, setKeyError] = useState('')
  const [connectingApp, setConnectingApp] = useState<string | null>(null)
  const [waitingApp, setWaitingApp] = useState<string | null>(null)

  // Load catalog and connection status on mount
  useEffect(() => {
    const load = async (): Promise<void> => {
      if (window.api?.composio) {
        const items = await window.api.composio.getCatalog()
        setCatalog(items || [])
      }
      await loadComposioStatus()
    }
    load()
  }, [loadComposioStatus])

  const handleSaveApiKey = useCallback(async (): Promise<void> => {
    if (!apiKeyInput.trim()) return
    setSavingKey(true)
    setKeyError('')
    try {
      await setComposioApiKey(apiKeyInput.trim())
      setApiKeyInput('')
    } catch {
      setKeyError('Invalid API key — please check and try again')
    } finally {
      setSavingKey(false)
    }
  }, [apiKeyInput, setComposioApiKey])

  const handleConnect = useCallback(async (appId: string): Promise<void> => {
    setConnectingApp(appId)
    try {
      const result = await connectIntegration(appId)
      if (result.success) {
        setWaitingApp(appId)
        setConnectingApp(null)
        // Poll for connection completion
        const connected = await waitForIntegrationConnection(appId)
        if (!connected) {
          console.error(`Connection to ${appId} timed out or failed`)
        }
        setWaitingApp(null)
      }
    } finally {
      setConnectingApp(null)
    }
  }, [connectIntegration, waitForIntegrationConnection])

  const handleDisconnect = useCallback(async (appId: string): Promise<void> => {
    setConnectingApp(appId)
    try {
      await disconnectIntegration(appId)
    } finally {
      setConnectingApp(null)
    }
  }, [disconnectIntegration])

  // Group catalog by category
  const categories = catalog.reduce<Record<string, IntegrationDefinition[]>>((acc, item) => {
    if (!acc[item.category]) acc[item.category] = []
    acc[item.category].push(item)
    return acc
  }, {})

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <h2 className="text-xl font-semibold text-text-primary" style={{ marginBottom: '6px' }}>
          Integrations
        </h2>
        <p className="text-sm text-text-tertiary">
          Connect your apps so your AI agents can take actions on your behalf.
        </p>
      </div>

      {/* Composio API Key Setup */}
      {!composioApiKeySet ? (
        <div className="rounded-2xl border border-flame-500/20 bg-flame-500/[0.04]" style={{ padding: '24px', marginBottom: '32px' }}>
          <div className="flex items-center" style={{ gap: '10px', marginBottom: '12px' }}>
            <Key size={16} className="text-flame-400" />
            <p className="text-sm font-medium text-text-primary">Connect your Composio account</p>
          </div>
          <p className="text-sm text-text-tertiary" style={{ marginBottom: '16px' }}>
            Integrations are powered by Composio, which securely stores your OAuth tokens so you never have to log in again.{' '}
            <a
              href="https://composio.dev"
              target="_blank"
              rel="noreferrer"
              className="text-flame-400 hover:text-flame-300 inline-flex items-center transition-colors"
              style={{ gap: '4px' }}
            >
              Get a free API key <ExternalLink size={12} />
            </a>
          </p>
          <div className="flex items-center" style={{ gap: '12px' }}>
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveApiKey()}
              placeholder="sk-comp-..."
              className="flex-1 rounded-xl border border-border-default bg-bg-tertiary text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-flame-500/25"
              style={{ height: '40px', padding: '0 14px', borderRadius: '10px' }}
            />
            <button
              onClick={handleSaveApiKey}
              disabled={!apiKeyInput.trim() || savingKey}
              className="flex items-center rounded-xl bg-flame-500 text-white text-sm font-medium hover:bg-flame-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              style={{ height: '40px', padding: '0 16px', gap: '6px', borderRadius: '10px', flexShrink: 0 }}
            >
              {savingKey ? <Loader2 size={14} className="animate-spin" /> : null}
              {savingKey ? 'Connecting...' : 'Connect'}
            </button>
          </div>
          {keyError && <p className="text-xs text-red-400" style={{ marginTop: '8px' }}>{keyError}</p>}
        </div>
      ) : (
        <div className="flex items-center rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06]" style={{ gap: '8px', padding: '12px 16px', marginBottom: '28px' }}>
          <CheckCircle size={14} className="text-emerald-400" />
          <span className="text-sm text-text-secondary">Composio connected — your tokens are stored securely</span>
        </div>
      )}

      {/* App Grid — only shown when API key is set */}
      {composioApiKeySet && Object.entries(categories).map(([category, apps]) => (
        <div key={category} style={{ marginBottom: '28px' }}>
          <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider" style={{ marginBottom: '12px' }}>
            {category}
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' }}>
            {apps.map(app => {
              const isConnected = composioConnectedApps[app.id] === true
              const isConnecting = connectingApp === app.id
              const isWaiting = waitingApp === app.id

              return (
                <div
                  key={app.id}
                  className={`rounded-xl border transition-colors ${
                    isConnected
                      ? 'border-emerald-500/20 bg-emerald-500/[0.04]'
                      : 'border-border-default bg-bg-elevated hover:border-border-bright'
                  }`}
                  style={{ padding: '14px 16px' }}
                >
                  {/* App header */}
                  <div className="flex items-center" style={{ gap: '10px', marginBottom: '10px' }}>
                    <span style={{ fontSize: '20px' }}>{app.icon}</span>
                    <div>
                      <p className="text-sm font-medium text-text-primary">{app.name}</p>
                      <p className="text-xs text-text-tertiary">{app.description}</p>
                    </div>
                  </div>

                  {/* Status + action */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center" style={{ gap: '5px' }}>
                      {isConnected ? (
                        <>
                          <CheckCircle size={12} className="text-emerald-400" />
                          <span className="text-xs text-emerald-400">Connected</span>
                        </>
                      ) : isWaiting ? (
                        <>
                          <Loader2 size={12} className="text-text-tertiary animate-spin" />
                          <span className="text-xs text-text-tertiary">Waiting...</span>
                        </>
                      ) : (
                        <>
                          <Circle size={12} className="text-text-quaternary" />
                          <span className="text-xs text-text-tertiary">Not connected</span>
                        </>
                      )}
                    </div>

                    {isConnected ? (
                      <button
                        onClick={() => handleDisconnect(app.id)}
                        disabled={isConnecting}
                        className="text-xs text-text-tertiary hover:text-red-400 transition-colors disabled:opacity-50"
                      >
                        {isConnecting ? <Loader2 size={11} className="animate-spin" /> : 'Disconnect'}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleConnect(app.id)}
                        disabled={isConnecting || isWaiting}
                        className="flex items-center rounded-lg bg-flame-500/10 border border-flame-500/20 text-xs text-flame-400 hover:bg-flame-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        style={{ height: '26px', padding: '0 10px', gap: '4px', borderRadius: '8px' }}
                      >
                        {isConnecting ? <Loader2 size={11} className="animate-spin" /> : null}
                        {isConnecting ? 'Opening...' : 'Connect'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {/* Empty state when key not set */}
      {!composioApiKeySet && catalog.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border-default text-center" style={{ padding: '48px 24px' }}>
          <p className="text-text-tertiary text-sm">Enter your Composio API key above to see available integrations</p>
        </div>
      )}
    </div>
  )
}
