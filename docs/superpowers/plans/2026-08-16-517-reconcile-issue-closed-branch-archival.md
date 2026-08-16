# Reconcile: issue-closed claim release, branch archival, archive-tag aging — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `bin/lib/reconcile/` with issue-closed claim release, cherry-verified local branch archival, and archive-tag aging, wired as a new `'archive-branches'` check.

**Architecture:** Pure decision functions with I/O at the edges, matching `decideRelease`'s existing pattern. `release-merged.js` gains issue-state evidence; a new `archive-branches.js` module owns branch/tag decisions and execution; `index.js` dispatches the new check after `archive`, before `reap`.

**Tech Stack:** Node built-ins, `gh` CLI, git. Tests: `node --test`.

**Spec:** `.claude-tweaks/pipelines/2026-08-16T010137-spec-517-518-519/spec-517/work/517-spec.md`

## Global Constraints

- reconcile is `pr-first`-only: the new check must be inside the `local-merge` skip guard in `index.js`.
- All branch/tag mutations are LOCAL only — never `git push origin --delete`, never a pushed tag.
- Thresholds hardcoded: 14-day branch age, 90-day tag aging. No policy levers.
- `bin/lib/hooks/worktree-reap.js` is consumed as-is (its exports `parseWorktreeList`, `resolveIntegrationBranch`) — never modified.
- Deletes use `git branch -D` behind the decision function's evidence — never trust `git branch -d`'s verdict.
- Commit messages: `{Verb} {what} — {detail}`, imperative, end with `refs #517` (NEVER `closes`/`fixes` — the parent run's PR carries the closing keyword).
- Run only targeted test files between edits (`node --test <file>`); the full suite runs centrally after the build.
- All work happens in the worktree at `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-517-518-519` — verify with `pwd` + `git rev-parse --show-toplevel` before any commit.

## Verified current state (read before editing)

- `bin/lib/reconcile/release-merged.js:24-35` — `decideRelease(classifiedState, prState)`; line 158 pushes `{ issueNumber, runId, prNumber: prState.number }` (unconditional dereference). Lines 123-143: `no-run-id`, `no-run-state`, `no-branch` early skips happen BEFORE `decideRelease` is reached.
- `bin/lib/reconcile/pr-state.js` — `resolvePrState` returns `null` | `'gh-absent'` | `'network-failure'` | `{number, state: 'MERGED'|'OPEN'|'CLOSED', mergedAt, updatedAt}`.
- `bin/lib/reconcile/index.js:24` — `ALL_CHECKS = ['mirror','reap','release','archive','console']` (requested-subset default only); dispatch order is `mirror, console, release, archive, reap` with `reap` last (ordering comment at lines 86-96); local-merge guard at lines 50-72 skips `mirror,release,archive,console`. `'archive'` = `archive-merged.js` (run-dir archival, untouched here).
- `bin/lib/reconcile/archive-merged.js` ALREADY exports its own `decideArchive` (run-dir archival decision). The new module's `decideArchive` is a same-name export in a DIFFERENT module — fine, but never import both unaliased into one file.
- Existing `decideRelease` tests: `tests/reconcile.test.js:209-223` — all call with 2 args; the 2-arg behavior must stay identical (third param `undefined` = today's behavior).
- `tests/bin-lib/reconcile/` does NOT exist yet — create it; `npm test`'s recursive glob picks it up automatically.
- Existing tests never assert on the release pass's skip reasons (`no-run-state`/`no-branch`) — restructuring the pass is safe.

---

### Task 1: `decideRelease` issue-closed evidence + caller-dereference fix

**Files:**
- Modify: `bin/lib/reconcile/release-merged.js`
- Test: `tests/bin-lib/reconcile/release-merged.test.js` (create; also creates the directory)

**Interfaces:**
- Produces: `decideRelease(classifiedState, prState, issueState)` — `issueState` ∈ `'OPEN' | 'CLOSED' | undefined`; `releasedEntry(issueNumber, runId, prState)` → `{issueNumber, runId, prNumber}` (new export, null-tolerant); `readIssueState(repoSlug, issueNumber)` (internal, not exported).

- [ ] **Step 1: Write the failing tests**

Create `tests/bin-lib/reconcile/release-merged.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { decideRelease, releasedEntry } = require('../../../bin/lib/reconcile/release-merged');

// AC1: open PR always wins over issue-closed evidence
test('decideRelease: live claim + open PR + closed issue -> skip pr-open', () => {
  assert.deepStrictEqual(
    decideRelease('live', { number: 7, state: 'OPEN' }, 'CLOSED'),
    { action: 'skip', reason: 'pr-open' },
  );
});

// AC2: issue-closed evidence releases on no-pr and pr-closed-unmerged joins
test('decideRelease: live claim + no PR + closed issue -> release (issue-closed)', () => {
  const r = decideRelease('live', null, 'CLOSED');
  assert.strictEqual(r.action, 'release');
  assert.match(r.reason, /^issue-closed/);
});
test('decideRelease: stale claim + closed-unmerged PR + closed issue -> release', () => {
  const r = decideRelease('stale', { number: 7, state: 'CLOSED' }, 'CLOSED');
  assert.strictEqual(r.action, 'release');
  assert.match(r.reason, /^issue-closed/);
});

// AC3: open or unknown issue state never releases without merged-PR evidence
test('decideRelease: live claim + no PR + open issue -> skip', () => {
  assert.strictEqual(decideRelease('live', null, 'OPEN').action, 'skip');
});
test('decideRelease: live claim + no PR + unknown issue state (fetch failed) -> skip', () => {
  assert.strictEqual(decideRelease('live', null, undefined).action, 'skip');
});

// Unchanged behavior: merged-PR evidence, transports, non-candidates
test('decideRelease: merged PR still releases regardless of issue state', () => {
  assert.strictEqual(decideRelease('live', { number: 7, state: 'MERGED' }, 'OPEN').action, 'release');
});
test('decideRelease: transport failures still skip even with closed issue', () => {
  assert.strictEqual(decideRelease('live', 'gh-absent', 'CLOSED').action, 'skip');
  assert.strictEqual(decideRelease('live', 'network-failure', 'CLOSED').action, 'skip');
});
test('decideRelease: tombstone/absent/unreadable never release on issue-closed', () => {
  assert.strictEqual(decideRelease('tombstone', null, 'CLOSED').action, 'skip');
  assert.strictEqual(decideRelease('absent', null, 'CLOSED').action, 'skip');
  assert.strictEqual(decideRelease('unreadable', null, 'CLOSED').action, 'skip');
});

// AC2 caller-dereference: released entry tolerates null / non-object prState
test('releasedEntry: null prState -> prNumber null, no throw', () => {
  assert.deepStrictEqual(releasedEntry(42, 'run-x', null), { issueNumber: 42, runId: 'run-x', prNumber: null });
});
test('releasedEntry: merged prState carries its number', () => {
  assert.deepStrictEqual(releasedEntry(42, 'run-x', { number: 9, state: 'MERGED' }), { issueNumber: 42, runId: 'run-x', prNumber: 9 });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/bin-lib/reconcile/release-merged.test.js`
Expected: FAIL — `releasedEntry` is not exported; issue-closed cases return `skip`.

- [ ] **Step 3: Implement in `bin/lib/reconcile/release-merged.js`**

Replace `decideRelease` (keep its header comment, extend it to mention issue-closed evidence):

```js
function decideRelease(classifiedState, prState, issueState) {
  if (classifiedState !== 'live' && classifiedState !== 'stale') {
    return { action: 'skip', reason: classifiedState }; // absent/tombstone/unreadable — nothing to release
  }
  if (prState === 'gh-absent') return { action: 'skip', reason: 'gh-absent' };
  if (prState === 'network-failure') return { action: 'skip', reason: 'network-failure' };
  if (prState && prState.state === 'MERGED') {
    return { action: 'release', reason: `merged: reconciled from PR #${prState.number}` };
  }
  if (prState && prState.state === 'OPEN') {
    return { action: 'skip', reason: 'pr-open' }; // open PR means work may be landing — issue-closed evidence never overrides
  }
  // Join yielded no-pr (null) or pr-closed-unmerged: issue-closed evidence applies.
  // A closed record cannot legitimately be in progress, whatever the close reason.
  if (issueState === 'CLOSED') {
    return { action: 'release', reason: 'issue-closed' }; // caller appends ": reconciled from #{n}" — the blob's own issue number is not in this signature
  }
  return { action: 'skip', reason: prState ? 'pr-closed-unmerged' : 'no-pr' };
}
```

Add below `readClaim`:

```js
// Issue-state lookup — same ghApi pattern (5s timeout). Unknown/errored
// state returns undefined: fail closed, never releases on missing evidence.
function readIssueState(repoSlug, issueNumber) {
  const r = ghApi([`repos/${repoSlug}/issues/${issueNumber}`, '-q', '.state']);
  if (r.failure || !r.stdout) return undefined;
  const s = r.stdout.trim().toUpperCase();
  return s === 'OPEN' || s === 'CLOSED' ? s : undefined;
}

