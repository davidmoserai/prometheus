import { Composio } from '@composio/core'
import { shell } from 'electron'
import type { MCPServerConfig } from './types'
import type { IntegrationDefinition } from './integration-catalog'

export const COMPOSIO_MCP_SERVER_ID = 'composio-integrations'

// ============================================================
// ComposioManager — manages Composio session and OAuth flows
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
   * Returns the url + headers needed for MCPManager to connect.
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
   * Initiate OAuth for an app (e.g. 'gmail', 'slack').
   * Opens the redirect URL in the system browser.
   * Returns a function to wait for the connection to complete.
   */
  async authorizeApp(appId: string): Promise<{
    redirectUrl: string
    waitForConnection: (timeoutMs?: number) => Promise<boolean>
  }> {
    const session = await this.composio.create(this.userId)
    const connectionRequest = await session.authorize(appId)

    const redirectUrl = connectionRequest.redirectUrl ?? ''
    if (redirectUrl) {
      shell.openExternal(redirectUrl)
    }

    return {
      redirectUrl,
      waitForConnection: async (timeoutMs = 120000) => {
        try {
          await connectionRequest.waitForConnection(timeoutMs)
          return true
        } catch {
          return false
        }
      }
    }
  }

  /**
   * List all apps in the catalog with their connection status for this user.
   * Returns map of appId -> connected boolean.
   */
  async listConnectedApps(): Promise<Record<string, boolean>> {
    const result = await this.composio.connectedAccounts.list({ statuses: ['ACTIVE'] })
    const connected: Record<string, boolean> = {}
    for (const account of result.items) {
      connected[account.toolkit.slug] = true
    }
    return connected
  }

  /**
   * List only the apps the user has actively connected, with name and logo.
   */
  async listActiveIntegrations(): Promise<IntegrationDefinition[]> {
    const result = await this.composio.connectedAccounts.list({ statuses: ['ACTIVE'] })

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

  /**
   * Disconnect an app by its toolkit slug.
   */
  /**
   * Fetch the full catalog of available integrations from Composio.
   * Filters out local toolkits and normalizes to IntegrationDefinition shape.
   */
  async getCatalog(): Promise<IntegrationDefinition[]> {
    const toolkits = await this.composio.toolkits.get({})
    return toolkits
      .filter(t => !t.isLocalToolkit)
      .map(t => ({
        id: t.slug,
        name: t.name,
        icon: '🔗',
        logo: t.meta.logo,
        category: t.meta.categories?.[0]?.name ?? 'Other',
        description: t.meta.description ?? ''
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  async disconnectApp(appId: string): Promise<void> {
    const result = await this.composio.connectedAccounts.list({ toolkitSlugs: [appId] })
    const account = result.items[0]
    if (!account) return
    await this.composio.connectedAccounts.delete(account.id)
  }
}
