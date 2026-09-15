const { app, BrowserWindow, shell, ipcMain, session, Tray, Menu } = require('electron');
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

  // Grant microphone and media permissions for Team Live Chat voice recording & WebRTC
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowedPermissions = ['media', 'audioCapture', 'notifications', 'fullscreen'];
    if (allowedPermissions.includes(permission)) {
      callback(true);
    } else {
      callback(false);
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

  if (isDev) {
    mainWindow.loadURL(devServerUrl);
    // Open DevTools in dev mode if desired (commented out by default)
    // mainWindow.webContents.openDevTools();
  } else {
    // Check if localhost dev server or local backend is running, otherwise load static index.html
    const checkServer = http.get(devServerUrl, () => {
      mainWindow.loadURL(devServerUrl);
    });

    checkServer.on('error', () => {
      // Fallback to local static build
      const indexPath = path.join(__dirname, '..', 'frontend', 'dist', 'index.html');
      mainWindow.loadFile(indexPath).catch(() => {
        mainWindow.loadURL(devServerUrl);
      });
    });
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
