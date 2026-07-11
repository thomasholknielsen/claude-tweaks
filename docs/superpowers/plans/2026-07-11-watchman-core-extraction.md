# watchman-core Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the verified-identical cache/cursor persistence, run-record/churn, fingerprint, and dedup logic currently duplicated across `bin/lib/code-health/`, `bin/lib/harness-health/`, and `bin/lib/journey-health/` into a new shared `bin/lib/watchman-core/` module, with zero public-API changes to any consuming skill.

**Architecture:** A new `bin/lib/watchman-core/` directory (sibling to `bin/lib/issues/`, `bin/lib/hooks/` — this project's existing convention for multi-file `bin/lib/` modules) holds four files: `cache.js` (a `createCache(skillName)` factory for the path/read/write primitives proven identical across all three engines), `runs.js` (the simple `recordRun`/`computeChurn` pair proven identical between harness-health and journey-health only), `fingerprint.js` (the `normalizeText`/`fingerprintFromBasis` pair proven identical in logic, though not field names, between harness-health and journey-health), and `dedup.js` (the `decide()` function, byte-identical between harness-health and journey-health). Each consuming skill's own `cache.js`/`fingerprint.js`/`dedup.js` becomes a thin wrapper that binds the shared primitives and layers only its genuinely domain-specific logic on top — the wrapper's exported function names and signatures do not change, so no file outside `bin/lib/{code-health,harness-health,journey-health}/` needs to change. `scope.js`, `score.js`, `validate-finding.js`, and `issue-payload.js` are out of scope everywhere — confirmed domain-specific. code-health's `fingerprint.js`, `dedup.js`, and `cache.js`'s `recordRun`/`computeChurn` are also out of scope — confirmed to carry real extra behavior that the other two skills don't share.

**Tech Stack:** Node.js (CommonJS), `node --test` (no external test dependencies).

## Global Constraints

- **No public API changes.** Every function name, signature, and return shape currently exported by `bin/lib/{code-health,harness-health,journey-health}/{cache,fingerprint,dedup}.js` must remain identically exported after this refactor. No CLI file, SKILL.md, or any file outside these three directories (plus the new `bin/lib/watchman-core/`) may change.
- **Existing tests are the regression oracle.** Do not modify any existing test file under `bin/lib/{code-health,harness-health,journey-health}/tests/`. Every task that touches a skill's `cache.js`/`fingerprint.js`/`dedup.js` must end with that skill's existing test files passing, unmodified, with the same test count as before the change.
- **One deliberate, documented behavior refinement:** the shared `readRuns`' sort comparator uses the proper 3-way form (`x<y?-1:x>y?1:0`), not code-health's original 2-way form (`x<y?-1:1`). This only affects an exact-millisecond `runAt` tie, which no current caller or test reaches. This is the only intentional behavior difference from any of the three engines' current code — call it out in any commit/PR touching code-health's `cache.js`.
- **New code path:** `bin/lib/watchman-core/{cache,runs,fingerprint,dedup}.js` with tests at `bin/lib/watchman-core/tests/{cache,runs,fingerprint,dedup}.test.js`, matching the sibling-directory convention of `bin/lib/issues/` and `bin/lib/hooks/` (not a nested `_shared/` wrapper — that convention is specific to `skills/_shared/`, not `bin/lib/`).
- Run the full suite (`npm test`) is expected to show 783 passing tests plus new watchman-core tests, and exactly one pre-existing, unrelated flake: `tests/statusline.test.js`'s "end-to-end: render under 500ms" (a documented load-sensitive timing flake, not something this plan touches). Do not treat that one flake as a blocker; treat any other failure as a real regression.

---

### Task 1: Create the watchman-core module

**Files:**
- Create: `bin/lib/watchman-core/cache.js`
- Create: `bin/lib/watchman-core/runs.js`
- Create: `bin/lib/watchman-core/fingerprint.js`
- Create: `bin/lib/watchman-core/dedup.js`
- Create: `bin/lib/watchman-core/tests/cache.test.js`
- Create: `bin/lib/watchman-core/tests/runs.test.js`
- Create: `bin/lib/watchman-core/tests/fingerprint.test.js`
- Create: `bin/lib/watchman-core/tests/dedup.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `require('bin/lib/watchman-core/cache').createCache(skillName)` → `{ cachePath(root), readCache(root), writeCache(root, cache), cursorsPath(root), readCursors(root), writeCursors(root, cursors), runsDir(root), readRuns(root) }`
- Produces: `require('bin/lib/watchman-core/runs')` → `{ recordRun(runsDir, runId, fingerprints), computeChurn(currentFps, priorRun) }`
- Produces: `require('bin/lib/watchman-core/fingerprint')` → `{ normalizeText(s), fingerprintFromBasis(prefix, basisArray) }`
- Produces: `require('bin/lib/watchman-core/dedup')` → `{ decide(finding, issueIndex, cache) }`
- Consumed by: Tasks 2-4 (code-health, harness-health, journey-health refactors).

This task creates brand-new code with no existing tests to preserve, so it follows the normal TDD write-test-first flow.

- [ ] **Step 1: Write the watchman-core cache tests**

Create `bin/lib/watchman-core/tests/cache.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createCache } = require('../cache');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'watchman-core-cache-')); }

