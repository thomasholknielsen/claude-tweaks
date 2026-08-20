# Anchored-or-Outside Run-Dir Guard (resolve-profile.js / resolve-policy.js) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the last two `[IL-127]`-class unguarded `--run-dir`/`--run` CLI arguments (`plugin/bin/resolve-profile.js`, `plugin/bin/resolve-policy.js`) with anchored-or-outside semantics that keep the documented `/tmp` journey and tmp-fixture tests working with no flag.

**Architecture:** One new predicate `checkRunDirAnchoredOrOutside(candidate, cwd)` in `plugin/bin/lib/hooks/worktree-detect.js`, composed from the module's existing primitives (`nearestExistingDir`, `safeReal`, `mainCheckoutRoot`, `isAnchoredUnderRoot`). Both CLIs call it immediately after argument parsing and reject via their existing `fail()` (exit 1) using the module's existing message helpers. `_shared/pipeline-run-dir.md`'s third-guard paragraph is rewritten to document the two-rule split.

**Tech Stack:** Node 18+ built-ins only (zero runtime npm deps — both CLIs and the module state this contract), `node --test`, `tests/helpers/git-fixtures.js` (`gitRepo()`, `linkedWorktreeOf()`).

**Spec:** `.claude-tweaks/pipelines/2026-08-20T153031-spec-1065/work/1065-spec.md` (materialized from GitHub issue #1065)

## Global Constraints

- Zero runtime npm dependencies — no new `require` outside Node built-ins and existing repo modules.
- Every commit message references the record as `refs #1065` — never `closes`/`fixes` (the PR body owns the closing keyword).
- Worktree: `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-1065`, branch `worktree-flow-spec-1065`. All commands run there. One plain command per Bash call (worktree sessions refuse compound `;`/loops; 2-command `&&` chains are OK). For multi-step shell logic, Write a script file and run it.
- The raw `runDir` candidate string stays in each CLI's local variable for all downstream use — the guard's resolved path is used only for the check and its message ("behaves exactly as today" is literal).
- Match surrounding file style: comment density like the module's existing headers; no speculative abstraction.

## Verified current state (2026-08-20, branch tip 77ef8c73)

- `plugin/bin/lib/hooks/worktree-detect.js` exports `nearestExistingDir, repoInfo, findPolicyFile, safeReal, mainCheckoutRoot, isAnchoredUnderRoot, unanchoredRunDirNoRepoMessage, unanchoredRunDirShadowMessage` (lines 201-204). `unanchoredRunDirShadowMessage(runDirArg, mainRoot)` hardcodes the `--run-dir` spelling (line 197-199). `mainCheckoutRoot` returns null for BOTH "no repo" and "unparseable `.git`" (its header comment, lines 44-48) — the predicate must NOT use it as the inside-a-checkout test.
- `plugin/bin/resolve-profile.js`: arg loop ends line 100; tally path composed line 114; tally append lines 134-141; `fail()` = stderr + exit 1.
- `plugin/bin/resolve-policy.js`: arg loop ends line 73; four flag-conflict `fail()` checks lines 74-91; `if (runDir !== null)` `statSync` block lines 92-103; `fail()` = stderr + exit 1. Its injectable `gitRoot` runner seam (lines 36-41) serves `resolvePolicyConfig`'s repo-root resolution and is untouched by this plan.
- Strict-guard family members using the message helpers: `hooks.js`, `wrap-up-engine.js`, `materialize.js`, `apply-refine-labels.js` (grep-verified). No test pins the helpers' exact message text (regex matches like `/resolves outside the main checkout/i` only).
- `tests/hooks-worktree-detect.test.js` is the module's suite; imports `{ gitRepo, linkedWorktreeOf }` from `./helpers/git-fixtures`.
- `tests/materialize-run-dir-anchoring.test.js` is the CLI-anchoring test pattern to mirror (naming convention shared with `tests/apply-refine-labels-run-dir-anchoring.test.js`).
- `tests/resolve-policy-cli.test.js`'s `makeFixtureRepo` builds a **plain temp dir, not a git repo** — its `--run {tmp}/run` paths are outside any checkout and are ACCEPTED by the new rule; that suite must keep passing unchanged.
- `tests/pipeline-run-dir-adoption-anchoring.test.js` pins only `pipeline-run-dir.md`'s "## Bash snippet (resolution)" section — NOT the third-guard paragraph. The Task 4 prose edit needs no pin update (the spec's Deliverable anticipated one; live state says none is required — record this in the task's commit message).
- The third-guard paragraph is `plugin/skills/_shared/pipeline-run-dir.md` lines 126-144; the holdout sentence ("known unguarded holdouts, tracked in #853") is lines 140-142. #853 is closed, superseded by #1065.

---

### Task 1: `checkRunDirAnchoredOrOutside` predicate + message-helper flag parameter

**Files:**
- Modify: `plugin/bin/lib/hooks/worktree-detect.js` (add predicate before the message helpers; widen `unanchoredRunDirShadowMessage`; update the helpers' header comment)
- Test: `tests/hooks-worktree-detect.test.js` (append a new test group)

**Interfaces:**
- Produces: `checkRunDirAnchoredOrOutside(candidate, cwd)` → `{ ok: true, resolved }` | `{ ok: false, reason: 'foreign-checkout', resolved, mainRoot }` | `{ ok: false, reason: 'no-repo-root', resolved }`. Consumed by Tasks 2 and 3.
- Produces: `unanchoredRunDirShadowMessage(runDirArg, mainRoot, flag = '--run-dir')` — third parameter optional; the four existing 2-arg call sites are byte-identical in output.

- [ ] **Step 1: Write the failing tests** — append to `tests/hooks-worktree-detect.test.js` (add `checkRunDirAnchoredOrOutside, unanchoredRunDirShadowMessage` to the existing require):

```js
test('checkRunDirAnchoredOrOutside: anchored under main checkout accepts, from main cwd and from linked-worktree cwd', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  const target = path.join(main, '.claude-tweaks', 'pipelines', 'r1');
  assert.strictEqual(checkRunDirAnchoredOrOutside(target, main).ok, true);
  assert.strictEqual(checkRunDirAnchoredOrOutside(target, wt).ok, true, 'production shape: worktree cwd + main-anchored run dir');
});

test('checkRunDirAnchoredOrOutside: path outside any checkout accepts (existence-independent)', () => {
  const main = gitRepo();
  const outside = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wtd-outside-')), 'mp-journey');
  const r = checkRunDirAnchoredOrOutside(outside, main);
  assert.strictEqual(r.ok, true);
});

test('checkRunDirAnchoredOrOutside: bare relative path from linked-worktree cwd rejects as foreign-checkout', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  const r = checkRunDirAnchoredOrOutside(path.join('.claude-tweaks', 'pipelines', 'r1'), wt);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'foreign-checkout');
  assert.strictEqual(r.mainRoot, safeReal(main));
});

test('checkRunDirAnchoredOrOutside: absolute path inside a linked worktree rejects as foreign-checkout', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  const r = checkRunDirAnchoredOrOutside(path.join(wt, '.claude-tweaks', 'pipelines', 'r1'), main);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'foreign-checkout');
});

test('checkRunDirAnchoredOrOutside: path inside an unrelated second repo rejects as foreign-checkout', () => {
  const main = gitRepo();
  const other = gitRepo();
  const r = checkRunDirAnchoredOrOutside(path.join(other, 'run'), main);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'foreign-checkout');
});

test('checkRunDirAnchoredOrOutside: submodule-style .git FILE ancestor counts as inside a checkout, not outside', () => {
  const main = gitRepo();
  const fake = fs.mkdtempSync(path.join(os.tmpdir(), 'wtd-subm-'));
  fs.writeFileSync(path.join(fake, '.git'), 'gitdir: ../somewhere/.git/modules/x\n'); // unparseable as worktree admin — mainCheckoutRoot(fake) is null
  const r = checkRunDirAnchoredOrOutside(path.join(fake, 'run'), main);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'foreign-checkout');
});

test('checkRunDirAnchoredOrOutside: no-repo-root cwd with path inside some checkout rejects with the distinct reason', () => {
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'wtd-norepo-'));
  const repo = gitRepo();
  const r = checkRunDirAnchoredOrOutside(path.join(repo, 'run'), bare);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'no-repo-root');
});

test('checkRunDirAnchoredOrOutside: symlinked alias of the main checkout classifies by real location (accepts)', () => {
  const main = gitRepo();
  const aliasParent = fs.mkdtempSync(path.join(os.tmpdir(), 'wtd-alias-'));
  const alias = path.join(aliasParent, 'alias');
  fs.symlinkSync(main, alias);
  const r = checkRunDirAnchoredOrOutside(path.join(alias, '.claude-tweaks', 'pipelines', 'r1'), main);
  assert.strictEqual(r.ok, true, 'realpath normalization: alias resolves into the anchored main checkout');
});

test('checkRunDirAnchoredOrOutside: unreadable ancestor fails closed (rejects), never classifies outside', () => {
  const main = gitRepo();
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'wtd-eacces-'));
  const blocked = path.join(base, 'blocked');
  fs.mkdirSync(blocked);
  fs.chmodSync(blocked, 0o000);
  try {
    const r = checkRunDirAnchoredOrOutside(path.join(blocked, 'inner', 'run'), main);
    assert.strictEqual(r.ok, false);
  } finally {
    fs.chmodSync(blocked, 0o755);
  }
});

test('unanchoredRunDirShadowMessage: default flag spelling unchanged; explicit flag substitutes', () => {
  assert.match(unanchoredRunDirShadowMessage('x', '/root'), /^--run-dir x resolves outside the main checkout/);
  assert.match(unanchoredRunDirShadowMessage('x', '/root', '--run'), /^--run x resolves outside the main checkout/);
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `node --test tests/hooks-worktree-detect.test.js`
Expected: FAIL — `checkRunDirAnchoredOrOutside is not a function` (and the flag-param test fails on the 3-arg call producing `--run-dir`).

- [ ] **Step 3: Implement** — in `plugin/bin/lib/hooks/worktree-detect.js`, insert immediately above the message-helpers comment block (line ~185):

```js
// Anchored-or-outside classification for a --run-dir/--run CLI argument
// (#1065, the resolver-CLI half of the [IL-127] CLI-argument-boundary guard;
// the pipeline-owned binaries above use the stricter main-checkout-only rule).
// A resolved candidate lying inside ANY git checkout must be anchored under
// the main checkout resolved from `cwd`; a candidate outside any checkout
// (journey/demo dirs under /tmp, tmp-root test fixtures) is accepted as-is.
//
// The inside-a-checkout test is "the walk-up found any `.git` entry, file or
// directory, regardless of parseability" — deliberately NOT
// `mainCheckoutRoot(resolved) !== null`, whose null conflates "no repo" with
// "unparseable .git" (submodule pointer, unreadable ancestor) and would
// silently ACCEPT a shadow path. "Outside" requires a completed walk to the
// filesystem root finding no .git and no error; any walk error fails closed
// to a rejection. The candidate is realpath'd via its nearest existing
// ancestor first, so a symlinked alias (macOS /tmp -> /private/tmp) is
// classified by its real location.
function scanForGitAncestor(p) {
  let dir = nearestExistingDir(p);
  if (!dir) return 'error';
  while (dir) {
    let st = null;
    try {
      st = fs.statSync(path.join(dir, '.git'));
    } catch (e) {
      if (!e || e.code !== 'ENOENT') return 'error';
    }
    if (st) return 'found';
    const parent = path.dirname(dir);
    if (parent === dir) return 'none';
    dir = parent;
  }
  return 'none';
}

function checkRunDirAnchoredOrOutside(candidate, cwd) {
  const resolvedRaw = path.resolve(cwd, candidate);
  const near = nearestExistingDir(resolvedRaw);
  const nearReal = near ? safeReal(near) : null;
  if (!nearReal) return { ok: false, reason: 'no-repo-root', resolved: resolvedRaw };
  const resolved = path.join(nearReal, path.relative(near, resolvedRaw));
  const mainRoot = mainCheckoutRoot(cwd);
  if (mainRoot && isAnchoredUnderRoot(resolved, mainRoot)) return { ok: true, resolved };
  const scan = scanForGitAncestor(resolved);
  if (scan === 'none') return { ok: true, resolved };
  if (scan === 'found' && mainRoot) return { ok: false, reason: 'foreign-checkout', resolved, mainRoot };
  return { ok: false, reason: 'no-repo-root', resolved };
}
```

Change `unanchoredRunDirShadowMessage` to:

```js
function unanchoredRunDirShadowMessage(runDirArg, mainRoot, flag = '--run-dir') {
  return `${flag} ${runDirArg} resolves outside the main checkout (${mainRoot}) — refusing a worktree-relative shadow run dir; see resolve-run-dir`;
}
```

Update the message-helpers header comment's call-site list to read: `hooks.js's resolveRunArg, materialize.js, wrap-up-engine.js, apply-refine-labels.js, and — via checkRunDirAnchoredOrOutside's anchored-or-outside rule — resolve-profile.js and resolve-policy.js`. Add `checkRunDirAnchoredOrOutside` to `module.exports`.

- [ ] **Step 4: Run the module suite to verify it passes**

Run: `node --test tests/hooks-worktree-detect.test.js`
Expected: PASS (all pre-existing tests plus the new group).

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/hooks/worktree-detect.js tests/hooks-worktree-detect.test.js
git commit -m "Add checkRunDirAnchoredOrOutside predicate + shadow-message flag param — refs #1065"
```

---

### Task 2: Guard `resolve-profile.js --run-dir`

**Files:**
- Modify: `plugin/bin/resolve-profile.js` (require + guard after the arg loop, line ~100)
- Test: Create `tests/resolve-profile-run-dir-anchoring.test.js`

**Interfaces:**
- Consumes: Task 1's `checkRunDirAnchoredOrOutside`, `unanchoredRunDirShadowMessage` (2-arg — `--run-dir` is this CLI's flag), `unanchoredRunDirNoRepoMessage`.

- [ ] **Step 1: Write the failing tests** — create `tests/resolve-profile-run-dir-anchoring.test.js`:

```js
// tests/resolve-profile-run-dir-anchoring.test.js
//
// #1065: bin/resolve-profile.js's --run-dir had zero anchoring validation —
// the anchored-or-outside half of the [IL-127] CLI-argument-boundary guard
// (tests/materialize-run-dir-anchoring.test.js covers the strict half).
// The CLI has no deps seam, so these tests spawn the real binary with cwd
// set per fixture and assert on exit code, stderr, and tally side effects.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { gitRepo, linkedWorktreeOf } = require('./helpers/git-fixtures');

const CLI = path.join(__dirname, '..', 'plugin', 'bin', 'resolve-profile.js');

function runCli(args, cwd) {
  try {
    const stdout = execFileSync(process.execPath, [CLI, ...args], {
      cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, CLAUDE_CODE_SESSION_ID: '' },
      timeout: 30000,
    });
    return { status: 0, stdout, stderr: '' };
  } catch (e) {
    return { status: e.status, stdout: e.stdout || '', stderr: e.stderr || '' };
  }
}

test('accept: main-anchored --run-dir from linked-worktree cwd (production shape)', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  const runDir = path.join(main, '.claude-tweaks', 'pipelines', 'r1');
  fs.mkdirSync(runDir, { recursive: true });
  const res = runCli(['standard', '--run-dir', runDir], wt);
  assert.strictEqual(res.status, 0, res.stderr);
  assert.ok(JSON.parse(res.stdout).model, 'still resolves a model');
});

test('accept: --run-dir outside any checkout (journey shape) — tally readable/appendable there', () => {
  const main = gitRepo();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'rp-journey-'));
  const res = runCli(['frontier', '--run-dir', outside], main);
  assert.strictEqual(res.status, 0, res.stderr);
  const out = JSON.parse(res.stdout);
  if (out.model === 'fable') {
    assert.ok(fs.existsSync(path.join(outside, 'frontier-tally.log')), 'tally written outside as before');
  }
});

test('reject: bare relative --run-dir from linked-worktree cwd — exit 1, no tally anywhere', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  const res = runCli(['frontier', '--run-dir', path.join('.claude-tweaks', 'pipelines', 'r1')], wt);
  assert.strictEqual(res.status, 1);
  assert.match(res.stderr, /resolves outside the main checkout/);
  assert.match(res.stderr, /--run-dir /);
  assert.ok(!fs.existsSync(path.join(wt, '.claude-tweaks', 'pipelines', 'r1', 'frontier-tally.log')), 'reject fires before any tally I/O');
});

test('reject: absolute --run-dir inside a linked worktree', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  const res = runCli(['standard', '--run-dir', path.join(wt, '.claude-tweaks', 'pipelines', 'r1')], main);
  assert.strictEqual(res.status, 1);
  assert.match(res.stderr, /resolves outside the main checkout/);
});

test('reject: --run-dir inside a genuinely unrelated second repo (AC 10)', () => {
  const main = gitRepo();
  const other = gitRepo();
  const res = runCli(['standard', '--run-dir', path.join(other, 'run')], main);
  assert.strictEqual(res.status, 1);
  assert.match(res.stderr, /resolves outside the main checkout/);
});

test('reject: no-repo-root cwd with --run-dir inside some checkout — distinct message (AC 6, fixture per AC 12)', () => {
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'rp-norepo-'));
  const repo = gitRepo();
  const res = runCli(['standard', '--run-dir', path.join(repo, 'run')], bare);
  assert.strictEqual(res.status, 1);
  assert.match(res.stderr, /could not determine the git repository root/);
  assert.doesNotMatch(res.stderr, /resolves outside the main checkout/);
});

test('accept: symlinked tmpdir spelling classifies by real location (AC 11)', () => {
  const main = gitRepo();
  const realOutside = fs.mkdtempSync(path.join(os.tmpdir(), 'rp-sym-'));
  const aliasParent = fs.mkdtempSync(path.join(os.tmpdir(), 'rp-symparent-'));
  const alias = path.join(aliasParent, 'alias');
  fs.symlinkSync(realOutside, alias);
  const res = runCli(['standard', '--run-dir', path.join(alias, 'r')], main);
  assert.strictEqual(res.status, 0, res.stderr);
});
```

- [ ] **Step 2: Run to verify the reject cases fail**

Run: `node --test tests/resolve-profile-run-dir-anchoring.test.js`
Expected: FAIL — the four reject tests get exit 0 (no guard yet); accept tests already pass.

- [ ] **Step 3: Implement** — in `plugin/bin/resolve-profile.js`: add near the other requires (line ~44): `const wtDetect = require('./lib/hooks/worktree-detect');`. Immediately after the arg `while` loop (line ~100), before the policy read:

```js
  // #1065: anchored-or-outside guard — reject a worktree-shadow run dir
  // before any policy read or tally I/O. Outside-any-checkout paths (the
  // journey's /tmp demo, tmp-fixture tests) stay accepted with no flag; the
  // raw runDir string is kept for all downstream use.
  if (runDir !== undefined) {
    const anchor = wtDetect.checkRunDirAnchoredOrOutside(runDir, process.cwd());
    if (!anchor.ok) {
      fail(anchor.reason === 'foreign-checkout'
        ? wtDetect.unanchoredRunDirShadowMessage(runDir, anchor.mainRoot)
        : wtDetect.unanchoredRunDirNoRepoMessage(process.cwd()));
      return;
    }
  }
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test tests/resolve-profile-run-dir-anchoring.test.js`
Expected: PASS (7 tests). Also run: `node --test tests/resolve-profile-invocation-conformance.test.js` — Expected: PASS (unchanged).

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/resolve-profile.js tests/resolve-profile-run-dir-anchoring.test.js
git commit -m "Guard resolve-profile.js --run-dir with anchored-or-outside check — refs #1065"
```

---

### Task 3: Guard `resolve-policy.js --run`

**Files:**
- Modify: `plugin/bin/resolve-policy.js` (require + guard before the existing `statSync` block, line ~92)
- Test: Create `tests/resolve-policy-run-dir-anchoring.test.js`

**Interfaces:**
- Consumes: Task 1's predicate and helpers; `unanchoredRunDirShadowMessage(runDir, mainRoot, '--run')` — the 3-arg form (this CLI's flag is `--run`).

- [ ] **Step 1: Write the failing tests** — create `tests/resolve-policy-run-dir-anchoring.test.js` (same spawn helper shape as Task 2's, `CLI` pointing at `plugin/bin/resolve-policy.js`; no `CLAUDE_CODE_SESSION_ID` handling needed):

```js
// tests/resolve-policy-run-dir-anchoring.test.js
//
// #1065: bin/resolve-policy.js's --run had only an existence check — the
// anchored-or-outside guard now runs BEFORE it (and before any config.yml
// read). Existing behavior for accepted-shape paths is pinned unchanged,
// including the nonexistent-dir exit-1 message.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { gitRepo, linkedWorktreeOf } = require('./helpers/git-fixtures');

const CLI = path.join(__dirname, '..', 'plugin', 'bin', 'resolve-policy.js');

function runCli(args, cwd) {
  try {
    const stdout = execFileSync(process.execPath, [CLI, ...args], {
      cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000,
    });
    return { status: 0, stdout, stderr: '' };
  } catch (e) {
    return { status: e.status, stdout: e.stdout || '', stderr: e.stderr || '' };
  }
}

test('accept: main-anchored --run from linked-worktree cwd; config overlay still read', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  const runDir = path.join(main, '.claude-tweaks', 'pipelines', 'r1');
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, 'config.yml'), 'autonomy: trusted\n');
  const res = runCli(['--run', runDir, 'autonomy'], wt);
  assert.strictEqual(res.status, 0, res.stderr);
  assert.deepStrictEqual(JSON.parse(res.stdout).autonomy, { value: 'trusted', source: 'run-config' });
});