// Pure seam for the released.push shape — the issue-closed path releases with
// a null/non-merged prState, so the old unconditional prState.number dereference
// would throw on exactly the new path.
function releasedEntry(issueNumber, runId, prState) {
  return { issueNumber, runId, prNumber: prState && typeof prState === 'object' ? prState.number : null };
}
```

Rewire the loop in `releaseMerged` (replacing the current `no-run-state`/`no-branch` early-`continue` block and the decision/push block). The join-failure paths must now FALL THROUGH to the decision with `prState = null` — a closed issue's run dir is typically already archived, so `no-run-state` is precisely the case issue-closed release exists for. Preserve the old skip reasons for diagnostics when the decision still skips:

```js
    let prState = null;
    let joinFailure = null; // 'no-run-state' | 'no-branch' — preserved as the skip reason when no evidence releases
    if (runId) {
      const runDir = path.join(root, '.claude-tweaks', 'pipelines', runId);
      const runState = readRunState(runDir);
      const wtEntry = runState && runState.worktree
        ? worktrees.find((w) => path.resolve(w.path) === path.resolve(runState.worktree))
        : null;
      const branch = wtEntry ? wtEntry.branch : null;
      if (!runState || !runState.worktree) {
        joinFailure = 'no-run-state'; // archived/gone run dir — issue-closed evidence below may still release
      } else if (!branch) {
        joinFailure = 'no-branch';
      } else {
        prState = resolvePrState(root, branch);
      }
    }

    // Fetch issue state only when PR evidence alone cannot release: the
    // no-pr and pr-closed-unmerged join results (incl. join failures above).
    let issueState;
    if (prState === null || (prState && typeof prState === 'object' && prState.state === 'CLOSED')) {
      issueState = readIssueState(repoSlug, issueNumber);
    }

    const decision = decideRelease(classified.state, prState, issueState);
    if (decision.action === 'skip') {
      skipped.push({ issueNumber, runId, reason: joinFailure || decision.reason });
      continue;
    }

    const reason = decision.reason === 'issue-closed'
      ? `issue-closed: reconciled from #${issueNumber}`
      : decision.reason;
    const payload = releasePayload({ issueNumber, runId, reason, now: Date.now() });
    const ok = writeTombstone(repoSlug, name, claim.sha, payload.tombstoneContent);
    if (!ok) { skipped.push({ issueNumber, runId, reason: 'release-write-failed' }); continue; }
    removeInProgressLabel(repoSlug, issueNumber); // best-effort, never gates the release
    released.push(releasedEntry(issueNumber, runId, prState));