test('cachePath is namespaced under .claude-tweaks/<skillName>/cache.json', () => {
  const core = createCache('some-skill');
  const root = tmp();
  assert.strictEqual(core.cachePath(root), path.join(root, '.claude-tweaks', 'some-skill', 'cache.json'));
});

test('readCache returns {} when the cache file does not exist', () => {
  const core = createCache('some-skill');
  assert.deepStrictEqual(core.readCache(tmp()), {});
});

test('writeCache then readCache round-trips and creates the dir', () => {
  const core = createCache('some-skill');
  const root = tmp();
  const cache = { 'someskill-abc123': { status: 'staged' } };
  core.writeCache(root, cache);
  assert.ok(fs.existsSync(core.cachePath(root)));
  assert.deepStrictEqual(core.readCache(root), cache);
});

test('readCache returns {} on corrupt JSON rather than throwing', () => {
  const core = createCache('some-skill');
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude-tweaks', 'some-skill'), { recursive: true });
  fs.writeFileSync(core.cachePath(root), '{ not json');
  assert.deepStrictEqual(core.readCache(root), {});
});

test('cursorsPath is namespaced under .claude-tweaks/<skillName>/cursors.json', () => {
  const core = createCache('some-skill');
  const root = tmp();
  assert.strictEqual(core.cursorsPath(root), path.join(root, '.claude-tweaks', 'some-skill', 'cursors.json'));
});

test('readCursors returns {} when the cursors file does not exist', () => {
  const core = createCache('some-skill');
  assert.deepStrictEqual(core.readCursors(tmp()), {});
});

test('writeCursors then readCursors round-trips', () => {
  const core = createCache('some-skill');
  const root = tmp();
  const cursors = { 'target-a': { lastAuditedMs: 1000 } };
  core.writeCursors(root, cursors);
  assert.deepStrictEqual(core.readCursors(root), cursors);
});

test('two different skill names namespace to different directories under the same root', () => {
  const root = tmp();
  const a = createCache('skill-a');
  const b = createCache('skill-b');
  a.writeCache(root, { x: 1 });
  assert.deepStrictEqual(b.readCache(root), {});
});

test('runsDir is namespaced under .claude-tweaks/<skillName>/runs', () => {
  const core = createCache('some-skill');
  const root = tmp();
  assert.strictEqual(core.runsDir(root), path.join(root, '.claude-tweaks', 'some-skill', 'runs'));
});

test('readRuns returns [] when no run logs exist', () => {
  const core = createCache('some-skill');
  assert.deepStrictEqual(core.readRuns(tmp()), []);
});

test('readRuns reads back run records written directly to disk, sorted oldest first by runAt', () => {
  const core = createCache('some-skill');
  const root = tmp();
  fs.mkdirSync(core.runsDir(root), { recursive: true });
  fs.writeFileSync(path.join(core.runsDir(root), 'run-b.json'), JSON.stringify({ runId: 'run-b', runAt: '2026-01-02T00:00:00.000Z', fingerprints: ['x'] }));
  fs.writeFileSync(path.join(core.runsDir(root), 'run-a.json'), JSON.stringify({ runId: 'run-a', runAt: '2026-01-01T00:00:00.000Z', fingerprints: ['y'] }));
  const runs = core.readRuns(root);
  assert.strictEqual(runs.length, 2);
  assert.strictEqual(runs[0].runId, 'run-a');
  assert.strictEqual(runs[1].runId, 'run-b');
});

test('readRuns skips corrupt or malformed run files rather than throwing', () => {
  const core = createCache('some-skill');
  const root = tmp();
  fs.mkdirSync(core.runsDir(root), { recursive: true });
  fs.writeFileSync(path.join(core.runsDir(root), 'bad.json'), '{ not json');
  fs.writeFileSync(path.join(core.runsDir(root), 'no-runid.json'), JSON.stringify({ fingerprints: ['z'] }));
  assert.deepStrictEqual(core.readRuns(root), []);
});
```

- [ ] **Step 2: Run the cache tests to verify they fail**

Run: `node --test bin/lib/watchman-core/tests/cache.test.js`
Expected: FAIL — `Cannot find module '../cache'`

- [ ] **Step 3: Implement watchman-core/cache.js**

Create `bin/lib/watchman-core/cache.js`:

```js
'use strict';
const fs = require('fs');
const path = require('path');

