# Wrap-Up Report Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure `/claude-tweaks:wrap-up`'s final report into State / Actions Performed / Decisions / Evidence, backed by a deterministic git helper so the State block and history operations are read rather than recalled.

**Architecture:** A new `bin/lib/wrap-up/` module reads git state and classifies `git reflog` output into report-worthy history operations; `bin/wrap-up-state.js` exposes it as a CLI. `skills/wrap-up/summary-template.md` is restructured into one mode-parameterized four-part shape, with conversation mode as that shape minus record-keyed sections. No new hook, no new storage.

**Tech Stack:** Node 18+, `node --test` (built-in, zero dependencies), git CLI, markdown skill files.

**Spec:** `docs/superpowers/specs/2026-08-07-wrap-up-report-restructure-design.md`

## Global Constraints

- **Zero dependencies.** `package.json` has empty `dependencies` and `devDependencies`. Use only Node built-ins (`node:test`, `node:assert`, `node:child_process`, `node:path`, `node:fs`).
- **`skills/wrap-up/SKILL.md` is 40,762 bytes against a 40,960-byte soft ceiling.** Task 5 must not grow it. Verify size after editing.
- **`package.json`'s test script enumerates globs explicitly.** A new `bin/lib/*/tests/` directory does not run until its glob is added (`[IL-84]`). Task 1 adds it.
- **Reflog tests use frozen fixtures, never a live `git reflog` call** (`[IL-62]`, `[IL-80]`).
- **Module layout:** `bin/lib/{name}/` as a flat sibling directory. Do NOT create a nested `_shared/` wrapper — that convention belongs to `skills/_shared/` only.
- **Commit style:** `{Verb} {what} — {detail}`, imperative, no conventional-commit prefixes. Use `refs #N` never `closes #N` in task commits.
- **Before every commit,** run `git diff --cached --name-only` and confirm it lists only this task's files (`[IL-42]` — `git commit` with no pathspec takes the entire staged index).
- **Working directory:** all work happens in the worktree. Before the first commit of each task run `pwd` and `git rev-parse --show-toplevel` and confirm both end in `.claude/worktrees/wrap-up-report-restructure`.

---

### Task 1: Reflog classifier

**Files:**
- Create: `bin/lib/wrap-up/reflog.js`
- Create: `bin/lib/wrap-up/tests/fixtures.js`
- Create: `bin/lib/wrap-up/tests/reflog.test.js`
- Modify: `package.json` (test script glob)

**Interfaces:**
- Consumes: nothing (first task)
- Produces: `parseLine(line) -> {sha, ref, date, message} | null`, `classify(message) -> string | null`, `historyOps(reflogText) -> Array<{op, sha, date, message}>`

- [ ] **Step 1: Write the frozen fixtures**

Create `bin/lib/wrap-up/tests/fixtures.js`. These lines are real `git reflog --date=iso` output shapes, frozen so the tests never read live history (`[IL-80]`).

```js
'use strict';

// Frozen `git reflog --date=iso` output. Deliberately covers: a fast-forward
// merge (routine) vs. a real merge commit (report-worthy); a multi-entry rebase
// that must collapse to ONE row via its (finish) entry; reset, cherry-pick,
// revert, amend; checkout/pull/commit as routine; and remote-tracking entries
// where `update by push` is report-worthy but `fetch` is not.
const HEAD_REFLOG = [
  'e4405303 HEAD@{2026-08-07 15:46:42 +0200}: merge origin/main: Fast-forward',
  'd4e5f6a1 HEAD@{2026-08-07 15:40:11 +0200}: rebase (finish): returning to refs/heads/feature-x',
  'c3d4e5f6 HEAD@{2026-08-07 15:40:10 +0200}: rebase (pick): Add the third thing',
  'b2c3d4e5 HEAD@{2026-08-07 15:40:09 +0200}: rebase (pick): Add the second thing',
  'a1b2c3d4 HEAD@{2026-08-07 15:40:08 +0200}: rebase (start): checkout origin/dev',
  '90a1b2c3 HEAD@{2026-08-07 14:02:00 +0200}: reset: moving to HEAD~1',
  '8f90a1b2 HEAD@{2026-08-07 13:31:00 +0200}: cherry-pick: Bring over the fix',
  '7e8f90a1 HEAD@{2026-08-07 13:02:00 +0200}: revert: Revert "Add the bad thing"',
  '6d7e8f90 HEAD@{2026-08-07 12:15:00 +0200}: commit (amend): Fix the message',
  '5c6d7e8f HEAD@{2026-08-07 11:47:00 +0200}: merge feature-y: Merge made by the \'ort\' strategy.',
  '4b5c6d7e HEAD@{2026-08-07 11:02:00 +0200}: checkout: moving from main to feature-x',
  '3a4b5c6d HEAD@{2026-08-07 10:30:00 +0200}: pull: Fast-forward',
  '2938a4b5 HEAD@{2026-08-07 10:01:00 +0200}: commit: Add the first thing',
].join('\n');

const REMOTE_REFLOG = [
  'd429e514 refs/remotes/origin/main@{2026-08-07 18:08:54 +0200}: fetch origin main: fast-forward',
  '7346175d refs/remotes/origin/main@{2026-08-07 17:33:10 +0200}: update by push',
  'a6de5ec5 refs/remotes/origin/main@{2026-08-07 17:16:48 +0200}: fetch origin --quiet: fast-forward',
].join('\n');

// A rebase that replayed 12 commits — asserts collapse yields exactly one row.
const TWELVE_COMMIT_REBASE = [
  'ffff0000 HEAD@{2026-08-07 16:00:12 +0200}: rebase (finish): returning to refs/heads/big',
  ...Array.from({ length: 12 }, (_, i) =>
    `eeee00${String(i).padStart(2, '0')} HEAD@{2026-08-07 16:00:${String(11 - i).padStart(2, '0')} +0200}: rebase (pick): Commit ${i + 1}`),
  'dddd0000 HEAD@{2026-08-07 15:59:59 +0200}: rebase (start): checkout origin/main',
].join('\n');

module.exports = { HEAD_REFLOG, REMOTE_REFLOG, TWELVE_COMMIT_REBASE };
```

