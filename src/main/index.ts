import { app, BrowserWindow, dialog, ipcMain, Notification, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import { join } from 'path'
import { EmployeeStore } from './store'
import { AgentManager } from './agent-manager'
import { MCPManager } from './mcp-manager'
import { Scheduler } from './scheduler'
import { ConversationService } from './conversation-service'
import type { MCPServerConfig } from './types'
import { isClaudeCodeInstalled, getAuthStatus, launchLogin } from './claude-code-runner'
import { initMemory, getMemory } from './memory'
import { migrateConversationsToMastra } from './migration'

let mainWindow: BrowserWindow | null = null
let store: EmployeeStore
let mcpManager: MCPManager
let agentManager: AgentManager
let scheduler: Scheduler
let convService: ConversationService

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#0a0a0c',
    icon: join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

}

function registerIpcHandlers(): void {
  // Company IPC Handlers
  ipcMain.handle('companies:list', () => store.listCompanies())
  ipcMain.handle('companies:getActive', () => store.getActiveCompanyId())
  ipcMain.handle('companies:setActive', async (_event, id: string) => {
    store.setActiveCompany(id)
    // Migrate legacy memory for employees in the newly active company
    try {
      const mem = getMemory()
      for (const emp of store.listEmployees()) {
        if (emp.memory) {
          try {
            const existing = await mem.getWorkingMemory({ threadId: `employee-${emp.id}`, resourceId: emp.id })
            if (!existing) {
              await mem.updateWorkingMemory({ threadId: `employee-${emp.id}`, resourceId: emp.id, workingMemory: emp.memory })
              store.updateEmployee(emp.id, { memory: '' })
            }
          } catch { /* skip */ }
        }
      }
    } catch { /* memory unavailable */ }
  })
  ipcMain.handle('companies:create', (_event, data) => store.createCompany(data))
  ipcMain.handle('companies:update', (_event, id: string, data) => store.updateCompany(id, data))
  ipcMain.handle('companies:delete', (_event, id: string) => store.deleteCompany(id))

  // Department IPC Handlers
  ipcMain.handle('departments:list', () => store.listDepartments())
  ipcMain.handle('departments:create', (_event, data) => store.createDepartment(data))
  ipcMain.handle('departments:update', (_event, id: string, data) => store.updateDepartment(id, data))
  ipcMain.handle('departments:delete', (_event, id: string) => store.deleteDepartment(id))

  // Employee IPC Handlers
  ipcMain.handle('employees:list', () => store.listEmployees())
  ipcMain.handle('employees:get', (_event, id: string) => store.getEmployee(id))
  ipcMain.handle('employees:create', (_event, data) => store.createEmployee(data))
  ipcMain.handle('employees:update', (_event, id: string, data) => store.updateEmployee(id, data))
  ipcMain.handle('employees:delete', (_event, id: string) => store.deleteEmployee(id))
  ipcMain.handle('employees:listTerminated', () => store.listTerminatedEmployees())
  ipcMain.handle('employees:fire', (_event, id: string) => store.fireEmployee(id))
  ipcMain.handle('employees:rehire', (_event, id: string) => store.rehireEmployee(id))

  // Knowledge IPC Handlers
  ipcMain.handle('knowledge:list', () => store.listKnowledge())
  ipcMain.handle('knowledge:get', (_event, id: string) => store.getKnowledge(id))
  ipcMain.handle('knowledge:create', (_event, data) => store.createKnowledge(data))
  ipcMain.handle('knowledge:update', (_event, id: string, data) => store.updateKnowledge(id, data))
  ipcMain.handle('knowledge:delete', (_event, id: string) => store.deleteKnowledge(id))

  // Conversation IPC Handlers (backed by Mastra Memory)
  ipcMain.handle('conversations:list', async (_event, employeeId: string) => {
    const companyId = store.getActiveCompanyId()
    if (!companyId) return []
    return convService.listConversations(employeeId, companyId)
  })
  ipcMain.handle('conversations:get', (_event, id: string) => convService.getConversation(id))
  ipcMain.handle('conversations:create', async (_event, employeeId: string) => {
    const companyId = store.getActiveCompanyId()
    if (!companyId) throw new Error('No active company')
    return convService.createConversation(employeeId, companyId)
  })
  ipcMain.handle('conversations:delete', (_event, id: string) => convService.deleteConversation(id))

  // Task IPC Handlers
  ipcMain.handle('tasks:list', () => store.listTasks())
  ipcMain.handle('tasks:get', (_event, id: string) => store.getTask(id))
  ipcMain.handle('tasks:create', (_event, data) => store.createTask(data))
  ipcMain.handle('tasks:update', (_event, id: string, data) => store.updateTask(id, data))
  ipcMain.handle('tasks:delete', (_event, id: string) => store.deleteTask(id))
  ipcMain.handle('tasks:reply', async (_event, taskId: string, message: string) => {
    await agentManager.continueTask(taskId, message)
    return store.getTask(taskId)
  })

  // Chat IPC Handler
  ipcMain.handle('chat:send', async (_event, conversationId: string, message: string) => {
    return agentManager.sendMessage(
      conversationId,
      message,
      (chunk) => {
        mainWindow?.webContents.send('chat:stream', { conversationId, chunk })
      },
      (msg) => {
        mainWindow?.webContents.send('chat:messageStored', { conversationId, message: msg })
      }
    )
  })

  // Chat: tool approval response
  ipcMain.handle('chat:respondApproval', (_event, approvalId: string, approved: boolean) => {
    agentManager.respondToApproval(approvalId, approved)
  })

  // Chat: token counting and compression
  ipcMain.handle('chat:countTokens', (_event, conversationId: string) => {
    return agentManager.countConversationTokens(conversationId)
  })

  ipcMain.handle('chat:compress', async (_event, conversationId: string) => {
    await agentManager.compressConversation(conversationId)
    return convService.getConversation(conversationId)
  })

  // Memory IPC Handlers
  ipcMain.handle('memory:getWorkingMemory', async (_event, employeeId: string) => {
    try {
      const mem = getMemory()
      return await mem.getWorkingMemory({ threadId: `employee-${employeeId}`, resourceId: employeeId })
    } catch {
      return null
    }
  })

  ipcMain.handle('memory:clearWorkingMemory', async (_event, employeeId: string) => {
    try {
      const mem = getMemory()
      await mem.updateWorkingMemory({ threadId: `employee-${employeeId}`, resourceId: employeeId, workingMemory: '' })
    } catch { /* ignore */ }
  })

  // Recurring Tasks IPC Handlers
  ipcMain.handle('recurringTasks:list', () => store.listRecurringTasks())
  ipcMain.handle('recurringTasks:get', (_event, id: string) => store.getRecurringTask(id))
  ipcMain.handle('recurringTasks:create', (_event, data) => store.createRecurringTask(data))
  ipcMain.handle('recurringTasks:update', (_event, id: string, data) => store.updateRecurringTask(id, data))
  ipcMain.handle('recurringTasks:delete', (_event, id: string) => store.deleteRecurringTask(id))

  // File IPC Handlers
  ipcMain.handle('files:pick', async () => {
    if (!mainWindow) return { canceled: true, filePaths: [] }
    return dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
  })

  ipcMain.handle('files:upload', (_event, conversationId: string, filePath: string) => {
    return store.uploadFile(conversationId, filePath)
  })

  // Settings IPC Handlers
  ipcMain.handle('settings:get', () => store.getSettings())
  ipcMain.handle('settings:update', (_event, settings) => {
    const result = store.updateSettings(settings)
    // Re-init memory when providers change (API keys may have been added/rotated)
    try { initMemory(settings.providers) } catch { /* keep existing instance */ }
    return result
  })

  // MCP Server IPC Handlers
  ipcMain.handle('mcp:list', () => {
    const s = store.getSettings()
    return s.mcpServers || []
  })

  ipcMain.handle('mcp:add', async (_event, config: MCPServerConfig) => {
    const s = store.getSettings()
    const servers = [...(s.mcpServers || []), config]
    store.updateSettings({ mcpServers: servers })

    // Connect and discover tools
    if (config.enabled) {
      try {
        const toolNames = await mcpManager.connect(config)
        return { success: true, tools: toolNames }
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Connection failed' }
      }
    }
    return { success: true, tools: [] }
  })

  ipcMain.handle('mcp:update', async (_event, id: string, updates: Partial<MCPServerConfig>) => {
    const s = store.getSettings()
    const servers = (s.mcpServers || []).map(srv =>
      srv.id === id ? { ...srv, ...updates } : srv
    )
    store.updateSettings({ mcpServers: servers })

    // Reconnect if enabled, disconnect if disabled
    const updated = servers.find(srv => srv.id === id)
    if (updated) {
      if (updated.enabled) {
        try {
          const toolNames = await mcpManager.connect(updated)
          return { success: true, tools: toolNames }
        } catch (err) {
          return { success: false, error: err instanceof Error ? err.message : 'Connection failed' }
        }
      } else {
        await mcpManager.disconnect(id)
        return { success: true, tools: [] }
      }
    }
    return { success: true, tools: [] }
  })

  ipcMain.handle('mcp:remove', async (_event, id: string) => {
    await mcpManager.disconnect(id)
    const s = store.getSettings()
    const servers = (s.mcpServers || []).filter(srv => srv.id !== id)
    store.updateSettings({ mcpServers: servers })
    return { success: true }
  })

  ipcMain.handle('mcp:getTools', (_event, serverId: string) => {
    return mcpManager.getToolNames(serverId)
  })

  ipcMain.handle('mcp:testConnection', async (_event, config: MCPServerConfig) => {
    try {
      const toolNames = await mcpManager.testConnection(config)
      return { success: true, tools: toolNames }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Connection failed' }
    }
  })

  // Claude Code IPC Handlers
  ipcMain.handle('claude-code:isInstalled', () => {
    return isClaudeCodeInstalled()
  })

  ipcMain.handle('claude-code:authStatus', () => {
    return getAuthStatus()
  })

  ipcMain.handle('claude-code:login', async () => {
    return launchLogin()
  })

  // Auto-update IPC Handler
  ipcMain.handle('update:install', () => {
    autoUpdater.quitAndInstall()
  })
}