// Generic gitignored cache/cursor/runs persistence shared by the health
// watchmen (code-health, harness-health, journey-health). Each skill's own
// cache.js binds `skillName` once via createCache() and layers its own
// recordAudit()/cursor-shape logic on top — the shape of a cursor entry is
// domain-specific per skill; this module only owns where/how the JSON lives
// on disk.
function createCache(skillName) {
  function cachePath(root) { return path.join(root, '.claude-tweaks', skillName, 'cache.json'); }
  function readCache(root) {
    try { return JSON.parse(fs.readFileSync(cachePath(root), 'utf8')); }
    catch { return {}; }
  }
  function writeCache(root, cache) {
    const p = cachePath(root);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(cache, null, 2) + '\n', 'utf8');
    return p;
  }
  function cursorsPath(root) { return path.join(root, '.claude-tweaks', skillName, 'cursors.json'); }
  function readCursors(root) {
    try { return JSON.parse(fs.readFileSync(cursorsPath(root), 'utf8')); }
    catch { return {}; }
  }
  function writeCursors(root, cursors) {
    const p = cursorsPath(root);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(cursors, null, 2) + '\n', 'utf8');
    return p;
  }
  function runsDir(root) { return path.join(root, '.claude-tweaks', skillName, 'runs'); }
  function readRuns(root) {
    let entries;
    try { entries = fs.readdirSync(runsDir(root)); }
    catch { return []; }
    return entries
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        try { return JSON.parse(fs.readFileSync(path.join(runsDir(root), f), 'utf8')); }
        catch { return null; }
      })
      .filter((r) => r && Array.isArray(r.fingerprints) && r.runId)
      .sort((a, b) => {
        const x = a.runAt || '', y = b.runAt || '';
        return x < y ? -1 : x > y ? 1 : 0;
      });
  }
  return { cachePath, readCache, writeCache, cursorsPath, readCursors, writeCursors, runsDir, readRuns };
}

module.exports = { createCache };
```

- [ ] **Step 4: Run the cache tests to verify they pass**

Run: `node --test bin/lib/watchman-core/tests/cache.test.js`
Expected: PASS (12 tests)

- [ ] **Step 5: Write the watchman-core runs tests**

Create `bin/lib/watchman-core/tests/runs.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { recordRun, computeChurn } = require('../runs');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'watchman-core-runs-')); }

test('recordRun writes a run file under the given runsDir', () => {
  const dir = path.join(tmp(), 'runs');
  const record = recordRun(dir, 'run-1', ['a', 'b']);
  assert.strictEqual(record.runId, 'run-1');
  assert.deepStrictEqual(record.fingerprints, ['a', 'b']);
  assert.ok(fs.existsSync(path.join(dir, 'run-1.json')));
});

test('recordRun creates the runsDir if it does not exist', () => {
  const dir = path.join(tmp(), 'nested', 'runs');
  recordRun(dir, 'run-1', ['a']);
  assert.ok(fs.existsSync(dir));
});

test('computeChurn: no prior run treats every fingerprint as appeared, giving ratio 1', () => {
  const result = computeChurn(['a', 'b'], null);
  assert.deepStrictEqual(result.appeared, ['a', 'b']);
  assert.deepStrictEqual(result.disappeared, []);
  assert.strictEqual(result.ratio, 1);
});

test('computeChurn: identical current and prior gives ratio 0', () => {
  const prior = { fingerprints: ['a', 'b'] };
  assert.strictEqual(computeChurn(['a', 'b'], prior).ratio, 0);
});

test('computeChurn: complete turnover gives ratio 1', () => {
  const prior = { fingerprints: ['a', 'b'] };
  assert.strictEqual(computeChurn(['c', 'd'], prior).ratio, 1);
});

test('computeChurn: partial overlap gives a ratio between 0 and 1', () => {
  const prior = { fingerprints: ['a', 'b', 'c'] };
  const result = computeChurn(['b', 'c', 'd'], prior);
  assert.deepStrictEqual(result.appeared, ['d']);
  assert.deepStrictEqual(result.disappeared, ['a']);
  assert.strictEqual(result.ratio, 0.5);
});
```

- [ ] **Step 6: Run the runs tests to verify they fail**

Run: `node --test bin/lib/watchman-core/tests/runs.test.js`
Expected: FAIL — `Cannot find module '../runs'`

- [ ] **Step 7: Implement watchman-core/runs.js**

Create `bin/lib/watchman-core/runs.js`:

```js
'use strict';
const fs = require('fs');
const path = require('path');