- [ ] **Step 2: Write the failing tests**

Create `bin/lib/wrap-up/tests/reflog.test.js`:

```js
// bin/lib/wrap-up/tests/reflog.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { parseLine, classify, historyOps } = require('../reflog');
const { HEAD_REFLOG, REMOTE_REFLOG, TWELVE_COMMIT_REBASE } = require('./fixtures');

test('parseLine splits a --date=iso reflog line into sha, ref, date and message', () => {
  const parsed = parseLine('e4405303 HEAD@{2026-08-07 15:46:42 +0200}: merge origin/main: Fast-forward');
  assert.deepStrictEqual(parsed, {
    sha: 'e4405303',
    ref: 'HEAD',
    date: '2026-08-07 15:46:42 +0200',
    message: 'merge origin/main: Fast-forward',
  });
});

test('parseLine returns null for a line that is not reflog output', () => {
  assert.strictEqual(parseLine('not a reflog line at all'), null);
  assert.strictEqual(parseLine(''), null);
});

test('classify treats a fast-forward merge as routine and a real merge as report-worthy', () => {
  assert.strictEqual(classify('merge origin/main: Fast-forward'), null);
  assert.strictEqual(classify("merge feature-y: Merge made by the 'ort' strategy."), 'merge');
});

test('classify reports rebase only on its (finish) entry, so a rebase collapses to one row', () => {
  assert.strictEqual(classify('rebase (finish): returning to refs/heads/feature-x'), 'rebase');
  assert.strictEqual(classify('rebase (pick): Add the second thing'), null);
  assert.strictEqual(classify('rebase (start): checkout origin/dev'), null);
});

test('classify reports reset unconditionally — --hard and --soft are indistinguishable in reflog', () => {
  assert.strictEqual(classify('reset: moving to HEAD~1'), 'reset');
  assert.strictEqual(classify('reset: moving to origin/main'), 'reset');
});

test('classify reports cherry-pick, revert and amend', () => {
  assert.strictEqual(classify('cherry-pick: Bring over the fix'), 'cherry-pick');
  assert.strictEqual(classify('revert: Revert "Add the bad thing"'), 'revert');
  assert.strictEqual(classify('commit (amend): Fix the message'), 'amend');
});

test('classify treats checkout, pull and plain commit as routine', () => {
  assert.strictEqual(classify('checkout: moving from main to feature-x'), null);
  assert.strictEqual(classify('pull: Fast-forward'), null);
  assert.strictEqual(classify('commit: Add the first thing'), null);
  assert.strictEqual(classify('commit (initial): First'), null);
});

test('classify reports a push but not a fetch on a remote-tracking ref', () => {
  assert.strictEqual(classify('update by push'), 'push');
  assert.strictEqual(classify('fetch origin main: fast-forward'), null);
});

test('historyOps drops every routine entry from a mixed HEAD reflog', () => {
  const ops = historyOps(HEAD_REFLOG).map((o) => o.op);
  assert.deepStrictEqual(ops, ['rebase', 'reset', 'cherry-pick', 'revert', 'amend', 'merge']);
});

test('historyOps carries sha and date through for each reported op', () => {
  const [first] = historyOps(HEAD_REFLOG);
  assert.strictEqual(first.op, 'rebase');
  assert.strictEqual(first.sha, 'd4e5f6a1');
  assert.strictEqual(first.date, '2026-08-07 15:40:11 +0200');
});

test('historyOps collapses a 12-commit rebase to exactly one row', () => {
  const ops = historyOps(TWELVE_COMMIT_REBASE);
  assert.strictEqual(ops.length, 1);
  assert.strictEqual(ops[0].op, 'rebase');
});

test('historyOps reports the push from a remote-tracking reflog', () => {
  const ops = historyOps(REMOTE_REFLOG);
  assert.deepStrictEqual(ops.map((o) => o.op), ['push']);
});

test('historyOps on empty or absent input returns an empty array rather than throwing', () => {
  assert.deepStrictEqual(historyOps(''), []);
  assert.deepStrictEqual(historyOps(null), []);
  assert.deepStrictEqual(historyOps(undefined), []);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test bin/lib/wrap-up/tests/reflog.test.js`
Expected: FAIL — `Cannot find module '../reflog'`

- [ ] **Step 4: Write the implementation**

Create `bin/lib/wrap-up/reflog.js`:

