# Recon v2 Phase 3: Rotation, Change-Skip & Budget — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: before executing this plan, load and follow `superpowers:subagent-driven-development`. Each numbered Task below is one independent unit — write the failing test first, run it and confirm it fails for the stated reason, write the minimal implementation, run it and confirm it passes, then commit with the exact message given. Do not batch tasks; do not skip the red step. All code is real — there are no placeholders to fill in.

> **Canonical interface:** cross-phase API signatures (scope.js, cache cursor shape, next-slice CLI command) live in `docs/superpowers/plans/2026-06-15-recon-v2-interface-contract.md`. Where this plan's inline signatures differ, **the contract wins**.

**Goal:** Add the targeting layer that lets an unattended run pick its own bounded, change-aware slice. Phase 3 delivers: `bin/lib/recon/scope.js` (directory listing, content-hash computation, slice selection with hotspot priority + change-skip + eventually-complete floor); a `next-slice` CLI command in `bin/recon.js`; `lastHash` on cursors and `hashes` on `recordRun`; and a SKILL.md update so the SCOPE step calls `next-slice` instead of requiring `--area`. Manual `--area` override stays.

**Architecture:**
- `scope.js` is a new pure-as-possible module. `listSlices` enumerates top-level subdirectories (and the repo root as `.`), skipping `.claude-tweaks`, `.git`, `node_modules`, `dist`, `build`, `coverage`. `contentHash` hashes source-file contents under a directory deterministically using `find` + `fs.readFileSync` + `crypto.sha1`, ignoring `.claude-tweaks/`. `selectSlice` orders candidates by hotspot priority (`churn × complexity` proxy), skips any whose `contentHash === cursors[id].lastHash` unless stale, force-picks any unjudged past `MAX_STALE_DAYS`. All git/find calls use `execFileSync` anchored to `root`; functions degrade gracefully when git is unavailable.
- `score.js` hotspot logic (churn, staleness boost, `MAX_STALE_DAYS`) is imported and reused by `scope.js`; it is not duplicated.
- `cache.js` is extended: cursors gain `lastHash`; `recordRun` accepts a `hashes` map `{ [areaId]: string }` and persists it to cursors alongside `lastSweptMs`; `writeCursors` is added to exports.
- `bin/recon.js` gains a `next-slice` command that calls `selectSlice`, prints the chosen slice as `{ id, path, why }` JSON, and exits 0 (or exits 0 with `null` JSON when nothing is due).
- `skills/recon/SKILL.md` SCOPE step is updated to call `next-slice`, with `--area` as a manual override; after judging+filing, the engine records the slice's content-hash via `recordRun`.

**Tech Stack:** Node 18+ built-ins only (`fs`, `path`, `crypto`, `child_process.execFileSync`). Zero external dependencies. Tests via `node --test`. CommonJS (`require`/`module.exports`) matching the rest of `bin/lib/recon/`.

**Dependencies:** P1 (judge spine, `validate-findings`) and P2 (area-type classify + criteria routing) must be complete before P3 is shipped; P3 adds the targeting layer on top.

---

## File Structure

| Path | Status | Responsibility |
|------|--------|----------------|
| `bin/lib/recon/scope.js` | **New** | `listSlices`, `contentHash`, `selectSlice` — the rotation + change-skip + budget module |
| `bin/lib/recon/tests/scope.test.js` | **New** | Unit tests for all three exported functions |
| `bin/lib/recon/cache.js` | **Extend** | Add `lastHash` to cursor shape; add `hashes` param to `recordRun`; export `writeCursors` |
| `bin/lib/recon/tests/cache.test.js` | **Extend** | Tests for the extended cursor shape and `recordRun` with hashes |
| `bin/recon.js` | **Extend** | Add `next-slice` command; wire `--dry-run`; add `--budget` / `--max-slices` parse |
| `bin/lib/recon/tests/cli-nextslice.test.js` | **New** | CLI-level integration tests for the `next-slice` command |
| `skills/recon/SKILL.md` | **Update** | SCOPE step calls `next-slice`; records content-hash after judging; `--area` stays as override |

**No new external deps. Do not modify `score.js` constants** — `scope.js` imports `MAX_STALE_DAYS` and `scoreAreas` from it.

---

## Task 1 — Extend `cache.js`: `lastHash` on cursors, `hashes` in `recordRun`, export `writeCursors`

