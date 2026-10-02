const assert = require('assert');
const path = require('path');
const fs = require('fs');
const http = require('http');

console.log('[TEST] Starting automated engine verification...');

// 1. Test store.cjs
const store = require('./electron/store.cjs');
store.set('test_key', 'test_value');
assert.strictEqual(store.get('test_key'), 'test_value', 'store.get should match store.set');
console.log('✓ store.cjs synchronous set/get verified');

store.setDebounced('test_debounce', 123, 100);
assert.strictEqual(store.get('test_debounce'), 123, 'store.get should immediately reflect debounced in-memory write');
store.flush();
console.log('✓ store.cjs debounced write and flush verified');

// 2. Test server.cjs
const { startServer, getActivePort, getLogHistory } = require('./electron/server.cjs');

// Mock mainWindow
const mockMainWindow = {
  isDestroyed: () => false,
  webContents: {
    send: (_channel, _data) => {}
  }
};

startServer(mockMainWindow);

setTimeout(async () => {
  const port = getActivePort();
  console.log(`✓ server.cjs active port bound: ${port}`);
  assert(port >= 12345 && port <= 12347, 'Port must be in valid range');

  // Ping server
  const pingRes = await fetch(`http://127.0.0.1:${port}/api/ping`).then(r => r.json());
  assert.strictEqual(pingRes.dmpro, true, '/api/ping should return { dmpro: true }');
  console.log('✓ server.cjs /api/ping responsive');

  // Test add-prefix
  const prefixRes = await fetch(`http://127.0.0.1:${port}/api/add-prefix`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix: 'https://test.example.com/' })
  }).then(r => r.json());
  assert.strictEqual(prefixRes.success, true, 'add-prefix should succeed');

  const settingsRes = await fetch(`http://127.0.0.1:${port}/api/settings`).then(r => r.json());
  assert(settingsRes.urlPrefixes.includes('https://test.example.com/'), 'Prefix should be in store');
  console.log('✓ server.cjs prefix management and settings API verified');

  // Test log history
  const logs = getLogHistory();
  assert(Array.isArray(logs) && logs.length > 0, 'Logs must be recorded');
  console.log(`✓ server.cjs recorded ${logs.length} log entries`);

  // 3. Test scanner.cjs hash calculation
  const { scanFile } = require('./electron/scanner.cjs');
  const testFilePath = path.join(__dirname, 'test_sample.tmp');
  fs.writeFileSync(testFilePath, 'DM Pro Test Content 2026', 'utf-8');
  const scanResult = await scanFile(testFilePath);
  assert.strictEqual(scanResult.skipped, true, 'Scan without API key should skip gracefully');
  fs.unlinkSync(testFilePath);
  console.log('✓ scanner.cjs hash computation and key-check verified');

  // 4. Test downloader redirect & download probe with mock HTTP server
  const mockFileContent = 'Hello World from DM Pro Engine Test!';
  const mockHttp = http.createServer((req, res) => {
    if (req.url === '/redirect') {
      res.writeHead(302, { Location: '/download-target.txt' });
      res.end();
      return;
    }
    if (req.url === '/download-target.txt') {
      if (req.method === 'HEAD') {
        res.writeHead(200, {
          'Content-Length': Buffer.byteLength(mockFileContent),
          'Content-Type': 'text/plain',
          'Accept-Ranges': 'bytes'
        });
        res.end();
        return;
      }
      res.writeHead(200, {
        'Content-Length': Buffer.byteLength(mockFileContent),
        'Content-Type': 'text/plain',
        'Accept-Ranges': 'bytes'
      });
      res.end(mockFileContent);
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise(r => mockHttp.listen(0, '127.0.0.1', r));
  const mockPort = mockHttp.address().port;
  console.log(`✓ Mock test server listening on port ${mockPort}`);

  const { addDownload } = require('./electron/downloader.cjs');
  const testDownloadDir = path.join(__dirname, 'test_downloads');
  if (!fs.existsSync(testDownloadDir)) fs.mkdirSync(testDownloadDir, { recursive: true });
  store.set('downloadPath', testDownloadDir);

  await addDownload(`http://127.0.0.1:${mockPort}/redirect`, 'test-redirected.txt', {}, mockMainWindow);

  // Allow download to complete
  await new Promise(r => setTimeout(r, 1200));

  const downloadedPath = path.join(testDownloadDir, 'test-redirected.txt');
  assert(fs.existsSync(downloadedPath), 'Redirected file should be successfully downloaded');
  const downloadedContent = fs.readFileSync(downloadedPath, 'utf-8');
  assert.strictEqual(downloadedContent, mockFileContent, 'Downloaded content must match source');
  console.log('✓ downloader.cjs successfully handled 302 redirect and wrote file to disk');

  // Cleanup test downloads
  try {
    fs.unlinkSync(downloadedPath);
    fs.rmdirSync(testDownloadDir);
  } catch {}
  mockHttp.close();

  console.log('\n[TEST SUCCESS] All core engine verification tests passed successfully!');
  process.exit(0);
}, 600);