```js
// bin/lib/wrap-up/reflog.js — classify `git reflog --date=iso` output into the
// history operations worth reporting in wrap-up's Actions Performed table.
//
// Why classify rather than dump: a working repository's reflog is dominated by
// routine `merge …: Fast-forward` and `checkout` entries. Reporting all of them
// reburies the one operation that matters (a rebase, a reset) in exactly the
// noise this table exists to cut through.
'use strict';

const LINE = /^([0-9a-fA-F]+) (\S+)@\{([^}]+)\}: (.*)$/;

function parseLine(line) {
  const m = LINE.exec(String(line == null ? '' : line).trim());
  if (!m) return null;
  return { sha: m[1], ref: m[2], date: m[3], message: m[4] };
}

// Returns the op name for a report-worthy message, or null for a routine one.
//
// Order is load-bearing in two places: the rebase branch must run before any
// generic match so intermediate replay entries are dropped, and the merge
// branch must test Fast-forward BEFORE reporting, since a fast-forward merge
// moved no history and is not worth a row.
function classify(message) {
  const msg = String(message == null ? '' : message);
  // A rebase emits one entry per replayed commit; only (finish) marks the whole
  // operation, so keying on it collapses a 12-commit rebase to a single row.
  // Older git wrote "finished" rather than "(finish)" — both accepted.
  if (/^rebase\b/.test(msg)) return /\(finish\)|\bfinished\b/.test(msg) ? 'rebase' : null;
  // Reported unconditionally: reflog writes `reset: moving to <target>` for both
  // --hard and --soft, so the destructive variant cannot be singled out and must
  // not be the silent case.
  if (/^reset:/.test(msg)) return 'reset';
  if (/^cherry-pick\b/.test(msg)) return 'cherry-pick';
  if (/^revert\b/.test(msg)) return 'revert';
  if (/^commit \(amend\)/.test(msg)) return 'amend';
  if (/^merge\b/.test(msg)) return /:\s*Fast-forward$/.test(msg) ? null : 'merge';
  if (/^update by push\b/.test(msg)) return 'push';
  return null;
}

function historyOps(reflogText) {
  const out = [];
  for (const line of String(reflogText == null ? '' : reflogText).split('\n')) {
    const parsed = parseLine(line);
    if (!parsed) continue;
    const op = classify(parsed.message);
    if (!op) continue;
    out.push({ op, sha: parsed.sha, date: parsed.date, message: parsed.message });
  }
  return out;
}

module.exports = { parseLine, classify, historyOps };
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test bin/lib/wrap-up/tests/reflog.test.js`
Expected: PASS, 13 tests

- [ ] **Step 6: Verify the tests actually discriminate**

Temporarily change the merge branch in `reflog.js` to `if (/^merge\b/.test(msg)) return 'merge';` (dropping the Fast-forward check), re-run the suite, and confirm the fast-forward and mixed-reflog tests FAIL. Then revert the change and confirm they pass again. A test that reads correct but cannot fail proves nothing.

- [ ] **Step 7: Add the test glob to package.json**

Without this the new suite never runs under `npm test` — the script enumerates globs and does not discover new directories (`[IL-84]`).

In `package.json`, in the `scripts.test` value, insert `bin/lib/wrap-up/tests/*.test.js` immediately after `bin/lib/init/tests/*.test.js`.

- [ ] **Step 8: Verify the glob works AND the suite is green**

Run: `npm test > /tmp/wrapup-task1.txt 2>&1; echo "exit=$?" >> /tmp/wrapup-task1.txt`
Then: `grep -E "^exit=|^# (pass|fail)" /tmp/wrapup-task1.txt` and `grep -c "reflog" /tmp/wrapup-task1.txt`

Expected: `exit=0`, `# fail 0`, and a non-zero reflog count. All three matter and none substitutes for another — the reflog count proves the enumerated glob picked the new suite up, while `exit=0` / `# fail 0` prove Step 6's deliberate break was actually reverted. A count alone cannot tell a passing test from a failing one, since both print the test name.

Note: `install-statusline-wrapper.test.js` is load-sensitive and can time out at 5 s under a loaded machine, reporting `status=null`. If that is the ONLY failure, re-run it alone (`node --test tests/install-statusline-wrapper.test.js`) to confirm it passes in isolation before treating the suite as red.

- [ ] **Step 9: Commit**

```bash
git add bin/lib/wrap-up/reflog.js bin/lib/wrap-up/tests/fixtures.js bin/lib/wrap-up/tests/reflog.test.js package.json
git diff --cached --name-only
git commit -m "Add the wrap-up reflog classifier — report-worthy history ops, rebase collapsed to one row"
```

---

### Task 2: Git state reader

**Files:**
- Create: `bin/lib/wrap-up/state.js`
- Create: `bin/lib/wrap-up/tests/state.test.js`

**Interfaces:**
- Consumes: nothing from Task 1
- Produces: `readState({cwd, since, run}) -> {branch, detachedAt, upstream, ahead, behind, pushed, commitsInScope, linkedWorktree, isRepo}`. The `run` option is an injectable `(args: string[]) => string | null` git runner — tests pass a stub, production omits it.

- [ ] **Step 1: Write the failing tests**

Create `bin/lib/wrap-up/tests/state.test.js`. The stub runner is what keeps this test off live git state (`[IL-62]`).

