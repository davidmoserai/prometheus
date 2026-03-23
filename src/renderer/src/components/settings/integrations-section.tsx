import React, { useState, useEffect, useCallback } from 'react'
import { CheckCircle, ExternalLink, Key, Loader2, RefreshCw } from 'lucide-react'
import { useAppStore } from '../../stores/app-store'
import type { IntegrationDefinition } from '../../../../main/integration-catalog'

export function IntegrationsSection(): React.JSX.Element {
  const {
    composioApiKeySet,
    loadComposioStatus,
    setComposioApiKey
  } = useAppStore()

  const [activeIntegrations, setActiveIntegrations] = useState<IntegrationDefinition[]>([])
  const [loading, setLoading] = useState(false)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [savingKey, setSavingKey] = useState(false)
  const [keyError, setKeyError] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  const loadActive = useCallback(async (): Promise<void> => {
    if (!window.api?.composio) return
    setLoading(true)
    try {
      const items = await window.api.composio.listActiveIntegrations()
      setActiveIntegrations(items || [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (composioApiKeySet) loadActive()
    else loadComposioStatus()
  }, [composioApiKeySet, loadActive, loadComposioStatus])

  const handleSaveApiKey = useCallback(async (): Promise<void> => {
    if (!apiKeyInput.trim()) return
    setSavingKey(true)
    setKeyError('')
    try {
      await setComposioApiKey(apiKeyInput.trim())
      setApiKeyInput('')
      await loadActive()
    } catch {
      setKeyError('Invalid API key — please check and try again')
    } finally {
      setSavingKey(false)
    }
  }, [apiKeyInput, setComposioApiKey, loadActive])

  const handleRefresh = useCallback(async (): Promise<void> => {
    setRefreshing(true)
    try {
      await loadActive()
    } finally {
      setRefreshing(false)
    }
  }, [loadActive])

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
            Integrations are powered by Composio, which securely stores your OAuth tokens.{' '}
            <a
              href="https://app.composio.dev/settings"
              target="_blank"
              rel="noreferrer"
              className="text-flame-400 hover:text-flame-300 inline-flex items-center transition-colors"
              style={{ gap: '4px' }}
            >
              Get your free API key <ExternalLink size={12} />
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

      {/* Active integrations */}
      {composioApiKeySet && (
        <div>
          {loading ? (
            <div className="flex items-center" style={{ gap: '8px' }}>
              <Loader2 size={14} className="animate-spin text-text-tertiary" />
              <span className="text-sm text-text-tertiary">Loading your integrations...</span>
            </div>
          ) : activeIntegrations.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border-default" style={{ padding: '36px 32px' }}>
              <p className="text-text-secondary text-sm font-medium" style={{ marginBottom: '16px' }}>No integrations connected yet</p>
              <div className="text-sm text-text-tertiary" style={{ marginBottom: '20px', lineHeight: '1.7' }}>
                <p style={{ marginBottom: '12px' }}>To connect an app (e.g. Gmail, Slack, Instagram):</p>
                <ol style={{ paddingLeft: '20px', listStyleType: 'decimal' }}>
                  <li style={{ marginBottom: '6px' }}>
                    Open your{' '}
                    <a href="https://app.composio.dev" target="_blank" rel="noreferrer" className="text-flame-400 hover:text-flame-300 transition-colors">
                      Composio dashboard
                    </a>
                  </li>
                  <li style={{ marginBottom: '6px' }}>Go to <span className="text-text-secondary font-medium">Auth Configs</span> → <span className="text-text-secondary font-medium">Create Auth Config</span></li>
                  <li style={{ marginBottom: '6px' }}>Choose the app you want and follow the steps to connect your account</li>
                  <li>Come back here — your connected apps will appear automatically</li>
                </ol>
              </div>
              <a
                href="https://app.composio.dev"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center rounded-xl bg-flame-500 text-white text-sm font-medium hover:bg-flame-400 transition-colors cursor-pointer"
                style={{ padding: '0 16px', height: '36px', gap: '6px', borderRadius: '10px' }}
              >
                Open Composio Dashboard <ExternalLink size={12} />
              </a>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between" style={{ marginBottom: '14px' }}>
                <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">Connected apps</h3>
                <div className="flex items-center" style={{ gap: '12px' }}>
                  <button
                    onClick={handleRefresh}
                    disabled={refreshing}
                    className="inline-flex items-center text-xs text-text-tertiary hover:text-text-secondary transition-colors cursor-pointer disabled:opacity-50"
                    style={{ gap: '4px' }}
                  >
                    <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} />
                    Refresh
                  </button>
                  <a
                    href="https://app.composio.dev"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center text-xs text-flame-400 hover:text-flame-300 transition-colors"
                    style={{ gap: '4px' }}
                  >
                    Manage on Composio <ExternalLink size={11} />
                  </a>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {activeIntegrations.map(app => (
                  <div
                    key={app.id}
                    className="flex items-center justify-between rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04]"
                    style={{ padding: '12px 16px' }}
                  >
                    <div className="flex items-center" style={{ gap: '12px' }}>
                      {app.logo
                        ? <img src={app.logo} alt={app.name} style={{ width: '28px', height: '28px', borderRadius: '6px', objectFit: 'contain' }} />
                        : <span style={{ fontSize: '22px' }}>{app.icon}</span>
                      }
                      <div className="flex items-center" style={{ gap: '6px' }}>
                        <span className="text-sm font-medium text-text-primary">{app.name}</span>
                        <CheckCircle size={12} className="text-emerald-400" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
