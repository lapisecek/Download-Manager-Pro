const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const store = require('./store.cjs');
const { scanFile } = require('./scanner.cjs');
const { app, Notification } = require('electron');

const activeDownloads = new Map();
const downloadStates = new Map();
let priorityOrder = [];

function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

function broadcastUpdate(mainWindow) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('downloads-updated', Array.from(downloadStates.values()));
  }
}

function updateState(id, data, mainWindow) {
  const state = downloadStates.get(id);
  if (state) {
    Object.assign(state, data);
    store.set('downloads', Array.from(downloadStates.values()));
    broadcastUpdate(mainWindow);
  }
}

function getSafeFilePath(basePath, filename) {
  let ext = path.extname(filename);
  let name = path.basename(filename, ext);
  let finalPath = path.join(basePath, filename);
  let counter = 1;
  while (fs.existsSync(finalPath)) {
    finalPath = path.join(basePath, `${name} (${counter})${ext}`);
    counter++;
  }
  return { finalPath, newFilename: path.basename(finalPath) };
}

function getCategorizedPath(basePath, filename) {
  const ext = path.extname(filename).toLowerCase();
  let folder = '';
  if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) folder = 'Images';
  else if (['.mp4', '.mkv', '.avi', '.mov'].includes(ext)) folder = 'Videos';
  else if (['.pdf', '.doc', '.docx', '.txt'].includes(ext)) folder = 'Documents';
  else if (['.exe', '.msi', '.zip', '.rar'].includes(ext)) folder = 'Software';
  
  if (folder) {
    const catPath = path.join(basePath, folder);
    if (!fs.existsSync(catPath)) fs.mkdirSync(catPath, { recursive: true });
    return catPath;
  }
  return basePath;
}

