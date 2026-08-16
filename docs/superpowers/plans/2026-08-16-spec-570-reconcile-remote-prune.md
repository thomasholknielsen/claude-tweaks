# Reconcile Remote-Prune Check + Tidy Routing Rows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reconcile convergence check that deletes remote branches proven merged into the integration branch, route its findings as Reconcile-converged in tidy's Step 6 table, and add an explicit routing row for the Mark-as-specified recommendation.

**Architecture:** A new `bin/lib/reconcile/prune-remote.js` module follows the family's pure-decision-functions-with-I/O-at-the-edges pattern (`archive-branches.js`, `reap-merged.js`). Check name `remote-prune`, result slot `remoteBranches`. The delete requires BOTH a MERGED PR and cherry-equivalence against the integration branch — anything weaker keeps today's staged-in-tidy behavior. Doc rows in `skills/tidy/step-6-auto.md` route the new check's findings and the Mark-as-specified stamp.

**Tech Stack:** Node 18+ (no deps), `node --test`, git CLI, gh CLI (via existing `pr-state.js`).

**Spec:** `.claude-tweaks/pipelines/2026-08-16T111045-spec-570/work/570-spec.md`

**Scope keywords:** remote-prune, remoteBranches

## Global Constraints

- No new npm dependencies; plugin ships no runtime deps.
- Every error path degrades to a reported skip, never a thrown exception (reconcile family invariant, `bin/lib/reconcile/index.js` header).
- The check runs under `integration-model: pr-first` only — `index.js`'s existing model guard handles this; the module itself never re-checks.
- Commit message style: `{Verb} {what} — {detail}`, imperative, ending `refs #570` (never `closes`/`fixes` in commits).
- All commits land in the worktree at `.claude/worktrees/build+570-tidy-reconcile-routing`; run `pwd` + `git rev-parse --show-toplevel` before committing.
- Run targeted suites only per task (`node --test <file>`); the full suite runs centrally after the build.

---

### Task 1: prune-remote module — pure decision function + shared-helper exports

**Files:**
- Create: `bin/lib/reconcile/prune-remote.js`
- Modify: `bin/lib/reconcile/archive-branches.js:152` (module.exports — add `SCOPE_PATTERNS`, `isCherryEquivalent`)
- Test: `tests/bin-lib/reconcile/prune-remote.test.js`

**Interfaces:**
- Consumes: `inScope(branch, worktrees)`, `isCherryEquivalent(root, integration, ref)`, `SCOPE_PATTERNS` from `archive-branches.js`; `resolvePrState(repoRoot, branch)` from `pr-state.js`; `runGit(args, cwd)` from `../hooks/git-exec`; `parseWorktreeList(stdout)` from `../hooks/worktree-reap`.
- Produces: `decideRemotePrune({ branch, cherryEquivalent, prState })` → `{ action: 'delete' | 'skip', reason }`; `pruneRemote({ cwd, integration, dryRun, resolvePr })` → `{ entries: [{ name, kind: 'remote-branch', action, reason }], failure: null | 'git-failure' }`.

- [ ] **Step 1: Export the shared helpers from archive-branches.js**

In `bin/lib/reconcile/archive-branches.js`, change the last line:

```js
module.exports = { decideArchive, inScope, shouldAgeTag, archiveBranches, BRANCH_AGE_DAYS, TAG_AGE_DAYS, SCOPE_PATTERNS, isCherryEquivalent };
```

(`SCOPE_PATTERNS` and `isCherryEquivalent` already exist in that file at lines 32 and 80 — this is export-only, no behavior change.)

- [ ] **Step 2: Write the failing decision-table tests**

