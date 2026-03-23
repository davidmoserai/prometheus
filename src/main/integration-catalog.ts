export interface IntegrationDefinition {
  id: string       // Composio toolkit slug
  name: string
  icon: string     // emoji fallback
  logo?: string    // URL from Composio API
  category: string
  description: string
}