```js
// bin/lib/wrap-up/tests/state.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { readState } = require('../state');

// Build a stub git runner from a map of joined-args -> output. Returning null
// models a failing git invocation, which is how the real runner reports one.
function stubRunner(responses) {
  return (args) => (Object.prototype.hasOwnProperty.call(responses, args.join(' ')) ? responses[args.join(' ')] : null);
}

const ON_BRANCH_UNPUSHED = {
  'rev-parse --is-inside-work-tree': 'true',
  'branch --show-current': 'main',
  'rev-parse --abbrev-ref --symbolic-full-name @{u}': 'origin/dev',
  'rev-list --left-right --count @{u}...HEAD': '0\t1',
  'rev-list --count a1b2c3d..HEAD': '1',
  'rev-parse --git-dir': '/repo/.git',
  'rev-parse --git-common-dir': '/repo/.git',
};

test('readState reports an unpushed branch, which is the fact the old report got wrong', () => {
  const s = readState({ cwd: '/repo', since: 'a1b2c3d', run: stubRunner(ON_BRANCH_UNPUSHED) });
  assert.strictEqual(s.branch, 'main');
  assert.strictEqual(s.upstream, 'origin/dev');
  assert.strictEqual(s.ahead, 1);
  assert.strictEqual(s.pushed, false);
  assert.strictEqual(s.commitsInScope, 1);
});

test('readState reports pushed when nothing is ahead of upstream', () => {
  const s = readState({
    cwd: '/repo',
    since: 'a1b2c3d',
    run: stubRunner({ ...ON_BRANCH_UNPUSHED, 'rev-list --left-right --count @{u}...HEAD': '0\t0' }),
  });
  assert.strictEqual(s.pushed, true);
});

test('readState marks a detached HEAD rather than reporting an empty branch name', () => {
  const s = readState({
    cwd: '/repo',
    since: 'a1b2c3d',
    run: stubRunner({ ...ON_BRANCH_UNPUSHED, 'branch --show-current': '', 'rev-parse --short HEAD': 'deadbee' }),
  });
  assert.strictEqual(s.branch, null);
  assert.strictEqual(s.detachedAt, 'deadbee');
});

test('readState reports no upstream as unpushed rather than as unknown', () => {
  const responses = { ...ON_BRANCH_UNPUSHED };
  delete responses['rev-parse --abbrev-ref --symbolic-full-name @{u}'];
  delete responses['rev-list --left-right --count @{u}...HEAD'];
  const s = readState({ cwd: '/repo', since: 'a1b2c3d', run: stubRunner(responses) });
  assert.strictEqual(s.upstream, null);
  assert.strictEqual(s.pushed, false);
  assert.strictEqual(s.ahead, null);
});

test('readState detects a linked worktree by git-dir differing from git-common-dir', () => {
  const s = readState({
    cwd: '/repo/.claude/worktrees/x',
    since: 'a1b2c3d',
    run: stubRunner({
      ...ON_BRANCH_UNPUSHED,
      'rev-parse --git-dir': '/repo/.git/worktrees/x',
      'rev-parse --git-common-dir': '/repo/.git',
    }),
  });
  assert.strictEqual(s.linkedWorktree, true);
});

test('readState outside a repository sets isRepo false and leaves fields null, never omitted', () => {
  const s = readState({ cwd: '/tmp', since: 'a1b2c3d', run: stubRunner({}) });
  assert.strictEqual(s.isRepo, false);
  assert.strictEqual(s.branch, null);
  assert.strictEqual(s.upstream, null);
  assert.strictEqual(s.commitsInScope, null);
  assert.ok('pushed' in s, 'pushed must be present even when unknown');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test bin/lib/wrap-up/tests/state.test.js`
Expected: FAIL — `Cannot find module '../state'`

- [ ] **Step 3: Write the implementation**

Create `bin/lib/wrap-up/state.js`:

```js
// bin/lib/wrap-up/state.js — read the repository facts the wrap-up State block
// asserts, so they are measured rather than recalled.
//
// Every field is present on the returned object even when unknown (null). A
// field that disappears when it cannot be determined reads as an absent fact
// rather than an unknown one — which is how a report once claimed work had
// landed when it had only been committed locally.
'use strict';

const { execFileSync } = require('node:child_process');

function defaultRunner(cwd) {
  return (args) => {
    try {
      return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      return null;
    }
  };
}

function toInt(value) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

function readState({ cwd, since, run } = {}) {
  const git = run || defaultRunner(cwd);
  const base = {
    isRepo: false, branch: null, detachedAt: null, upstream: null,
    ahead: null, behind: null, pushed: false, commitsInScope: null, linkedWorktree: false,
  };
  if (git(['rev-parse', '--is-inside-work-tree']) !== 'true') return base;

  const branchRaw = git(['branch', '--show-current']);
  const branch = branchRaw ? branchRaw : null;
  const detachedAt = branch ? null : git(['rev-parse', '--short', 'HEAD']);

  const upstream = git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
  let ahead = null;
  let behind = null;
  if (upstream) {
    // `--left-right --count @{u}...HEAD`: left is upstream-only (behind),
    // right is local-only (ahead).
    const counts = git(['rev-list', '--left-right', '--count', '@{u}...HEAD']);
    if (counts) {
      const [b, a] = counts.split(/\s+/);
      behind = toInt(b);
      ahead = toInt(a);
    }
  }

  const commitsInScope = since ? toInt(git(['rev-list', '--count', `${since}..HEAD`])) : null;
  const gitDir = git(['rev-parse', '--git-dir']);
  const commonDir = git(['rev-parse', '--git-common-dir']);

  return {
    isRepo: true,
    branch,
    detachedAt: detachedAt || null,
    upstream: upstream || null,
    ahead,
    behind,
    // Pushed requires a known upstream AND nothing ahead of it. Absent an
    // upstream there is nowhere for the work to have gone, so it is unpushed —
    // not unknown.
    pushed: Boolean(upstream) && ahead === 0,
    commitsInScope,
    linkedWorktree: Boolean(gitDir && commonDir && gitDir !== commonDir),
  };
}

module.exports = { readState };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test bin/lib/wrap-up/tests/state.test.js`
Expected: PASS, 6 tests

