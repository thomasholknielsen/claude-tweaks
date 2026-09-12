# Orphaned-Mint Tracked-Content Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make reconcile's orphaned-mint sweep archive a state-less run dir that still holds git-tracked content through the git-aware `archiveRunDir` (git mv + commit) instead of a bare `fs.renameSync`, so the main checkout is never left with an uncommitted deletion.

**Architecture:** One new private helper in `plugin/bin/lib/reconcile/archive-merged.js`, `hasTrackedContent(root, dir)`, answers "does `git ls-files` list anything under this dir?". `archiveMerged`'s existing `isOrphanedMint` branch uses it to pick `archiveRunDir` (tracked) or `archiveOrphanedMint` (untracked). Both archivers already share the `(root, dir)` signature and the `{ ok, reason }` contract, so the branch's existing `trackArchiveResult` / `skipped` / `archived` handling is unchanged and a refused `archiveRunDir` surfaces exactly like any other refusal. Two comments that document the old gap are updated to describe the new routing.

**Tech Stack:** Node 18+ CommonJS, `node --test` + `node:assert/strict`, real temp git repos via the test file's existing `makeRepo` / `commitPath` / `installFailingPreCommitHook` helpers.

**Spec:** `.claude-tweaks/pipelines/2026-09-11T161422-spec-2227/work/2227-spec.md`

## Global Constraints

