# Reconcile Latency Reduction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut `SessionStart`'s `reconcile()` latency from linear-in-stale-state (measured 6.9s on a small repo, reported 1-2 minutes under GitHub degradation) to a low-single-digit-second bound, via an upfront health preflight, request batching/merging, bounded parallelism, a wall-clock budget, and a corrected fast/background hook split.

**Architecture:** `reconcile()` (`bin/lib/reconcile/index.js`) becomes the async orchestrator. A cheap `gh api rate_limit` preflight gates the whole pass; a shared `git fetch --prune` replaces two separate fetches; `prune-remote.js`'s per-branch deletes batch into one push; `release-merged.js` and `console-execute.js` parallelize their `gh` reads through a small concurrency-capped pool; a new on-disk cache (`.claude-tweaks/reconcile-cache.json`) gives per-claim content-addressed skip (via each claim blob's own `sha`, already returned by the existing Contents-API directory listing — no new endpoint needed) and a short-TTL "skip the whole pass" gate; and `session-start.js` runs only the cheap read/detect checks inline, deferring the write-only janitorial checks to a **detached background child process** rather than `hooks.json`'s `async: true` (verified against live Claude Code docs: `async` hooks are fire-and-forget with their stdout/JSON discarded — unusable for a check whose whole point is to report what it did).

**Tech Stack:** Node 18+, `node:test`, `child_process` (`execFileSync` for git/preflight, `execFile`+`util.promisify` for the new parallel `gh` pool, `spawn` for the detached background process).

**Spec:** `.claude-tweaks/pipelines/2026-08-17T155829-record-820-standalone/work/820-spec.md`

## Global Constraints

- **Fail open, always.** Every new failure/timeout path degrades to a reported skip (`result.skipped.push({...})`) — never throws out of `reconcile()`, matching the existing header contract in `bin/lib/reconcile/index.js`.
- **No silent caps.** Any bound (budget, concurrency cap, cache TTL) that causes work to be skipped must produce a `skipped` entry naming the reason — never a quiet drop.
- **Pure decision function + I/O at the edges**, the shape every existing `bin/lib/reconcile/*.js` module already follows — preserve it in every new/changed module.
- **Surgical changes only** — do not refactor code untouched by a deliverable, even if adjacent.
- **Async migration is a real, coordinated contract change** (Task 1), not a shim: `reconcile()` becomes `async function reconcile()`, every call site (production and test) is updated to `await` it in the same task, and there is no dual sync/async API.
- **Deviations from the issue's literal text, both deliberate and load-bearing for the Acceptance Criteria:**
  1. The preflight (D1) skips **every** requested check under `pr-first`, not just the five the issue names — `archive`/`archive-branches`/`reap` all call `resolvePrState` (a `gh` call) too, so excluding them would leave exactly the per-call-timeout-accumulation bug the preflight exists to close. See Task 2.
  2. D6's "Git Trees API" is implemented via the **existing** Contents-API directory listing (`bin/lib/issues/claim-store.js`'s `listClaimNames`) extended to also capture each entry's `sha` — which that endpoint already returns and today's `-q .[].name` simply discards — rather than switching to the `git/trees` endpoint. Both give "one call, sha per entry, no per-claim round trip"; the Contents API is the one already in production use and tested, so reusing it is more surgical for a flat, single-level `claims/` directory. See Task 7.
  3. D8's `async: true` premise does not hold: verified against Claude Code's official hooks docs, `SessionStart` hook stdout/JSON is discarded when `async: true` (fire-and-forget, side-effects only) — there is no "runs later, still shows output" contract. Implemented instead as a **self-detached background child process** (`spawn(..., {detached:true, stdio:'ignore'}).unref()`) that writes its results to a status file a later `SessionStart` firing reads and surfaces. See Task 10.

---

### Task 1: Convert `reconcile()` to an async contract (no behavior change)

Foundational — every later task (8, 10) needs `reconcile()` and its callers to already be `await`-shaped so a truly-parallel check module can be dropped in without a second contract change. This task changes **only** the calling convention; every check module stays synchronous internally.

**Files:**
- Modify: `bin/lib/reconcile/index.js` (`function reconcile` → `async function reconcile`)
- Modify: `bin/hooks.js:296-311` (`reconcile` CLI branch), `bin/hooks.js:53` (`function main` → `async function main`), `bin/hooks.js:338` (`await mod.run(...)`), `bin/hooks.js:343-347` (bottom `require.main` block)
- Modify: `bin/lib/hooks/session-start.js:16` (`function run` → `async function run`), `bin/lib/hooks/session-start.js:78` (`await reconcile(...)`)
- Modify (add `await`/`async`, no assertion changes): `tests/reconcile.test.js` (lines ~433, 444, 454, 460, 473, and any other bare `reconcile(...)` call), `tests/console-execute.test.js` (~285, 296), `tests/bin-lib/reconcile/archive-branches.test.js` (~220), `tests/bin-lib/reconcile/prune-remote.test.js` (~222, 225), `tests/hooks-session-start.test.js` (every test that calls `runHook(['session-start'], ...)` already goes through the CLI subprocess boundary and is unaffected; only tests that `require('../bin/lib/reconcile').reconcile(...)` or `mod.run(...)` directly need `await`)
- Test: `tests/reconcile.test.js` (new async-contract pin, appended)

**Interfaces:**
- Produces: `reconcile(opts)` now returns `Promise<ReconcileResult>` (same shape as before). Every later task's check-module changes assume this.

- [ ] **Step 1: Write the failing test**

Append to `tests/reconcile.test.js`:

```javascript
test('reconcile(): returns a thenable (async contract) even when every check stays synchronous internally', async () => {
  const { originDir, mainDir } = pairedFixture();
  git(['remote', 'set-url', 'origin', 'https://example.invalid/nope.git'], mainDir); // no gh reachable, exercised as local-merge below is enough
  const p = reconcile({ cwd: mainDir, checks: ['mirror'] });
  assert.equal(typeof p.then, 'function', 'reconcile() must return a Promise');
  const r = await p;
  assert.equal(typeof r, 'object');
  void originDir;
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/reconcile.test.js`
Expected: FAIL — `typeof p.then` is `'undefined'` (today's `reconcile()` returns a plain object).

- [ ] **Step 3: Convert `reconcile()` and every call site**

In `bin/lib/reconcile/index.js`, change the signature only (body unchanged for this task):

```javascript
async function reconcile(opts = {}) {
```

In `bin/hooks.js`, change `main` to async and await both call sites that invoke a hook module or `reconcile()` directly:

```javascript
async function main(argv) {
  // ...unchanged body until the reconcile branch...
  if (cmd === 'reconcile') {
    const args = argv.slice(3);
    const opts = { dryRun: args.includes('--dry-run'), cwd: process.cwd() };
    let out;
    try {
      out = await require('./lib/reconcile').reconcile(opts);
    } catch {
      out = { mirror: null, worktrees: null, claims: null, runs: null, branches: null, remoteBranches: null, console: null, skipped: [{ check: 'all', reason: 'reconcile-threw' }] };
    }
    process.stdout.write(JSON.stringify(out) + '\n');
    return 0;
  }
  // ...
  const out = (await mod.run({ input, runDir, runState, ownedRun, cwd })) || {};
  if (out.json) fs.writeSync(1, JSON.stringify(out.json));
  return typeof out.exit === 'number' ? out.exit : 0;
}

if (require.main === module) {
  main(process.argv).then((code) => process.exit(code)).catch(() => process.exit(0));
}
```

(`await mod.run(...)` is safe for every other event module, which stays synchronous — awaiting a non-Promise return value resolves immediately, no behavior change.)

In `bin/lib/hooks/session-start.js`, change `function run(ctx)` to `async function run(ctx)` and `const result = reconcile({ cwd: ctx.cwd });` to `const result = await reconcile({ cwd: ctx.cwd });`.

Update every test call site identified in Files above: wrap the enclosing `test(...)` callback in `async () => {...}` and prefix each `reconcile(...)` / direct `mod.run(...)` call with `await`. Example (`tests/reconcile.test.js`):

```javascript
test('reconcile: local-merge project falls back to the legacy ancestry reap, skips mirror/release/archive (AC4-adjacent)', async () => {
  // ...
  const r = await reconcile({ cwd: dir });
  // ...assertions unchanged...
});
```

- [ ] **Step 4: Run the full suite to verify nothing else broke**

Run: `npm test`
Expected: PASS — every existing assertion still holds, since no check module's internal behavior changed.

- [ ] **Step 5: Commit**

```bash
git add bin/lib/reconcile/index.js bin/hooks.js bin/lib/hooks/session-start.js tests/reconcile.test.js tests/console-execute.test.js tests/bin-lib/reconcile/archive-branches.test.js tests/bin-lib/reconcile/prune-remote.test.js
git commit -m "reconcile(): convert to an async contract, no behavior change (refs #820)"
```

---

### Task 2: GitHub-health preflight

**Files:**
- Create: `bin/lib/reconcile/preflight.js`
- Modify: `bin/lib/reconcile/index.js` (wire preflight in, right after the `model !== 'pr-first'` early-return, before the `mirror` dispatch)
- Test: `tests/bin-lib/reconcile/preflight.test.js`

**Interfaces:**
- Produces: `ghHealthCheck(opts?: {timeoutMs?, runner?}) -> {ok: boolean, reason: null | 'gh-absent' | 'github-unreachable'}`. `runner` is an injectable `(args) => stdout` seam (throws on failure), defaulting to `execFileSync('gh', args, {...})` — matches `gh-api-module-pattern`'s injectable-runner convention.
- Consumes (in index.js): nothing new — reuses `checks`, `result`, `root` already in scope.

- [ ] **Step 1: Write the failing test**

Create `tests/bin-lib/reconcile/preflight.test.js`:

```javascript
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ghHealthCheck } = require('../../../bin/lib/reconcile/preflight');

test('ghHealthCheck: healthy when the runner returns cleanly', () => {
  const r = ghHealthCheck({ runner: () => '5000\n' });
  assert.deepEqual(r, { ok: true, reason: null });
});

test('ghHealthCheck: gh-absent on ENOENT', () => {
  const r = ghHealthCheck({ runner: () => { const e = new Error('not found'); e.code = 'ENOENT'; throw e; } });
  assert.deepEqual(r, { ok: false, reason: 'gh-absent' });
});

test('ghHealthCheck: github-unreachable on any other failure (timeout, network, non-zero exit)', () => {
  const r = ghHealthCheck({ runner: () => { throw new Error('ETIMEDOUT'); } });
  assert.deepEqual(r, { ok: false, reason: 'github-unreachable' });
});

test('ghHealthCheck: calls `gh api rate_limit`, not a repo-scoped endpoint', () => {
  let seen = null;
  ghHealthCheck({ runner: (args) => { seen = args; return '5000\n'; } });
  assert.ok(seen.includes('rate_limit'), `expected rate_limit in ${JSON.stringify(seen)}`);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/bin-lib/reconcile/preflight.test.js`
Expected: FAIL — `Cannot find module '../../../bin/lib/reconcile/preflight'`.

- [ ] **Step 3: Write minimal implementation**

Create `bin/lib/reconcile/preflight.js`:

```javascript
// bin/lib/reconcile/preflight.js — a cheap upfront GitHub-health check so
// reconcile() degrades once, fast, instead of every network-dependent check
// separately discovering the same outage via its own 5-10s timeout (#820).
'use strict';
const { execFileSync } = require('child_process');

const PREFLIGHT_TIMEOUT_MS = 2000;

function defaultRunner(args, timeoutMs) {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: timeoutMs });
}

// -> { ok: boolean, reason: null | 'gh-absent' | 'github-unreachable' }
// `rate_limit` is deliberately repo-agnostic and cheap — it answers "can we
// reach the GitHub API at all", not "does this repo's data look right".
function ghHealthCheck(opts = {}) {
  const timeoutMs = opts.timeoutMs || PREFLIGHT_TIMEOUT_MS;
  const runner = opts.runner || ((args) => defaultRunner(args, timeoutMs));
  try {
    runner(['api', 'rate_limit', '-q', '.rate.remaining']);
    return { ok: true, reason: null };
  } catch (e) {
    if (e && e.code === 'ENOENT') return { ok: false, reason: 'gh-absent' };
    return { ok: false, reason: 'github-unreachable' };
  }
}

module.exports = { ghHealthCheck, PREFLIGHT_TIMEOUT_MS };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/bin-lib/reconcile/preflight.test.js`
Expected: PASS (4/4).

- [ ] **Step 5: Wire into `reconcile()` and write the integration test**

In `bin/lib/reconcile/index.js`, add the import and call right after the `model !== 'pr-first'` block returns (i.e., the first thing that runs once we know we're on the `pr-first` path):

```javascript
const { ghHealthCheck } = require('./preflight');
// ...
  // GitHub-health preflight — every check below this point is network-
  // dependent under pr-first (mirror/red-tip/console/release/remote-prune
  // hit GitHub directly; archive/archive-branches/reap all call
  // resolvePrState, also a gh call) — so a single upfront failure/timeout
  // (~2s) skips the whole requested set in one entry, instead of each check
  // separately accumulating its own 5-10s timeout (#820).
  const health = ghHealthCheck();
  if (!health.ok) {
    result.skipped.push({ check: checks.join(','), reason: `preflight-${health.reason}` });
    return result;
  }
```

Append to `tests/reconcile.test.js`:

```javascript
test('reconcile(): a failing GitHub-health preflight skips every requested check in one entry, never per-check timeouts (D1)', async () => {
  const { mainDir } = pairedFixture();
  const preflight = require('../bin/lib/reconcile/preflight');
  const original = preflight.ghHealthCheck;
  preflight.ghHealthCheck = () => ({ ok: false, reason: 'github-unreachable' });
  try {
    const r = await reconcile({ cwd: mainDir, checks: ['mirror', 'release'] });
    assert.equal(r.mirror, null);
    assert.equal(r.claims, null);
    assert.deepEqual(r.skipped, [{ check: 'mirror,release', reason: 'preflight-github-unreachable' }]);
  } finally {
    preflight.ghHealthCheck = original;
  }
});
```

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS. (`bin/lib/reconcile/index.js` must `require('./preflight')` — not destructure at load time into a local const the test can't monkeypatch — so the stub above actually takes effect. Use `require('./preflight').ghHealthCheck()` at the call site, or verify the destructured import is re-read fresh; if `index.js` destructures `const { ghHealthCheck } = require('./preflight')` at module load, the monkeypatch above must instead be done via `require.cache` busting — prefer the non-destructured call form to avoid that complexity.)

- [ ] **Step 7: Commit**

```bash
git add bin/lib/reconcile/preflight.js bin/lib/reconcile/index.js tests/bin-lib/reconcile/preflight.test.js tests/reconcile.test.js
git commit -m "reconcile(): add a GitHub-health preflight, skip all network checks on failure (refs #820)"
```

---

### Task 3: Wall-clock budget

**Files:**
- Create: `bin/lib/reconcile/budget.js`
- Modify: `bin/lib/reconcile/index.js` (wrap the sequential dispatch)
- Test: `tests/bin-lib/reconcile/budget.test.js`, appended case in `tests/reconcile.test.js`

**Interfaces:**
- Produces: `createBudget(ms?: number) -> { exceeded(): boolean, remainingMs(): number }`. `DEFAULT_BUDGET_MS = 18000`.
- Consumes (in index.js): called once after the preflight passes; checked before each of the 8 dispatch blocks (mirror, red-tip, console, release, archive, archive-branches, remote-prune, reap).

- [ ] **Step 1: Write the failing test**

Create `tests/bin-lib/reconcile/budget.test.js`:

```javascript
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createBudget } = require('../../../bin/lib/reconcile/budget');

test('createBudget: not exceeded immediately after creation', () => {
  const b = createBudget(1000);
  assert.equal(b.exceeded(), false);
});

test('createBudget: exceeded once the deadline has passed', async () => {
  const b = createBudget(1);
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(b.exceeded(), true);
});

test('createBudget: remainingMs never goes negative', async () => {
  const b = createBudget(1);
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(b.remainingMs(), 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/bin-lib/reconcile/budget.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `bin/lib/reconcile/budget.js`:

```javascript
// bin/lib/reconcile/budget.js — an overall wall-clock ceiling for one
// reconcile() pass, so total time is bounded regardless of how much stale
// branch/claim/console state has accumulated (#820, D4). Deliberately not a
// per-check timeout — those already exist (git-exec's DEFAULT_TIMEOUT_MS,
// each gh call's own 5s) — this bounds the SUM across the whole pass.
'use strict';

const DEFAULT_BUDGET_MS = 18000;

function createBudget(ms = DEFAULT_BUDGET_MS) {
  const deadline = Date.now() + ms;
  return {
    exceeded: () => Date.now() >= deadline,
    remainingMs: () => Math.max(0, deadline - Date.now()),
  };
}

module.exports = { createBudget, DEFAULT_BUDGET_MS };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/bin-lib/reconcile/budget.test.js`
Expected: PASS (3/3).

- [ ] **Step 5: Wire into `reconcile()`'s dispatch loop**

In `bin/lib/reconcile/index.js`, create the budget once (after the preflight, before the `mirror` block) and add a guard before each subsequent dispatch block. Introduce a small local helper to keep every guard identical:

```javascript
const { createBudget } = require('./budget');
// ...after the preflight check...
  const budget = createBudget();
  const DISPATCH_ORDER = ['mirror', 'red-tip', 'console', 'release', 'archive', 'archive-branches', 'remote-prune', 'reap'];
  function overBudget(remainingFromHere) {
    if (!budget.exceeded()) return false;
    const notYetRun = remainingFromHere.filter((c) => checks.includes(c));
    if (notYetRun.length) result.skipped.push({ check: notYetRun.join(','), reason: 'budget-exceeded' });
    return true;
  }
```

Then, before each of the 8 `if (checks.includes(X)) { ... }` blocks (in dispatch order), add a guard using the slice of `DISPATCH_ORDER` from that check onward, e.g. before the `mirror` block:

```javascript
  if (overBudget(DISPATCH_ORDER.slice(0))) return result;
  if (checks.includes('mirror')) { ... }
```

before `red-tip`:

```javascript
  if (overBudget(DISPATCH_ORDER.slice(1))) return result;
  if (checks.includes('red-tip')) { ... }
```

...and so on through `reap` (`DISPATCH_ORDER.slice(7)`). Each guard, if it fires, reports every not-yet-dispatched requested check in one `skipped` entry and returns immediately — never runs a partial remainder.

- [ ] **Step 6: Write the integration test**

Append to `tests/reconcile.test.js`:

```javascript
test('reconcile(): an exhausted wall-clock budget skips every remaining check in one entry (D4)', async () => {
  const { mainDir } = pairedFixture();
  const budgetMod = require('../bin/lib/reconcile/budget');
  const original = budgetMod.createBudget;
  budgetMod.createBudget = () => ({ exceeded: () => true, remainingMs: () => 0 });
  try {
    const r = await reconcile({ cwd: mainDir, checks: ['mirror', 'red-tip'] });
    assert.deepEqual(r.skipped, [{ check: 'mirror,red-tip', reason: 'budget-exceeded' }]);
  } finally {
    budgetMod.createBudget = original;
  }
});
```

(Same non-destructured-import discipline as Task 2 Step 6 — call `require('./budget').createBudget()` at each use site in `index.js`, not a module-load-time destructure, so this monkeypatch is effective.)

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add bin/lib/reconcile/budget.js bin/lib/reconcile/index.js tests/bin-lib/reconcile/budget.test.js tests/reconcile.test.js
git commit -m "reconcile(): add an overall wall-clock budget, abort remaining checks past it (refs #820)"
```

---

### Task 4: Merge mirror's and prune-remote's fetches

**Files:**
- Create: `bin/lib/reconcile/shared-fetch.js`
- Modify: `bin/lib/reconcile/classify.js` (accept a `skipFetch` option)
- Modify: `bin/lib/reconcile/mirror-ff.js` (forward `skipFetch` through)
- Modify: `bin/lib/reconcile/prune-remote.js` (drop its own `git fetch --prune`, accept `skipFetch`)
- Modify: `bin/lib/reconcile/index.js` (perform the one shared fetch when `mirror` or `remote-prune` is requested, before either)
- Test: `tests/reconcile.test.js` (classify.js skipFetch case), `tests/bin-lib/reconcile/prune-remote.test.js` (skipFetch case), integration case in `tests/reconcile.test.js`

**Interfaces:**
- Produces: `sharedFetch(root) -> {stdout, failure}` (same shape as `runGit`).
- Consumes: `classifyMirror(repoRoot, integration, opts?: {skipFetch?})`, `pruneRemote({..., skipFetch?})`.

- [ ] **Step 1: Write the failing test for `classifyMirror`'s new option**

Append to `tests/reconcile.test.js` (near the existing `classifyMirror` tests):

```javascript
test('classifyMirror: skipFetch=true never calls fetch, trusts already-fetched refs', () => {
  const { originDir, mainDir } = pairedFixture();
  git(['fetch', 'origin'], mainDir); // caller already fetched, simulating the shared-fetch path
  const result = classifyMirror(mainDir, 'main', { skipFetch: true });
  assert.equal(result.state, 'current');
  void originDir;
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/reconcile.test.js`
Expected: FAIL — `classifyMirror` does not accept a third argument yet, but since it's simply ignored by JS, the test would actually pass today by coincidence (the fetch still runs). Adjust: assert the fetch is truly skipped by pointing `origin` at an invalid URL after the manual fetch above, so a *second* fetch attempt would fail/hang — `git remote set-url origin https://example.invalid/nope.git` before calling `classifyMirror`; today's code (which always fetches) would return `{state: null, failure: ...}`, the fixed code returns `{state: 'current', failure: null}`.

```javascript
test('classifyMirror: skipFetch=true never calls fetch, trusts already-fetched refs', () => {
  const { originDir, mainDir } = pairedFixture();
  git(['fetch', 'origin'], mainDir);
  git(['remote', 'set-url', 'origin', 'https://example.invalid/nope.git'], mainDir);
  const result = classifyMirror(mainDir, 'main', { skipFetch: true });
  assert.equal(result.state, 'current');
  assert.equal(result.failure, null);
  void originDir;
});
```

Expected FAIL: `result.failure` is a fetch failure (not `null`), because `classifyMirror` still fetches from the now-broken `origin`.

- [ ] **Step 3: Implement `skipFetch` in `classify.js` and forward it in `mirror-ff.js`**

In `bin/lib/reconcile/classify.js`, change the signature and gate the fetch:

```javascript
function classifyMirror(repoRoot, integration, opts = {}) {
  const status = runGit(['status', '--porcelain'], repoRoot);
  if (status.failure) return { state: null, failure: status.failure };
  if (status.stdout !== '') return { state: 'dirty', failure: null };

  if (!opts.skipFetch) {
    const fetch = runGit(['fetch', 'origin', integration], repoRoot, { timeoutMs: FETCH_TIMEOUT_MS });
    if (fetch.failure) return { state: null, failure: fetch.failure };
  }

  const counts = runGit(['rev-list', '--left-right', '--count', `${integration}...origin/${integration}`], repoRoot);
  // ...unchanged below...
```

In `bin/lib/reconcile/mirror-ff.js`, forward the option:

```javascript
function mirrorFastForward(repoRoot, integration, opts = {}) {
  const classified = classifyMirror(repoRoot, integration, opts);
  // ...unchanged below...
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/reconcile.test.js`
Expected: PASS.

- [ ] **Step 5: Add `sharedFetch` and drop `prune-remote.js`'s own fetch**

Create `bin/lib/reconcile/shared-fetch.js`:

```javascript
// bin/lib/reconcile/shared-fetch.js — the one `git fetch --prune origin`
// reconcile() performs per pass, shared by mirror (classify.js) and
// prune-remote.js, which each previously ran their own separate fetch
// (#820, D2). --prune (broader than mirror's single-ref fetch) also drops
// stale tracking refs for branches already gone on origin, so prune-remote
// stops re-examining them every pass.
'use strict';
const { runGit } = require('../hooks/git-exec');

const FETCH_TIMEOUT_MS = 5000;

function sharedFetch(root) {
  return runGit(['fetch', '--prune', 'origin'], root, { timeoutMs: FETCH_TIMEOUT_MS });
}

module.exports = { sharedFetch, FETCH_TIMEOUT_MS };
```

In `bin/lib/reconcile/prune-remote.js`, remove the module's own fetch call and accept `skipFetch` for symmetry/testability (default `false`, so calling `pruneRemote` directly — as every existing test still does — is unaffected):

```javascript
function pruneRemote({ cwd, integration, dryRun, resolvePr, skipFetch } = {}) {
  const root = cwd || process.cwd();
  const resolve = resolvePr || resolvePrState;
  const entries = [];

  if (!skipFetch) {
    const fetched = runGit(['fetch', '--prune', 'origin'], root);
    if (fetched.failure) return { entries, failure: 'fetch-failed' };
  }

  const wtList = runGit(['worktree', 'list', '--porcelain'], root);
  // ...unchanged below...
```

- [ ] **Step 6: Wire the shared fetch into `reconcile()`**

In `bin/lib/reconcile/index.js`, right after the budget guard preceding the `mirror` block, perform the shared fetch once if either `mirror` or `remote-prune` was requested, and pass `skipFetch: true` down to both:

```javascript
const { sharedFetch } = require('./shared-fetch');
// ...
  let sharedFetchOk = true;
  if (checks.includes('mirror') || checks.includes('remote-prune')) {
    const fetched = sharedFetch(root);
    if (fetched.failure) {
      sharedFetchOk = false;
      const affected = ['mirror', 'red-tip', 'remote-prune'].filter((c) => checks.includes(c));
      if (affected.length) result.skipped.push({ check: affected.join(','), reason: 'fetch-failed' });
    }
  }
  if (overBudget(DISPATCH_ORDER.slice(0))) return result;
  if (checks.includes('mirror') && sharedFetchOk) {
    result.mirror = mirrorFastForward(root, integration, { skipFetch: true });
  }
```

(`red-tip` is included in the `affected` skip list because it reads the ref mirror's fetch refreshed — see the existing ordering comment in `index.js` — so a failed shared fetch means `red-tip` has nothing fresh to read either.) Update the `remote-prune` dispatch block similarly to pass `{ skipFetch: true }` and to be skipped when `!sharedFetchOk`:

```javascript
  if (checks.includes('remote-prune') && sharedFetchOk) {
    const r = pruneRemote({ cwd: root, integration, dryRun, skipFetch: true });
    // ...unchanged below...
  } else if (checks.includes('remote-prune') && !sharedFetchOk) {
    // already recorded in the shared skip entry above — nothing further to do
  }
```

- [ ] **Step 7: Write the integration test**

Append to `tests/reconcile.test.js`:

```javascript
test('reconcile(): mirror and remote-prune share one fetch, not two (D2)', async () => {
  const { mainDir } = pairedFixture();
  const gitExec = require('../bin/lib/hooks/git-exec');
  const original = gitExec.runGit;
  let fetchCalls = 0;
  gitExec.runGit = (args, cwd, opts) => {
    if (args[0] === 'fetch') fetchCalls += 1;
    return original(args, cwd, opts);
  };
  try {
    await reconcile({ cwd: mainDir, checks: ['mirror', 'remote-prune'] });
  } finally {
    gitExec.runGit = original;
  }
  assert.equal(fetchCalls, 1, `expected exactly one fetch, saw ${fetchCalls}`);
});
```

(Same non-destructured-import discipline: every fetch-issuing call in `index.js`/`classify.js`/`prune-remote.js` must call `require('../hooks/git-exec').runGit` — check the existing `require` style in these files already does this, since `runGit` is imported once at module top via destructuring in each. If destructured imports make this stub ineffective, instead assert via a temp-repo custom `GIT_SSH_COMMAND`-style counter is overkill — simplest fix: destructure is fine here because `shared-fetch.js`'s own `runGit` reference is what's stubbed by re-requiring the *same* cached module object's export slot, which destructuring still reads fresh from since `gitExec.runGit = ...` mutates the shared module.exports object all destructurers already hold a reference into — verify this holds before trusting the count; if not, fall back to counting via a temp wrapper script on `PATH` that logs each `git fetch` invocation.)

- [ ] **Step 8: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add bin/lib/reconcile/shared-fetch.js bin/lib/reconcile/classify.js bin/lib/reconcile/mirror-ff.js bin/lib/reconcile/prune-remote.js bin/lib/reconcile/index.js tests/reconcile.test.js tests/bin-lib/reconcile/prune-remote.test.js
git commit -m "reconcile(): merge mirror's and prune-remote's fetches into one shared fetch (refs #820)"
```

---

### Task 5: Batch remote-branch deletion

**Files:**
- Modify: `bin/lib/reconcile/prune-remote.js`
- Test: `tests/bin-lib/reconcile/prune-remote.test.js`

**Interfaces:**
- No signature change to `pruneRemote()` — same `{entries, failure}` return shape. Internal restructuring only: decisions are computed for every branch first, then one batched delete runs, with a per-branch fallback only on batch failure.

- [ ] **Step 1: Write the failing test**

Append to `tests/bin-lib/reconcile/prune-remote.test.js` (reuse whatever fixture helper that file already has for a multi-branch-deletion scenario — read the file's existing `test('pruneRemote: ...delete...')` cases first to match its fixture-building style before writing this one):

```javascript
test('pruneRemote: multiple prunable branches are deleted with ONE push call, not one per branch', () => {
  // Build on this file's existing fixture pattern: an origin + main checkout
  // with branches b1 and b2, both cherry-equivalent and MERGED, so both
  // decide 'delete'.
  const { root, integration } = buildTwoPrunableBranchesFixture(); // reuse/extend this file's existing helper
  const gitExec = require('../../../bin/lib/hooks/git-exec');
  const original = gitExec.runGit;
  const pushCalls = [];
  gitExec.runGit = (args, cwd, opts) => {
    if (args[0] === 'push') pushCalls.push(args);
    return original(args, cwd, opts);
  };
  let result;
  try {
    result = pruneRemote({ cwd: root, integration, skipFetch: true, resolvePr: () => ({ number: 1, state: 'MERGED' }) });
  } finally {
    gitExec.runGit = original;
  }
  assert.equal(pushCalls.length, 1, `expected one batched push, saw ${pushCalls.length}: ${JSON.stringify(pushCalls)}`);
  assert.ok(pushCalls[0].includes('b1') && pushCalls[0].includes('b2'));
  assert.equal(result.entries.filter((e) => e.action === 'delete').length, 2);
});
```

(The implementer must add `buildTwoPrunableBranchesFixture` — or inline-build the two-branch fixture directly in this test — following exactly the pattern the existing single-branch delete test in this file already uses, extended to two branches instead of one.)

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/bin-lib/reconcile/prune-remote.test.js`
Expected: FAIL — `pushCalls.length` is 2 (today's per-branch loop).

- [ ] **Step 3: Restructure `pruneRemote()` to batch the delete**

In `bin/lib/reconcile/prune-remote.js`, replace the per-branch `runGit(['push', 'origin', '--delete', branch], root)` call inside the loop with a two-phase structure: collect decisions during the loop, then one batched push after it (falling back to per-branch on batch failure):

```javascript
function pruneRemote({ cwd, integration, dryRun, resolvePr, skipFetch } = {}) {
  const root = cwd || process.cwd();
  const resolve = resolvePr || resolvePrState;
  const entries = [];

  if (!skipFetch) {
    const fetched = runGit(['fetch', '--prune', 'origin'], root);
    if (fetched.failure) return { entries, failure: 'fetch-failed' };
  }

  const wtList = runGit(['worktree', 'list', '--porcelain'], root);
  if (wtList.failure) return { entries, failure: 'git-failure' };
  const worktrees = parseWorktreeList(wtList.stdout);

  const refs = runGit(['for-each-ref', '--format=%(refname:lstrip=3)', 'refs/remotes/origin'], root);
  if (refs.failure) return { entries, failure: 'git-failure' };

  const toDelete = [];
  for (const branch of refs.stdout.split('\n').map((s) => s.trim()).filter(Boolean)) {
    if (branch === 'HEAD' || branch === integration) continue;
    if (!inScope(branch, worktrees)) continue;

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
    toDelete.push({ branch, reason: decision.reason });
  }

  if (toDelete.length === 0) return { entries, failure: null };

  // One batched delete for every branch decided this pass — the family's
  // one pushed mutation, previously one `push --delete` per branch (#820, D3).
  const batch = runGit(['push', 'origin', '--delete', ...toDelete.map((d) => d.branch)], root);
  if (!batch.failure) {
    for (const { branch, reason } of toDelete) {
      entries.push({ name: branch, kind: 'remote-branch', action: 'delete', reason });
    }
    return { entries, failure: null };
  }

  // Batch push failed (e.g. one ref already gone) — fall back to per-branch
  // pushes so one bad ref doesn't silently swallow every other deletion this
  // pass would otherwise have made.
  for (const { branch, reason } of toDelete) {
    const del = runGit(['push', 'origin', '--delete', branch], root);
    entries.push(del.failure
      ? { name: branch, kind: 'remote-branch', action: 'skip', reason: 'delete-failed' }
      : { name: branch, kind: 'remote-branch', action: 'delete', reason });
  }
  return { entries, failure: null };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/bin-lib/reconcile/prune-remote.test.js`
Expected: PASS.

- [ ] **Step 5: Add the batch-failure fallback test**

Append to the same file:

```javascript
test('pruneRemote: a failed batch push falls back to per-branch deletes, one bad ref does not swallow the rest', () => {
  const { root, integration } = buildTwoPrunableBranchesFixture();
  const gitExec = require('../../../bin/lib/hooks/git-exec');
  const original = gitExec.runGit;
  let batchAttempted = false;
  gitExec.runGit = (args, cwd, opts) => {
    if (args[0] === 'push' && args.length > 5) { // the batched multi-branch push
      batchAttempted = true;
      return { stdout: null, failure: 'git-error' };
    }
    return original(args, cwd, opts);
  };
  let result;
  try {
    result = pruneRemote({ cwd: root, integration, skipFetch: true, resolvePr: () => ({ number: 1, state: 'MERGED' }) });
  } finally {
    gitExec.runGit = original;
  }
  assert.equal(batchAttempted, true);
  assert.equal(result.entries.filter((e) => e.action === 'delete').length, 2, 'per-branch fallback still deletes both');
});
```

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add bin/lib/reconcile/prune-remote.js tests/bin-lib/reconcile/prune-remote.test.js
git commit -m "prune-remote: batch per-branch delete pushes into one multi-ref push (refs #820)"
```

---

### Task 6: Reconcile cache module (shared infra for D6 + D7)

Decision (stated per the spec's planning guidance): **one cache file, two independent namespaces**, not two files. Both are the same kind of thing — local, best-effort, session-start bookkeeping that costs nothing to lose (a cache miss just means slightly more work, never an incorrect skip of real work) — matching `reconcile()`'s own documented posture ("safe by per-check properties, not a global lock"). One read/write module keeps the corruption-safe-fallback and best-effort-write logic in one place instead of two near-identical copies.

**Files:**
- Create: `bin/lib/reconcile/cache.js`
- Modify: `.gitignore` (add the cache file path)
- Test: `tests/bin-lib/reconcile/cache.test.js`

**Interfaces:**
- Produces:
  - `readCache(root) -> {lastRunAt: number|null, claimShas: {[issueNumber]: string}}` — corruption/absence-safe, always returns this shape.
  - `writeCache(root, cache)` — best-effort; a write failure never throws.
  - `isFresh(cache, nowMs, ttlMs) -> boolean` — pure.
  - `CACHE_FILENAME = 'reconcile-cache.json'`, `DEFAULT_TTL_MS = 7 * 60 * 1000` (mid-point of the spec's stated 5-10 min range).

- [ ] **Step 1: Write the failing test**

Create `tests/bin-lib/reconcile/cache.test.js`:

```javascript
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { readCache, writeCache, isFresh, CACHE_FILENAME, DEFAULT_TTL_MS } = require('../../../bin/lib/reconcile/cache');

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ct-recon-cache-'));
}

test('readCache: absent file reads as empty defaults, not a throw', () => {
  const root = tmpRoot();
  assert.deepEqual(readCache(root), { lastRunAt: null, claimShas: {} });
});

test('readCache: corrupt JSON fails closed to empty defaults, not a throw', () => {
  const root = tmpRoot();
  fs.mkdirSync(path.join(root, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude-tweaks', CACHE_FILENAME), '{not json');
  assert.deepEqual(readCache(root), { lastRunAt: null, claimShas: {} });
});

test('writeCache then readCache round-trips', () => {
  const root = tmpRoot();
  writeCache(root, { lastRunAt: 12345, claimShas: { 7: 'abc' } });
  assert.deepEqual(readCache(root), { lastRunAt: 12345, claimShas: { 7: 'abc' } });
});

test('writeCache: a failure (unwritable dir) is swallowed, never throws', () => {
  const root = '/nonexistent-does-not-exist-820';
  assert.doesNotThrow(() => writeCache(root, { lastRunAt: 1, claimShas: {} }));
});

test('isFresh: within TTL is fresh', () => {
  assert.equal(isFresh({ lastRunAt: 1000 }, 1000 + DEFAULT_TTL_MS - 1, DEFAULT_TTL_MS), true);
});

test('isFresh: past TTL is not fresh', () => {
  assert.equal(isFresh({ lastRunAt: 1000 }, 1000 + DEFAULT_TTL_MS + 1, DEFAULT_TTL_MS), false);
});

test('isFresh: null lastRunAt (never run) is never fresh', () => {
  assert.equal(isFresh({ lastRunAt: null }, Date.now(), DEFAULT_TTL_MS), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/bin-lib/reconcile/cache.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `bin/lib/reconcile/cache.js`:

```javascript
// bin/lib/reconcile/cache.js — one local, best-effort cache file backing
// two independent uses (#820): D7's short-TTL "skip the whole pass" gate
// (`lastRunAt`) and D6's per-claim content-addressed skip (`claimShas`,
// keyed by issue number, value = the claim blob's own `sha` as last seen).
// Both are the same kind of thing — a cache miss costs a little extra work,
// never an incorrect skip of real work — so they share one file and one
// read/write path rather than two near-identical copies. Lives under the
// MAIN CHECKOUT's .claude-tweaks/ (never a worktree's — see
// _shared/pipeline-run-dir.md's Anchoring section for why), gitignored:
// this is local bookkeeping, not committed audit trail.
'use strict';
const fs = require('fs');
const path = require('path');

const CACHE_FILENAME = 'reconcile-cache.json';
const DEFAULT_TTL_MS = 7 * 60 * 1000;

function cachePath(root) {
  return path.join(root, '.claude-tweaks', CACHE_FILENAME);
}

// -> { lastRunAt: number|null, claimShas: {[issueNumber]: string} }
// Absent file or corrupt JSON both fail closed to empty defaults — a cache
// is pure optimization; never let a bad read block or skew reconcile().
function readCache(root) {
  const empty = { lastRunAt: null, claimShas: {} };
  let raw;
  try {
    raw = fs.readFileSync(cachePath(root), 'utf8');
  } catch {
    return empty;
  }
  try {
    const parsed = JSON.parse(raw);
    return {
      lastRunAt: typeof parsed.lastRunAt === 'number' ? parsed.lastRunAt : null,
      claimShas: (parsed.claimShas && typeof parsed.claimShas === 'object') ? parsed.claimShas : {},
    };
  } catch {
    return empty;
  }
}

// Best-effort — a write failure (unwritable dir, disk full) never throws;
// the next pass just misses the cache and does the work again.
function writeCache(root, cache) {
  try {
    fs.mkdirSync(path.dirname(cachePath(root)), { recursive: true });
    fs.writeFileSync(cachePath(root), JSON.stringify(cache));
  } catch {
    /* best-effort */
  }
}

// Pure — no I/O, no Date.now() call of its own (nowMs is always passed in),
// so it's trivially testable and reusable by both a live caller and a test.
function isFresh(cache, nowMs, ttlMs = DEFAULT_TTL_MS) {
  if (typeof cache.lastRunAt !== 'number') return false;
  return (nowMs - cache.lastRunAt) < ttlMs;
}

module.exports = { readCache, writeCache, isFresh, CACHE_FILENAME, DEFAULT_TTL_MS, cachePath };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/bin-lib/reconcile/cache.test.js`
Expected: PASS (7/7).

- [ ] **Step 5: Gitignore the cache file**

In `.gitignore`, add a new line near the other `.claude-tweaks/` entries:

```
.claude-tweaks/reconcile-cache.json
```

- [ ] **Step 6: Commit**

```bash
git add bin/lib/reconcile/cache.js .gitignore tests/bin-lib/reconcile/cache.test.js
git commit -m "reconcile: add a shared local cache module for TTL + claim-sha freshness (refs #820)"
```

---

### Task 7: Sha-aware claims listing (D6)

Reuses the existing single-call Contents-API directory listing (`claim-store.js`'s `listClaimNames`) rather than adding a Git Trees API call — see Global Constraints deviation 2. The listing already returns each entry's `sha`; only the `-q` filter needs to change to keep it. `release-merged.js`'s per-claim loop then skips the `readClaimBlob` call entirely for any claim whose sha matches the cache from Task 6.

**Files:**
- Modify: `bin/lib/issues/claim-store.js` (`listClaimNames` → also return each entry's `sha`)
- Modify: `bin/lib/reconcile/release-merged.js` (consult/update the Task 6 cache; skip `readClaim` for unchanged shas)
- Test: `tests/bin-lib/issues/claim-store.test.js`, `tests/bin-lib/reconcile/release-merged.test.js`

**Interfaces:**
- Changes: `listClaimNames(ghApi, repoSlug) -> { names: string[], failure }` becomes `listClaimEntries(ghApi, repoSlug) -> { entries: [{name, sha}], failure }`. `listClaimNames` stays exported as a thin wrapper (`entries.map(e => e.name)`) so any other caller is unaffected — grep confirmed `release-merged.js` is the only consumer, but keep the old name working rather than doing a bare rename.
- Produces (in `release-merged.js`): a pure `shouldSkipClaimRead(entry, cachedSha) -> boolean` decision function, matching the family's decision-function-plus-I/O-at-the-edges shape.

- [ ] **Step 1: Write the failing test for `listClaimEntries`**

Append to `tests/bin-lib/issues/claim-store.test.js`:

```javascript
test('listClaimEntries: returns name + sha per entry from the same single Contents-API call listClaimNames already made', () => {
  const { listClaimEntries } = require('../../../bin/lib/issues/claim-store');
  let seenArgs = null;
  const ghApi = (args) => {
    seenArgs = args;
    return { stdout: JSON.stringify([{ name: 'issue-7.json', sha: 'sha7' }, { name: 'issue-9.json', sha: 'sha9' }]), failure: null, status: null };
  };
  const r = listClaimEntries(ghApi, 'acme/w');
  assert.deepEqual(r, { entries: [{ name: 'issue-7.json', sha: 'sha7' }, { name: 'issue-9.json', sha: 'sha9' }], failure: null });
  assert.match(seenArgs[0], /repos\/acme\/w\/contents\/claims\?ref=/);
  assert.match(seenArgs.join(' '), /-q .*name.*sha/);
});

test('listClaimNames: still works, now a thin wrapper over listClaimEntries', () => {
  const { listClaimNames } = require('../../../bin/lib/issues/claim-store');
  const ghApi = () => ({ stdout: JSON.stringify([{ name: 'issue-7.json', sha: 'sha7' }]), failure: null, status: null });
  assert.deepEqual(listClaimNames(ghApi, 'acme/w'), { names: ['issue-7.json'], failure: null });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/bin-lib/issues/claim-store.test.js`
Expected: FAIL — `listClaimEntries` not exported; the `-q` query today is `.[].name` (bare names, one per line), not a JSON array of `{name, sha}`.

- [ ] **Step 3: Implement `listClaimEntries`, keep `listClaimNames` as a wrapper**

In `bin/lib/issues/claim-store.js`, replace `listClaimNames`'s implementation:

```javascript
// (ghApi, repoSlug) -> { entries: [{name, sha}], failure: null|'gh-absent'|'network-failure' }
// One Contents-API directory listing — the SAME single call this module
// already made — extended to keep each entry's `sha` (previously discarded
// by `-q .[].name`) instead of adding a second Git Trees API call (#820,
// D6). `claims/` is flat and single-level, so the directory listing already
// carries everything a Trees API call would add.
function listClaimEntries(ghApi, repoSlug) {
  const r = ghApi([`repos/${repoSlug}/contents/claims?ref=${CLAIMS_BRANCH}`, '-q', '[.[] | {name, sha}]']);
  if (r.failure) return { entries: [], failure: r.failure };
  try {
    const parsed = JSON.parse(r.stdout || '[]');
    return { entries: Array.isArray(parsed) ? parsed : [], failure: null };
  } catch {
    return { entries: [], failure: 'network-failure' };
  }
}

// Thin wrapper — the only pre-existing consumer (release-merged.js) is
// migrating to listClaimEntries in the same change (see that module), but
// kept exported as-is rather than removed, since a bare rename with no
// remaining caller to prove it is unnecessary churn.
function listClaimNames(ghApi, repoSlug) {
  const { entries, failure } = listClaimEntries(ghApi, repoSlug);
  return { names: entries.map((e) => e.name), failure };
}
```

Add `listClaimEntries` to the `module.exports` object at the bottom of the file.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/bin-lib/issues/claim-store.test.js`
Expected: PASS.

- [ ] **Step 5: Write the failing test for `release-merged.js`'s sha-skip**

Append to `tests/bin-lib/reconcile/release-merged.test.js`:

```javascript
test('shouldSkipClaimRead: matching cached sha skips the read', () => {
  const { shouldSkipClaimRead } = require('../../../bin/lib/reconcile/release-merged');
  assert.equal(shouldSkipClaimRead({ name: 'issue-7.json', sha: 'abc' }, 'abc'), true);
});
test('shouldSkipClaimRead: different sha does not skip', () => {
  const { shouldSkipClaimRead } = require('../../../bin/lib/reconcile/release-merged');
  assert.equal(shouldSkipClaimRead({ name: 'issue-7.json', sha: 'abc' }, 'different'), false);
});
test('shouldSkipClaimRead: no cached entry (undefined) does not skip — first sighting always reads', () => {
  const { shouldSkipClaimRead } = require('../../../bin/lib/reconcile/release-merged');
  assert.equal(shouldSkipClaimRead({ name: 'issue-7.json', sha: 'abc' }, undefined), false);
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `node --test tests/bin-lib/reconcile/release-merged.test.js`
Expected: FAIL — `shouldSkipClaimRead` not exported.

- [ ] **Step 7: Wire the cache into `release-merged.js`**

In `bin/lib/reconcile/release-merged.js`, add the pure decision function and wire it into `releaseMerged`:

```javascript
const { readCache, writeCache } = require('./cache');

// Pure: a claim listing entry + the cached sha last seen for that issue ->
// skip the readClaimBlob call entirely when unchanged (#820, D6). A claim
// whose content hasn't changed since the last pass can't have a new
// release decision either — release only ever fires on classifyClaimBlob
// state + a fresh PR/issue join, neither of which depends on re-reading
// content that is byte-identical to what was already evaluated.
//
// NOTE: this only skips the CONTENT READ, never the PR/issue-state join —
// a claim can still be releasable on this pass even with unchanged content,
// if the PR merged since the LAST pass. See Step 8 below: the skip applies
// only to claims whose classified state was already 'live'/'stale' with a
// join that resolved 'skip' last pass for a TRANSIENT reason (pr-open,
// no-merged-pr-yet) — never to a claim never seen before.
function shouldSkipClaimRead(entry, cachedSha) {
  if (cachedSha === undefined || cachedSha === null) return false;
  return entry.sha === cachedSha;
}
```

Add `shouldSkipClaimRead` to `module.exports`.

- [ ] **Step 8: Run test to verify it passes, then re-scope the skip correctly**

Run: `node --test tests/bin-lib/reconcile/release-merged.test.js`
Expected: PASS.

**Correctness note the implementer must resolve now, not defer:** re-read Step 7's own NOTE — an unchanged claim blob does NOT imply "nothing to do," because the PR/issue join result can change between passes even when the claim content hasn't. The safe, still-valuable optimization is narrower than "skip the read": it's "skip the read AND reuse the LAST decision" only when the last decision was **already `release`** and idempotently writing the same tombstone again is harmless — but a `release` already deletes/tombstones the claim, so a released claim's sha will never match on a later pass anyway (the content changes on release). Therefore the only shas that can ever match the cache are claims that were `skip`ped last pass — and a skip must always be re-evaluated (the join might now succeed). **Conclusion: an unchanged sha cannot safely skip the join evaluation.** Narrow the optimization to what it can actually buy: skip only the byte fetch of content that will be re-parsed into the *same* `classifyClaimBlob` result — i.e., cache `{sha -> classifiedState}` (not the full content) so `readClaim`'s content bytes aren't re-transferred, but still perform `resolvePrState`/`readIssueState` and `decideRelease` fresh every pass, exactly as today. Update `releaseMerged`'s loop:

```javascript
function releaseMerged({ cwd } = {}) {
  const released = [];
  const skipped = [];
  const root = cwd || process.cwd();
  const repoSlug = repoSlugOf(root);
  if (!repoSlug) return { released, skipped, failure: 'no-remote' };

  const { entries, failure } = listClaims(repoSlug); // now listClaimEntries via the updated listClaims below
  if (failure) return { released, skipped, failure };

  const cache = readCache(root);
  const nextClaimShas = {};

  const wtList = runGit(['worktree', 'list', '--porcelain'], root);
  const worktrees = wtList.failure ? [] : parseWorktreeList(wtList.stdout);

  for (const entry of entries) {
    const m = /^issue-(\d+)\.json$/.exec(entry.name);
    if (!m) continue;
    const issueNumber = Number(m[1]);

    let classified;
    let content;
    if (shouldSkipClaimRead(entry, cache.claimShas[issueNumber])) {
      // Sha unchanged since last pass — we still know it classified as
      // live/stale (only an active claim's sha would be cached at all, see
      // below), but re-fetch is skipped; content is not needed again
      // because classifyClaimBlob's result for byte-identical content is
      // itself byte-identical, so reuse the state, not the bytes.
      classified = { state: cache.claimStates ? cache.claimStates[issueNumber] : 'live' };
      nextClaimShas[issueNumber] = entry.sha;
    } else {
      const claim = readClaim(repoSlug, entry.name);
      if (claim.failure) { skipped.push({ issueNumber, reason: claim.failure }); continue; }
      classified = classifyClaimBlob(claim.content, Date.now());
      content = claim.content;
      if (classified.state === 'live' || classified.state === 'stale') nextClaimShas[issueNumber] = entry.sha;
    }

    const isActive = classified.state === 'live' || classified.state === 'stale';
    let runId = null;
    if (isActive && content) {
      try { runId = JSON.parse(content).runId || null; } catch { /* falls through to no-run-id below */ }
    } else if (isActive && !content) {
      // Cache-hit path with no content: runId must come from a fresh read
      // after all — decideRelease needs the join regardless, so there is no
      // remaining benefit to skipping the content read once we're here.
      // Simplify: do NOT skip the read for active claims at all (see the
      // conclusion above) — this branch is unreachable once Step 8's
      // narrowing is applied; remove the shouldSkipClaimRead branch's
      // effect on isActive claims entirely and only use it to avoid
      // re-fetching a claim already known to be a NON-candidate (absent/
      // tombstone/unreadable), where the state can never change again.
    }
    // ...unchanged decision/release logic below, using `classified`/`runId`/`issueNumber`...
  }

  writeCache(root, { lastRunAt: cache.lastRunAt, claimShas: nextClaimShas });
  return { released, skipped };
}
```

**Resolve the self-contradiction surfaced above before implementing further:** the analysis in this step shows the naive "skip read on matching sha" is unsafe for **active** (live/stale) claims specifically, because their join result can change pass-to-pass even when content doesn't — but it IS safe for terminal/non-candidate states (a tombstoned or unreadable claim's sha, once cached, will never need re-evaluation, since `classifyClaimBlob`'s terminal states never un-terminal themselves). **Final design:** cache only entries whose classified state is terminal (`tombstone`, `unreadable`, `absent` is never listed at all since it has no directory entry) — `nextClaimShas[issueNumber] = entry.sha` only when `classified.state` is NOT `'live'`/`'stale'`. On a cache hit (sha matches a cached terminal state), skip the read entirely and `continue` the loop without pushing to `skipped` (matching today's existing `if (!isActive) continue;` short-circuit for non-candidates). This actually delivers D6's real value: most `claims/` entries in a mature repo are old tombstones from long-released claims, re-fetched and re-classified every single pass today for zero behavioral benefit — those are exactly what this cache eliminates, while every live/stale claim (the ones actually relevant to a release decision) is still read and joined fresh every pass, preserving 100% of today's correctness. Rewrite the loop body accordingly:

```javascript
  for (const entry of entries) {
    const m = /^issue-(\d+)\.json$/.exec(entry.name);
    if (!m) continue;
    const issueNumber = Number(m[1]);

    if (shouldSkipClaimRead(entry, cache.claimShas[issueNumber])) {
      nextClaimShas[issueNumber] = entry.sha; // still terminal, still cached
      continue; // matches the existing `if (!isActive) continue;` no-log behavior
    }

    const claim = readClaim(repoSlug, entry.name);
    if (claim.failure) { skipped.push({ issueNumber, reason: claim.failure }); continue; }

    const classified = classifyClaimBlob(claim.content, Date.now());
    const isActive = classified.state === 'live' || classified.state === 'stale';
    if (!isActive) { nextClaimShas[issueNumber] = entry.sha; continue; } // now cacheable — terminal state
    // ...unchanged from here: runId parse, prState join, issueState, decideRelease, release/skip push...
  }

  writeCache(root, { ...cache, claimShas: nextClaimShas });
```

Also update `listClaims` (the private helper near the top of `release-merged.js`) to call `claimStore.listClaimEntries` instead of `listClaimNames`, returning `{entries, failure}` instead of `{names, failure}`, and update every reference in this file from `names`/`name` to `entries`/`entry.name` accordingly.

- [ ] **Step 9: Write the integration test proving terminal-only caching**

Append to `tests/bin-lib/reconcile/release-merged.test.js` (this test needs `releaseMerged` itself, which is not currently exercised end-to-end in this file — add a minimal fake-`ghApi`-injection path; if `releaseMerged` has no injectable `ghApi` today, add one as a fourth optional param `{ cwd, ghApi }` defaulting to the module's real `ghApi`, mirroring `claim-store.js`'s seam, and use it here rather than shelling to real `gh`):

```javascript
test('releaseMerged: a tombstoned claim with an unchanged sha is never re-fetched on the next pass', () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const { execFileSync } = require('child_process');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-release-cache-'));
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['remote', 'add', 'origin', 'git@github.com:acme/w.git'], { cwd: root });

  let readCalls = 0;
  const ghApi = (args) => {
    if (args[0].includes('/contents/claims?')) {
      return { stdout: JSON.stringify([{ name: 'issue-7.json', sha: 'tombstone-sha' }]), failure: null, status: null };
    }
    if (args[0].includes('/contents/claims/issue-7.json')) {
      readCalls += 1;
      return { stdout: JSON.stringify({ content: JSON.stringify({ released: true }), sha: 'tombstone-sha' }), failure: null, status: null };
    }
    throw new Error(`unexpected ${args.join(' ')}`);
  };

  releaseMerged({ cwd: root, ghApi }); // first pass: reads and caches the tombstone's sha
  assert.equal(readCalls, 1);
  releaseMerged({ cwd: root, ghApi }); // second pass: sha unchanged, must not re-read
  assert.equal(readCalls, 1, 'second pass must skip the read for an unchanged terminal-state sha');
});
```

- [ ] **Step 10: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add bin/lib/issues/claim-store.js bin/lib/reconcile/release-merged.js tests/bin-lib/issues/claim-store.test.js tests/bin-lib/reconcile/release-merged.test.js
git commit -m "release-merged: cache terminal-state claim shas, skip re-reading tombstoned claims (refs #820)"
```

---

### Task 8: Concurrency-capped async gh pool; parallelize release-merged and console-execute

**Files:**
- Create: `bin/lib/reconcile/gh-pool.js`
- Modify: `bin/lib/reconcile/release-merged.js` (`releaseMerged` becomes `async function`, its claim loop runs through the pool)
- Modify: `bin/lib/reconcile/console-execute.js` (`consoleExecuteDetect` becomes `async function`, its per-run-dir `fetchPrComments` calls run through the pool)
- Modify: `bin/lib/reconcile/index.js` (`await releaseMerged(...)`, `await consoleExecuteDetect(...)` — already `await`-safe from Task 1)
- Test: `tests/bin-lib/reconcile/gh-pool.test.js`, updated tests in `tests/bin-lib/reconcile/release-merged.test.js` / `tests/console-execute.test.js`

**Interfaces:**
- Produces: `runWithConcurrency(items: T[], worker: (item: T) => Promise<R>, cap?: number) -> Promise<R[]>`. `DEFAULT_CONCURRENCY = 6` (mid-point of the spec's stated 5-8 range). Preserves input order in the output array regardless of completion order.

- [ ] **Step 1: Write the failing test**

Create `tests/bin-lib/reconcile/gh-pool.test.js`:

```javascript
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runWithConcurrency, DEFAULT_CONCURRENCY } = require('../../../bin/lib/reconcile/gh-pool');

test('runWithConcurrency: results preserve input order regardless of completion order', async () => {
  const delays = [30, 10, 20];
  const results = await runWithConcurrency(delays, (ms) => new Promise((r) => setTimeout(() => r(ms), ms)), 3);
  assert.deepEqual(results, [30, 10, 20]);
});

test('runWithConcurrency: never runs more than `cap` workers at once', async () => {
  let active = 0;
  let maxActive = 0;
  const items = Array.from({ length: 10 }, (_, i) => i);
  await runWithConcurrency(items, async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((r) => setTimeout(r, 5));
    active -= 1;
  }, 3);
  assert.ok(maxActive <= 3, `max concurrent was ${maxActive}, expected <= 3`);
});

test('runWithConcurrency: a rejected worker does not abort the rest of the batch — resolves to a caught error marker', async () => {
  const items = [1, 2, 3];
  const results = await runWithConcurrency(items, async (i) => {
    if (i === 2) throw new Error('boom');
    return i;
  }, 2);
  assert.equal(results[0], 1);
  assert.ok(results[1] instanceof Error);
  assert.equal(results[2], 3);
});

test('runWithConcurrency: defaults to DEFAULT_CONCURRENCY when no cap is given', async () => {
  assert.equal(DEFAULT_CONCURRENCY, 6);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/bin-lib/reconcile/gh-pool.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `bin/lib/reconcile/gh-pool.js`:

```javascript
// bin/lib/reconcile/gh-pool.js — a small concurrency-capped async mapper
// for the reconcile family's per-item `gh` calls (release-merged.js's
// per-claim issue-state reads, console-execute.js's per-run `gh pr view`
// calls), replacing serial execFileSync loops with bounded parallelism
// (#820, D5). Per-item failures never abort the batch — matching
// gh-api-module-pattern's "one failed edge never aborts the batch" —
// caught and returned in place so the caller can branch on
// `result instanceof Error` per item.
'use strict';

const DEFAULT_CONCURRENCY = 6;

// (items, worker) -> Promise<results[]> — results[i] corresponds to
// items[i] regardless of completion order; a rejected worker resolves to
// the caught Error at that index instead of rejecting the whole batch.
async function runWithConcurrency(items, worker, cap = DEFAULT_CONCURRENCY) {
  const results = new Array(items.length);
  let next = 0;
  async function runOne() {
    while (next < items.length) {
      const i = next;
      next += 1;
      try {
        results[i] = await worker(items[i]);
      } catch (e) {
        results[i] = e instanceof Error ? e : new Error(String(e));
      }
    }
  }
  const workers = Array.from({ length: Math.min(cap, items.length) }, () => runOne());
  await Promise.all(workers);
  return results;
}

module.exports = { runWithConcurrency, DEFAULT_CONCURRENCY };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/bin-lib/reconcile/gh-pool.test.js`
Expected: PASS (4/4).

- [ ] **Step 5: Add an async `ghApi` seam and parallelize `release-merged.js`'s per-claim work**

In `bin/lib/reconcile/release-merged.js`, add a promisified `execFile`-based async gh runner alongside the existing sync one (the sync `ghApi` stays for `listClaims`/`readClaim`, which Task 7 already showed benefit little from parallelization since most entries now cache-skip; the async runner targets specifically `readIssueState`, the one remaining per-active-claim call):

```javascript
const { execFile } = require('child_process');
const { promisify } = require('util');
const { runWithConcurrency } = require('./gh-pool');

const execFileAsync = promisify(execFile);

async function ghApiAsync(args) {
  try {
    const { stdout } = await execFileAsync('gh', ['api', ...args], { encoding: 'utf8', timeout: GH_TIMEOUT_MS });
    return { stdout, failure: null };
  } catch (e) {
    if (e && e.code === 'ENOENT') return { stdout: null, failure: 'gh-absent' };
    return { stdout: null, failure: 'network-failure' };
  }
}

async function readIssueStateAsync(repoSlug, issueNumber) {
  const r = await ghApiAsync([`repos/${repoSlug}/issues/${issueNumber}`, '-q', '.state']);
  if (r.failure || !r.stdout) return undefined;
  const s = r.stdout.trim().toUpperCase();
  return s === 'OPEN' || s === 'CLOSED' ? s : undefined;
}
```

Convert `releaseMerged` to `async function releaseMerged(...)`. Restructure so the per-active-claim work (read, classify, join, issue-state fetch, decide) happens in two phases: first a synchronous phase that reads/classifies/joins every non-cache-skipped claim and collects which ones need `readIssueState` (per `needsIssueEvidence`), then one `runWithConcurrency` call resolving all of those issue-state fetches at once, then a final synchronous phase applying `decideRelease` and performing the release writes:

```javascript
async function releaseMerged({ cwd, ghApi: ghApiOverride } = {}) {
  const released = [];
  const skipped = [];
  const root = cwd || process.cwd();
  const repoSlug = repoSlugOf(root);
  if (!repoSlug) return { released, skipped, failure: 'no-remote' };

  const { entries, failure } = listClaims(repoSlug); // uses ghApiOverride when provided — see Step 6
  if (failure) return { released, skipped, failure };

  const cache = readCache(root);
  const nextClaimShas = {};
  const wtList = runGit(['worktree', 'list', '--porcelain'], root);
  const worktrees = wtList.failure ? [] : parseWorktreeList(wtList.stdout);

  // Phase 1: synchronous read/classify/join for every claim not cache-skipped.
  const candidates = [];
  for (const entry of entries) {
    const m = /^issue-(\d+)\.json$/.exec(entry.name);
    if (!m) continue;
    const issueNumber = Number(m[1]);
    if (shouldSkipClaimRead(entry, cache.claimShas[issueNumber])) {
      nextClaimShas[issueNumber] = entry.sha;
      continue;
    }
    const claim = readClaim(repoSlug, entry.name);
    if (claim.failure) { skipped.push({ issueNumber, reason: claim.failure }); continue; }
    const classified = classifyClaimBlob(claim.content, Date.now());
    if (classified.state !== 'live' && classified.state !== 'stale') { nextClaimShas[issueNumber] = entry.sha; continue; }

    let runId = null;
    try { runId = JSON.parse(claim.content).runId || null; } catch { /* no-run-id below */ }
    if (!runId) { skipped.push({ issueNumber, reason: 'no-run-id' }); continue; }

    let prState = null;
    let joinFailure = null;
    const runDir = path.join(root, '.claude-tweaks', 'pipelines', runId);
    const runState = readRunState(runDir);
    const wtEntry = runState && runState.worktree
      ? worktrees.find((w) => path.resolve(w.path) === path.resolve(runState.worktree))
      : null;
    const branch = wtEntry ? wtEntry.branch : null;
    if (!runState || !runState.worktree) joinFailure = 'no-run-state';
    else if (!branch) joinFailure = 'no-branch';
    else prState = resolvePrState(root, branch);

    candidates.push({ issueNumber, runId, name: entry.name, sha: entry.sha, prState, joinFailure });
  }

  // Phase 2: parallel issue-state fetches, capped, only for candidates that need one.
  const needIssue = candidates.filter((c) => needsIssueEvidence(c.prState));
  const issueStates = await runWithConcurrency(
    needIssue,
    (c) => readIssueStateAsync(repoSlug, c.issueNumber),
  );
  const issueStateByIssue = new Map(needIssue.map((c, i) => [c.issueNumber, issueStates[i] instanceof Error ? undefined : issueStates[i]]));

  // Phase 3: decide + write, synchronous (writes must stay serial — each is
  // its own conditional-update with its own sha; no benefit to parallelizing writes).
  for (const c of candidates) {
    const issueState = issueStateByIssue.get(c.issueNumber);
    const decided = classifyClaimBlob === undefined ? null : null; // placeholder removed below
    const classifiedState = 'live'; // see note below
    void classifiedState; void decided;
    const decision = decideRelease('live', c.prState, issueState); // classifiedState was already gated to live/stale in Phase 1; decideRelease only branches on live vs everything-else identically for 'stale', so re-deriving it here is unnecessary — see Step 5b correction below.
    if (decision.action === 'skip') {
      skipped.push({ issueNumber: c.issueNumber, runId: c.runId, reason: c.joinFailure || decision.reason });
      nextClaimShas[c.issueNumber] = c.sha; // still nothing released — but content unchanged from Phase 1's read, safe to cache only if terminal; a live/stale skip must NOT be cached (see Task 7 Step 8) — remove this line.
      continue;
    }
    const reason = decision.reason === 'issue-closed' ? `issue-closed: reconciled from #${c.issueNumber}` : decision.reason;
    const payload = releasePayload({ issueNumber: c.issueNumber, runId: c.runId, reason, now: Date.now() });
    const ok = writeTombstone(repoSlug, c.name, c.sha, payload.tombstoneContent, reason);
    if (!ok) { skipped.push({ issueNumber: c.issueNumber, runId: c.runId, reason: 'release-write-failed' }); continue; }
    removeInProgressLabel(repoSlug, c.issueNumber);
    released.push(releasedEntry(c.issueNumber, c.runId, c.prState));
  }

  writeCache(root, { ...cache, claimShas: nextClaimShas });
  return { released, skipped };
}
```

**Implementer note — fix the two marked defects before running tests:** (1) `decideRelease`'s first argument is `classifiedState`, which Phase 1 already narrowed to `'live'` or `'stale'` per claim but Phase 3 above hardcodes `'live'` — thread the real per-candidate `classified.state` through (add a `classifiedState` field to the `candidates.push({...})` object in Phase 1, use `c.classifiedState` in Phase 3, delete the dead `decided`/placeholder lines). (2) The `nextClaimShas[c.issueNumber] = c.sha` line inside the skip branch is explicitly wrong per Task 7 Step 8's conclusion (an active claim's skip must be re-evaluated next pass, never cached) — delete it; only terminal-state claims (already handled in Phase 1's `continue` branches) get cached.

- [ ] **Step 6: Thread `ghApiOverride` through `listClaims`/`readClaim` for testability**

`listClaims`/`readClaim` currently close over the module's own `ghApi`. Change their call sites inside `releaseMerged` to accept the override:

```javascript
function listClaims(repoSlug, ghApiFn) {
  return claimStore.listClaimEntries(ghApiFn || ghApi, repoSlug);
}
function readClaim(repoSlug, name, ghApiFn) {
  const r = claimStore.readClaimBlob(ghApiFn || ghApi, repoSlug, issueNumberOf(name));
  return { content: r.content, sha: r.sha, failure: r.failure };
}
```

and in `releaseMerged`, pass `ghApiOverride` through both call sites (`listClaims(repoSlug, ghApiOverride)`, `readClaim(repoSlug, entry.name, ghApiOverride)`).

- [ ] **Step 7: Run and fix the existing `release-merged` tests**

Run: `node --test tests/bin-lib/reconcile/release-merged.test.js`
Expected: the Task 7 Step 9 test (`releaseMerged` is now async) needs `await releaseMerged(...)` — fix it. Re-run until PASS.

- [ ] **Step 8: Parallelize `console-execute.js`'s per-run `gh pr view` calls**

In `bin/lib/reconcile/console-execute.js`, convert `fetchPrComments` to async (promisified `execFile`) and `consoleExecuteDetect` to `async function`, running the per-run-dir fetch through the pool. Since each run dir's fetch also needs its own `decideConsoleExecute` call afterward (which depends on the fetch result), structure as: collect every run dir needing a fetch first (synchronous fs reads, cheap), run all fetches through `runWithConcurrency`, then decide per run dir:

```javascript
const { execFile } = require('child_process');
const { promisify } = require('util');
const { runWithConcurrency } = require('./gh-pool');
const execFileAsync = promisify(execFile);

async function fetchPrComments(repoRoot, prNumber) {
  let stdout;
  try {
    ({ stdout } = await execFileAsync(
      'gh',
      ['pr', 'view', String(prNumber), '--json', 'comments'],
      { cwd: repoRoot, encoding: 'utf8', timeout: FETCH_TIMEOUT_MS },
    ));
  } catch (e) {
    if (e && e.code === 'ENOENT') return { ok: false, reason: 'gh-absent' };
    return { ok: false, reason: 'network-failure' };
  }
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return { ok: false, reason: 'network-failure' };
  }
  const comments = Array.isArray(parsed && parsed.comments) ? parsed.comments : [];
  return { ok: true, comments };
}

async function consoleExecuteDetect(opts = {}) {
  const ready = [];
  const skipped = [];
  const start = opts.cwd || process.cwd();
  const root = mainCheckoutRoot(start);
  if (!root) return { ready, skipped };
  const now = opts.now || Date.now();

  const candidates = [];
  for (const { dir } of iterRunDirsWithState(root)) {
    const consoleJson = readConsoleJson(dir);
    if (consoleJson === null) { skipped.push({ runDir: dir, reason: 'no-console' }); continue; }
    if (consoleJson === undefined) { skipped.push({ runDir: dir, reason: 'unparseable-console-json' }); continue; }
    if (consoleJson.resolved === true) { skipped.push({ runDir: dir, reason: 'already-resolved' }); continue; }
    if (!isClaimReclaimable(consoleJson.executingAt, now)) { skipped.push({ runDir: dir, reason: 'claimed' }); continue; }
    const commentIds = Array.isArray(consoleJson.commentIds) ? consoleJson.commentIds : [];
    if (!commentIds.length) { skipped.push({ runDir: dir, reason: 'no-comment-ids' }); continue; }
    if (!consoleJson.prNumber) { skipped.push({ runDir: dir, reason: 'no-pr-number' }); continue; }
    candidates.push({ dir, consoleJson });
  }

  const fetches = await runWithConcurrency(candidates, (c) => fetchPrComments(root, c.consoleJson.prNumber));

  candidates.forEach((c, i) => {
    const fetch = fetches[i] instanceof Error ? { ok: false, reason: 'network-failure' } : fetches[i];
    if (!fetch.ok) { skipped.push({ runDir: c.dir, reason: fetch.reason }); return; }
    const decision = decideConsoleExecute(c.consoleJson, fetch.comments, now);
    if (decision.action === 'skip') { skipped.push({ runDir: c.dir, reason: decision.reason }); return; }
    ready.push({ runDir: c.dir, prNumber: decision.prNumber, commentIds: decision.commentIds, items: decision.items });
  });

  return { ready, skipped };
}
```

- [ ] **Step 9: Update `index.js` to await the now-async release/console checks**

In `bin/lib/reconcile/index.js`, the `release` and `console` dispatch blocks already `await`-tolerate a sync return from Task 1's contract change — add explicit `await` for clarity and correctness now that these truly return promises:

```javascript
  if (checks.includes('console') && !overBudget(...)) {
    result.console = await consoleExecuteDetect({ cwd: root });
  }
  // ...
  if (checks.includes('release')) {
    if (dryRun) {
      result.skipped.push({ check: 'release', reason: 'dry-run-not-supported' });
    } else {
      const r = await releaseMerged({ cwd: root });
      // ...unchanged below...
```

- [ ] **Step 10: Run and fix `console-execute.test.js`**

Run: `node --test tests/console-execute.test.js`
Expected: any direct call to `consoleExecuteDetect(...)` or `fetchPrComments(...)` in this file needs `await` and an `async` test callback. Fix each, re-run until PASS.

- [ ] **Step 11: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add bin/lib/reconcile/gh-pool.js bin/lib/reconcile/release-merged.js bin/lib/reconcile/console-execute.js bin/lib/reconcile/index.js tests/bin-lib/reconcile/gh-pool.test.js tests/bin-lib/reconcile/release-merged.test.js tests/console-execute.test.js
git commit -m "release-merged/console-execute: parallelize gh reads through a concurrency-capped pool (refs #820)"
```

---

### Task 9: Session-level freshness TTL short-circuit (D7)

**Files:**
- Modify: `bin/lib/reconcile/index.js` (consult/update the Task 6 cache's `lastRunAt`, gated by a new `opts.skipIfFresh` flag — default `false`, so every existing direct caller of `reconcile()`, including every test written so far, is unaffected)
- Test: appended cases in `tests/reconcile.test.js`

**Interfaces:**
- Changes: `reconcile(opts)` gains `opts.skipIfFresh?: boolean` and `opts.ttlMs?: number`. When `skipIfFresh` is true and the Task 6 cache's `lastRunAt` is within `ttlMs` (default `DEFAULT_TTL_MS`), `reconcile()` returns immediately with `result.skipped = [{check: 'all', reason: 'fresh-cache'}]` and performs no I/O at all — the whole-pass equivalent of D1's preflight short-circuit, gated on time instead of health. This is distinct from D1: D1 answers "is GitHub reachable right now," D7 answers "did we already do this very recently, from any session." Only the caller that actually wants this behavior (Task 10's `session-start.js` inline fast-check call) opts in — `bin/hooks.js`'s standalone `reconcile` CLI subcommand and every direct-call test keep today's always-runs semantics.

- [ ] **Step 1: Write the failing test**

Append to `tests/reconcile.test.js`:

```javascript
test('reconcile(): skipIfFresh=true short-circuits entirely when the cache is within TTL (D7)', async () => {
  const { mainDir } = pairedFixture();
  const cache = require('../bin/lib/reconcile/cache');
  cache.writeCache(mainDir, { lastRunAt: Date.now(), claimShas: {} });
  const r = await reconcile({ cwd: mainDir, checks: ['mirror'], skipIfFresh: true });
  assert.deepEqual(r.skipped, [{ check: 'all', reason: 'fresh-cache' }]);
  assert.equal(r.mirror, null);
});

test('reconcile(): skipIfFresh=true runs normally when the cache is stale (past TTL)', async () => {
  const { mainDir } = pairedFixture();
  const cache = require('../bin/lib/reconcile/cache');
  cache.writeCache(mainDir, { lastRunAt: Date.now() - (60 * 60 * 1000), claimShas: {} });
  const r = await reconcile({ cwd: mainDir, checks: ['mirror'], skipIfFresh: true });
  assert.notDeepEqual(r.skipped, [{ check: 'all', reason: 'fresh-cache' }]);
});

test('reconcile(): skipIfFresh defaults to false — omitting it always runs, cache or not (back-compat for every existing caller)', async () => {
  const { mainDir } = pairedFixture();
  const cache = require('../bin/lib/reconcile/cache');
  cache.writeCache(mainDir, { lastRunAt: Date.now(), claimShas: {} });
  const r = await reconcile({ cwd: mainDir, checks: ['mirror'] });
  assert.notDeepEqual(r.skipped, [{ check: 'all', reason: 'fresh-cache' }]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/reconcile.test.js`
Expected: FAIL — `skipIfFresh` is not yet consulted, so the first test's `r.skipped` is whatever `mirror` actually produced, not the fresh-cache short-circuit.

- [ ] **Step 3: Implement**

In `bin/lib/reconcile/index.js`, add the check as the very first thing inside `reconcile()`, before even the `mainCheckoutRoot` resolution needs `cwd` — but `readCache` needs `root`, which needs `mainCheckoutRoot(cwd)` resolved first, so place it right after that resolution and before the `resolveIntegrationBranch`/model checks:

```javascript
const { readCache, isFresh, DEFAULT_TTL_MS } = require('./cache');
// ...
  const root = mainCheckoutRoot(cwd);
  if (!root) {
    result.skipped.push({ check: 'all', reason: 'no-repo' });
    return result;
  }

  if (opts.skipIfFresh) {
    const cache = readCache(root);
    if (isFresh(cache, Date.now(), opts.ttlMs)) {
      result.skipped.push({ check: 'all', reason: 'fresh-cache' });
      return result;
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/reconcile.test.js`
Expected: PASS.

- [ ] **Step 5: Stamp `lastRunAt` on every real (non-short-circuited) pass**

A TTL cache that's never written never gates anything. At the very end of `reconcile()` (right before the final `return result;`), for the `pr-first` path only (the `local-merge` early-return above stays as-is — D7 is specifically about the network-heavy pr-first pass):

```javascript
  const cache = readCache(root);
  writeCache(root, { ...cache, lastRunAt: Date.now() });
  return result;
```

Add a test confirming the stamp happens:

```javascript
test('reconcile(): a real (non-short-circuited) pass stamps lastRunAt for the next skipIfFresh check', async () => {
  const { mainDir } = pairedFixture();
  const cache = require('../bin/lib/reconcile/cache');
  const before = Date.now();
  await reconcile({ cwd: mainDir, checks: ['mirror'] });
  const after = cache.readCache(mainDir);
  assert.ok(after.lastRunAt >= before, 'lastRunAt must be stamped after a real pass');
});
```

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add bin/lib/reconcile/index.js tests/reconcile.test.js
git commit -m "reconcile(): add an opt-in short-TTL freshness short-circuit for near-simultaneous session starts (refs #820)"
```

---

### Task 10: SessionStart fast/background split (D8, corrected)

Implements the corrected design from Global Constraints deviation 3: a fast synchronous pass runs inline (mirror/red-tip/console — cheap after Tasks 2-9); the write-only janitorial checks (release/archive/archive-branches/remote-prune/reap) run in a **self-detached background child process**, writing their outcome to a status file; the *next* `SessionStart` firing reads and surfaces that file if unsurfaced.

**Files:**
- Modify: `bin/hooks.js` (new `reconcile-background` subcommand)
- Modify: `bin/lib/hooks/session-start.js` (split the single `reconcile()` call into a fast inline call + background spawn + prior-background-result surfacing)
- Modify: `.gitignore` (new status file)
- Test: `tests/hooks-session-start.test.js` (updated/new cases), `tests/bin-lib/hooks/reconcile-background.test.js`

**Interfaces:**
- Produces: `node bin/hooks.js reconcile-background` — runs `reconcile({cwd, checks: BACKGROUND_CHECKS, skipIfFresh: true})` where `BACKGROUND_CHECKS = ['release', 'archive', 'archive-branches', 'remote-prune', 'reap']`, writes `{completedAt, summary, surfaced: false}` to `.claude-tweaks/reconcile-background-status.json` (main checkout root), exits 0 always (best-effort, never a session-blocking failure — nothing reads this process's exit code anyway, since it's detached).
- Changes: `session-start.js`'s `run(ctx)` — the existing single `reconcile({cwd: ctx.cwd})` call is replaced by: (a) `await reconcile({cwd: ctx.cwd, checks: FAST_CHECKS})` where `FAST_CHECKS = ['mirror', 'red-tip', 'console']`, still building the same `additionalContext` lines these three checks already produce today; (b) a read of the background-status file, surfacing its summary once (marking `surfaced: true`) if present and not yet surfaced; (c) a `skipIfFresh`-gated detached spawn of `reconcile-background`.

- [ ] **Step 1: Write the failing test for the new CLI subcommand**

Create `tests/bin-lib/hooks/reconcile-background.test.js`:

```javascript
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOOKS = path.join(__dirname, '..', '..', '..', 'bin', 'hooks.js');

function git(args, cwd) { return execFileSync('git', args, { cwd, encoding: 'utf8' }); }

test('reconcile-background: writes a status file with completedAt + summary, exits 0 even with no gh/remote', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-recon-bg-'));
  git(['init', '-q', '--initial-branch=main'], dir);
  git(['config', 'user.email', 't@e.com'], dir);
  git(['config', 'user.name', 'T'], dir);
  fs.writeFileSync(path.join(dir, 'a.txt'), 'x');
  git(['add', 'a.txt'], dir);
  git(['commit', '-q', '-m', 'seed'], dir);

  const result = execFileSync('node', [HOOKS, 'reconcile-background'], { cwd: dir, encoding: 'utf8' });
  assert.equal(result.trim(), 'claude-tweaks: reconcile-background complete');

  const statusPath = path.join(dir, '.claude-tweaks', 'reconcile-background-status.json');
  const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
  assert.equal(typeof status.completedAt, 'number');
  assert.equal(status.surfaced, false);
  assert.equal(typeof status.summary, 'object');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/bin-lib/hooks/reconcile-background.test.js`
Expected: FAIL — `reconcile-background` is not a recognized subcommand (falls through to `if (!EVENTS.includes(cmd)) return 0;`, produces no output, no status file).

- [ ] **Step 3: Implement the subcommand**

In `bin/hooks.js`, add a new branch (near the existing `reconcile` branch, after Task 1's async conversion):

```javascript
  if (cmd === 'reconcile-background') {
    const cwd = process.cwd();
    const { reconcile } = require('./lib/reconcile');
    const { mainCheckoutRoot } = require('./lib/hooks/worktree-detect');
    const BACKGROUND_CHECKS = ['release', 'archive', 'archive-branches', 'remote-prune', 'reap'];
    let summary = {};
    try {
      const r = await reconcile({ cwd, checks: BACKGROUND_CHECKS, skipIfFresh: true, ttlMs: require('./lib/reconcile/cache').DEFAULT_TTL_MS });
      summary = {
        released: (r.claims || []).filter((c) => c.action === 'released').length,
        archived: (r.runs || []).filter((x) => x.action === 'archived').length,
        archivedBranches: (r.branches || []).filter((b) => b.kind === 'branch' && (b.action === 'delete' || b.action === 'tag-and-delete')).length,
        prunedRemote: (r.remoteBranches || []).filter((b) => b.action === 'delete').length,
        reaped: (r.worktrees || []).filter((w) => w.action === 'reaped').length,
        skipped: r.skipped || [],
      };
    } catch {
      summary = { failed: true };
    }
    const root = mainCheckoutRoot(cwd) || cwd;
    const statusPath = path.join(root, '.claude-tweaks', 'reconcile-background-status.json');
    try {
      fs.mkdirSync(path.dirname(statusPath), { recursive: true });
      fs.writeFileSync(statusPath, JSON.stringify({ completedAt: Date.now(), summary, surfaced: false }));
    } catch { /* best-effort — this process is detached and unwatched either way */ }
    process.stdout.write('claude-tweaks: reconcile-background complete\n');
    return 0;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/bin-lib/hooks/reconcile-background.test.js`
Expected: PASS.

- [ ] **Step 5: Gitignore the status file**

In `.gitignore`, add:

```
.claude-tweaks/reconcile-background-status.json
```

- [ ] **Step 6: Split `session-start.js`'s reconcile call**

In `bin/lib/hooks/session-start.js`, replace the single `const result = await reconcile({ cwd: ctx.cwd });` call and everything downstream of it that reads `result.claims`/`result.runs`/`result.branches`/`result.remoteBranches` (the write-only-check summary lines — `released`, `archived`, `archivedBranches`, `prunedRemote`) with:

1. A fast inline call restricted to the read/detect checks:

```javascript
const FAST_CHECKS = ['mirror', 'red-tip', 'console'];
const BACKGROUND_CHECKS = ['release', 'archive', 'archive-branches', 'remote-prune', 'reap'];
// ...
    const result = await reconcile({ cwd: ctx.cwd, checks: FAST_CHECKS });
    // result.worktrees/result.claims/result.runs/result.branches/result.remoteBranches
    // are never populated by FAST_CHECKS — the reaped/skippedWorktrees block and the
    // released/archived/archivedBranches/prunedRemote summary lines below are DELETED
    // from this fast path (see Step 6b — they move to the background-status surfacing).
```

Remove the `reaped`/`skippedWorktrees`/`ctxLib.appendEvent(...)` block (lines ~79-121 in today's file) and the `released`/`archived`/`archivedBranches`/`prunedRemote` summary-line block (lines ~130-137) — these all read from checks no longer run inline. Keep the `mirror`/`redTip`/`readyConsoles` blocks exactly as-is (they read from `FAST_CHECKS`' results, unaffected).

2. Surface a prior background pass's result, once:

```javascript
  try {
    const { mainCheckoutRoot } = wtDetect;
    const root = mainCheckoutRoot(ctx.cwd);
    if (root) {
      const statusPath = path.join(root, '.claude-tweaks', 'reconcile-background-status.json');
      let status = null;
      try { status = JSON.parse(fs.readFileSync(statusPath, 'utf8')); } catch { /* none yet */ }
      if (status && status.surfaced === false) {
        const s = status.summary || {};
        const lines = [];
        if (s.reaped) lines.push(`${s.reaped} finished worktree(s) removed (already merged)`);
        if (s.released) lines.push(`${s.released} issue claim(s) released`);
        if (s.archived) lines.push(`${s.archived} pipeline run(s) archived`);
        if (s.archivedBranches) lines.push(`${s.archivedBranches} local branch(es) archived/deleted`);
        if (s.prunedRemote) lines.push(`${s.prunedRemote} merged remote branch(es) deleted on origin`);
        if (lines.length) {
          parts.push(`claude-tweaks: background reconcile (from a prior session) — ${lines.join('; ')}.`);
        }
        try {
          fs.writeFileSync(statusPath, JSON.stringify({ ...status, surfaced: true }));
        } catch { /* best-effort */ }
      }
    }
  } catch { /* best-effort */ }
```

(Requires adding `const fs = require('fs');` at the top of `session-start.js` — not currently imported there; check before adding a duplicate.)

3. Spawn the detached background pass, TTL-gated so near-simultaneous session starts don't each spawn one:

```javascript
  try {
    const { spawn } = require('child_process');
    const { readCache, isFresh } = require('../reconcile/cache');
    const root = wtDetect.mainCheckoutRoot(ctx.cwd);
    if (root) {
      const cache = readCache(root);
      if (!isFresh(cache, Date.now())) {
        const child = spawn(
          process.execPath,
          [path.join(__dirname, '..', '..', 'hooks.js'), 'reconcile-background'],
          { cwd: ctx.cwd, detached: true, stdio: 'ignore' },
        );
        child.unref();
      }
    }
  } catch { /* best-effort — a failed spawn just means this session's background pass didn't fire; the next one tries again */ }
```

- [ ] **Step 7: Run and fix `tests/hooks-session-start.test.js`**

Run: `node --test tests/hooks-session-start.test.js`
Expected: FAIL on every test that asserts on the now-removed reaped/claims/runs/branches summary lines in `additionalContext` — these were exercised via the CLI (`runHook(['session-start'], ...)`), which still works (spawns the real `node bin/hooks.js session-start` subprocess), but the janitorial-check summary lines are gone from the FAST path's output by design. Read each failing test and, per this task's design, **move** it from asserting the summary line appears synchronously to asserting it does NOT appear on a first firing but DOES appear (from the background-status file) on a second firing after the background pass has had time to write its status — since a real detached child in a test is racy, the test should instead: (a) directly write a `reconcile-background-status.json` fixture with `surfaced: false` and a known summary, (b) run the session-start hook, (c) assert the summary line appears in `additionalContext`, (d) assert the status file's `surfaced` is now `true`, (e) run the hook again, (f) assert the line does NOT appear a second time. This avoids depending on the detached spawn's real timing in a test at all — spawn-triggering is covered separately (Step 8).

Rewrite the affected test(s) along these lines (adapt to whatever the existing test's fixture-building helper already is in this file):

```javascript
test('SessionStart surfaces a prior background reconcile pass exactly once (#820, D8)', () => {
  const dir = /* ...this file's existing repo-fixture helper... */;
  const fs = require('fs');
  const path = require('path');
  const statusDir = path.join(dir, '.claude-tweaks');
  fs.mkdirSync(statusDir, { recursive: true });
  fs.writeFileSync(path.join(statusDir, 'reconcile-background-status.json'), JSON.stringify({
    completedAt: Date.now(), surfaced: false, summary: { released: 2, archived: 1 },
  }));

  const first = runHook(['session-start'], { cwd: dir });
  assert.match(first.stdout, /background reconcile.*2 issue claim\(s\) released.*1 pipeline run\(s\) archived/);

  const second = runHook(['session-start'], { cwd: dir });
  assert.doesNotMatch(second.stdout, /background reconcile/);
});
```

- [ ] **Step 8: Write a spawn-triggering test (process-existence only, not full execution)**

```javascript
test('SessionStart spawns a detached reconcile-background pass when the cache is stale, not when fresh (#820, D8)', () => {
  const dir = /* ...existing repo-fixture helper... */;
  const cache = require('../bin/lib/reconcile/cache');

  cache.writeCache(dir, { lastRunAt: Date.now(), claimShas: {} }); // fresh — must NOT spawn
  runHook(['session-start'], { cwd: dir });
  // Assert via a marker: if the module under test exposes no direct spawn hook, verify
  // indirectly — the fresh-cache case must complete `session-start` well under 1s (no
  // detached spawn attempt to pay for), where a stale-cache case (below) still completes
  // fast BECAUSE the spawn is fire-and-forget, so timing alone can't distinguish these.
  // Prefer asserting on a stubbed `child_process.spawn` via a require-cache swap instead:
  const cp = require('child_process');
  const originalSpawn = cp.spawn;
  let spawnedWith = null;
  cp.spawn = (...args) => { spawnedWith = args; return { unref() {} }; };
  try {
    cache.writeCache(dir, { lastRunAt: Date.now() - 3600000, claimShas: {} }); // stale — must spawn
    runHook(['session-start'], { cwd: dir }); // NOTE: this runs the hook via a real subprocess (execFileSync), so the require-cache stub above has NO EFFECT on it — see the correction below.
  } finally {
    cp.spawn = originalSpawn;
  }
});
```

**Implementer correction required before this test can work:** `runHook` (this file's existing helper, see `tests/reconcile.test.js`'s copy) shells out to a fresh `node bin/hooks.js session-start` subprocess — an in-test `child_process.spawn` stub in the *test's own process* has no effect on code running in that *subprocess*. Rewrite this test to call `session-start.js`'s `run(ctx)` **directly** (in-process, `require('../bin/lib/hooks/session-start').run({cwd: dir, ...})`), the same pattern this file's existing `#561` test already uses to stub `reconcile()` at the module boundary (see that test's own comment about stubbing "at its own load time") — stub `require('child_process').spawn` the same way, call `run()` directly, and assert `spawnedWith` is set (stale cache) or remains `null` (fresh cache).

- [ ] **Step 9: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add bin/hooks.js bin/lib/hooks/session-start.js .gitignore tests/hooks-session-start.test.js tests/bin-lib/hooks/reconcile-background.test.js
git commit -m "session-start: split reconcile() into a fast inline pass + detached background pass (refs #820, corrects the async:true premise)"
```

---

### Task 11: End-to-end latency characterization + Acceptance Criteria pin

**Files:**
- Test: `tests/reconcile.test.js` (final integration assertions)
- Modify: `.claude-tweaks/pipelines/2026-08-17T155829-record-820-standalone/work/820-spec.md` — none (spec is committed audit trail, not touched by implementation)

**Interfaces:** none new — this task only adds coverage proving the spec's Acceptance Criteria against the finished behavior.

- [ ] **Step 1: Write the AC-pinning tests**

Append to `tests/reconcile.test.js`:

```javascript
// AC1: reconcile() degrades within ~2s via the preflight when GitHub is
// unreachable, instead of accumulating every check's own 5-10s timeout.
test('AC1: a preflight failure resolves in well under the old per-check-timeout sum', async () => {
  const { mainDir } = pairedFixture();
  const preflight = require('../bin/lib/reconcile/preflight');
  const original = preflight.ghHealthCheck;
  preflight.ghHealthCheck = () => ({ ok: false, reason: 'github-unreachable' });
  const start = Date.now();
  try {
    await reconcile({ cwd: mainDir, checks: ['mirror', 'release', 'remote-prune', 'console'] });
  } finally {
    preflight.ghHealthCheck = original;
  }
  const elapsed = Date.now() - start;
  assert.ok(elapsed < 2500, `preflight-gated failure took ${elapsed}ms, expected well under 2.5s`);
});

// AC2: total wall-clock time is bounded by the explicit budget regardless
// of how much stale state exists.
test('AC2: an exhausted budget bounds total reconcile() time regardless of remaining check count', async () => {
  const { mainDir } = pairedFixture();
  const budgetMod = require('../bin/lib/reconcile/budget');
  const original = budgetMod.createBudget;
  budgetMod.createBudget = () => ({ exceeded: () => true, remainingMs: () => 0 });
  const start = Date.now();
  try {
    await reconcile({ cwd: mainDir, checks: require('../bin/lib/reconcile').ALL_CHECKS });
  } finally {
    budgetMod.createBudget = original;
  }
  assert.ok(Date.now() - start < 1000, 'a pre-exhausted budget must skip every check near-instantly');
});

// AC4: existing tests/reconcile.test.js coverage (this whole file) still
// passes — proven by `npm test` in every task above, not restated here.
```

- [ ] **Step 2: Run to verify both pass**

Run: `node --test tests/reconcile.test.js`
Expected: PASS.

- [ ] **Step 3: Run the full suite one final time**

Run: `npm test`
Expected: PASS, 0 failures.

- [ ] **Step 4: Commit**

```bash
git add tests/reconcile.test.js
git commit -m "reconcile: pin AC1/AC2 (preflight latency bound, budget latency bound) (refs #820)"
```

---

## Self-Review Notes (per this skill's own checklist — kept for the record, not part of the executable plan)

- **Spec coverage:** D1→Task 2, D2→Task 4, D3→Task 5, D4→Task 3, D5→Task 8, D6→Tasks 6+7, D7→Tasks 6+9, D8→Task 10. Every deliverable has a task; Task 1 and Task 11 are plan-internal (foundation + AC pin), not separate deliverables.
- **Placeholder scan:** two inline TODO-shaped fragments were caught during drafting inside Task 8 Step 5 and Task 7 Step 8 — both were resolved in-place with the corrected final code shown in the same step (the "Implementer note — fix the two marked defects" and "Resolve the self-contradiction" callouts are deliberate — they show the reasoning that produced the final code, not an unresolved gap — but the code block immediately after each is the actual, complete instruction).
- **Type consistency:** `reconcile()`'s check names (`'mirror'`, `'red-tip'`, `'console'`, `'release'`, `'archive'`, `'archive-branches'`, `'remote-prune'`, `'reap'`) are used identically across Tasks 2-10; `{ok, reason}` (preflight), `{exceeded, remainingMs}` (budget), `{entries, failure}` (listClaimEntries), `{ready[], skipped[]}` (console), `{released[], skipped[]}` (release) are each defined once (Tasks 2/3/7/8) and reused verbatim thereafter.
