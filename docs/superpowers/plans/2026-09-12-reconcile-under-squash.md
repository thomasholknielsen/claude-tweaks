# Reconcile Under Squash — Implementation Plan (#2252)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `reconcile`'s two branch checks (`prune-remote.js`, `archive-branches.js`) keep proving "this branch is merged" after #2251 switched the pr-first merge to `--squash`, where `git cherry` patch-id equivalence no longer holds for a multi-commit branch.

**Architecture:** One new shared helper, `plugin/bin/lib/reconcile/squash-provenance.js`, exports `isSquashMerged(root, integration, branch, prState)` — `true` only when the **confirmed** PR state is `MERGED` *and* that PR's own `mergeCommit.oid` (already returned by `resolvePrState`'s `gh pr list --json …mergeCommit`) sits on the integration branch's first-parent history bounded to `merge-base(integration, branch)..integration`. Both decision tables gain a `squashMerged` input evaluated beside the existing `cherryEquivalent`; `prune-remote.js`'s `not-cherry-equivalent` reason becomes `not-proven-merged`, emitted only when neither proof holds. The cherry path is untouched.

**Tech Stack:** Node 18+ (zero runtime deps), `node --test` with real temp git repos (the fixture style both existing test files already use), markdown docs.

**Spec:** `.claude-tweaks/pipelines/2026-09-11T204239-spec-2251-2252-2253-2254-2255-2256-2258/spec-2252/work/2252-spec.md` (materialized copy of #2252)

## Global Constraints

- **Deliberate deviation from the spec's proof shape (recorded, staged for the Review Console as `build-deviation-1`).** The spec says proof (b) is "a commit subject ending in the literal `(#{N})` suffix `subject.js` appends", keyed by the branch's **PR** number. That can never match here: `composeSubject` (`plugin/bin/lib/release/subject.js:69`) appends the lowest **record** number (`feat: … (#2251)`), while reconcile only knows the PR number (`#2262`) — the literal design would skip every squash-merged branch forever, the exact silent failure this unit exists to fix. The proof instead uses the PR's own `mergeCommit.oid`, which `resolvePrState` already returns on the per-branch confirm (`pr-state.js`'s `PR_LIST_ARGS`; the bulk screen deliberately omits it) and which `archive-merged.js`'s `localHasMerge` already treats as the merge-commit identity. It satisfies every stated intent: two independent signals (GitHub-reported PR state + local git reachability), a bounded first-parent scan, fail-safe `false` on a rewritten tip. Nothing is imported from `subject.js`.
- **Vocabulary sweep result (run 2026-09-12, repo-wide `grep -rn 'not-cherry-equivalent'` excluding `node_modules` and `pipelines/archive`):** live consumers are exactly `plugin/bin/lib/reconcile/prune-remote.js:69` and `tests/bin-lib/reconcile/prune-remote.test.js:18,140,162`. No live pinned-vocabulary list from #1082 exists anymore (the six-item list appears in no test or doc — `merged-pr-cherry-equivalent` is asserted only in the prune-remote test). Task 2 updates all four sites in one commit and states the #1082 supersession in the test file's own comment.
- Reason strings are free-form (nothing in `format-summary.js` or `docs/` switches on them). New reasons introduced: `not-proven-merged` (prune-remote skip, rename), `merged-pr-squash-merged` (prune-remote delete), `squash-merged` (archive-branches delete). `merged-pr-without-cherry-equivalence` (archive skip) keeps its name — still literally true when neither proof holds.
- `isSquashMerged` returns a plain boolean, never `null`: unproven and unprovable both mean "skip", so a tri-state would only complicate the decision tables. Any git failure → `false`.
- The helper runs git only when cherry-equivalence already said no (`cherryEquivalent === false`) — a cherry-equivalent branch never pays for the second proof.
- Commit message style: `{Verb} {what} — {detail}`, no conventional-commit prefixes in THIS repo's own commits, `refs #2252` in the subject or body (never `closes`/`fixes`). Every commit ends with the trailer `Claude-Session: https://claude.ai/code/session_018rz67jb18j1RLSqhjEdYWH`.
- Working directory: every command runs from the worktree `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-release-skill`. Never `cd` to the main checkout. Verify with `pwd` and `git rev-parse --show-toplevel` before the first commit.
- Scope: touch only what a task names. A pre-existing bug noticed in passing is reported in the task's reply, not fixed. Commit tests only where the task asks for them, sized like the neighboring test files.

---

### Task 1: The shared proof — `plugin/bin/lib/reconcile/squash-provenance.js`

**Files:**
- Create: `plugin/bin/lib/reconcile/squash-provenance.js`
- Test: `tests/bin-lib/reconcile/squash-provenance.test.js`

