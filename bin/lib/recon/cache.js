const fs = require('fs');
const path = require('path');

// Gitignored, rebuildable-from-issues dedup cache.
// Canonical path: <root>/.claude-tweaks/recon/cache.json (contract §cache.js)
// Shape: { "<fingerprint>": { status: 'open'|'wontfix'|'closed'|'remembered'|'regressed', issue: <number|null> } }

function cachePath(root) {
  return path.join(root, '.claude-tweaks', 'recon', 'cache.json');
}

function readCache(root) {
  try {
    return JSON.parse(fs.readFileSync(cachePath(root), 'utf8'));
  } catch {
    return {}; // missing or corrupt -> empty (the cache is an optimization, not state)
  }
}

function writeCache(root, cache) {
  const p = cachePath(root);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(cache, null, 2) + '\n', 'utf8');
  return p;
}

function runsDir(rootDir) {
  return path.join(rootDir, '.claude-tweaks', 'recon', 'runs');
}

function cursorsPath(rootDir) {
  return path.join(rootDir, '.claude-tweaks', 'recon', 'cursors.json');
}

function readCursors(rootDir) {
  try {
    return JSON.parse(fs.readFileSync(cursorsPath(rootDir), 'utf8'));
  } catch {
    return {}; // missing or corrupt -> empty
  }
}

function writeCursors(rootDir, cursors) {
  const p = cursorsPath(rootDir);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(cursors, null, 2) + '\n', 'utf8');
}

// Persist the fingerprint set this run produced. runId is an ISO-ish timestamp;
// colons are valid on Linux/macOS so the runId round-trips into the filename.
// arg: { fingerprints, areasSwept } — areasSwept is the list of area ids swept this run.
function recordRun(rootDir, runId, { fingerprints, areasSwept = [] } = {}) {
  const dir = runsDir(rootDir);
  fs.mkdirSync(dir, { recursive: true });
  const record = { runId, runAt: new Date().toISOString(), fingerprints: [...fingerprints] };
  fs.writeFileSync(path.join(dir, `${runId}.json`), JSON.stringify(record, null, 2) + '\n', 'utf8');

  // Persist per-area sweep cursors so the round-robin coverage floor rotates.
  if (areasSwept.length > 0) {
    const now = Date.now();
    const cursors = readCursors(rootDir);
    for (const areaId of areasSwept) {
      cursors[areaId] = { lastSweptMs: now };
    }
    writeCursors(rootDir, cursors);
  }

  return record;
}

// All run records, oldest first (by runAt).
function readRuns(rootDir) {
  let entries;
  try {
    entries = fs.readdirSync(runsDir(rootDir));
  } catch {
    return [];
  }
  return entries
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(runsDir(rootDir), f), 'utf8'));
      } catch {
        return null;
      }
    })
    .filter((r) => r && Array.isArray(r.fingerprints) && r.runId)
    .sort((a, b) => ((a.runAt || '') < (b.runAt || '') ? -1 : 1));
}

// Churn vs the prior run. ratio = (appeared + disappeared) / |prior ∪ current|.
// PORT.md delta #5: union denominator, NOT max(prior, current).
// A complete turnover gives ratio 1.0; no changes gives ratio 0.0.
function computeChurn(currentFps, priorRun) {
  const priorFps = priorRun && Array.isArray(priorRun.fingerprints) ? priorRun.fingerprints : [];
  const current = new Set(currentFps);
  const prior = new Set(priorFps);

  const appeared = currentFps.filter((fp) => !prior.has(fp));
  const disappeared = priorFps.filter((fp) => !current.has(fp));
  const stayed = currentFps.filter((fp) => prior.has(fp));
  const union = new Set([...currentFps, ...priorFps]);
  const total = Math.max(union.size, 1);
  const raw = (appeared.length + disappeared.length) / total;
  const ratio = Math.round(raw * 1000) / 1000;

  return { appeared, disappeared, stayed, ratio };
}

module.exports = { cachePath, readCache, writeCache, runsDir, cursorsPath, readCursors, recordRun, readRuns, computeChurn };