Create `tests/bin-lib/reconcile/prune-remote.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { decideRemotePrune } = require('../../../bin/lib/reconcile/prune-remote');

// The delete bar is deliberately stricter than archive-branches' local -D:
// a pushed deletion is unrecoverable from this checkout once origin GCs the
// ref, so it requires BOTH signals — a MERGED PR and cherry-equivalence.
test('decideRemotePrune: merged PR + cherry-equivalent -> delete', () => {
  const r = decideRemotePrune({ branch: 'build/x', cherryEquivalent: true, prState: { number: 3, state: 'MERGED' } });
  assert.strictEqual(r.action, 'delete');
  assert.strictEqual(r.reason, 'merged-pr-cherry-equivalent');
});
test('decideRemotePrune: open PR -> skip, even when cherry-equivalent', () => {
  assert.strictEqual(decideRemotePrune({ branch: 'build/x', cherryEquivalent: true, prState: { number: 3, state: 'OPEN' } }).reason, 'pr-open');
});
test('decideRemotePrune: merged PR but not cherry-equivalent (rebased remnant) -> skip', () => {
  assert.strictEqual(decideRemotePrune({ branch: 'build/x', cherryEquivalent: false, prState: { number: 3, state: 'MERGED' } }).reason, 'not-cherry-equivalent');
});
test('decideRemotePrune: cherry-equivalent but no PR / closed-unmerged PR -> skip (no merged-PR corroboration)', () => {
  assert.strictEqual(decideRemotePrune({ branch: 'build/x', cherryEquivalent: true, prState: null }).reason, 'no-merged-pr');
  assert.strictEqual(decideRemotePrune({ branch: 'build/x', cherryEquivalent: true, prState: { number: 3, state: 'CLOSED' } }).reason, 'no-merged-pr');
});
test('decideRemotePrune: transport failures -> skip (fail closed)', () => {
  assert.strictEqual(decideRemotePrune({ branch: 'build/x', cherryEquivalent: true, prState: 'gh-absent' }).reason, 'gh-absent');
  assert.strictEqual(decideRemotePrune({ branch: 'build/x', cherryEquivalent: true, prState: 'network-failure' }).reason, 'network-failure');
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `node --test tests/bin-lib/reconcile/prune-remote.test.js`
Expected: FAIL — `Cannot find module '../../../bin/lib/reconcile/prune-remote'`

- [ ] **Step 4: Write the module**

Create `bin/lib/reconcile/prune-remote.js`:

```js
// bin/lib/reconcile/prune-remote.js — convergence check: delete REMOTE
// branches proven merged into the integration branch. The one pushed
// mutation in the reconcile family — every other check is local-only by
// design (archive-branches.js). A pushed deletion is unrecoverable from
// this checkout once origin GCs the ref, so the evidence bar is BOTH
// signals at once: a MERGED PR (resolvePrState) AND cherry-equivalence of
// the remote ref against the integration branch (`git cherry` — the same
// merged-in-substance evidence archive-branches.js documents; ancestry
// alone is explicitly not trusted). Anything weaker — no PR, a closed
// unmerged PR, cherry-only — skips, keeping today's staged-in-tidy path
// for the ambiguous cases. Scope is the plugin-owned namespaces
// (SCOPE_PATTERNS, reused from archive-branches.js), and a branch attached
// to a live worktree is silently out of scope (same inScope guard).
// Pure decision function with I/O at the edges, matching the family.
'use strict';

const { runGit } = require('../hooks/git-exec');
const { parseWorktreeList } = require('../hooks/worktree-reap');
const { inScope, isCherryEquivalent } = require('./archive-branches');
const { resolvePrState } = require('./pr-state');

// One remote branch's evidence -> what to do. Pure — no I/O.
//   { action: 'delete' | 'skip', reason }
function decideRemotePrune({ branch, cherryEquivalent, prState }) {
  if (prState === 'gh-absent' || prState === 'network-failure') {
    return { action: 'skip', reason: prState }; // evidence unknown — fail closed
  }
  if (prState && prState.state === 'OPEN') {
    return { action: 'skip', reason: 'pr-open' }; // work may still be landing
  }
  if (!cherryEquivalent) {
    return { action: 'skip', reason: 'not-cherry-equivalent' }; // content not proven merged
  }
  if (!prState || prState.state !== 'MERGED') {
    return { action: 'skip', reason: 'no-merged-pr' }; // cherry alone is not enough for a pushed delete
  }
  return { action: 'delete', reason: 'merged-pr-cherry-equivalent' };
}

