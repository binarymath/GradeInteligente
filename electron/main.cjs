const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('path');
// electron-store is ESM in v11+, use dynamic import to avoid ERR_REQUIRE_ESM

let win;
const isDev = !app.isPackaged;
let storePromise;
function getStore() {
  if (!storePromise) {
    storePromise = import('electron-store').then(mod => {
      const Store = mod.default || mod;
      return new Store({ name: 'grade-data-clean' });
    }).catch(err => {
      console.error('Failed to load electron-store:', err);
      // Fallback shim (no persistence) to avoid crashes
      return {
        get: () => undefined,
        set: () => { },
        has: () => false,
        delete: () => { }
      };
    });
  }
  return storePromise;
}

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
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    const indexPath = path.join(app.getAppPath(), 'dist', 'index.html');
    win.loadFile(indexPath);
    // win.webContents.openDevTools(); // Removed as requested
    win.webContents.on('did-fail-load', (_e, ec, desc, url) => {
      console.error('Load failed', { ec, desc, url, indexPath });
    });
    win.webContents.on('crashed', () => {
      console.error('Renderer crashed');
    });
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

// Register IPC handlers for persistence
ipcMain.handle('grade:get', async (_e, key) => (await getStore()).get(key));
ipcMain.handle('grade:set', async (_e, key, value) => { (await getStore()).set(key, value); return true; });
ipcMain.handle('grade:has', async (_e, key) => (await getStore()).has(key));
ipcMain.handle('grade:delete', async (_e, key) => { (await getStore()).delete(key); return true; });