test('accept: --run outside any checkout; nonexistent dir still exits 1 with the pre-existing message (AC 5)', () => {
  const main = gitRepo();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'rpol-out-'));
  const ok = runCli(['--run', outside, 'autonomy'], main);
  assert.strictEqual(ok.status, 0, ok.stderr);
  const missing = runCli(['--run', path.join(outside, 'no-such'), 'autonomy'], main);
  assert.strictEqual(missing.status, 1);
  assert.match(missing.stderr, /does not exist or is not a directory/);
});

test('reject: bare relative --run from linked-worktree cwd, before any config read', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  const shadow = path.join(wt, '.claude-tweaks', 'pipelines', 'r1');
  fs.mkdirSync(shadow, { recursive: true });
  fs.writeFileSync(path.join(shadow, 'config.yml'), 'autonomy: unattended\n');
  const res = runCli(['--run', path.join('.claude-tweaks', 'pipelines', 'r1'), 'autonomy'], wt);
  assert.strictEqual(res.status, 1);
  assert.match(res.stderr, /--run .*resolves outside the main checkout/);
  assert.strictEqual(res.stdout, '', 'no JSON — rejected before resolution');
});

test('reject: absolute --run inside a linked worktree', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  const res = runCli(['--run', path.join(wt, '.claude-tweaks', 'pipelines', 'r1'), 'autonomy'], main);
  assert.strictEqual(res.status, 1);
  assert.match(res.stderr, /resolves outside the main checkout/);
});

