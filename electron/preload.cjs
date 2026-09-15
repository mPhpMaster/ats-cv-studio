// Exposes a minimal, safe bridge to the renderer (see src/lib/download.ts).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  platform: process.platform,
  saveFile: (name, data) => ipcRenderer.invoke('save-file', { name, data }),
  printToPdf: (name) => ipcRenderer.invoke('print-to-pdf', { name }),
  linkedinImport: (url, options) => ipcRenderer.invoke('linkedin-import', { url, options }),
  aiSettingsGet: () => ipcRenderer.invoke('ai-settings-get'),
  aiSettingsSet: (patch) => ipcRenderer.invoke('ai-settings-set', patch),
  aiComplete: (prompt) => ipcRenderer.invoke('ai-complete', { prompt }),
  aiChat: (messages) => ipcRenderer.invoke('ai-chat', { messages }),
  onLinkedinProgress: (callback) => {
    const handler = (_event, update) => callback(update);
    ipcRenderer.on('linkedin-progress', handler);
    return () => ipcRenderer.removeListener('linkedin-progress', handler);
  },
});