// Simple run-record persistence + churn calc, shared by harness-health and
// journey-health (byte-identical between the two today). code-health keeps
// its own recordRun/computeChurn locally — its recordRun also sweeps area
// cursors as a side effect, and its computeChurn returns an extra `stayed`
// field, neither of which the other two skills have.
function recordRun(runsDir, runId, fingerprints) {
  fs.mkdirSync(runsDir, { recursive: true });
  const record = { runId, runAt: new Date().toISOString(), fingerprints: [...fingerprints] };
  fs.writeFileSync(path.join(runsDir, `${runId}.json`), JSON.stringify(record, null, 2) + '\n', 'utf8');
  return record;
}

// Churn vs the prior run. ratio = (appeared + disappeared) / |prior ∪ current|.
function computeChurn(currentFps, priorRun) {
  const priorFps = priorRun && Array.isArray(priorRun.fingerprints) ? priorRun.fingerprints : [];
  const current = new Set(currentFps);
  const prior = new Set(priorFps);
  const appeared = currentFps.filter((fp) => !prior.has(fp));
  const disappeared = priorFps.filter((fp) => !current.has(fp));
  const union = new Set([...currentFps, ...priorFps]);
  const total = Math.max(union.size, 1);
  const ratio = Math.round(((appeared.length + disappeared.length) / total) * 1000) / 1000;
  return { appeared, disappeared, ratio };
}

module.exports = { recordRun, computeChurn };
```

- [ ] **Step 8: Run the runs tests to verify they pass**

Run: `node --test bin/lib/watchman-core/tests/runs.test.js`
Expected: PASS (6 tests)

- [ ] **Step 9: Write the watchman-core fingerprint tests**

Create `bin/lib/watchman-core/tests/fingerprint.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { normalizeText, fingerprintFromBasis } = require('../fingerprint');

test('normalizeText collapses whitespace and lowercases', () => {
  assert.strictEqual(normalizeText('  Foo   BAR  baz '), 'foo bar baz');
});

test('fingerprintFromBasis returns a <prefix>-<8hex> id', () => {
  const id = fingerprintFromBasis('someprefix', ['a', 'b', 'c']);
  assert.match(id, /^someprefix-[0-9a-f]{8}$/);
});

test('fingerprintFromBasis is stable for identical basis arrays', () => {
  assert.strictEqual(
    fingerprintFromBasis('p', ['a', 'b']),
    fingerprintFromBasis('p', ['a', 'b']),
  );
});

test('fingerprintFromBasis differs when the basis array differs', () => {
  assert.notStrictEqual(
    fingerprintFromBasis('p', ['a', 'b']),
    fingerprintFromBasis('p', ['a', 'c']),
  );
});

test('fingerprintFromBasis differs when the prefix differs, even with the same basis', () => {
  assert.notStrictEqual(
    fingerprintFromBasis('p1', ['a', 'b']),
    fingerprintFromBasis('p2', ['a', 'b']),
  );
});
```

- [ ] **Step 10: Run the fingerprint tests to verify they fail**

Run: `node --test bin/lib/watchman-core/tests/fingerprint.test.js`
Expected: FAIL — `Cannot find module '../fingerprint'`

- [ ] **Step 11: Implement watchman-core/fingerprint.js**

Create `bin/lib/watchman-core/fingerprint.js`:

```js
'use strict';
const crypto = require('crypto');

// Collapse whitespace and lowercase so cosmetic rewording doesn't mint a new id.
function normalizeText(s) {
  return String(s).replace(/\s+/g, ' ').trim().toLowerCase();
}

// Stable id from a prefix + ordered basis array. Each skill's own
// fingerprint.js maps its named finding fields onto a basis array in a
// fixed order and supplies its own id prefix.
function fingerprintFromBasis(prefix, basis) {
  const hash = crypto.createHash('sha1').update(JSON.stringify(basis)).digest('hex').slice(0, 8);
  return `${prefix}-${hash}`;
}

module.exports = { normalizeText, fingerprintFromBasis };
```

- [ ] **Step 12: Run the fingerprint tests to verify they pass**

Run: `node --test bin/lib/watchman-core/tests/fingerprint.test.js`
Expected: PASS (5 tests)

- [ ] **Step 13: Write the watchman-core dedup tests**

Create `bin/lib/watchman-core/tests/dedup.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { decide } = require('../dedup');

test('decide files a brand-new finding with no issue or cache match', () => {
  assert.deepStrictEqual(decide({ id: 'x-abc' }, {}, {}), { action: 'file' });
});

test('decide skips when an open issue already matches the fingerprint', () => {
  const issueIndex = { 'x-abc': { number: 5, state: 'open', labels: [] } };
  assert.deepStrictEqual(decide({ id: 'x-abc' }, issueIndex, {}), { action: 'skip', issue: 5 });
});

