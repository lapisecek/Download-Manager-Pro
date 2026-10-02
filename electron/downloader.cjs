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

let broadcastTimer = null;
function broadcastUpdate(mainWindow) {
  if (broadcastTimer) return;
  broadcastTimer = setTimeout(() => {
    broadcastTimer = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('downloads-updated', Array.from(downloadStates.values()));
    }
  }, 100);
}

function broadcastUpdateImmediate(mainWindow) {
  if (broadcastTimer) {
    clearTimeout(broadcastTimer);
    broadcastTimer = null;
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('downloads-updated', Array.from(downloadStates.values()));
  }
}

function updateState(id, data, mainWindow, immediatePersist = false) {
  const state = downloadStates.get(id);
  if (state) {
    Object.assign(state, data);
    if (immediatePersist) {
      store.set('downloads', Array.from(downloadStates.values()));
      broadcastUpdateImmediate(mainWindow);
    } else {
      store.setDebounced('downloads', Array.from(downloadStates.values()), 1500);
      broadcastUpdate(mainWindow);
    }
  }
}

function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

function getSafeFilePath(basePath, filename) {
  const ext = path.extname(filename);
  const name = path.basename(filename, ext);
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
  if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'].includes(ext)) folder = 'Images';
  else if (['.mp4', '.mkv', '.avi', '.mov', '.webm', '.flv'].includes(ext)) folder = 'Videos';
  else if (['.pdf', '.doc', '.docx', '.txt', '.xlsx', '.csv', '.ppt', '.pptx'].includes(ext)) folder = 'Documents';
  else if (['.exe', '.msi', '.zip', '.rar', '.7z', '.tar', '.gz', '.iso'].includes(ext)) folder = 'Software';
  
  if (folder) {
    const catPath = path.join(basePath, folder);
    if (!fs.existsSync(catPath)) {
      try {
        fs.mkdirSync(catPath, { recursive: true });
      } catch {
        return basePath;
      }
    }
    return catPath;
  }
  return basePath;
}

function getClient(urlStr) {
  return urlStr.startsWith('https:') ? https : http;
}

async function getFileInfo(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) {
      return reject(new Error('Too many redirects while probing file headers'));
    }

    let urlObj;
    try {
      urlObj = new URL(url);
    } catch (urlErr) {
      return reject(urlErr);
    }

    const client = getClient(urlObj.href);
    const options = {
      method: 'HEAD',
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) DMPro/1.0'
      }
    };

    const req = client.request(urlObj.href, options, (res) => {
      // Handle HTTP redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        try {
          const nextUrl = new URL(res.headers.location, urlObj.href).href;
          return getFileInfo(nextUrl, maxRedirects - 1).then(resolve).catch(reject);
        } catch (e) {
          return reject(e);
        }
      }

      // If server does not support HEAD (405 Method Not Allowed or 403), fallback to GET range probe
      if (res.statusCode === 405 || res.statusCode === 501) {
        res.resume();
        const getReq = client.request(urlObj.href, {
          method: 'GET',
          headers: { 'Range': 'bytes=0-0', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) DMPro/1.0' }
        }, (getRes) => {
          getRes.resume();
          const contentRange = getRes.headers['content-range'];
          let size = 0;
          if (contentRange) {
            const match = contentRange.match(/\/(\d+)/);
            if (match) size = parseInt(match[1], 10);
          }
          if (!size && getRes.headers['content-length']) {
            size = parseInt(getRes.headers['content-length'], 10);
          }
          resolve({
            size,
            acceptRanges: getRes.statusCode === 206 || getRes.headers['accept-ranges'] === 'bytes',
            finalUrl: urlObj.href
          });
        });
        getReq.on('error', reject);
        getReq.end();
        return;
      }

      const contentLength = res.headers['content-length'];
      const acceptRanges = res.headers['accept-ranges'] === 'bytes';
      res.resume();

      resolve({
        size: parseInt(contentLength || '0', 10),
        acceptRanges,
        finalUrl: urlObj.href
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error('Connection timed out probing file'));
    });
    req.on('error', reject);
    req.end();
  });
}

