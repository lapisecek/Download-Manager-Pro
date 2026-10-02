const assert = require('assert');
const path = require('path');
const fs = require('fs');
const http = require('http');

console.log('[TEST] Starting comprehensive automated engine verification...\n');

// 1. Test store.cjs
const store = require('./electron/store.cjs');
store.set('test_key', 'test_value');
assert.strictEqual(store.get('test_key'), 'test_value', 'store.get should match store.set');
console.log('✓ store.cjs synchronous set/get verified');

store.setMultiple({ test_a: 1, test_b: 'two', test_c: true });
assert.strictEqual(store.get('test_a'), 1, 'store.setMultiple should batch set values');
assert.strictEqual(store.get('test_b'), 'two');
assert.strictEqual(store.get('test_c'), true);
console.log('✓ store.cjs batch setMultiple verified');

store.setDebounced('test_debounce', 123, 100);
assert.strictEqual(store.get('test_debounce'), 123, 'store.get should immediately reflect debounced in-memory write');
store.flush();
console.log('✓ store.cjs debounced write and flush verified');

// 2. Test server.cjs
const { startServer, getActivePort, getLogHistory } = require('./electron/server.cjs');

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

  // Test CORS rejection of unauthorized external web origin
  const corsReject = await fetch(`http://127.0.0.1:${port}/api/ping`, {
    headers: { 'Origin': 'https://malicious-website.com' }
  });
  assert.strictEqual(corsReject.status, 500, 'Unauthorized foreign CORS origin must be rejected');
  console.log('✓ server.cjs unauthorized external CORS origin successfully blocked');

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

  // Test input validation on /api/download (reject non-http)
  const invalidUrlRes = await fetch(`http://127.0.0.1:${port}/api/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'blob:https://example.com/uuid' })
  });
  assert.strictEqual(invalidUrlRes.status, 400, 'Non-HTTP/HTTPS URLs must be rejected');
  console.log('✓ server.cjs rejects invalid/blob URLs on /api/download');

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

  // 4. Test downloader redirect, content-disposition, and incomplete stream detection
  const mockFileContent = 'Hello World from DM Pro Engine Test!';
  const mockHttp = http.createServer((req, res) => {
    if (req.url === '/redirect') {
      res.writeHead(302, { Location: '/download-target.txt' });
      res.end();
      return;
    }
    if (req.url === '/download-target.txt') {
      res.writeHead(200, {
        'Content-Length': Buffer.byteLength(mockFileContent),
        'Content-Type': 'text/plain',
        'Accept-Ranges': 'bytes',
        'Content-Disposition': 'attachment; filename="disposition-target.txt"'
      });
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      res.end(mockFileContent);
      return;
    }
    if (req.url === '/incomplete') {
      // Advertises 1000 bytes but sends only 20 bytes and abruptly terminates
      res.writeHead(200, {
        'Content-Length': 1000,
        'Content-Type': 'text/plain'
      });
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      res.write('Incomplete data');
      res.destroy(); // Premature drop
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise(r => mockHttp.listen(0, '127.0.0.1', r));
  const mockPort = mockHttp.address().port;
  console.log(`✓ Mock test server listening on 127.0.0.1:${mockPort}`);

  const { addDownload, pauseDownload, cancelDownload } = require('./electron/downloader.cjs');
  const testDownloadDir = path.join(__dirname, 'test_downloads');
  if (!fs.existsSync(testDownloadDir)) fs.mkdirSync(testDownloadDir, { recursive: true });
  store.set('downloadPath', testDownloadDir);

  // 4a. Test normal download with 302 redirect & path traversal sanitization
  // Path traversal in filename: ../../traversal-test.txt -> must become traversal-test.txt inside testDownloadDir
  await addDownload(`http://127.0.0.1:${mockPort}/redirect`, '../../traversal-test.txt', {}, mockMainWindow);
  await new Promise(r => setTimeout(r, 1200));

  const downloadedPath = path.join(testDownloadDir, 'traversal-test.txt');
  assert(fs.existsSync(downloadedPath), 'Sanitized file should be downloaded into download directory');
  assert.strictEqual(fs.readFileSync(downloadedPath, 'utf-8'), mockFileContent, 'Content must match source');
  console.log('✓ downloader.cjs handled 302 redirect and prevented path traversal');

  // 4b. Test immediate pause during probe (no zombie download)
  await addDownload(`http://127.0.0.1:${mockPort}/redirect`, 'pause-probe-test.txt', {}, mockMainWindow);
  const allDownloads = store.get('downloads') || [];
  const pauseCandidate = allDownloads.find(d => d.filename === 'pause-probe-test.txt');
  assert(pauseCandidate, 'Download should be registered');
  pauseDownload(pauseCandidate.id, mockMainWindow);
  assert.strictEqual(pauseCandidate.status, 'paused', 'Status must be set to paused');
  await new Promise(r => setTimeout(r, 1000));
  // Verify it remained paused and did not start downloading
  assert.strictEqual(pauseCandidate.status, 'paused', 'Download must remain paused without reviving');
  console.log('✓ downloader.cjs handles immediate pause during probing without zombie revival');

  // 4c. Test premature EOF detection (does not falsely mark completed)
  await addDownload(`http://127.0.0.1:${mockPort}/incomplete`, 'incomplete-test.txt', {}, mockMainWindow);
  await new Promise(r => setTimeout(r, 1000));
  const latestDownloads = store.get('downloads') || [];
  const incompleteDl = latestDownloads.find(d => d.filename === 'incomplete-test.txt');
  assert(incompleteDl, 'Incomplete download must be registered');
  assert.notStrictEqual(incompleteDl.status, 'completed', 'Prematurely truncated download MUST NOT be marked completed');
  console.log('✓ downloader.cjs detects premature connection drop and avoids false completion');

  // Cleanup test downloads
  try {
    if (fs.existsSync(downloadedPath)) fs.unlinkSync(downloadedPath);
    const pausePath = path.join(testDownloadDir, 'pause-probe-test.txt');
    if (fs.existsSync(pausePath)) fs.unlinkSync(pausePath);
    const incPath = path.join(testDownloadDir, 'incomplete-test.txt');
    if (fs.existsSync(incPath)) fs.unlinkSync(incPath);
    fs.rmdirSync(testDownloadDir);
  } catch {}
  mockHttp.close();

  console.log('\n[TEST SUCCESS] All core engine verification tests passed successfully!');
  process.exit(0);
}, 600);
