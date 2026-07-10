const fs = require('fs');
const crypto = require('crypto');
const https = require('https');
const store = require('./store.cjs');

function computeHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', err => reject(err));
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function queryVirusTotal(hash, apiKey) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'www.virustotal.com',
      path: `/api/v3/files/${hash}`,
      method: 'GET',
      headers: {
        'x-apikey': apiKey
      }
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const result = JSON.parse(data);
            resolve(result.data.attributes.last_analysis_stats);
          } catch (e) {
            reject(new Error('Invalid JSON from VirusTotal'));
          }
        } else if (res.statusCode === 404) {
          resolve({ not_found: true });
        } else {
          reject(new Error(`VirusTotal API Error: ${res.statusCode}`));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function scanFile(filePath) {
  const apiKey = store.get('vtApiKey');
  if (!apiKey) return { skipped: true, reason: 'No API Key' };

  try {
    const hash = await computeHash(filePath);
    const stats = await queryVirusTotal(hash, apiKey);
    return { hash, stats };
  } catch (error) {
    return { error: error.message };
  }
}

module.exports = { scanFile };
