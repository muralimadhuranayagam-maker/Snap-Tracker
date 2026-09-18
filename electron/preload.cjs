const { contextBridge, desktopCapturer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isDesktop: true,
  platform: process.platform,
  version: process.versions.electron,
  getScreenStream: async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' },
        audio: false,
      });
      return stream;
    } catch (err) {
      console.error('[Electron Preload] getScreenStream error:', err);
      try {
        const sources = await desktopCapturer.getSources({ types: ['screen'] });
        if (sources.length > 0) {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: sources[0].id,
              },
            },
          });
          return stream;
        }
      } catch (err2) {
        console.error('[Electron Preload] desktopCapturer fallback error:', err2);
      }
    }
    return null;
  },
});