- [ ] **Step 5: Verify the tests actually discriminate**

Temporarily change `pushed:` to `Boolean(upstream)`, re-run, and confirm the unpushed test FAILS. Revert and confirm it passes.

- [ ] **Step 6: Commit**

```bash
git add bin/lib/wrap-up/state.js bin/lib/wrap-up/tests/state.test.js
git diff --cached --name-only
git commit -m "Add the wrap-up git state reader — unknown fields render null rather than vanishing"
```

---

### Task 3: State block renderer

**Files:**
- Create: `bin/lib/wrap-up/render.js`
- Create: `bin/lib/wrap-up/tests/render.test.js`

**Interfaces:**
- Consumes: `readState`'s return shape (Task 2), `historyOps`' return shape (Task 1)
- Produces: `renderState({state, ops, since, sinceDate}) -> string`

- [ ] **Step 1: Write the failing tests**

Create `bin/lib/wrap-up/tests/render.test.js`:

```js
// bin/lib/wrap-up/tests/render.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { renderState } = require('../render');

const PUSHED = {
  isRepo: true, branch: 'feature-x', detachedAt: null, upstream: 'origin/main',
  ahead: 0, behind: 0, pushed: true, commitsInScope: 3, linkedWorktree: true,
};
const UNPUSHED = { ...PUSHED, ahead: 1, pushed: false, commitsInScope: 1, branch: 'main', upstream: 'origin/dev' };

test('renderState marks unpushed work in caps so it cannot be skimmed past', () => {
  const out = renderState({ state: UNPUSHED, ops: [], since: 'a1b2c3d', sinceDate: '2026-08-07 09:14' });
  assert.match(out, /UNPUSHED/);
  assert.match(out, /Branch\s+main — 1 commit, UNPUSHED \(origin\/dev\)/);
});

test('renderState names the remote when work is pushed', () => {
  const out = renderState({ state: PUSHED, ops: [], since: 'a1b2c3d', sinceDate: '2026-08-07 09:14' });
  assert.match(out, /Branch\s+feature-x — 3 commits, pushed to origin\/main/);
  assert.doesNotMatch(out, /UNPUSHED/);
});

test('renderState prints the scope boundary so a wrong base is visible rather than silent', () => {
  const out = renderState({ state: UNPUSHED, since: 'a1b2c3d', sinceDate: '2026-08-07 09:14', ops: [] });
  assert.match(out, /Scope\s+since a1b2c3d \(2026-08-07 09:14\)/);
});

test('renderState renders unknown for a non-repository rather than omitting the line', () => {
  const out = renderState({
    state: { isRepo: false, branch: null, detachedAt: null, upstream: null, ahead: null, behind: null, pushed: false, commitsInScope: null, linkedWorktree: false },
    ops: [], since: 'a1b2c3d', sinceDate: '2026-08-07 09:14',
  });
  assert.match(out, /Branch\s+unknown/);
});

test('renderState reports a detached HEAD by sha', () => {
  const out = renderState({
    state: { ...UNPUSHED, branch: null, detachedAt: 'deadbee' },
    ops: [], since: 'a1b2c3d', sinceDate: '2026-08-07 09:14',
  });
  assert.match(out, /Branch\s+detached at deadbee/);
});

test('renderState distinguishes a linked worktree from the main checkout', () => {
  const linked = renderState({ state: PUSHED, ops: [], since: 'a', sinceDate: 'd' });
  const main = renderState({ state: { ...PUSHED, linkedWorktree: false }, ops: [], since: 'a', sinceDate: 'd' });
  assert.match(linked, /Worktree\s+linked worktree/);
  assert.match(main, /Worktree\s+main checkout/);
});

test('renderState lists history ops one per line and omits the section when there are none', () => {
  const withOps = renderState({
    state: UNPUSHED, since: 'a', sinceDate: 'd',
    ops: [{ op: 'rebase', sha: 'd4e5f6a', date: '2026-08-07 15:40:11 +0200', message: 'rebase (finish): returning to refs/heads/main' }],
  });
  assert.match(withOps, /History ops in window \(1\)/);
  assert.match(withOps, /rebase\s+d4e5f6a/);

  const withoutOps = renderState({ state: UNPUSHED, ops: [], since: 'a', sinceDate: 'd' });
  assert.doesNotMatch(withoutOps, /History ops in window/);
});

test('renderState singularises one commit and pluralises the rest', () => {
  const one = renderState({ state: { ...UNPUSHED, commitsInScope: 1 }, ops: [], since: 'a', sinceDate: 'd' });
  const two = renderState({ state: { ...UNPUSHED, commitsInScope: 2 }, ops: [], since: 'a', sinceDate: 'd' });
  assert.match(one, /1 commit,/);
  assert.match(two, /2 commits,/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test bin/lib/wrap-up/tests/render.test.js`
Expected: FAIL — `Cannot find module '../render'`

- [ ] **Step 3: Write the implementation**

Create `bin/lib/wrap-up/render.js`:

```js
// bin/lib/wrap-up/render.js — render the wrap-up State block.
//
// Every line is emitted even when its value is unknown. Omitting a line makes an
// unknown fact indistinguishable from an absent one, which is the failure this
// block exists to prevent.
'use strict';

const UNKNOWN = 'unknown';
const PAD = 10;

function field(label, value) {
  return `${label.padEnd(PAD)}${value}`;
}

function branchValue(s) {
  if (!s || !s.isRepo) return UNKNOWN;
  if (!s.branch && s.detachedAt) return `detached at ${s.detachedAt}`;
  if (!s.branch) return UNKNOWN;
  const n = s.commitsInScope;
  const commits = n === null || n === undefined ? `${UNKNOWN} commits` : `${n} commit${n === 1 ? '' : 's'}`;
  if (!s.upstream) return `${s.branch} — ${commits}, UNPUSHED (no upstream)`;
  return s.pushed
    ? `${s.branch} — ${commits}, pushed to ${s.upstream}`
    : `${s.branch} — ${commits}, UNPUSHED (${s.upstream})`;
}

function renderState({ state, ops, since, sinceDate } = {}) {
  const lines = [
    field('Branch', branchValue(state)),
    field('Worktree', state && state.isRepo ? (state.linkedWorktree ? 'linked worktree' : 'main checkout') : UNKNOWN),
    field('Scope', since ? `since ${since} (${sinceDate || UNKNOWN})` : UNKNOWN),
  ];
  const list = Array.isArray(ops) ? ops : [];
  if (list.length) {
    lines.push('');
    lines.push(`History ops in window (${list.length})`);
    for (const o of list) lines.push(`  ${String(o.op).padEnd(12)}${o.sha}  ${o.date}`);
  }
  return lines.join('\n');
}

module.exports = { renderState };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test bin/lib/wrap-up/tests/render.test.js`
Expected: PASS, 8 tests

- [ ] **Step 5: Commit**

```bash
git add bin/lib/wrap-up/render.js bin/lib/wrap-up/tests/render.test.js
git diff --cached --name-only
git commit -m "Add the wrap-up State block renderer — unknown printed, never omitted"
```

---

### Task 4: CLI entry point

**Files:**
- Create: `bin/wrap-up-state.js`
- Modify: `docs/plugin-structure.md`

**Interfaces:**
- Consumes: `readState` (Task 2), `historyOps` (Task 1), `renderState` (Task 3)
- Produces: the CLI contract `node bin/wrap-up-state.js --since <base-sha|iso> [--json]`, cited by the skill template in Task 5

- [ ] **Step 1: Write the CLI**

Create `bin/wrap-up-state.js`:

```js
#!/usr/bin/env node
// bin/wrap-up-state.js — emit the wrap-up State block and the history operations
// in scope, read from git rather than recalled.
//
// Exit codes: 0 for any successful render INCLUDING a degraded one (fields render
// `unknown`); 2 only for a malformed invocation. A degraded read must never cost
// the caller the whole report.
'use strict';

const { execFileSync } = require('node:child_process');
const { readState } = require('./lib/wrap-up/state');
const { historyOps } = require('./lib/wrap-up/reflog');
const { renderState } = require('./lib/wrap-up/render');

function parseArgs(argv) {
  const out = { since: null, json: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--since' && i + 1 < argv.length) { out.since = argv[i + 1]; i += 1; continue; }
    if (argv[i] === '--json') { out.json = true; continue; }
  }
  return out;
}

function git(args, cwd) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

function main() {
  const { since, json } = parseArgs(process.argv.slice(2));
  if (!since) {
    process.stderr.write('usage: wrap-up-state.js --since <base-sha|iso-datetime> [--json]\n');
    process.exit(2);
  }
  const cwd = process.cwd();

  // Resolve the boundary to a datetime for --since, and echo the base back so a
  // wrong base is visible in the rendered block rather than silently narrowing
  // the window. A bare date would land on 1970-01-01 for a zero timestamp and
  // return nothing in positive-UTC-offset zones, so always pass a full ISO
  // 8601 datetime to git.
  const sinceDate = git(['show', '-s', '--format=%cI', since], cwd) || since;

  const state = readState({ cwd, since });
  const head = git(['reflog', '--date=iso', `--since=${sinceDate}`], cwd) || '';
  const upstreamRef = state.upstream;
  const remote = upstreamRef
    ? git(['reflog', 'show', upstreamRef, '--date=iso', `--since=${sinceDate}`], cwd) || ''
    : '';
  const ops = [...historyOps(head), ...historyOps(remote)];

  if (json) {
    process.stdout.write(`${JSON.stringify({ state, ops, since, sinceDate }, null, 2)}\n`);
  } else {
    process.stdout.write(`${renderState({ state, ops, since, sinceDate })}\n`);
  }
}

main();
```

- [ ] **Step 2: Verify the CLI rejects a missing --since**

Run: `node bin/wrap-up-state.js; echo "exit=$?"`
Expected: usage message on stderr, `exit=2`

- [ ] **Step 3: Verify the CLI renders against this repository**

Run: `node bin/wrap-up-state.js --since HEAD~5`
Expected: a State block naming the current branch, `linked worktree`, and the scope boundary. This is a smoke check of real output, not an assertion — the unit suites own correctness.

- [ ] **Step 4: Verify the JSON form parses**

Run: `node bin/wrap-up-state.js --since HEAD~5 --json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const o=JSON.parse(s);console.log('ok', typeof o.state.pushed, Array.isArray(o.ops))})"`
Expected: `ok boolean true`

- [ ] **Step 5: Document the module**

In `docs/plugin-structure.md`, add `bin/wrap-up-state.js` to the `bin/*.js` CLI listing and `bin/lib/wrap-up/` to the module listing, matching the surrounding entries' format. Include the per-suite invocation `node --test bin/lib/wrap-up/tests/*.test.js` alongside the other per-suite commands.

- [ ] **Step 6: Commit**