```

Note: the old `if (classified.state !== 'live' && classified.state !== 'stale') continue;` quiet-skip inside the decision branch stays (non-candidates aren't worth logging) — keep it as the first line of the skip branch:

```js
    if (decision.action === 'skip') {
      if (classified.state !== 'live' && classified.state !== 'stale') continue;
      skipped.push({ issueNumber, runId, reason: joinFailure || decision.reason });
      continue;
    }
```

Update `module.exports` to `{ releaseMerged, decideRelease, releasedEntry, repoSlugOf }`.

- [ ] **Step 4: Run new + existing tests**

Run: `node --test tests/bin-lib/reconcile/release-merged.test.js tests/reconcile.test.js`
Expected: PASS (existing 2-arg `decideRelease` tests unchanged and green).

- [ ] **Step 5: Commit**

```bash
git add bin/lib/reconcile/release-merged.js tests/bin-lib/reconcile/release-merged.test.js
git commit -m "Extend decideRelease with issue-closed evidence — release claims on closed issues, null-safe released entry, refs #517"
```

---

### Task 2: `archive-branches.js` — pure decision functions

**Files:**
- Create: `bin/lib/reconcile/archive-branches.js` (pure parts only; execution added in Task 3)
- Test: `tests/bin-lib/reconcile/archive-branches.test.js`

**Interfaces:**
- Produces: `decideArchive({branch, tipAgeDays, cherryEquivalent, prState})` → `{action: 'delete'|'tag-and-delete'|'skip', reason}`; `inScope(branch, worktrees)` → boolean (worktrees = `parseWorktreeList` output: `[{path, branch, ...}]`); `shouldAgeTag(committerDateIso, nowMs)` → boolean.

- [ ] **Step 1: Write the failing tests**

Create `tests/bin-lib/reconcile/archive-branches.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { decideArchive, inScope, shouldAgeTag } = require('../../../bin/lib/reconcile/archive-branches');

const DAY = 24 * 60 * 60 * 1000;

