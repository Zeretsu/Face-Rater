const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    // App version info
    getVersion: () => ipcRenderer.invoke('get-app-version'),
    
    // File operations
    saveAnalysis: (data) => ipcRenderer.invoke('save-analysis', data),
    loadAnalysis: () => ipcRenderer.invoke('load-analysis'),
    
    // Window controls
    minimizeWindow: () => ipcRenderer.send('minimize-window'),
    maximizeWindow: () => ipcRenderer.send('maximize-window'),
    closeWindow: () => ipcRenderer.send('close-window'),
    
    // Settings
    getSettings: () => ipcRenderer.invoke('get-settings'),
    saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
    
    // Export functionality
    exportResults: (data, format) => ipcRenderer.invoke('export-results', data, format),
    
    // Platform info
    getPlatform: () => process.platform
});