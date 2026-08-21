// plugin/bin/lib/json-store.js
// Shared degrade-open JSON-file read/write shape, factored out of
// bin/lib/declined-learning/store.js and bin/lib/transcript-judge/
// watermark.js — both hand-rolled the identical "read+parse, missing/corrupt
// -> fallback; write, mkdir the parent first" pair, byte-for-byte, before
// this file existed. Each caller keeps its own path resolution and any
// extra shape validation (e.g. store.js additionally rejects a parsed array)
// on top of these two primitives.
'use strict';
const fs = require('fs');
const path = require('path');

// Returns the parsed value at `filePath`, or `fallback` when the file is
// missing (ENOENT), unreadable, or not valid JSON — degrade-open, never
// throws. No shape validation beyond "parsed as JSON" — a caller that needs
// e.g. "must be a plain object" applies that on top of this return value.
function readJsonFile(filePath, { readFile = fs.readFileSync, fallback = null } = {}) {
  try {
    return JSON.parse(readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

// Overwrites `filePath` with `data`, creating its containing directory if
// needed. Writes to a per-process tmp file in the same directory, then
// atomically renames over `filePath` — same shape as
// bin/lib/hooks/context.js's writeRunState — so a reader, or a racing
// unlocked writer (a lock-acquire timeout is fail-open by design; see
// ../file-lock.js), never observes a torn/partial JSON file. Throws on a
// real failure (permissions, disk full, etc.) — the caller decides how to
// degrade; this module doesn't silently eat the error.
function writeJsonFile(filePath, data, { mkdirSync = fs.mkdirSync, writeFile = fs.writeFileSync, rename = fs.renameSync } = {}) {
  const dir = path.dirname(filePath);
  mkdirSync(dir, { recursive: true });
  const tmpPath = path.join(dir, `${path.basename(filePath)}.tmp-${process.pid}`);
  writeFile(tmpPath, JSON.stringify(data, null, 2));
  rename(tmpPath, filePath);
}

module.exports = { readJsonFile, writeJsonFile };