async function addDownload(url, filename, _reqHeaders, mainWindow) {
  const id = generateId();
  if (!filename) {
    try {
      const urlObj = new URL(url);
      filename = path.basename(urlObj.pathname) || 'downloaded_file';
      if (!filename || filename === '/') filename = 'downloaded_file';
    } catch {
      filename = 'downloaded_file';
    }
  }

  let downloadPath = store.get('downloadPath') || app.getPath('downloads');
  if (store.get('smartCategorization')) {
    downloadPath = getCategorizedPath(downloadPath, filename);
  }

  // Ensure download folder exists
  if (!fs.existsSync(downloadPath)) {
    try {
      fs.mkdirSync(downloadPath, { recursive: true });
    } catch {}
  }

  const safeInfo = getSafeFilePath(downloadPath, filename);
  filename = safeInfo.newFilename;
  const filePath = safeInfo.finalPath;

  const state = {
    id,
    url,
    filename,
    filePath,
    status: 'starting',
    progress: 0,
    downloadedBytes: 0,
    totalBytes: 0,
    speed: 0,
    etaSeconds: 0,
    startTime: Date.now(),
    dateFinished: null,
    retries: 0,
    vtStatus: 'none',
    vtStats: null,
    currentSpeedLimit: 0,
    errorMsg: null,
    hidden: false
  };

  downloadStates.set(id, state);
  priorityOrder.push(id);
  updateState(id, {}, mainWindow, true);
  startDownload(id, state, mainWindow);
}

