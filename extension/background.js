const PORTS = [12345, 12346, 12347];
let activePort = 12345;

async function findActivePort() {
  for (let port of PORTS) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/ping`);
      if (res.ok) {
        const data = await res.json();
        if (data.dmpro) {
          activePort = port;
          return port;
        }
      }
    } catch (e) {
      // silently fail if port is not active
    }
  }
  throw new Error('DM Pro not reachable on any port');
}

async function fetchApp(path, options = {}) {
  try {
    const res = await fetch(`http://127.0.0.1:${activePort}${path}`, options);
    return res;
  } catch (e) {
    // If connection failed, actively search for the correct port silently
    await findActivePort();
    return fetch(`http://127.0.0.1:${activePort}${path}`, options);
  }
}

// Keep-alive heartbeat using alarms (works in MV3)
chrome.alarms.create('heartbeat', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'heartbeat') {
    fetchApp('/api/heartbeat', { method: 'POST' }).catch(() => {});
  }
});
// Also ping immediately on startup
fetchApp('/api/heartbeat', { method: 'POST' }).catch(() => {});

// Fetch settings instantly on download start
chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  Promise.all([
    fetchApp('/api/settings').then(r => r.ok ? r.json() : { urlPrefixes: [] }).catch(() => ({ urlPrefixes: [] })),
    new Promise(resolve => chrome.storage.local.get(['catchAll'], resolve))
  ])
    .then(([data, storage]) => {
      const urlPrefixes = data.urlPrefixes || [];
      const catchAll = !!storage.catchAll;
      const matches = catchAll || urlPrefixes.some(prefix => {
        try {
          const itemUrl = new URL(item.url);
          const prefUrl = new URL(prefix.includes('://') ? prefix : `https://${prefix}`);
          return itemUrl.hostname.toLowerCase() === prefUrl.hostname.toLowerCase();
        } catch(e) {
          const normItem = item.url.toLowerCase();
          const normPref = prefix.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
          return normItem.includes(normPref);
        }
      });
      
      if (matches) {
        return fetchApp('/api/download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: item.url, filename: item.filename, headers: {} })
        }).then(res => {
          if (res.ok) {
            chrome.downloads.cancel(item.id);
            chrome.notifications.create({
              type: 'basic',
              iconUrl: 'icon.png',
              title: 'DM Pro',
              message: `Caught download: ${item.filename}`
            });
          }
          suggest();
        });
      } else {
        suggest();
      }
    })
    .catch(e => {
      // DM Pro is closed or unreachable, fallback to normal Chrome download
      suggest();
    });
  
  return true;
});
