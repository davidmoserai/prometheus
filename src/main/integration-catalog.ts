export interface IntegrationDefinition {
  id: string       // Composio toolkit slug
  name: string
  icon: string     // emoji
  category: string
  description: string
}

export const INTEGRATION_CATALOG: IntegrationDefinition[] = [
  // Communication
  { id: 'gmail', name: 'Gmail', icon: '📧', category: 'Communication', description: 'Send and read emails' },
  { id: 'slack', name: 'Slack', icon: '💬', category: 'Communication', description: 'Send messages and manage channels' },
  { id: 'discord', name: 'Discord', icon: '🎮', category: 'Communication', description: 'Manage Discord servers and messages' },
  { id: 'outlook', name: 'Outlook', icon: '📮', category: 'Communication', description: 'Send and read Outlook emails' },
  // Productivity
  { id: 'notion', name: 'Notion', icon: '📝', category: 'Productivity', description: 'Create and manage Notion pages' },
  { id: 'googlecalendar', name: 'Google Calendar', icon: '📅', category: 'Productivity', description: 'Manage calendar events' },
  { id: 'googledrive', name: 'Google Drive', icon: '📁', category: 'Productivity', description: 'Read and manage Drive files' },
  { id: 'googlesheets', name: 'Google Sheets', icon: '📊', category: 'Productivity', description: 'Read and edit spreadsheets' },
  { id: 'googledocs', name: 'Google Docs', icon: '📄', category: 'Productivity', description: 'Read and edit documents' },
  // Development
  { id: 'github', name: 'GitHub', icon: '🐙', category: 'Development', description: 'Manage repos, issues, and PRs' },
  { id: 'gitlab', name: 'GitLab', icon: '🦊', category: 'Development', description: 'Manage GitLab projects and MRs' },
  { id: 'supabase', name: 'Supabase', icon: '⚡', category: 'Development', description: 'Query and manage Supabase database' },
  // Project Management
  { id: 'linear', name: 'Linear', icon: '📋', category: 'Project Management', description: 'Manage issues and projects' },
  { id: 'jira', name: 'Jira', icon: '🔵', category: 'Project Management', description: 'Track and manage Jira tickets' },
  { id: 'asana', name: 'Asana', icon: '🎯', category: 'Project Management', description: 'Manage tasks and projects' },
  { id: 'trello', name: 'Trello', icon: '📌', category: 'Project Management', description: 'Manage Trello boards and cards' },
  // CRM
  { id: 'hubspot', name: 'HubSpot', icon: '🧲', category: 'CRM', description: 'Manage contacts and deals' },
  { id: 'salesforce', name: 'Salesforce', icon: '☁️', category: 'CRM', description: 'Manage Salesforce CRM data' },
  // Storage
  { id: 'dropbox', name: 'Dropbox', icon: '📦', category: 'Storage', description: 'Read and manage Dropbox files' },
  { id: 'onedrive', name: 'OneDrive', icon: '🗂️', category: 'Storage', description: 'Read and manage OneDrive files' }
]

export const INTEGRATION_CATALOG_BY_ID: Record<string, IntegrationDefinition> =
  Object.fromEntries(INTEGRATION_CATALOG.map(i => [i.id, i]))
