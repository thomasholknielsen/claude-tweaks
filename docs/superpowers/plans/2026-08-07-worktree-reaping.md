# Worktree Reaping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make removing a git worktree safe by ensuring one never holds the only copy of pipeline state, then reap merged-and-abandoned worktrees automatically from `SessionStart`.

**Architecture:** Phase 1 anchors the run directory's gitignored half to the main checkout at creation, resolved subprocess-free by reading a linked worktree's `.git` file. This deletes `wrap-up` Section C's copy-out steps rather than duplicating them. Phase 2 adds a `SessionStart` reaper whose safety predicate uses the owning PID embedded in git's worktree lock reason for liveness, and content identity (not ancestry) for merge status. Phase 3 reconciles the documentation the first two phases invalidate.

**Tech Stack:** Node 18+ (no external deps), `node --test` with `node:assert`, git CLI.

## Global Constraints

- **Every hook path exits 0.** No module may set a non-zero `exit`. A deny is expressed only via `hookSpecificOutput.permissionDecision`. New modules must pass the garbage-stdin invariant in `tests/hooks-dispatcher.test.js`.
- **Fail closed, never guess.** Any unresolvable state — unparseable lock reason, indeterminate repo info, unreadable `.git` — returns null/false and the caller falls back to existing behavior. Never act on ambiguity.
- **No new subprocess on hook paths.** Phase 1's resolution is pure `fs`. Phase 2's git calls run only after the cheap checks have already selected a candidate.
- **No kill switch.** Reaping is unconditional by design decision; there is no policy key to disable it. The predicate is the only safety mechanism.
- **Project-agnostic by construction.** Modules key off plugin-owned state, never project structure.
- **Commit style:** `{Verb} {what} — {detail}`, imperative, no conventional-commit prefixes. Task commits use `refs #185`.
- **Working directory:** this project sets `worktree.always`. All work happens inside a linked worktree; `git commit` from the main checkout is denied.

---

## File Structure

| File | Responsibility | Phase |
|---|---|---|
| `bin/lib/hooks/worktree-detect.js` | Gains `mainCheckoutRoot(p)` — fs-only resolution of the main checkout from anywhere in the repo | 1 |
| `bin/lib/hooks/context.js` | `iterRunDirsWithState` anchors its base to the main checkout instead of raw cwd | 1 |
| `skills/_shared/pipeline-run-dir.md` | Resolution contract — document the anchoring | 1 |
| `skills/flow/materialize.md` | Run-dir creation site | 1 |
| `skills/wrap-up/cleanup-procedures.md` | **Delete** Section C steps 4-5 and their ordering rule | 1 |
| `bin/lib/hooks/worktree-reap.js` | **New.** Lock parsing, PID liveness, content identity, the reap predicate | 2 |
| `bin/lib/hooks/session-start.js` | Invoke the reaper, report results | 2 |
| `skills/_shared/auto-mode-contract.md` | Record reaping at the log tier | 2 |
| `CLAUDE.md`, `docs/incident-log.md` | Narrow `[IL-58]` to the locked case | 3 |
| `skills/tidy/scan-procedures.md` | Reconcile Step 4.5 against the narrowed rule | 3 |

Tests: `tests/hooks-worktree-detect.test.js` (extend), `tests/hooks-context-anchoring.test.js` (new), `tests/hooks-worktree-reap.test.js` (new).

---

# Phase 1 — Anchoring

## Task 1: `mainCheckoutRoot()` in worktree-detect.js

Resolves the main checkout's root from any path inside the repository, including from inside a linked worktree. Pure `fs` — no subprocess, because `context.js`'s enumeration runs during `bin/hooks.js` argument parsing, before `repoInfo()` ever spawns.

**Files:**
- Modify: `bin/lib/hooks/worktree-detect.js` (add function, extend `module.exports` at :110)
- Test: `tests/hooks-worktree-detect.test.js`

**Interfaces:**
- Consumes: `nearestExistingDir`, `safeReal` (both already in this module)
- Produces: `mainCheckoutRoot(p: string) => string | null` — absolute realpath of the main checkout root, or `null` when unknown. Task 2 consumes this.

- [ ] **Step 1: Write the failing tests**

Append to `tests/hooks-worktree-detect.test.js`. Update the destructuring import at the top of the file to include `mainCheckoutRoot`:

```javascript
const { nearestExistingDir, repoInfo, findPolicyFile, safeReal, mainCheckoutRoot } = require('../bin/lib/hooks/worktree-detect');
```

```javascript
test('mainCheckoutRoot: from the main checkout returns its own root', () => {
  const main = gitRepo();
  assert.strictEqual(mainCheckoutRoot(main), safeReal(main));
});

test('mainCheckoutRoot: from inside a linked worktree returns the MAIN checkout, not the worktree', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  assert.strictEqual(mainCheckoutRoot(wt), safeReal(main));
  // The discriminating half: a naive implementation returns the worktree.
  assert.notStrictEqual(mainCheckoutRoot(wt), safeReal(wt));
});

test('mainCheckoutRoot: from a nested path inside a linked worktree still returns the main checkout', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  const nested = path.join(wt, 'a', 'b');
  fs.mkdirSync(nested, { recursive: true });
  assert.strictEqual(mainCheckoutRoot(nested), safeReal(main));
});

test('mainCheckoutRoot: a .git file pointing outside .git/worktrees/ (submodule shape) returns null', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-sub-'));
  fs.writeFileSync(path.join(dir, '.git'), 'gitdir: /somewhere/.git/modules/thing\n');
  assert.strictEqual(mainCheckoutRoot(dir), null);
});

test('mainCheckoutRoot: an unparseable .git file returns null', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-bad-'));
  fs.writeFileSync(path.join(dir, '.git'), 'not a gitdir line\n');
  assert.strictEqual(mainCheckoutRoot(dir), null);
});

test('mainCheckoutRoot: a path in no repository at all returns null', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-norepo-'));
  assert.strictEqual(mainCheckoutRoot(dir), null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/hooks-worktree-detect.test.js`
Expected: FAIL — `mainCheckoutRoot is not a function`

- [ ] **Step 3: Implement**

Insert into `bin/lib/hooks/worktree-detect.js`, after `nearestExistingDir` (i.e. before `repoInfo`):

