'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { MAX_STALE_DAYS } = require('./score');
const { selectByStaleThenChurn } = require('../health-core/rotation');

const SKIP_DIRS = new Set([
  '.claude-tweaks', '.git', 'node_modules', 'dist', 'build', 'coverage', '.next', '.turbo',
  '.claude', '.worktrees',
]);
const SOURCE_EXTS = new Set(['.js', '.ts', '.tsx', '.jsx', '.mjs', '.cjs']);

// ─── listSlices ──────────────────────────────────────────────────────────────
// Returns [{ id, path }] for . (root), each immediate non-SKIP subdir NOT covered
// by a workspace manifest, plus every workspace-expanded package slice. A
// top-level dir covered by a workspace pattern (e.g. "packages" when
// "packages/*" is declared) is replaced by its expanded children rather than
// also appearing as its own mega-slice. Repos with no workspace manifest keep
// today's exact one-level-deep behavior.
function listSlices(root) {
  const slices = [{ id: '.', path: root }];
  const workspaceSlices = listWorkspaceSlices(root);
  const coveredTopLevel = fullyCoveredTopLevelDirs(root);
  let entries;
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return slices; }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (SKIP_DIRS.has(entry.name)) continue;
    if (coveredTopLevel.has(entry.name)) continue;
    slices.push({ id: entry.name, path: path.join(root, entry.name) });
  }
  slices.push(...workspaceSlices);
  return slices;
}

// ─── contentHash ─────────────────────────────────────────────────────────────
// Deterministic SHA-1 of all source-file contents under absDir, skipping SKIP_DIRS.
// Falls back to hashing the directory listing string if find/read fails.
function sourceFiles(absDir) {
  try {
    const excludeArgs = [];
    for (const dir of SKIP_DIRS) {
      // `*/dir/*` (not `${absDir}/dir/*`) so a skip-directory is excluded
      // wherever it appears in the subtree, not only as a direct child of
      // absDir — find's -path matches against the whole path string, so `*`
      // spans '/' and matches nested occurrences too (e.g. pkg/nested/dir/*).
      excludeArgs.push('-not', '-path', `*/${dir}/*`);
    }
    const raw = execFileSync(
      'find',
      [absDir, '-type', 'f', ...excludeArgs],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 30000 },
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

// Reads every source file under absDir exactly once, as a Buffer (so both
// contentHash's byte-for-byte hashing and sliceLoc's line count can be
// derived from the same in-memory read — see hashFromFileData/locFromFileData
// below and selectSlice's computeScore, which calls this once per slice
// instead of contentHash/sliceLoc each independently re-spawning `find` and
// re-reading every file).
function readSourceFileData(absDir) {
  const files = sourceFiles(absDir);
  return files.map((file) => {
    try {
      return { file, buffer: fs.readFileSync(file) };
    } catch {
      return { file, buffer: null };
    }
  });
}

function hashFromFileData(absDir, fileData) {
  const hasher = crypto.createHash('sha1');
  if (fileData.length === 0) {
    hasher.update('empty:' + absDir);
    return hasher.digest('hex');
  }
  for (const { file, buffer } of fileData) {
    hasher.update(file + '\0');
    hasher.update(buffer != null ? buffer : 'unreadable');
  }
  return hasher.digest('hex');
}

function locFromFileData(fileData) {
  let total = 0;
  for (const { buffer } of fileData) {
    if (buffer == null) continue;
    total += buffer.toString('utf8').split('\n').length;
  }
  return total;
}

function contentHash(absDir) {
  return hashFromFileData(absDir, readSourceFileData(absDir));
}

// ─── Hotspot signals (impure; degrade gracefully) ────────────────────────────
function gitChurn(root, relDir, now) {
  try {
    const since = new Date(now - 30 * 86400000).toISOString().slice(0, 10);
    const out = execFileSync(
      'git',
      ['-C', root, 'log', '--oneline', `--since=${since}`, '--', relDir === '.' ? '.' : relDir],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 30000 },
    );
    return out.split('\n').filter(Boolean).length;
  } catch {
    return 0;
  }
}

function sliceLoc(absDir) {
  return locFromFileData(readSourceFileData(absDir));
}

// Hotspot score = churn × complexity (higher = more important to judge next).
function hotspotScore(churn, loc) {
  return churn * Math.min(loc / 100, 10); // cap loc contribution to keep scores finite
}

// ─── Workspace-aware slicing ─────────────────────────────────────────────────
// Reads package.json#workspaces (array or {packages:[...]} form) or, failing
// that, pnpm-workspace.yaml's `packages:` list, and expands each pattern to its
// member packages. Minimal glob support by design — no new dependency:
//   "<dir>/*"   → every immediate subdirectory of <dir> becomes its own slice
//   "<literal>" → that exact path becomes one slice (existence-checked)
//   anything else (**, negation, multiple wildcards) → skipped, logged to stderr
function readWorkspacePatterns(root) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    if (Array.isArray(pkg.workspaces)) return pkg.workspaces;
    if (pkg.workspaces && Array.isArray(pkg.workspaces.packages)) return pkg.workspaces.packages;
  } catch { /* no package.json, or no usable workspaces field — fall through to pnpm */ }

  try {
    const yaml = fs.readFileSync(path.join(root, 'pnpm-workspace.yaml'), 'utf8');
    const patterns = [];
    let inPackages = false;
    for (const line of yaml.split('\n')) {
      if (/^packages:\s*$/.test(line.trim())) { inPackages = true; continue; }
      if (!inPackages) continue;
      const m = line.match(/^\s*-\s*['"]?([^'"#\s]+)['"]?\s*$/);
      if (m) { patterns.push(m[1]); continue; }
      if (line.trim() !== '' && !/^[\s-]/.test(line)) inPackages = false;
    }
    return patterns;
  } catch {
    return [];
  }
}