**Interfaces:**
- Consumes: `runGit(args, cwd)` from `plugin/bin/lib/hooks/git-exec.js` — returns `{ stdout, failure, stderr }`; success → `stdout` is the trimmed string and `failure` is `null`.
- Produces: `isSquashMerged(root, integration, branch, prState) → boolean`.
  - `root`: repo path. `integration`: bare integration branch name (e.g. `'main'`, exactly what `pruneRemote`/`archiveBranches` receive). `branch`: the ref to fork-point against — `origin/{name}` from prune-remote, the local name from archive-branches. `prState`: the **confirmed** per-branch PR object (`{ number, state, mergedAt, updatedAt, mergeCommit: { oid } }`), or `null` / `'gh-absent'` / `'network-failure'`.
  - `true` iff `prState.state === 'MERGED'`, `prState.mergeCommit.oid` is a 40-hex sha, and that sha appears in `git rev-list --first-parent {merge-base}..{integration}` where `{merge-base}` = `git merge-base {integration} {branch}`. Everything else — including any git failure — is `false`.

- [ ] **Step 1: Write the failing tests**

Create `tests/bin-lib/reconcile/squash-provenance.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { isSquashMerged } = require('../../../plugin/bin/lib/reconcile/squash-provenance');

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

// main: init -> (squash of build/two) ; build/two: two commits off init.
// `git merge --squash` + one commit is the exact shape `gh pr merge --squash`
// leaves on the base branch: one commit whose patch-id matches neither
// branch commit, so `git cherry` cannot prove it (the #2252 gap).
function makeSquashFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'squash-provenance-'));
  git(dir, 'init', '-b', 'main');
  git(dir, 'config', 'user.email', 't@t');
  git(dir, 'config', 'user.name', 't');
  fs.writeFileSync(path.join(dir, 'a.txt'), 'a\n');
  git(dir, 'add', 'a.txt');
  git(dir, 'commit', '-m', 'init');
  const init = git(dir, 'rev-parse', 'HEAD');
  git(dir, 'checkout', '-b', 'build/two');
  fs.writeFileSync(path.join(dir, 'b.txt'), 'b\n');
  git(dir, 'add', 'b.txt');
  git(dir, 'commit', '-m', 'first');
  fs.writeFileSync(path.join(dir, 'c.txt'), 'c\n');
  git(dir, 'add', 'c.txt');
  git(dir, 'commit', '-m', 'second');
  git(dir, 'checkout', 'main');
  git(dir, 'merge', '--squash', 'build/two');
  git(dir, 'commit', '-m', 'feat: two things (#2251)');
  const squash = git(dir, 'rev-parse', 'HEAD');
  return { dir, init, squash };
}

const merged = (oid) => ({ number: 7, state: 'MERGED', mergedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', mergeCommit: { oid } });

test('isSquashMerged: confirmed MERGED PR whose mergeCommit is on the bounded first-parent history -> true', () => {
  const { dir, squash } = makeSquashFixture();
  assert.strictEqual(git(dir, 'cherry', 'main', 'build/two').split('\n').every((l) => l.startsWith('-')), false); // the gap is real: cherry says unmerged
  assert.strictEqual(isSquashMerged(dir, 'main', 'build/two', merged(squash)), true);
});

test('isSquashMerged: mergeCommit not reachable on the tip (rewritten history) -> false, fail safe', () => {
  const { dir, init, squash } = makeSquashFixture();
  git(dir, 'checkout', '--detach');
  git(dir, 'branch', '-f', 'main', init); // main rewritten: the squash commit is gone from the tip
  git(dir, 'checkout', 'main');
  assert.strictEqual(isSquashMerged(dir, 'main', 'build/two', merged(squash)), false);
  assert.strictEqual(isSquashMerged(dir, 'main', 'build/two', merged('f'.repeat(40))), false); // never-existed oid
});

test('isSquashMerged: the scan is bounded to the fork point — an ancestor of the fork point never proves anything', () => {
  const { dir, init } = makeSquashFixture();
  // `init` IS reachable from main, but it precedes merge-base(main, build/two) — outside the bounded window.
  assert.strictEqual(isSquashMerged(dir, 'main', 'build/two', merged(init)), false);
});

test('isSquashMerged: non-MERGED, malformed, or transport prState -> false without touching git', () => {
  const { dir, squash } = makeSquashFixture();
  assert.strictEqual(isSquashMerged(dir, 'main', 'build/two', { ...merged(squash), state: 'CLOSED' }), false);
  assert.strictEqual(isSquashMerged(dir, 'main', 'build/two', { ...merged(squash), state: 'OPEN' }), false);
  assert.strictEqual(isSquashMerged(dir, 'main', 'build/two', { number: 7, state: 'MERGED' }), false); // no mergeCommit (bulk-screen shape)
  assert.strictEqual(isSquashMerged(dir, 'main', 'build/two', { ...merged(squash), mergeCommit: { oid: 'abc' } }), false); // malformed oid
  assert.strictEqual(isSquashMerged(dir, 'main', 'build/two', null), false);
  assert.strictEqual(isSquashMerged(dir, 'main', 'build/two', 'gh-absent'), false);
  assert.strictEqual(isSquashMerged(dir, 'main', 'build/two', 'network-failure'), false);
});

test('isSquashMerged: git failure (unknown integration or branch ref) -> false, fail safe', () => {
  const { dir, squash } = makeSquashFixture();
  assert.strictEqual(isSquashMerged(dir, 'no-such-branch', 'build/two', merged(squash)), false);
  assert.strictEqual(isSquashMerged(dir, 'main', 'no-such-branch', merged(squash)), false);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/bin-lib/reconcile/squash-provenance.test.js`
