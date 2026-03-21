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

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
