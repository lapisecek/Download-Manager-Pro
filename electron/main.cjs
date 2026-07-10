const { app, BrowserWindow, ipcMain, shell, Tray, Menu, clipboard } = require('electron');
const path = require('path');
const { startServer } = require('./server.cjs');
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
  autoVtScan: false
};
Object.keys(defaults).forEach(key => {
  if (store.get(key) === undefined) store.set(key, defaults[key]);
});

let mainWindow;
let tray = null;
let clipboardInterval;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    frame: false,
    transparent: true,
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

  mainWindow.on('close', (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  tray = new Tray(path.join(__dirname, '../dist/icon.png')); 
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show App', click: () => mainWindow.show() },
    { label: 'Quit', click: () => { app.isQuiting = true; app.quit(); } }
  ]);
  tray.setToolTip('DM Pro');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => mainWindow.show());
}

function startClipboardMonitor() {
  let lastText = clipboard.readText();
  clipboardInterval = setInterval(() => {
    const text = clipboard.readText();
    if (text !== lastText) {
      lastText = text;
      const prefixes = store.get('urlPrefixes') || [];
      if (prefixes.some(p => text.startsWith(p))) {
        // Found matching URL
        const { addDownload } = require('./downloader.cjs');
        addDownload(text, null, {}, mainWindow);
      }
    }
  }, 2000);
}

app.whenReady().then(() => {
  createWindow();
  createTray();
  startServer(mainWindow);
  startClipboardMonitor();

  // Auto-Start
  app.setLoginItemSettings({
    openAtLogin: store.get('autoStart'),
    path: app.getPath('exe')
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Window controls IPC
ipcMain.handle('window-minimize', () => { if (mainWindow) mainWindow.minimize(); });
ipcMain.handle('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  }
});
ipcMain.handle('window-close', () => { if (mainWindow) mainWindow.hide(); });

// Settings IPC
ipcMain.handle('get-settings', () => store.getAll());
ipcMain.handle('save-settings', (event, settings) => {
  Object.keys(settings).forEach(key => store.set(key, settings[key]));
  
  app.setLoginItemSettings({
    openAtLogin: settings.autoStart,
    path: app.getPath('exe')
  });
  return true;
});

ipcMain.handle('get-downloads', () => store.get('downloads') || []);

// Downloader actions
const { pauseDownload, resumeDownload, cancelDownload, reorderDownloads, clearDownload, scanFileManual, deleteFileDownload } = require('./downloader.cjs');
ipcMain.handle('pause-download', (event, id) => pauseDownload(id, mainWindow));
ipcMain.handle('resume-download', (event, id) => resumeDownload(id, mainWindow));
ipcMain.handle('cancel-download', (event, id) => cancelDownload(id, mainWindow));
ipcMain.handle('open-folder', (event, folderPath) => shell.showItemInFolder(folderPath));
ipcMain.handle('reorder-downloads', (event, orderedIds) => reorderDownloads(orderedIds, mainWindow));
ipcMain.handle('clear-download', (event, id) => clearDownload(id, mainWindow));
ipcMain.handle('delete-file', (event, id) => deleteFileDownload(id, mainWindow));
ipcMain.handle('scan-file', (event, id) => scanFileManual(id, mainWindow));
