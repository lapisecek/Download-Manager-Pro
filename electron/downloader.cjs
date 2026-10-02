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

function sanitizeFilename(filename) {
  if (!filename) return 'downloaded_file';
  let clean = filename;
  try {
    clean = decodeURIComponent(clean);
  } catch {}
  clean = path.basename(clean);
  // eslint-disable-next-line no-control-regex
  clean = clean.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').trim();
  clean = clean.replace(/[. ]+$/, '');
  if (!clean || clean === '.' || clean === '..') clean = 'downloaded_file';
  return clean;
}

function extractFilenameFromHeader(header) {
  if (!header || typeof header !== 'string') return null;
  const utf8Match = header.match(/filename\*=(?:UTF-8'')?([^";\r\n]+)/i);
  if (utf8Match && utf8Match[1]) {
    try {
      return sanitizeFilename(decodeURIComponent(utf8Match[1].replace(/['"]/g, '')));
    } catch {}
  }
  const match = header.match(/filename=(?:["']?)([^";\r\n]+)(?:["']?)/i);
  if (match && match[1]) {
    return sanitizeFilename(match[1].replace(/['"]/g, ''));
  }
  return null;
}

function getSafeFilePath(basePath, filename) {
  const cleanName = sanitizeFilename(filename);
  const ext = path.extname(cleanName);
  const name = path.basename(cleanName, ext);
  let finalPath = path.join(basePath, cleanName);
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
  if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico', '.tiff'].includes(ext)) folder = 'Images';
  else if (['.mp4', '.mkv', '.avi', '.mov', '.webm', '.flv', '.wmv', '.m4v'].includes(ext)) folder = 'Videos';
  else if (['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a', '.wma', '.opus'].includes(ext)) folder = 'Audio';
  else if (['.pdf', '.doc', '.docx', '.txt', '.xlsx', '.csv', '.ppt', '.pptx', '.epub'].includes(ext)) folder = 'Documents';
  else if (['.exe', '.msi', '.zip', '.rar', '.7z', '.tar', '.gz', '.iso', '.dmg', '.apk'].includes(ext)) folder = 'Software';
  
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

async function getFileInfo(url, maxRedirects = 5, signal = null) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) {
      return reject(new Error('Aborted'));
    }
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

    let settled = false;
    const req = client.request(urlObj.href, options, (res) => {
      if (settled) return;
      // Handle HTTP redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        try {
          const nextUrl = new URL(res.headers.location, urlObj.href).href;
          return getFileInfo(nextUrl, maxRedirects - 1, signal).then(resolve).catch(reject);
        } catch (e) {
          settled = true;
          return reject(e);
        }
      }

      const suggestedFilename = extractFilenameFromHeader(res.headers['content-disposition']);

      // If server does not support HEAD (405 Method Not Allowed or 501), fallback to GET range probe
      if (res.statusCode === 405 || res.statusCode === 501) {
        res.resume();
        const getReq = client.request(urlObj.href, {
          method: 'GET',
          headers: { 'Range': 'bytes=0-0', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) DMPro/1.0' }
        }, (getRes) => {
          if (settled) return;
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
          const getSuggested = extractFilenameFromHeader(getRes.headers['content-disposition']);
          settled = true;
          resolve({
            size,
            acceptRanges: getRes.statusCode === 206 || getRes.headers['accept-ranges'] === 'bytes',
            finalUrl: urlObj.href,
            suggestedFilename: getSuggested || suggestedFilename
          });
        });

        if (signal) {
          signal.addEventListener('abort', () => {
            getReq.destroy(new Error('Aborted'));
            if (!settled) {
              settled = true;
              reject(new Error('Aborted'));
            }
          }, { once: true });
        }

        getReq.on('error', (err) => {
          if (!settled) {
            settled = true;
            reject(err);
          }
        });
        getReq.end();
        return;
      }

      const contentLength = res.headers['content-length'];
      const acceptRanges = res.headers['accept-ranges'] === 'bytes';
      res.resume();

      settled = true;
      resolve({
        size: parseInt(contentLength || '0', 10),
        acceptRanges,
        finalUrl: urlObj.href,
        suggestedFilename
      });
    });

    if (signal) {
      signal.addEventListener('abort', () => {
        req.destroy(new Error('Aborted'));
        if (!settled) {
          settled = true;
          reject(new Error('Aborted'));
        }
      }, { once: true });
    }

    req.on('timeout', () => {
      req.destroy(new Error('Connection timed out probing file'));
    });
    req.on('error', (err) => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    });
    req.end();
  });
}

async function addDownload(url, filename, _reqHeaders, mainWindow) {
  const id = generateId();
  let sanitizedName = '';
  if (filename) {
    sanitizedName = sanitizeFilename(filename);
  }
  if (!sanitizedName || sanitizedName === 'downloaded_file') {
    try {
      const urlObj = new URL(url);
      const urlBase = path.basename(urlObj.pathname);
      sanitizedName = sanitizeFilename(urlBase);
    } catch {
      sanitizedName = 'downloaded_file';
    }
  }
  if (!sanitizedName) sanitizedName = 'downloaded_file';

  let downloadPath = store.get('downloadPath') || app.getPath('downloads');
  if (store.get('smartCategorization')) {
    downloadPath = getCategorizedPath(downloadPath, sanitizedName);
  }

  // Ensure download folder exists
  if (!fs.existsSync(downloadPath)) {
    try {
      fs.mkdirSync(downloadPath, { recursive: true });
    } catch {}
  }

  const safeInfo = getSafeFilePath(downloadPath, sanitizedName);
  const finalFilename = safeInfo.newFilename;
  const filePath = safeInfo.finalPath;

  const state = {
    id,
    url,
    filename: finalFilename,
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
    retryTimer: null,
    lastChunkTime: Date.now(),
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
  // Check if state is paused or cancelled before doing anything
  const currentInitial = downloadStates.get(id);
  if (!currentInitial || currentInitial.status === 'paused' || currentInitial.status === 'error' || currentInitial.hidden) {
    return;
  }

  // Clean up any existing active context
  if (activeDownloads.has(id)) {
    const prev = activeDownloads.get(id);
    prev.isManualAbort = true;
    if (prev.abortController) prev.abortController.abort();
    if (prev.throttleTimer) clearTimeout(prev.throttleTimer);
    if (prev.res) prev.res.destroy();
    if (prev.fileStream) prev.fileStream.destroy();
    activeDownloads.delete(id);
  }

  const abortController = new AbortController();
  const downloadContext = {
    req: null,
    res: null,
    fileStream: null,
    isManualAbort: false,
    abortController,
    throttleTimer: null
  };
  activeDownloads.set(id, downloadContext);

  try {
    const probeTarget = state.finalUrl || state.url;
    const info = await getFileInfo(probeTarget, 5, abortController.signal);

    // Check if user paused or cancelled while probing
    if (downloadContext.isManualAbort) {
      activeDownloads.delete(id);
      return;
    }
    const currentAfterProbe = downloadStates.get(id);
    if (!currentAfterProbe || currentAfterProbe.status === 'paused' || currentAfterProbe.status === 'error' || currentAfterProbe.hidden) {
      activeDownloads.delete(id);
      return;
    }

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
          activeDownloads.delete(id);
          updateState(id, { status: 'error', errorMsg: 'Not enough disk space' }, mainWindow, true);
          return;
        }
      }
    } catch {}

    let downloadedBytes = 0;
    const fileExists = fs.existsSync(state.filePath);
    if (fileExists) {
      const existingSize = fs.statSync(state.filePath).size;
      if (info.size > 0 && existingSize === info.size) {
        state.downloadedBytes = existingSize;
        state.progress = 100;
        activeDownloads.delete(id);
        await finishDownload(id, state, mainWindow);
        return;
      }
      if (info.size > 0 && existingSize > info.size) {
        try { fs.unlinkSync(state.filePath); } catch {}
        downloadedBytes = 0;
      } else {
        downloadedBytes = existingSize;
      }
    }

    state.downloadedBytes = downloadedBytes;
    updateState(id, {}, mainWindow, false);

    const client = getClient(state.finalUrl);
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) DMPro/1.0'
    };
    if (downloadedBytes > 0) {
      headers['Range'] = `bytes=${downloadedBytes}-`;
    }

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
        state.lastChunkTime = Date.now();

        // Handle stream backpressure
        if (!fileStream.write(chunk)) {
          res.pause();
          fileStream.once('drain', () => {
            if (!downloadContext.isManualAbort && activeDownloads.has(id) && downloadContext.res) {
              downloadContext.res.resume();
            }
          });
        }

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

        if (downloadContext.isManualAbort) return;

        // Incomplete download check (premature socket termination)
        if (state.totalBytes > 0 && state.downloadedBytes < state.totalBytes) {
          fileStream.end();
          handleRetry(id, state, mainWindow, `Premature stream termination (${state.downloadedBytes}/${state.totalBytes} bytes)`);
          return;
        }

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
    if (downloadContext.isManualAbort) {
      activeDownloads.delete(id);
      return;
    }
    activeDownloads.delete(id);
    handleRetry(id, state, mainWindow, error.message);
  }
}

function handleRetry(id, state, mainWindow, reason = '') {
  const current = downloadStates.get(id);
  if (!current || current.status === 'paused' || current.status === 'error' || current.hidden) {
    return;
  }

  if (state.retries < 3) {
    state.retries++;
    state.status = 'retrying';
    updateState(id, {}, mainWindow, true);
    if (state.retryTimer) clearTimeout(state.retryTimer);
    state.retryTimer = setTimeout(() => {
      state.retryTimer = null;
      const latest = downloadStates.get(id);
      if (latest && latest.status === 'retrying') {
        startDownload(id, latest, mainWindow);
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
    if (download.abortController) download.abortController.abort();
    if (download.throttleTimer) clearTimeout(download.throttleTimer);
    if (download.res) download.res.destroy();
    if (download.fileStream) download.fileStream.end();
    activeDownloads.delete(id);
  }
  const state = downloadStates.get(id);
  if (state) {
    if (state.retryTimer) {
      clearTimeout(state.retryTimer);
      state.retryTimer = null;
    }
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
    if (download.abortController) download.abortController.abort();
    if (download.throttleTimer) clearTimeout(download.throttleTimer);
    if (download.res) download.res.destroy();
    if (download.fileStream) download.fileStream.destroy();
    activeDownloads.delete(id);
  }
  const state = downloadStates.get(id);
  if (state) {
    if (state.retryTimer) {
      clearTimeout(state.retryTimer);
      state.retryTimer = null;
    }
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
  if (!priorityOrder.includes(d.id)) {
    priorityOrder.push(d.id);
  }
});

// Bandwidth Orchestrator with speed decay for stalled transfers
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

  const now = Date.now();
  activeIds.forEach((id, index) => {
    const state = downloadStates.get(id);
    if (!state) return;
    if (index < maxFull) {
      state.currentSpeedLimit = globalLimit;
    } else {
      state.currentSpeedLimit = globalLimit > 0 ? Math.min(globalLimit, throttled) : throttled;
    }

    // Decay speed to 0 if data stalled for over 2 seconds
    if (state.lastChunkTime && (now - state.lastChunkTime > 2000) && state.speed > 0) {
      state.speed = 0;
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
  const download = activeDownloads.get(id);
  if (download) {
    download.isManualAbort = true;
    if (download.abortController) download.abortController.abort();
    if (download.throttleTimer) clearTimeout(download.throttleTimer);
    if (download.res) download.res.destroy();
    if (download.fileStream) download.fileStream.destroy();
    activeDownloads.delete(id);
  }
  const state = downloadStates.get(id);
  if (state) {
    if (state.retryTimer) {
      clearTimeout(state.retryTimer);
      state.retryTimer = null;
    }
    state.hidden = true;
  }
  priorityOrder = priorityOrder.filter(pid => pid !== id);
  updateState(id, {}, mainWindow, true);
}

function deleteFileDownload(id, mainWindow) {
  const download = activeDownloads.get(id);
  if (download) {
    download.isManualAbort = true;
    if (download.abortController) download.abortController.abort();
    if (download.throttleTimer) clearTimeout(download.throttleTimer);
    if (download.res) download.res.destroy();
    if (download.fileStream) download.fileStream.destroy();
    activeDownloads.delete(id);
  }
  const state = downloadStates.get(id);
  if (state) {
    if (state.retryTimer) {
      clearTimeout(state.retryTimer);
      state.retryTimer = null;
    }
    state.hidden = true;
    try {
      if (fs.existsSync(state.filePath)) {
        fs.unlinkSync(state.filePath);
      }
    } catch (e) {
      console.error('Failed to unlink file on delete:', e.message);
    }
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
