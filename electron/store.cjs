const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const storePath = path.join(app.getPath('userData'), 'config.json');

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

function writeStore(data) {
  try {
    fs.writeFileSync(storePath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error writing store', error);
  }
}

let currentStore = readStore();

module.exports = {
  get: (key) => currentStore[key],
  set: (key, value) => {
    currentStore[key] = value;
    writeStore(currentStore);
  },
  getAll: () => currentStore
};
