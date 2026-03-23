import { contextBridge, ipcRenderer } from 'electron'

const api = {
  companies: {
    list: () => ipcRenderer.invoke('companies:list'),
    getActive: () => ipcRenderer.invoke('companies:getActive'),
    setActive: (id: string) => ipcRenderer.invoke('companies:setActive', id),
    create: (data: unknown) => ipcRenderer.invoke('companies:create', data),
    update: (id: string, data: unknown) => ipcRenderer.invoke('companies:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('companies:delete', id)
  },
  departments: {
    list: () => ipcRenderer.invoke('departments:list'),
    create: (data: unknown) => ipcRenderer.invoke('departments:create', data),
    update: (id: string, data: unknown) => ipcRenderer.invoke('departments:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('departments:delete', id)
  },
  employees: {
    list: () => ipcRenderer.invoke('employees:list'),
    listTerminated: () => ipcRenderer.invoke('employees:listTerminated'),
    get: (id: string) => ipcRenderer.invoke('employees:get', id),
    create: (data: unknown) => ipcRenderer.invoke('employees:create', data),
    update: (id: string, data: unknown) => ipcRenderer.invoke('employees:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('employees:delete', id),
    fire: (id: string) => ipcRenderer.invoke('employees:fire', id),
    rehire: (id: string) => ipcRenderer.invoke('employees:rehire', id)
  },
  knowledge: {
    list: () => ipcRenderer.invoke('knowledge:list'),
    create: (data: unknown) => ipcRenderer.invoke('knowledge:create', data),
    update: (id: string, data: unknown) => ipcRenderer.invoke('knowledge:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('knowledge:delete', id)
  },
  files: {
    pick: () => ipcRenderer.invoke('files:pick'),
    upload: (conversationId: string, filePath: string) => ipcRenderer.invoke('files:upload', conversationId, filePath)
  },
  conversations: {
    list: (employeeId: string) => ipcRenderer.invoke('conversations:list', employeeId),
    get: (id: string) => ipcRenderer.invoke('conversations:get', id),
    create: (employeeId: string) => ipcRenderer.invoke('conversations:create', employeeId),
    delete: (id: string) => ipcRenderer.invoke('conversations:delete', id)
  },
  tasks: {
    list: () => ipcRenderer.invoke('tasks:list'),
    get: (id: string) => ipcRenderer.invoke('tasks:get', id),
    create: (data: unknown) => ipcRenderer.invoke('tasks:create', data),
    update: (id: string, data: unknown) => ipcRenderer.invoke('tasks:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('tasks:delete', id),
    reply: (taskId: string, message: string) => ipcRenderer.invoke('tasks:reply', taskId, message),
    onUpdate: (callback: (task: unknown) => void) => {
      const handler = (_event: unknown, task: unknown) => callback(task)
      ipcRenderer.on('task:updated', handler)
      return () => ipcRenderer.removeListener('task:updated', handler)
    }
  },
  chat: {
    send: (conversationId: string, message: string) =>
      ipcRenderer.invoke('chat:send', conversationId, message),
    countTokens: (conversationId: string) =>
      ipcRenderer.invoke('chat:countTokens', conversationId),
    compress: (conversationId: string) =>
      ipcRenderer.invoke('chat:compress', conversationId),
    onStream: (callback: (data: { conversationId: string; chunk: string }) => void) => {
      const handler = (_event: unknown, data: { conversationId: string; chunk: string }) => callback(data)
      ipcRenderer.on('chat:stream', handler)
      return () => ipcRenderer.removeListener('chat:stream', handler)
    },
    onMessageStored: (callback: (data: { conversationId: string; message: unknown }) => void) => {
      const handler = (_event: unknown, data: { conversationId: string; message: unknown }) => callback(data)
      ipcRenderer.on('chat:messageStored', handler)
      return () => ipcRenderer.removeListener('chat:messageStored', handler)
    },
    onFileWritten: (callback: (data: { conversationId: string; path: string; content: string }) => void) => {
      const handler = (_event: unknown, data: { conversationId: string; path: string; content: string }) => callback(data)
      ipcRenderer.on('chat:fileWritten', handler)
      return () => ipcRenderer.removeListener('chat:fileWritten', handler)
    },
    onToolCall: (callback: (data: { conversationId: string; tool: string; summary: string }) => void) => {
      const handler = (_event: unknown, data: { conversationId: string; tool: string; summary: string }) => callback(data)
      ipcRenderer.on('chat:toolCall', handler)
      return () => ipcRenderer.removeListener('chat:toolCall', handler)
    }
  },
  recurringTasks: {
    list: () => ipcRenderer.invoke('recurringTasks:list'),
    get: (id: string) => ipcRenderer.invoke('recurringTasks:get', id),
    create: (data: unknown) => ipcRenderer.invoke('recurringTasks:create', data),
    update: (id: string, data: unknown) => ipcRenderer.invoke('recurringTasks:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('recurringTasks:delete', id),
    onExecuted: (callback: (task: unknown) => void) => {
      const handler = (_event: unknown, task: unknown) => callback(task)
      ipcRenderer.on('recurringTask:executed', handler)
      return () => ipcRenderer.removeListener('recurringTask:executed', handler)
    }
  },
  notifications: {
    onNotification: (callback: (data: { type: string; title: string; body: string }) => void) => {
      const handler = (_event: unknown, data: { type: string; title: string; body: string }) => callback(data)
      ipcRenderer.on('notification', handler)
      return () => { ipcRenderer.removeListener('notification', handler) }
    }
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (settings: unknown) => ipcRenderer.invoke('settings:update', settings)
  },
  claudeCode: {
    isInstalled: () => ipcRenderer.invoke('claude-code:isInstalled'),
    authStatus: () => ipcRenderer.invoke('claude-code:authStatus'),
    login: () => ipcRenderer.invoke('claude-code:login')
  },
  mcp: {
    list: () => ipcRenderer.invoke('mcp:list'),
    add: (config: unknown) => ipcRenderer.invoke('mcp:add', config),
    update: (id: string, updates: unknown) => ipcRenderer.invoke('mcp:update', id, updates),
    remove: (id: string) => ipcRenderer.invoke('mcp:remove', id),
    getTools: (serverId: string) => ipcRenderer.invoke('mcp:getTools', serverId),
    testConnection: (config: unknown) => ipcRenderer.invoke('mcp:testConnection', config)
  },
  updates: {
    onAvailable: (callback: () => void) => {
      const handler = () => callback()
      ipcRenderer.on('update:available', handler)
      return () => ipcRenderer.removeListener('update:available', handler)
    },
    onDownloaded: (callback: () => void) => {
      const handler = () => callback()
      ipcRenderer.on('update:downloaded', handler)
      return () => ipcRenderer.removeListener('update:downloaded', handler)
    },
    install: () => ipcRenderer.invoke('update:install')
  }
}

contextBridge.exposeInMainWorld('api', api)

export type PrometheusAPI = typeof api