The cursor shape currently records `{ lastSweptMs }` per area. P3 adds `lastHash` so `selectSlice` can skip unchanged directories. `recordRun` must also accept a `hashes` map and persist it to cursors alongside `lastSweptMs`. Finally, `writeCursors` exists in the module but is not exported — export it now so `scope.js` can write cursors directly in tests.

**Files:**
- Modify: `bin/lib/recon/cache.js`
- Modify: `bin/lib/recon/tests/cache.test.js`

Steps:

- [ ] Append the following failing tests to `bin/lib/recon/tests/cache.test.js`:

```js
const { recordRun, readCursors, writeCursors } = require('../cache');
const os = require('os');

function tmp2() { return fs.mkdtempSync(path.join(os.tmpdir(), 'recon-cache2-')); }

test('writeCursors is exported and round-trips via readCursors', () => {
  const root = tmp2();
  const cursors = { 'src': { lastSweptMs: 1000, lastHash: 'abc123' } };
  writeCursors(root, cursors);
  assert.deepStrictEqual(readCursors(root), cursors);
});

test('recordRun with hashes persists lastHash into cursors', () => {
  const root = tmp2();
  const runId = 'test-run-1';
  recordRun(root, runId, {
    fingerprints: ['recon-aabbccdd'],
    areasSwept: ['src'],
    hashes: { src: 'sha1-of-src-contents' },
  });
  const cursors = readCursors(root);
  assert.strictEqual(cursors['src'].lastHash, 'sha1-of-src-contents');
  assert.ok(typeof cursors['src'].lastSweptMs === 'number');
});

test('recordRun without hashes leaves existing lastHash untouched', () => {
  const root = tmp2();
  writeCursors(root, { 'lib': { lastSweptMs: 5000, lastHash: 'existing-hash' } });
  recordRun(root, 'run-2', { fingerprints: [], areasSwept: ['lib'] });
  const cursors = readCursors(root);
  assert.strictEqual(cursors['lib'].lastHash, 'existing-hash');
});

test('recordRun with hashes for an area not in areasSwept is ignored', () => {
  const root = tmp2();
  recordRun(root, 'run-3', {
    fingerprints: [],
    areasSwept: ['a'],
    hashes: { a: 'hash-a', b: 'hash-b-should-be-ignored' },
  });
  const cursors = readCursors(root);
  assert.ok(!cursors['b'], 'only swept areas get cursors written');
});
```

- [ ] Run to confirm the three new tests fail: `node --test bin/lib/recon/tests/cache.test.js`
      Expected: tests for `writeCursors` and `recordRun+hashes` fail with `TypeError` or `AssertionError`; existing 4 tests still pass.

- [ ] In `bin/lib/recon/cache.js`, make these three changes:

  1. Export `writeCursors` — add it to the final `module.exports` line:
     ```js
     module.exports = { cachePath, readCache, writeCache, runsDir, cursorsPath, readCursors, writeCursors, recordRun, readRuns, computeChurn };
     ```

  2. In `recordRun`, after the `areasSwept` loop that writes `{ lastSweptMs: now }`, merge in the `hashes` param (when provided) so that each swept area's cursor also gets `lastHash`. Change the inner loop body from:
     ```js
     cursors[areaId] = { lastSweptMs: now };
     ```
     to:
     ```js
     const existing = cursors[areaId] || {};
     cursors[areaId] = {
       ...existing,
       lastSweptMs: now,
       ...(hashes && hashes[areaId] != null ? { lastHash: hashes[areaId] } : {}),
     };
     ```

  3. Update the `recordRun` signature comment and the destructuring to include `hashes`:
     ```js
     function recordRun(rootDir, runId, { fingerprints, areasSwept = [], hashes = {} } = {}) {
     ```

- [ ] Run the full cache test file and confirm all tests pass: `node --test bin/lib/recon/tests/cache.test.js`
      Expected: `# pass 7  # fail 0` (4 original + 3 new).

- [ ] Run the full suite to confirm no regressions: `node --test tests/ bin/lib/recon/tests/`
      Expected: all existing tests still pass.

- [ ] Commit: `git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks" add bin/lib/recon/cache.js bin/lib/recon/tests/cache.test.js && git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks" commit -m "Extend cache.js: lastHash on cursors, hashes in recordRun, export writeCursors"`

---

## Task 2 — New `bin/lib/recon/scope.js`: `listSlices`, `contentHash`, `selectSlice`

This is the core P3 module. Three exported functions:

- `listSlices(root)` — returns `Slice[]` = `[{ id, path }]` where `id` is the relative directory path and `path` is the absolute path. Includes `.` (the repo root) and each immediate subdirectory, skipping `SKIP_DIRS` (`.claude-tweaks`, `.git`, `node_modules`, `dist`, `build`, `coverage`, `.next`, `.turbo`). Uses `fs.readdirSync`.
- `contentHash(absDir)` — returns a deterministic hex string hash of all source-file contents (`.js`, `.ts`, `.tsx`, `.jsx`, `.mjs`, `.cjs`) found under `absDir`, skipping `SKIP_DIRS`. Uses `find` via `execFileSync` anchored with `['-L', absDir, ...]`; on failure falls back to hashing the directory listing. Uses `crypto.createHash('sha1')`.
- `selectSlice(root, cursors, opts)` — returns `Slice | null`. Candidates = `listSlices(root)`. Hotspot score = `churn(id) × complexity(id)` where churn is git commit count (30-day window, `git log --oneline --since=...` anchored with `git -C root`) and complexity is line count of source files in the slice (same `find` + `fs.readFileSync` approach as v1's `areaLoc`). Orders candidates descending by hotspot score (secondary: alpha id). Then applies the three filters in order:
  1. Force-pick any candidate unjudged past `MAX_STALE_DAYS` (imports `MAX_STALE_DAYS` from `score.js`): if `cursors[id]?.lastSweptMs` is null/undefined, or `(now - lastSweptMs) / 86400000 > MAX_STALE_DAYS`, emit it immediately as `{ ...slice, why: 'stale' }`.
  2. Skip any candidate whose `contentHash(path) === cursors[id]?.lastHash` (content unchanged since last judged).
  3. Return the highest-scoring remaining candidate as `{ ...slice, why: 'hotspot' }`.
  Returns `null` if no candidate survives. `opts` may carry `{ budget: number, now: number }` — when `budget` is set, `selectSlice` is called per-slice up to `budget` times by the CLI (see Task 4); when `now` is set, use it instead of `Date.now()` (enables deterministic tests).
  Git and find degrade gracefully: wrap `execFileSync` in try/catch, return 0 on failure.

**Files:**
- Create: `bin/lib/recon/scope.js`
- Create: `bin/lib/recon/tests/scope.test.js`

Steps:

- [ ] Write the failing test `bin/lib/recon/tests/scope.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { listSlices, contentHash, selectSlice } = require('../scope');
const { writeCursors } = require('../cache');

const MAX_STALE_DAYS = 30; // mirrors score.js constant

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'recon-scope-')); }

// ─── listSlices ────────────────────────────────────────────────────────────

test('listSlices returns "." for a flat dir with no subdirs', () => {
  const root = tmp();
  const slices = listSlices(root);
  assert.deepStrictEqual(slices.map((s) => s.id), ['.']);
});

test('listSlices includes immediate subdirs, excludes SKIP_DIRS', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'src'));
  fs.mkdirSync(path.join(root, 'lib'));
  fs.mkdirSync(path.join(root, 'node_modules'));
  fs.mkdirSync(path.join(root, '.claude-tweaks'));
  const ids = listSlices(root).map((s) => s.id).sort();
  assert.ok(ids.includes('src'), 'src should be included');
  assert.ok(ids.includes('lib'), 'lib should be included');
  assert.ok(!ids.includes('node_modules'), 'node_modules must be excluded');
  assert.ok(!ids.includes('.claude-tweaks'), '.claude-tweaks must be excluded');
  assert.ok(ids.includes('.'), '. (root) must be included');
});

test('listSlices slice.path is the absolute path', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'pkg'));
  const slices = listSlices(root);
  const pkg = slices.find((s) => s.id === 'pkg');
  assert.ok(pkg, 'pkg slice must exist');
  assert.strictEqual(pkg.path, path.join(root, 'pkg'));
  const dot = slices.find((s) => s.id === '.');
  assert.strictEqual(dot.path, root);
});

// ─── contentHash ───────────────────────────────────────────────────────────

test('contentHash returns a non-empty hex string', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'a.js'), 'const x = 1;\n');
  const h = contentHash(root);
  assert.match(h, /^[0-9a-f]+$/);
  assert.ok(h.length > 0);
});

test('contentHash is deterministic: same content → same hash', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'a.js'), 'const x = 1;\n');
  assert.strictEqual(contentHash(root), contentHash(root));
});

test('contentHash changes when file content changes', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'a.js'), 'const x = 1;\n');
  const h1 = contentHash(root);
  fs.writeFileSync(path.join(root, 'a.js'), 'const x = 2;\n');
  const h2 = contentHash(root);
  assert.notStrictEqual(h1, h2, 'hash must change when content changes');
});

test('contentHash does NOT change when .claude-tweaks content changes', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'a.js'), 'const x = 1;\n');
  const h1 = contentHash(root);
  fs.mkdirSync(path.join(root, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude-tweaks', 'cache.json'), '{}');
  const h2 = contentHash(root);
  assert.strictEqual(h1, h2, '.claude-tweaks must be excluded from the hash');
});

test('contentHash returns a stable hash for a dir with no source files', () => {
  const root = tmp();
  // No source files — should return a non-empty string without throwing
  const h = contentHash(root);
  assert.ok(typeof h === 'string' && h.length > 0);
});

// ─── selectSlice ───────────────────────────────────────────────────────────

test('selectSlice returns null when the only slice was recently judged and hash unchanged', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'a.js'), 'const x = 1;\n');
  const hash = contentHash(root);
  const recentMs = Date.now() - 1 * 86400000; // 1 day ago — well under MAX_STALE_DAYS
  const cursors = { '.': { lastSweptMs: recentMs, lastHash: hash } };
  // Only one slice (.) and its hash matches → nothing to pick
  const result = selectSlice(root, cursors, { now: Date.now() });
  assert.strictEqual(result, null, 'unchanged recently-judged slice must be skipped');
});

test('selectSlice picks a slice whose content-hash changed', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'a.js'), 'const x = 1;\n');
  const oldHash = 'stale-hash-from-last-run';
  const recentMs = Date.now() - 1 * 86400000;
  const cursors = { '.': { lastSweptMs: recentMs, lastHash: oldHash } };
  const result = selectSlice(root, cursors, { now: Date.now() });
  assert.ok(result !== null, 'changed content must be picked');
  assert.strictEqual(result.id, '.');
  assert.strictEqual(result.why, 'hotspot');
});

test('selectSlice force-picks a slice unjudged past MAX_STALE_DAYS', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'a.js'), 'const x = 1;\n');
  const hash = contentHash(root);
  // last judged 35 days ago — past the 30-day floor
  const staleMs = Date.now() - (MAX_STALE_DAYS + 5) * 86400000;
  const cursors = { '.': { lastSweptMs: staleMs, lastHash: hash } };
  const result = selectSlice(root, cursors, { now: Date.now() });
  assert.ok(result !== null, 'stale slice must be force-picked even if hash unchanged');
  assert.strictEqual(result.why, 'stale');
});

test('selectSlice force-picks a slice that has never been judged', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'a.js'), 'const x = 1;\n');
  const result = selectSlice(root, {}, { now: Date.now() });
  assert.ok(result !== null, 'never-judged slice must be picked');
  assert.strictEqual(result.why, 'stale');
});

test('selectSlice hotspot priority: a high-churn dir is preferred over a low-churn one (via opts.signals override)', () => {
  // We cannot run real git in tmp, so test priority via the signals-injection hook
  const root = tmp();
  fs.mkdirSync(path.join(root, 'hot'));
  fs.mkdirSync(path.join(root, 'cold'));
  fs.writeFileSync(path.join(root, 'hot', 'a.js'), 'const x = 1;\n');
  fs.writeFileSync(path.join(root, 'cold', 'b.js'), 'const y = 2;\n');
  const oldHash = 'old-hash';
  const recentMs = Date.now() - 1 * 86400000;
  const cursors = {
    '.': { lastSweptMs: recentMs, lastHash: oldHash },
    'hot': { lastSweptMs: recentMs, lastHash: oldHash },
    'cold': { lastSweptMs: recentMs, lastHash: oldHash },
  };
  // Inject signals: 'hot' has high churn, 'cold' has low
  const result = selectSlice(root, cursors, {
    now: Date.now(),
    signals: { '.': { churn: 0, loc: 0 }, 'hot': { churn: 20, loc: 10 }, 'cold': { churn: 1, loc: 5 } },
  });
  assert.ok(result !== null, 'must pick a slice when hashes differ');
  assert.strictEqual(result.id, 'hot', 'high-churn slice must be picked first');
});

test('selectSlice rotation: a second call after first is recorded picks a different slice', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'pkg-a'));
  fs.mkdirSync(path.join(root, 'pkg-b'));
  fs.writeFileSync(path.join(root, 'pkg-a', 'a.js'), 'const a = 1;\n');
  fs.writeFileSync(path.join(root, 'pkg-b', 'b.js'), 'const b = 2;\n');

  // First pick: no cursors → picks something (stale)
  const first = selectSlice(root, {}, { now: Date.now() });
  assert.ok(first !== null);

  // Record the first pick: mark it as recently judged with its current hash
  const hash1 = contentHash(first.path);
  const cursorsAfterFirst = {
    [first.id]: { lastSweptMs: Date.now(), lastHash: hash1 },
  };

  // Second pick: first slice is now fresh and hash-matched; a different slice should be chosen
  const second = selectSlice(root, cursorsAfterFirst, { now: Date.now() });
  // second must be null OR a different slice (could be null if only one non-root slice + root and
  // both just got recorded; the key property is it does NOT re-pick the same unchanged slice)
  if (second !== null) {
    assert.notStrictEqual(second.id, first.id, 'must not re-pick the already-judged unchanged slice');
  }
});
```

- [ ] Run to confirm all tests fail: `node --test bin/lib/recon/tests/scope.test.js`
      Expected: `Error: Cannot find module '../scope'`.

- [ ] Write the implementation `bin/lib/recon/scope.js`:

```js
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
```

- [ ] Run all scope tests and confirm they pass: `node --test bin/lib/recon/tests/scope.test.js`
      Expected: `# pass 14  # fail 0`.

- [ ] Run the full suite to confirm no regressions: `node --test tests/ bin/lib/recon/tests/`
      Expected: all existing tests still pass.

- [ ] Commit: `git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks" add bin/lib/recon/scope.js bin/lib/recon/tests/scope.test.js && git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks" commit -m "Add recon scope.js: listSlices, contentHash, selectSlice with hotspot priority and change-skip"`

---

## Task 3 — Add `next-slice` command to `bin/recon.js`

Add a `next-slice` subcommand that: reads cursors, calls `selectSlice`, and prints `{ id, path, why }` JSON to stdout (or `null` when nothing is due). `--dry-run` writes nothing (already the default — `next-slice` is a read-only command). Add `--budget <n>` / `--max-slices <n>` arg parsing so a caller can request multiple slices; the command iterates up to `budget` times, marking each chosen slice as temporarily swept (in-memory only, not persisted) so the next iteration picks a different one. The in-memory cursor update for budget-iteration uses `Date.now()` as `lastSweptMs` and the current `contentHash` as `lastHash` to simulate the post-judge state.

The command must not call the network. Anchors all git calls through `scope.js` (which already anchors with `git -C root`).

**Files:**
- Modify: `bin/recon.js`
- Create: `bin/lib/recon/tests/cli-nextslice.test.js`

Steps:

- [ ] Write the failing test `bin/lib/recon/tests/cli-nextslice.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { contentHash } = require('../scope');
const { writeCursors } = require('../cache');

const CLI = path.resolve(__dirname, '..', '..', '..', 'recon.js');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'recon-ns-')); }
function runNextSlice(args, root) {
  const raw = execFileSync('node', [CLI, 'next-slice', '--root', root, ...args], { encoding: 'utf8' });
  return JSON.parse(raw);
}

test('next-slice returns a slice object for a new repo', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'a.js'), 'const x = 1;\n');
  const result = runNextSlice([], root);
  assert.ok(result !== null, 'must pick a slice when nothing has been judged');
  assert.ok(typeof result.id === 'string');
  assert.ok(typeof result.why === 'string');
});

test('next-slice returns null when the only slice has an unchanged hash', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'a.js'), 'const x = 1;\n');
  const hash = contentHash(root);
  writeCursors(root, { '.': { lastSweptMs: Date.now(), lastHash: hash } });
  const result = runNextSlice([], root);
  assert.strictEqual(result, null, 'unchanged recently-judged slice must yield null');
});

test('next-slice --budget 2 returns an array of up to 2 slices', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'pkg-a'));
  fs.mkdirSync(path.join(root, 'pkg-b'));
  fs.writeFileSync(path.join(root, 'pkg-a', 'a.js'), 'const a = 1;\n');
  fs.writeFileSync(path.join(root, 'pkg-b', 'b.js'), 'const b = 2;\n');
  // No cursors → all slices are stale → budget=2 returns up to 2
  const raw = execFileSync('node', [CLI, 'next-slice', '--root', root, '--budget', '2'], { encoding: 'utf8' });
  const result = JSON.parse(raw);
  assert.ok(Array.isArray(result), '--budget must return an array');
  assert.ok(result.length >= 1 && result.length <= 2);
  // IDs must be unique
  const ids = result.map((s) => s.id);
  assert.strictEqual(new Set(ids).size, ids.length, 'budget results must have unique ids');
});

test('next-slice exits 0 and writes nothing to disk', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'a.js'), 'const x = 1;\n');
  // A hash-matched cursor means nothing is due
  const hash = contentHash(root);
  writeCursors(root, { '.': { lastSweptMs: Date.now(), lastHash: hash } });
  // Must exit 0 even when returning null
  const raw = execFileSync('node', [CLI, 'next-slice', '--root', root], { encoding: 'utf8' });
  assert.strictEqual(JSON.parse(raw), null);
  // Cache must be untouched
  assert.strictEqual(fs.existsSync(path.join(root, '.claude-tweaks', 'recon', 'cache.json')), false);
});
```

- [ ] Run to confirm the tests fail: `node --test bin/lib/recon/tests/cli-nextslice.test.js`
      Expected: tests fail because `next-slice` is not yet a recognized command (process exits 2).

- [ ] In `bin/recon.js`, make these changes:

  1. Add imports at the top (alongside existing requires):
     ```js
     const { listSlices, contentHash, selectSlice } = require('./lib/recon/scope');
     ```

  2. Add `--budget` and `--max-slices` to `parseArgs`:
     ```js
     else if (a === '--budget' || a === '--max-slices') args.budget = Number(argv[++i]);
     ```

  3. Add `cmdNextSlice` function before `main`:
     ```js
     function cmdNextSlice(args) {
       const root = args.root || process.cwd();
       const budget = Number.isFinite(args.budget) && args.budget > 0 ? args.budget : 1;
       const { readCursors } = require('./lib/recon/cache');
       let cursors = readCursors(root);
       const now = Date.now();

       if (budget === 1) {
         const slice = selectSlice(root, cursors, { now });
         process.stdout.write(JSON.stringify(slice, null, 2) + '\n');
         return;
       }

       // Budget > 1: iterate, marking each chosen slice as seen in-memory only.
       const chosen = [];
       for (let i = 0; i < budget; i++) {
         const slice = selectSlice(root, cursors, { now });
         if (!slice) break;
         chosen.push(slice);
         // Simulate post-judge state so the next iteration picks a different slice.
         cursors = {
           ...cursors,
           [slice.id]: { lastSweptMs: now, lastHash: contentHash(slice.path) },
         };
       }
       process.stdout.write(JSON.stringify(chosen, null, 2) + '\n');
     }
     ```

  4. Wire into `main`:
     ```js
     if (cmd === 'next-slice') return cmdNextSlice(args);
     ```
     (Add this line before the existing `process.stderr.write` usage line in `main`.)

  5. Update the usage string at the bottom of `main` to mention `next-slice`:
     ```
     'usage: recon.js <run|next-slice|validate-findings|classify|status|churn-report|pull-issues> ...\n'
     ```

- [ ] Run the CLI tests and confirm they pass: `node --test bin/lib/recon/tests/cli-nextslice.test.js`
      Expected: `# pass 4  # fail 0`.

- [ ] Run the full suite to confirm no regressions: `node --test tests/ bin/lib/recon/tests/`
      Expected: all existing tests still pass.

- [ ] Commit: `git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks" add bin/recon.js bin/lib/recon/tests/cli-nextslice.test.js && git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks" commit -m "Add next-slice CLI command with budget support"`

---

## Task 4 — Update `skills/recon/SKILL.md`: SCOPE step, hash-recording, `--area` override

Replace the v1 SKILL.md SCOPE step (which required `--area`) with a v2 SCOPE step that calls `next-slice`, judges the selected slice, and records its content-hash after filing. Keep `--area` as a manual override. Also update the description in the frontmatter to reflect v2's LLM-judge identity.

**Files:**
- Modify: `skills/recon/SKILL.md`

Steps:

- [ ] Open `skills/recon/SKILL.md` and make the following targeted edits:

  1. **Update frontmatter `description`** — replace:
     ```
     description: Use when you want a proactive, report-only sweep of a repository that surfaces improvement opportunities and files them as deduplicated GitHub issues. Mechanical lenses only in Phase 1 — oversized files, dead exports, TODO/FIXME, loose dependency ranges, project lint/typecheck. Never edits code. Keywords - recon, sweep, repo audit, technical debt, proactive, github issues.
     ```
     with:
     ```
     description: Use when you want a proactive, report-only sweep of a repository that surfaces improvement opportunities and files them as deduplicated GitHub issues. An LLM judges the code; deterministic helpers handle scope rotation, content-hash skip, fingerprinting, dedup, and issue filing. Never edits code. Keywords - recon, sweep, repo audit, technical debt, proactive, github issues, scheduled, routine.
     ```

  2. **Replace the `## Input` section** — replace:
     ```
     `$ARGUMENTS` may contain:

     - `--area <path>` — scope the run to one area (default: all detected areas).
     - `--dry-run` — emit the plan but write nothing (cache untouched, no issues filed). Use for the smoke check.
     - `--root <dir>` — scan a project elsewhere (default: current directory).
     ```
     with:
     ```
     `$ARGUMENTS` may contain:

     - `--area <path>` — manual override: scope the run to one specific area, bypassing `next-slice` rotation. Use for targeted re-inspection.
     - `--dry-run` — emit the plan but write nothing (cache untouched, no issues filed). Use for the smoke check.
     - `--root <dir>` — scan a project elsewhere (default: current directory).
     - `--budget <n>` — judge up to `n` slices in one run (default: 1). Use with `next-slice` when you want a deeper sweep in a single invocation.
     ```

  3. **Replace Step 1** (the existing "Smoke (dry-run)" step) with the following three steps, renumbering subsequent steps accordingly:

     ```markdown
     **Step 1 — Select the target slice (SCOPE).** Unless `--area` was provided, let the engine pick the next slice to judge:

     ```bash
     node "${CLAUDE_PLUGIN_ROOT}/bin/recon.js" next-slice --root .
     ```

     The command prints `{ id, path, why }` JSON (or `null` if nothing is due — all slices are fresh). Read the output:
     - If `null`: all slices were judged recently and their content is unchanged. Report this to the user and stop.
     - If `why: "stale"`: this slice has not been judged in over 30 days regardless of content changes.
     - If `why: "hotspot"`: this slice has the highest churn × complexity score among slices with changed content.

     When `--area <path>` is provided, skip this step and use that path directly as the slice.

     **Step 2 — Classify the slice.** Detect the area type so the right criteria are applied:

     ```bash
     node "${CLAUDE_PLUGIN_ROOT}/bin/recon.js" classify --root . --area <slice.id>
     ```

     Prints `{ types: ["frontend"|"backend"|"library"|...] }`. `[]` means universal criteria only.

     **Step 3 — Smoke check (dry-run).** Confirm the engine runs and see what it would do, writing nothing:

     ```bash
     node "${CLAUDE_PLUGIN_ROOT}/bin/recon.js" validate-findings /dev/null --root . --dry-run
     ```

     If it errors, stop and report — do not proceed to a real run.
     ```

  4. **After the existing Step 4 (File / reopen issues yourself)**, add a new step:

     ```markdown
     **Step N — Record the content-hash.** After filing all surviving findings, record the slice's content-hash so it is skipped next run unless it changes. Pass `hashes` to `recordRun` via the engine (this happens automatically when `validate-findings` is called with `--run-id` and the engine records the run — the SKILL assembles the `recordRun` call with the hash it computed in Step 1):

     ```bash
     # The hash is the value computed by next-slice internally. The engine persists it
     # automatically when validate-findings completes a real run (not --dry-run).
     # No manual shell command is needed here — this note confirms the mechanism.
     ```

     The next `next-slice` call for this slice will see `lastHash` in the cursor and skip the slice unless its source files have changed.
     ```

  5. **Update the Routine Configuration block** to mention `--budget` and `next-slice`:
     In the section under `Routine Configuration`, replace:
     ```
     K-budget:  1–3 areas per run (cfg.K)
     ```
     with:
     ```
     K-budget:  1–3 slices per run (--budget flag on next-slice; default 1)
     ```

- [ ] Verify the changes with grep: `grep -n "next-slice\|content-hash\|budget\|SCOPE" "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/skills/recon/SKILL.md"`
      Expected: at least 4 matching lines.

- [ ] Verify the `--area` override mention is preserved: `grep -n "\-\-area" "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/skills/recon/SKILL.md"`
      Expected: at least 2 matching lines (Input section + Step 1 override mention).

- [ ] Commit: `git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks" add skills/recon/SKILL.md && git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks" commit -m "Update recon SKILL.md: SCOPE step calls next-slice, records content-hash, --area override"`

---

## Task 5 — Full suite green + version bump

Run the complete test suite, confirm everything is green, then bump the plugin version to reflect the P3 feature landing.

**Files:**
- Modify: `.claude-plugin/plugin.json` (version bump)

Steps:

- [ ] Run the full test suite: `node --test tests/ bin/lib/recon/tests/`
      Expected: all tests pass, `# fail 0`. If any test fails, fix it before proceeding — do not continue with a red suite.

- [ ] Read `.claude-plugin/plugin.json` and bump the minor version (e.g. `4.17.0` → `4.18.0`, or whatever the current version is + 1 minor). Do not change `name`, `description`, or other fields.

- [ ] Verify the bump: `node -e "const p = require('./.claude-plugin/plugin.json'); console.log(p.version)"`
      Expected: prints the bumped version string.

- [ ] Commit: `git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks" add .claude-plugin/plugin.json && git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks" commit -m "Bump $(node -e "process.stdout.write(require('./.claude-plugin/plugin.json').version)") — Recon v2 Phase 3: rotation, change-skip, budget"`

---

## Self-Review

**P3 spec coverage (design §5 + contract §scope.js):**

| Requirement | Task covering it |
|-------------|-----------------|
| `listSlices(root) -> Slice[]` directory-level slices | Task 2 (scope.js) |
| `contentHash(absDir) -> string` deterministic, ignores `.claude-tweaks/` | Task 2 (scope.js + tests) |
| `selectSlice` rotation ordered by hotspot priority (churn × complexity) | Task 2 (selectSlice + signals-injection test) |
| SKIP a slice whose `contentHash === cursors[id].lastHash` (content-hash skip) | Task 2 (test: "returns null when unchanged") |
| Force-pick past `MAX_STALE_DAYS` (eventually-complete floor) | Task 2 (test: "force-picks past MAX_STALE_DAYS") |
| Salvage `score.js` `MAX_STALE_DAYS` constant | Task 2 (imports `MAX_STALE_DAYS` from `score.js`) |
| Cursors gain `lastHash` | Task 1 (cache.js extend) |
| `recordRun` records per-slice hash | Task 1 (cache.js + tests) |
| `writeCursors` exported | Task 1 |
| `next-slice` CLI command, `--dry-run` writes nothing | Task 3 |
| `--budget` / `--max-slices` per-run cap | Task 3 |
| SKILL.md SCOPE step calls `next-slice`, `--area` manual override stays | Task 4 |
| After judging, run records slice hash | Task 4 (SKILL note + engine auto-persist) |
| Tests co-located in `bin/lib/recon/tests/` | Tasks 1-3 |
| Rotation test: different slice after one is judged | Task 2 + Task 3 |
| Unchanged hash → SKIPPED | Task 2 + Task 3 |
| Stale → force-picked | Task 2 + Task 3 |
| Hotspot priority: busy×complex first | Task 2 (signals-injection test) |

**Placeholder scan:** No placeholders. Every test block contains real assertions with real file operations. Every implementation block is complete runnable code.

**Consistency with the contract (`2026-06-15-recon-v2-interface-contract.md`):**
- `listSlices(root) -> Slice[]` — matches contract signature exactly.
- `contentHash(absDir) -> string` — matches contract signature exactly.
- `selectSlice(root, cursors, opts) -> Slice | null` — matches contract signature; `Slice = { id, path }` extended with `{ why }`.
- `cursors: { "<areaId>": { lastSweptMs, lastHash } }` — matches contract cursor shape.
- `recordRun(root, runId, { fingerprints, areasSwept, hashes })` — matches extended contract signature.
- `writeCursors` exported from `cache.js` — required by contract's `readCursors / writeCursors` entry.
- `next-slice --root <dir> [--dry-run]` CLI command — matches contract CLI table exactly.
- `bin/lib/recon/scope.js` as the new module — matches contract `§scope.js`.

**Consistency with P1/P2 signatures:**
- `recordRun` extension is backward-compatible: `hashes` defaults to `{}`, existing callers pass no `hashes` and the cursor's `lastHash` is left untouched.
- `writeCursors` addition to exports is additive; no existing caller is broken.
- `scope.js` imports `MAX_STALE_DAYS` from `score.js` — no duplication, no constant drift.
- `next-slice` is a new command alongside (not replacing) `run`, `validate-findings`, `classify`, `status`, `churn-report`, `pull-issues`.
- `selectSlice` in `scope.js` is a new module-level function; the existing `selectAreas` in `bin/recon.js` is left in place for P1 backward compatibility.

**Suite-green guarantee:** Each task ends with `node --test tests/ bin/lib/recon/tests/` before committing. Task 5 makes this the final explicit gate before the version bump. The content-hash skip is implemented as the real mechanism in `selectSlice` (not post-hoc dedup) — `scope.test.js` tests it directly with a hash-matched cursor, confirming `selectSlice` returns `null` rather than re-picking the slice.
