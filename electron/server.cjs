const express = require('express');
const cors = require('cors');
const { addDownload } = require('./downloader.cjs');

const logHistory = [];

function getLogHistory() {
  return logHistory;
}

function startServer(mainWindow) {
  const app = express();
  app.use(cors({
    origin: '*',
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
    const { url, filename, headers } = req.body;
    if (url) {
      sendLog(`[DOWNLOAD] Received: ${url}`);
      addDownload(url, filename, headers, mainWindow);
      res.json({ success: true });
    } else {
      res.status(400).json({ success: false, error: 'URL required' });
    }
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
    res.json({ dmpro: true });
  });

  const PORTS = [12345, 12346, 12347];
  let portIndex = 0;

  const startListening = () => {
    if (portIndex >= PORTS.length) {
      sendLog(`[SYSTEM] ERROR: Could not bind to any port in ${PORTS.join(', ')}`);
      return;
    }
    const currentPort = PORTS[portIndex];
    const server = app.listen(currentPort, () => {
      sendLog(`[SYSTEM] Starting DM Pro Server...`);
      sendLog(`[SYSTEM] Detected local IPv4 addresses: ${boundAddresses.join(', ')}`);
      sendLog(`[SYSTEM] Download receiver server strictly bound and listening on port ${currentPort}`);
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

module.exports = { startServer, getLogHistory };