async function startDownload(id, state, mainWindow, redirectHops = 5) {
  try {
    const info = await getFileInfo(state.url);
    state.totalBytes = info.size || state.totalBytes;
    state.status = 'downloading';
    state.finalUrl = info.finalUrl;
    state.errorMsg = null;

    // Check Disk Space (Safe check)
    try {
      if (fs.statfsSync) {
        const stats = fs.statfsSync(path.dirname(state.filePath));
        const freeSpace = stats.bavail * stats.bsize;
        if (info.size > 0 && freeSpace < info.size) {
          updateState(id, { status: 'error', errorMsg: 'Not enough disk space' }, mainWindow, true);
          return;
        }
      }
    } catch {}

    let downloadedBytes = 0;
    const fileExists = fs.existsSync(state.filePath);
    if (fileExists && info.acceptRanges) {
      downloadedBytes = fs.statSync(state.filePath).size;
      if (info.size > 0 && downloadedBytes === info.size) {
        state.downloadedBytes = downloadedBytes;
        state.progress = 100;
        await finishDownload(id, state, mainWindow);
        return;
      }
      if (info.size > 0 && downloadedBytes > info.size) {
        fs.unlinkSync(state.filePath);
        downloadedBytes = 0;
      }
    } else if (fileExists && !info.acceptRanges) {
      fs.unlinkSync(state.filePath);
      downloadedBytes = 0;
    }

    state.downloadedBytes = downloadedBytes;
    updateState(id, {}, mainWindow, false);

    const client = getClient(state.finalUrl);
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) DMPro/1.0'
    };
    if (downloadedBytes > 0 && info.acceptRanges) {
      headers['Range'] = `bytes=${downloadedBytes}-`;
    }

    const downloadContext = {
      req: null,
      res: null,
      fileStream: null,
      isManualAbort: false,
      throttleTimer: null
    };
    activeDownloads.set(id, downloadContext);

    const req = client.get(state.finalUrl, { headers }, (res) => {
      downloadContext.res = res;

      // Handle redirect during GET
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        activeDownloads.delete(id);
        if (redirectHops <= 0) {
          updateState(id, { status: 'error', errorMsg: 'Too many redirects' }, mainWindow, true);
          return;
        }
        try {
          state.finalUrl = new URL(res.headers.location, state.finalUrl).href;
          startDownload(id, state, mainWindow, redirectHops - 1);
          return;
        } catch (err) {
          updateState(id, { status: 'error', errorMsg: `Redirect failed: ${err.message}` }, mainWindow, true);
          return;
        }
      }

      if (res.statusCode >= 400) {
        res.resume();
        activeDownloads.delete(id);
        handleRetry(id, state, mainWindow, `HTTP ${res.statusCode}`);
        return;
      }

      // If server returned 200 OK instead of 206 Partial Content, reset download to start
      let isResume = res.statusCode === 206 && downloadedBytes > 0;
      if (!isResume && downloadedBytes > 0) {
        downloadedBytes = 0;
        state.downloadedBytes = 0;
      }

      const fileStream = fs.createWriteStream(state.filePath, { flags: isResume ? 'a' : 'w' });
      downloadContext.fileStream = fileStream;

      fileStream.on('error', (fsErr) => {
        downloadContext.isManualAbort = true;
        if (downloadContext.res) downloadContext.res.destroy();
        activeDownloads.delete(id);
        updateState(id, { status: 'error', errorMsg: `File write error: ${fsErr.message}` }, mainWindow, true);
      });

      let lastTime = Date.now();
      let lastBytes = downloadedBytes;
      let limitCounter = 0;

      res.on('data', (chunk) => {
        state.downloadedBytes += chunk.length;
        fileStream.write(chunk);

        // Smooth Bandwidth Throttling
        const speedLimit = state.currentSpeedLimit || (store.get('speedLimit') || 0);
        if (speedLimit > 0) {
          limitCounter += chunk.length;
          const maxChunkAllowance = speedLimit * 1024;
          if (limitCounter >= maxChunkAllowance) {
            res.pause();
            downloadContext.throttleTimer = setTimeout(() => {
              limitCounter = 0;
              if (activeDownloads.has(id) && !downloadContext.isManualAbort && downloadContext.res) {
                downloadContext.res.resume();
              }
            }, 1000);
          }
        }

        const now = Date.now();
        if (now - lastTime >= 400) {
          const diffBytes = state.downloadedBytes - lastBytes;
          const diffTime = (now - lastTime) / 1000;
          state.speed = diffTime > 0 ? Math.round(diffBytes / diffTime) : 0;
          state.progress = state.totalBytes ? Math.min(100, Math.round((state.downloadedBytes / state.totalBytes) * 100)) : 0;

          if (state.speed > 0 && state.totalBytes > state.downloadedBytes) {
            state.etaSeconds = Math.round((state.totalBytes - state.downloadedBytes) / state.speed);
          } else {
            state.etaSeconds = 0;
          }

          lastBytes = state.downloadedBytes;
          lastTime = now;
          updateState(id, {}, mainWindow, false);
        }
      });

      res.on('end', () => {
        if (downloadContext.throttleTimer) clearTimeout(downloadContext.throttleTimer);
        activeDownloads.delete(id);

        fileStream.end();
        fileStream.on('finish', () => {
          if (state.status === 'downloading') {
            finishDownload(id, state, mainWindow);
          }
        });
      });

      res.on('error', (_err) => {
        if (downloadContext.isManualAbort) return;
        activeDownloads.delete(id);
        handleRetry(id, state, mainWindow, 'Stream error');
      });
    });

    downloadContext.req = req;

    req.on('error', (_err) => {
      if (downloadContext.isManualAbort) return;
      activeDownloads.delete(id);
      handleRetry(id, state, mainWindow, 'Network connection error');
    });

  } catch (error) {
    handleRetry(id, state, mainWindow, error.message);
  }
}

function handleRetry(id, state, mainWindow, reason = '') {
  if (state.retries < 3) {
    state.retries++;
    state.status = 'retrying';
    updateState(id, {}, mainWindow, true);
    setTimeout(() => {
      const current = downloadStates.get(id);
      if (current && current.status === 'retrying') {
        startDownload(id, current, mainWindow);
      }
    }, 3000);
  } else {
    updateState(id, {
      status: 'error',
      errorMsg: reason ? `Download failed: ${reason}` : 'Download failed after 3 retries',
      dateFinished: new Date().toLocaleString()
    }, mainWindow, true);
  }
}

