const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isDesktop: true,
  platform: process.platform,
  version: process.versions.electron,
  getScreenStream: async () => {
    try {
      const sources = await ipcRenderer.invoke('GET_SCREEN_SOURCES');
      if (sources && sources.length > 0) {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: sources[0].id,
              minWidth: 1280,
              maxWidth: 1920,
              minHeight: 720,
              maxHeight: 1080,
            },
          },
        });
        return stream;
      }
    } catch (err) {
      console.error('[Electron Preload] Native screen capture error:', err);
    }
    return null;
  },
});

