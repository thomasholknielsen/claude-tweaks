'use strict';
const fs = require('node:fs');

function readTsv(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const text = fs.readFileSync(filePath, 'utf8');
  const rows = [];
  let malformed = 0;
  for (const line of text.split('\n')) {
    if (!line) continue;
    const cols = line.split('\t');
    if (cols.length !== 6) { malformed++; continue; }
    const [date, runId, rowId, gate, count, outcome] = cols;
    rows.push({ date, runId, rowId, gate, count, outcome });
  }
  return { rows, malformed };
}

module.exports = { readTsv };
