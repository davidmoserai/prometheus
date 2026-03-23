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
    const session = await this.composio.create(this.userId)
    const result = await session.toolkits()
    const connected: Record<string, boolean> = {}
    for (const toolkit of result.items) {
      connected[toolkit.slug] = toolkit.connection?.isActive === true
    }
    return connected
  }

  /**
   * List only the apps the user has actively connected, with name and logo.
   */
  async listActiveIntegrations(): Promise<IntegrationDefinition[]> {
    const session = await this.composio.create(this.userId)
    const result = await session.toolkits()
    return result.items
      .filter(t => t.connection?.isActive === true)
      .map(t => ({
        id: t.slug,
        name: t.name,
        icon: '🔗',
        logo: (t as unknown as { meta?: { logo?: string } }).meta?.logo,
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
    const session = await this.composio.create(this.userId)
    const result = await session.toolkits()
    const toolkit = result.items.find(t => t.slug === appId)
    const connectedAccountId = toolkit?.connection?.connectedAccount?.id
    if (!connectedAccountId) return

    await this.composio.connectedAccounts.delete(connectedAccountId)
  }
}
