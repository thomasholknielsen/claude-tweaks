# Atomic-Write Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the tmp-file-plus-rename atomic write pattern — currently hand-rolled four separate times — into one shared `writeFileAtomic(filePath, content)` primitive, and migrate all four call sites onto it without changing their observable behavior.

**Architecture:** New file `plugin/bin/lib/atomic-write.js` exports `writeFileAtomic(filePath, content, deps)`: write `content` to a pid-suffixed tmp file in the same directory as `filePath`, then `fs.renameSync` it over `filePath`. On any failure of the write or rename, best-effort unlink the tmp file, then rethrow the original error unchanged. This is the union of what the four current copies do (the *cleanup-on-failure* behavior `log-decision/append.js` already has, extended to the two sites that also had it — `flow/manifest.js`, `hooks/context.js` — and newly added to `json-store.js`, which currently has no cleanup at all). Each of the four call sites keeps its own directory-creation (only `json-store.js` needs it) and its own decision about whether a failure propagates (rethrow) or degrades (catch-and-return `false`/`null`) — that policy stays at the call site, never moves into the primitive.

**Tech Stack:** Plain Node.js `fs`/`path` (`fs.writeFileSync`, `fs.renameSync`, `fs.unlinkSync`) — no new dependency; the plugin ships zero runtime npm deps (see `plugin/bin/lib/flow/manifest.js`'s own header comment for this existing constraint). `node --test` for the test suite.

**Spec:** `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/record-1653/.claude-tweaks/pipelines/2026-08-29T161123-record-1653/work/1653-spec.md` (record #1653)

## Global Constraints

- No new runtime dependency — `fs`/`path` only.
- No behavioral change to `run-state.json`, `manifest.yml`, or `decisions.md` writes (spec's Acceptance Criteria) — every existing test in `tests/bin-lib/json-store.test.js`, `tests/bin-lib/log-decision/append.test.js`, `tests/bin-lib/flow/manifest.test.js`, `tests/hooks-context.test.js`, and `tests/hooks-context-anchoring.test.js` must pass unmodified.
- The primitive gains cleanup-on-failure for `json-store.js`'s `writeJsonFile` (the union of what all four already do), never a regression toward the weakest copy's behavior for the other three.
- Each call site's own directory-creation and failure-degrade policy (throw vs. return `false`/`null`) stays at the call site — the primitive itself never mkdirs and always rethrows.

---

### Task 1: Create the shared `writeFileAtomic` primitive

**Files:**
- Create: `plugin/bin/lib/atomic-write.js`
- Test: `tests/bin-lib/atomic-write.test.js`

**Interfaces:**
- Produces: `writeFileAtomic(filePath, content, { writeFile = fs.writeFileSync, rename = fs.renameSync, unlink = fs.unlinkSync } = {})` — void return; throws on failure. Tmp path: `path.join(path.dirname(filePath), \`${path.basename(filePath)}.tmp-${process.pid}\`)`.

- [ ] **Step 1: Write the failing tests**

```javascript
// tests/bin-lib/atomic-write.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { writeFileAtomic } = require('../../plugin/bin/lib/atomic-write');

test('writeFileAtomic: writes to a pid-suffixed tmp path in the same directory, then renames over the real path', () => {
  const writeCalls = [];
  const renameCalls = [];
  const writeFile = (p, content) => writeCalls.push({ p, content });
  const rename = (from, to) => renameCalls.push({ from, to });

  writeFileAtomic('/x/y/store.txt', 'hello', { writeFile, rename });

  assert.equal(writeCalls.length, 1);
  assert.notEqual(writeCalls[0].p, '/x/y/store.txt', 'writes to a tmp path, not the final path directly');
  assert.ok(writeCalls[0].p.startsWith('/x/y/store.txt.tmp-'), 'tmp path is derived from the real path, in the same directory');
  assert.equal(writeCalls[0].content, 'hello');
  assert.equal(renameCalls.length, 1);
  assert.equal(renameCalls[0].from, writeCalls[0].p);
  assert.equal(renameCalls[0].to, '/x/y/store.txt');
});

test('writeFileAtomic: tmp path is pid-suffixed, not a fixed name (two calls in one process reuse the same pid-derived name)', () => {
  const writes = [];
  const writeFile = (p) => writes.push(p);
  const rename = () => {};
  writeFileAtomic('/x/store.txt', 'a', { writeFile, rename });
  writeFileAtomic('/x/store.txt', 'b', { writeFile, rename });
  assert.equal(writes[0], writes[1], 'same pid within one process -> same tmp name; sequential calls, each rename is atomic per-call');
});

test('writeFileAtomic: a write failure is cleaned up (best-effort unlink of the tmp file) and rethrown unchanged', () => {
  const unlinkCalls = [];
  const writeFile = () => { throw new Error('ENOSPC: no space left on device'); };
  const rename = () => { throw new Error('rename should not be called when write failed'); };
  const unlink = (p) => unlinkCalls.push(p);

  assert.throws(
    () => writeFileAtomic('/x/store.txt', 'a', { writeFile, rename, unlink }),
    /ENOSPC/,
  );
  assert.equal(unlinkCalls.length, 1);
  assert.ok(unlinkCalls[0].startsWith('/x/store.txt.tmp-'));
});

test('writeFileAtomic: a rename failure is cleaned up (best-effort unlink of the tmp file) and rethrown unchanged', () => {
  const unlinkCalls = [];
  const writeFile = () => {};
  const rename = () => { throw new Error('EXDEV: cross-device link not permitted'); };
  const unlink = (p) => unlinkCalls.push(p);

  assert.throws(
    () => writeFileAtomic('/x/store.txt', 'a', { writeFile, rename, unlink }),
    /EXDEV/,
  );
  assert.equal(unlinkCalls.length, 1);
});

test('writeFileAtomic: an unlink failure during cleanup is swallowed — the original write/rename error still propagates', () => {
  const writeFile = () => {};
  const rename = () => { throw new Error('original failure'); };
  const unlink = () => { throw new Error('unlink also failed'); };

  assert.throws(
    () => writeFileAtomic('/x/store.txt', 'a', { writeFile, rename, unlink }),
    /original failure/,
  );
});

test('writeFileAtomic: on success, unlink is never called', () => {
  let unlinkCalled = false;
  const writeFile = () => {};
  const rename = () => {};
  const unlink = () => { unlinkCalled = true; };
  writeFileAtomic('/x/store.txt', 'a', { writeFile, rename, unlink });
  assert.equal(unlinkCalled, false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/bin-lib/atomic-write.test.js`
Expected: FAIL — `Cannot find module '../../plugin/bin/lib/atomic-write'`

- [ ] **Step 3: Write the implementation**

```javascript
// plugin/bin/lib/atomic-write.js
// Shared tmp-file-plus-rename atomic write primitive, factored out of four
// independent hand-rolled copies: bin/lib/json-store.js's writeJsonFile,
// bin/lib/log-decision/append.js's appendEntry, bin/lib/flow/manifest.js's
// writeManifest, and bin/lib/hooks/context.js's writeRunState (#1653). All
// four now wrap this one primitive.
//
// This module owns exactly the write mechanics: write to a per-process tmp
// file in the same directory as the target, rename it into place, and on
// any failure best-effort unlink the tmp file before rethrowing the
// original error unchanged. It deliberately does NOT create the target
// directory (only json-store.js's callers need that — the other three
// always write into an already-existing run dir) and does NOT decide
// whether a failure should propagate or degrade — every call site keeps
// that policy for itself (log-decision/append.js lets it propagate;
// flow/manifest.js and hooks/context.js catch it and return false/null).
'use strict';
const fs = require('fs');
const path = require('path');

// Overwrites `filePath` with `content` (a string), via a pid-suffixed tmp
// file in the same directory, then an atomic rename. Throws on a real
// failure (permissions, disk full, ENOSPC, EXDEV, etc.) after a best-effort
// attempt to remove the tmp file — the caller decides how to degrade.
function writeFileAtomic(filePath, content, { writeFile = fs.writeFileSync, rename = fs.renameSync, unlink = fs.unlinkSync } = {}) {
  const dir = path.dirname(filePath);
  const tmpPath = path.join(dir, `${path.basename(filePath)}.tmp-${process.pid}`);
  try {
    writeFile(tmpPath, content);
    rename(tmpPath, filePath);
  } catch (err) {
    try { unlink(tmpPath); } catch { /* best-effort cleanup */ }
    throw err;
  }
}

module.exports = { writeFileAtomic };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/bin-lib/atomic-write.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/atomic-write.js tests/bin-lib/atomic-write.test.js
git commit -m "Add shared writeFileAtomic primitive

refs #1653"
```

---

### Task 2: Migrate `json-store.js`'s `writeJsonFile` onto the primitive

**Files:**
- Modify: `plugin/bin/lib/json-store.js:1-42`

**Interfaces:**
- Consumes: `writeFileAtomic(filePath, content, { writeFile, rename, unlink })` from Task 1.
- Produces: `writeJsonFile(filePath, data, opts)` — unchanged public signature, now additionally accepts an optional `unlink` override in `opts` (defaults to `fs.unlinkSync`).

- [ ] **Step 1: Edit the file**

Replace the current header comment and `writeJsonFile` body:

```javascript
// plugin/bin/lib/json-store.js
// Shared degrade-open JSON-file read/write shape, factored out of
// bin/lib/declined-learning/store.js and bin/lib/transcript-judge/
// watermark.js — both hand-rolled the identical "read+parse, missing/corrupt
// -> fallback; write, mkdir the parent first" pair, byte-for-byte, before
// this file existed. Each caller keeps its own path resolution and any
// extra shape validation (e.g. store.js additionally rejects a parsed array)
// on top of these two primitives. The atomic tmp-file-plus-rename write
// itself is bin/lib/atomic-write.js's writeFileAtomic (#1653) — this module
// only adds the mkdir-the-parent-first step none of that primitive's other
// three consumers need.
'use strict';
const fs = require('fs');
const path = require('path');
const { writeFileAtomic } = require('./atomic-write');

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
// needed, via bin/lib/atomic-write.js's writeFileAtomic — same shape as
// bin/lib/hooks/context.js's writeRunState — so a reader, or a racing
// unlocked writer (a lock-acquire timeout is fail-open by design; see
// ../file-lock.js), never observes a torn/partial JSON file. Throws on a
// real failure (permissions, disk full, etc.) — the caller decides how to
// degrade; this module doesn't silently eat the error.
function writeJsonFile(filePath, data, { mkdirSync = fs.mkdirSync, writeFile = fs.writeFileSync, rename = fs.renameSync, unlink = fs.unlinkSync } = {}) {
  const dir = path.dirname(filePath);
  mkdirSync(dir, { recursive: true });
  writeFileAtomic(filePath, JSON.stringify(data, null, 2), { writeFile, rename, unlink });
}

module.exports = { readJsonFile, writeJsonFile };
```

- [ ] **Step 2: Run the existing test suite to verify it still passes unmodified**

Run: `node --test tests/bin-lib/json-store.test.js`
Expected: PASS (7 tests, unchanged from before this edit)

- [ ] **Step 3: Commit**

```bash
git add plugin/bin/lib/json-store.js
git commit -m "Migrate json-store.js's writeJsonFile onto writeFileAtomic

refs #1653"
```

---

### Task 3: Migrate `log-decision/append.js`'s `appendEntry` onto the primitive

**Files:**
- Modify: `plugin/bin/lib/log-decision/append.js:100-154`

**Interfaces:**
- Consumes: `writeFileAtomic(filePath, content)` from Task 1 (defaults only — this call site never overrides `writeFile`/`rename`/`unlink`).
- Produces: `appendEntry({ runDir, section, entry })` — unchanged public signature and return shape (`{ file, created }`), unchanged rethrow-on-failure behavior.

- [ ] **Step 1: Edit the file**

Add the import near the top (alongside the existing `../file-lock` require):

```javascript
const { withLock } = require('../file-lock');
const { writeFileAtomic } = require('../atomic-write');
```

Replace the tail of `appendEntry` (the tmp-write-rename block) — from the doc comment through the closing of the function:

```javascript
// { runDir, section?, entry } -> { file, created }. Append-only; never rewrites prior lines.
//
// Two concurrent invocations against the same run dir (e.g. two `node
// bin/log-decision.js` processes) do a read-modify-write of decisions.md — an
// unguarded pair can each read the same pre-append content and each overwrite
// the other's line (#816). Guarded two ways, mirroring bin/lib/flow/manifest.js's
// writeManifest: the whole read-modify-write-rename sequence runs under
// ../file-lock.js's mkdir-based mutex (so a second writer's read can't start
// until the first's rename has landed), and the write itself goes through
// bin/lib/atomic-write.js's writeFileAtomic (#1653), which writes a
// per-process tmp file then fs.renameSync's atomically over decisions.md (so
// a reader never observes a torn/partial file even without the lock). The
// lock is best-effort/fail-open (file-lock.js's own contract) — a write that
// can't acquire it in time still proceeds unlocked rather than hang the
// caller.
function appendEntry({ runDir, section, entry }) {
  const lockPath = path.join(runDir, '.decisions.lock');
  return withLock(lockPath, () => {
    const file = path.join(runDir, 'decisions.md');
    let created = false;
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      created = true;
      text = '';
    }
    if (text && !text.endsWith('\n')) text += '\n';
    let finalText;
    if (!section) {
      finalText = text + entry + '\n';
    } else {
      const heading = `## ${section}`;
      const lines = text ? text.split('\n') : [];
      if (lines.length && lines[lines.length - 1] === '') lines.pop();
      const start = lines.indexOf(heading);
      if (start === -1) {
        lines.push(heading, entry);
      } else {
        let end = lines.length;
        for (let i = start + 1; i < lines.length; i++) { if (/^## /.test(lines[i])) { end = i; break; } }
        lines.splice(end, 0, entry);
      }
      finalText = lines.join('\n') + '\n';
    }
    writeFileAtomic(file, finalText);
    return { file, created };
  });
}
```

- [ ] **Step 2: Run the existing test suite to verify it still passes unmodified**

Run: `node --test tests/bin-lib/log-decision/append.test.js`
Expected: PASS (8 tests, including the 8-worker concurrent-CLI-process test, unchanged from before this edit)

- [ ] **Step 3: Commit**

```bash
git add plugin/bin/lib/log-decision/append.js
git commit -m "Migrate log-decision/append.js's appendEntry onto writeFileAtomic

refs #1653"
```

---

### Task 4: Migrate `flow/manifest.js`'s `writeManifest` onto the primitive

**Files:**
- Modify: `plugin/bin/lib/flow/manifest.js:89-106`

**Interfaces:**
- Consumes: `writeFileAtomic(filePath, content)` from Task 1 (defaults only).
- Produces: `writeManifest(runDir, manifest)` — unchanged public signature and return shape (`true`/`false`).

- [ ] **Step 1: Edit the file**

Add the import near the top (alongside the existing `fs`/`path` requires):

```javascript
const fs = require('fs');
const path = require('path');
const { writeFileAtomic } = require('../atomic-write');
```

Replace `writeManifest`:

```javascript
// Write via bin/lib/atomic-write.js's writeFileAtomic (#1653) — same pattern
// as bin/lib/hooks/context.js's writeRunState, for the same reason:
// fs.renameSync is atomic on every platform Node supports (same dir, same
// filesystem), so a crash mid-write during a long multi-spec run (the exact
// scenario #690 exists to survive) leaves the previous manifest.yml intact
// instead of a torn/partial file.
function writeManifest(runDir, manifest) {
  const finalPath = manifestPath(runDir);
  try {
    writeFileAtomic(finalPath, serializeManifestYaml(manifest));
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 2: Run the existing test suite to verify it still passes unmodified**

Run: `node --test tests/bin-lib/flow/manifest.test.js`
Expected: PASS (11 tests, unchanged from before this edit)

- [ ] **Step 3: Commit**

```bash
git add plugin/bin/lib/flow/manifest.js
git commit -m "Migrate flow/manifest.js's writeManifest onto writeFileAtomic

refs #1653"
```

---

### Task 5: Migrate `hooks/context.js`'s `writeRunState` onto the primitive

**Files:**
- Modify: `plugin/bin/lib/hooks/context.js:493-520`

**Interfaces:**
- Consumes: `writeFileAtomic(filePath, content)` from Task 1 (defaults only).
- Produces: `writeRunState(runDir, patch)` — unchanged public signature and return shape (updated state object, or `null` on failure); unchanged lock acquire/release around the write.

- [ ] **Step 1: Edit the file**

Add the import near the top (alongside the existing `./worktree-detect` require):

```javascript
const wtDetect = require('./worktree-detect');
const { writeFileAtomic } = require('../atomic-write');
```

Replace `writeRunState`:

```javascript
// Read-modify-write on run-state.json, guarded by acquireRunStateLock above.
// Two concurrent writers (e.g. a `close-run` racing session-end's own hook,
// or two record-worktree/close-run invocations against the same run dir —
// both anticipated scenarios per this file's own wd-foreign-session logic)
// previously could each read the same pre-write state and one writer's
// patch would silently overwrite the other's, e.g. resurrecting a worktree
// assignment a close-run call had just cleared.
function writeRunState(runDir, patch) {
  const lock = acquireRunStateLock(runDir);
  const finalPath = path.join(runDir, 'run-state.json');
  try {
    const next = { ...(readRunState(runDir) || {}), ...patch, updatedAt: new Date().toISOString() };
    // bin/lib/atomic-write.js's writeFileAtomic (#1653): writes a per-process
    // tmp file then fs.renameSync's atomically over the real path, so a
    // reader or a racing unlocked writer can never observe a torn/partial
    // JSON file, and a crash mid-write leaves the previous state intact
    // instead of a half-written file.
    writeFileAtomic(finalPath, JSON.stringify(next, null, 2) + '\n');
    return next;
  } catch {
    return null;
  } finally {
    releaseRunStateLock(lock);
  }
}
```

- [ ] **Step 2: Run the existing test suites to verify they still pass unmodified**

Run: `node --test tests/hooks-context.test.js tests/hooks-context-anchoring.test.js`
Expected: PASS (both suites, unchanged from before this edit — including the concurrent-writer and fail-open-lock tests)

- [ ] **Step 3: Commit**

```bash
git add plugin/bin/lib/hooks/context.js
git commit -m "Migrate hooks/context.js's writeRunState onto writeFileAtomic

refs #1653"
```

---

### Task 6: Full regression check across the primitive and all four consumers

**Files:** none (verification only)

- [ ] **Step 1: Run the full targeted suite**

Run: `node --test tests/bin-lib/atomic-write.test.js tests/bin-lib/json-store.test.js tests/bin-lib/log-decision/append.test.js tests/bin-lib/flow/manifest.test.js tests/hooks-context.test.js tests/hooks-context-anchoring.test.js`
Expected: PASS — every test across all six files, zero failures.

- [ ] **Step 2: No commit** — this task is verification-only; Task 1-5 already committed the actual changes. If any test fails here, fix the regression in the task whose commit introduced it (do not paper over with a new unrelated change) and re-run this full command before proceeding.
