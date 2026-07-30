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
  // Read the workspace manifest exactly once and hand the parsed patterns to
  // both consumers below — listWorkspaceSlices and fullyCoveredTopLevelDirs
  // each independently called readWorkspacePatterns(root) before, doubling
  // the package.json/pnpm-workspace.yaml read+parse on every listSlices call.
  const patterns = readWorkspacePatterns(root);
  const workspaceSlices = listWorkspaceSlices(root, patterns);
  const coveredTopLevel = fullyCoveredTopLevelDirs(root, patterns);
  let entries;
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return slices; }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (SKIP_DIRS.has(entry.name)) continue;
    if (coveredTopLevel.has(entry.name)) continue;
    slices.push({ id: entry.name, path: path.join(root, entry.name) });
  }
  slices.push(...workspaceSlices);
  // fs.readdirSync order is not guaranteed by Node's API, so without an
  // explicit sort, selectByStaleThenChurn's Phase 1 (first-qualifying-wins)
  // could force-pick a different slice across environments/checkouts for
  // the identical repo state, undermining round-robin coverage. Sibling
  // engines (e.g. harness-health/scope.js's listSkills/listRules) already
  // sort their candidate lists for the same reason.
  slices.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return slices;
}

// ─── contentHash ─────────────────────────────────────────────────────────────
// Deterministic SHA-1 of all source-file contents under absDir, skipping SKIP_DIRS.
// Falls back to hashing the directory listing string if find/read fails.
// recursive:false scans only direct file children of absDir (maxdepth 1) —
// used for the '.' slice, which must NOT overlap every subdirectory/
// workspace slice that already covers everything beneath root. See
// docs/superpowers/specs/2026-07-30-durable-state-git-native-write-design.md.
function sourceFiles(absDir, { recursive = true } = {}) {
  try {
    const excludeArgs = [];
    for (const dir of SKIP_DIRS) {
      // `*/dir/*` (not `${absDir}/dir/*`) so a skip-directory is excluded
      // wherever it appears in the subtree, not only as a direct child of
      // absDir — find's -path matches against the whole path string, so `*`
      // spans '/' and matches nested occurrences too (e.g. pkg/nested/dir/*).
      excludeArgs.push('-not', '-path', `*/${dir}/*`);
    }
    const depthArgs = recursive ? [] : ['-maxdepth', '1'];
    const raw = execFileSync(
      'find',
      [absDir, ...depthArgs, '-type', 'f', ...excludeArgs],
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
// contentHash's byte-for-byte hashing and selectSlice's line count can be
// derived from the same in-memory read — see hashFromFileData/locFromFileData
// below and selectSlice's computeScore, which calls this once per slice
// instead of independently re-spawning `find` and re-reading every file for
// hash and LOC separately).
function readSourceFileData(absDir, opts) {
  const files = sourceFiles(absDir, opts);
  return files.map((file) => {
    try {
      return { file, buffer: fs.readFileSync(file) };
    } catch {
      return { file, buffer: null };
    }
  });
}

// Same as readSourceFileData, but reuses a caller-supplied Map (keyed by
// absDir) across repeated calls for the same directory instead of
// re-spawning `find` and re-reading every file each time. Used by
// selectSlice's computeScore AND the final cursor-patch hash lookup in a
// --budget > 1 next-slice invocation — cache is null/undefined for a normal
// single-pick call, which falls straight through to the uncached read.
function readSourceFileDataCached(absDir, cache, opts) {
  if (!cache) return readSourceFileData(absDir, opts);
  if (cache.has(absDir)) return cache.get(absDir);
  const data = readSourceFileData(absDir, opts);
  cache.set(absDir, data);
  return data;
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

// cache: optional Map (see readSourceFileDataCached) — pass the same Map
// across repeated calls for the same absDir within one CLI invocation to
// avoid re-spawning `find` and re-reading every file.
function contentHash(absDir, cache, opts) {
  return hashFromFileData(absDir, readSourceFileDataCached(absDir, cache, opts));
}

// ─── Hotspot signals (impure; degrade gracefully) ────────────────────────────
function gitChurn(root, relDir, now, { recursive = true } = {}) {
  try {
    // Full ISO 8601 datetime (with time-of-day and Z/UTC suffix), not a bare
    // YYYY-MM-DD date string — a bare date string is parsed by git as local
    // midnight and then converted to UTC, silently skewing (or, near the
    // epoch, underflowing to pre-epoch and matching zero commits) the
    // boundary in positive-UTC-offset timezones. Identical bug and fix as
    // harness-health/scope.js's domainChurn, journey-health/scope.js, and
    // docs-health/scope.js.
    const since = new Date(now - 30 * 86400000).toISOString();
    let pathArgs;
    if (recursive) {
      pathArgs = [relDir === '.' ? '.' : relDir];
    } else {
      // Non-recursive '.': `git log -- .` always means the whole tree
      // regardless of depth, so instead pass each direct root-level source
      // file as its own pathspec, scoping churn to exactly what the
      // non-recursive content-hash also covers.
      const files = sourceFiles(root, { recursive: false }).map((f) => path.relative(root, f));
      if (files.length === 0) return 0;
      pathArgs = files;
    }
    const out = execFileSync(
      'git',
      ['-C', root, 'log', '--oneline', `--since=${since}`, '--', ...pathArgs],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 30000 },
    );
    return out.split('\n').filter(Boolean).length;
  } catch {
    return 0;
  }
}

// Single source of truth for "is this slice's file/churn scan recursive?" —
// used by selectSlice's computeScore below AND by bin/code-health.js's own
// contentHash call sites (cmdNextSlice's budget>1 in-memory cursor-patch
// hash, cmdValidateFindings' durable-persist hash), so all three agree on
// exactly the same predicate instead of each re-deriving `id !== '.'` (and
// risking drift between them).
function sliceRecursive(id) {
  return id !== '.';
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
// dropped from scope. A literal pattern with NO path separator at all (e.g.
// "packages", naming a top-level dir directly) DOES cover that dir — it
// becomes one whole-directory package slice via expandWorkspacePattern's
// literal branch, so it must not also appear as its own top-level mega-slice
// from the plain readdir loop (they'd otherwise be listed — and scored —
// twice, as the same id and path).
// patterns: optional pre-read result of readWorkspacePatterns(root), so
// callers that already have it (listSlices) don't re-read the manifest.
function fullyCoveredTopLevelDirs(root, patterns) {
  const pats = patterns || readWorkspacePatterns(root);
  const covered = new Set();
  for (const rawPattern of pats) {
    const pattern = rawPattern.replace(/^\.\//, '').replace(/\/$/, '');
    const globMatch = pattern.match(/^([^*!{}?]+)\/\*$/);
    if (globMatch) { covered.add(globMatch[1]); continue; }
    if (!/[*!{}?]/.test(pattern) && !pattern.includes('/')) covered.add(pattern);
  }
  return covered;
}

// Returns [] when no workspace manifest exists or none of its patterns resolve.
// patterns: optional pre-read result of readWorkspacePatterns(root), so
// callers that already have it (listSlices) don't re-read the manifest.
function listWorkspaceSlices(root, patterns) {
  const pats = patterns || readWorkspacePatterns(root);
  const slices = [];
  const seen = new Set();
  for (const pattern of pats) {
    for (const slice of expandWorkspacePattern(root, pattern)) {
      if (seen.has(slice.id)) continue;
      seen.add(slice.id);
      slices.push(slice);
    }
  }
  return slices;
}

// ─── selectSlice ─────────────────────────────────────────────────────────────
// opts: { budget?: number, now?: number, signals?: { [id]: { churn, loc } },
//         fileDataCache?: Map }
// Returns Slice & { why: 'stale' | 'hotspot' } or null. Phase mechanics
// (force-pick past MAX_STALE_DAYS, else score-and-pick-highest) delegate to
// health-core/rotation's shared selectByStaleThenChurn; this module keeps
// ownership of the slice listing, content-hash skip, and hotspot scoring.
//
// fileDataCache (optional): a Map the caller can create once and pass into
// every selectSlice call across a --budget > 1 loop (see cmdNextSlice in
// bin/code-health.js) and into a subsequent contentHash() call for the
// winning slice — on-disk content doesn't change during one CLI invocation,
// so this avoids re-spawning `find` and re-reading every source file once
// per budget iteration per candidate, plus once more for the final picked
// slice's cursor-patch hash.
function selectSlice(root, cursors, opts = {}) {
  const now = opts.now != null ? opts.now : Date.now();
  const signals = opts.signals || null; // test injection hook
  const fileDataCache = opts.fileDataCache || null;

  const candidates = listSlices(root);

  return selectByStaleThenChurn(candidates, cursors, {
    now,
    staleDays: MAX_STALE_DAYS,
    getCursorKey: (slice) => slice.id,
    getLastAuditedMs: (cursor) => (cursor && cursor.lastSweptMs != null ? cursor.lastSweptMs : null),
    // Skip if content-hash is unchanged (the real change-aware skip) —
    // returning null excludes the slice from Phase 2 entirely. Reads the
    // slice's source files exactly once per candidate per fileDataCache
    // lifetime (readSourceFileDataCached) and derives both the hash and the
    // LOC count from that single pass, instead of independently
    // re-spawning `find` and re-reading every file for each.
    computeScore: (slice, cursor) => {
      const recursive = sliceRecursive(slice.id);
      const fileData = readSourceFileDataCached(slice.path, fileDataCache, { recursive });
      const currentHash = hashFromFileData(slice.path, fileData);
      if (cursor.lastHash && cursor.lastHash === currentHash) return null;
      const sig = signals ? signals[slice.id] || { churn: 0, loc: 0 } : null;
      const churn = sig ? sig.churn : gitChurn(root, slice.id, now, { recursive });
      const loc = sig ? sig.loc : locFromFileData(fileData);
      return hotspotScore(churn, loc);
    },
    buildStaleResult: (slice) => ({ ...slice, why: 'stale' }),
    buildHotspotResult: (slice) => ({ ...slice, why: 'hotspot' }),
  });
}

module.exports = { listSlices, contentHash, selectSlice, listWorkspaceSlices, gitChurn, sliceRecursive };