- No new files. Both tasks modify `plugin/bin/lib/reconcile/archive-merged.js` and `tests/bin-lib/reconcile/archive-merged.test.js` only.
- `archiveOrphanedMint`'s own body is not changed — the routing decision lives in `archiveMerged`, so every existing `archiveOrphanedMint` unit test keeps passing unchanged.
- `archiveRunDir` is not changed — it already handles a run dir with no `run-state.json` (its only reads are `listSpecDirs`, `fs.existsSync`, and `git ls-files`).
- Commit messages: `{Verb} {what} — {detail}` (imperative, no conventional-commit prefix), each ending with `refs #2227` — never `closes`/`fixes` (the run's PR body already carries `Fixes #2227`).
- Run only the targeted suite (`node --test tests/bin-lib/reconcile/archive-merged.test.js`) inside tasks; the full `npm test` runs centrally after both tasks.
- Every git/test command runs from the worktree root `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/record-2227` — verify with `pwd` and `git rev-parse --show-toplevel` before the first commit.

---

### Task 1: Route a tracked orphaned mint through `archiveRunDir`

**Files:**
- Modify: `plugin/bin/lib/reconcile/archive-merged.js:107-121` (the `archiveOrphanedMint` header comment), `:852-859` (the `isOrphanedMint` branch inside `archiveMerged`), and the `isAdHocStandaloneSuperseded` branch comment at `:935-940`
- Test: `tests/bin-lib/reconcile/archive-merged.test.js` (append after the `archiveOrphanedMint: archives cleanly onto an archive twin that already exists non-empty` test, which ends around line 990)

**Interfaces:**
- Consumes: `archiveRunDir(root, runDir) → { ok: true, movedEntries } | { ok: false, reason, ... }`, `archiveOrphanedMint(root, dir) → { ok: true } | { ok: false, reason, lastError }`, `runGit(args, cwd) → { failure, stdout, ... }` (all already in the module), `ORPHAN_MINT_TTL_MS` (already exported).
- Produces: `hasTrackedContent(root, dir) → boolean` — module-private, not exported. `archiveMerged`'s result shape is unchanged: `{ archived: string[], skipped: { runDir, reason }[] }`.

- [ ] **Step 1: Add `ORPHAN_MINT_TTL_MS` to the test file's import and write the two failing tests**

In `tests/bin-lib/reconcile/archive-merged.test.js`, change the destructuring import (lines 12-16) so `ORPHAN_MINT_TTL_MS` is included:

```js
const {
  archiveRunDir, listSpecDirs, decideArchive, readConsoleState, isOrphanedMint, trackArchiveResult,
  archiveMerged, lastOwnEventMs, isAbandonedInterrupted, archiveOrphanedMint, ORPHAN_MINT_TTL_MS,
  isStructurallyStuck, trackStuckSkip, STRUCTURALLY_STUCK_TTL_MS,
} = require('../../../plugin/bin/lib/reconcile/archive-merged');
```

Then append, immediately after the `archiveOrphanedMint: archives cleanly onto an archive twin that already exists non-empty` test:

```js
// --- #2227: orphaned mints that still hold git-tracked content ---

// A state-less run dir (no config.yml, no run-state.json) can still carry a
// git-tracked work/{n}-spec.md — record #1594's shape, where the run's state
// files only ever existed in the worktree copy. The bare fs.renameSync path
// left main with an unstaged deletion nothing committed; such a dir must go
// through archiveRunDir's git mv + commit instead.
test('archiveMerged: an orphaned mint carrying a git-tracked work/ spec is archived via a commit, leaving the tracked tree clean', () => {
  const root = fs.realpathSync(makeRepo());
  const runId = '2026-01-01T000000-record-2227';
  const runDir = path.join(root, '.claude-tweaks', 'pipelines', runId);
  commitPath(root, `.claude-tweaks/pipelines/${runId}/work/2227-spec.md`, '# 2227\n');
  const backdated = new Date(Date.now() - ORPHAN_MINT_TTL_MS * 2);
  fs.utimesSync(runDir, backdated, backdated);
  const headBefore = git(root, 'rev-parse', 'HEAD').trim();

  const result = archiveMerged({ cwd: root });

  assert.ok(result.archived.includes(runDir), `expected ${runDir} in archived, got ${JSON.stringify(result)}`);
  assert.equal(fs.existsSync(runDir), false, 'source run dir must be gone');
  assert.equal(
    fs.existsSync(path.join(root, '.claude-tweaks', 'pipelines', 'archive', runId, 'work', '2227-spec.md')),
    true,
    'spec must land under archive/',
  );
  assert.ok(
    trackedFiles(root).includes(`.claude-tweaks/pipelines/archive/${runId}/work/2227-spec.md`),
    'archived spec must be tracked at its new path (git mv, not fs rename)',
  );
  assert.notEqual(git(root, 'rev-parse', 'HEAD').trim(), headBefore, 'archival must land as a commit');
  // Scoped to tracked status only: the archive twin's run-state.json
  // ('archiving' stamp) is a genuine untracked sibling in this fixture (in
  // the real repo it is gitignored) and unrelated to what this test pins.
  const statusOut = git(root, 'status', '--porcelain', '--', '.claude-tweaks/pipelines');
  const trackedStatusLines = statusOut.split('\n').filter((line) => line && !line.startsWith('??'));
  assert.equal(trackedStatusLines.join('\n'), '', 'no unstaged deletion or staged rename may survive the pass');
});

// The fs-only path is unchanged for a genuinely untracked mint: no git mv,
// no commit, and no `archiving` stamp (archiveRunDir's own first write).
test('archiveMerged: an orphaned mint with no tracked content still takes the fs-only path with no commit', () => {
  const root = fs.realpathSync(makeRepo());
  const runId = '2026-01-01T000000-spec-untracked-mint';
  const runDir = path.join(root, '.claude-tweaks', 'pipelines', runId);
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, 'events.jsonl'), '');
  const backdated = new Date(Date.now() - ORPHAN_MINT_TTL_MS * 2);
  fs.utimesSync(runDir, backdated, backdated);
  const headBefore = git(root, 'rev-parse', 'HEAD').trim();

  const result = archiveMerged({ cwd: root });

  assert.ok(result.archived.includes(runDir), `expected ${runDir} in archived, got ${JSON.stringify(result)}`);
  assert.equal(fs.existsSync(runDir), false, 'source run dir must be gone');
  const archiveDir = path.join(root, '.claude-tweaks', 'pipelines', 'archive', runId);
  assert.equal(fs.existsSync(path.join(archiveDir, 'events.jsonl')), true, 'untracked entry must be moved as-is');
  assert.equal(git(root, 'rev-parse', 'HEAD').trim(), headBefore, 'fs-only path must not commit');
  assert.equal(fs.existsSync(path.join(archiveDir, 'run-state.json')), false, 'fs-only path never writes archiveRunDir\'s archiving stamp');
});
```

- [ ] **Step 2: Run the suite to verify the first new test fails and the second passes**

Run: `node --test tests/bin-lib/reconcile/archive-merged.test.js 2>&1 | grep -E "^not ok|^# (pass|fail)"`

Expected: exactly one `not ok` line, naming `archiveMerged: an orphaned mint carrying a git-tracked work/ spec is archived via a commit, leaving the tracked tree clean`. The failing assertion is the `trackedFiles(root).includes(...)` one (or the `notEqual(HEAD)` one) — the current fs-only path moves the file without git mv, so the old path shows as a deletion and no commit lands. The untracked-mint test passes already (it pins today's behavior). `# fail 1`.

- [ ] **Step 3: Add `hasTrackedContent` and route the orphaned-mint branch**

In `plugin/bin/lib/reconcile/archive-merged.js`, insert this helper immediately **before** `function isOrphanedMint(dir, now = Date.now()) {` (currently line 95):

```js
// #2227: a state-less run dir can still hold git-tracked content — a
// materialized work/{n}-spec.md whose run-state.json only ever existed in
// the worktree copy (record #1594's shape; materialize.md commits work/ on
// the branch, and it reaches the main checkout by merge with none of the
// gitignored state files alongside it). archiveOrphanedMint's bare
// fs.renameSync would leave that as an unstaged deletion nothing commits;
// archiveRunDir's git mv + commit is what tracked content needs, and it
// does not require run-state.json. `git ls-files -- <dir>` lists nothing
// for a genuinely untracked mint, which keeps that case on the fs-only path.
function hasTrackedContent(root, dir) {
  const listed = runGit(['ls-files', '--', dir], root);
  return !listed.failure && String(listed.stdout || '').trim().length > 0;
}
```

Then replace the `isOrphanedMint` branch inside `archiveMerged` (currently lines 852-859):

```js
    if (isOrphanedMint(dir)) {
      if (dryRun) { archived.push(dir); continue; }
      const result = archiveOrphanedMint(root, dir);
      trackArchiveResult(root, repoSlug, dir, result);
      if (!result.ok) { skipped.push({ runDir: dir, reason: result.reason }); continue; }
      archived.push(dir);
      continue;
    }
```

with:

```js
    if (isOrphanedMint(dir)) {
      if (dryRun) { archived.push(dir); continue; }
      // #2227: tracked content (a materialized work/ spec) needs archiveRunDir's
      // git mv + commit — same (root, dir) signature and {ok, reason} contract,
      // so the result handling below is shared. A bare mint with nothing
      // tracked keeps the fs-only move; see hasTrackedContent above.
      const result = hasTrackedContent(root, dir)
        ? archiveRunDir(root, dir)
        : archiveOrphanedMint(root, dir);
      trackArchiveResult(root, repoSlug, dir, result);
      if (!result.ok) { skipped.push({ runDir: dir, reason: result.reason }); continue; }
      archived.push(dir);
      continue;
    }
```

- [ ] **Step 4: Update the two comments that document the old gap**

Replace the first paragraph of `archiveOrphanedMint`'s header comment (currently lines 107-110):

```js
// An orphaned mint has nothing to git-mv (no work/, since flow never got far
// enough to materialize into it) and nothing to finalize as terminal (no
// run-state.json, since record-worktree never ran on it) — moving each
// top-level entry into its archive twin is the whole operation.
```

with:

```js
// An orphaned mint that reaches this function has nothing to git-mv and
// nothing to finalize as terminal (no run-state.json, since record-worktree
// never ran on it) — moving each top-level entry into its archive twin is
// the whole operation. A state-less dir that DOES carry tracked content (a
// materialized work/ spec) never gets here: archiveMerged's orphaned-mint
// branch routes it to archiveRunDir instead (#2227, hasTrackedContent above).
```

Replace the comment inside the `isAdHocStandaloneSuperseded` branch (currently lines 935-940):

```js
      // archiveRunDir, not archiveOrphanedMint: unlike a true orphaned mint, an
      // ad-hoc-standalone dir is a real dev session that can have materialized a
      // spec (a git-tracked work/ subtree) before being abandoned. archiveOrphanedMint
      // is a bare fs.renameSync with no tracked-entry guard — archiveRunDir's #593
      // guard (git-mv work/ + commit, refuse on any other tracked entry) is what this
      // path actually needs; same (root, dir) signature and {ok, reason} contract.
```

with:

```js
      // archiveRunDir, not archiveOrphanedMint: an ad-hoc-standalone dir is a
      // real dev session that can have materialized a spec (a git-tracked work/
      // subtree) before being abandoned. archiveOrphanedMint is a bare
      // fs.renameSync with no tracked-entry guard — archiveRunDir's #593 guard
      // (git-mv work/ + commit, refuse on any other tracked entry) is what this
      // path needs; same (root, dir) signature and {ok, reason} contract. The
      // orphaned-mint branch above makes the same choice per-dir via
      // hasTrackedContent (#2227) — this branch is unconditional because an
      // ad-hoc dir is always a real session, tracked spec or not.
```

- [ ] **Step 5: Run the suite to verify both new tests pass and nothing regressed**

Run: `node --test tests/bin-lib/reconcile/archive-merged.test.js 2>&1 | grep -E "^not ok|^# (tests|pass|fail)"`

Expected: no `not ok` lines, `# fail 0`, `# tests` two higher than before Step 1.

- [ ] **Step 6: Commit**

```bash
git add plugin/bin/lib/reconcile/archive-merged.js tests/bin-lib/reconcile/archive-merged.test.js
git commit -m "Route tracked orphaned mints through archiveRunDir — git mv + commit instead of a bare fs.renameSync, refs #2227"
```

---

### Task 2: Pin that a refused git-aware archival surfaces in `skipped`

**Files:**
- Test: `tests/bin-lib/reconcile/archive-merged.test.js` (append after Task 1's two tests)

**Interfaces:**
- Consumes: the Task 1 routing (a tracked orphaned mint reaches `archiveRunDir`), `archiveRunDir`'s existing `commit-failed` refusal (a failing pre-commit hook makes the real `git commit` fail, and `revertWorkMoves` puts `work/` back), `installFailingPreCommitHook(root)` / `removePreCommitHook(root)` from the test file's own helpers (lines 53-64).
- Produces: nothing new in the module — this task only pins behavior Task 1 already produces.

- [ ] **Step 1: Write the test**

Append after Task 1's untracked-mint test:

```js
// When archiveRunDir refuses the routed dir, the refusal is a visible skip
// reason — never a silent fs move of tracked content, never a silent no-op —
// and the dir is left in place with work/ back at its original path.
test('archiveMerged: a refused git-aware archival of a tracked orphaned mint surfaces in skipped and leaves the dir in place', (t) => {
  const root = fs.realpathSync(makeRepo());
  const runId = '2026-01-01T000000-record-2227-refused';
  const runDir = path.join(root, '.claude-tweaks', 'pipelines', runId);
  commitPath(root, `.claude-tweaks/pipelines/${runId}/work/2227-spec.md`, '# 2227\n');
  const backdated = new Date(Date.now() - ORPHAN_MINT_TTL_MS * 2);
  fs.utimesSync(runDir, backdated, backdated);
  // Installed after commitPath's own commit so only archiveRunDir's commit fails.
  installFailingPreCommitHook(root);
  t.after(() => removePreCommitHook(root));

  const result = archiveMerged({ cwd: root });

  assert.ok(!result.archived.includes(runDir), 'a refused archival must not count as archived');
  assert.ok(
    result.skipped.some((s) => s.runDir === runDir && s.reason === 'commit-failed'),
    `expected a commit-failed skip for ${runDir}, got ${JSON.stringify(result.skipped)}`,
  );
  assert.equal(fs.existsSync(path.join(runDir, 'work', '2227-spec.md')), true, 'work/ must be reverted to its original path');
  assert.ok(
    trackedFiles(root).includes(`.claude-tweaks/pipelines/${runId}/work/2227-spec.md`),
    'the spec must still be tracked at its original path after the revert',
  );
  assert.equal(
    fs.existsSync(path.join(root, '.claude-tweaks', 'pipelines', 'archive', runId, 'work', '2227-spec.md')),
    false,
    'nothing may be left under archive/ after a reverted refusal',
  );
});
```

- [ ] **Step 2: Run the suite to verify the new test passes**

Run: `node --test tests/bin-lib/reconcile/archive-merged.test.js 2>&1 | grep -E "^not ok|^# (tests|pass|fail)"`

Expected: no `not ok` lines, `# fail 0`, `# tests` one higher than after Task 1.

- [ ] **Step 3: Prove the test discriminates by temporarily reverting Task 1's routing**

Run, from the worktree root (HEAD is Task 1's commit at this point, so `HEAD~1` is the materialize commit and carries the pre-Task-1 module). Write the snapshot to the session scratchpad, never `/tmp` — `/tmp` writes do not persist across Bash calls in this harness:

```bash
git show HEAD~1:plugin/bin/lib/reconcile/archive-merged.js > /private/tmp/claude-501/-Users-thomasholknielsen-Code-Workspaces-claude-tweaks/891c19bd-8a64-489b-96fb-65518c40e2c7/scratchpad/archive-merged-pre-2227.js
```

Then copy that pre-Task-1 module over the live one, run the suite, and restore — three separate commands, restore being the same `git show … >` form as the snapshot (never a `git checkout` of the file, which trips the working-directory guard's "modified externally" reminder):

```bash
cp /private/tmp/claude-501/-Users-thomasholknielsen-Code-Workspaces-claude-tweaks/891c19bd-8a64-489b-96fb-65518c40e2c7/scratchpad/archive-merged-pre-2227.js plugin/bin/lib/reconcile/archive-merged.js
node --test tests/bin-lib/reconcile/archive-merged.test.js 2>&1 | grep -E "^not ok|^# fail"
git show HEAD:plugin/bin/lib/reconcile/archive-merged.js > plugin/bin/lib/reconcile/archive-merged.js
```

Expected from the middle command: `not ok` lines for both `archiveMerged: an orphaned mint carrying a git-tracked work/ spec is archived via a commit ...` and `archiveMerged: a refused git-aware archival ...` (the old fs path moves the file without ever reaching `git commit`, so no `commit-failed` skip appears and `archived` contains the dir), and `# fail 2`. After the restore, `git status --porcelain plugin/` must be empty. Record the middle command's raw output in the task report.

- [ ] **Step 4: Commit**

```bash
git add tests/bin-lib/reconcile/archive-merged.test.js
git commit -m "Pin refused git-aware archival of a tracked orphaned mint as a visible skip — refs #2227"
```

---

## Self-review

**Spec coverage.** Deliverable 1 (detect tracked content, route through `archiveRunDir`, keep fs path for untracked) → Task 1 Step 3. Deliverable 2 (refusal flows through `trackArchiveResult` / `skipped`, never silent) → Task 1 Step 3 reuses the branch's existing result handling; Task 2 pins it. Deliverable 3 (update the `isAdHocStandaloneSuperseded` comment) → Task 1 Step 4. Deliverable 4 (tests a/b/c) → Task 1 Step 1 (a, b), Task 2 Step 1 (c). AC "test (a) fails against the unpatched function" → Task 1 Step 2 (before the fix) and Task 2 Step 3 (revert proof). AC "`npm test` passes" → run centrally after both tasks, per Global Constraints.

**Placeholder scan.** None — every step carries its code or its exact command and expected output.

**Type consistency.** `hasTrackedContent(root, dir)` is defined once (Task 1 Step 3) and named identically in both comment updates (Task 1 Step 4). `ORPHAN_MINT_TTL_MS` is imported once (Task 1 Step 1) and used by all three tests. `installFailingPreCommitHook` / `removePreCommitHook` / `commitPath` / `trackedFiles` / `git` / `makeRepo` are the test file's existing helpers, used with their existing signatures.

**Plan-authoring checks.** Return-shape widening: none (no return shape changes). Verbatim commands: `git ls-files -- <absolute dir>` was probed once read-only in the worktree and returned the tracked spec path, so the helper's pathspec form is verified. The other checks (blocking-verification downgrade, deictic reorder, degrade clause, copied config, renumbering, gate-over-producers) do not apply to this plan.