Expected: FAIL — `Cannot find module '../../../plugin/bin/lib/reconcile/squash-provenance'`.

- [ ] **Step 3: Write the helper**

Create `plugin/bin/lib/reconcile/squash-provenance.js`:

```js
// bin/lib/reconcile/squash-provenance.js — the second "is this branch
// merged?" proof the two branch checks (prune-remote.js, archive-branches.js)
// evaluate beside `git cherry` patch-id equivalence (#2252). #2251 switched
// the pr-first merge to `gh pr merge --squash`: a squash commit's patch-id
// matches none of the branch's own commits once the branch holds more than
// one, so cherry-equivalence reads every squash-merged multi-commit branch
// as unmerged and both checks would skip it forever.
//
// The proof is two independent signals that must both hold: the CONFIRMED
// per-branch PR state says MERGED (a GitHub fact, `resolvePrState`'s
// `gh pr list --json …mergeCommit` — the bulk screen omits mergeCommit, so
// a screen-shaped prState can never satisfy this), and that PR's own
// mergeCommit oid sits on the integration branch's first-parent history
// between the branch's fork point and the tip. Bounded to
// `merge-base(integration, branch)..integration` — never an unbounded
// history walk. A rewritten/force-pushed integration tip that no longer
// carries the oid resolves to false: not-yet-proven, never falsely proven.
//
// Boolean, never null — unproven and unprovable both mean "skip" at every
// call site, so any git failure is simply false (fail safe). Same oid
// validation archive-merged.js's localHasMerge applies; that helper asks
// "is the merge commit anywhere in local history?" for run-dir archival,
// this one asks the narrower per-branch question the decision tables need.
'use strict';

const { runGit } = require('../hooks/git-exec');

function isSquashMerged(root, integration, branch, prState) {
  if (!prState || typeof prState !== 'object' || prState.state !== 'MERGED') return false;
  const mc = prState.mergeCommit;
  const oid = mc && typeof mc.oid === 'string' && /^[0-9a-f]{40}$/.test(mc.oid) ? mc.oid : null;
  if (!oid) return false;
  const fork = runGit(['merge-base', integration, branch], root);
  if (fork.failure || !fork.stdout) return false;
  const scan = runGit(['rev-list', '--first-parent', `${fork.stdout}..${integration}`], root);
  if (scan.failure || scan.stdout === null) return false;
  return scan.stdout.split('\n').some((line) => line.trim() === oid);
}

module.exports = { isSquashMerged };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/bin-lib/reconcile/squash-provenance.test.js`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/reconcile/squash-provenance.js tests/bin-lib/reconcile/squash-provenance.test.js
git commit -m "Add squash-provenance proof for reconcile's branch checks — confirmed MERGED PR + its mergeCommit on the bounded first-parent history, refs #2252

Claude-Session: https://claude.ai/code/session_018rz67jb18j1RLSqhjEdYWH"
```

---

### Task 2: `prune-remote.js` — dual proof, `not-proven-merged`, vocabulary sweep

**Files:**
- Modify: `plugin/bin/lib/reconcile/prune-remote.js:1-17` (header), `:37-38` (requires), `:59-75` (`decideRemotePrune`), `:134-147` (candidate loop)
- Test: `tests/bin-lib/reconcile/prune-remote.test.js:17-19` (rename), `:140` (rename), `:162` (rename), plus new tests appended after the `pruneRemote: unmerged remote branch …` test (line 166)

**Interfaces:**
- Consumes: `isSquashMerged(root, integration, branch, prState) → boolean` from Task 1.
- Produces: `decideRemotePrune({ branch, cherryEquivalent, squashMerged = false, prState }) → { action: 'delete' | 'skip', reason }`. Reasons: `gh-absent`, `network-failure`, `pr-open`, `not-proven-merged` (neither proof), `no-merged-pr`, `merged-pr-cherry-equivalent`, `merged-pr-squash-merged`. The provisional screen call keeps passing `cherryEquivalent: true` and omits `squashMerged` (defaults `false`) — unchanged sentinel semantics.

- [ ] **Step 1: Update the three existing assertions and add the failing tests**

In `tests/bin-lib/reconcile/prune-remote.test.js`, replace lines 17-19 with:

```js
// #2252 supersedes #1082's "no new per-branch reasons" pin for exactly one
// rename: `not-cherry-equivalent` -> `not-proven-merged`, because the skip
// now means "neither cherry-equivalence nor squash provenance proved it",
// and adds the delete-side `merged-pr-squash-merged`. Deliberate,
// documented exception — see docs/reconcile-checks.md's Merged-proof section.
test('decideRemotePrune: merged PR but neither proof (rebased remnant) -> skip not-proven-merged', () => {
  assert.strictEqual(decideRemotePrune({ branch: 'build/x', cherryEquivalent: false, prState: { number: 3, state: 'MERGED' } }).reason, 'not-proven-merged');
  assert.strictEqual(decideRemotePrune({ branch: 'build/x', cherryEquivalent: false, squashMerged: false, prState: { number: 3, state: 'MERGED' } }).reason, 'not-proven-merged');
});
test('decideRemotePrune: merged PR + squash provenance (not cherry-equivalent) -> delete', () => {
  const r = decideRemotePrune({ branch: 'build/x', cherryEquivalent: false, squashMerged: true, prState: { number: 3, state: 'MERGED' } });
  assert.strictEqual(r.action, 'delete');
  assert.strictEqual(r.reason, 'merged-pr-squash-merged');
});
test('decideRemotePrune: squash provenance never outranks OPEN or a missing merged PR', () => {
  assert.strictEqual(decideRemotePrune({ branch: 'build/x', cherryEquivalent: false, squashMerged: true, prState: { number: 3, state: 'OPEN' } }).reason, 'pr-open');
  assert.strictEqual(decideRemotePrune({ branch: 'build/x', cherryEquivalent: false, squashMerged: true, prState: null }).reason, 'no-merged-pr');
});
```

Change line 140's assertion (inside `pruneRemote: refreshes origin before judging …`) to:

```js
  assert.strictEqual(entry.reason, 'not-proven-merged'); // the internal fetch pulled the new commit in
