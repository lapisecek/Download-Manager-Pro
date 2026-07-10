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
      // silently ignore
    }
  }
  throw new Error('DM Pro not reachable');
}

async function fetchApp(path, options = {}) {
  try {
    const res = await fetch(`http://127.0.0.1:${activePort}${path}`, options);
    return res;
  } catch (e) {
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
      } catch (e) {}
    }
  });

  const catchAllToggle = document.getElementById('catch-all-toggle');
  chrome.storage.local.get(['catchAll'], (result) => {
    catchAllToggle.checked = !!result.catchAll;
  });

  catchAllToggle.addEventListener('change', (e) => {
    chrome.storage.local.set({ catchAll: e.target.checked });
  });

  try {
    const res = await fetchApp('/api/settings');
    if (res.ok) {
      statusInd.className = 'dot connected';
      statusText.innerText = 'Connected to DM Pro';
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
  } catch (e) {
    statusInd.className = 'dot disconnected';
    statusText.innerText = 'Disconnected';
    list.innerHTML = '<li style="color:#ef4444;">Cannot reach DM Pro (Make sure it is running)</li>';
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
    } catch (e) {
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
          try {
            catchBtn.innerText = 'Switching...';
            // Send to DM Pro
            const res = await fetchApp('/api/download', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url: item.url, filename: item.filename, headers: {} })
            });
            if (res.ok) {
              chrome.downloads.cancel(item.id);
              // Try to add origin to prefixes
              try {
                const u = new URL(item.url);
                await fetchApp('/api/add-prefix', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ prefix: u.origin + '/' })
                });
              } catch(err) {}
              catchBtn.innerText = 'Caught!';
              catchBtn.style.background = '#10b981';
              setTimeout(() => window.close(), 1000);
            } else {
              catchBtn.innerText = 'Failed';
            }
          } catch(e) {
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