```javascript
// A linked worktree's `.git` is a plain FILE containing
// `gitdir: <main>/.git/worktrees/<name>`; the main checkout's is a directory.
// That difference resolves the main checkout with zero subprocesses, which
// matters because context.js's run-dir enumeration runs on every hook
// invocation — including bin/hooks.js argument parsing, which happens before
// repoInfo() spawns anything.
//
// Returns null whenever the answer isn't certain (no .git found, unreadable or
// unparseable .git file, or a gitdir pointing somewhere other than
// .git/worktrees/ — notably a submodule's .git/modules/<name>, where the
// superproject root is NOT the right anchor). Callers fall back to their
// existing cwd-relative behavior on null rather than guessing.
const WORKTREE_ADMIN_MARKER = `${path.sep}.git${path.sep}worktrees${path.sep}`;

function mainCheckoutRoot(p) {
  let dir = nearestExistingDir(p);
  while (dir) {
    const gitPath = path.join(dir, '.git');
    let st = null;
    try { st = fs.statSync(gitPath); } catch { /* keep walking up */ }
    if (st && st.isDirectory()) return safeReal(dir);
    if (st && st.isFile()) {
      let raw;
      try { raw = fs.readFileSync(gitPath, 'utf8'); } catch { return null; }
      const m = /^gitdir:\s*(.+?)\s*$/m.exec(raw);
      if (!m) return null;
      const admin = path.resolve(dir, m[1]);
      const idx = admin.indexOf(WORKTREE_ADMIN_MARKER);
      if (idx === -1) return null;
      return safeReal(admin.slice(0, idx));
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}
```

Update the export line at the bottom of the file:

```javascript
module.exports = { nearestExistingDir, repoInfo, findPolicyFile, safeReal, mainCheckoutRoot };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/hooks-worktree-detect.test.js`
Expected: PASS, all tests

- [ ] **Step 5: Verify the test discriminates**

Temporarily change the `st.isFile()` branch to `return safeReal(dir);` (the naive answer), re-run, and confirm the linked-worktree tests FAIL. Then revert the sabotage.

Run: `node --test tests/hooks-worktree-detect.test.js`
Expected while sabotaged: FAIL on both linked-worktree tests. A test that passes here proves nothing.

- [ ] **Step 6: Commit**

```bash
git add bin/lib/hooks/worktree-detect.js tests/hooks-worktree-detect.test.js
git commit -m "Resolve the main checkout from inside a linked worktree without a subprocess — refs #185"
```

---

## Task 2: Anchor run-dir enumeration to the main checkout

**Files:**
- Modify: `bin/lib/hooks/context.js:34-49` (`iterRunDirsWithState`)
- Test: `tests/hooks-context-anchoring.test.js` (create)

**Interfaces:**
- Consumes: `mainCheckoutRoot(p)` from Task 1
- Produces: no signature change. `iterRunDirsWithState(cwd)`, `listRunDirsWithState(cwd)`, `listRunDirs(cwd)` and `resolveRun(cwd, env, sessionId)` keep their shapes; only the directory they read changes.

- [ ] **Step 1: Write the failing test**

Create `tests/hooks-context-anchoring.test.js`:

```javascript
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { iterRunDirsWithState } = require('../bin/lib/hooks/context');
const { gitRepo, linkedWorktreeOf } = require('./helpers/git-fixtures');

function seedRun(root, name, state) {
  const dir = path.join(root, '.claude-tweaks', 'pipelines', name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'run-state.json'), JSON.stringify(state));
  return dir;
}

test('iterRunDirsWithState: from inside a linked worktree yields the MAIN checkout run set', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  seedRun(main, '2026-08-07T120000-spec-1', { status: 'active' });

  const names = [...iterRunDirsWithState(wt)].map((e) => path.basename(e.dir));
  assert.deepStrictEqual(names, ['2026-08-07T120000-spec-1']);
});

test('iterRunDirsWithState: a run dir inside the worktree is NOT yielded once anchoring is on', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  seedRun(wt, '2026-08-07T130000-spec-9', { status: 'active' });

  const names = [...iterRunDirsWithState(wt)].map((e) => path.basename(e.dir));
  assert.deepStrictEqual(names, []);
});

test('iterRunDirsWithState: from the main checkout is unchanged', () => {
  const main = gitRepo();
  seedRun(main, '2026-08-07T140000-spec-2', { status: 'interrupted' });

  const names = [...iterRunDirsWithState(main)].map((e) => path.basename(e.dir));
  assert.deepStrictEqual(names, ['2026-08-07T140000-spec-2']);
});

test('iterRunDirsWithState: outside any repo falls back to cwd-relative behavior', () => {
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'ct-anchor-'));
  seedRun(dir, '2026-08-07T150000-spec-3', { status: 'active' });

  const names = [...iterRunDirsWithState(dir)].map((e) => path.basename(e.dir));
  assert.deepStrictEqual(names, ['2026-08-07T150000-spec-3']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/hooks-context-anchoring.test.js`
