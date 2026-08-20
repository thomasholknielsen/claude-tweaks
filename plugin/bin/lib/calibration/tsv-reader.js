'use strict';
const fs = require('node:fs');

function readTsv(filePath) {
  let text;
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch {
    // Missing (the common case) or unreadable (deleted/permission-changed
    // between an fs.existsSync check and this read, or none at all) — both
    // are "no data here", not a crash. Review finding #901: an
    // existsSync-then-readFileSync TOCTOU is realistic in this project,
    // where sibling sessions concurrently archive/prune this exact tree.
    return null;
  }
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
