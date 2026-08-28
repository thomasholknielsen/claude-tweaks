# Archive-merged move-failed diagnostics (#1290) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture and surface the real OS error behind `archive-merged.js`'s `move-failed` reconcile outcome, fix the actual reproducible cause behind the specific stuck run dir #1290 names, and finish archiving that one real run dir on this machine.

**Architecture:** `plugin/bin/lib/reconcile/archive-merged.js`'s four `move-failed`-producing `catch` blocks currently discard the thrown `Error` entirely (bare `catch {}`), so a filed residue issue carries only the string `'move-failed'` with no diagnosable cause. `trackArchiveResult` already threads a `lastError` param into `cache.js`'s `recordResidueFailure` and `escalate-residue.js`'s `escalateResidue` (mirroring `reap-merged.js`'s sibling `trackReapResidue`/`removal-failed` pattern) — it just never receives one today. Investigation during shaping (2026-08-23) and again during this build confirms a second, undocumented bug is the actual *live* cause of #1290's reported streak: `isOrphanedMint` classifies a run dir as an orphaned dispatch mint purely from "no top-level `config.yml` + older than 24h," with no check for whether an archive twin already exists — so an already-partially-archived, adopted multi-spec run dir (this one: `work/` already `git mv`'d into its archive twin and committed on 2026-08-10) gets routed into `archiveOrphanedMint`'s whole-directory `fs.renameSync`, which throws `ENOTEMPTY` against the non-empty destination the earlier archival pass left behind.

**Tech Stack:** Node.js (`fs`, `path`), `node --test`.

