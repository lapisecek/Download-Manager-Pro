const express = require('express');
const cors = require('cors');
const { addDownload } = require('./downloader.cjs');

const logHistory = [];

function getLogHistory() {
  return logHistory;
}

let currentBoundPort = null;

function getActivePort() {
  return currentBoundPort;
}

function startServer(mainWindow) {
  const app = express();
  app.use(cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (
        origin.startsWith('chrome-extension://') ||
        origin.startsWith('moz-extension://') ||
        origin.startsWith('http://localhost') ||
        origin.startsWith('http://127.0.0.1')
      ) {
        return callback(null, true);
      }
      return callback(new Error('Blocked by CORS'));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type']
  }));
  app.use(express.json());

  const os = require('os');
  const interfaces = os.networkInterfaces();
  let boundAddresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === 'IPv4') {
        boundAddresses.push(net.address);
      }
    }
  }

  // Helper to send logs to frontend
  const sendLog = (msg) => {
    console.log(msg);
    const logEntry = { time: new Date().toLocaleTimeString(), msg };
    logHistory.push(logEntry);
    if (logHistory.length > 2000) logHistory.shift();
    
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('server-log', logEntry);
    }
  };

  // Middleware to log all requests
  app.use((req, res, next) => {
    sendLog(`[HTTP] ${req.method} ${req.url}`);
    next();
  });

  app.post('/api/download', (req, res) => {
    const { url, filename, headers } = req.body || {};
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ success: false, error: 'URL required' });
    }
    const trimmedUrl = url.trim();
    if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
      return res.status(400).json({ success: false, error: 'Only HTTP and HTTPS URLs supported' });
    }

    sendLog(`[DOWNLOAD] Received: ${trimmedUrl}`);
    addDownload(trimmedUrl, filename, headers, mainWindow);
    res.json({ success: true });
  });

  app.get('/api/settings', (req, res) => {
    const store = require('./store.cjs');
    res.json({ urlPrefixes: store.get('urlPrefixes') || [] });
  });

  app.post('/api/heartbeat', (req, res) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('extension-heartbeat', Date.now());
    }
    res.json({ success: true });
  });

  app.post('/api/add-prefix', (req, res) => {
    const { prefix } = req.body;
    if (prefix) {
      const store = require('./store.cjs');
      const current = store.get('urlPrefixes') || [];
      if (!current.includes(prefix)) {
        store.set('urlPrefixes', [...current, prefix]);
        sendLog(`[SETTINGS] Added new prefix from extension: ${prefix}`);
      }
      res.json({ success: true });
    } else {
      res.status(400).json({ success: false });
    }
  });

  app.get('/api/ping', (req, res) => {
    res.json({ veloce: true, dmpro: true });
  });

  const PORTS = [12345, 12346, 12347];
  let portIndex = 0;

  const startListening = () => {
    if (portIndex >= PORTS.length) {
      sendLog(`[SYSTEM] ERROR: Could not bind to any port in ${PORTS.join(', ')}`);
      return;
    }
    const currentPort = PORTS[portIndex];
    const server = app.listen(currentPort, '127.0.0.1', () => {
      currentBoundPort = currentPort;
      sendLog(`[SYSTEM] Starting Veloce Server...`);
      sendLog(`[SYSTEM] Detected local IPv4 addresses: ${boundAddresses.join(', ')}`);
      sendLog(`[SYSTEM] Download receiver server strictly bound to 127.0.0.1:${currentPort}`);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('server-port-bound', currentPort);
      }
    });

    server.on('error', (e) => {
      if (e.code === 'EADDRINUSE') {
        sendLog(`[SYSTEM] Port ${currentPort} is in use, trying next...`);
        portIndex++;
        startListening();
      } else {
        sendLog(`[SYSTEM] Server Error: ${e.message}`);
      }
    });
  };

  startListening();
}

module.exports = { startServer, getLogHistory, getActivePort };