```bash
git add bin/wrap-up-state.js docs/plugin-structure.md
git diff --cached --name-only
git commit -m "Add the wrap-up-state CLI — State block and in-scope history ops from git"
```

---

### Task 5: Restructure the report template

**Files:**
- Modify: `skills/wrap-up/summary-template.md`
- Modify: `skills/wrap-up/SKILL.md:348-350` (Step 9 pointer)
- Modify: `CLAUDE.md` (Actions Performed action-type list)

**Interfaces:**
- Consumes: the CLI contract from Task 4
- Produces: nothing downstream

- [ ] **Step 1: Record the SKILL.md size budget before editing**

Run: `wc -c skills/wrap-up/SKILL.md`
Expected: 40762. The file must not exceed 40960 after Step 5. Note the starting number.

- [ ] **Step 2: Replace the render template in summary-template.md**

In `skills/wrap-up/summary-template.md`, replace the fenced template block currently spanning lines 9-57 with the four-part shape below. Nothing is deleted — each existing section is re-homed into one of the four parts, as the mapping comment records.

````markdown
```
## Wrap-Up: {Record #{n} — {title}   |   {topic}}
{Origin: {origin} — record mode only; the materialized header's origin field:
by:code-health / by:harness-health / by:journey-health / by:docs-health /
by:capture / by:dispatch, or "human" when absent. Omit entirely in
conversation mode and for legacy spec-file-mode runs.}

### State

Render VERBATIM from the helper — do not compose these facts from memory:

    node "${CLAUDE_PLUGIN_ROOT}/bin/wrap-up-state.js" --since {base}

{base} is this run's scope base — the same boundary Step 3 passed to
/claude-tweaks:reflect as "files changed during this work". The helper echoes it
back, so a wrong base is visible in the output rather than silently narrowing
the window.

Then append, in record mode only:

Record    #{n} — {closes via merge | closed | open}
Ledger    {n} items, {n} open   |   none

### Actions Performed

| Action | Detail | Ref |
|--------|--------|-----|
| History | {op} {target} — {one line} | `{hash}` |
| Implemented | {what was built} | `{hash}` |
| Operational | Closed record #{n} via merge (`Fixes #{n}`) | `{hash}` |
| Operational | Deleted plans `docs/plans/{files}` | — |
| Operational | Removed worktree `{path}`, deleted branch `{branch}` | — |
| Ledger fix | {item} ({phase}) — {resolution} | `{hash}` |

Generate from: the helper's History ops (every row it reports gets a `History`
row — that is the whole point of reading them), cleanup actions in Step 10,
config/skill updates applied, ledger items resolved in Step 8.5, and the run
dir's `events.jsonl` when present.

Omit the table entirely when no autonomous action was performed. Never fold a
history operation into `Operational` — that type means cleanup, and burying a
rebase there is the failure this row type exists to prevent.

### Decisions

**Needs your call ({n})** — items whose answer changes what happens:

| # | Destination | What |
|---|-------------|------|
| 1 | {destination} | {one line} |

Destinations are NAMED, never coded. `_shared/learning-routing.md`'s D1-D5 are
internal classifier vocabulary and must not reach the reader:

| Internal | Rendered |
|---|---|
| D1 | `CLAUDE.md Don'ts`, or the specific `.claude/rules/` file |
| D2 | the actual path — `docs/x.md`, `skills/y/SKILL.md` |
| D3 | `Backlog record` |
| D4 | `Memory` |
| D5 | `Upstream issue` |

**Will do ({n})** — cleanup already settled, listed so it is disclosed rather
than decided: {one line each}.

Render cleanup rows from `cleanup-procedures.md`'s canonical list, filtered by
Condition. Under `MULTISPEC_REVIEW_DEFER=1`, items marked deferred there are
skipped here too.

### Manual Steps Required
| # | What | Where | Status |
|---|------|-------|--------|
| 1 | {description} | {source} | Filed as #{n} |
(or omit the section entirely — nothing to do outside the codebase.)

