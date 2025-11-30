const { contextBridge, ipcRenderer } = require('electron');

const API = {
  get: (key) => ipcRenderer.invoke('grade:get', key),
  set: (key, value) => ipcRenderer.invoke('grade:set', key, value),
  has: (key) => ipcRenderer.invoke('grade:has', key),
  delete: (key) => ipcRenderer.invoke('grade:delete', key)
};

contextBridge.exposeInMainWorld('grade', API);
