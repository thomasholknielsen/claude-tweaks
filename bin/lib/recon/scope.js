'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { MAX_STALE_DAYS } = require('./score');

const SKIP_DIRS = new Set([
  '.claude-tweaks', '.git', 'node_modules', 'dist', 'build', 'coverage', '.next', '.turbo',
]);
const SOURCE_EXTS = new Set(['.js', '.ts', '.tsx', '.jsx', '.mjs', '.cjs']);

// ─── listSlices ──────────────────────────────────────────────────────────────
// Returns [{ id, path }] for . (root) plus each immediate non-SKIP subdir.
function listSlices(root) {
  const slices = [{ id: '.', path: root }];
  let entries;
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return slices; }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (SKIP_DIRS.has(entry.name)) continue;
    slices.push({ id: entry.name, path: path.join(root, entry.name) });
  }
  return slices;
}

// ─── contentHash ─────────────────────────────────────────────────────────────
// Deterministic SHA-1 of all source-file contents under absDir, skipping SKIP_DIRS.
// Falls back to hashing the directory listing string if find/read fails.
function sourceFiles(absDir) {
  try {
    const raw = execFileSync(
      'find',
      [absDir, '-type', 'f',
        '-not', '-path', `${absDir}/.claude-tweaks/*`,
        '-not', '-path', `${absDir}/.git/*`,
        '-not', '-path', `${absDir}/node_modules/*`,
        '-not', '-path', `${absDir}/dist/*`,
        '-not', '-path', `${absDir}/build/*`,
        '-not', '-path', `${absDir}/coverage/*`,
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    return raw
      .split('\n')
      .filter(Boolean)
      .filter((f) => SOURCE_EXTS.has(path.extname(f)))
      .sort();
  } catch {
    return [];
  }
}

function contentHash(absDir) {
  const files = sourceFiles(absDir);
  const hasher = crypto.createHash('sha1');
  if (files.length === 0) {
    hasher.update('empty:' + absDir);
    return hasher.digest('hex');
  }
  for (const file of files) {
    hasher.update(file + '\0');
    try {
      hasher.update(fs.readFileSync(file));
    } catch {
      hasher.update('unreadable');
    }
  }
  return hasher.digest('hex');
}

// ─── Hotspot signals (impure; degrade gracefully) ────────────────────────────
function gitChurn(root, relDir, now) {
  try {
    const since = new Date(now - 30 * 86400000).toISOString().slice(0, 10);
    const out = execFileSync(
      'git',
      ['-C', root, 'log', '--oneline', `--since=${since}`, '--', relDir === '.' ? '.' : relDir],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    return out.split('\n').filter(Boolean).length;
  } catch {
    return 0;
  }
}

function sliceLoc(absDir) {
  const files = sourceFiles(absDir);
  let total = 0;
  for (const f of files) {
    try { total += fs.readFileSync(f, 'utf8').split('\n').length; } catch { /* skip */ }
  }
  return total;
}

// Hotspot score = churn × complexity (higher = more important to judge next).
function hotspotScore(churn, loc) {
  return churn * Math.min(loc / 100, 10); // cap loc contribution to keep scores finite
}

// ─── selectSlice ─────────────────────────────────────────────────────────────
// opts: { budget?: number, now?: number, signals?: { [id]: { churn, loc } } }
// Returns Slice & { why: 'stale' | 'hotspot' } or null.
function selectSlice(root, cursors, opts = {}) {
  const now = opts.now != null ? opts.now : Date.now();
  const signals = opts.signals || null; // test injection hook

  const candidates = listSlices(root);

  // Phase 1: Force-pick any slice unjudged past MAX_STALE_DAYS (eventually-complete floor).
  for (const slice of candidates) {
    const cursor = cursors[slice.id];
    const lastSweptMs = cursor && cursor.lastSweptMs != null ? cursor.lastSweptMs : null;
    const daysSince = lastSweptMs === null ? Infinity : (now - lastSweptMs) / 86400000;
    if (daysSince > MAX_STALE_DAYS) {
      return { ...slice, why: 'stale' };
    }
  }

  // Phase 2: Among non-stale candidates, compute hotspot score, skip hash-unchanged slices.
  const scored = [];
  for (const slice of candidates) {
    const cursor = cursors[slice.id] || {};
    // Skip if content-hash is unchanged (the real change-aware skip).
    const currentHash = contentHash(slice.path);
    if (cursor.lastHash && cursor.lastHash === currentHash) continue;

    const sig = signals ? signals[slice.id] || { churn: 0, loc: 0 } : null;
    const churn = sig ? sig.churn : gitChurn(root, slice.id, now);
    const loc = sig ? sig.loc : sliceLoc(slice.path);
    scored.push({ slice, score: hotspotScore(churn, loc) });
  }

  if (scored.length === 0) return null;
  scored.sort((a, b) => b.score !== a.score ? b.score - a.score : a.slice.id < b.slice.id ? -1 : 1);
  return { ...scored[0].slice, why: 'hotspot' };
}

module.exports = { listSlices, contentHash, selectSlice };
