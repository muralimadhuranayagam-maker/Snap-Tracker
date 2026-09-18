const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isDesktop: true,
  platform: process.platform,
  version: process.versions.electron,
  getScreenSources: async () => {
    try {
      return await ipcRenderer.invoke('GET_SCREEN_SOURCES');
    } catch (err) {
      console.error('[Electron Preload] GET_SCREEN_SOURCES error:', err);
      return [];
    }
  },
  getScreenSourceId: async () => {
    try {
      const sources = await ipcRenderer.invoke('GET_SCREEN_SOURCES');
      if (sources && sources.length > 0) {
        return sources[0].id;
      }
    } catch (err) {
      console.error('[Electron Preload] getScreenSourceId error:', err);
    }
    return null;
  },
});

