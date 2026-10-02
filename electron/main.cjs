const { app, BrowserWindow, ipcMain, shell, Tray, Menu, clipboard, dialog, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { startServer, getLogHistory, getActivePort } = require('./server.cjs');
const store = require('./store.cjs');

// Initialize Defaults
const defaults = {
  downloadPath: app.getPath('downloads'),
  urlPrefixes: [],
  maxConnections: 4,
  vtApiKey: '',
  smartCategorization: false,
  osNotifications: true,
  autoClearCompleted: false,
  speedLimit: 0,
  autoStart: false,
  maxFullSpeedDownloads: 2,
  throttledSpeedLimit: 500,
  autoVtScan: false,
  clipboardWatch: true
};

Object.keys(defaults).forEach(key => {
  if (store.get(key) === undefined) store.set(key, defaults[key]);
});

let mainWindow = null;
let tray = null;
let clipboardInterval = null;

function resolveIconPath() {
  const possiblePaths = [
    path.join(__dirname, '../dist/icon.png'),
    path.join(__dirname, '../build/icon.png'),
    path.join(__dirname, '../public/icon.png'),
    path.join(__dirname, '../icon.png')
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  return path.join(__dirname, '../icon.png');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1040,
    height: 720,
    minWidth: 800,
    minHeight: 560,
    frame: false,
    transparent: true,
    backgroundColor: '#0f0f13',
    show: false,
    icon: resolveIconPath(),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    if (mainWindow) mainWindow.show();
  });

  mainWindow.on('close', (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      if (mainWindow) mainWindow.hide();
    }
  });
}

function createTray() {
  try {
    const iconPath = resolveIconPath();
    const icon = nativeImage.createFromPath(iconPath);
    tray = new Tray(icon.isEmpty() ? iconPath : icon);
    const contextMenu = Menu.buildFromTemplate([
      { label: 'Show Veloce DM', click: () => { if (mainWindow) mainWindow.show(); } },
      { type: 'separator' },
      { label: 'Quit', click: () => { app.isQuiting = true; app.quit(); } }
    ]);
    tray.setToolTip('Veloce DM');
    tray.setContextMenu(contextMenu);
    tray.on('click', () => {
      if (mainWindow) {
        if (mainWindow.isVisible()) {
          mainWindow.focus();
        } else {
          mainWindow.show();
        }
      }
    });
  } catch (err) {
    console.error('Failed to create tray icon:', err);
  }
}

function startClipboardMonitor() {
  let lastText = '';
  try {
    lastText = clipboard.readText();
  } catch {}

  clipboardInterval = setInterval(() => {
    try {
      if (store.get('clipboardWatch') === false) return;
      const text = clipboard.readText();
      if (text && text !== lastText) {
        lastText = text;
        const trimmed = text.trim();
        if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
          const prefixes = store.get('urlPrefixes') || [];
          if (prefixes.length > 0 && prefixes.some(p => trimmed.startsWith(p.trim()))) {
            const { addDownload } = require('./downloader.cjs');
            addDownload(trimmed, null, {}, mainWindow);
          }
        }
      }
    } catch {}
  }, 2000);
}

app.whenReady().then(() => {
  createWindow();
  createTray();
  startServer(mainWindow);
  startClipboardMonitor();

  try {
    app.setLoginItemSettings({
      openAtLogin: !!store.get('autoStart'),
      path: app.getPath('exe')
    });
  } catch {}

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else if (mainWindow) mainWindow.show();
  });
});

app.on('before-quit', () => {
  app.isQuiting = true;
  if (clipboardInterval) {
    clearInterval(clipboardInterval);
    clipboardInterval = null;
  }
  store.flush();
});

// Window controls IPC
ipcMain.handle('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  }
});

ipcMain.handle('window-close', () => {
  if (mainWindow) mainWindow.hide();
});

// Settings & Dialog IPC
ipcMain.handle('get-settings', () => store.getAll());

ipcMain.handle('save-settings', (_event, settings) => {
  if (!settings || typeof settings !== 'object') return false;
  store.setMultiple(settings);

  try {
    app.setLoginItemSettings({
      openAtLogin: !!settings.autoStart,
      path: app.getPath('exe')
    });
  } catch {}

  return true;
});

ipcMain.handle('select-download-dir', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Default Download Directory',
    defaultPath: store.get('downloadPath') || app.getPath('downloads'),
    properties: ['openDirectory', 'createDirectory']
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('get-server-logs', () => getLogHistory());
ipcMain.handle('get-server-port', () => getActivePort());
ipcMain.handle('get-downloads', () => store.get('downloads') || []);

// Downloader actions
const {
  addDownload,
  pauseDownload,
  resumeDownload,
  cancelDownload,
  reorderDownloads,
  clearDownload,
  scanFileManual,
  deleteFileDownload
} = require('./downloader.cjs');

ipcMain.handle('add-download', (_event, { url, filename } = {}) => {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return false;
  addDownload(trimmed, filename ? filename.trim() : null, {}, mainWindow);
  return true;
});

ipcMain.handle('pause-download', (_event, id) => pauseDownload(id, mainWindow));
ipcMain.handle('resume-download', (_event, id) => resumeDownload(id, mainWindow));
ipcMain.handle('cancel-download', (_event, id) => cancelDownload(id, mainWindow));
ipcMain.handle('open-folder', (_event, folderPath) => shell.showItemInFolder(folderPath));
ipcMain.handle('reorder-downloads', (_event, orderedIds) => reorderDownloads(orderedIds, mainWindow));
ipcMain.handle('clear-download', (_event, id) => clearDownload(id, mainWindow));
ipcMain.handle('delete-file', (_event, id) => deleteFileDownload(id, mainWindow));
ipcMain.handle('scan-file', (_event, id) => scanFileManual(id, mainWindow));
