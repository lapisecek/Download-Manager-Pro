const PORTS = [12345, 12346, 12347];
let activePort = 12345;

async function findActivePort() {
  const checkPort = async (port) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 800);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/ping`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        if (data && (data.veloce || data.dmpro)) return port;
      }
    } catch {}
    throw new Error(`Port ${port} not active`);
  };

  try {
    const port = await Promise.any(PORTS.map(checkPort));
    activePort = port;
    return port;
  } catch {
    throw new Error('Veloce DM not reachable on any port');
  }
}

async function fetchApp(path, options = {}) {
  try {
    const res = await fetch(`http://127.0.0.1:${activePort}${path}`, options);
    return res;
  } catch {
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
  // Never intercept blob or data URLs as desktop app cannot access renderer process memory
  if (!item || !item.url || item.url.startsWith('blob:') || item.url.startsWith('data:')) {
    try { suggest(); } catch {}
    return;
  }

  Promise.all([
    fetchApp('/api/settings').then(r => r.ok ? r.json() : { urlPrefixes: [] }).catch(() => ({ urlPrefixes: [] })),
    new Promise(resolve => chrome.storage.local.get(['catchAll'], resolve))
  ])
    .then(([data, storage]) => {
      const urlPrefixes = data.urlPrefixes || [];
      const catchAll = !!storage.catchAll;
      const matches = catchAll || urlPrefixes.some(prefix => {
        if (!prefix) return false;
        const cleanPref = prefix.trim();
        if (item.url.startsWith(cleanPref)) return true;
        try {
          const itemUrl = new URL(item.url);
          const prefUrl = new URL(cleanPref.includes('://') ? cleanPref : `https://${cleanPref}`);
          if (prefUrl.pathname && prefUrl.pathname !== '/') {
            return itemUrl.href.toLowerCase().startsWith(prefUrl.href.toLowerCase().replace(/\/$/, ''));
          }
          return itemUrl.hostname.toLowerCase() === prefUrl.hostname.toLowerCase() ||
                 itemUrl.hostname.toLowerCase().endsWith('.' + prefUrl.hostname.toLowerCase());
        } catch {
          const normItem = item.url.toLowerCase();
          const normPref = cleanPref.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
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
            try {
              chrome.downloads.cancel(item.id);
            } catch {}
            chrome.notifications.create({
              type: 'basic',
              iconUrl: 'icon.png',
              title: 'Veloce DM',
              message: `Caught download: ${item.filename}`
            });
          }
          try {
            suggest();
          } catch {}
        });
      } else {
        try {
          suggest();
        } catch {}
      }
    })
    .catch(() => {
      // Veloce DM is closed or unreachable, fallback to normal Chrome download
      try {
        suggest();
      } catch {}
    });

  return true;
});