test('reject: --run inside an unrelated second repo (AC 10)', () => {
  const main = gitRepo();
  const other = gitRepo();
  const res = runCli(['--run', path.join(other, 'run'), 'autonomy'], main);
  assert.strictEqual(res.status, 1);
  assert.match(res.stderr, /resolves outside the main checkout/);
});

test('reject: no-repo-root cwd with --run inside some checkout — distinct message (AC 6)', () => {
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'rpol-norepo-'));
  const repo = gitRepo();
  const res = runCli(['--run', path.join(repo, 'run'), 'autonomy'], bare);
  assert.strictEqual(res.status, 1);
  assert.match(res.stderr, /could not determine the git repository root/);
  assert.doesNotMatch(res.stderr, /resolves outside the main checkout/);
});
```

- [ ] **Step 2: Run to verify the reject cases fail**

Run: `node --test tests/resolve-policy-run-dir-anchoring.test.js`
Expected: FAIL — reject tests see exit 0 (or the wrong path accepted); the two accept tests pass.

- [ ] **Step 3: Implement** — in `plugin/bin/resolve-policy.js`: add near the other requires: `const wtDetect = require('./lib/hooks/worktree-detect');`. Insert immediately BEFORE the existing `if (runDir !== null) {` `statSync` block (line ~92) — i.e. after all four flag-conflict/usage checks, preserving their failure precedence:

```js
  // #1065: anchored-or-outside guard — runs after the flag-conflict checks
  // (their precedence is unchanged) and before the existence check and any
  // config.yml read. The raw runDir string is kept downstream, so the
  // pre-existing "does not exist" message echoes the value as given.
  if (runDir !== null) {
    const anchor = wtDetect.checkRunDirAnchoredOrOutside(runDir, process.cwd());
    if (!anchor.ok) {
      fail(anchor.reason === 'foreign-checkout'
        ? wtDetect.unanchoredRunDirShadowMessage(runDir, anchor.mainRoot, '--run')
        : wtDetect.unanchoredRunDirNoRepoMessage(process.cwd()));
      return;
    }
  }
```

- [ ] **Step 4: Run to verify pass, plus the existing CLI suite**

Run: `node --test tests/resolve-policy-run-dir-anchoring.test.js`
Expected: PASS (6 tests).
Run: `node --test tests/resolve-policy-cli.test.js`
Expected: PASS unchanged — its fixtures are plain temp dirs (outside any checkout), accepted by the new rule.

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/resolve-policy.js tests/resolve-policy-run-dir-anchoring.test.js
git commit -m "Guard resolve-policy.js --run with anchored-or-outside check — refs #1065"
```

---

### Task 4: Rewrite the third-guard paragraph in `_shared/pipeline-run-dir.md`

**Files:**
- Modify: `plugin/skills/_shared/pipeline-run-dir.md:126-144` (the "A third guard sits at the **CLI-argument boundary**" paragraph through the holdout sentence)

**Interfaces:** none (prose only; no test pins this paragraph — verified, see "Verified current state").

- [ ] **Step 1: Replace the paragraph** (lines 126-144, ending at "…legitimate unanchored use.") with:

```markdown
A third guard sits at the **CLI-argument boundary** — the one path neither of the two above
covers, a run directory handed to a binary explicitly on the command line rather than inherited
or created. Two rules live at this boundary, split by whether the binary has a documented
legitimate run directory outside the repository:

- **Pipeline-owned binaries** — `bin/hooks.js` (`resolveRunArg`, `--run`), `bin/wrap-up-engine.js`
  (`main`, `--run-dir`), `bin/materialize.js` (`run`, `--run-dir`), and `bin/apply-refine-labels.js`
  (`--run`) — have no such use: each resolves `mainCheckoutRoot()`/`isAnchoredUnderRoot()` from
  `bin/lib/hooks/worktree-detect.js` and refuses any value not anchored under the main checkout
  **before any filesystem write**, with exit code 2 (malformed invocation).
- **Resolver CLIs with a documented sandbox use** — `bin/resolve-profile.js` (`--run-dir`) and
  `bin/resolve-policy.js` (`--run`), whose journey and test invocations legitimately point outside
  any checkout (`docs/journeys/resolve-dispatch-model-profile.md`'s `/tmp/mp-journey`) — apply the
  **anchored-or-outside** rule via `worktree-detect.js`'s `checkRunDirAnchoredOrOutside()`: a
  resolved path inside any git checkout must be anchored under the main checkout resolved from
  cwd; a path outside any checkout is accepted as-is, no flag needed. Rejection exits 1, these
  CLIs' documented invocation-failure code — a deliberate, stated deviation from the family's
  exit 2.

Both rules keep the two failure modes distinct in the message — "resolves outside the main
checkout" (a worktree-relative shadow) versus "could not determine the git repository root" (no
repo at all); collapsing them sends a reader hunting for the wrong problem — and both are
existence-independent (the walk-up runs against whichever ancestor directory exists), so they
hold for a path about to be created as well as one that already exists. The run-directory
argument reaches the check through the CLI's own `deps` seam where the binary has one — a guard
added later that reads `process.cwd()` or `worktree-detect` directly re-opens the hole the seam
exists to close. **A new `bin/*.js` that accepts a run-directory argument owes one of these two
guards** (`[IL-127]`) — the strict rule by default; anchored-or-outside only when a documented
legitimate outside-repo use exists, as it did for the two resolver CLIs (#1065).
```

Before writing, re-read the live lines (`sed -n 126,146p plugin/skills/_shared/pipeline-run-dir.md`) — concurrent records (#1017, #280) may have shifted line numbers; anchor the edit on the paragraph text, not the numbers. Verify `apply-refine-labels.js`'s flag spelling (`--run`) against its own `parseArgs` before committing the list.

- [ ] **Step 2: Verify no conformance test breaks**

Run: `node --test tests/pipeline-run-dir-adoption-anchoring.test.js`
Expected: PASS (it pins only the Bash snippet section).
Run: `grep -rn "unguarded holdouts" plugin/ tests/`
Expected: zero matches in shipped skill prose and tests (this plan file under `docs/superpowers/plans/` quotes the phrase and is exempt — it is deleted at wrap-up).

- [ ] **Step 3: Commit**

```bash
git add plugin/skills/_shared/pipeline-run-dir.md
git commit -m "Document the two-rule CLI-argument-boundary guard split; drop the holdout sentence — refs #1065 (no pin update needed: the paragraph is not test-pinned)"
```

---

### Task 5: Revert-discrimination proof + full suite

**Files:**
- Create (throwaway, scratchpad — never committed): `discrimination-check.sh`

- [ ] **Step 1: Prove the new reject tests discriminate (AC 8)** — Write this script to the session scratchpad directory and run it with `bash <script>` from the worktree root; it temporarily restores the pre-guard CLI files from the materialize commit's tree, runs the two new suites (expect failures), and restores HEAD in the same script run:

```bash
#!/bin/bash
# AC 8: with only the two CLI guard call sites reverted, the new reject tests must FAIL.
set -u
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-1065"
BASE=$(git log --grep="Materialize spec for record #1065" --format=%H -n 1)   # verified at authoring: 7c167c77
git show "${BASE}:plugin/bin/resolve-profile.js" > plugin/bin/resolve-profile.js
git show "${BASE}:plugin/bin/resolve-policy.js" > plugin/bin/resolve-policy.js
node --test tests/resolve-profile-run-dir-anchoring.test.js tests/resolve-policy-run-dir-anchoring.test.js > /dev/null 2>&1
RC=$?
git checkout HEAD -- plugin/bin/resolve-profile.js plugin/bin/resolve-policy.js
if [ "$RC" -ne 0 ]; then echo "DISCRIMINATES: suites fail without the guard (exit $RC), restored HEAD"; else echo "VACUOUS: suites passed without the guard — tests do not discriminate"; fi
git status --porcelain -- plugin/bin/resolve-profile.js plugin/bin/resolve-policy.js
```

Expected output: `DISCRIMINATES: …` and empty `git status` for the two files (restored).

- [ ] **Step 2: Full suite**

Run: `npm test` (redirect to a scratchpad file; grep the tail for `# fail 0`)
Expected: PASS in full — same green as the run-start baseline (5290 tests at tip 77ef8c73, plus this plan's additions).

- [ ] **Step 3: Verify working tree clean and log**

Run: `git status --porcelain`
Expected: empty (the discrimination script restored everything; the scratchpad script lives outside the repo).

No commit in this task (nothing to commit); it gates the build phase's exit.