Expected: FAIL — the first test yields `[]` (it reads the worktree's own empty pipelines dir), the second yields the seeded name.

- [ ] **Step 3: Implement**

In `bin/lib/hooks/context.js`, add the require near the existing ones at the top of the file:

```javascript
const wtDetect = require('./worktree-detect');
```

Then replace the `base` line inside `iterRunDirsWithState` (currently `context.js:35`):

```javascript
function* iterRunDirsWithState(cwd) {
  // Anchored to the MAIN checkout, not raw cwd. A run dir created inside a
  // linked worktree was previously invisible from the main checkout and vice
  // versa, which is why a worktree could hold the only copy of decisions.md /
  // staged/ and why E1 fell open for commits issued from a worktree carrying
  // no .claude-tweaks/. One anchor means every session resolves the same run
  // set. Falls back to cwd when the main checkout can't be determined — that
  // is the pre-anchoring behavior, so an unknown answer changes nothing.
  const start = cwd || process.cwd();
  const root = wtDetect.mainCheckoutRoot(start) || start;
  const base = path.join(root, '.claude-tweaks', 'pipelines');
  let entries;
  try { entries = fs.readdirSync(base, { withFileTypes: true }); } catch { return; }
  const names = entries
    .filter((e) => e.isDirectory() && RUN_ID_RE.test(e.name))
    .map((e) => e.name)
    .sort()
    .reverse();
  for (const name of names) {
    const dir = path.join(base, name);
    const state = readRunState(dir);
    if (state && state.status === 'clean') continue;
    yield { dir, state };
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/hooks-context-anchoring.test.js`
Expected: PASS, 4 tests

- [ ] **Step 5: Run the full hook suite for regressions**

Run: `node --test tests/hooks-dispatcher.test.js tests/hooks-pre-tool-use.test.js tests/hooks-worktree-detect.test.js tests/hooks-gate-coverage.test.js`
Expected: PASS. `pre-tool-use.js:234` consumes `listRunDirsWithState` and drives the wrong-checkout gate — a regression here means the gate changed reach.

- [ ] **Step 6: Commit**

```bash
git add bin/lib/hooks/context.js tests/hooks-context-anchoring.test.js
git commit -m "Anchor run-dir resolution to the main checkout so a worktree never holds the only copy — refs #185"
```

---

## Task 3: Document the anchoring in the run-dir contract and creation site

**Files:**
- Modify: `skills/_shared/pipeline-run-dir.md` (Bash snippet section, around :21-38)
- Modify: `skills/flow/materialize.md` (run-dir creation)

**Interfaces:**
- Consumes: the behavior from Task 2
- Produces: prose only. No code depends on this task.

- [ ] **Step 1: Add the anchoring rule to the shared contract**

In `skills/_shared/pipeline-run-dir.md`, immediately before the `## Bash snippet (resolution)` heading, insert:

```markdown
## Anchoring

Run directories live under the **main checkout's** `.claude-tweaks/pipelines/`, never a
linked worktree's. Resolve the root once, before any path is built:

```bash
RUN_ROOT=$(git rev-parse --git-common-dir)
RUN_ROOT=$(cd "$(dirname "$RUN_ROOT")" && pwd)
```

In the main checkout `--git-common-dir` is `.git`, so this is the repo root and nothing
changes. Inside a linked worktree it resolves to the main checkout. Every path below is
built from `$RUN_ROOT`, not from the current directory.

Two consequences, both load-bearing:

- **A worktree never holds the only copy** of `config.yml`, `decisions.md`,
  `events.jsonl` or `staged/`. Removing a worktree therefore cannot destroy pipeline
  state, which is what makes automatic reaping safe (`session-start.js`).
- **`work/{n}-spec.md` is the exception** and stays inside the worktree. It is git-tracked
  and must be committed onto the feature branch; it reaches the main checkout by merge.

The `worktree.always` PreToolUse gate permits writes to this path from anywhere — see the
one exemption in `_shared/policy-schema.md`. That exemption is file-write-only, so a
`git commit` issued from the main checkout is still denied.
```

- [ ] **Step 2: Update the Bash snippet to use the anchor**

Replace the snippet's first two lines under `## Bash snippet (resolution)`:

```bash
RUN_ROOT=$(git rev-parse --git-common-dir); RUN_ROOT=$(cd "$(dirname "$RUN_ROOT")" && pwd)
RUN_DIR="${PIPELINE_RUN_DIR:-}"
if [ -z "$RUN_DIR" ]; then
  RUN_DIR=$(find "$RUN_ROOT/.claude-tweaks/pipelines/" -maxdepth 1 -type d -name "*${SPEC_SLUG}*" 2>/dev/null | sort | tail -n 1)
fi
if [ -z "$RUN_DIR" ] && [ "$MODE" = "auto" ] && [ -n "$STANDALONE_SKILL" ]; then
  TS=$(date -u +%Y-%m-%dT%H%M%S)
  RUN_DIR="$RUN_ROOT/.claude-tweaks/pipelines/${TS}-${STANDALONE_SKILL}-standalone"
  mkdir -p "$RUN_DIR/staged"
  touch "$RUN_DIR/decisions.md"
fi
[ -d "$RUN_DIR" ] || RUN_DIR=""  # empty = fall back to interactive mode
```

- [ ] **Step 3: Verify the snippet runs under bash, not just zsh**

Run: `bash -c 'cd "$(git rev-parse --show-toplevel)" && RUN_ROOT=$(git rev-parse --git-common-dir); RUN_ROOT=$(cd "$(dirname "$RUN_ROOT")" && pwd); echo "$RUN_ROOT"'`
Expected: the repo root, printed once. `[IL-22]` — zsh and bash disagree about enough that an interactive-shell check is not evidence.

- [ ] **Step 4: Update the creation site**

In `skills/flow/materialize.md`, find the run-dir creation instruction and make it build the path from `$RUN_ROOT` as resolved above, citing `_shared/pipeline-run-dir.md`'s Anchoring section rather than restating the resolution.

- [ ] **Step 5: Commit**

```bash
git add skills/_shared/pipeline-run-dir.md skills/flow/materialize.md
git commit -m "Document run-dir anchoring at the contract and the creation site — refs #185"
```

---

## Task 4: Delete Section C's copy-out steps

The reason these steps exist is gone. Removing them is the point of Phase 1, not an optimization.

**Files:**
- Modify: `skills/wrap-up/cleanup-procedures.md` (Section C step 4; Section B step 5's gitignored-content branch; the second-half ordering rule near :9)

**Interfaces:**
- Consumes: Task 2's anchoring
- Produces: prose only.

- [ ] **Step 1: Read the current text before editing**

Run: `sed -n '1,20p;55,75p;125,140p' skills/wrap-up/cleanup-procedures.md`
Expected: the ordering rule at the top, Section B step 5, and Section C step 4. Read the rendered result, not just the diff — a stray line next to a fenced block lands inside the fence (`[IL-27]`).

- [ ] **Step 2: Delete Section C's copy-out step**

Remove Section C step 4 ("Copy `$RUN_DIR`'s gitignored content out to the main checkout — before removing the worktree") entirely, and renumber the steps that follow it.

- [ ] **Step 3: Simplify Section B step 5**

Section B step 5 currently branches on worktree-strategy vs `current-branch` because only the former had a pre-copy. Replace the whole step with:

```markdown
5. **Gitignored content** (`config.yml`, `decisions.md`, `events.jsonl`, `staged/`):
   already in the main checkout — run directories are anchored there at creation
   (`_shared/pipeline-run-dir.md`, Anchoring). Move them into the archive path with a
   plain `mv`, same destination as `work/`'s but without `git mv` since they were never
   tracked. This is identical for worktree-strategy and `current-branch` runs; the
   two-branch split it replaces existed only because the worktree strategy used to hold
   the sole copy.
```

- [ ] **Step 4: Delete the second-half ordering rule**

Remove the paragraph beginning "**Ordering rule, second half: item 4's own worktree-removal sub-step must not destroy `$RUN_DIR`'s gitignored content before it's copied out.**" It describes a hazard that no longer exists. Leave the first-half ordering rule (archival is always last) untouched — that one is still true.

- [ ] **Step 5: Verify no dangling references to the deleted steps**

Run: `grep -rn "Section C step 4\|pre-removal copy\|copied out\|copy step" skills/ docs/ CLAUDE.md`
Expected: no hits referring to the deleted copy-out. Any hit is a cross-reference to fix in this same commit — `[IL-02]`, a promise whose consumer just left.

- [ ] **Step 6: Commit**

```bash
git add skills/wrap-up/cleanup-procedures.md
git commit -m "Delete wrap-up's run-dir copy-out — anchoring makes it unnecessary — refs #185"
```

---

# Phase 2 — The reaper

Do not begin Phase 2 until Phase 1 is merged. Reaping is unsafe before it.

## Task 5: Parse `git worktree list --porcelain` into lock facts

**Files:**
- Create: `bin/lib/hooks/worktree-reap.js`
- Test: `tests/hooks-worktree-reap.test.js` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `parseWorktreeList(porcelain: string) => Array<{ path: string, branch: string|null, bare: boolean, locked: boolean, lockReason: string|null, pid: number|null }>`. Tasks 6 and 7 consume this.

- [ ] **Step 1: Write the failing test with frozen fixtures**

Create `tests/hooks-worktree-reap.test.js`. The fixture is a literal string, never live `git worktree list` output — the lock-reason format is an unversioned harness implementation detail, and a test that reads it live is a scheduled failure timed to whenever the harness changes it (`[IL-80]`).

```javascript
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { parseWorktreeList } = require('../bin/lib/hooks/worktree-reap');

// Frozen 2026-08-07 from `git worktree list --porcelain` on macOS, git 2.x.
const PORCELAIN = [
  'worktree /repo',
  'HEAD 1111111111111111111111111111111111111111',
  'branch refs/heads/main',
  '',
  'worktree /repo/.claude/worktrees/alive',
  'HEAD 2222222222222222222222222222222222222222',
  'branch refs/heads/worktree-alive',
  'locked claude session alive (pid 29881 start Fri Aug  7 14:40:15 2026)',
  '',
  'worktree /repo/.claude/worktrees/dead',
  'HEAD 3333333333333333333333333333333333333333',
  'branch refs/heads/worktree-dead',
  'locked claude session dead (pid 4242 start Fri Aug  7 09:00:00 2026)',
  '',
  'worktree /repo/.claude/worktrees/free',
  'HEAD 4444444444444444444444444444444444444444',
  'branch refs/heads/worktree-free',
  '',
  'worktree /repo/.claude/worktrees/opaque',
  'HEAD 5555555555555555555555555555555555555555',
  'branch refs/heads/worktree-opaque',
  'locked',
  '',
].join('\n');

test('parseWorktreeList: extracts path, branch and lock state for every entry', () => {
  const got = parseWorktreeList(PORCELAIN);
  assert.strictEqual(got.length, 5);
  assert.strictEqual(got[0].path, '/repo');
  assert.strictEqual(got[0].branch, 'main');
  assert.strictEqual(got[0].locked, false);
});

test('parseWorktreeList: recovers the owning pid from the lock reason', () => {
  const got = parseWorktreeList(PORCELAIN);
  const alive = got.find((w) => w.path.endsWith('/alive'));
  assert.strictEqual(alive.locked, true);
  assert.strictEqual(alive.pid, 29881);
});

test('parseWorktreeList: a bare `locked` with no reason yields locked with a null pid', () => {
  const got = parseWorktreeList(PORCELAIN);
  const opaque = got.find((w) => w.path.endsWith('/opaque'));
  assert.strictEqual(opaque.locked, true);
  assert.strictEqual(opaque.lockReason, null);
  assert.strictEqual(opaque.pid, null);
});

test('parseWorktreeList: an unlocked worktree has locked false and a null pid', () => {
  const got = parseWorktreeList(PORCELAIN);
  const free = got.find((w) => w.path.endsWith('/free'));
  assert.strictEqual(free.locked, false);
  assert.strictEqual(free.pid, null);
});

test('parseWorktreeList: a lock reason with no pid parses as locked, pid null', () => {
  const got = parseWorktreeList('worktree /a\nbranch refs/heads/b\nlocked being edited by hand\n\n');
  assert.strictEqual(got[0].locked, true);
  assert.strictEqual(got[0].lockReason, 'being edited by hand');
  assert.strictEqual(got[0].pid, null);
});

test('parseWorktreeList: empty input yields an empty array', () => {
  assert.deepStrictEqual(parseWorktreeList(''), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/hooks-worktree-reap.test.js`
Expected: FAIL — `Cannot find module '../bin/lib/hooks/worktree-reap'`

- [ ] **Step 3: Implement**

Create `bin/lib/hooks/worktree-reap.js`:

```javascript
// bin/lib/hooks/worktree-reap.js — decide which linked worktrees are safe to
// remove, and remove them. Safe means: nobody is using it, its work is already
// in the integration branch, and it holds nothing that exists only here.
//
// Every predicate below fails CLOSED. An unparseable lock reason, an
// unresolvable branch, or a git call that doesn't answer all resolve to "not
// eligible" — never to "eligible". There is no policy key to disable reaping,
// so the predicate is the only safety mechanism.
'use strict';

// `git worktree list --porcelain` emits blank-line-separated stanzas of
// `key value` lines. The `locked` line is either bare or carries a reason,
// and the harness writes the owning session's pid into that reason:
//   locked claude session <name> (pid 29881 start Fri Aug  7 14:40:15 2026)
// That format belongs to a tool this plugin neither owns nor version-pins, so
// it is parsed defensively and tested against a frozen fixture, never live
// output: if it changes shape, pid comes back null and nothing is reaped.
const PID_RE = /\(pid\s+(\d+)\b/;

function parseWorktreeList(porcelain) {
  const out = [];
  let cur = null;
  const flush = () => { if (cur) out.push(cur); cur = null; };
  for (const line of String(porcelain || '').split('\n')) {
    if (line === '') { flush(); continue; }
    const sp = line.indexOf(' ');
    const key = sp === -1 ? line : line.slice(0, sp);
    const val = sp === -1 ? '' : line.slice(sp + 1);
    if (key === 'worktree') {
      flush();
      cur = { path: val, branch: null, bare: false, locked: false, lockReason: null, pid: null };
      continue;
    }
    if (!cur) continue;
    if (key === 'branch') cur.branch = val.replace(/^refs\/heads\//, '');
    else if (key === 'bare') cur.bare = true;
    else if (key === 'locked') {
      cur.locked = true;
      cur.lockReason = val || null;
      const m = val ? PID_RE.exec(val) : null;
      cur.pid = m ? Number(m[1]) : null;
    }
  }
  flush();
  return out;
}

module.exports = { parseWorktreeList };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/hooks-worktree-reap.test.js`
Expected: PASS, 6 tests

- [ ] **Step 5: Commit**

```bash
git add bin/lib/hooks/worktree-reap.js tests/hooks-worktree-reap.test.js
git commit -m "Parse git worktree lock state, including the owning pid — refs #185"
```

---

## Task 6: Liveness and content-identity predicates

**Files:**
- Modify: `bin/lib/hooks/worktree-reap.js`
- Test: `tests/hooks-worktree-reap.test.js`

**Interfaces:**
- Consumes: `parseWorktreeList` (Task 5); `runGit` from `./git-exec`
- Produces:
  - `isPidAlive(pid: number|null) => boolean`
  - `lockVerdict(entry) => 'free' | 'in-use' | 'orphaned' | 'unknown'`
  - `isContentIdentical(repoRoot: string, branch: string, integration: string) => boolean`

  Task 7 consumes all three.

- [ ] **Step 1: Write the failing tests**

Append to `tests/hooks-worktree-reap.test.js`, extending the import:

```javascript
const { parseWorktreeList, isPidAlive, lockVerdict, isContentIdentical } = require('../bin/lib/hooks/worktree-reap');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { gitRepo, linkedWorktreeOf } = require('./helpers/git-fixtures');

// gitRepo() runs a bare `git init`, so the initial branch is whatever the
// machine's init.defaultBranch says — `main` on some, `master` on others.
// Resolve it instead of hardcoding, or these tests pass on the author's
// machine and fail in CI for a reason unrelated to the code under test.
const defaultBranch = (repo) =>
  execFileSync('git', ['symbolic-ref', '--short', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
```

```javascript
test('isPidAlive: this process is alive', () => {
  assert.strictEqual(isPidAlive(process.pid), true);
});

test('isPidAlive: null and nonsense pids are not alive', () => {
  assert.strictEqual(isPidAlive(null), false);
  assert.strictEqual(isPidAlive(0), false);
  assert.strictEqual(isPidAlive(-1), false);
});

test('lockVerdict: unlocked is free', () => {
  assert.strictEqual(lockVerdict({ locked: false, pid: null }), 'free');
});

test('lockVerdict: locked with a live pid is in-use', () => {
  assert.strictEqual(lockVerdict({ locked: true, pid: process.pid }), 'in-use');
});

test('lockVerdict: locked with a dead pid is orphaned', () => {
  // 2^22 is above the default pid_max on both macOS and Linux, so no process
  // can hold it — a deterministic "definitely dead" pid.
  assert.strictEqual(lockVerdict({ locked: true, pid: 4194304 }), 'orphaned');
});

test('lockVerdict: locked with no recoverable pid is unknown, never orphaned', () => {
  assert.strictEqual(lockVerdict({ locked: true, pid: null }), 'unknown');
});

test('isContentIdentical: a branch with no diff against the integration branch is identical', () => {
  const main = gitRepo();
  const base = defaultBranch(main);
  execFileSync('git', ['checkout', '-q', '-b', 'feature'], { cwd: main });
  execFileSync('git', ['checkout', '-q', base], { cwd: main });
  assert.strictEqual(isContentIdentical(main, 'feature', base), true);
});

test('isContentIdentical: a branch with a real change is not identical', () => {
  const main = gitRepo();
  const base = defaultBranch(main);
  execFileSync('git', ['checkout', '-q', '-b', 'feature'], { cwd: main });
  fs.writeFileSync(path.join(main, 'new.txt'), 'x');
  execFileSync('git', ['add', 'new.txt'], { cwd: main });
  execFileSync('git', ['commit', '-q', '-m', 'add'], { cwd: main });
  execFileSync('git', ['checkout', '-q', base], { cwd: main });
  assert.strictEqual(isContentIdentical(main, 'feature', base), false);
});

test('isContentIdentical: a rebase-rewritten branch is still identical (the ancestry trap)', () => {
  const main = gitRepo();
  const base = defaultBranch(main);
  execFileSync('git', ['checkout', '-q', '-b', 'feature'], { cwd: main });
  fs.writeFileSync(path.join(main, 'f.txt'), 'content');
  execFileSync('git', ['add', 'f.txt'], { cwd: main });
  execFileSync('git', ['commit', '-q', '-m', 'feature work'], { cwd: main });
  // Simulate `gh pr merge --rebase`: the integration branch gains the same
  // content under a different sha, so the branch is NOT an ancestor of it.
  execFileSync('git', ['checkout', '-q', base], { cwd: main });
  execFileSync('git', ['cherry-pick', 'feature'], { cwd: main });

  const ancestor = (() => {
    try {
      execFileSync('git', ['merge-base', '--is-ancestor', 'feature', base], { cwd: main });
      return true;
    } catch { return false; }
  })();
  assert.strictEqual(ancestor, false, 'precondition: rebase-merge breaks ancestry');
  assert.strictEqual(isContentIdentical(main, 'feature', base), true);
});

test('isContentIdentical: an unresolvable branch is not identical', () => {
  const main = gitRepo();
  assert.strictEqual(isContentIdentical(main, 'no-such-branch', defaultBranch(main)), false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/hooks-worktree-reap.test.js`
Expected: FAIL — `isPidAlive is not a function`

- [ ] **Step 3: Implement**

Add to `bin/lib/hooks/worktree-reap.js`, and extend its require line and exports:

```javascript
const { runGit } = require('./git-exec');
```

```javascript
// signal 0 tests for existence without delivering anything. ESRCH means no
// such process; EPERM means it exists but belongs to another user, which is
// still alive. Both directions of pid reuse are safe here: a recycled pid
// reads as alive and the worktree is skipped, and there is no input on which
// a live session reads as dead. The failure mode is always under-reaping.
function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e && e.code === 'EPERM';
  }
}

//   'free'     — nothing holds it
//   'in-use'   — a live session holds it; never touch
//   'orphaned' — a session held it and died without releasing
//   'unknown'  — locked, but the reason yielded no pid. Surface, never act.
function lockVerdict(entry) {
  if (!entry.locked) return 'free';
  if (entry.pid === null) return 'unknown';
  return isPidAlive(entry.pid) ? 'in-use' : 'orphaned';
}

// Content identity, deliberately NOT `git merge-base --is-ancestor`. A branch
// merged with `gh pr merge --rebase` has its shas rewritten, so it is
// permanently a non-ancestor of the integration branch even though every line
// of its content landed there. This repo favors rebase merges, so an ancestry
// check would refuse to reap the common case (see #106, the same trap in
// [IL-45]'s sha-identity check).
//
// An empty `git diff --name-only A B` means the two trees are identical.
// Any failure to answer returns false: unresolvable is not identical.
function isContentIdentical(repoRoot, branch, integration) {
  if (!branch || !integration) return false;
  const { stdout, failure } = runGit(['diff', '--name-only', integration, branch], repoRoot);
  if (failure) return false;
  return stdout.trim() === '';
}
```

```javascript
module.exports = { parseWorktreeList, isPidAlive, lockVerdict, isContentIdentical };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/hooks-worktree-reap.test.js`
Expected: PASS, all tests

- [ ] **Step 5: Verify the rebase test discriminates**

Temporarily reimplement `isContentIdentical` as an ancestry check:

```javascript
const { failure } = runGit(['merge-base', '--is-ancestor', branch, integration], repoRoot);
return !failure;
```

Re-run. Expected: the rebase test FAILS. This is the whole reason the predicate is content identity; a test that passes both ways would not have caught it. Revert the sabotage.

- [ ] **Step 6: Commit**

```bash
git add bin/lib/hooks/worktree-reap.js tests/hooks-worktree-reap.test.js
git commit -m "Add liveness and content-identity predicates for worktree reaping — refs #185"
```

---

## Task 7: Reap on SessionStart

**Files:**
- Modify: `bin/lib/hooks/worktree-reap.js` (add `reapWorktrees`)
- Modify: `bin/lib/hooks/session-start.js`
- Modify: `skills/_shared/auto-mode-contract.md`
- Test: `tests/hooks-worktree-reap.test.js`

**Interfaces:**
- Consumes: `parseWorktreeList`, `lockVerdict`, `isContentIdentical` (Tasks 5-6); `mainCheckoutRoot` (Task 1)
- Produces: `reapWorktrees({ cwd, integration, dryRun }) => { reaped: string[], skipped: Array<{ path: string, reason: string }> }`

- [ ] **Step 1: Write the failing tests**

Append to `tests/hooks-worktree-reap.test.js`, extending the import with `reapWorktrees`:

```javascript
test('reapWorktrees: removes a merged, clean, unlocked linked worktree', () => {
  const main = gitRepo();
  const base = defaultBranch(main);
  const wt = linkedWorktreeOf(main);
  const before = fs.existsSync(wt);
  assert.strictEqual(before, true);

  const res = reapWorktrees({ cwd: main, integration: base });
  assert.deepStrictEqual(res.reaped, [fs.realpathSync(wt)]);
  assert.strictEqual(fs.existsSync(wt), false);
});

test('reapWorktrees: never removes the main checkout', () => {
  const main = gitRepo();
  const base = defaultBranch(main);
  const res = reapWorktrees({ cwd: main, integration: base });
  assert.ok(!res.reaped.includes(fs.realpathSync(main)));
});

test('reapWorktrees: skips a worktree holding unmerged commits', () => {
  const main = gitRepo();
  const base = defaultBranch(main);
  const wt = linkedWorktreeOf(main);
  fs.writeFileSync(path.join(wt, 'x.txt'), 'x');
  execFileSync('git', ['add', 'x.txt'], { cwd: wt });
  execFileSync('git', ['commit', '-q', '-m', 'unmerged'], { cwd: wt });

  const res = reapWorktrees({ cwd: main, integration: base });
  assert.deepStrictEqual(res.reaped, []);
  assert.strictEqual(fs.existsSync(wt), true);
  assert.match(res.skipped.find((s) => s.path === fs.realpathSync(wt)).reason, /not merged/);
});

test('reapWorktrees: skips a worktree carrying untracked or ignored content', () => {
  const main = gitRepo();
  const base = defaultBranch(main);
  const wt = linkedWorktreeOf(main);
  fs.writeFileSync(path.join(wt, 'scratch-notes.md'), 'decision pending');

  const res = reapWorktrees({ cwd: main, integration: base });
  assert.deepStrictEqual(res.reaped, []);
  assert.strictEqual(fs.existsSync(wt), true);
  assert.match(res.skipped.find((s) => s.path === fs.realpathSync(wt)).reason, /local content/);
});

test('reapWorktrees: never removes the worktree the caller is standing in', () => {
  const main = gitRepo();
  const base = defaultBranch(main);
  const wt = linkedWorktreeOf(main);
  const res = reapWorktrees({ cwd: wt, integration: base });
  assert.deepStrictEqual(res.reaped, []);
  assert.strictEqual(fs.existsSync(wt), true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/hooks-worktree-reap.test.js`
Expected: FAIL — `reapWorktrees is not a function`

- [ ] **Step 3: Implement**

Add to `bin/lib/hooks/worktree-reap.js` (requires `path`, `fs`, and `mainCheckoutRoot`):

```javascript
const fs = require('fs');
const path = require('path');
const { mainCheckoutRoot, safeReal } = require('./worktree-detect');

// Anything still present in the worktree that git does not already have a
// copy of elsewhere. --ignored is the point: [IL-46]'s actual incident was a
// gitignored scratch file holding a decision nobody had recorded anywhere
// else, and merge status is silent about it. Phase 1 moved claude-tweaks' own
// run state out of the worktree; this catches everyone else's.
function hasLocalOnlyContent(wtPath) {
  const { stdout, failure } = runGit(['status', '--porcelain', '--ignored'], wtPath);
  if (failure) return true; // can't tell -> assume yes
  return stdout.trim() !== '';
}

function reapWorktrees({ cwd, integration, dryRun = false } = {}) {
  const reaped = [];
  const skipped = [];
  const root = mainCheckoutRoot(cwd || process.cwd());
  if (!root) return { reaped, skipped };

  const { stdout, failure } = runGit(['worktree', 'list', '--porcelain'], root);
  if (failure) return { reaped, skipped };

  const here = safeReal(cwd || process.cwd());
  for (const wt of parseWorktreeList(stdout)) {
    const real = safeReal(wt.path);
    if (!real || real === root || wt.bare) continue;      // never the main checkout
    if (here && (here === real || here.startsWith(real + path.sep))) continue; // never our own ground

    const verdict = lockVerdict(wt);
    if (verdict !== 'free' && verdict !== 'orphaned') {
      skipped.push({ path: real, reason: verdict === 'in-use' ? 'in use by a live session' : 'lock reason unrecognized' });
      continue;
    }
    if (!isContentIdentical(root, wt.branch, integration)) {
      skipped.push({ path: real, reason: 'not merged into ' + integration });
      continue;
    }
    if (hasLocalOnlyContent(real)) {
      skipped.push({ path: real, reason: 'holds local content that exists nowhere else' });
      continue;
    }
    if (dryRun) { reaped.push(real); continue; }

    if (verdict === 'orphaned') runGit(['worktree', 'unlock', real], root);
    const rm = runGit(['worktree', 'remove', real], root);
    if (rm.failure) { skipped.push({ path: real, reason: 'removal failed' }); continue; }
    reaped.push(real);
  }
  return { reaped, skipped };
}
```

Export it:

```javascript
module.exports = { parseWorktreeList, isPidAlive, lockVerdict, isContentIdentical, reapWorktrees, defaultBranchOf };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/hooks-worktree-reap.test.js`
Expected: PASS, all tests

- [ ] **Step 5: Add an integration-branch reader to policy.js**

`bin/lib/integration-branch.js` **does not exist** — verified 2026-08-07. `_shared/integration-branch.md` is a skill-side prose contract, and `bin/lib/policy-schema.js:14` registers the key, but nothing reads it from JS. `bin/lib/policy.js` has an unexported `readPolicyFile(repoRoot)` and exports only `isWorktreeAlwaysOn`.

Add to `bin/lib/policy.js`, following that file's existing no-YAML-dependency, flat-key convention, and extend its exports:

```javascript
// `integration-branch: <name>` — where finished work lands. Unset on most
// projects, where each consumer falls back to the repository's own default
// branch. Trailing `# comment` tolerated, same as isWorktreeAlwaysOn.
function readIntegrationBranch(repoRoot) {
  const raw = readPolicyFile(repoRoot);
  if (!raw) return null;
  for (const line of raw.split('\n')) {
    const m = /^integration-branch:\s*([^\s#]+)(\s*#.*)?$/.exec(line.trim());
    if (m) return m[1];
  }
  return null;
}
```

```javascript
module.exports = { isWorktreeAlwaysOn, readIntegrationBranch };
```

Add a test to the existing policy suite covering: key present, key absent, and key present with a trailing comment.

- [ ] **Step 6: Wire into session-start.js**

Add the require alongside the existing ones, and insert a new best-effort block after the stale-run block and before the `worktree.always` nudge block:

```javascript
const reaper = require('./worktree-reap');
```

```javascript
  try {
    const { repoRoot } = wtDetect.repoInfo(ctx.cwd);
    // policy.yml's integration-branch when set; otherwise the repository's own
    // HEAD branch. Never hardcode `main` — this plugin runs against projects
    // using a dev -> staging -> main model, where main is the one branch
    // nothing should be measured against (_shared/integration-branch.md).
    const integration =
      (repoRoot && policy.readIntegrationBranch(repoRoot)) || reaper.defaultBranchOf(repoRoot);
    if (!integration) throw new Error('no integration branch');
    const { reaped, skipped } = reaper.reapWorktrees({ cwd: ctx.cwd, integration });
    if (reaped.length) {
      parts.push(
        `claude-tweaks: removed ${reaped.length} finished worktree(s) whose work is already in ${integration}:\n` +
          reaped.map((p) => `- ${path.basename(p)}`).join('\n'),
      );
    }
    const notable = skipped.filter((s) => s.reason !== 'in use by a live session');
    if (notable.length) {
      parts.push(
        'claude-tweaks: worktree(s) left in place:\n' +
          notable.map((s) => `- ${path.basename(s.path)} — ${s.reason}`).join('\n'),
      );
    }
  } catch { /* best-effort */ }
```

`session-start.js` already requires both `policy` and `wtDetect`, so no new imports beyond `reaper` are needed.

Add `defaultBranchOf` to `bin/lib/hooks/worktree-reap.js` and its exports — the fallback when no `integration-branch` policy key is set:

```javascript
// The repository's own current branch, used only when policy names no
// integration branch. Returns null when git doesn't answer, which the caller
// treats as "cannot determine" and skips reaping entirely — reaping against a
// guessed branch is how a worktree gets removed for being "merged" into
// something it was never headed for.
function defaultBranchOf(repoRoot) {
  if (!repoRoot) return null;
  const { stdout, failure } = runGit(['symbolic-ref', '--short', 'HEAD'], repoRoot);
  if (failure || !stdout) return null;
  return stdout.trim() || null;
}
```

- [ ] **Step 7: Verify the hook still never breaks a session**

Run: `node --test tests/hooks-dispatcher.test.js`
Expected: PASS — including the garbage-stdin invariant. Then, manually:

Run: `echo 'not json' | node bin/hooks.js session-start; echo "exit=$?"`
Expected: `exit=0`

- [ ] **Step 8: Record reaping in the auto-mode contract**

Add a row to `skills/_shared/auto-mode-contract.md`'s tier table recording worktree reaping at the **log** tier: it appends an `events.jsonl` entry and reports in the SessionStart banner, is not user-facing decision-worthy, and has no interactive equivalent because it fires before any conversation exists.

- [ ] **Step 9: Commit**

```bash
git add bin/lib/hooks/worktree-reap.js bin/lib/hooks/session-start.js bin/lib/policy.js skills/_shared/auto-mode-contract.md tests/hooks-worktree-reap.test.js tests/policy.test.js
git commit -m "Reap finished worktrees on SessionStart — refs #185"
```

---

# Phase 3 — Reconcile the documentation

## Task 8: Narrow `[IL-58]` and reconcile /tidy Step 4.5

**Files:**
- Modify: `docs/incident-log.md:251`
- Modify: `CLAUDE.md:261`
- Modify: `skills/tidy/scan-procedures.md:135-148`

**Interfaces:** prose only.

- [ ] **Step 1: Narrow the incident-log entry**

At `docs/incident-log.md:251`, keep the original narrative and change only the rule's reach. The current text generalizes to any `EnterWorktree`-created worktree; the evidence is only about locked ones. Add:

```markdown
**Narrowed 2026-08-07.** The failure is specific to a **locked** worktree, not to
`EnterWorktree` provenance. Counter-evidence: seven unlocked, harness-created worktrees
under `.claude/worktrees/` were removed with the raw git form on the first attempt, no
lock error. The rule below now reads as locked-only; `bin/lib/hooks/worktree-reap.js`
unlocks first when the lock's owning pid is provably dead, and never otherwise.
```

- [ ] **Step 2: Narrow the CLAUDE.md Don't**

Replace `CLAUDE.md:261` with:

```markdown
- Don't run raw `git worktree remove` on a **locked** worktree — it fails on the lock, and superpowers' cleanup docs show only the raw form. Unlock first when the lock's owning pid is provably dead (`bin/lib/hooks/worktree-reap.js`), use `ExitWorktree` for this session's own, and note that neither reaches another session's locked worktree `[IL-58]`
```

- [ ] **Step 3: Reconcile /tidy Step 4.5**

At `skills/tidy/scan-procedures.md:148`, the instruction to use `git -C "{REPO_ROOT}" worktree remove {path}` is now correct as written for unlocked worktrees. Add one sentence after it:

```markdown
A **locked** worktree will refuse to remove. Do not force it: a live lock means a session
is using it. `SessionStart`'s reaper (`bin/lib/hooks/worktree-reap.js`) already removes
locked worktrees whose owning process is gone, so anything still locked at `/tidy` time is
either in use or unrecognized — surface it as `locked — manual review required`.
```

- [ ] **Step 4: Verify the two files now agree**

Run: `grep -rn "worktree remove" CLAUDE.md docs/incident-log.md skills/tidy/scan-procedures.md`
Expected: every hit qualifies the command by lock state. A reader following any of the three arrives at the same command. This is the contradiction the whole record opened on.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md docs/incident-log.md skills/tidy/scan-procedures.md
git commit -m "Narrow IL-58 to locked worktrees and reconcile /tidy Step 4.5 — refs #185"
```

---

## Task 9: Point #106 at the shared content-identity helper

**Files:** none in-repo — this is a GitHub record update.

- [ ] **Step 1: Verify the helper is what #106 needs**

Run: `gh issue view 106 --repo thomasholknielsen/claude-tweaks --json body -q .body`
Expected: the body describes `[IL-45]`'s `git rev-parse HEAD` sha-identity check failing after a rebase merge. Confirm `isContentIdentical` answers the same question before claiming it does — `[IL-71]`, the body was written against a snapshot.

- [ ] **Step 2: Comment on #106**

Post a comment naming `isContentIdentical(repoRoot, branch, integration)` in `bin/lib/hooks/worktree-reap.js` as the shared answer, with the reasoning: an empty `git diff --name-only` holds for fast-forward, merge-commit and rebase alike, where sha identity and ancestry both fail on the third.

- [ ] **Step 3: Close out #185**

Comment on #185 linking the merged phases and noting which of its original deliverables landed where.

---

## Self-Review

**Spec coverage.** Every design section maps to a task: Phase 1 anchoring → Tasks 1-3; Section C deletion → Task 4; the lock/PID table → Tasks 5-6; the five-part reap predicate → Task 7 (linked-worktree and own-cwd guards in the loop, lock verdict, content identity, local-only content); Phase 3 → Tasks 8-9. The design's four Testing items map to Task 1 Step 5, Task 5 Step 1's frozen fixture, Task 7 Step 6's garbage-stdin check, and the discrimination steps in Tasks 1 and 6.

**Deviation from the design, deliberate.** The design says Phase 1 reuses `repoInfo`'s existing `--git-common-dir` spawn. That is wrong for the actual call path: `iterRunDirsWithState` is reached from `bin/hooks.js` argument parsing, before `repoInfo` runs. Task 1 uses a pure-`fs` read of the linked worktree's `.git` file instead, which is strictly cheaper — zero subprocesses rather than a reused one — and additionally guards the submodule case (`.git/modules/`) that a naive common-dir parent would resolve to the superproject. Verified against a live worktree: `gitdir: /Users/.../claude-tweaks/.git/worktrees/plan-c-task2`.

**Open items from the design, resolved here.** The module lives at `bin/lib/hooks/worktree-reap.js` (Task 5) rather than a `bin/lib/` sibling — only one consumer exists today, and `[IL-32]`'s threshold is a second. "Plugin-owned" in criterion 5 became simpler than the design anticipated: `git status --porcelain --ignored` must be *entirely* empty, with no allowlist, because Phase 1 already removed the only plugin-owned content that used to live there. No migration step is needed for run dirs inside live worktrees — Task 2's fallback means a worktree-local run dir stops being resolved rather than being lost, and the four locked worktrees holding real work are excluded by `lockVerdict` regardless.

**Type consistency.** `parseWorktreeList` returns entries with `{ path, branch, bare, locked, lockReason, pid }`; `lockVerdict` reads `.locked`/`.pid`; `reapWorktrees` reads `.path`/`.branch`/`.bare` and passes `.branch` to `isContentIdentical(repoRoot, branch, integration)`. `mainCheckoutRoot` returns `string | null` and every caller guards the null. Names are identical across Tasks 1, 5, 6 and 7.

**Three plan bugs found by running the self-review's own checks rather than eyeballing them.** Recorded because each would have failed at execution time, not review time:

1. **`bin/lib/integration-branch.js` does not exist.** The first draft required it, on the strength of `_shared/integration-branch.md` describing the contract — but that is a skill-side prose file, and `bin/lib/policy-schema.js:14` only registers the key. Nothing reads it from JS. Task 7 Step 5 now adds `readIntegrationBranch` to `bin/lib/policy.js`, following that file's existing no-YAML-dependency convention, with `defaultBranchOf` as the fallback and a hard skip when neither resolves. Asserting an API exists because a doc describes it is `[IL-24]`.
2. **The tests hardcoded `'master'`.** `gitRepo()` runs a bare `git init` with no `-b`, so the initial branch is whatever the machine's `init.defaultBranch` says. Every test now resolves it via `defaultBranch(repo)`. Computing an expectation from the same environment the implementation reads is `[IL-62]`; hardcoding one the environment chooses is the mirror of it, and both pass locally.
3. **A bulk find-and-replace left `base` referenced in ten places and defined in none.** Caught by an `awk` pass asserting every use has a definition in its own test body, not by re-reading the diff. Verifying a mechanical edit by reading it is what `[IL-35]` warns about.

**Step numbering** in Task 7 was swept after inserting the new Step 5 — an insertion carries the same cross-reference hazard as a renumber (`[IL-86]`), and the first pass left two Step 6s.