**Spec:** `work/1290-spec.md` (materialized from GitHub issue #1290)

## Global Constraints

- Never modify anything related to issue #1341 (a distinct, similarly-named sibling issue — `removal-failed`, not `move-failed`) — out of scope for this record.
- Every `catch` block touched must capture `err` and never re-introduce a bare `catch {}` that discards it.
- No new dependency: use only `fs`/`path`, already imported in `archive-merged.js`.
- `npm test` must be green (6500+ tests) before this plan is considered done — a subset passing is not sufficient.

---

### Task 1: Fix `isOrphanedMint`'s archive-twin blind spot

**Files:**
- Modify: `plugin/bin/lib/reconcile/archive-merged.js:30-42` (the `isOrphanedMint` function)
- Test: `tests/reconcile.test.js` (existing `isOrphanedMint`/`archiveOrphanedMint` tests live around line 484-552)

**Interfaces:**
- Consumes: nothing from a later task.
- Produces: `isOrphanedMint(dir, now = Date.now())` — unchanged signature, corrected behavior: returns `false` when `path.join(path.dirname(dir), 'archive', path.basename(dir))` already exists on disk, in addition to the existing `config.yml`-presence check.

- [ ] **Step 1: Write the failing regression test**

Add this test to `tests/reconcile.test.js`, immediately after the existing test `'isOrphanedMint: true when empty (no config.yml) and older than the TTL'` (search for that exact string to find the insertion point — it currently ends around line 527, just before `'archiveMerged: an orphaned mint older than the TTL is archived...'`):

```javascript
// #1290: an already-partially-archived, long-idle multi-spec run (its
// top-level work/ already `git mv`'d into an archive twin and committed,
// only gitignored bookkeeping — events.jsonl/run-state.json/staged/ —
// left behind) has no top-level config.yml, same as a bare dispatch mint.
// Without an archive-twin check, isOrphanedMint misclassified this shape
// as orphaned, and archiveOrphanedMint's whole-directory rename then threw
// ENOTEMPTY against the non-empty destination — the actual live cause of
// #1290's reported 'move-failed' streak (confirmed via direct
// fs.renameSync reproduction against the real stuck path).
test('isOrphanedMint: false when an archive twin already exists, even with no config.yml and past the TTL', () => {
  const { isOrphanedMint, ORPHAN_MINT_TTL_MS } = require('../plugin/bin/lib/reconcile/archive-merged');
  const root = bareRepoRoot();
  const runId = '2026-08-09T122833-spec-271-267';
  const dir = mintEmptyRunDir(root, runId, { ageMs: ORPHAN_MINT_TTL_MS + 60000 });
  const archiveDir = path.join(root, '.claude-tweaks', 'pipelines', 'archive', runId);
  fs.mkdirSync(path.join(archiveDir, 'spec-267', 'work'), { recursive: true });
  fs.writeFileSync(path.join(archiveDir, 'spec-267', 'work', '267-spec.md'), '# spec\n');
  assert.strictEqual(isOrphanedMint(dir), false);
});

test('archiveMerged: a run dir with an archive twin and no resolvable branch is skipped, not collided into the twin', () => {
  const { archiveMerged, ORPHAN_MINT_TTL_MS } = require('../plugin/bin/lib/reconcile/archive-merged');
  const root = bareRepoRoot();
  const runId = '2026-08-09T122833-spec-271-267';
  const dir = mintEmptyRunDir(root, runId, { ageMs: ORPHAN_MINT_TTL_MS + 60000 });
  fs.writeFileSync(path.join(dir, 'run-state.json'), JSON.stringify({
    worktree: '/nonexistent/worktree/path', status: 'interrupted',
  }));
  const archiveDir = path.join(root, '.claude-tweaks', 'pipelines', 'archive', runId);
  fs.mkdirSync(path.join(archiveDir, 'spec-267', 'work'), { recursive: true });
  fs.writeFileSync(path.join(archiveDir, 'spec-267', 'work', '267-spec.md'), '# spec\n');

  const result = archiveMerged({ cwd: root });

  assert.ok(!result.archived.includes(dir), 'not archived — no worktree left to resolve a branch/PR from');
  assert.ok(fs.existsSync(dir), 'the stuck run dir must be left in place, not partially collided into its twin');
  assert.strictEqual(
    fs.readFileSync(path.join(archiveDir, 'spec-267', 'work', '267-spec.md'), 'utf8'),
    '# spec\n',
    'the existing archive twin content must be undisturbed',
  );
});
```

`bareRepoRoot` and `mintEmptyRunDir` are existing helpers already defined earlier in this same test file (above the `isOrphanedMint` test block) — do not redefine them.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/reconcile.test.js`
Expected: both new tests FAIL — the first because `isOrphanedMint` returns `true` (it has no archive-twin check yet); the second because `archiveMerged` throws or reports `move-failed` instead of skipping cleanly (the whole-directory `fs.renameSync` collides with the pre-populated non-empty `archiveDir`).

- [ ] **Step 3: Fix `isOrphanedMint`**

In `plugin/bin/lib/reconcile/archive-merged.js`, replace:

```javascript
// A minted run dir that never got adopted: no config.yml (flow's Manifesto
// is what writes it) and older than the grace window. Pure — no I/O beyond
// the two stats already needed to answer the question.
function isOrphanedMint(dir, now = Date.now()) {
  if (fs.existsSync(path.join(dir, 'config.yml'))) return false;
  let mtimeMs;
  try {
    mtimeMs = fs.statSync(dir).mtimeMs;
  } catch {
    return false;
  }
  return (now - mtimeMs) > ORPHAN_MINT_TTL_MS;
}
```

with:

```javascript
// A minted run dir that never got adopted: no config.yml (flow's Manifesto
// is what writes it) and older than the grace window. Pure — no I/O beyond
// the stats already needed to answer the question.
//
// #1290: an existing archive twin is proof of adoption even without a
// top-level config.yml — archiveRunDir creates archiveDir the moment it has
// real (work/ or spec-N) content to move, which a bare dispatch mint never
// has. Skipping that check here misrouted an already-partially-archived,
// long-idle run (its worktree/branch since reaped, so the normal
// merged-PR path can no longer resolve it either) into
// archiveOrphanedMint's whole-directory rename, which throws ENOTEMPTY
// against the non-empty destination the earlier archival pass left behind
// — the actual live cause behind #1290's reported 'move-failed' streak.
function isOrphanedMint(dir, now = Date.now()) {
  if (fs.existsSync(path.join(dir, 'config.yml'))) return false;
  const archiveDir = path.join(path.dirname(dir), 'archive', path.basename(dir));
  if (fs.existsSync(archiveDir)) return false;
  let mtimeMs;
  try {
    mtimeMs = fs.statSync(dir).mtimeMs;
  } catch {
    return false;
  }
  return (now - mtimeMs) > ORPHAN_MINT_TTL_MS;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/reconcile.test.js`
Expected: PASS (both new tests, and every pre-existing test in the file — do not just check the two new ones).

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/reconcile/archive-merged.js tests/reconcile.test.js
git commit -m "Fix isOrphanedMint archive-twin blind spot — refs #1290"
```

---

### Task 2: Capture the real OS error at every move-failed site

**Files:**
- Modify: `plugin/bin/lib/reconcile/archive-merged.js:48-58` (`archiveOrphanedMint`), `:325-338` (top-level plain-move loop), `:340-389` (per-spec `mkdirSync` + plain-move loop) — exact line numbers shift after Task 1's edit; locate by the function/comment names below, not the numbers.
- Test: `tests/bin-lib/reconcile/archive-merged.test.js`

**Interfaces:**
- Consumes: nothing from Task 1 (independent edit region of the same file — merge cleanly since Task 1 only touches `isOrphanedMint`).
- Produces: every `{ ok: false, reason: 'move-failed' | 'move-failed-partial-revert' }` result returned by this file now also carries a `detail` string field (`formatErr(err)` — `"{err.code}: {err.message}"` when `err.code` is set, else `String(err.message || err)`). Task 3 consumes `result.detail`.

- [ ] **Step 1: Write the failing tests**

In `tests/bin-lib/reconcile/archive-merged.test.js`, add `archiveOrphanedMint` to the existing destructured import at the top of the file:

```javascript
const {
  archiveRunDir, listSpecDirs, decideArchive, readConsoleState, isOrphanedMint, trackArchiveResult,
  archiveOrphanedMint,
} = require('../../../plugin/bin/lib/reconcile/archive-merged');
```

Find the test `'archiveRunDir: a later gitignored top-level entry fails to move — the earlier one is reverted back to the run dir'` and add this assertion immediately after its existing `assert.equal(entryRenameCount, 3, ...)` line:

```javascript
  // #1290: the thrown error's own message must survive into the result,
  // not be discarded by a bare `catch {}` — this is what makes a future
  // move-failed occurrence diagnosable from decisions.md/the escalated
  // issue body without a manual reproduction.
  assert.match(result.detail, /simulated failure: fs\.renameSync \(2nd entry\)/);
```

Find the test `'archiveRunDir: a later gitignored spec-N entry fails to move — the earlier one in that spec dir is reverted'` and add this assertion immediately after its existing `assert.equal(result.reason, 'move-failed');` line:

```javascript
  // #1290: same capture requirement for the per-spec-dir loop.
  assert.match(result.detail, /simulated failure: fs\.renameSync \(spec entry\)/);
```

Add this new test immediately before the existing `'#644 Deliverable 2 — trackArchiveResult is archiveMerged's one choke point...'` comment block (search for that exact comment text to find the insertion point):

```javascript
// #1290: archiveOrphanedMint's own catch had the same bare-`catch` gap as
// archiveRunDir's two loops — same fix, same requirement.
test('archiveOrphanedMint: a renameSync failure surfaces the OS error code/message in result.detail', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-merged-mint-'));
  const runId = '2026-08-01T090000-record-500';
  const dir = path.join(root, '.claude-tweaks', 'pipelines', runId);
  fs.mkdirSync(dir, { recursive: true });

  t.mock.method(fs, 'renameSync', () => {
    const err = new Error('simulated: directory not empty');
    err.code = 'ENOTEMPTY';
    throw err;
  });

  const result = archiveOrphanedMint(root, dir);
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.equal(result.reason, 'move-failed');
  assert.match(result.detail, /ENOTEMPTY/);
  assert.match(result.detail, /simulated: directory not empty/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/bin-lib/reconcile/archive-merged.test.js`
Expected: 3 FAIL (the two extended tests' new `assert.match` on `result.detail` — `undefined` does not match; the new `archiveOrphanedMint` test — `result.detail` is `undefined`). Every other test in the file still passes.

- [ ] **Step 3: Add `formatErr` and wire it into all four catch sites**

In `plugin/bin/lib/reconcile/archive-merged.js`, immediately before the `isOrphanedMint` function (i.e. right after the `ORPHAN_MINT_TTL_MS` constant), add:

```javascript
// #1290: a bare `err` -> `{ code, message }` never gets discarded past this
// point — every move-failed catch site below threads its result through
// this so `decisions.md`/the escalated issue body carries the real OS-level
// cause (EACCES/EBUSY/ENOTEMPTY/…) instead of the bare 'move-failed' string
// that made #1290 itself undiagnosable without manual reproduction.
function formatErr(err) {
  if (!err) return 'unknown error';
  return err.code ? `${err.code}: ${err.message}` : String(err.message || err);
}
```

In `archiveOrphanedMint`, change:

```javascript
  try {
    fs.mkdirSync(path.dirname(archiveDir), { recursive: true });
    fs.renameSync(dir, archiveDir);
  } catch {
    return { ok: false, reason: 'move-failed' };
  }
```

to:

```javascript
  try {
    fs.mkdirSync(path.dirname(archiveDir), { recursive: true });
    fs.renameSync(dir, archiveDir);
  } catch (err) {
    return { ok: false, reason: 'move-failed', detail: formatErr(err) };
  }
```

In the top-level plain-move loop inside `archiveRunDir` (the loop over `entries.filter((n) => n !== 'work' && !specDirs.includes(n))`), change:

```javascript
      try {
        fs.renameSync(src, dest);
      } catch {
        const fullyReverted = revertPlainMoves(movedThisPass);
        return { ok: false, reason: fullyReverted ? 'move-failed' : 'move-failed-partial-revert' };
      }
      movedThisPass.push([src, dest]);
      movedEntries.push(name);
```

to:

```javascript
      try {
        fs.renameSync(src, dest);
      } catch (err) {
        const fullyReverted = revertPlainMoves(movedThisPass);
        return {
          ok: false,
          reason: fullyReverted ? 'move-failed' : 'move-failed-partial-revert',
          detail: formatErr(err),
        };
      }
      movedThisPass.push([src, dest]);
      movedEntries.push(name);
```

In the per-spec-dir loop (the `mkdirSync(specArchiveDir, ...)` call and the `fs.renameSync(src, dest)` loop immediately below it, inside the `for (const specName of specDirs)` block), change:

```javascript
      try {
        fs.mkdirSync(specArchiveDir, { recursive: true });
      } catch {
        return { ok: false, reason: 'move-failed' };
      }
    }
    const specMovedThisPass = [];
    for (const name of specRemaining) {
      const src = path.join(specDir, name);
      if (!fs.existsSync(src)) continue;
      const dest = path.join(specArchiveDir, name);
      try {
        fs.renameSync(src, dest);
      } catch {
        const fullyReverted = revertPlainMoves(specMovedThisPass);
        return { ok: false, reason: fullyReverted ? 'move-failed' : 'move-failed-partial-revert' };
      }
```

to:

```javascript
      try {
        fs.mkdirSync(specArchiveDir, { recursive: true });
      } catch (err) {
        return { ok: false, reason: 'move-failed', detail: formatErr(err) };
      }
    }
    const specMovedThisPass = [];
    for (const name of specRemaining) {
      const src = path.join(specDir, name);
      if (!fs.existsSync(src)) continue;
      const dest = path.join(specArchiveDir, name);
      try {
        fs.renameSync(src, dest);
      } catch (err) {
        const fullyReverted = revertPlainMoves(specMovedThisPass);
        return {
          ok: false,
          reason: fullyReverted ? 'move-failed' : 'move-failed-partial-revert',
          detail: formatErr(err),
        };
      }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/bin-lib/reconcile/archive-merged.test.js`
Expected: PASS — every test in the file, not just the 3 new/extended ones.

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/reconcile/archive-merged.js tests/bin-lib/reconcile/archive-merged.test.js
git commit -m "Capture the real OS error at every archive-merged move-failed site — refs #1290"
```

---

### Task 3: Thread the captured detail into trackArchiveResult

**Files:**
- Modify: `plugin/bin/lib/reconcile/archive-merged.js` (the `trackArchiveResult` function — search for `function trackArchiveResult`)
- Test: `tests/bin-lib/reconcile/archive-merged.test.js`

**Interfaces:**
- Consumes: `result.detail` from Task 2 (the `{ ok, reason, detail }` shape every move-failed producer now returns).
- Produces: nothing consumed by a later task — this is the last code task.

- [ ] **Step 1: Write the failing test**

Add this test to `tests/bin-lib/reconcile/archive-merged.test.js`, immediately before the existing test `'trackArchiveResult: only tracks move-failed — a different failure reason never enters the counter'`:

```javascript
// #1290 AC — the captured OS error must reach both the persisted streak
// entry (so a later `listResidueFailures` read/report sees it) and the
// escalated issue body (escalate-residue.js's `lastError` line), not just
// the in-process result.
test('trackArchiveResult: result.detail threads through as lastError into the cache entry and the escalate call', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-merged-track-detail-'));
  const calls = [];
  const escalate = (args) => { calls.push(args); return { status: 'filed', number: 1 }; };
  const dir = path.join(root, '.claude-tweaks', 'pipelines', '2026-01-01T000000-stuck-detail');

  for (let i = 0; i < RESIDUE_ESCALATE_THRESHOLD; i++) {
    trackArchiveResult(
      root, 'o/r', dir,
      { ok: false, reason: 'move-failed', detail: 'ENOTEMPTY: directory not empty' },
      { escalate },
    );
  }
  assert.equal(calls.length, 1);
  assert.equal(calls[0].lastError, 'ENOTEMPTY: directory not empty');

  const entry = listResidueFailures(root).find((r) => r.path === dir);
  assert.ok(entry, 'expected a tracked residue entry for this dir');
  assert.equal(entry.lastError, 'ENOTEMPTY: directory not empty');
});
```

`RESIDUE_ESCALATE_THRESHOLD` and `listResidueFailures` are already imported at the top of this test file (from `plugin/bin/lib/reconcile/cache`) — do not re-import.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/bin-lib/reconcile/archive-merged.test.js`
Expected: FAIL — `calls[0].lastError` is `undefined` (trackArchiveResult never passes it today), and `entry.lastError` is `null`.

- [ ] **Step 3: Wire `result.detail` through as `lastError`**

In `plugin/bin/lib/reconcile/archive-merged.js`'s `trackArchiveResult`, change:

```javascript
  if (result.reason !== 'move-failed') return;
  const streak = recordResidueFailure(root, 'move-failed', dir);
  if (!streak.shouldEscalate) return;
  try {
    escalate({
      repo: repoSlug, reason: 'move-failed', targetPath: dir,
      count: streak.count, firstFailedAt: streak.firstFailedAt,
    });
  } catch { /* best-effort — never let escalation turn an archive skip into a thrown error */ }
```

to:

```javascript
  if (result.reason !== 'move-failed') return;
  // #1290: `result.detail` (formatErr's captured code+message) flows into
  // both the cache entry (so a later `listResidueFailures` read/report sees
  // it) and the escalated issue body (residueBody's `lastError` line) — the
  // gap #1290 itself was filed to close.
  const streak = recordResidueFailure(root, 'move-failed', dir, { lastError: result.detail });
  if (!streak.shouldEscalate) return;
  try {
    escalate({
      repo: repoSlug, reason: 'move-failed', targetPath: dir,
      count: streak.count, firstFailedAt: streak.firstFailedAt, lastError: result.detail,
    });
  } catch { /* best-effort — never let escalation turn an archive skip into a thrown error */ }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/bin-lib/reconcile/archive-merged.test.js`
Expected: PASS — every test in the file.

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/reconcile/archive-merged.js tests/bin-lib/reconcile/archive-merged.test.js
git commit -m "Thread archive-merged's captured error into trackArchiveResult's lastError — refs #1290"
```

---

### Task 4: Full-suite verification

**Files:** none (verification-only task).

**Interfaces:**
- Consumes: the complete, committed state from Tasks 1-3.
- Produces: nothing — this is the plan's test gate.

- [ ] **Step 1: Run the full suite**

Run: `npm test`
Expected: PASS, 0 failures. If `tests/bin-lib/reconcile/pr-state.test.js`'s `resolvePrStateAsync: does not block the event loop` test is the only failure, re-run that one file alone (`node --test tests/bin-lib/reconcile/pr-state.test.js`) — this is a documented pre-existing event-loop flake under concurrent machine load, unrelated to this plan's changes. Expect 18/18 passing in isolation; if it fails in isolation too, stop and treat it as real.

- [ ] **Step 2: Re-run the discrimination proof (red/green)**

Confirm the new/extended tests actually discriminate, not just pass by coincidence: temporarily restore the pre-Task-1 version of `plugin/bin/lib/reconcile/archive-merged.js` via `git show <commit-before-task-1>:plugin/bin/lib/reconcile/archive-merged.js`, swap it in, re-run `node --test tests/reconcile.test.js tests/bin-lib/reconcile/archive-merged.test.js`, confirm exactly the 5 new/extended assertions fail (not more, not fewer), then restore the fixed version (copy back, do not use `git stash`) and re-confirm green.

---

### Task 5: Finish archiving the real stuck run dir this issue names

**Files:**
- Move (filesystem, not git): `.claude-tweaks/pipelines/2026-08-09T122833-spec-271-267/{events.jsonl,run-state.json,staged/}` (main checkout) → the same relative paths under `.claude-tweaks/pipelines/archive/2026-08-09T122833-spec-271-267/`; likewise each `spec-267/staged/` and `spec-271/staged/` into the corresponding archive twin subdirectory.

**Interfaces:**
- Consumes: nothing from earlier tasks — this is a pure filesystem operation on gitignored pipeline-bookkeeping content in the main checkout, independent of the source-code fix in Tasks 1-3 (Deliverable 2/3 of #1290, distinct from Deliverable 1). `.claude-tweaks/pipelines/` writes are an explicit `worktree-always` gate exemption (confirmed precedent: `docs/superpowers/plans/2026-08-27-archive-orphaned-pipeline-run-dir-1094.md`'s Task 1, which performed the same class of main-checkout `.claude-tweaks/pipelines/` fs move from an isolated worktree session).
- Produces: nothing consumed by a later task.

- [ ] **Step 1: Confirm current state**

```bash
ls -la "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude-tweaks/pipelines/2026-08-09T122833-spec-271-267"
ls -la "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude-tweaks/pipelines/archive/2026-08-09T122833-spec-271-267"
```

Expected (as confirmed during this build's investigation): the source dir still has `events.jsonl`, `run-state.json`, `staged/` (empty), `spec-267/staged/` (empty), `spec-271/staged/` (empty) — `work/` already gone (archived and committed on 2026-08-10). The archive twin has `spec-267/work/267-spec.md` and `spec-271/work/271-spec.md` only. Nothing here is git-tracked (`git -C "{worktree}" check-ignore -v` on `events.jsonl` under this path returns exit 0, matching `.gitignore:11`'s `.claude-tweaks/pipelines/*/*` rule) — this step is pure `fs`, no git call needed or made.

- [ ] **Step 2: Move the remaining entries into the archive twin**

```javascript
const fs = require('fs');
const path = require('path');
const src = '/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude-tweaks/pipelines/2026-08-09T122833-spec-271-267';
const dst = '/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude-tweaks/pipelines/archive/2026-08-09T122833-spec-271-267';
for (const name of ['events.jsonl', 'run-state.json', 'staged']) {
  const from = path.join(src, name);
  if (fs.existsSync(from)) fs.renameSync(from, path.join(dst, name));
}
for (const spec of ['spec-267', 'spec-271']) {
  const from = path.join(src, spec, 'staged');
  if (fs.existsSync(from)) fs.renameSync(from, path.join(dst, spec, 'staged'));
  try { fs.rmdirSync(path.join(src, spec)); } catch { /* best-effort */ }
}
try { fs.rmdirSync(src); } catch { /* best-effort */ }
```

Run this as a single `node -e "..."` invocation (not a multi-step Bash sequence — the worktree-isolation guard rejects compound shell forms even for allowed paths).

- [ ] **Step 3: Verify**

```bash
ls "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude-tweaks/pipelines/2026-08-09T122833-spec-271-267" 2>&1
ls -la "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude-tweaks/pipelines/archive/2026-08-09T122833-spec-271-267"
```

Expected: the first command errors with "No such file or directory" (source dir fully removed). The second shows `events.jsonl`, `run-state.json`, `staged/`, `spec-267/{work,staged}`, `spec-271/{work,staged}` all present under the archive path. This confirms Deliverable 2/3: the specific path #1290 names is now fully archived (no entries remain outside `archive/`) — closing the record with "confirmed fully archived; underlying cause was `isOrphanedMint`'s archive-twin blind spot (Task 1), not a genuinely stale/transient failure."

No commit — this task touches only gitignored main-checkout state, nothing tracked by git.

---

## Self-Review

**Spec coverage:** Deliverable 1 (capture the real error) → Tasks 2-3. Deliverable 2 (re-run/determine outcome) → Task 5's before/after state, explained by Task 1's fix. Deliverable 3 (fix if real, close-noting if stale) → Task 1 is the real fix; Task 5's verification is the closing evidence. Acceptance Criteria's "verifiable via a test that forces an fs.renameSync failure and asserts the captured detail" → Task 2's tests. "This path... confirmed either fully archived... or reproducibly still failing" → Task 5.

**Placeholder scan:** none found — every step has literal code/commands.

**Type consistency:** `formatErr(err) -> string` used identically across all four call sites in Task 2; `result.detail` read the same way in Task 3 as it's written in Task 2.
