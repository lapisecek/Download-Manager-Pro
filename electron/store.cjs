const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const storePath = path.join(app.getPath('userData'), 'config.json');
const tempPath = `${storePath}.tmp`;

function readStore() {
  try {
    if (fs.existsSync(storePath)) {
      const data = fs.readFileSync(storePath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error reading store', error);
  }
  return {};
}

let saveTimeout = null;

function writeStoreDirect(data) {
  try {
    const dir = path.dirname(storePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const serialized = JSON.stringify(data, null, 2);
    fs.writeFileSync(tempPath, serialized, 'utf-8');
    fs.renameSync(tempPath, storePath);
  } catch {
    // If atomic rename fails (e.g., cross-device or lock), fallback to direct write
    try {
      fs.writeFileSync(storePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (writeErr) {
      console.error('Error writing store', writeErr);
    }
  }
}

let currentStore = readStore();

function flush() {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }
  writeStoreDirect(currentStore);
}

module.exports = {
  get: (key) => currentStore[key],
  set: (key, value) => {
    currentStore[key] = value;
    writeStoreDirect(currentStore);
  },
  setMultiple: (entries) => {
    if (!entries || typeof entries !== 'object') return;
    Object.assign(currentStore, entries);
    writeStoreDirect(currentStore);
  },
  setDebounced: (key, value, delayMs = 1500) => {
    currentStore[key] = value;
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      saveTimeout = null;
      writeStoreDirect(currentStore);
    }, delayMs);
  },
  getAll: () => currentStore,
  flush
};