test('decide suppresses when the matching issue is labelled wontfix', () => {
  const issueIndex = { 'x-abc': { number: 5, state: 'open', labels: ['wontfix'] } };
  assert.deepStrictEqual(decide({ id: 'x-abc' }, issueIndex, {}), { action: 'suppress', issue: 5 });
});

test('decide skips when the matching issue is closed', () => {
  const issueIndex = { 'x-abc': { number: 5, state: 'closed', labels: [] } };
  assert.deepStrictEqual(decide({ id: 'x-abc' }, issueIndex, {}), { action: 'skip', issue: 5 });
});

test('decide suppresses a finding the local cache marked declined', () => {
  const cache = { 'x-abc': { status: 'declined' } };
  assert.deepStrictEqual(decide({ id: 'x-abc' }, {}, cache), { action: 'suppress' });
});

test('decide skips a finding the local cache marked staged', () => {
  const cache = { 'x-abc': { status: 'staged' } };
  assert.deepStrictEqual(decide({ id: 'x-abc' }, {}, cache), { action: 'skip' });
});

test('decide files a finding when the local cache carries an unrecognized status (e.g. stale "applied")', () => {
  const cache = { 'x-abc': { status: 'applied' } };
  assert.deepStrictEqual(decide({ id: 'x-abc' }, {}, cache), { action: 'file' });
});
```

- [ ] **Step 14: Run the dedup tests to verify they fail**

Run: `node --test bin/lib/watchman-core/tests/dedup.test.js`
Expected: FAIL — `Cannot find module '../dedup'`

- [ ] **Step 15: Implement watchman-core/dedup.js**

Create `bin/lib/watchman-core/dedup.js`:

```js
'use strict';

// Decide what to do with a freshly-fingerprinted finding given the current
// issue index and local cache. Pure — no I/O, no network.
//
// issueIndex: precomputed map { "<fingerprint>": { number, state, labels } }
//   built by the calling skill from `gh issue list --label <skill>` output —
//   the engine never calls network.
//
// Decision logic:
//   open issue match           -> skip      (already filed, don't re-file)
//   wontfix-labelled issue     -> suppress  (standing decision — never re-propose)
//   closed non-wontfix match   -> skip      (assume resolved)
//   'declined' in local cache  -> suppress  (user rejected this exact finding)
//   'staged' in local cache    -> skip      (already filed, unresolved)
//   otherwise                  -> file
function decide(finding, issueIndex, cache) {
  const fp = finding.id;
  const match = issueIndex && fp && issueIndex[fp];
  if (match) {
    if ((match.labels || []).includes('wontfix')) return { action: 'suppress', issue: match.number };
    return { action: 'skip', issue: match.number };
  }
  const cached = cache && fp && cache[fp];
  if (cached && cached.status === 'declined') return { action: 'suppress' };
  if (cached && cached.status === 'staged') return { action: 'skip' };
  return { action: 'file' };
}