```

Change line 162's assertion (inside `pruneRemote: unmerged remote branch and non-namespace …`) to:

```js
  assert.strictEqual(r.entries.find((e) => e.name === 'build/unmerged').reason, 'not-proven-merged');
```

Append directly after that test (after its closing `});`, before `pruneRemote: integration branch is excluded …`):

```js
// #2252 — the squash-merge shape `gh pr merge --squash` leaves on origin's
// main: a two-commit branch collapsed into one commit whose patch-id matches
// neither branch commit, so `git cherry` reads it as unmerged. The confirm's
// mergeCommit oid is what proves it.
function buildSquashMergedFixture() {
  const dir = makeRepoWithOrigin();
  git(dir, 'checkout', '-b', 'build/squashed');
  fs.writeFileSync(path.join(dir, 's1.txt'), 's1\n');
  git(dir, 'add', 's1.txt');
  git(dir, 'commit', '-m', 'first');
  fs.writeFileSync(path.join(dir, 's2.txt'), 's2\n');
  git(dir, 'add', 's2.txt');
  git(dir, 'commit', '-m', 'second');
  git(dir, 'push', 'origin', 'build/squashed');
  git(dir, 'checkout', 'main');
  const preSquash = git(dir, 'rev-parse', 'HEAD').trim();
  git(dir, 'merge', '--squash', 'build/squashed');
  git(dir, 'commit', '-m', 'feat: squashed (#2251)');
  const squash = git(dir, 'rev-parse', 'HEAD').trim();
  git(dir, 'branch', '-D', 'build/squashed'); // local branch disposed; remote lingers
  return { dir, preSquash, squash };
}
const mergedVia = (oid) => ({ number: 1, state: 'MERGED', mergedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', mergeCommit: { oid } });

test('pruneRemote: squash-merged multi-commit branch (MERGED PR + mergeCommit on the tip) is deleted on origin — AC 1', () => {
  const { dir, squash } = buildSquashMergedFixture();
  const r = pruneRemote({ cwd: dir, integration: 'main', dryRun: false, resolvePr: () => mergedVia(squash), resolvePrBulk: permissiveScreen });
  const entry = r.entries.find((e) => e.name === 'build/squashed');
  assert.strictEqual(entry.action, 'delete');
  assert.strictEqual(entry.reason, 'merged-pr-squash-merged');
  assert.strictEqual(git(dir, 'ls-remote', 'origin', 'refs/heads/build/squashed').trim(), ''); // gone on origin
});

test('pruneRemote: same squash shape but no merged PR -> skip not-proven-merged, branch survives — AC 2', () => {
  const { dir } = buildSquashMergedFixture();
  const r = pruneRemote({ cwd: dir, integration: 'main', dryRun: false, resolvePr: () => null, resolvePrBulk: permissiveScreen });
  const entry = r.entries.find((e) => e.name === 'build/squashed');
  assert.strictEqual(entry.action, 'skip');
  assert.strictEqual(entry.reason, 'not-proven-merged');
  assert.match(git(dir, 'ls-remote', 'origin', 'refs/heads/build/squashed'), /build\/squashed/);
});

test('pruneRemote: MERGED PR whose mergeCommit is no longer on the rewritten tip -> skip not-proven-merged, never deleted — AC 5', () => {
  const { dir, preSquash, squash } = buildSquashMergedFixture();
  git(dir, 'checkout', '--detach');
  git(dir, 'branch', '-f', 'main', preSquash); // force-pushed/rewritten integration history: the squash commit is gone
  git(dir, 'checkout', 'main');
  const r = pruneRemote({ cwd: dir, integration: 'main', dryRun: false, resolvePr: () => mergedVia(squash), resolvePrBulk: permissiveScreen });
  const entry = r.entries.find((e) => e.name === 'build/squashed');
  assert.strictEqual(entry.action, 'skip');
  assert.strictEqual(entry.reason, 'not-proven-merged');
  assert.match(git(dir, 'ls-remote', 'origin', 'refs/heads/build/squashed'), /build\/squashed/);
});
```

- [ ] **Step 2: Run the test file to verify the new tests fail and the old ones still pass**

Run: `node --test tests/bin-lib/reconcile/prune-remote.test.js`
Expected: FAIL — the two renamed assertions and the AC 1/AC 2/AC 5 tests fail (`'not-cherry-equivalent' !== 'not-proven-merged'`, `'skip' !== 'delete'`); every other test passes. Do not proceed on any other failure shape.

- [ ] **Step 3: Implement the dual proof**

In `plugin/bin/lib/reconcile/prune-remote.js`:

Replace the header lines 9-13 (`// per-branch (resolvePrState) …` through `// for the ambiguous cases.`) with:

```js
// per-branch (resolvePrState) for any branch the screen didn't already
// skip — AND one of two merged-in-substance proofs of the remote ref
// against the integration branch: cherry-equivalence (`git cherry`, the
// same evidence archive-branches.js documents; ancestry alone is
// explicitly not trusted) or, when cherry says no, squash provenance
// (squash-provenance.js, #2252: the confirmed PR's own mergeCommit oid on
// the bounded first-parent history — what `gh pr merge --squash` leaves).
// Anything weaker — no PR, a closed unmerged PR, a proof without a merged
// PR — skips, keeping today's staged-in-tidy path for the ambiguous cases.
```

Add after line 38 (`const { resolvePrState, resolvePrStatesBulk } = require('./pr-state');`):

```js
const { isSquashMerged } = require('./squash-provenance');
```

Replace `decideRemotePrune` (lines 59-75) with:

```js
// One remote branch's evidence -> what to do. Pure — no I/O.
//   { action: 'delete' | 'skip', reason }
// squashMerged (#2252) is the second proof, consulted only where
// cherryEquivalent is false; the screen's provisional call omits it.
function decideRemotePrune({ branch, cherryEquivalent, squashMerged = false, prState }) {
  if (prState === 'gh-absent' || prState === 'network-failure') {
    return { action: 'skip', reason: prState }; // evidence unknown — fail closed
  }
  if (prState && prState.state === 'OPEN') {
    return { action: 'skip', reason: 'pr-open' }; // work may still be landing
  }
  if (!cherryEquivalent && !squashMerged) {
    return { action: 'skip', reason: 'not-proven-merged' }; // neither proof — content not proven merged
  }
  if (!prState || prState.state !== 'MERGED') {
    return { action: 'skip', reason: 'no-merged-pr' }; // a proof alone is not enough for a pushed delete
  }
  return { action: 'delete', reason: cherryEquivalent ? 'merged-pr-cherry-equivalent' : 'merged-pr-squash-merged' };
}
```

Replace lines 140-142 (the `// Confirm runs under dryRun too …` comment, the `const prState = …` line, and the `const decision = …` line) with:

```js
    // Confirm runs under dryRun too — reported reasons are confirmed reasons.
    const prState = resolve(root, branch, { preferOpen: true });
    // Second proof (#2252), only when cherry could not prove it: the confirm
    // is what carries mergeCommit, so it must precede this call.
    const squashMerged = cherryEquivalent ? false : isSquashMerged(root, integration, `origin/${branch}`, prState);
    const decision = decideRemotePrune({ branch, cherryEquivalent, squashMerged, prState });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/bin-lib/reconcile/prune-remote.test.js tests/bin-lib/reconcile/squash-provenance.test.js`
Expected: PASS, all tests. Then run `node --test tests/reconcile.test.js` — Expected: PASS (index-level dispatch is untouched, this confirms it).

- [ ] **Step 5: Verify the vocabulary sweep is clean**

Run: `grep -rn 'not-cherry-equivalent' plugin tests docs --include='*.js' --include='*.md'`
Expected: zero lines (the only remaining mentions live in the materialized spec under `.claude-tweaks/` and in prior-run records, which the AC excludes as historical).

- [ ] **Step 6: Commit**

```bash
git add plugin/bin/lib/reconcile/prune-remote.js tests/bin-lib/reconcile/prune-remote.test.js
git commit -m "Prove squash-merged remote branches in prune-remote — dual proof, not-cherry-equivalent renamed not-proven-merged, refs #2252

Claude-Session: https://claude.ai/code/session_018rz67jb18j1RLSqhjEdYWH"
```

---

### Task 3: `archive-branches.js` — the same helper, same dual proof

**Files:**
- Modify: `plugin/bin/lib/reconcile/archive-branches.js:5-9` and `:18-21` (header), `:41` (requires), `:59-83` (`decideArchive`), `:185-201` (branch loop)
- Test: `tests/bin-lib/reconcile/archive-branches.test.js` — new unit test after line 45, new integration tests after the `archiveBranches: cherry-equivalent build/* branch is deleted …` test (ends ~line 172)

**Interfaces:**
- Consumes: `isSquashMerged(root, integration, branch, prState) → boolean` from Task 1.
- Produces: `decideArchive({ branch, tipAgeDays, cherryEquivalent, squashMerged = false, prState }) → { action: 'delete' | 'tag-and-delete' | 'skip', reason }`; new delete reason `squash-merged`. Existing reasons unchanged.

- [ ] **Step 1: Add the failing tests**

In `tests/bin-lib/reconcile/archive-branches.test.js`, insert after line 45 (after the `decideArchive: unmerged + merged PR (rebased remnant) -> skip` test):

```js
// #2252: squash provenance is the second proof — delete without a tag,
// exactly like cherry-equivalence, but never ahead of OPEN.
test('decideArchive: squash-merged (not cherry-equivalent) + merged PR -> delete, reason squash-merged', () => {
  const r = decideArchive({ branch: 'build/x', tipAgeDays: 30, cherryEquivalent: false, squashMerged: true, prState: { number: 3, state: 'MERGED' } });
  assert.strictEqual(r.action, 'delete');
  assert.strictEqual(r.reason, 'squash-merged');
  assert.strictEqual(decideArchive({ branch: 'build/x', tipAgeDays: 30, cherryEquivalent: false, squashMerged: true, prState: { number: 3, state: 'OPEN' } }).action, 'skip');
  assert.strictEqual(decideArchive({ branch: 'build/x', tipAgeDays: 30, cherryEquivalent: false, squashMerged: false, prState: { number: 3, state: 'MERGED' } }).reason, 'merged-pr-without-cherry-equivalence');
});
```

Insert after the `archiveBranches: cherry-equivalent build/* branch is deleted …` test's closing `});` (the first `archiveBranches:` integration test, which starts at line 150):

```js
// #2252 — a two-commit local branch squash-merged into main: `git cherry`
// cannot prove it (one squash commit, two branch patch-ids), so only the
// confirm's mergeCommit oid can. Parity with prune-remote (AC 4): the same
// squash-provenance.js helper, the same delete/skip outcome on the same shape.
function makeSquashMergedRepo() {
  const dir = makeRepo();
  git(dir, 'checkout', '-b', 'build/squashed');
  fs.writeFileSync(path.join(dir, 's1.txt'), 's1\n');
  git(dir, 'add', 's1.txt');
  git(dir, 'commit', '-m', 'first');
  fs.writeFileSync(path.join(dir, 's2.txt'), 's2\n');
  git(dir, 'add', 's2.txt');
  git(dir, 'commit', '-m', 'second');
  git(dir, 'checkout', 'main');
  const preSquash = git(dir, 'rev-parse', 'HEAD').trim();
  git(dir, 'merge', '--squash', 'build/squashed');
  git(dir, 'commit', '-m', 'feat: squashed (#2251)');
  const squash = git(dir, 'rev-parse', 'HEAD').trim();
  return { dir, preSquash, squash };
}
const screenMerged = (root, branches) => new Map(branches.map((b) => [b, { number: 1, state: 'MERGED', mergedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }]));
const confirmMergedVia = (oid) => () => ({ number: 1, state: 'MERGED', mergedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', mergeCommit: { oid } });

test('archiveBranches: squash-merged branch (MERGED screen, confirm carries mergeCommit on the tip) is deleted with reason squash-merged, no tag — AC 4', () => {
  const { dir, squash } = makeSquashMergedRepo();
  let confirms = 0;
  const resolvePr = (...args) => { confirms += 1; return confirmMergedVia(squash)(...args); };
  const r = archiveBranches({ cwd: dir, integration: 'main', dryRun: false, resolvePr, resolvePrBulk: screenMerged });
  const entry = r.entries.find((e) => e.name === 'build/squashed');
  assert.strictEqual(entry.action, 'delete');
  assert.strictEqual(entry.reason, 'squash-merged');
  assert.strictEqual(confirms, 1); // the squash candidate is confirmed per-branch exactly once
  assert.doesNotMatch(git(dir, 'branch', '--list', 'build/squashed'), /build\/squashed/); // really gone
  assert.strictEqual(git(dir, 'tag', '--list', 'archive/*').trim(), ''); // no archive tag for a proven merge
});

test('archiveBranches: squash shape whose mergeCommit is no longer on the rewritten tip -> skip merged-pr-without-cherry-equivalence, branch kept — AC 5 parity', () => {
  const { dir, preSquash, squash } = makeSquashMergedRepo();
  git(dir, 'checkout', '--detach');
  git(dir, 'branch', '-f', 'main', preSquash);
  git(dir, 'checkout', 'main');
  const r = archiveBranches({ cwd: dir, integration: 'main', dryRun: false, resolvePr: confirmMergedVia(squash), resolvePrBulk: screenMerged });
  const entry = r.entries.find((e) => e.name === 'build/squashed');
  assert.strictEqual(entry.action, 'skip');
  assert.strictEqual(entry.reason, 'merged-pr-without-cherry-equivalence');
  assert.match(git(dir, 'branch', '--list', 'build/squashed'), /build\/squashed/);
});
```

- [ ] **Step 2: Run the file to verify the new tests fail**

Run: `node --test tests/bin-lib/reconcile/archive-branches.test.js`
Expected: FAIL — the three new tests (`'skip' !== 'delete'` on the unit test and on AC 4; AC 5 parity fails because `confirms`/the confirm path is never reached for a MERGED-screened non-cherry branch today, so `entry.reason` is `merged-pr-without-cherry-equivalence` already — that one may PASS before the change; that is acceptable, it pins the fail-safe outcome). Every pre-existing test passes.

- [ ] **Step 3: Implement**

In `plugin/bin/lib/reconcile/archive-branches.js`:

Replace header lines 7-9 (`// merges, tidy's remote-ref pruning, and — for plugin-owned branches` … `// prune-remote.js check, the family's one pushed mutation.`) with:

```js
// merges, tidy's remote-ref pruning, and — for plugin-owned branches
// proven merged (MERGED PR + cherry-equivalence or squash provenance) —
// the sibling prune-remote.js check, the family's one pushed mutation.
```

Replace header lines 18-21 (`// \`git cherry {integration} {branch}\` is the merged-in-substance evidence —` … `// never trusts \`-d\`'s verdict.`) with:

```js
// `git cherry {integration} {branch}` is the merged-in-substance evidence —
// it catches single-commit squash merges and rebases that ancestry checks
// and `git branch -d` both miss; that is why execution uses `-D` behind
// this decision table and never trusts `-d`'s verdict. It cannot see a
// multi-commit branch squashed into one commit (#2251's `gh pr merge
// --squash`): squash-provenance.js (#2252) is the second proof for that
// shape — the confirmed PR's own mergeCommit on the bounded first-parent
// history — evaluated only where cherry says no.
```

Add after line 41 (`const { resolvePrState, resolvePrStatesBulk } = require('./pr-state');`):

```js
const { isSquashMerged } = require('./squash-provenance');
```

Replace `decideArchive` (lines 59-83) with:

```js
// One branch's evidence -> what to do. Pure — no I/O.
//   { action: 'delete' | 'tag-and-delete' | 'skip', reason }
// squashMerged (#2252) is the second merged-in-substance proof, consulted
// only where cherryEquivalent is false; screen-time callers omit it.
function decideArchive({ branch, tipAgeDays, cherryEquivalent, squashMerged = false, prState }) {
  if (prState === 'gh-absent' || prState === 'network-failure') {
    return { action: 'skip', reason: prState }; // evidence unknown — fail closed
  }
  if (prState && prState.state === 'OPEN') {
    return { action: 'skip', reason: 'pr-open' }; // an open PR means work may be landing
  }
  if (cherryEquivalent) {
    return { action: 'delete', reason: 'cherry-equivalent' }; // merged in substance — no tag needed
  }
  if (squashMerged) {
    return { action: 'delete', reason: 'squash-merged' }; // merged in substance via the confirmed PR's own squash commit
  }
  // No PR at all, or a PR closed without merging: nothing landed, so age alone decides.
  const nothingLanded = prState === null || (prState && prState.state === 'CLOSED');
  if (nothingLanded) {
    if (tipAgeDays > BRANCH_AGE_DAYS) {
      return { action: 'tag-and-delete', reason: `unmerged-aged: ${Math.floor(tipAgeDays)}d > ${BRANCH_AGE_DAYS}d` };
    }
    return { action: 'skip', reason: 'too-young' };
  }
  // Exhaustive: only a MERGED PR reaches here (gh-absent/network-failure, OPEN,
  // and the no-PR/closed-unmerged pair all returned above), and neither proof
  // holds — not patch-equivalent, and no squash commit of its own on the tip.
  return { action: 'skip', reason: 'merged-pr-without-cherry-equivalence' }; // rebased remnant — human territory
}
```

Replace lines 190-201 (from `const provisional = decideArchive({ branch, tipAgeDays, cherryEquivalent, prState: screenPr });` through `const decision = decideArchive({ branch, tipAgeDays, cherryEquivalent, prState });`) with:

```js
      const provisional = decideArchive({ branch, tipAgeDays, cherryEquivalent, prState: screenPr });
      // #2252: a MERGED-screened branch cherry could not prove is the
      // squash-merge shape. Its verdict is not final on screen evidence —
      // mergeCommit rides only on the per-branch confirm — so it joins the
      // destructive candidates below instead of skipping here.
      const squashCandidate = !cherryEquivalent && Boolean(screenPr) && screenPr.state === 'MERGED';
      if (provisional.action === 'skip' && !squashCandidate) {
        entries.push({ name: branch, kind: 'branch', action: 'skip', reason: provisional.reason });
        continue;
      }

      // Destructive candidate (delete or tag-and-delete) or squash candidate:
      // re-read PR state per-branch — today's exact evidence — and re-decide.
      // Cherry is reused, not recomputed: same pass, same local refs,
      // deterministically identical. Runs under dryRun too, so dry-run
      // reasons are confirmed reasons.
      const prState = resolve(root, branch);
      const squashMerged = squashCandidate ? isSquashMerged(root, integration, branch, prState) : false;
      const decision = decideArchive({ branch, tipAgeDays, cherryEquivalent, squashMerged, prState });
```

(The original `// Destructive candidate …` four-line comment at 196-199 is replaced by the comment above; do not leave two copies.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/bin-lib/reconcile/archive-branches.test.js tests/bin-lib/reconcile/prune-remote.test.js tests/bin-lib/reconcile/squash-provenance.test.js tests/reconcile.test.js`
Expected: PASS, all tests — including `archiveBranches source order: OPEN-screened fast path precedes isCherryEquivalent` (line 519, a source-order grep; the edit keeps the OPEN fast path above the cherry call).

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/reconcile/archive-branches.js tests/bin-lib/reconcile/archive-branches.test.js
git commit -m "Apply the squash-provenance proof to archive-branches — same helper as prune-remote, squash-merged delete reason, refs #2252

Claude-Session: https://claude.ai/code/session_018rz67jb18j1RLSqhjEdYWH"
```

---

### Task 4: Docs — `docs/reconcile-checks.md` Merged-proof section and the `plugin-structure.md` inventory line

**Files:**
- Modify: `docs/reconcile-checks.md` (insert a new `## Merged-proof for the two branch checks` section between the `## Adding a new check` section and `## Referenced by`)
- Modify: `docs/plugin-structure.md:27` (the `plugin/bin/lib/reconcile/` inventory line)

**Interfaces:** none — prose only.

- [ ] **Step 1: Add the section to `docs/reconcile-checks.md`**

Insert before the `## Referenced by` heading:

```markdown
## Merged-proof for the two branch checks

`archive-branches.js` (local `-D`) and `prune-remote.js` (the family's one pushed `push --delete`)
both need proof that a plugin-owned branch's content already sits on the integration branch. Two
proofs exist, evaluated in order, and a branch proven by either is eligible:

1. **Cherry-equivalence** — `isCherryEquivalent` (`archive-branches.js`): every branch commit is
   patch-equivalent to one on the integration branch (`git cherry`). Covers merge commits,
   rebases, cherry-picks, and a single-commit squash.
2. **Squash provenance** — `isSquashMerged` (`squash-provenance.js`, #2252), consulted only when
   cherry says no: the **confirmed** per-branch PR state is `MERGED` *and* that PR's own
   `mergeCommit.oid` appears in `git rev-list --first-parent {merge-base}..{integration}`, where
   `{merge-base}` is the branch's fork point from the integration branch. This is what
   `gh pr merge --squash` (#2251) leaves for a multi-commit branch, whose single squash commit
   matches none of the branch's patch-ids. The scan is **bounded to the fork point** — never a
   full-history walk — and a rewritten/force-pushed tip that no longer carries the oid resolves
   to `false`: not-yet-proven, never falsely proven. `mergeCommit` rides only on the per-branch
   confirm (`resolvePrState`), not the bulk screen, so a squash candidate is always confirmed
   before its verdict is final.

Reason vocabulary after #2252 — a deliberate, documented exception to #1082's "no new per-branch
reasons" pin: `prune-remote`'s skip reason `not-cherry-equivalent` is renamed `not-proven-merged`
(emitted only when **neither** proof holds), its delete reason on the squash path is
`merged-pr-squash-merged` (beside `merged-pr-cherry-equivalent`), and `archive-branches` deletes
with reason `squash-merged` (beside `cherry-equivalent`). `merged-pr-without-cherry-equivalence`
keeps its name — still literally true when neither proof holds.
```

- [ ] **Step 2: Update the inventory line in `docs/plugin-structure.md:27`**

In that line, replace the fragment

```
prune-remote.js (deletes remote plugin-owned branches proven merged — MERGED PR + cherry-equivalence; the family's one pushed mutation),
```

with

```
prune-remote.js (deletes remote plugin-owned branches proven merged — MERGED PR + cherry-equivalence or squash provenance; the family's one pushed mutation), squash-provenance.js (the second merged-proof both branch checks share, #2252: the confirmed PR's own mergeCommit on the bounded first-parent history, for the multi-commit squash shape `git cherry` cannot see),
```

- [ ] **Step 3: Verify**

Run: `grep -n 'squash-provenance' docs/reconcile-checks.md docs/plugin-structure.md`
Expected: at least one hit in each file.

Run: `grep -rn 'not-cherry-equivalent' plugin tests docs --include='*.js' --include='*.md'`
Expected: zero lines (AC 6).

Run: `npm test 2>&1 | tail -15`
Expected: PASS (no doc-conformance test regresses).

- [ ] **Step 4: Commit**

```bash
git add docs/reconcile-checks.md docs/plugin-structure.md
git commit -m "Document reconcile's two merged-proofs and the not-proven-merged rename — refs #2252

Claude-Session: https://claude.ai/code/session_018rz67jb18j1RLSqhjEdYWH"
```

---

## Verification (whole plan)

- `npm test 2>&1 | tail -15` — full suite green (a pre-existing `tests/impeccable-cli-contract.test.js` failure from the installed Impeccable 4.1.0 vs pinned 3.6.0 environment drift is known — ledger row 21 of `docs/plans/2026-09-11-release-skill-ledger.md` — and is not this plan's; every other file must pass).
- AC 1: `pruneRemote: squash-merged multi-commit branch … is deleted on origin` passes.
- AC 2: `pruneRemote: same squash shape but no merged PR -> skip not-proven-merged` passes and asserts the exact reason string.
- AC 3: every pre-existing test in both files passes without modification other than the three literal `not-cherry-equivalent` → `not-proven-merged` renames.
- AC 4: `archiveBranches: squash-merged branch … reason squash-merged` and prune-remote's AC 1 test drive the same fixture shape through the same `isSquashMerged` import (`grep -n "require('./squash-provenance')" plugin/bin/lib/reconcile/*.js` → exactly two hits, prune-remote.js and archive-branches.js).
- AC 5: both rewritten-tip tests pass (skip, never delete).
- AC 6: `grep -rn 'not-cherry-equivalent' plugin tests docs` → zero lines.