async function finishDownload(id, state, mainWindow) {
  updateState(id, {
    status: 'completed',
    progress: 100,
    speed: 0,
    etaSeconds: 0,
    dateFinished: new Date().toLocaleString()
  }, mainWindow, true);

  if (store.get('osNotifications') && Notification.isSupported()) {
    try {
      new Notification({ title: 'Download Complete', body: state.filename }).show();
    } catch {}
  }

  if (store.get('autoVtScan')) {
    scanFileManual(id, mainWindow);
  }

  if (store.get('autoClearCompleted')) {
    setTimeout(() => {
      const current = downloadStates.get(id);
      if (current && current.status === 'completed') {
        current.hidden = true;
        priorityOrder = priorityOrder.filter(pid => pid !== id);
        updateState(id, {}, mainWindow, true);
      }
    }, 5000);
  }
}

function pauseDownload(id, mainWindow) {
  const download = activeDownloads.get(id);
  if (download) {
    download.isManualAbort = true;
    if (download.throttleTimer) clearTimeout(download.throttleTimer);
    if (download.res) download.res.destroy();
    if (download.fileStream) download.fileStream.end();
    activeDownloads.delete(id);
  }
  const state = downloadStates.get(id);
  if (state) {
    state.status = 'paused';
    state.speed = 0;
    state.etaSeconds = 0;
    updateState(id, {}, mainWindow, true);
  }
}

function resumeDownload(id, mainWindow) {
  const state = downloadStates.get(id);
  if (state && (state.status === 'paused' || state.status === 'error')) {
    state.status = 'starting';
    state.retries = 0;
    updateState(id, {}, mainWindow, true);
    startDownload(id, state, mainWindow);
  }
}

function cancelDownload(id, mainWindow) {
  const download = activeDownloads.get(id);
  if (download) {
    download.isManualAbort = true;
    if (download.throttleTimer) clearTimeout(download.throttleTimer);
    if (download.res) download.res.destroy();
    if (download.fileStream) download.fileStream.end();
    activeDownloads.delete(id);
  }
  const state = downloadStates.get(id);
  if (state) {
    state.status = 'error';
    state.errorMsg = 'Cancelled by user';
    state.speed = 0;
    state.etaSeconds = 0;
    state.dateFinished = new Date().toLocaleString();
    updateState(id, {}, mainWindow, true);
  }
}

const savedDownloads = store.get('downloads') || [];
savedDownloads.forEach(d => {
  if (d.status === 'downloading' || d.status === 'retrying' || d.status === 'starting') {
    d.status = 'paused';
    d.speed = 0;
    d.etaSeconds = 0;
  }
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

  updateState(id, { vtStatus: 'scanning' }, mainWindow, true);
  const vtResult = await scanFile(state.filePath);
  if (vtResult && vtResult.stats) {
    if (vtResult.stats.not_found) {
      updateState(id, {
        vtStatus: 'unknown',
        vtStats: null
      }, mainWindow, true);
    } else {
      const isMalicious = (vtResult.stats.malicious || 0) > 0;
      updateState(id, {
        vtStatus: isMalicious ? 'malicious' : 'clean',
        vtStats: vtResult.stats
      }, mainWindow, true);
    }
  } else {
    updateState(id, { vtStatus: 'unknown' }, mainWindow, true);
  }
}

function reorderDownloads(orderedIds, _mainWindow) {
  priorityOrder = orderedIds;
}

function clearDownload(id, mainWindow) {
  const state = downloadStates.get(id);
  if (state) state.hidden = true;
  priorityOrder = priorityOrder.filter(pid => pid !== id);
  updateState(id, {}, mainWindow, true);
}

function deleteFileDownload(id, mainWindow) {
  const state = downloadStates.get(id);
  if (state) {
    state.hidden = true;
    try {
      if (fs.existsSync(state.filePath)) {
        fs.unlinkSync(state.filePath);
      }
    } catch {}
  }
  priorityOrder = priorityOrder.filter(pid => pid !== id);
  updateState(id, {}, mainWindow, true);
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