module.exports = { decide };
```

- [ ] **Step 16: Run the dedup tests to verify they pass**

Run: `node --test bin/lib/watchman-core/tests/dedup.test.js`
Expected: PASS (7 tests)

- [ ] **Step 17: Register the new test glob in package.json**

Read `package.json`'s `scripts.test` value first — it is a chain of `node --test` globs, one per skill's `tests/` directory (matching the pattern for `bin/lib/code-health/tests/*.test.js`, `bin/lib/harness-health/tests/*.test.js`, `bin/lib/journey-health/tests/*.test.js`). Add `bin/lib/watchman-core/tests/*.test.js` as one more glob in that same chain, keeping the existing globs and their `&&`/space-separated structure exactly as they are — only insert the new glob, don't restructure the command.

- [ ] **Step 18: Run the full watchman-core suite**

Run: `node --test bin/lib/watchman-core/tests/*.test.js`
Expected: PASS (30 tests: 12 cache + 6 runs + 5 fingerprint + 7 dedup)

- [ ] **Step 19: Commit**

```bash
git add bin/lib/watchman-core/ package.json
git commit -m "Add watchman-core: shared cache/runs/fingerprint/dedup primitives"
```

---

### Task 2: Refactor code-health to consume watchman-core

**Files:**
- Modify: `bin/lib/code-health/cache.js`
- Do not modify: `bin/lib/code-health/tests/cache.test.js`, `bin/lib/code-health/tests/churn-v2.test.js`, or any other existing code-health test file.

**Interfaces:**
- Consumes: `require('../watchman-core/cache').createCache('code-health')` (Task 1).
- Produces: `bin/lib/code-health/cache.js` — same exports as before: `{ cachePath, readCache, writeCache, runsDir, cursorsPath, readCursors, writeCursors, recordRun, readRuns, computeChurn }`. `recordRun`'s signature (`recordRun(rootDir, runId, { fingerprints, areasSwept, hashes })`) and `computeChurn`'s return shape (including `stayed`) are unchanged — code-health keeps both locally, unrefactored in behavior.

Since this task refactors already-tested code with no intended behavior change, it follows a refactor-safe flow (confirm baseline → change → confirm identical result) rather than the new-feature TDD flow.

- [ ] **Step 1: Confirm the baseline**

Run: `node --test bin/lib/code-health/tests/cache.test.js bin/lib/code-health/tests/churn-v2.test.js`
Expected: PASS, note the exact test count (this is your regression target for Step 3).

- [ ] **Step 2: Replace bin/lib/code-health/cache.js**

Replace the full file contents with:

```js
'use strict';
const fs = require('fs');
const path = require('path');
const { createCache } = require('../watchman-core/cache');

// Gitignored, rebuildable-from-issues dedup cache.
// Canonical path: <root>/.claude-tweaks/code-health/cache.json (contract §cache.js)
// Shape: { "<fingerprint>": { status: 'open'|'wontfix'|'closed'|'remembered'|'regressed', issue: <number|null> } }

const core = createCache('code-health');

// Persist the fingerprint set this run produced. runId is an ISO-ish timestamp;
// colons are valid on Linux/macOS so the runId round-trips into the filename.
// arg: { fingerprints, areasSwept, hashes } — areasSwept is the list of area ids swept this run;
// hashes is an optional map of areaId -> content hash to persist as lastHash on each cursor.
function recordRun(rootDir, runId, { fingerprints, areasSwept = [], hashes = {} } = {}) {
  const dir = core.runsDir(rootDir);
  fs.mkdirSync(dir, { recursive: true });
  const record = { runId, runAt: new Date().toISOString(), fingerprints: [...fingerprints] };
  fs.writeFileSync(path.join(dir, `${runId}.json`), JSON.stringify(record, null, 2) + '\n', 'utf8');

  // Persist per-area sweep cursors so the round-robin coverage floor rotates.
  if (areasSwept.length > 0) {
    const now = Date.now();
    const cursors = core.readCursors(rootDir);
    for (const areaId of areasSwept) {
      const existing = cursors[areaId] || {};
      cursors[areaId] = {
        ...existing,
        lastSweptMs: now,
        ...(hashes && hashes[areaId] != null ? { lastHash: hashes[areaId] } : {}),
      };
    }
    core.writeCursors(rootDir, cursors);
  }

  return record;
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

module.exports = {
  cachePath: core.cachePath,
  readCache: core.readCache,
  writeCache: core.writeCache,
  runsDir: core.runsDir,
  cursorsPath: core.cursorsPath,
  readCursors: core.readCursors,
  writeCursors: core.writeCursors,
  recordRun,
  readRuns: core.readRuns,
  computeChurn,
};
```

- [ ] **Step 3: Run the same existing tests again to confirm no regression**

Run: `node --test bin/lib/code-health/tests/cache.test.js bin/lib/code-health/tests/churn-v2.test.js`
Expected: PASS, same test count as Step 1, no test file changed.

- [ ] **Step 4: Run the full code-health suite**

Run: `node --test bin/lib/code-health/tests/*.test.js`
Expected: PASS, same count as before this task (confirms no other code-health test file depended on internals of `cache.js` that changed).

- [ ] **Step 5: Commit**

```bash
git add bin/lib/code-health/cache.js
git commit -m "Refactor code-health/cache.js to use watchman-core's path/read/write primitives"
```

---

### Task 3: Refactor harness-health to consume watchman-core

**Files:**
- Modify: `bin/lib/harness-health/cache.js`
- Modify: `bin/lib/harness-health/fingerprint.js`
- Modify: `bin/lib/harness-health/dedup.js`
- Do not modify: any file under `bin/lib/harness-health/tests/`.

**Interfaces:**
- Consumes: `require('../watchman-core/cache').createCache('harness-health')`, `require('../watchman-core/runs')`, `require('../watchman-core/fingerprint')`, `require('../watchman-core/dedup')` (Task 1).
- Produces: `bin/lib/harness-health/cache.js` — same exports as before: `{ cachePath, readCache, writeCache, cursorsPath, readCursors, writeCursors, recordAudit, readGapScanCursor, recordGapScan, runsDir, recordRun, readRuns, computeChurn }`. `bin/lib/harness-health/fingerprint.js` — same exports: `{ fingerprint, normalizeDescription }`. `bin/lib/harness-health/dedup.js` — same export: `{ decide }`.

- [ ] **Step 1: Confirm the baseline**

Run: `node --test bin/lib/harness-health/tests/cache.test.js bin/lib/harness-health/tests/fingerprint.test.js bin/lib/harness-health/tests/dedup.test.js`
Expected: PASS, note the exact test count.

- [ ] **Step 2: Replace bin/lib/harness-health/cache.js**

Replace the full file contents with:

```js
'use strict';
const { createCache } = require('../watchman-core/cache');
const { recordRun, computeChurn } = require('../watchman-core/runs');

// Gitignored, rebuildable-from-issues state. Canonical path:
// <root>/.claude-tweaks/harness-health/{cache,cursors}.json and .../runs/*.json

const core = createCache('harness-health');

// Record that `key` (a fully-formed cursor key, e.g. "skill:auth" or
// "rule:api-errors") was audited. Shared by wrap-up, init, and the routine —
// whichever consumer analyzes a target writes its cursor here so the others'
// rotation/classification skips it.
function recordAudit(root, key, { sha = null, whenMs = Date.now() } = {}) {
  const cursors = core.readCursors(root);
  cursors[key] = { lastAuditedSha: sha, lastAuditedMs: whenMs };
  core.writeCursors(root, cursors);
  return cursors[key];
}

// Gap-scan cursor is a single global entry (key "__gapScan"), not per-skill.
function readGapScanCursor(root) {
  const cursors = core.readCursors(root);
  return cursors.__gapScan || { lastScannedSha: null, lastScannedMs: null };
}

function recordGapScan(root, { sha = null, whenMs = Date.now() } = {}) {
  const cursors = core.readCursors(root);
  cursors.__gapScan = { lastScannedSha: sha, lastScannedMs: whenMs };
  core.writeCursors(root, cursors);
  return cursors.__gapScan;
}

function boundRecordRun(root, runId, fingerprints) {
  return recordRun(core.runsDir(root), runId, fingerprints);
}

module.exports = {
  cachePath: core.cachePath,
  readCache: core.readCache,
  writeCache: core.writeCache,
  cursorsPath: core.cursorsPath,
  readCursors: core.readCursors,
  writeCursors: core.writeCursors,
  recordAudit,
  readGapScanCursor,
  recordGapScan,
  runsDir: core.runsDir,
  recordRun: boundRecordRun,
  readRuns: core.readRuns,
  computeChurn,
};
```

- [ ] **Step 3: Replace bin/lib/harness-health/fingerprint.js**

Replace the full file contents with:

```js
'use strict';
const { normalizeText, fingerprintFromBasis } = require('../watchman-core/fingerprint');

// Collapse whitespace and lowercase so cosmetic rewording doesn't mint a new id.
function normalizeDescription(description) { return normalizeText(description); }

// Stable id from assetType + target + section + normalized description. Same
// shape as recon's fingerprint (criterion+areaId+anchor) — assetType+target
// stand in for criterion, section stands in for areaId, description stands in
// for anchor. assetType is included so a skill and a rule that happen to
// share a target id never collide.
function fingerprint({ assetType, target, section, description }) {
  return fingerprintFromBasis('harnesshealth', [assetType, target, section, normalizeDescription(description)]);
}

module.exports = { fingerprint, normalizeDescription };
```

- [ ] **Step 4: Replace bin/lib/harness-health/dedup.js**

Replace the full file contents with:

```js
'use strict';
module.exports = require('../watchman-core/dedup');
```

- [ ] **Step 5: Run the same existing tests again to confirm no regression**

Run: `node --test bin/lib/harness-health/tests/cache.test.js bin/lib/harness-health/tests/fingerprint.test.js bin/lib/harness-health/tests/dedup.test.js`
Expected: PASS, same test count as Step 1, no test file changed.

- [ ] **Step 6: Run the full harness-health suite**

Run: `node --test bin/lib/harness-health/tests/*.test.js`
Expected: PASS, same count as before this task.

- [ ] **Step 7: Commit**

```bash
git add bin/lib/harness-health/cache.js bin/lib/harness-health/fingerprint.js bin/lib/harness-health/dedup.js
git commit -m "Refactor harness-health cache/fingerprint/dedup to use watchman-core"
```

---

### Task 4: Refactor journey-health to consume watchman-core

**Files:**
- Modify: `bin/lib/journey-health/cache.js`
- Modify: `bin/lib/journey-health/fingerprint.js`
- Modify: `bin/lib/journey-health/dedup.js`
- Do not modify: any file under `bin/lib/journey-health/tests/`.

**Interfaces:**
- Consumes: `require('../watchman-core/cache').createCache('journey-health')`, `require('../watchman-core/runs')`, `require('../watchman-core/fingerprint')`, `require('../watchman-core/dedup')` (Task 1).
- Produces: `bin/lib/journey-health/cache.js` — same exports as before: `{ cachePath, readCache, writeCache, cursorsPath, readCursors, writeCursors, recordAudit, readCoverageScanCursor, recordCoverageScan, runsDir, recordRun, readRuns, computeChurn }`. `bin/lib/journey-health/fingerprint.js` — same exports: `{ fingerprint, normalizeDescription }`. `bin/lib/journey-health/dedup.js` — same export: `{ decide }`.

- [ ] **Step 1: Confirm the baseline**

Run: `node --test bin/lib/journey-health/tests/cache.test.js bin/lib/journey-health/tests/fingerprint.test.js bin/lib/journey-health/tests/dedup.test.js`
Expected: PASS, note the exact test count.

- [ ] **Step 2: Replace bin/lib/journey-health/cache.js**

Replace the full file contents with:

```js
'use strict';
const { createCache } = require('../watchman-core/cache');
const { recordRun, computeChurn } = require('../watchman-core/runs');

// Gitignored, rebuildable-from-issues state. Canonical path:
// <root>/.claude-tweaks/journey-health/{cache,cursors}.json and .../runs/*.json

const core = createCache('journey-health');

// Record that journey `id` was audited on `tier` ('light' or 'deep'). Light
// and deep cursors are tracked independently on the same entry (merged, not
// overwritten) so a light-tier firing never clobbers the deep-tier cadence,
// or vice versa.
function recordAudit(root, id, tier, { hash = null, whenMs = Date.now() } = {}) {
  const cursors = core.readCursors(root);
  const existing = cursors[id] || {};
  const patch = tier === 'deep'
    ? { lastDeepAuditMs: whenMs, lastDeepHash: hash }
    : { lastLightAuditMs: whenMs, lastLightHash: hash };
  cursors[id] = { ...existing, ...patch };
  core.writeCursors(root, cursors);
  return cursors[id];
}

// Coverage-scan cursor is a single global entry (key "__coverageScan"), not
// per-journey — coverage gaps are a whole-library concern, decoupled from
// whichever single journey next-target picked that firing.
function readCoverageScanCursor(root) {
  const cursors = core.readCursors(root);
  return cursors.__coverageScan || { lastScannedMs: null };
}

function recordCoverageScan(root, { whenMs = Date.now() } = {}) {
  const cursors = core.readCursors(root);
  cursors.__coverageScan = { lastScannedMs: whenMs };
  core.writeCursors(root, cursors);
  return cursors.__coverageScan;
}

function boundRecordRun(root, runId, fingerprints) {
  return recordRun(core.runsDir(root), runId, fingerprints);
}

module.exports = {
  cachePath: core.cachePath,
  readCache: core.readCache,
  writeCache: core.writeCache,
  cursorsPath: core.cursorsPath,
  readCursors: core.readCursors,
  writeCursors: core.writeCursors,
  recordAudit,
  readCoverageScanCursor,
  recordCoverageScan,
  runsDir: core.runsDir,
  recordRun: boundRecordRun,
  readRuns: core.readRuns,
  computeChurn,
};
```

- [ ] **Step 3: Replace bin/lib/journey-health/fingerprint.js**

Replace the full file contents with:

```js
'use strict';
const { normalizeText, fingerprintFromBasis } = require('../watchman-core/fingerprint');

// Collapse whitespace and lowercase so cosmetic rewording doesn't mint a new id.
function normalizeDescription(description) { return normalizeText(description); }

// Stable id from journey + category + section + normalized description.
function fingerprint({ journey, category, section, description }) {
  return fingerprintFromBasis('journeyhealth', [journey, category, section, normalizeDescription(description)]);
}

module.exports = { fingerprint, normalizeDescription };
```

- [ ] **Step 4: Replace bin/lib/journey-health/dedup.js**

Replace the full file contents with:

```js
'use strict';
module.exports = require('../watchman-core/dedup');
```

- [ ] **Step 5: Run the same existing tests again to confirm no regression**

Run: `node --test bin/lib/journey-health/tests/cache.test.js bin/lib/journey-health/tests/fingerprint.test.js bin/lib/journey-health/tests/dedup.test.js`
Expected: PASS, same test count as Step 1, no test file changed.

- [ ] **Step 6: Run the full journey-health suite**

Run: `node --test bin/lib/journey-health/tests/*.test.js`
Expected: PASS, same count as before this task.

- [ ] **Step 7: Run the entire project test suite**

Run: `npm test`
Expected: PASS except the one pre-existing, documented flake (`tests/statusline.test.js`'s "end-to-end: render under 500ms") — this confirms nothing outside the four touched skill directories broke, and that no consumer anywhere else in the repo held an undocumented dependency on internals of the files this plan changed.

- [ ] **Step 8: Commit**

```bash
git add bin/lib/journey-health/cache.js bin/lib/journey-health/fingerprint.js bin/lib/journey-health/dedup.js
git commit -m "Refactor journey-health cache/fingerprint/dedup to use watchman-core"
```
