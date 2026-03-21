import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
import { EmployeeStore } from './store'
import { AgentManager } from './agent-manager'

let mainWindow: BrowserWindow | null = null
const store = new EmployeeStore()
const agentManager = new AgentManager(store)

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 18 },
    backgroundColor: '#09090b',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// IPC Handlers
ipcMain.handle('employees:list', () => store.listEmployees())
ipcMain.handle('employees:get', (_event, id: string) => store.getEmployee(id))
ipcMain.handle('employees:create', (_event, data) => store.createEmployee(data))
ipcMain.handle('employees:update', (_event, id: string, data) => store.updateEmployee(id, data))
ipcMain.handle('employees:delete', (_event, id: string) => store.deleteEmployee(id))

ipcMain.handle('knowledge:list', () => store.listKnowledge())
ipcMain.handle('knowledge:create', (_event, data) => store.createKnowledge(data))
ipcMain.handle('knowledge:update', (_event, id: string, data) => store.updateKnowledge(id, data))
ipcMain.handle('knowledge:delete', (_event, id: string) => store.deleteKnowledge(id))

ipcMain.handle('conversations:list', (_event, employeeId: string) => store.listConversations(employeeId))
ipcMain.handle('conversations:get', (_event, id: string) => store.getConversation(id))
ipcMain.handle('conversations:create', (_event, employeeId: string) => store.createConversation(employeeId))

ipcMain.handle('chat:send', async (_event, conversationId: string, message: string) => {
  return agentManager.sendMessage(conversationId, message, (chunk) => {
    mainWindow?.webContents.send('chat:stream', { conversationId, chunk })
  })
})

ipcMain.handle('settings:get', () => store.getSettings())
ipcMain.handle('settings:update', (_event, settings) => store.updateSettings(settings))

// OAuth flow — opens system browser, listens for callback via custom protocol
ipcMain.handle('oauth:start', async (_event, providerId: string) => {
  const settings = store.getSettings()
  const provider = settings.providers.find(p => p.id === providerId)
  if (!provider?.oauthSupported || !provider.oauthAuthUrl || !provider.oauthClientId) {
    throw new Error(`OAuth not configured for ${providerId}. Add your OAuth Client ID in settings.`)
  }

  const redirectUri = `prometheus://oauth/callback/${providerId}`
  const state = Math.random().toString(36).substring(2)
  const scopes = (provider.oauthScopes || []).join(' ')

  const authUrl = new URL(provider.oauthAuthUrl)
  authUrl.searchParams.set('client_id', provider.oauthClientId)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', scopes)
  authUrl.searchParams.set('state', state)

  // Open system browser for auth
  shell.openExternal(authUrl.toString())

  return { state, redirectUri }
})

// Handle OAuth callback token exchange
ipcMain.handle('oauth:exchange', async (_event, providerId: string, code: string) => {
  const settings = store.getSettings()
  const provider = settings.providers.find(p => p.id === providerId)
  if (!provider?.oauthTokenUrl || !provider.oauthClientId) {
    throw new Error(`OAuth not configured for ${providerId}`)
  }

  const redirectUri = `prometheus://oauth/callback/${providerId}`

  try {
    const response = await fetch(provider.oauthTokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: provider.oauthClientId
      })
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Token exchange failed: ${text}`)
    }

    const data = await response.json()
    const oauth = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || '',
      expiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString(),
      scope: data.scope || ''
    }

    // Save to store
    store.updateProviderOAuth(providerId, oauth)
    return oauth
  } catch (err) {
    throw new Error(`OAuth token exchange failed: ${err instanceof Error ? err.message : String(err)}`)
  }
})

ipcMain.handle('oauth:disconnect', (_event, providerId: string) => {
  store.updateProviderOAuth(providerId, null)
})

// Register custom protocol for OAuth callbacks
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('prometheus', process.execPath, [process.argv[1]])
  }
} else {
  app.setAsDefaultProtocolClient('prometheus')
}

// Handle protocol URL on macOS
app.on('open-url', (_event, url) => {
  const parsed = new URL(url)
  if (parsed.pathname.startsWith('/oauth/callback/')) {
    const providerId = parsed.pathname.split('/').pop()
    const code = parsed.searchParams.get('code')
    if (providerId && code && mainWindow) {
      mainWindow.webContents.send('oauth:callback', { providerId, code })
    }
  }
})

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
