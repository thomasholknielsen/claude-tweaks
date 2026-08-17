# Reconcile Red-Tip Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an unconditional, inform-tier red-tip check to the reconcile layer so a failing CI conclusion on the integration branch's tip surfaces at SessionStart, covering direct pushes that no merge gate ever sees.

**Architecture:** A new pure-decision + thin-I/O module (`bin/lib/reconcile/red-tip.js`), matching the existing `console-execute.js`/`archive-branches.js` split (pure `decideRedTip` takes already-fetched check-run data; a small wrapper does the `git rev-parse` + `gh api` I/O). Wired into `bin/lib/reconcile/index.js`'s `ALL_CHECKS` immediately after `mirror` so it reads the ref `mirror-ff.js`'s fetch just refreshed. Rendered by `bin/lib/hooks/session-start.js` as one additional `additionalContext` line, inform tier — never throws, never blocks.

**Tech Stack:** Node.js (built-ins only) + `gh` CLI subprocess (`child_process.execFileSync`), `node --test`.

**Spec:** `.claude-tweaks/pipelines/2026-08-16T091748-record-561/work/561-spec.md`

## Global Constraints

- Checks API only — never the legacy commit-status API (`/commits/{sha}/status`).
- Red = conclusion `failure` or `timed_out` only. `cancelled`, `neutral`, `stale`, `action_required`, `skipped` are never red. `in_progress`/`queued` are status values, not conclusions, and are never red.
- The check never throws out of the hook path — every failure mode (no CI, `gh` absent, any API error, unparseable response) resolves to `null` (no finding), matching reconcile's existing degrade posture.
- Dedupe to the newest run per check name before judging red — a superseded failed run followed by a green rerun on the same sha is not a finding. "Newest" = highest check-run `id` (GitHub's check-run ids are monotonically increasing; no timestamp comparison needed).
- No merge behavior changes, no policy gating — runs unconditionally whenever reconcile runs under `integration-model: pr-first` (inherited for free: the `model !== 'pr-first'` early-return in `index.js` already exits before the mirror/red-tip dispatch block, so no separate `local-merge` path is added).
- No `--jq`/pagination mocking convention exists in this test suite for `gh` subprocess calls (confirmed: no test file in `tests/bin-lib/reconcile/` or `tests/*.test.js` mocks `execFileSync('gh', ...)`). Follow the established split this codebase already uses (`console-execute.js`, `archive-branches.js`): pure decision/parsing functions get full unit coverage with fabricated data; the I/O wrapper gets only a cheap, gh-independent degrade-path test (git-level failure, no live `gh` call needed) — the same scope `tests/hooks-session-start.test.js`'s `#413` console test already accepts for its own gh-dependent wiring.

---

### Task 1: `bin/lib/reconcile/red-tip.js` — pure decision/parsing + I/O wrapper

**Files:**
- Create: `bin/lib/reconcile/red-tip.js`
- Test: `tests/bin-lib/reconcile/red-tip.test.js`

**Interfaces:**
- Produces (consumed by Task 2's `index.js` wiring):
  - `redTipCheck(repoRoot: string, integration: string) -> { branch, sha, failing: string[], message: string } | null`
  - Also exported for direct unit testing: `decideRedTip({ branch, sha, checkRuns }) -> finding | null`, `dedupeNewestByName(checkRuns) -> Map<name, run>`, `parseCheckRunLines(stdout) -> { ok: true, runs } | { ok: false, reason }`, `RED_CONCLUSIONS` (a `Set`).
  - `checkRuns` element shape: `{ id: number, name: string, conclusion: string|null }`.

- [ ] **Step 1: Write the failing test file**

```javascript
// tests/bin-lib/reconcile/red-tip.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  decideRedTip,
  dedupeNewestByName,
  parseCheckRunLines,
  redTipCheck,
} = require('../../../bin/lib/reconcile/red-tip');

// --- dedupeNewestByName: highest id per name wins ---

test('dedupeNewestByName: two runs same name, highest id wins', () => {
  const runs = [
    { id: 10, name: 'ci/tests', conclusion: 'failure' },
    { id: 12, name: 'ci/tests', conclusion: 'success' },
  ];
  const byName = dedupeNewestByName(runs);
  assert.strictEqual(byName.size, 1);
  assert.strictEqual(byName.get('ci/tests').conclusion, 'success');
});

test('dedupeNewestByName: distinct names both kept', () => {
  const runs = [
    { id: 1, name: 'ci/a', conclusion: 'success' },
    { id: 2, name: 'ci/b', conclusion: 'failure' },
  ];
  const byName = dedupeNewestByName(runs);
  assert.strictEqual(byName.size, 2);
});

test('dedupeNewestByName: empty/null-ish input never throws', () => {
  assert.strictEqual(dedupeNewestByName([]).size, 0);
  assert.strictEqual(dedupeNewestByName(undefined).size, 0);
  assert.strictEqual(dedupeNewestByName([null, { id: 1, name: 'x', conclusion: 'success' }]).size, 1);
});

// --- decideRedTip: AC1-AC3 ---

test('decideRedTip: AC1 single failure -> finding naming branch, short sha, check name', () => {
  const r = decideRedTip({
    branch: 'main',
    sha: '0123456789abcdef0123456789abcdef01234567',
    checkRuns: [{ id: 1, name: 'ci/tests', conclusion: 'failure' }],
  });
  assert.ok(r);
  assert.strictEqual(r.branch, 'main');
  assert.strictEqual(r.sha, '0123456789abcdef0123456789abcdef01234567');
  assert.deepStrictEqual(r.failing, ['ci/tests']);
  assert.match(r.message, /^CI is red on main tip at 0123456 — ci\/tests$/);
});

test('decideRedTip: AC1 multi-failure lists first 3 then "+N more"', () => {
  const checkRuns = ['ci/a', 'ci/b', 'ci/c', 'ci/d', 'ci/e'].map((name, i) => ({ id: i + 1, name, conclusion: 'failure' }));
  const r = decideRedTip({ branch: 'main', sha: 'deadbeef00000000000000000000000000000000', checkRuns });
  assert.strictEqual(r.failing.length, 5);
  assert.match(r.message, /ci\/a, ci\/b, ci\/c \+2 more$/);
});

test('decideRedTip: timed_out is also red', () => {
  const r = decideRedTip({ branch: 'main', sha: 'a'.repeat(40), checkRuns: [{ id: 1, name: 'ci/slow', conclusion: 'timed_out' }] });
  assert.ok(r);
});

test('decideRedTip: AC2 rerun dedup — failed then newer success on same name -> no finding', () => {
  const r = decideRedTip({
    branch: 'main',
    sha: 'b'.repeat(40),
    checkRuns: [
      { id: 5, name: 'ci/tests', conclusion: 'failure' },
      { id: 9, name: 'ci/tests', conclusion: 'success' },
    ],
  });
  assert.strictEqual(r, null);
});

test('decideRedTip: AC3 green -> no finding', () => {
  assert.strictEqual(decideRedTip({ branch: 'main', sha: 'c'.repeat(40), checkRuns: [{ id: 1, name: 'ci/tests', conclusion: 'success' }] }), null);
});

test('decideRedTip: AC3 pending-only (in_progress/queued conclusions are null) -> no finding', () => {
  assert.strictEqual(decideRedTip({ branch: 'main', sha: 'd'.repeat(40), checkRuns: [{ id: 1, name: 'ci/tests', conclusion: null }] }), null);
});

test('decideRedTip: AC3 empty (no CI) -> no finding', () => {
  assert.strictEqual(decideRedTip({ branch: 'main', sha: 'e'.repeat(40), checkRuns: [] }), null);
});

test('decideRedTip: excluded conclusions (cancelled, neutral, stale, action_required, skipped) are never red', () => {
  for (const conclusion of ['cancelled', 'neutral', 'stale', 'action_required', 'skipped']) {
    const r = decideRedTip({ branch: 'main', sha: 'f'.repeat(40), checkRuns: [{ id: 1, name: 'ci/x', conclusion }] });
    assert.strictEqual(r, null, `${conclusion} must not be red`);
  }
});

// --- parseCheckRunLines: pagination path (multiple lines = multiple pages'
// worth of gh api -q output concatenated) ---

test('parseCheckRunLines: multiple NDJSON lines (simulating >1 paginated page) all parse', () => {
  const stdout = [
    '{"id":1,"name":"ci/a","conclusion":"success"}',
    '{"id":2,"name":"ci/b","conclusion":"failure"}',
    '{"id":3,"name":"ci/c","conclusion":null}',
  ].join('\n') + '\n';
  const r = parseCheckRunLines(stdout);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.runs.length, 3);
  assert.strictEqual(r.runs[1].name, 'ci/b');
});

test('parseCheckRunLines: empty stdout -> ok, zero runs', () => {
  const r = parseCheckRunLines('');
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.runs, []);
});

test('parseCheckRunLines: garbage line -> unparseable-response', () => {
  const r = parseCheckRunLines('not json\n');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'unparseable-response');
});

// --- redTipCheck: I/O wrapper, gh-independent degrade path only (no live-gh
// mocking convention exists in this suite — same scope
// tests/hooks-session-start.test.js's #413 console test accepts) ---

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

test('redTipCheck: no origin/{integration} ref reachable (git rev-parse fails) -> null, never throws', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'red-tip-'));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 't@t');
  git(dir, 'config', 'user.name', 't');
  fs.writeFileSync(path.join(dir, 'a.txt'), 'a\n');
  git(dir, 'add', 'a.txt');
  git(dir, 'commit', '-q', '-m', 'init');
  // No 'origin' remote at all -> origin/main cannot resolve.
  assert.strictEqual(redTipCheck(dir, 'main'), null);
});
```

- [ ] **Step 2: Run the test file to verify it fails**

Run: `node --test tests/bin-lib/reconcile/red-tip.test.js`
Expected: FAIL — `Cannot find module '../../../bin/lib/reconcile/red-tip'`

- [ ] **Step 3: Implement `bin/lib/reconcile/red-tip.js`**

```javascript
// bin/lib/reconcile/red-tip.js — convergence check: unconditional, inform-
// tier detection of a failing CI conclusion on the integration branch's tip.
// The only coverage for direct pushes (fast-lane commits, bookkeeping,
// releases) that no merge gate ever sees — deliberately not gated on the
// `merge-verification` policy value. Checks API only (never the legacy
// commit-status API). Pure decision/parsing functions with I/O at the edges,
// matching console-execute.js's and archive-branches.js's split. Never
// throws out of the hook path — every failure mode (no CI, gh absent, API
// error, unparseable response) resolves to null (no finding), matching
// reconcile's existing degrade posture.
'use strict';
const { execFileSync } = require('child_process');
const { runGit } = require('../hooks/git-exec');

const FETCH_TIMEOUT_MS = 5000;
// Conclusions that count as red. `in_progress`/`queued` are status values,
// not conclusions, so they never appear here — pending is not red.
// `cancelled`/`neutral`/`stale`/`action_required`/`skipped` are deliberately
// excluded (Non-Goals).
const RED_CONCLUSIONS = new Set(['failure', 'timed_out']);
const MAX_SHOWN = 3;

// checkRuns: [{id,name,conclusion}] -> Map<name, newest run (highest id)>.
// A superseded failed run followed by a newer rerun of the same check name
// must not double-count — this is the sole dedup mechanism red-tip relies
// on. GitHub check-run ids are monotonically increasing, so max-id is a
// sufficient "newest" signal without needing to compare timestamps.
function dedupeNewestByName(checkRuns) {
  const byName = new Map();
  for (const run of checkRuns || []) {
    if (!run || typeof run.name !== 'string') continue;
    const existing = byName.get(run.name);
    if (!existing || run.id > existing.id) byName.set(run.name, run);
  }
  return byName;
}

// Pure: branch + sha + already-fetched (possibly multi-page) check runs ->
// a finding or null. No I/O — the full decision table (AC1-AC3) is
// unit-testable without a live gh call.
function decideRedTip({ branch, sha, checkRuns }) {
  const byName = dedupeNewestByName(checkRuns);
  const failing = [...byName.values()]
    .filter((r) => RED_CONCLUSIONS.has(r.conclusion))
    .map((r) => r.name)
    .sort();
  if (!failing.length) return null;
  const shortSha = sha.slice(0, 7);
  const shown = failing.slice(0, MAX_SHOWN);
  const more = failing.length - shown.length;
  const suffix = more > 0 ? ` +${more} more` : '';
  const message = `CI is red on ${branch} tip at ${shortSha} — ${shown.join(', ')}${suffix}`;
  return { branch, sha, failing, message };
}

// Pure: raw `gh api --paginate -q '...'` stdout (one compact JSON object per
// line per matched check run, across however many pages were fetched) ->
// { ok: true, runs } | { ok: false, reason: 'unparseable-response' }.
// Exercises the pagination path as a parsing concern, independent of
// however many actual HTTP pages produced the lines.
function parseCheckRunLines(stdout) {
  const lines = (stdout || '').split('\n').filter((l) => l.trim().length > 0);
  const runs = [];
  for (const line of lines) {
    try {
      runs.push(JSON.parse(line));
    } catch {
      return { ok: false, reason: 'unparseable-response' };
    }
  }
  return { ok: true, runs };
}

// I/O: one paginated `gh api` call, newest-run-per-check fields only.
function fetchCheckRuns(repoRoot, sha) {
  let stdout;
  try {
    stdout = execFileSync(
      'gh',
      [
        'api', '--paginate',
        `repos/{owner}/{repo}/commits/${sha}/check-runs`,
        '-q', '.check_runs[] | {id: .id, name: .name, conclusion: .conclusion}',
      ],
      { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: FETCH_TIMEOUT_MS },
    );
  } catch (e) {
    if (e && e.code === 'ENOENT') return { ok: false, reason: 'gh-absent' };
    return { ok: false, reason: 'network-failure' };
  }
  return parseCheckRunLines(stdout);
}

// repoRoot, already-resolved integration branch name -> finding or null.
// Reads origin/{integration}'s tip sha from the LOCAL ref — deliberately no
// fetch of its own; this check is wired immediately after `mirror` in
// index.js's ALL_CHECKS specifically so it reads the ref mirror-ff.js's own
// fetch just refreshed (see index.js's header comment). Every failure mode
// (no such ref, gh absent, API error, unparseable response) degrades to
// null — silent no-op, never a thrown exception out of the hook path.
function redTipCheck(repoRoot, integration) {
  const tip = runGit(['rev-parse', `origin/${integration}`], repoRoot);
  if (tip.failure) return null;
  const fetch = fetchCheckRuns(repoRoot, tip.stdout);
  if (!fetch.ok) return null;
  return decideRedTip({ branch: integration, sha: tip.stdout, checkRuns: fetch.runs });
}

module.exports = { redTipCheck, decideRedTip, dedupeNewestByName, parseCheckRunLines, RED_CONCLUSIONS };
```

- [ ] **Step 4: Run the test file to verify it passes**

Run: `node --test tests/bin-lib/reconcile/red-tip.test.js`
Expected: PASS, all tests green

- [ ] **Step 5: Commit**

```bash
git add bin/lib/reconcile/red-tip.js tests/bin-lib/reconcile/red-tip.test.js
git commit -m "Add reconcile red-tip detection module — dedupe, decide, and gh check-runs fetch"
```

---

### Task 2: Wire `red-tip` into `bin/lib/reconcile/index.js`'s `ALL_CHECKS`

**Files:**
- Modify: `bin/lib/reconcile/index.js:11-26` (import + `ALL_CHECKS` + header comment), `bin/lib/reconcile/index.js:76-78` (dispatch, immediately after `mirror`)
- Modify: `tests/reconcile.test.js` (add dispatch-order pin + `ALL_CHECKS` membership test)

**Interfaces:**
- Consumes: Task 1's `redTipCheck(repoRoot, integration)` from `./red-tip`.
- Produces: `reconcile()`'s return shape gains `result.redTip: { branch, sha, failing, message } | null`, consumed by Task 3's `session-start.js`.

- [ ] **Step 1: Write the failing tests in `tests/reconcile.test.js`**

Add near the existing `'reconcile: reap dispatches strictly after release and archive...'` test (same file, same source-text-pin style — a real ordering regression here has no other test that would catch it without fabricating live check-run state):

```javascript
test('reconcile: ALL_CHECKS includes red-tip immediately after mirror', () => {
  const { ALL_CHECKS } = require('../bin/lib/reconcile');
  const mirrorIdx = ALL_CHECKS.indexOf('mirror');
  assert.strictEqual(ALL_CHECKS[mirrorIdx + 1], 'red-tip', 'red-tip must be the entry immediately after mirror');
});

test('reconcile: red-tip dispatches immediately after mirror in source order (load-bearing — reads the ref mirror-ff just fetched)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'bin', 'lib', 'reconcile', 'index.js'), 'utf8');
  const mirrorIdx = src.indexOf("checks.includes('mirror')");
  const redTipIdx = src.indexOf("checks.includes('red-tip')");
  const consoleIdx = src.indexOf("checks.includes('console')");
  assert.ok(mirrorIdx > 0 && redTipIdx > 0 && consoleIdx > 0);
  assert.ok(mirrorIdx < redTipIdx, 'mirror must dispatch before red-tip');
  assert.ok(redTipIdx < consoleIdx, 'red-tip must dispatch before console');
});
```

(`fs` and `path` are already required at the top of `tests/reconcile.test.js` for the existing reap-ordering test — no new imports needed.)

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/reconcile.test.js`
Expected: FAIL — `ALL_CHECKS[mirrorIdx + 1]` is `'reap'`, not `'red-tip'`; `redTipIdx` is `-1`.

- [ ] **Step 3: Wire the module in**

In `bin/lib/reconcile/index.js`, replace lines 11-26:

```javascript
const { mainCheckoutRoot } = require('../hooks/worktree-detect');
const { resolveIntegrationBranch, reapWorktrees: legacyReapWorktrees } = require('../hooks/worktree-reap');
const { resolveIntegrationModel } = require('../policy-schema');
const { mirrorFastForward } = require('./mirror-ff');
const { redTipCheck } = require('./red-tip');
const { reapMerged } = require('./reap-merged');
const { releaseMerged } = require('./release-merged');
const { archiveMerged } = require('./archive-merged');
const { archiveBranches } = require('./archive-branches');
const { consoleExecuteDetect } = require('./console-execute');

// Execution order (mirror, red-tip, console, release, archive,
// archive-branches, reap) is significant — see the ordering comment above
// the release/archive/archive-branches/reap dispatch below. red-tip runs
// immediately after mirror specifically so it reads the ref mirror-ff.js's
// own fetch just refreshed, rather than fetching a second time (#561). This
// array is the requested-subset default only; it is never iterated to
// determine dispatch order.
const ALL_CHECKS = ['mirror', 'red-tip', 'reap', 'release', 'archive', 'archive-branches', 'console'];
```

Replace line 38 (the `result` initializer) — add `redTip: null`:

```javascript
  const result = { mirror: null, redTip: null, worktrees: null, claims: null, runs: null, branches: null, console: null, skipped: [] };
```

Replace lines 76-78 (immediately after the `mirror` dispatch block):

```javascript
  if (checks.includes('mirror')) {
    result.mirror = mirrorFastForward(root, integration);
  }

  // Detection only — never mutates repo/run state. Reads origin/{integration}
  // via the local ref mirror's own fetch above just refreshed — deliberately
  // no fetch of its own (#561). Placed immediately after mirror for that
  // reason; unconditional under pr-first, no local-merge equivalent (the
  // model !== 'pr-first' early-return above already exits before this line).
  if (checks.includes('red-tip')) {
    result.redTip = redTipCheck(root, integration);
  }

```

(The existing `console` dispatch block that previously followed `mirror` directly now follows `red-tip` instead — no change to its own body.)

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/reconcile.test.js`
Expected: PASS, all tests green (including the two pre-existing ordering/local-merge tests — `ALL_CHECKS` gained a member but the `reap dispatches after release and archive` pin and the local-merge skip test's `skipped` message are both indifferent to `red-tip`'s presence)

- [ ] **Step 5: Commit**

```bash
git add bin/lib/reconcile/index.js tests/reconcile.test.js
git commit -m "Wire red-tip check into reconcile ALL_CHECKS, immediately after mirror"
```

---

### Task 3: Render the finding in `bin/lib/hooks/session-start.js`

**Files:**
- Modify: `bin/lib/hooks/session-start.js:122-138` (append render block right after the existing mirror/claims/archive summary block)
- Modify: `tests/hooks-session-start.test.js` (add render test + safe-degrade test)

**Interfaces:**
- Consumes: Task 2's `result.redTip` from `reconcile({ cwd: ctx.cwd })`'s return value (already destructured as `result` at line 78 of `session-start.js`).

- [ ] **Step 1: Write the failing tests in `tests/hooks-session-start.test.js`**

Add after the existing `'#413: a run carrying an unresolved console.json...'` test:

```javascript
test('#561: a redTip finding from reconcile() renders as its own additionalContext line', () => {
  const project = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ct-ss-redtip-')));
  execFileSync('git', ['init', '-q', '--initial-branch=main'], { cwd: project });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: project });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: project });
  fs.writeFileSync(path.join(project, 'a.txt'), 'one\n');
  execFileSync('git', ['add', 'a.txt'], { cwd: project });
  execFileSync('git', ['commit', '-q', '-m', 'seed'], { cwd: project });

  // Stub reconcile() at the module boundary session-start.js imports it
  // from. session-start.js destructures `const { reconcile } =
  // require('../reconcile')` at its own load time, so mutating the export
  // AFTER session-start.js has already loaded (the top-of-file `sessionStart`
  // binding) would not be observed — that binding already captured the
  // original function reference. Instead: patch the already-cached reconcile
  // module's export in place (module identity/cache entry unchanged, so this
  // IS the object any require of the same resolved path returns), then bust
  // ONLY session-start.js's own cache entry and re-require it fresh so its
  // top-level destructure re-runs against the now-patched export. Same
  // require.cache-busting convention tests/bin-lib/code-health/
  // focus-generators.test.js already uses for a require-order concern.
  const reconcileMod = require('../bin/lib/reconcile');
  const original = reconcileMod.reconcile;
  reconcileMod.reconcile = () => ({
    mirror: null, redTip: { branch: 'main', sha: '0123456789abcdef', failing: ['ci/tests'], message: 'CI is red on main tip at 0123456 — ci/tests' },
    worktrees: null, claims: null, runs: null, branches: null, console: null, skipped: [],
  });
  delete require.cache[require.resolve('../bin/lib/hooks/session-start')];
  try {
    const freshSessionStart = require('../bin/lib/hooks/session-start');
    const out = freshSessionStart.run({ input: {}, runDir: null, runState: null, cwd: project });
    assert.ok(out.json, 'a redTip finding must render additionalContext');
    assert.match(out.json.hookSpecificOutput.additionalContext, /CI is red on main tip at 0123456 — ci\/tests/);
  } finally {
    reconcileMod.reconcile = original;
    // Restore a clean (unpatched) session-start module in the cache so
    // every later test in this file — including ones already holding the
    // original top-of-file `sessionStart` binding, which is unaffected
    // either way — sees the real reconcile() again if it re-requires fresh.
    delete require.cache[require.resolve('../bin/lib/hooks/session-start')];
    require('../bin/lib/hooks/session-start');
  }
});

