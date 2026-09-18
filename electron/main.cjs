const { app, BrowserWindow, shell, ipcMain, session, Tray, Menu, desktopCapturer } = require('electron');
const path = require('path');
const http = require('http');

let mainWindow = null;
let tray = null;

// Determine if running in development mode
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1380,
    height: 900,
    minWidth: 1080,
    minHeight: 700,
    title: 'SnapServe Tracker',
    backgroundColor: '#09090b',
    autoHideMenuBar: true,
    show: false, // Don't show until ready-to-show to avoid white flash
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
  });

  // Grant microphone, media, and screen permissions natively for Desktop App
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowedPermissions = ['media', 'audioCapture', 'notifications', 'fullscreen', 'displayCapture'];
    if (allowedPermissions.includes(permission)) {
      callback(true);
    } else {
      callback(false);
    }
  });

  if (session.defaultSession.setPermissionCheckHandler) {
    session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
      const allowedPermissions = ['media', 'audioCapture', 'notifications', 'fullscreen', 'displayCapture'];
      return allowedPermissions.includes(permission);
    });
  }

  // Handle getDisplayMedia natively inside Desktop App without browser prompt dialog
  if (session.defaultSession.setDisplayMediaRequestHandler) {
    session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
      desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
        if (sources.length > 0) {
          callback({ video: sources[0] });
        } else {
          callback({});
        }
      }).catch((err) => {
        console.error('[Electron] Native desktop capturer error:', err);
        callback({});
      });
    });
  }

  // Handle IPC request for silent screen capture sources
  ipcMain.removeHandler('GET_SCREEN_SOURCES');
  ipcMain.handle('GET_SCREEN_SOURCES', async () => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen'] });
      return sources.map((s) => ({ id: s.id, name: s.name }));
    } catch (err) {
      console.error('[Electron Main] desktopCapturer.getSources error:', err);
      return [];
    }
  });

  // Open external links in default system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // Load URL
  const devServerUrl = 'http://localhost:5173';
  const productionUrl = process.env.TRACKER_SERVER_URL || 'https://snap-tracker-production.up.railway.app';

  if (isDev) {
    const checkDev = http.get(devServerUrl, () => {
      mainWindow.loadURL(devServerUrl);
    });
    checkDev.on('error', () => {
      // If local dev server isn't running, connect directly to production server
      mainWindow.loadURL(productionUrl);
    });
  } else {
    // In production .exe app, connect to deployed server
    mainWindow.loadURL(productionUrl);
  }

  // Show gracefully when rendered
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Ensure single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
