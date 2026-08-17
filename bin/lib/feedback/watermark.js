// bin/lib/feedback/watermark.js
// Evaluation watermark for skills/feedback/session-evaluation.md (#679). A
// second bare `/feedback` in the same session re-judges the whole transcript
// from byte zero unless something records where the previous judge left off.
// This module is that record: derive the watermark's on-disk path from the
// transcript path, read/write the watermark JSON, and convert the recorded
// byte offset back into a line number for the dispatch prompt. Every fs call
// is an injectable default param (same shape as bin/lib/feedback/file-
// feedback.js's runner/writeFile params) so tests never touch real disk.
//
// readWatermark degrades open: a missing or corrupt watermark file returns
// null, never a throw — session-evaluation.md's prose treats null as "no
// prior evaluation," not an error. writeWatermark does the opposite: it lets
// a real write failure propagate. Swallowing that here would make the
// caller's own degrade-open handling (AC5) untestable and undocumented at
// the wrong layer — session-evaluation.md's prose is responsible for
// catching a writeWatermark throw and reporting it without aborting the
// evaluation.
'use strict';

const fs = require('fs');
const path = require('path');

// Pure string derivation — no fs access needed. Strips the transcript's
// directory and a trailing `.jsonl` extension, keeping the session-id form,
// and places the watermark under a dedicated subdirectory so it never
// collides with anything else cached under .claude-tweaks/feedback/.
function watermarkPath(transcriptPath) {
  const base = path.basename(transcriptPath, '.jsonl');
  return path.join('.claude-tweaks', 'feedback', 'watermarks', `${base}.json`);
}

// Returns the parsed watermark object, or null when none exists (ENOENT) or
// the file is present but not valid JSON (corrupt watermark == no
// watermark, per AC5's degrade-open contract). Any other read failure
// degrades open the same way — a watermark is a cache, never a dependency
// the evaluation should fail over.
function readWatermark(transcriptPath, { readFile = fs.readFileSync } = {}) {
  try {
    const raw = readFile(watermarkPath(transcriptPath), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Overwrites the watermark for transcriptPath with `data`. Creates the
// watermarks directory if needed. Throws on a real failure (permissions,
// disk full, etc.) — the caller decides how to degrade, this module doesn't
// silently eat the error.
function writeWatermark(transcriptPath, data, { mkdirSync = fs.mkdirSync, writeFile = fs.writeFileSync } = {}) {
  const p = watermarkPath(transcriptPath);
  mkdirSync(path.dirname(p), { recursive: true });
  writeFile(p, JSON.stringify(data, null, 2));
}

// Reads filePath, takes the first byteOffset bytes, and counts newlines to
// return a 1-indexed line number. Reads the whole file and slices rather
// than a length-limited read — simplicity over micro-optimization, since
// the judge reads the whole transcript anyway. Slicing is byte-based (via
// Buffer), not code-unit-based, so a transcript containing multi-byte UTF-8
// text still lines up with a byte offset recorded from the file's actual
// size on disk. A byteOffset past EOF is clamped by Buffer#slice, not an
// error: it resolves to one past the last complete line.
function byteOffsetToLine(filePath, byteOffset, { readFile = fs.readFileSync } = {}) {
  const raw = readFile(filePath);
  const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
  const upTo = buf.subarray(0, Math.max(0, byteOffset));
  let newlines = 0;
  for (let i = 0; i < upTo.length; i += 1) {
    if (upTo[i] === 0x0a) newlines += 1;
  }
  return newlines + 1;
}

// The literal contract-text embedded verbatim as prompt item 5 in
// session-evaluation.md's judge dispatch when a watermark exists for the
// resolved transcript. Exact wording (quote precisely downstream):
//
//   Evaluate from byte offset {bytesAtDispatch} (line {line}); these
//   records already exist: {filedRecords joined by ", ", or "none"};
//   omit findings they cover.
function formatOffsetClause({ bytesAtDispatch, line, filedRecords }) {
  const records = Array.isArray(filedRecords) && filedRecords.length > 0 ? filedRecords.join(', ') : 'none';
  return `Evaluate from byte offset ${bytesAtDispatch} (line ${line}); these records already exist: ${records}; omit findings they cover.`;
}

module.exports = {
  watermarkPath,
  readWatermark,
  writeWatermark,
  byteOffsetToLine,
  formatOffsetClause,
};