function pruneRemote({ cwd, integration, dryRun, resolvePr } = {}) {
  const root = cwd || process.cwd();
  const resolve = resolvePr || resolvePrState;
  const entries = [];

  const wtList = runGit(['worktree', 'list', '--porcelain'], root);
  if (wtList.failure) return { entries, failure: 'git-failure' };
  const worktrees = parseWorktreeList(wtList.stdout);

  const refs = runGit(['for-each-ref', '--format=%(refname:short)', 'refs/remotes/origin'], root);
  if (refs.failure) return { entries, failure: 'git-failure' };

  for (const line of refs.stdout.split('\n').map((s) => s.trim()).filter(Boolean)) {
    const branch = line.replace(/^origin\//, '');
    if (branch === 'HEAD' || branch === integration) continue;
    if (!inScope(branch, worktrees)) continue; // namespace + live-worktree guard — never reaches the decision fn

    const cherryEquivalent = isCherryEquivalent(root, integration, `origin/${branch}`);
    if (cherryEquivalent === null) {
      entries.push({ name: branch, kind: 'remote-branch', action: 'skip', reason: 'cherry-failed' });
      continue;
    }
    const prState = resolve(root, branch);
    const decision = decideRemotePrune({ branch, cherryEquivalent, prState });
    if (decision.action === 'skip' || dryRun) {
      entries.push({ name: branch, kind: 'remote-branch', action: decision.action, reason: decision.reason });
      continue;
    }
    const del = runGit(['push', 'origin', '--delete', branch], root);
    entries.push(del.failure
      ? { name: branch, kind: 'remote-branch', action: 'skip', reason: 'delete-failed' }
      : { name: branch, kind: 'remote-branch', action: 'delete', reason: decision.reason });
  }

  return { entries, failure: null };
}

module.exports = { decideRemotePrune, pruneRemote };
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test tests/bin-lib/reconcile/prune-remote.test.js`
Expected: PASS (5 tests)

- [ ] **Step 6: Run the sibling suite to confirm the export change broke nothing**

Run: `node --test tests/bin-lib/reconcile/archive-branches.test.js`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add bin/lib/reconcile/prune-remote.js bin/lib/reconcile/archive-branches.js tests/bin-lib/reconcile/prune-remote.test.js
git commit -m "Add prune-remote reconcile check — merged-PR + cherry-equivalence gated pushed deletion, refs #570"
```

---

### Task 2: prune-remote integration tests against a real bare origin

**Files:**
- Modify: `tests/bin-lib/reconcile/prune-remote.test.js` (append)

**Interfaces:**
- Consumes: `pruneRemote({ cwd, integration, dryRun, resolvePr })` from Task 1 — `resolvePr` injection avoids any live `gh` call, same as `archive-branches.test.js`'s fixtures.
- Produces: nothing new — test-only task.

- [ ] **Step 1: Append the fixture helpers and integration tests**

Append to `tests/bin-lib/reconcile/prune-remote.test.js`:

```js
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pruneRemote } = require('../../../bin/lib/reconcile/prune-remote');

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

// A clone wired to a real bare origin — push --delete must actually land.
function makeRepoWithOrigin() {
  const origin = fs.mkdtempSync(path.join(os.tmpdir(), 'prune-remote-origin-'));
  git(origin, 'init', '--bare', '-b', 'main');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prune-remote-'));
  git(dir, 'init', '-b', 'main');
  git(dir, 'config', 'user.email', 't@t');
  git(dir, 'config', 'user.name', 't');
  fs.writeFileSync(path.join(dir, 'a.txt'), 'a\n');
  git(dir, 'add', 'a.txt');
  git(dir, 'commit', '-m', 'init');
  git(dir, 'remote', 'add', 'origin', origin);
  git(dir, 'push', '-u', 'origin', 'main');
  return dir;
}

test('pruneRemote: squash-merged remote build/* branch is deleted on origin; dry-run only reports', () => {
  const dir = makeRepoWithOrigin();
  git(dir, 'checkout', '-b', 'build/merged');
  fs.writeFileSync(path.join(dir, 'b.txt'), 'b\n');
  git(dir, 'add', 'b.txt');
  git(dir, 'commit', '-m', 'change');
  git(dir, 'push', 'origin', 'build/merged');
  git(dir, 'checkout', 'main');
  git(dir, 'cherry-pick', 'build/merged'); // merged in substance (squash-merge shape)
  git(dir, 'branch', '-D', 'build/merged'); // local branch already disposed; remote lingers

  const dry = pruneRemote({ cwd: dir, integration: 'main', dryRun: true, resolvePr: () => ({ number: 1, state: 'MERGED' }) });
  assert.strictEqual(dry.entries.find((e) => e.name === 'build/merged').action, 'delete');
  assert.match(git(dir, 'ls-remote', 'origin', 'refs/heads/build/merged'), /build\/merged/); // dry-run did not mutate

  const real = pruneRemote({ cwd: dir, integration: 'main', dryRun: false, resolvePr: () => ({ number: 1, state: 'MERGED' }) });
  const entry = real.entries.find((e) => e.name === 'build/merged');
  assert.strictEqual(entry.action, 'delete');
  assert.strictEqual(entry.kind, 'remote-branch');
  assert.strictEqual(git(dir, 'ls-remote', 'origin', 'refs/heads/build/merged').trim(), ''); // gone on origin
});

test('pruneRemote: unmerged remote branch and non-namespace remote branch are never deleted', () => {
  const dir = makeRepoWithOrigin();
  git(dir, 'checkout', '-b', 'build/unmerged');
  fs.writeFileSync(path.join(dir, 'c.txt'), 'c\n');
  git(dir, 'add', 'c.txt');
  git(dir, 'commit', '-m', 'unmerged');
  git(dir, 'push', 'origin', 'build/unmerged');
  git(dir, 'checkout', 'main');
  git(dir, 'branch', '-D', 'build/unmerged');
  git(dir, 'checkout', '-b', 'feature/out-of-scope');
  fs.writeFileSync(path.join(dir, 'd.txt'), 'd\n');
  git(dir, 'add', 'd.txt');
  git(dir, 'commit', '-m', 'oos');
  git(dir, 'push', 'origin', 'feature/out-of-scope');
  git(dir, 'checkout', 'main');
  git(dir, 'branch', '-D', 'feature/out-of-scope');

  const r = pruneRemote({ cwd: dir, integration: 'main', dryRun: false, resolvePr: () => ({ number: 1, state: 'MERGED' }) });
  assert.strictEqual(r.entries.find((e) => e.name === 'build/unmerged').reason, 'not-cherry-equivalent');
  assert.strictEqual(r.entries.find((e) => e.name === 'feature/out-of-scope'), undefined); // silent scope guard
  assert.match(git(dir, 'ls-remote', 'origin', 'refs/heads/build/unmerged'), /build\/unmerged/);
  assert.match(git(dir, 'ls-remote', 'origin', 'refs/heads/feature/out-of-scope'), /feature\/out-of-scope/);
});

test('pruneRemote: integration branch and origin/HEAD are never candidates', () => {
  const dir = makeRepoWithOrigin();
  const r = pruneRemote({ cwd: dir, integration: 'main', dryRun: false, resolvePr: () => ({ number: 1, state: 'MERGED' }) });
  assert.strictEqual(r.entries.length, 0);
  assert.match(git(dir, 'ls-remote', 'origin', 'refs/heads/main'), /refs\/heads\/main/);
});

test('pruneRemote: branch attached to a live worktree is silently out of scope', () => {
  const dir = makeRepoWithOrigin();
  git(dir, 'checkout', '-b', 'build/wt');
  fs.writeFileSync(path.join(dir, 'e.txt'), 'e\n');
  git(dir, 'add', 'e.txt');
  git(dir, 'commit', '-m', 'wt');
  git(dir, 'push', 'origin', 'build/wt');
  git(dir, 'checkout', 'main');
  git(dir, 'cherry-pick', 'build/wt'); // even cherry-equivalent…
  const wt = fs.mkdtempSync(path.join(os.tmpdir(), 'prune-remote-wt-'));
  git(dir, 'worktree', 'add', path.join(wt, 'w'), 'build/wt'); // …but attached to a live worktree

  const r = pruneRemote({ cwd: dir, integration: 'main', dryRun: false, resolvePr: () => ({ number: 1, state: 'MERGED' }) });
  assert.strictEqual(r.entries.find((e) => e.name === 'build/wt'), undefined);
  assert.match(git(dir, 'ls-remote', 'origin', 'refs/heads/build/wt'), /build\/wt/);
});
```

- [ ] **Step 2: Run the suite**

Run: `node --test tests/bin-lib/reconcile/prune-remote.test.js`
Expected: PASS (9 tests)

- [ ] **Step 3: Commit**

```bash
git add tests/bin-lib/reconcile/prune-remote.test.js
git commit -m "Add prune-remote integration tests against a real bare origin — refs #570"
```

---

### Task 3: Wire remote-prune into index.js, hooks.js fallback, and session-start summary

**Files:**
- Modify: `bin/lib/reconcile/index.js` (ALL_CHECKS line 26, result literal line 38, local-merge skip string line 72, dispatch between `archive-branches` and `reap` around line 134)
- Modify: `bin/hooks.js:207` (catch-fallback result shape)
- Modify: `bin/lib/hooks/session-start.js` (summary block, after the `archivedBranches` line ~134)
- Modify: `tests/console-execution.test.js:137,144` (pinned literals)
- Modify: `tests/reconcile.test.js:436,476` (local-merge skip deepStrictEqual)
- Modify: `tests/console-execute.test.js:298` (same skip deepStrictEqual)
- Modify: `tests/bin-lib/reconcile/prune-remote.test.js` (append wiring tests)

**Interfaces:**
- Consumes: `pruneRemote` from Task 1.
- Produces: `reconcile()` result gains `remoteBranches: null | entries[]`; `ALL_CHECKS` gains `'remote-prune'`; local-merge skip string becomes `'mirror,release,archive,archive-branches,remote-prune,console'`.

- [ ] **Step 1: Write the failing wiring tests**

Append to `tests/bin-lib/reconcile/prune-remote.test.js`:

```js
const { reconcile, ALL_CHECKS } = require('../../../bin/lib/reconcile');

test("index: ALL_CHECKS includes 'remote-prune'; dispatch sits between 'archive-branches' and 'reap'; result gains remoteBranches slot", () => {
  assert.ok(ALL_CHECKS.includes('remote-prune'));
  const src = fs.readFileSync(path.join(__dirname, '../../../bin/lib/reconcile/index.js'), 'utf8');
  const iBranches = src.indexOf("checks.includes('archive-branches')");
  const iRemote = src.indexOf("checks.includes('remote-prune')");
  const iReap = src.indexOf("checks.includes('reap')", iBranches);
  assert.ok(iBranches > -1 && iRemote > iBranches && iReap > iRemote, 'dispatch order: archive-branches < remote-prune < reap');
});

test('index: no-remote repo never dispatches remote-prune; result.remoteBranches stays null', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prune-remote-norepo-'));
  git(dir, 'init', '-b', 'main');
  git(dir, 'config', 'user.email', 't@t');
  git(dir, 'config', 'user.name', 't');
  fs.writeFileSync(path.join(dir, 'a.txt'), 'a\n');
  git(dir, 'add', 'a.txt');
  git(dir, 'commit', '-m', 'init');
  const r = reconcile({ cwd: dir, checks: ['remote-prune'] });
  assert.strictEqual(r.remoteBranches, null);
});
```

Run: `node --test tests/bin-lib/reconcile/prune-remote.test.js`
Expected: FAIL — `ALL_CHECKS` does not include `'remote-prune'`

- [ ] **Step 2: Wire index.js**

In `bin/lib/reconcile/index.js`:

1. Add the require after the `archiveBranches` require (line 18):
```js
const { pruneRemote } = require('./prune-remote');
```
2. Update the checks array (line 26):
```js
const ALL_CHECKS = ['mirror', 'reap', 'release', 'archive', 'archive-branches', 'remote-prune', 'console'];
```
3. Update the result literal (line 38):
```js
const result = { mirror: null, worktrees: null, claims: null, runs: null, branches: null, remoteBranches: null, console: null, skipped: [] };
```
4. Update the local-merge skip string (line 72):
```js
result.skipped.push({ check: 'mirror,release,archive,archive-branches,remote-prune,console', reason: 'local-merge-model' });
```
5. Add the dispatch after the `archive-branches` block and before the `reap` block:
```js
  // The family's one pushed mutation (see prune-remote.js's header for the
  // two-signal evidence bar). Same live-ref dependency as archive-branches:
  // the worktree-attachment guard must read worktrees reap has not yet
  // removed, so this too runs before reap (which stays last — see above).
  if (checks.includes('remote-prune')) {
    const r = pruneRemote({ cwd: root, integration, dryRun });
    if (r.failure) {
      result.skipped.push({ check: 'remote-prune', reason: r.failure });
    } else {
      result.remoteBranches = r.entries;
    }
  }
```

- [ ] **Step 3: Update hooks.js fallback shape**

In `bin/hooks.js:207`, add the slot:
```js
      out = { mirror: null, worktrees: null, claims: null, runs: null, branches: null, remoteBranches: null, console: null, skipped: [{ check: 'all', reason: 'reconcile-threw' }] };
```

- [ ] **Step 4: Add the session-start summary line**

In `bin/lib/hooks/session-start.js`, immediately after the `archivedBranches` pair of lines (~line 134):
```js
    const prunedRemote = (result.remoteBranches || []).filter((b) => b.action === 'delete');
    if (prunedRemote.length) summary.push(`${prunedRemote.length} merged remote branch(es) deleted on origin`);
```

- [ ] **Step 5: Update the three pinned test literals**

- `tests/console-execution.test.js:137` — the regex becomes:
```js
  assert.match(INDEX_JS, /const ALL_CHECKS = \['mirror', 'reap', 'release', 'archive', 'archive-branches', 'remote-prune', 'console'\];/);
```
- `tests/console-execution.test.js:144` — becomes:
```js
  assert.match(INDEX_JS, /check: 'mirror,release,archive,archive-branches,remote-prune,console'/);
```
- `tests/reconcile.test.js:436` and `tests/reconcile.test.js:476` — both `deepStrictEqual` lines become:
```js
  assert.deepStrictEqual(r.skipped, [{ check: 'mirror,release,archive,archive-branches,remote-prune,console', reason: 'local-merge-model' }]);
```
- `tests/console-execute.test.js:298` — same replacement as the two above.

- [ ] **Step 6: Run the affected suites**

Run: `node --test tests/bin-lib/reconcile/prune-remote.test.js tests/reconcile.test.js tests/console-execution.test.js tests/console-execute.test.js tests/bin-lib/reconcile/archive-branches.test.js`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add bin/lib/reconcile/index.js bin/hooks.js bin/lib/hooks/session-start.js tests/console-execution.test.js tests/reconcile.test.js tests/console-execute.test.js tests/bin-lib/reconcile/prune-remote.test.js
git commit -m "Wire remote-prune into reconcile dispatch, hooks fallback, and session-start summary — refs #570"
```

---

### Task 4: Update archive-branches.js header comment and plugin-structure docs

**Files:**
- Modify: `bin/lib/reconcile/archive-branches.js:1-7` (header comment)
- Modify: `docs/plugin-structure.md:23` (reconcile module list)

**Interfaces:**
- Consumes: nothing — prose-only task.
- Produces: nothing tasks rely on.

- [ ] **Step 1: Update the archive-branches header**

Replace the header's origin-side sentence (lines 4-7):
```js
// this checkout — never a pushed deletion, never a pushed tag; different
// checkouts converge independently (origin-side cleanup belongs to PR
// merges and tidy's remote-ref pruning).
```
with:
```js
// this checkout — never a pushed deletion, never a pushed tag; different
// checkouts converge independently. Origin-side cleanup belongs to PR
// merges, tidy's remote-ref pruning, and — for plugin-owned branches
// proven merged (MERGED PR + cherry-equivalence) — the sibling
// prune-remote.js check, the family's one pushed mutation.
```

- [ ] **Step 2: Update docs/plugin-structure.md line 23**

In the `bin/lib/reconcile/` entry: after `archive-branches.js (…)`, insert `prune-remote.js (deletes remote plugin-owned branches proven merged — MERGED PR + cherry-equivalence; the family's one pushed mutation)`, and update the run-order parenthetical from `(mirror → console → release → archive → archive-branches → reap, reap last …)` to `(mirror → console → release → archive → archive-branches → remote-prune → reap, reap last …)`.

- [ ] **Step 3: Run the conformance-heavy suites that pin prose**

Run: `node --test tests/reconcile.test.js tests/console-execution.test.js`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add bin/lib/reconcile/archive-branches.js docs/plugin-structure.md
git commit -m "Update archive-branches header and plugin-structure for prune-remote — refs #570"
```

---

### Task 5: Tidy routing rows — remote-prune Reconcile-converged row + Mark-as-specified row

**Files:**
- Modify: `skills/tidy/step-6-auto.md` (routing table — two new rows)
- Modify: `skills/tidy/step-6-interactive.md` (only if its structure carries a parallel per-recommendation table — read it first; if it routes generically, no edit)

**Interfaces:**
- Consumes: the `remote-prune` check name and `prune-remote.js` module path from Tasks 1/3.
- Produces: nothing — doc-only task.

- [ ] **Step 1: Add the remote-prune Reconcile-converged row**

In `skills/tidy/step-6-auto.md`'s routing table, insert directly AFTER the existing "Abandoned-branch archival + locked-worktree resolution" row:

```markdown
| **Merged remote-branch deletion** (remote plugin-owned branches proven merged into the integration branch — reconcile's `remote-prune` check, `bin/lib/reconcile/prune-remote.js`) | Reconcile-converged — reported in **Applied automatically**, never staged | Reconcile-converged (same) | Reconcile-converged (same) — see the preamble's `local-merge` caveat. The pushed deletion is permitted because it is reconcile's own background-convergence write, governed by reconcile's posture, outside the skill-side auto-mode contract — the same exemption the Issue-closed claim release row above documents. Evidence conditions (MERGED PR + cherry-equivalence, both required) live in the module header, never here. A candidate the check skips — open PR, no merged PR, not cherry-equivalent, transport failure — surfaces as a non-actionable skip sub-line under **Applied automatically**'s converged summary. A branch attached to a live worktree is silently out of scope (same `inScope` guard as `archive-branches`). |
```

- [ ] **Step 2: Add the Mark-as-specified row**

In the same table, insert directly BEFORE the first **Delete** row (the auto-apply one that already covers "marked-as-specified design docs"):

```markdown
| **Mark as specified** (Step 3's design-doc classification — no status line, matches existing specs; stamps a `Status: specified — {refs}` line at the top of the doc, matching the existing convention in `docs/superpowers/specs/`) | Stage | Auto-apply | Auto-apply — a tracked-file edit, the same reversibility class as the `local-files` Defer row; the stamp is also what makes the doc eligible for the Delete row above it on a later sweep once its derived specs complete |
```

- [ ] **Step 3: Check the interactive twin**

Read `skills/tidy/step-6-interactive.md`. If it enumerates per-recommendation behavior in a parallel table, add matching entries (interactive mode presents everything, so the likely outcome is no edit — confirm rather than assume, and make no edit when its structure is generic).

- [ ] **Step 4: Run the prose-pinning suites**

Run: `node --test tests/sweep-backstop.test.js`
Expected: PASS (its step-6-auto.md pins target the Arm-ready-PR and unsettled-run rows, which these insertions do not touch)

- [ ] **Step 5: Commit**

```bash
git add skills/tidy/step-6-auto.md skills/tidy/step-6-interactive.md
git commit -m "Route merged remote-branch deletes as Reconcile-converged and add Mark-as-specified routing row — refs #570"
```