app.whenReady().then(async () => {
  // Initialize store after app is ready (needs app.getPath)
  store = new EmployeeStore()
  mcpManager = new MCPManager()

  // Initialize Mastra memory (required — conversations are stored in LibSQL)
  const settings = store.getSettings()
  const memory = initMemory(settings.providers)
  convService = new ConversationService()

  // Migrate conversations from JSON store → Mastra Memory (one-time)
  await migrateConversationsToMastra(convService)

  // Migrate legacy employee.memory strings → Mastra working memory (one-time)
  for (const emp of store.listEmployees()) {
    if (emp.memory) {
      try {
        const existing = await memory.getWorkingMemory({ threadId: `employee-${emp.id}`, resourceId: emp.id })
        if (!existing) {
          await memory.updateWorkingMemory({
            threadId: `employee-${emp.id}`,
            resourceId: emp.id,
            workingMemory: emp.memory,
          })
          store.updateEmployee(emp.id, { memory: '' })
        }
      } catch (err) {
        console.error(`Failed to migrate memory for employee ${emp.id}:`, err)
      }
    }
  }

  agentManager = new AgentManager(store, mcpManager, convService)
  if (settings.mcpServers?.length > 0) {
    mcpManager.connectAll(settings.mcpServers).catch(err => {
      console.error('Failed to connect MCP servers on startup:', err)
    })
  }

  // Push task updates to frontend in real-time
  agentManager.setTaskUpdateCallback((task) => {
    mainWindow?.webContents.send('task:updated', task)

    // Send native + in-app notifications for completed/escalated tasks
    if (task.status === 'completed' || task.status === 'escalated') {
      const employee = store.getEmployee(task.toEmployeeId)
      const employeeName = employee?.name || 'Employee'

      const notificationType = task.status === 'completed' ? 'task_completed' : 'task_escalated'
      const title = task.status === 'completed' ? 'Task Completed' : 'Task Escalated'
      const body = task.status === 'completed'
        ? `${employeeName} finished: ${task.objective}`
        : `${employeeName} escalated: ${task.objective}`

      // Native macOS notification
      new Notification({
        title,
        body,
        icon: join(__dirname, '../../resources/icon.png')
      }).show()

      // Push to renderer for in-app notification center
      mainWindow?.webContents.send('notification', { type: notificationType, title, body })
    }
  })

  // Push file-written events to frontend
  agentManager.setFileWrittenCallback((data) => {
    mainWindow?.webContents.send('chat:fileWritten', data)
  })

  // Push tool call events to frontend (with unique ID for chronological ordering)
  agentManager.setToolCallCallback((data) => {
    mainWindow?.webContents.send('chat:toolCall', { ...data, id: `tc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` })
  })

  // Push tool approval requests to frontend
  agentManager.setApprovalRequestCallback((data) => {
    mainWindow?.webContents.send('chat:approvalRequest', data)
  })

  // Initialize and start the scheduler
  scheduler = new Scheduler(store, agentManager, convService)
  scheduler.setTaskRunCallback((recurringTask) => {
    mainWindow?.webContents.send('recurringTask:executed', recurringTask)

    // Send native + in-app notification for recurring task execution
    const employee = store.getEmployee(recurringTask.employeeId)
    const employeeName = employee?.name || 'Employee'
    const title = 'Recurring Task Executed'
    const body = `${employeeName} ran: ${recurringTask.name}`

    new Notification({
      title,
      body,
      icon: join(__dirname, '../../resources/icon.png')
    }).show()

    mainWindow?.webContents.send('notification', { type: 'recurring_executed', title, body })
  })
  scheduler.start()

  registerIpcHandlers()
  createWindow()

  // Check for updates (will fail silently in dev mode)
  try {
    autoUpdater.checkForUpdatesAndNotify()

    autoUpdater.on('update-available', () => {
      mainWindow?.webContents.send('update:available')
    })

    autoUpdater.on('update-downloaded', () => {
      mainWindow?.webContents.send('update:downloaded')
    })
  } catch {
    // Auto-updater not available in dev mode
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', async () => {
  // Cancel any pending tool approvals
  agentManager?.cancelAllPendingApprovals()

  // Gracefully disconnect MCP servers on quit
  if (mcpManager) {
    await mcpManager.disconnectAll()
  }
})
