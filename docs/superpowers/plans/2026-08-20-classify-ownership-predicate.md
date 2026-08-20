# classifyOwnership Predicate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one exported predicate, `classifyOwnership({ sessionId, cwd }, runState) -> 'mine' | 'foreign' | 'indeterminate'`, to `plugin/bin/lib/hooks/context.js`, deciding pipeline-run ownership by composite identity (session id AND worktree binding).

**Architecture:** Pure decision function inside the existing `context.js` module. Session-id comparison keeps today's rule (present-and-different → foreign) but equality is no longer sufficient: the worktree binding co-decides via `worktree-detect.js`'s `repoInfo(cwd)` (git-backed caller-worktree identity; its `indeterminate` flag maps to the predicate's fail-open verdict) and the module's existing `worktreeMatches` helper (realpath-canonicalizing binding comparison). No new files besides the test suite; no existing export changes behavior.

**Tech Stack:** Node 18+ built-ins only (`fs`, `path`), `node --test`, real tmp-dir git fixtures from `tests/helpers/git-fixtures.js` (`gitRepo()`, `linkedWorktreeOf(main)`).

**Spec:** `.claude-tweaks/pipelines/2026-08-20T185022-spec-1098/work/1098-spec.md` (materialized from record #1098)

## Global Constraints

- Never treat `CLAUDE_CODE_SESSION_ID` equality as sufficient ownership evidence — it is shared across all subagents of a session (measured 2026-08-20, #965).
- Fail open: unprovable evidence (deleted binding, git `indeterminate`, caller outside any known checkout, missing cwd) returns `'indeterminate'`, never `'foreign'`.
- `caller.cwd` is always absolute (same convention as `findRunByWorktreePath`'s pre-resolved target).
- "Missing" session id = not a non-empty string (`typeof x !== 'string' || x === ''`) — `context.js`'s existing idiom.
- AC5: every existing `context.js` export behaves identically; **no existing test file is modified**.
- Commit style: `{Verb} {what} — {detail}`, with `refs #1098` and the `Claude-Session:` trailer; one plain command per Bash call (worktree session shape guard — no `&&`, no heredocs).

---

### Task 1: Session-id arms + test scaffold

**Files:**
- Create: `tests/bin-lib/hooks/classify-ownership.test.js`
- Modify: `plugin/bin/lib/hooks/context.js` (add `classifyOwnership` + export)

**Interfaces:**
- Consumes: `gitRepo()`, `linkedWorktreeOf(main)` from `tests/helpers/git-fixtures.js` (relative require from `tests/bin-lib/hooks/` is `../../helpers/git-fixtures`); `repoInfo` (read-only, via `wtDetect` already required in `context.js`).
- Produces: `classifyOwnership(caller, runState)` — `caller = { sessionId, cwd }`, `runState` = a run-state object (only `.sessionId` and `.worktree` read). Returns exactly one of the strings `'mine' | 'foreign' | 'indeterminate'`. Later tasks extend the same function body; the signature is final here.

- [ ] **Step 1: Write the failing tests (session-id arms)**

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { classifyOwnership } = require('../../../plugin/bin/lib/hooks/context');
const { gitRepo, linkedWorktreeOf } = require('../../helpers/git-fixtures');

test('foreign: both session ids present and different, regardless of cwd/binding', () => {
  const main = gitRepo();
  assert.strictEqual(
    classifyOwnership({ sessionId: 'session-a', cwd: main }, { sessionId: 'session-b' }),
    'foreign',
  );
});

test('foreign on distinct ids even when the caller sits inside the recorded worktree', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  assert.strictEqual(
    classifyOwnership({ sessionId: 'session-a', cwd: wt }, { sessionId: 'session-b', worktree: wt }),
    'foreign',
  );
});

test('indeterminate: caller cwd missing or empty', () => {
  assert.strictEqual(classifyOwnership({ sessionId: 's', cwd: '' }, { sessionId: 's' }), 'indeterminate');
  assert.strictEqual(classifyOwnership({ sessionId: 's' }, { sessionId: 's' }), 'indeterminate');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/bin-lib/hooks/classify-ownership.test.js`
Expected: FAIL — `classifyOwnership` is not a function (not yet exported).

- [ ] **Step 3: Write the minimal implementation (session-id arms only)**

In `plugin/bin/lib/hooks/context.js`, insert immediately after `resolveRunDir` (before the `worktreeMatches` comment block):

```js
// Ownership classification (#1098): composite identity — session id AND
// worktree binding. Session-id equality is NOT sufficient evidence of
// ownership: CLAUDE_CODE_SESSION_ID is shared across all subagents of a
// session (measured 2026-08-20, #965), so N parallel siblings are
// indistinguishable by it — only the worktree binding separates them.
// Fail-open: unprovable evidence (deleted binding, indeterminate git answer,
// caller outside any known checkout, missing cwd) degrades to
// 'indeterminate', never 'foreign' — preserving resolveRun's documented
// asymmetry: an unowned run may still be ours; a provably-foreign run never is.
// `caller.cwd` must be absolute (same convention as findRunByWorktreePath's
// pre-resolved target). This predicate only classifies — it enforces
// nothing; consumers (#1012, #1099) own what each verdict does.
function classifyOwnership(caller, runState) {
  const callerId = caller && typeof caller.sessionId === 'string' && caller.sessionId ? caller.sessionId : null;
  const ownerId = runState && typeof runState.sessionId === 'string' && runState.sessionId ? runState.sessionId : null;
  if (callerId && ownerId && callerId !== ownerId) return 'foreign';
  const cwd = caller && typeof caller.cwd === 'string' && caller.cwd ? caller.cwd : null;
  if (!cwd) return 'indeterminate';
  return 'indeterminate'; // binding arms land in Task 2, no-binding arms in Task 3
}
```

Add `classifyOwnership` to `module.exports`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/bin-lib/hooks/classify-ownership.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add tests/bin-lib/hooks/classify-ownership.test.js plugin/bin/lib/hooks/context.js
```
```bash
git commit -m "Add classifyOwnership session-id arms — distinct ids classify foreign, missing cwd fails open (refs #1098)" -m "Claude-Session: https://claude.ai/code/session_01Q51cbREsbnqe6oL5gbzsgN"
```

---

### Task 2: Binding arms (mine / foreign / fail-open via repoInfo)

**Files:**
- Modify: `plugin/bin/lib/hooks/context.js` (extend `classifyOwnership`)
- Modify: `tests/bin-lib/hooks/classify-ownership.test.js` (append tests)

**Interfaces:**
- Consumes: Task 1's `classifyOwnership` skeleton; `wtDetect.repoInfo(cwd)` → `{ repoRoot, isLinkedWorktree, indeterminate }`; module-internal `worktreeMatches(state, target, targetPath)`.
- Produces: the binding-recorded verdict rows of the spec's semantics table.

- [ ] **Step 1: Write the failing tests (binding arms)**

Append:

```js
test('mine: equal ids, caller cwd inside the recorded worktree (subdirectory)', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  const sub = path.join(wt, 'nested');
  fs.mkdirSync(sub, { recursive: true });
  assert.strictEqual(
    classifyOwnership({ sessionId: 's', cwd: sub }, { sessionId: 's', worktree: wt }),
    'mine',
  );
});

test('foreign: equal ids, caller in a DIFFERENT live worktree than the binding — the #965 incident shape', () => {
  const main = gitRepo();
  const wtA = linkedWorktreeOf(main);
  const wtB = linkedWorktreeOf(main);
  assert.strictEqual(
    classifyOwnership({ sessionId: 's', cwd: wtA }, { sessionId: 's', worktree: wtB }),
    'foreign',
  );
});

test('foreign: owner id missing, binding recorded, caller in a different live worktree', () => {
  const main = gitRepo();
  const wtA = linkedWorktreeOf(main);
  const wtB = linkedWorktreeOf(main);
  assert.strictEqual(
    classifyOwnership({ sessionId: 's', cwd: wtA }, { worktree: wtB }),
    'foreign',
  );
});

test('mine: owner id missing, binding recorded, caller cwd inside the binding — binding match outranks incomplete identity', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  assert.strictEqual(
    classifyOwnership({ sessionId: 's', cwd: wt }, { worktree: wt }),
    'mine',
  );
});

test('indeterminate: equal ids, binding recorded, caller in the main checkout', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  assert.strictEqual(
    classifyOwnership({ sessionId: 's', cwd: main }, { sessionId: 's', worktree: wt }),
    'indeterminate',
  );
});

test('indeterminate: recorded worktree deleted from disk — fail-open, never foreign', () => {
  const main = gitRepo();
  const wtA = linkedWorktreeOf(main);
  const wtGone = linkedWorktreeOf(main);
  fs.rmSync(wtGone, { recursive: true, force: true });
  assert.strictEqual(
    classifyOwnership({ sessionId: 's', cwd: wtA }, { sessionId: 's', worktree: wtGone }),
    'indeterminate',
  );
});

test('indeterminate: caller cwd in a non-git directory, binding recorded', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  const nonGit = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-clown-nongit-'));
  assert.strictEqual(
    classifyOwnership({ sessionId: 's', cwd: nonGit }, { sessionId: 's', worktree: wt }),
    'indeterminate',
  );
});

test('mine: caller cwd given as a symlink to the recorded worktree', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  const link = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ct-clown-link-')), 'wt-link');
  fs.symlinkSync(wt, link);
  assert.strictEqual(
    classifyOwnership({ sessionId: 's', cwd: link }, { sessionId: 's', worktree: wt }),
    'mine',
  );
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `node --test tests/bin-lib/hooks/classify-ownership.test.js`
Expected: FAIL — the new binding-arm tests get `'indeterminate'` where `'mine'`/`'foreign'` is expected (Task 1's stub returns `'indeterminate'` for every binding case); Task 1's tests still pass.

- [ ] **Step 3: Implement the binding arms**

Replace the final `return 'indeterminate';` line of `classifyOwnership` with:

```js
  const binding = runState && typeof runState.worktree === 'string' && runState.worktree ? runState.worktree : null;
  const info = wtDetect.repoInfo(cwd);
  if (info.indeterminate) return 'indeterminate';
  if (binding) {
    // repoInfo already realpaths its answer; worktreeMatches realpaths the
    // recorded side — a caller anywhere inside the recorded worktree
    // resolves to that worktree's root and matches here.
    if (info.repoRoot && worktreeMatches({ worktree: binding }, info.repoRoot, info.repoRoot)) return 'mine';
    if (!info.repoRoot || !info.isLinkedWorktree) return 'indeterminate'; // outside any repo, or main checkout — cannot prove foreign
    try { fs.realpathSync(binding); } catch { return 'indeterminate'; } // binding gone from disk — fail open
    return 'foreign'; // caller is in a different live worktree than a binding that provably exists
  }
  return 'indeterminate'; // no-binding arms land in Task 3
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/bin-lib/hooks/classify-ownership.test.js`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add tests/bin-lib/hooks/classify-ownership.test.js plugin/bin/lib/hooks/context.js
```
```bash
git commit -m "Add classifyOwnership binding arms — sibling worktrees classify foreign, unprovable evidence fails open (refs #1098)" -m "Claude-Session: https://claude.ai/code/session_01Q51cbREsbnqe6oL5gbzsgN"
```

---

### Task 3: No-binding arms + verdict-vocabulary pin

**Files:**
- Modify: `plugin/bin/lib/hooks/context.js` (final `classifyOwnership` body)
- Modify: `tests/bin-lib/hooks/classify-ownership.test.js` (append tests)

**Interfaces:**
- Consumes: Task 2's implementation.
- Produces: the complete semantics table; the exported function is final and consumable by #1012/#1099.

- [ ] **Step 1: Write the failing tests (no-binding arms + vocabulary)**

Append:

```js
test('mine: both ids present and equal, no binding, caller in the main checkout', () => {
  const main = gitRepo();
  assert.strictEqual(
    classifyOwnership({ sessionId: 's', cwd: main }, { sessionId: 's' }),
    'mine',
  );
});

test('indeterminate: equal ids, no binding, caller inside a linked worktree', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  assert.strictEqual(
    classifyOwnership({ sessionId: 's', cwd: wt }, { sessionId: 's' }),
    'indeterminate',
  );
});

test('indeterminate: either id missing, no binding', () => {
  const main = gitRepo();
  assert.strictEqual(classifyOwnership({ sessionId: 's', cwd: main }, {}), 'indeterminate');
  assert.strictEqual(classifyOwnership({ cwd: main }, { sessionId: 's' }), 'indeterminate');
  assert.strictEqual(classifyOwnership({ sessionId: '', cwd: main }, { sessionId: 's' }), 'indeterminate');
});

test('verdict vocabulary: every return value is one of mine/foreign/indeterminate', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  const verdicts = new Set([
    classifyOwnership({ sessionId: 'a', cwd: main }, { sessionId: 'b' }),
    classifyOwnership({ sessionId: 's', cwd: wt }, { sessionId: 's', worktree: wt }),
    classifyOwnership({ sessionId: 's', cwd: main }, { sessionId: 's', worktree: wt }),
  ]);
  for (const v of verdicts) assert.ok(['mine', 'foreign', 'indeterminate'].includes(v), `unexpected verdict ${v}`);
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `node --test tests/bin-lib/hooks/classify-ownership.test.js`
Expected: FAIL — the no-binding `mine` test gets `'indeterminate'` from Task 2's stub tail; the others pass.

- [ ] **Step 3: Implement the no-binding arms**

Replace the final `return 'indeterminate';` line with:

```js
  if (!callerId || !ownerId) return 'indeterminate'; // no binding and incomplete identity
  // ids are both present and equal (different already returned foreign above)
  if (info.isLinkedWorktree) return 'indeterminate'; // equal ids from inside a worktree prove nothing about an unbound run
  if (info.repoRoot) return 'mine'; // main checkout + equal ids + no binding
  return 'indeterminate'; // outside any repo
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/bin-lib/hooks/classify-ownership.test.js`
Expected: PASS (15 tests).

- [ ] **Step 5: Commit**

```bash
git add tests/bin-lib/hooks/classify-ownership.test.js plugin/bin/lib/hooks/context.js
```
```bash
git commit -m "Complete classifyOwnership no-binding arms — main-checkout equal-id ownership, worktree callers stay indeterminate (refs #1098)" -m "Claude-Session: https://claude.ai/code/session_01Q51cbREsbnqe6oL5gbzsgN"
```

---

### Task 4: Discrimination check + AC5 full-suite proof

**Files:**
- Modify: none permanently (temporary revert during the discrimination check)
- Test: full suite

**Interfaces:**
- Consumes: Tasks 1-3 complete.
- Produces: evidence for AC5 (existing exports untouched, no existing test modified) and AC6 (test discrimination).

- [ ] **Step 1: Verify the new suite discriminates (revert-and-rerun)**

Never use `git stash` here — the stash stack is shared across all worktrees and sessions. Expose the pre-implementation file via checkout instead (`HEAD~3` is the commit before Task 1 landed; all three task commits touch `context.js`):

```bash
git checkout HEAD~3 -- plugin/bin/lib/hooks/context.js
```
Run: `node --test tests/bin-lib/hooks/classify-ownership.test.js`
Expected: FAIL (function missing — the suite goes red without the implementation).

```bash
git checkout HEAD -- plugin/bin/lib/hooks/context.js
```
Run: `node --test tests/bin-lib/hooks/classify-ownership.test.js`
Expected: PASS again, and `git status --porcelain` is empty (the restore is exact — run it in the same breath as the first checkout, never leaving the reverted file in the tree across any other action).

- [ ] **Step 2: Confirm no existing test file was modified**

Run: `git diff --name-only $(git merge-base HEAD origin/main) -- tests/ | grep -v classify-ownership`
Expected: empty output (the only test change on this branch is the new file).

- [ ] **Step 3: Full suite**

Run: `npm test` (redirect to a file and read the tail if output is long)
Expected: 0 failures, 0 skipped. A count that varies run-to-run on identical code tracks machine load — re-run only affected files in isolation before concluding breakage.

- [ ] **Step 4: Commit (only if anything changed)**

Nothing should be left to commit; `git status --porcelain` empty is the expected outcome.