function expandWorkspacePattern(root, rawPattern) {
  const pattern = rawPattern.replace(/^\.\//, '').replace(/\/$/, '');
  const wildcardCount = (pattern.match(/\*/g) || []).length;
  const hasOtherSpecial = /[!{}?]/.test(pattern);

  if (wildcardCount === 0 && !hasOtherSpecial) {
    const abs = path.join(root, pattern);
    try {
      if (fs.statSync(abs).isDirectory()) return [{ id: pattern, path: abs }];
    } catch { /* pattern names a path that doesn't exist */ }
    return [];
  }

  if (wildcardCount === 1 && !hasOtherSpecial && pattern.endsWith('/*')) {
    const prefix = pattern.slice(0, -2); // strip trailing "/*"
    const absPrefix = path.join(root, prefix);
    let entries;
    try { entries = fs.readdirSync(absPrefix, { withFileTypes: true }); } catch { return []; }
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => ({ id: `${prefix}/${e.name}`, path: path.join(absPrefix, e.name) }));
  }

  process.stderr.write(
    `[code-health] scope: skipping unsupported workspace pattern "${pattern}" ` +
    '(only "<dir>/*" and literal paths are supported)\n',
  );
  return [];
}

// Top-level dirs genuinely enumerated in full by a "<dir>/*" workspace pattern —
// i.e. every immediate child of <dir> is covered, so <dir> itself should not
// also appear as its own top-level slice. A literal single-package pattern
// (e.g. "tools/cli") does NOT cover "tools" — unlisted siblings like
// "tools/scripts" must still reach a top-level slice, so they aren't silently
// dropped from scope.
function fullyCoveredTopLevelDirs(root) {
  const patterns = readWorkspacePatterns(root);
  const covered = new Set();
  for (const rawPattern of patterns) {
    const pattern = rawPattern.replace(/^\.\//, '').replace(/\/$/, '');
    const m = pattern.match(/^([^*!{}?]+)\/\*$/);
    if (m) covered.add(m[1]);
  }
  return covered;
}

// Returns [] when no workspace manifest exists or none of its patterns resolve.
function listWorkspaceSlices(root) {
  const patterns = readWorkspacePatterns(root);
  const slices = [];
  const seen = new Set();
  for (const pattern of patterns) {
    for (const slice of expandWorkspacePattern(root, pattern)) {
      if (seen.has(slice.id)) continue;
      seen.add(slice.id);
      slices.push(slice);
    }
  }
  return slices;
}

// ─── selectSlice ─────────────────────────────────────────────────────────────
// opts: { budget?: number, now?: number, signals?: { [id]: { churn, loc } } }
// Returns Slice & { why: 'stale' | 'hotspot' } or null. Phase mechanics
// (force-pick past MAX_STALE_DAYS, else score-and-pick-highest) delegate to
// health-core/rotation's shared selectByStaleThenChurn; this module keeps
// ownership of the slice listing, content-hash skip, and hotspot scoring.
function selectSlice(root, cursors, opts = {}) {
  const now = opts.now != null ? opts.now : Date.now();
  const signals = opts.signals || null; // test injection hook

  const candidates = listSlices(root);

  return selectByStaleThenChurn(candidates, cursors, {
    now,
    staleDays: MAX_STALE_DAYS,
    getCursorKey: (slice) => slice.id,
    getLastAuditedMs: (cursor) => (cursor && cursor.lastSweptMs != null ? cursor.lastSweptMs : null),
    // Skip if content-hash is unchanged (the real change-aware skip) —
    // returning null excludes the slice from Phase 2 entirely. Reads the
    // slice's source files exactly once (readSourceFileData) and derives
    // both the hash and the LOC count from that single pass, instead of
    // contentHash/sliceLoc each independently re-spawning `find` and
    // re-reading every file.
    computeScore: (slice, cursor) => {
      const fileData = readSourceFileData(slice.path);
      const currentHash = hashFromFileData(slice.path, fileData);
      if (cursor.lastHash && cursor.lastHash === currentHash) return null;
      const sig = signals ? signals[slice.id] || { churn: 0, loc: 0 } : null;
      const churn = sig ? sig.churn : gitChurn(root, slice.id, now);
      const loc = sig ? sig.loc : locFromFileData(fileData);
      return hotspotScore(churn, loc);
    },
    buildStaleResult: (slice) => ({ ...slice, why: 'stale' }),
    buildHotspotResult: (slice) => ({ ...slice, why: 'hotspot' }),
  });
}

module.exports = { listSlices, contentHash, selectSlice, listWorkspaceSlices };
