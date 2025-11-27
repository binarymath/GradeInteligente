const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('path');

let win;
const isDev = !app.isPackaged;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#f1f5f9',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    }
  });

  win.once('ready-to-show', () => win.show());

  if (isDev) {
    const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    win.loadURL(devUrl);
    // Optional devtools
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(createWindow);
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}

// Optional electron-store IPC bridge
try {
  const Store = require('electron-store');
  const store = new Store({ name: 'grade-settings' });
  ipcMain.handle('grade:get', (_e, key) => store.get(key));
  ipcMain.handle('grade:set', (_e, key, value) => { store.set(key, value); return true; });
  ipcMain.handle('grade:has', (_e, key) => store.has(key));
  ipcMain.handle('grade:delete', (_e, key) => { store.delete(key); return true; });
} catch (e) {
  // electron-store optional
}
