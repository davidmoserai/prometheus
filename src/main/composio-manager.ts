import { Composio } from '@composio/core'
import type { MCPServerConfig } from './types'
import type { IntegrationDefinition } from './integration-catalog'

export const COMPOSIO_MCP_SERVER_ID = 'composio-integrations'

// In-memory Composio HTTP config (url + headers) — set by index.ts after connecting
export let composioMcpConfig: { url: string; headers: Record<string, string> } | null = null
export function setComposioMcpConfig(config: { url: string; headers: Record<string, string> } | null): void {
  composioMcpConfig = config
}

// ============================================================
// ComposioManager — manages Composio session and MCP connection
// ============================================================

export class ComposioManager {
  private composio: Composio
  private userId: string

  constructor(apiKey: string, userId: string) {
    this.composio = new Composio({ apiKey })
    this.userId = userId
  }

  /**
   * Get the HTTP MCP config for this user's Composio session.
   * Only includes toolkits for the specified connected apps.
   */
  async getMcpConfig(connectedAppIds?: string[]): Promise<MCPServerConfig> {
    const toolkits = connectedAppIds && connectedAppIds.length > 0 ? connectedAppIds : undefined
    const session = await this.composio.create(this.userId, toolkits ? { toolkits } : undefined)
    return {
      id: COMPOSIO_MCP_SERVER_ID,
      name: 'Composio Integrations',
      command: '',
      args: [],
      enabled: true,
      transport: 'http',
      url: session.mcp.url,
      headers: session.mcp.headers ?? {},
      isComposio: true
    }
  }

  /**
   * Fetch active connected accounts from Composio.
   * Shared by both listConnectedApps and listActiveIntegrations.
   */
  private async fetchActiveAccounts() {
    return this.composio.connectedAccounts.list({ statuses: ['ACTIVE'] })
  }

  /**
   * Returns a map of appId -> true for all actively connected apps.
   */
  async listConnectedApps(): Promise<Record<string, boolean>> {
    const result = await this.fetchActiveAccounts()
    const connected: Record<string, boolean> = {}
    for (const account of result.items) {
      connected[account.toolkit.slug] = true
    }
    return connected
  }

  /**
   * Returns connected apps with display metadata (name, logo).
   */
  async listActiveIntegrations(): Promise<IntegrationDefinition[]> {
    const result = await this.fetchActiveAccounts()
    if (result.items.length === 0) return []

    // Fetch toolkit metadata (name + logo) for each connected app
    const slugs = [...new Set(result.items.map(a => a.toolkit.slug))]
    const toolkitMeta: Record<string, { name: string; logo?: string }> = {}
    await Promise.allSettled(
      slugs.map(async slug => {
        try {
          const tk = await this.composio.toolkits.get(slug)
          toolkitMeta[slug] = { name: (tk as unknown as { name: string }).name ?? slug, logo: (tk as unknown as { meta?: { logo?: string } }).meta?.logo }
        } catch {
          toolkitMeta[slug] = { name: slug }
        }
      })
    )

    return slugs.map(slug => ({
      id: slug,
      name: toolkitMeta[slug]?.name ?? slug,
      icon: '🔗',
      logo: toolkitMeta[slug]?.logo,
      category: '',
      description: ''
    }))
  }
}
