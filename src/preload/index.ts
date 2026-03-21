import { contextBridge, ipcRenderer } from 'electron'

const api = {
  employees: {
    list: () => ipcRenderer.invoke('employees:list'),
    get: (id: string) => ipcRenderer.invoke('employees:get', id),
    create: (data: unknown) => ipcRenderer.invoke('employees:create', data),
    update: (id: string, data: unknown) => ipcRenderer.invoke('employees:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('employees:delete', id)
  },
  knowledge: {
    list: () => ipcRenderer.invoke('knowledge:list'),
    create: (data: unknown) => ipcRenderer.invoke('knowledge:create', data),
    update: (id: string, data: unknown) => ipcRenderer.invoke('knowledge:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('knowledge:delete', id)
  },
  conversations: {
    list: (employeeId: string) => ipcRenderer.invoke('conversations:list', employeeId),
    get: (id: string) => ipcRenderer.invoke('conversations:get', id),
    create: (employeeId: string) => ipcRenderer.invoke('conversations:create', employeeId)
  },
  chat: {
    send: (conversationId: string, message: string) =>
      ipcRenderer.invoke('chat:send', conversationId, message),
    onStream: (callback: (data: { conversationId: string; chunk: string }) => void) => {
      const handler = (_event: unknown, data: { conversationId: string; chunk: string }) => callback(data)
      ipcRenderer.on('chat:stream', handler)
      return () => ipcRenderer.removeListener('chat:stream', handler)
    }
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (settings: unknown) => ipcRenderer.invoke('settings:update', settings)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type PrometheusAPI = typeof api
