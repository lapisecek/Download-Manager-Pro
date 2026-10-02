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
    throw new Error('Veloce DM not reachable');
  }
}

async function fetchApp(path, options = {}) {
  try {
    const res = await fetch(`http://127.0.0.1:${activePort}${path}`, options);
    return res;
  } catch {
    await findActivePort();
    return fetch(`http://127.0.0.1:${activePort}${path}`, options);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const statusInd = document.getElementById('status-indicator');
  const statusText = document.getElementById('status-text');
  const list = document.getElementById('prefix-list');
  const addBtn = document.getElementById('add-site-btn');

  let currentUrl = '';
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && tabs[0].url) {
      try {
        const urlObj = new URL(tabs[0].url);
        currentUrl = urlObj.origin + '/';
      } catch {}
    }
  });

  const catchAllToggle = document.getElementById('catch-all-toggle');
  chrome.storage.local.get(['catchAll'], (result) => {
    if (catchAllToggle) catchAllToggle.checked = !!result.catchAll;
  });

  if (catchAllToggle) {
    catchAllToggle.addEventListener('change', (e) => {
      chrome.storage.local.set({ catchAll: e.target.checked });
    });
  }

  try {
    const res = await fetchApp('/api/settings');
    if (res.ok) {
      statusInd.className = 'dot connected';
      statusText.innerText = `Connected (Port ${activePort})`;
      addBtn.disabled = false;

      const data = await res.json();
      const prefixes = data.urlPrefixes || [];

      if (prefixes.length === 0) {
        list.innerHTML = '<li style="color:#6b7280;">No prefixes set</li>';
      } else {
        list.innerHTML = prefixes.map(p => `<li>${p}</li>`).join('');
      }
    } else {
      throw new Error();
    }
  } catch {
    statusInd.className = 'dot disconnected';
    statusText.innerText = 'Disconnected';
    list.innerHTML = '<li style="color:#ef4444;">Cannot reach Veloce DM (Ensure desktop app is open)</li>';
  }

  addBtn.addEventListener('click', async () => {
    if (!currentUrl) return;
    try {
      addBtn.innerText = 'Adding...';
      const res = await fetchApp('/api/add-prefix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix: currentUrl })
      });
      if (res.ok) {
        addBtn.innerText = 'Added!';
        addBtn.style.background = '#10b981';
        setTimeout(() => window.close(), 1000);
      }
    } catch {
      addBtn.innerText = 'Error';
    }
  });

  const catchBtn = document.getElementById('catchCurrentBtn');
  if (catchBtn) {
    catchBtn.addEventListener('click', () => {
      chrome.downloads.search({ state: 'in_progress' }, async (downloads) => {
        if (downloads.length > 0) {
          downloads.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
          const item = downloads[0];
          if (!item.url || item.url.startsWith('blob:') || item.url.startsWith('data:')) {
            catchBtn.innerText = 'Cannot catch blob/data URLs';
            setTimeout(() => { catchBtn.innerText = 'Catch Current Download'; }, 2000);
            return;
          }
          try {
            catchBtn.innerText = 'Switching...';
            const res = await fetchApp('/api/download', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url: item.url, filename: item.filename, headers: {} })
            });
            if (res.ok) {
              try {
                chrome.downloads.cancel(item.id);
              } catch {}
              try {
                const u = new URL(item.url);
                await fetchApp('/api/add-prefix', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ prefix: u.origin + '/' })
                });
              } catch {}
              catchBtn.innerText = 'Caught!';
              catchBtn.style.background = '#10b981';
              setTimeout(() => window.close(), 1000);
            } else {
              catchBtn.innerText = 'Failed';
            }
          } catch {
            catchBtn.innerText = 'App Unreachable';
          }
        } else {
          catchBtn.innerText = 'No Active Downloads';
          setTimeout(() => { catchBtn.innerText = 'Catch Current Download'; }, 2000);
        }
      });
    });
  }
});
