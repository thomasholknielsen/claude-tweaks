'use strict';
const fs = require('node:fs');

function readEventsKinds(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const text = fs.readFileSync(filePath, 'utf8');
  const counts = {};
  for (const line of text.split('\n')) {
    if (!line) continue;
    let parsed;
    try { parsed = JSON.parse(line); } catch { continue; }
    if (!parsed || typeof parsed.type !== 'string') continue;
    counts[parsed.type] = (counts[parsed.type] || 0) + 1;
  }
  return { counts };
}

module.exports = { readEventsKinds };