> Complete these after merging. Each row is a real, trackable record
> (`ledger/resolve-gate.md`'s `Acknowledge` disposition) — not just a note in
> this transcript.

### Evidence

Reflection — {insights, near-misses, tradeoffs accepted}. Do NOT restate an
insight that already became a Decisions row; name the row instead.

Scans — Step 7 {result} · 7.7 {result} · 7.8 {result} · 7.9 {result} ·
7.10 {result}. Full `SCANNED` lines in `decisions.md`.

Skill updates — {N} applied, {M} staged, {K} new-skill candidates
({proposed}/{declined}); {R} skills read, gap detection: {found/not found}.

(Next Actions are rendered as a top-level section after Step 10 — see
`## Next Actions` in SKILL.md. Do NOT render them here.)
```
````

- [ ] **Step 3: Add the conversation-mode variant**

Immediately after the block from Step 2, add:

```markdown
**Conversation mode.** When no materialized header exists for this run
(`SKILL.md`'s Conversation-based row), render the SAME four-part shape with the
record-keyed pieces dropped: the `## Wrap-Up:` heading takes the work's topic
instead of `Record #{n} — {title}`; the `Origin:` line, the `Record` and
`Ledger` State lines, and any `Operational` row about closing a record or
deleting plans are all omitted. Everything else — State, Actions Performed,
Decisions, Evidence — renders identically.

This variant is not optional. Its absence is what caused a conversation-based
run to compose its report from the steps it had just executed, surfacing
internal step numbers and route codes and reporting a rebase inside a table
cell's rationale column.
```

- [ ] **Step 4: Update the Step 9 pointer in SKILL.md**

In `skills/wrap-up/SKILL.md`, replace the sentence at line 348 beginning "Render one consolidated summary of this run" with a same-or-shorter version naming the four parts. The file has roughly 200 bytes of headroom, so this must not add length:

```markdown
Render one consolidated summary of this run — State (from `bin/wrap-up-state.js`), Actions Performed, Decisions, Evidence — then, **only when Step 8.6's Review Console did not run** (interactive mode, standalone wrap-up, or the empty-console fast path — and never under `MULTISPEC_REVIEW_DEFER=1`), present the cleanup + configuration batch decision, followed by the per-item Queue writes / Memory updates / Upstream feedback sections for any proposal staged during this run. Close with the archival line.
```

- [ ] **Step 5: Verify the size budget held**

Run: `wc -c skills/wrap-up/SKILL.md`
Expected: at most 40960, and ideally at or below the 40762 recorded in Step 1. If it grew past the ceiling, move the added words into `summary-template.md` instead.

- [ ] **Step 6: Add the History action type to CLAUDE.md**

In `CLAUDE.md`'s Interaction patterns section, in the **Actions Performed table** bullet, extend the action-type list to include `History`. Change:

> Action types: `Implemented`, `Bug fix`, `Simplified`, `Operational`, `Journey`, `Ledger fix`.

to:

> Action types: `Implemented`, `Bug fix`, `Simplified`, `Operational`, `Journey`, `Ledger fix`, `History` (a git operation that rewrote or moved history — rebase, reset, cherry-pick, revert, non-fast-forward merge, amend, push; never folded into `Operational`, which means cleanup).

- [ ] **Step 7: Verify no D-code leaks remain in the rendered template**

Run: `grep -nE '^\| *D[1-5] *\|' skills/wrap-up/summary-template.md`
Expected: matches ONLY inside the Internal-to-Rendered mapping table added in Step 2 — that table legitimately names the codes in order to forbid them. Any other match is a leak. Anchoring to the table-cell position avoids matching prose that merely mentions a code.

- [ ] **Step 8: Verify the four parts are present**

Run: `grep -cE '^### (State|Actions Performed|Decisions|Evidence)$' skills/wrap-up/summary-template.md`
Expected: `4`

- [ ] **Step 9: Run the full suite**

Run: `npm test > /tmp/wrapup-task5.txt 2>&1; echo "exit=$?" >> /tmp/wrapup-task5.txt`
Then: `grep -E "^exit=|^# (pass|fail)" /tmp/wrapup-task5.txt`
Expected: `exit=0`, `# fail 0`. Redirect first — piping a long suite directly can hide the real failure or trigger a silent re-run. The full suite takes roughly 25 minutes; use `node --test bin/lib/wrap-up/tests/*.test.js` for the inner loop and reserve this for the final check.

Note: `install-statusline-wrapper.test.js` is load-sensitive and can time out at 5 s under a loaded machine, reporting `status=null`. If that is the ONLY failure, re-run it alone (`node --test tests/install-statusline-wrapper.test.js`) to confirm it passes in isolation before treating the suite as red.

- [ ] **Step 10: Commit**

```bash
git add skills/wrap-up/summary-template.md skills/wrap-up/SKILL.md CLAUDE.md
git diff --cached --name-only
git commit -m "Restructure the wrap-up report — State/Actions/Decisions/Evidence with a conversation-mode variant"
```

---

## Post-Plan: Release

Not a task — do this only after all five tasks pass review, per CLAUDE.md's rule that the whole-branch review gates the bump.

1. Run the broad cross-task review across the full branch diff **before** bumping. Per-task reviews cannot see a producer and its consumers in different files.
2. Claim the version at ship time: `git fetch origin main`, then check `git log --oneline -5 origin/main -- .claude-plugin/plugin.json`, `git show main:.claude-plugin/plugin.json` (`[IL-98]` — local `main` can carry executed bumps invisible to the origin log), every sibling worktree branch, and `docs/superpowers/plans/` for version literals.
3. Minor bump (feature addition) in `.claude-plugin/plugin.json`, with the `CHANGELOG.md` entry and the `docs/shipped-versions.tsv` line **in the same commit**.
4. Mirror `plugins[].version` in the marketplace repo. This is authorized as one action with the push here — do not stop to ask between them (`[IL-59]`).

## Self-Review

**Spec coverage.** Every design section maps to a task: the helper's three modules to Tasks 1-3, the CLI to Task 4, the four-part restructure and conversation-mode variant to Task 5 Steps 2-3, the `History` action type to Task 5 Step 6, `docs/plugin-structure.md` to Task 4 Step 5, the `package.json` glob to Task 1 Step 7. The design's Error-handling table maps to Task 2's non-repo/detached/no-upstream tests, Task 3's `unknown` tests, and Task 4's exit-2 check. The design's Testing table maps to Task 1 Steps 2/6 and Task 2 Steps 1/5.

**Placeholder scan.** No TBD/TODO. Every code step carries literal code; every verification step carries a runnable command and its expected output.

**Type consistency.** `readState` returns `{isRepo, branch, detachedAt, upstream, ahead, behind, pushed, commitsInScope, linkedWorktree}` in Task 2 and is consumed under those exact names in Task 3's fixtures and Task 4's CLI. `historyOps` returns `{op, sha, date, message}` in Task 1 and is consumed under those names in Task 3's ops test and Task 4. `renderState({state, ops, since, sinceDate})` is defined in Task 3 and called with exactly those keys in Task 4.