test('#561: no redTip finding produces no red-tip line (AC5 — green tip)', () => {
  const project = gitProject();
  const out = sessionStart.run({ input: {}, runDir: null, runState: null, cwd: project });
  if (out.json) assert.doesNotMatch(out.json.hookSpecificOutput.additionalContext, /CI is red on/);
  else assert.deepStrictEqual(out, {});
});
```

(`gitProject` is the existing helper already defined earlier in this file, used by the `worktree.always nudge` tests — no new helper needed. `fs`, `path`, `os`, `execFileSync` are all already imported at the top of this file.)

- [ ] **Step 2: Run to verify the new tests fail**

Run: `node --test tests/hooks-session-start.test.js`
Expected: the `#561: a redTip finding...` test FAILs (`out.json` is falsy — nothing renders the line yet). The `#561: no redTip finding...` test already passes trivially (nothing to assert against) — that's fine, it's a regression guard for Step 3, not a TDD-red step.

- [ ] **Step 3: Render the finding**

In `bin/lib/hooks/session-start.js`, insert immediately after the existing summary block (after the `if (summary.length) { parts.push(...); }` close, before the `#413` readyConsoles block):

```javascript
    // #561: an unconditional, inform-tier line when reconcile() detected a
    // failing CI conclusion on the integration branch's tip — the only
    // coverage for direct pushes (fast-lane commits, bookkeeping, releases)
    // that no merge gate ever sees. Not gated on any policy value; silent
    // when result.redTip is null (green, pending, no CI, gh absent, or any
    // API error — red-tip.js's own degrade posture).
    if (result.redTip) {
      parts.push(`claude-tweaks: ${result.redTip.message}`);
    }
```

