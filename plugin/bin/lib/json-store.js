// bin/lib/json-store.js — the generic degrade-open JSON read / atomic JSON
// write pair every registry-shaped module in bin/lib/ builds on, so each one
// doesn't hand-roll its own read/parse/write. `readJsonFile` never throws —
// a missing file and a corrupt file both resolve to `fallback`, since most
// callers (this repo's convention: fail-open on read) want "nothing usable
// here" collapsed to one case; a caller that must tell a missing file apart
// from a corrupt one (e.g. to rename-and-report the corrupt case) checks
// `fs.existsSync` itself before calling this.
'use strict';

const fs = require('fs');
const { atomicWriteFileSync } = require('./atomic-write');

function readJsonFile(filePath, { fallback = null } = {}) {
  let text;
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch {
    return fallback;
  }
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath, data) {
  atomicWriteFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

module.exports = { readJsonFile, writeJsonFile };