async function getFileInfo(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.request(url, { method: 'HEAD' }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return getFileInfo(res.headers.location).then(resolve).catch(reject);
      }
      resolve({
        size: parseInt(res.headers['content-length'] || '0', 10),
        acceptRanges: res.headers['accept-ranges'] === 'bytes',
        finalUrl: url
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function addDownload(url, filename, reqHeaders, mainWindow) {
  const id = generateId();
  if (!filename) {
    const urlObj = new URL(url);
    filename = path.basename(urlObj.pathname) || 'downloaded_file';
  }

  let downloadPath = store.get('downloadPath') || app.getPath('downloads');
  
  if (store.get('smartCategorization')) {
    downloadPath = getCategorizedPath(downloadPath, filename);
  }

  // Handle Collision
  const safeInfo = getSafeFilePath(downloadPath, filename);
  filename = safeInfo.newFilename;
  const filePath = safeInfo.finalPath;

  const state = {
    id, url, filename, filePath,
    status: 'starting', 
    progress: 0,
    downloadedBytes: 0,
    totalBytes: 0,
    speed: 0,
    etaSeconds: 0,
    startTime: Date.now(),
    dateFinished: null,
    retries: 0,
    vtStatus: 'none', // none, scanning, clean, malicious, unknown
    vtStats: null,
    currentSpeedLimit: 0
  };

  downloadStates.set(id, state);
  priorityOrder.push(id);
  broadcastUpdate(mainWindow);
  startDownload(id, state, mainWindow);
}

async function startDownload(id, state, mainWindow) {
  try {
    const info = await getFileInfo(state.url);
    state.totalBytes = info.size;
    state.status = 'downloading';
    state.finalUrl = info.finalUrl;
    
    // Check Disk Space (Basic heuristic)
    try {
      const stats = fs.statfsSync(path.dirname(state.filePath));
      const freeSpace = stats.bavail * stats.bsize;
      if (info.size > 0 && freeSpace < info.size) {
        updateState(id, { status: 'error', errorMsg: 'Not enough disk space' }, mainWindow);
        return;
      }
    } catch(e) {} // ignore if not supported

    let downloadedBytes = 0;
    const fileExists = fs.existsSync(state.filePath);
    if (fileExists && info.acceptRanges) {
      downloadedBytes = fs.statSync(state.filePath).size;
      if (downloadedBytes === info.size && info.size > 0) {
        await finishDownload(id, state, mainWindow);
        return;
      }
    } else if (fileExists) {
       fs.unlinkSync(state.filePath);
    }

    state.downloadedBytes = downloadedBytes;
    updateState(id, {}, mainWindow);

    const client = state.finalUrl.startsWith('https') ? https : http;
    const headers = {};
    if (downloadedBytes > 0 && info.acceptRanges) {
      headers['Range'] = `bytes=${downloadedBytes}-`;
    }

    const req = client.get(state.finalUrl, { headers }, (res) => {
      if (res.statusCode >= 400) {
        handleRetry(id, state, mainWindow);
        return;
      }
      
      const fileStream = fs.createWriteStream(state.filePath, { flags: downloadedBytes > 0 ? 'a' : 'w' });
      activeDownloads.set(id, { req, res, fileStream });

      let lastTime = Date.now();
      let lastBytes = downloadedBytes;
      let limitCounter = 0;

      res.on('data', (chunk) => {
        state.downloadedBytes += chunk.length;
        fileStream.write(chunk);

        // Throttle logic
        const speedLimit = state.currentSpeedLimit ?? (store.get('speedLimit') || 0);
        if (speedLimit > 0) {
          limitCounter += chunk.length;
          if (limitCounter > (speedLimit * 1024)) {
            res.pause();
            setTimeout(() => {
              limitCounter = 0;
              res.resume();
            }, 1000);
          }
        }

        const now = Date.now();
        if (now - lastTime > 500) { 
          const diffBytes = state.downloadedBytes - lastBytes;
          const diffTime = (now - lastTime) / 1000;
          state.speed = diffBytes / diffTime;
          state.progress = state.totalBytes ? Math.round((state.downloadedBytes / state.totalBytes) * 100) : 0;
          
          if (state.speed > 0 && state.totalBytes > 0) {
            state.etaSeconds = Math.round((state.totalBytes - state.downloadedBytes) / state.speed);
          } else {
            state.etaSeconds = 0;
          }

          lastBytes = state.downloadedBytes;
          lastTime = now;
          updateState(id, {}, mainWindow);
        }
      });

      res.on('end', () => {
        fileStream.end();
        activeDownloads.delete(id);
        if (state.status === 'downloading') {
           finishDownload(id, state, mainWindow);
        }
      });
    });

    req.on('error', (err) => {
      activeDownloads.delete(id);
      handleRetry(id, state, mainWindow);
    });

  } catch (error) {
    handleRetry(id, state, mainWindow);
  }
}

function handleRetry(id, state, mainWindow) {
  if (state.retries < 3) {
    state.retries++;
    state.status = 'retrying';
    updateState(id, {}, mainWindow);
    setTimeout(() => startDownload(id, state, mainWindow), 3000);
  } else {
    updateState(id, { status: 'error', errorMsg: 'Download failed after 3 retries', dateFinished: new Date().toLocaleString() }, mainWindow);
  }
}

async function finishDownload(id, state, mainWindow) {
  updateState(id, { status: 'completed', progress: 100, speed: 0, etaSeconds: 0, dateFinished: new Date().toLocaleString() }, mainWindow);
  
  if (store.get('osNotifications') && Notification.isSupported()) {
    new Notification({ title: 'Download Complete', body: state.filename }).show();
  }

  // VirusTotal Scan
  if (store.get('autoVtScan')) {
    scanFileManual(id, mainWindow);
  }

  // Auto-Clear
  if (store.get('autoClearCompleted')) {
    setTimeout(() => {
      downloadStates.delete(id);
      store.set('downloads', Array.from(downloadStates.values()));
      broadcastUpdate(mainWindow);
    }, 5000); // clear after 5s for demo purposes
  }
}

function pauseDownload(id, mainWindow) {
  const download = activeDownloads.get(id);
  if (download) {
    download.res.destroy(); 
    download.fileStream.end();
    activeDownloads.delete(id);
  }
  const state = downloadStates.get(id);
  if (state) {
    state.status = 'paused';
    state.speed = 0;
    store.set('downloads', Array.from(downloadStates.values()));
    broadcastUpdate(mainWindow);
  }
}

function resumeDownload(id, mainWindow) {
  const state = downloadStates.get(id);
  if (state && state.status === 'paused') {
    startDownload(id, state, mainWindow);
  }
}

function cancelDownload(id, mainWindow) {
  pauseDownload(id, mainWindow);
  const state = downloadStates.get(id);
  if (state) {
    state.status = 'error'; 
    state.errorMsg = 'Cancelled by user';
    state.dateFinished = new Date().toLocaleString();
    store.set('downloads', Array.from(downloadStates.values()));
    broadcastUpdate(mainWindow);
  }
}

const savedDownloads = store.get('downloads') || [];
savedDownloads.forEach(d => {
  if (d.status === 'downloading' || d.status === 'retrying') d.status = 'paused';
  downloadStates.set(d.id, d);
  priorityOrder.push(d.id);
});

// Bandwidth Orchestrator
setInterval(() => {
  const maxFull = store.get('maxFullSpeedDownloads') || 2;
  const throttled = store.get('throttledSpeedLimit') || 500;
  const globalLimit = store.get('speedLimit') || 0;
  
  const activeIds = Array.from(activeDownloads.keys());
  
  activeIds.sort((a, b) => {
    const indexA = priorityOrder.indexOf(a);
    const indexB = priorityOrder.indexOf(b);
    if (indexA === -1 && indexB === -1) return 0;
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });
  
  activeIds.forEach((id, index) => {
    const state = downloadStates.get(id);
    if (!state) return;
    if (index < maxFull) {
      state.currentSpeedLimit = globalLimit;
    } else {
      state.currentSpeedLimit = globalLimit > 0 ? Math.min(globalLimit, throttled) : throttled;
    }
  });
}, 1000);

async function scanFileManual(id, mainWindow) {
  const state = downloadStates.get(id);
  if (!state || !fs.existsSync(state.filePath)) return;
  
  updateState(id, { vtStatus: 'scanning' }, mainWindow);
  const vtResult = await scanFile(state.filePath);
  if (vtResult.stats) {
    const isMalicious = vtResult.stats.malicious > 0;
    updateState(id, { 
      vtStatus: isMalicious ? 'malicious' : 'clean',
      vtStats: vtResult.stats 
    }, mainWindow);
  } else {
    updateState(id, { vtStatus: 'unknown' }, mainWindow);
  }
}

function reorderDownloads(orderedIds, mainWindow) {
  priorityOrder = orderedIds;
}

function clearDownload(id, mainWindow) {
  const state = downloadStates.get(id);
  if (state) state.hidden = true;
  
  priorityOrder = priorityOrder.filter(pid => pid !== id);
  store.set('downloads', Array.from(downloadStates.values()));
  broadcastUpdate(mainWindow);
}

function deleteFileDownload(id, mainWindow) {
  const state = downloadStates.get(id);
  if (state) {
    state.hidden = true;
    try {
      if (fs.existsSync(state.filePath)) {
        fs.unlinkSync(state.filePath);
      }
    } catch(e) {}
  }
  
  priorityOrder = priorityOrder.filter(pid => pid !== id);
  store.set('downloads', Array.from(downloadStates.values()));
  broadcastUpdate(mainWindow);
}

module.exports = {
  addDownload,
  pauseDownload,
  resumeDownload,
  cancelDownload,
  reorderDownloads,
  clearDownload,
  scanFileManual,
  deleteFileDownload
};
