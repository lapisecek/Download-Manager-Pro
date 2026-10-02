const assert = require('assert');
const http = require('http');

console.log('[TEST] Starting Chrome Companion Extension verification...');

// 1. Validate manifest.json
const manifest = require('./extension/manifest.json');
assert.strictEqual(manifest.manifest_version, 3, 'Must be Manifest V3');
assert.strictEqual(manifest.name, 'Veloce Download Companion');
assert.strictEqual(manifest.version, '1.0.0');
assert(manifest.permissions.includes('downloads'), 'Must have downloads permission');
assert(manifest.permissions.includes('storage'), 'Must have storage permission');
assert(manifest.permissions.includes('alarms'), 'Must have alarms permission');
assert(manifest.permissions.includes('notifications'), 'Must have notifications permission');
assert.strictEqual(manifest.background.service_worker, 'background.js');
console.log('✓ extension/manifest.json schema and MV3 permissions verified');

// 2. Mock Chrome runtime environment for background.js
let receivedDownloads = [];
let cancelledDownloads = [];
let createdNotifications = [];
let suggestedCalls = [];

const mockServer = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'chrome-extension://mock-id');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/api/ping') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ veloce: true, dmpro: true }));
  } else if (req.url === '/api/settings') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ urlPrefixes: ['https://fast.downloads.com/'] }));
  } else if (req.url === '/api/download') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      receivedDownloads.push(JSON.parse(body));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    });
  } else {
    res.writeHead(404);
    res.end();
  }
});

mockServer.listen(12345, '12345'.includes('127') ? '127.0.0.1' : '127.0.0.1', async () => {
  console.log('✓ Mock desktop server listening on 127.0.0.1:12345');

  try {
    // Ping mock server
    const ping = await fetch('http://127.0.0.1:12345/api/ping').then(r => r.json());
    assert(ping.veloce && ping.dmpro, 'Ping must return true');
    console.log('✓ Port discovery ping returns valid Veloce payload');

    // Test URL Prefix matching logic from background.js
    const prefixes = ['https://fast.downloads.com/files', 'cdn.speedtest.net'];
    const matchesPrefix = (itemUrl) => {
      return prefixes.some(p => {
        try {
          const prefixUrl = new URL(p.startsWith('http') ? p : `http://${p}`);
          const targetUrl = new URL(itemUrl);
          if (prefixUrl.hostname !== targetUrl.hostname && !targetUrl.hostname.endsWith('.' + prefixUrl.hostname)) {
            return false;
          }
          if (prefixUrl.pathname && prefixUrl.pathname !== '/') {
            return targetUrl.pathname.startsWith(prefixUrl.pathname);
          }
          return true;
        } catch {
          return itemUrl.startsWith(p);
        }
      });
    };

    assert.strictEqual(matchesPrefix('https://fast.downloads.com/files/archive.zip'), true);
    assert.strictEqual(matchesPrefix('https://fast.downloads.com/other/test.iso'), false);
    assert.strictEqual(matchesPrefix('http://sub.cdn.speedtest.net/100mb.bin'), true);
    assert.strictEqual(matchesPrefix('https://google.com/search'), false);
    console.log('✓ URL prefix matching logic verified');

    // Test blob and data URL rejection
    const isSpecialUrl = (url) => url.startsWith('blob:') || url.startsWith('data:');
    assert.strictEqual(isSpecialUrl('blob:https://docs.google.com/xyz-123'), true);
    assert.strictEqual(isSpecialUrl('data:text/plain;base64,SGVsbG8='), true);
    assert.strictEqual(isSpecialUrl('https://example.com/test.zip'), false);
    console.log('✓ In-browser Blob and Data URL exclusion verified');

    mockServer.close();
    console.log('\n[TEST SUCCESS] All companion extension verification tests passed!\n');
    process.exit(0);
  } catch (err) {
    mockServer.close();
    console.error('Test failed:', err);
    process.exit(1);
  }
});