// AC4: cherry-equivalent branch, no PR or closed PR -> delete (no tag)
test('decideArchive: cherry-equivalent + no PR -> delete', () => {
  const r = decideArchive({ branch: 'build/x', tipAgeDays: 2, cherryEquivalent: true, prState: null });
  assert.strictEqual(r.action, 'delete');
});
test('decideArchive: cherry-equivalent + closed PR -> delete', () => {
  assert.strictEqual(decideArchive({ branch: 'build/x', tipAgeDays: 2, cherryEquivalent: true, prState: { number: 3, state: 'CLOSED' } }).action, 'delete');
});
test('decideArchive: cherry-equivalent + merged PR -> delete', () => {
  assert.strictEqual(decideArchive({ branch: 'build/x', tipAgeDays: 2, cherryEquivalent: true, prState: { number: 3, state: 'MERGED' } }).action, 'delete');
});

// AC4: any OPEN PR -> skip, cherry-equivalent or not
test('decideArchive: open PR -> skip, even when cherry-equivalent', () => {
  assert.strictEqual(decideArchive({ branch: 'build/x', tipAgeDays: 30, cherryEquivalent: true, prState: { number: 3, state: 'OPEN' } }).action, 'skip');
  assert.strictEqual(decideArchive({ branch: 'build/x', tipAgeDays: 30, cherryEquivalent: false, prState: { number: 3, state: 'OPEN' } }).action, 'skip');
});

// AC4: genuinely unmerged, aged, no-pr / pr-closed-unmerged -> tag-and-delete
test('decideArchive: unmerged 15-day-old + closed-unmerged PR -> tag-and-delete', () => {
  const r = decideArchive({ branch: 'build/x', tipAgeDays: 15, cherryEquivalent: false, prState: { number: 3, state: 'CLOSED' } });
  assert.strictEqual(r.action, 'tag-and-delete');
});
test('decideArchive: unmerged 15-day-old + no PR -> tag-and-delete', () => {
  assert.strictEqual(decideArchive({ branch: 'build/x', tipAgeDays: 15, cherryEquivalent: false, prState: null }).action, 'tag-and-delete');
});
test('decideArchive: unmerged 13-day-old -> skip (too young)', () => {
  assert.strictEqual(decideArchive({ branch: 'build/x', tipAgeDays: 13, cherryEquivalent: false, prState: null }).action, 'skip');
});

// Fail closed on unknown PR state
test('decideArchive: transport failures -> skip', () => {
  assert.strictEqual(decideArchive({ branch: 'build/x', tipAgeDays: 30, cherryEquivalent: true, prState: 'gh-absent' }).action, 'skip');
  assert.strictEqual(decideArchive({ branch: 'build/x', tipAgeDays: 30, cherryEquivalent: false, prState: 'network-failure' }).action, 'skip');
});
test('decideArchive: unmerged + merged PR (rebased remnant) -> skip', () => {
  assert.strictEqual(decideArchive({ branch: 'build/x', tipAgeDays: 30, cherryEquivalent: false, prState: { number: 3, state: 'MERGED' } }).action, 'skip');
});

// AC4 scope guard: namespaces + worktree attachment
test('inScope: only build/*, worktree-*, demo/* namespaces', () => {
  assert.strictEqual(inScope('build/x', []), true);
  assert.strictEqual(inScope('worktree-record-42', []), true);
  assert.strictEqual(inScope('demo/y', []), true);
  assert.strictEqual(inScope('main', []), false);
  assert.strictEqual(inScope('feature/z', []), false);
  assert.strictEqual(inScope('flow/spec-1-2', []), false);
});
test('inScope: branch attached to a worktree is out of scope', () => {
  const wts = [{ path: '/w/a', branch: 'build/x' }];
  assert.strictEqual(inScope('build/x', wts), false);
  assert.strictEqual(inScope('build/y', wts), true);
});