- [ ] **Step 4: Run to verify both tests pass**

Run: `node --test tests/hooks-session-start.test.js`
Expected: PASS, all tests green

- [ ] **Step 5: Commit**

```bash
git add bin/lib/hooks/session-start.js tests/hooks-session-start.test.js
git commit -m "Render reconcile red-tip finding as an inform-tier SessionStart line"
```

---

### Task 4: Live verification on this repo (AC5) and final check

**Files:** none created or modified — verification only.

**Interfaces:** none.

- [ ] **Step 1: Run the full targeted suites**

Run: `node --test tests/bin-lib/reconcile/ tests/reconcile.test.js tests/hooks-session-start.test.js tests/hooks-dispatcher.test.js`
Expected: PASS, all tests green, including the dispatcher's garbage-stdin invariant (no dispatcher-side change was needed — red-tip is reached generically through `reconcile()`, already covered)

- [ ] **Step 2: AC5 — confirm no red-tip line on this repo's actual state**

Run (from the worktree root, a real linked worktree of this repo — exercises the genuine `redTipCheck` I/O path against this repo's real `origin/main`):

```bash
node -e "const { run } = require('./bin/lib/hooks/session-start'); console.log(JSON.stringify(run({ input: {}, runDir: null, runState: null, cwd: process.cwd() }), null, 2))"
```

Expected: the printed `additionalContext` (if any renders at all) contains no `CI is red on` line — `main`'s tip CI is green at time of writing. If a `CI is red on main tip at ...` line unexpectedly appears, treat it as a signal to investigate `main`'s actual CI state before concluding the module is wrong — do not silence or work around it.

- [ ] **Step 3: No commit needed**

This task is verification-only; nothing to stage or commit. If Step 2 surfaces a genuine red tip on `main`, note it in the build handoff rather than treating it as a plan failure.