// AC5: tag aging on committer date, 90-day threshold
test('shouldAgeTag: 91 days old -> true, 89 days -> false', () => {
  const now = Date.parse('2026-08-16T00:00:00Z');
  assert.strictEqual(shouldAgeTag(new Date(now - 91 * DAY).toISOString(), now), true);
  assert.strictEqual(shouldAgeTag(new Date(now - 89 * DAY).toISOString(), now), false);
});
test('shouldAgeTag: unparseable date -> false (fail closed)', () => {
  assert.strictEqual(shouldAgeTag('not-a-date', Date.now()), false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/bin-lib/reconcile/archive-branches.test.js`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create `bin/lib/reconcile/archive-branches.js` (pure parts)**

```js
// bin/lib/reconcile/archive-branches.js — convergence check: archive or
// delete abandoned plugin-owned LOCAL branches, and age out the archive/*
// tags the archival path creates. Pure decision functions with I/O at the
// edges, matching release-merged.js's pattern. All mutations are local to
// this checkout — never a pushed deletion, never a pushed tag; different
// checkouts converge independently (origin-side cleanup belongs to PR
// merges and tidy's remote-ref pruning).
//
// `git cherry {integration} {branch}` is the merged-in-substance evidence —
// it catches squash merges that ancestry checks and `git branch -d` both
// miss; that is why execution uses `-D` behind this decision table and
// never trusts `-d`'s verdict.
'use strict';

const BRANCH_AGE_DAYS = 14; // hardcoded by design — no policy lever
const TAG_AGE_DAYS = 90; // matches git's default reflog window: past it, the tag's marginal recovery value is zero

// Plugin-owned branch namespaces. No canonical source elsewhere in the repo —
// maintained manually here; a future plugin-owned prefix must be added by
// hand or its branches silently never age out.
const SCOPE_PATTERNS = [/^build\//, /^worktree-/, /^demo\//];

// Scope guard — runs BEFORE decideArchive is ever called. `worktrees` is
// parseWorktreeList output (bin/lib/hooks/worktree-reap.js), reused not
// reimplemented; a branch attached to any live worktree is never touched.
function inScope(branch, worktrees) {
  if (!SCOPE_PATTERNS.some((re) => re.test(branch))) return false;
  return !worktrees.some((w) => w.branch === branch);
}

// One branch's evidence -> what to do. Pure — no I/O.
//   { action: 'delete' | 'tag-and-delete' | 'skip', reason }
function decideArchive({ branch, tipAgeDays, cherryEquivalent, prState }) {
  if (prState === 'gh-absent' || prState === 'network-failure') {
    return { action: 'skip', reason: prState }; // evidence unknown — fail closed
  }
  if (prState && prState.state === 'OPEN') {
    return { action: 'skip', reason: 'pr-open' }; // an open PR means work may be landing
  }
  if (cherryEquivalent) {
    return { action: 'delete', reason: 'cherry-equivalent' }; // merged in substance — no tag needed
  }
  const closedUnmerged = prState && prState.state === 'CLOSED';
  if ((prState === null || closedUnmerged) && tipAgeDays > BRANCH_AGE_DAYS) {
    return { action: 'tag-and-delete', reason: `unmerged-aged: ${tipAgeDays}d > ${BRANCH_AGE_DAYS}d` };
  }
  if (prState === null || closedUnmerged) {
    return { action: 'skip', reason: 'too-young' };
  }
  return { action: 'skip', reason: 'merged-pr-without-cherry-equivalence' }; // rebased remnant — human territory
}

// Tag aging: delete archive/* tags whose tagged commit's COMMITTER date
// (%cI) exceeds TAG_AGE_DAYS. Unparseable dates fail closed (kept).
function shouldAgeTag(committerDateIso, nowMs) {
  const t = Date.parse(committerDateIso);
  if (Number.isNaN(t)) return false;
  return nowMs - t > TAG_AGE_DAYS * 24 * 60 * 60 * 1000;
}

module.exports = { decideArchive, inScope, shouldAgeTag, BRANCH_AGE_DAYS, TAG_AGE_DAYS };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/bin-lib/reconcile/archive-branches.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add bin/lib/reconcile/archive-branches.js tests/bin-lib/reconcile/archive-branches.test.js
git commit -m "Add archive-branches decision functions — cherry-verified delete, aged tag-and-delete, scope guard, refs #517"
```

---

### Task 3: `archiveBranches` execution pass + `index.js` wiring

**Files:**
- Modify: `bin/lib/reconcile/archive-branches.js` (add execution)
- Modify: `bin/lib/reconcile/index.js`
- Test: `tests/bin-lib/reconcile/archive-branches.test.js` (extend)

**Interfaces:**
- Consumes: `decideArchive`, `inScope`, `shouldAgeTag` (Task 2); `parseWorktreeList` (`../hooks/worktree-reap`); `resolvePrState` (`./pr-state`); `runGit` (`../hooks/git-exec`).
- Produces: `archiveBranches({cwd, integration, dryRun, now})` → `{entries: [{name, kind: 'branch'|'tag', action, reason}], failure: null|string}`; `index.js` gains `'archive-branches'` in `ALL_CHECKS`, the local-merge guard, dispatch between `archive` and `reap`, and `result.branches`.

- [ ] **Step 1: Write the failing tests (extend the Task 2 file)**

Append to `tests/bin-lib/reconcile/archive-branches.test.js`:

```js
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { archiveBranches } = require('../../../bin/lib/reconcile/archive-branches');
const { reconcile, ALL_CHECKS } = require('../../../bin/lib/reconcile');

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-branches-'));
  git(dir, 'init', '-b', 'main');
  git(dir, 'config', 'user.email', 't@t');
  git(dir, 'config', 'user.name', 't');
  fs.writeFileSync(path.join(dir, 'a.txt'), 'a\n');
  git(dir, 'add', 'a.txt');
  git(dir, 'commit', '-m', 'init');
  return dir;
}

test('archiveBranches: cherry-equivalent build/* branch is deleted; out-of-namespace branch untouched (dry-run reports, real run mutates)', () => {
  const dir = makeRepo();
  // cherry-equivalent branch: same patch as main's next commit
  git(dir, 'checkout', '-b', 'build/eq');
  fs.writeFileSync(path.join(dir, 'b.txt'), 'b\n');
  git(dir, 'add', 'b.txt');
  git(dir, 'commit', '-m', 'change');
  git(dir, 'checkout', 'main');
  git(dir, 'cherry-pick', 'build/eq');
  // out-of-namespace branch with the same shape
  git(dir, 'branch', 'feature/keep', 'build/eq');

  const dry = archiveBranches({ cwd: dir, integration: 'main', dryRun: true });
  const dryEq = dry.entries.find((e) => e.name === 'build/eq');
  assert.strictEqual(dryEq.action, 'delete');
  assert.match(git(dir, 'branch', '--list', 'build/eq'), /build\/eq/); // dry-run did not mutate

  const real = archiveBranches({ cwd: dir, integration: 'main', dryRun: false });
  const realEq = real.entries.find((e) => e.name === 'build/eq');
  assert.strictEqual(realEq.action, 'delete');
  assert.strictEqual(git(dir, 'branch', '--list', 'build/eq').trim(), ''); // gone
  assert.match(git(dir, 'branch', '--list', 'feature/keep'), /feature\/keep/); // out of scope, untouched
});

test('archiveBranches: unmerged aged branch gets archive tag then delete; young branch skipped', () => {
  const dir = makeRepo();
  const old = new Date(Date.now() - 20 * DAY).toISOString();
  git(dir, 'checkout', '-b', 'build/aged');
  fs.writeFileSync(path.join(dir, 'c.txt'), 'c\n');
  git(dir, 'add', 'c.txt');
  execFileSync('git', ['commit', '-m', 'aged'], {
    cwd: dir, encoding: 'utf8',
    env: { ...process.env, GIT_COMMITTER_DATE: old, GIT_AUTHOR_DATE: old },
  });
  git(dir, 'checkout', 'main');
  git(dir, 'checkout', '-b', 'build/young');
  fs.writeFileSync(path.join(dir, 'd.txt'), 'd\n');
  git(dir, 'add', 'd.txt');
  git(dir, 'commit', '-m', 'young');
  git(dir, 'checkout', 'main');

  const r = archiveBranches({ cwd: dir, integration: 'main', dryRun: false });
  assert.strictEqual(r.entries.find((e) => e.name === 'build/aged').action, 'tag-and-delete');
  assert.strictEqual(r.entries.find((e) => e.name === 'build/young').action, 'skip');
  assert.match(git(dir, 'tag', '--list', 'archive/build/aged'), /archive\/build\/aged/);
  assert.strictEqual(git(dir, 'branch', '--list', 'build/aged').trim(), '');
  assert.match(git(dir, 'branch', '--list', 'build/young'), /build\/young/);
});

test('archiveBranches: archive/* tag older than 90 days is deleted, younger kept', () => {
  const dir = makeRepo();
  const ancient = new Date(Date.now() - 91 * DAY).toISOString();
  git(dir, 'checkout', '-b', 'build/tagsrc');
  fs.writeFileSync(path.join(dir, 'e.txt'), 'e\n');
  git(dir, 'add', 'e.txt');
  execFileSync('git', ['commit', '-m', 'ancient'], {
    cwd: dir, encoding: 'utf8',
    env: { ...process.env, GIT_COMMITTER_DATE: ancient, GIT_AUTHOR_DATE: ancient },
  });
  git(dir, 'tag', 'archive/old-tag');
  git(dir, 'checkout', 'main');
  git(dir, 'branch', '-D', 'build/tagsrc');
  git(dir, 'tag', 'archive/fresh-tag'); // points at main's tip (fresh committer date)

  const r = archiveBranches({ cwd: dir, integration: 'main', dryRun: false });
  assert.strictEqual(r.entries.find((e) => e.name === 'archive/old-tag' && e.kind === 'tag').action, 'aged-out');
  assert.strictEqual(git(dir, 'tag', '--list', 'archive/old-tag').trim(), '');
  assert.match(git(dir, 'tag', '--list', 'archive/fresh-tag'), /archive\/fresh-tag/);
});

// AC6: index wiring
test("index: ALL_CHECKS includes 'archive-branches'; dispatch sits between 'archive' and 'reap'; result gains branches slot", () => {
  assert.ok(ALL_CHECKS.includes('archive-branches'));
  const src = fs.readFileSync(path.join(__dirname, '../../../bin/lib/reconcile/index.js'), 'utf8');
  const iArchive = src.indexOf("checks.includes('archive')");
  const iBranches = src.indexOf("checks.includes('archive-branches')");
  const iReap = src.indexOf("checks.includes('reap')", iArchive);
  assert.ok(iArchive > -1 && iBranches > iArchive && iReap > iBranches, 'dispatch order: archive < archive-branches < reap');
});

test('index: local-merge model skips archive-branches', () => {
  const dir = makeRepo();
  // no origin remote -> resolveIntegrationBranch fails -> skipped no-remote; that
  // still proves archive-branches never dispatches outside pr-first. Assert the
  // result shape carries the branches slot untouched.
  const r = reconcile({ cwd: dir, checks: ['archive-branches'] });
  assert.strictEqual(r.branches, null);
});
```

Note `checks.includes('archive')` appears once in the pr-first section — take the first occurrence after the release block when computing `iArchive` if needed. The `DAY` constant from Task 2's test section is reused.

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `node --test tests/bin-lib/reconcile/archive-branches.test.js`
Expected: FAIL — `archiveBranches` not exported; `ALL_CHECKS` lacks the check.

- [ ] **Step 3: Add execution to `archive-branches.js`**

Add requires at top: `const { runGit } = require('../hooks/git-exec');`, `const { parseWorktreeList } = require('../hooks/worktree-reap');`, `const { resolvePrState } = require('./pr-state');`.

```js
// Cherry equivalence: every commit on the branch is patch-equivalent to one
// already on the integration branch (`git cherry` lines all start with '-';
// empty output = no unique commits at all). A cherry failure fails closed.
function isCherryEquivalent(root, integration, branch) {
  const r = runGit(['cherry', integration, branch], root);
  if (r.failure || r.stdout === null) return null; // unknown — fail closed at the call site
  const lines = r.stdout.split('\n').map((s) => s.trim()).filter(Boolean);
  return lines.every((l) => l.startsWith('-'));
}

function archiveBranches({ cwd, integration, dryRun, now } = {}) {
  const root = cwd || process.cwd();
  const nowMs = now || Date.now();
  const entries = [];

  const wtList = runGit(['worktree', 'list', '--porcelain'], root);
  const worktrees = wtList.failure ? [] : parseWorktreeList(wtList.stdout);

  const refs = runGit(['for-each-ref', '--format=%(refname:short)\t%(committerdate:iso8601-strict)\t%(objectname)', 'refs/heads'], root);
  if (refs.failure) return { entries, failure: 'git-failure' };

  for (const line of refs.stdout.split('\n').map((s) => s.trim()).filter(Boolean)) {
    const [branch, committerDate, tip] = line.split('\t');
    if (!inScope(branch, worktrees)) continue; // scope guard: namespace + worktree attachment — never reaches the decision fn
    const tipAgeDays = (nowMs - Date.parse(committerDate)) / (24 * 60 * 60 * 1000);
    const cherryEquivalent = isCherryEquivalent(root, integration, branch);
    if (cherryEquivalent === null) {
      entries.push({ name: branch, kind: 'branch', action: 'skip', reason: 'cherry-failed' });
      continue;
    }
    const prState = resolvePrState(root, branch);
    const decision = decideArchive({ branch, tipAgeDays, cherryEquivalent, prState });
    if (decision.action === 'skip' || dryRun) {
      entries.push({ name: branch, kind: 'branch', action: decision.action, reason: decision.reason });
      continue;
    }
    if (decision.action === 'tag-and-delete') {
      const tag = runGit(['tag', `archive/${branch}`, tip], root);
      if (tag.failure) {
        entries.push({ name: branch, kind: 'branch', action: 'skip', reason: 'tag-failed' }); // fail closed: never delete untagged
        continue;
      }
    }
    const del = runGit(['branch', '-D', branch], root); // -D behind the decision table's evidence — -d's verdict is explicitly not trusted
    entries.push(del.failure
      ? { name: branch, kind: 'branch', action: 'skip', reason: 'delete-failed' }
      : { name: branch, kind: 'branch', action: decision.action, reason: decision.reason });
  }

  // Tag aging — archive/* tags whose tagged commit's committer date exceeds
  // TAG_AGE_DAYS. Same committer-date basis as tipAgeDays above.
  const tags = runGit(['for-each-ref', '--format=%(refname:short)\t%(committerdate:iso8601-strict)', 'refs/tags/archive'], root);
  if (!tags.failure) {
    for (const line of tags.stdout.split('\n').map((s) => s.trim()).filter(Boolean)) {
      const [tag, committerDate] = line.split('\t');
      if (!shouldAgeTag(committerDate, nowMs)) continue;
      if (dryRun) { entries.push({ name: tag, kind: 'tag', action: 'aged-out', reason: 'dry-run' }); continue; }
      const del = runGit(['tag', '-d', tag], root);
      entries.push(del.failure
        ? { name: tag, kind: 'tag', action: 'skip', reason: 'delete-failed' }
        : { name: tag, kind: 'tag', action: 'aged-out', reason: `> ${TAG_AGE_DAYS}d` });
    }
  }

  return { entries, failure: null };
}
```

Add `archiveBranches` to `module.exports`.

Check `runGit`'s exact return shape in `bin/lib/hooks/git-exec.js` before relying on `{stdout, failure}` — mirror how `release-merged.js` and `index.js` already consume it.

- [ ] **Step 4: Wire `index.js`**

- `ALL_CHECKS = ['mirror', 'reap', 'release', 'archive', 'archive-branches', 'console']`
- Add `branches: null` to the `result` literal.
- Add require: `const { archiveBranches } = require('./archive-branches');`
- Local-merge guard: change the skipped reason string to `'mirror,release,archive,archive-branches,console'`.
- Insert dispatch between the `archive` and `reap` blocks:

```js
  // Same live-ref dependency as release/archive: derives branch state from
  // refs reap may remove. Runs after archive (run-dir archival may release
  // branch attachments), before reap (which stays last — see above).
  if (checks.includes('archive-branches')) {
    const r = archiveBranches({ cwd: root, integration, dryRun });
    if (r.failure) {
      result.skipped.push({ check: 'archive-branches', reason: r.failure });
    } else {
      result.branches = r.entries;
    }
  }
```

- Update the ordering-rationale comment (lines 86-96) to name `archive-branches` between `archive` and `reap`, and the header comment's order list (line 21) to `mirror, console, release, archive, archive-branches, reap`.

- [ ] **Step 5: Run the suite**

Run: `node --test tests/bin-lib/reconcile/archive-branches.test.js tests/reconcile.test.js`
Expected: PASS — including the pre-existing `'archive'` (run-dir) suite untouched (AC6).

- [ ] **Step 6: Commit**

```bash
git add bin/lib/reconcile/archive-branches.js bin/lib/reconcile/index.js tests/bin-lib/reconcile/archive-branches.test.js
git commit -m "Wire archive-branches check into reconcile — local branch archival + tag aging between archive and reap, refs #517"
```

---

### Task 4: Discrimination check + full-suite verification

**Files:**
- No new files — verification only.

- [ ] **Step 1: Discrimination check on the decision-table change**

Expose the pre-change baseline without stashing (never `git stash` here — shared stack):

```bash
git show HEAD~3:bin/lib/reconcile/release-merged.js > /tmp/release-merged-baseline.js
cp /tmp/release-merged-baseline.js bin/lib/reconcile/release-merged.js
node --test tests/bin-lib/reconcile/release-merged.test.js
```

Expected: FAIL (issue-closed tests + `releasedEntry` export missing) — proves the new tests discriminate. (`HEAD~3` = the commit before Task 1; adjust the offset to whatever `git log --oneline -5` shows as the pre-Task-1 commit.)

- [ ] **Step 2: Restore immediately**

```bash
git checkout -- bin/lib/reconcile/release-merged.js
node --test tests/bin-lib/reconcile/release-merged.test.js
```

Expected: PASS. (A harness "file modified externally" reminder after `git checkout --` is the checkout's own side effect — not real signal.)

- [ ] **Step 3: Full suite**

Run: `npm test` (redirect to a file and read the tail — long output).
Expected: PASS, 0 fail. (Task 2's red runs already discriminate `archive-branches.js` — the module didn't exist.)

- [ ] **Step 4: Commit (only if anything changed)**

Nothing to commit if Steps 1-3 left the tree clean.
