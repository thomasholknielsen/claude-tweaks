# Flow Resume Freshness Probe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a freshness probe (last-commit age + worktree lock-file pid liveness) as a hard precondition before any of the three resume paths (`/wrap-up`'s `resume`, `/dispatch`'s "Resuming a parked run", `/flow`'s inherited-`PIPELINE_RUN_DIR` adoption) treats an `interrupted`-stamped run as safe to re-enter.

**Architecture:** A new pure module (`bin/lib/hooks/resume-freshness.js`) exposes `checkResumeFreshness(runDir, opts)`, reusing `isWorktreeLocked` (already in `bin/lib/hooks/worktree-reap.js`) for pid liveness and a `git log -1 --format=%ct` call (via the existing `runGit` wrapper) for commit recency. It is exposed to skill prose as a new `bin/hooks.js check-resume-freshness --run <dir>` CLI verb, mirroring the existing `record-worktree`/`close-run` verb pattern. One shared fragment (`skills/_shared/run-resume-freshness.md`) states the exact command and branching rule; the three resume call sites cite it and gate on it.

**Tech Stack:** Node.js (`bin/lib/hooks/`), `node --test` (`tests/`), Markdown skill prose.

**Spec:** GitHub issue #676, materialized at `.claude-tweaks/pipelines/2026-08-17T054156-record-676/work/676-spec.md` (this worktree).

## Global Constraints

- The probe MUST NOT regress `/claude-tweaks:dispatch`'s two-call handoff (`PIPELINE_RUN_DIR="{dir}" /claude-tweaks:flow #{n} build,test` then a second, separate Task-tool call with `review,polish,wrap-up` against the **same** run dir, moments later, likely from a different `CLAUDE_CODE_SESSION_ID`). This is proven non-regressive by gating the probe strictly on `run-state.json.status === 'interrupted'`: a Task-tool subagent's normal turn end fires `SubagentStop`, never `SessionEnd`, so `bin/lib/hooks/session-end.js` (the only site that stamps `interrupted`) never fires between the two calls and `status` stays `active` throughout. This exact distinction is already documented in `skills/wrap-up/SKILL.md`'s "Resuming a halted Review Console" section ("A normal turn end is not a session end, so the hooks layer's interruption stamp... never runs, and `run-state.json` stays `status: active`") — this plan relies on that documented behavior rather than re-deriving it.
- The probe MUST NOT block a run's own continuing session. `checkResumeFreshness` checks `run-state.json.sessionId === opts.sessionId` (the caller's own `CLAUDE_CODE_SESSION_ID`) before any other check and treats a match as trivially safe.
- The claim blob's TTL (72h, `_shared/issue-claims.md`) is untouched by this change — it gates re-claiming a *record*, not resuming a *run*, and keeps its own staleness rules.
- Every predicate fails CLOSED (same posture as `bin/lib/hooks/worktree-reap.js`'s header comment): an unresolvable git call while a run genuinely is `interrupted` reads as "cannot confirm safe" (`indeterminate`, blocked), never as "safe by default".

---

## Task 1: `checkResumeFreshness` — the probe module

**Files:**
- Create: `bin/lib/hooks/resume-freshness.js`
- Test: `tests/hooks-resume-freshness.test.js`

**Interfaces:**
- Consumes: `readRunState(runDir)` from `bin/lib/hooks/context.js` (returns parsed `run-state.json` or `null`); `isWorktreeLocked(wtPath, { cwd })` from `bin/lib/hooks/worktree-reap.js` (returns `boolean`, fails closed to `true`); `runGit(args, cwd, opts)` from `bin/lib/hooks/git-exec.js` (returns `{ stdout, failure }`).
- Produces: `checkResumeFreshness(runDir, opts)` — `opts: { sessionId?: string, now?: number, thresholdMs?: number }`. Returns `{ safe: boolean, verdict: string, reason?: string, ageMs?: number }`. `verdict` is one of: `'own-session'`, `'no-state'`, `'not-interrupted'`, `'no-worktree'`, `'worktree-gone'`, `'locked'`, `'indeterminate'`, `'recent-commit'`, `'stale'`. Also exports `RESUME_FRESHNESS_THRESHOLD_MS` (the default `thresholdMs`).

- [ ] **Step 1: Write the failing tests**

```javascript
// tests/hooks-resume-freshness.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  checkResumeFreshness,
  RESUME_FRESHNESS_THRESHOLD_MS,
} = require('../bin/lib/hooks/resume-freshness');
const { gitRepo, linkedWorktreeOf, fixtureGit } = require('./helpers/git-fixtures');

function tmpRunDir(state) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-resume-freshness-'));
  if (state) fs.writeFileSync(path.join(dir, 'run-state.json'), JSON.stringify(state));
  return dir;
}

test('checkResumeFreshness: own session is always safe, before any other check', () => {
  const runDir = tmpRunDir({ status: 'interrupted', sessionId: 'sess-a', worktree: '/does/not/exist' });
  const result = checkResumeFreshness(runDir, { sessionId: 'sess-a' });
  assert.deepStrictEqual(result, { safe: true, verdict: 'own-session' });
});

test('checkResumeFreshness: missing run-state.json is safe (nothing recorded to protect)', () => {
  const runDir = tmpRunDir(null);
  const result = checkResumeFreshness(runDir, { sessionId: 'sess-a' });
  assert.deepStrictEqual(result, { safe: true, verdict: 'no-state' });
});

test('checkResumeFreshness: status other than interrupted is always safe (the two-call dispatch handoff shape)', () => {
  const runDir = tmpRunDir({ status: 'active', sessionId: 'sess-a', worktree: '/does/not/exist' });
  const result = checkResumeFreshness(runDir, { sessionId: 'sess-b' });
  assert.deepStrictEqual(result, { safe: true, verdict: 'not-interrupted' });
});

test('checkResumeFreshness: interrupted with no recorded worktree is safe (nothing to probe)', () => {
  const runDir = tmpRunDir({ status: 'interrupted', sessionId: 'sess-a' });
  const result = checkResumeFreshness(runDir, { sessionId: 'sess-b' });
  assert.deepStrictEqual(result, { safe: true, verdict: 'no-worktree' });
});

test('checkResumeFreshness: interrupted with a worktree path that no longer exists is safe', () => {
  const runDir = tmpRunDir({ status: 'interrupted', sessionId: 'sess-a', worktree: '/no/such/path/at/all' });
  const result = checkResumeFreshness(runDir, { sessionId: 'sess-b' });
  assert.deepStrictEqual(result, { safe: true, verdict: 'worktree-gone' });
});

test('checkResumeFreshness: interrupted + a live worktree lock blocks', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  fixtureGit(['-C', main, 'worktree', 'lock', wt, '--reason', `claude session test (pid ${process.pid} start now)`]);
  const runDir = tmpRunDir({ status: 'interrupted', sessionId: 'sess-a', worktree: wt });
  const result = checkResumeFreshness(runDir, { sessionId: 'sess-b' });
  assert.equal(result.safe, false);
  assert.equal(result.verdict, 'locked');
  assert.match(result.reason, /live process/);
});

test('checkResumeFreshness: interrupted + a recent commit (no lock) blocks', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  fixtureGit(['-C', wt, 'commit', '--allow-empty', '-m', 'recent work', '-q']);
  const runDir = tmpRunDir({ status: 'interrupted', sessionId: 'sess-a', worktree: wt });
  const result = checkResumeFreshness(runDir, { sessionId: 'sess-b', now: Date.now() });
  assert.equal(result.safe, false);
  assert.equal(result.verdict, 'recent-commit');
  assert.ok(result.ageMs < RESUME_FRESHNESS_THRESHOLD_MS);
});

test('checkResumeFreshness: interrupted + a commit older than the threshold, no lock, is safe (stale)', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  fixtureGit(['-C', wt, 'commit', '--allow-empty', '-m', 'old work', '-q']);
  const farFuture = Date.now() + RESUME_FRESHNESS_THRESHOLD_MS * 5;
  const runDir = tmpRunDir({ status: 'interrupted', sessionId: 'sess-a', worktree: wt });
  const result = checkResumeFreshness(runDir, { sessionId: 'sess-b', now: farFuture });
  assert.equal(result.safe, true);
  assert.equal(result.verdict, 'stale');
});

test('checkResumeFreshness: interrupted + a worktree path that exists but is not a git repo fails closed to blocked', () => {
  // Exists on disk (passes the existence check) but has no `.git` anywhere
  // above it in the temp-dir tree, so BOTH isWorktreeLocked (mainCheckoutRoot
  // resolves null -> fails closed to locked, per worktree-reap.js's own
  // header comment) and a `git log` call would fail. Which specific check
  // trips first is an implementation detail; what must hold is `safe: false`
  // — the probe never reads "I could not determine anything" as "proceed".
  const notAWorktree = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-resume-freshness-not-git-'));
  const runDir = tmpRunDir({ status: 'interrupted', sessionId: 'sess-a', worktree: notAWorktree });
  const result = checkResumeFreshness(runDir, { sessionId: 'sess-b' });
  assert.equal(result.safe, false);
});

test('RESUME_FRESHNESS_THRESHOLD_MS is on the order of minutes', () => {
  assert.ok(RESUME_FRESHNESS_THRESHOLD_MS >= 60 * 1000);
  assert.ok(RESUME_FRESHNESS_THRESHOLD_MS <= 60 * 60 * 1000);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/hooks-resume-freshness.test.js`
Expected: FAIL — `Cannot find module '../bin/lib/hooks/resume-freshness'`

- [ ] **Step 3: Write the implementation**

```javascript
// bin/lib/hooks/resume-freshness.js — the freshness probe a resume path runs
// before treating a run stamped `status: interrupted` as safe to re-enter.
//
// Why this exists: `status: interrupted` is a statement about one past
// session ("the session that owned this run ended"), never a statement that
// nobody owns the run *now*. On 2026-08-16, run 2026-08-16T174412 read
// `interrupted` while a *different* live session was actively committing to
// its shared worktree, and a resume attempt got as far as announcing entry
// before fresh commit timestamps — noticed incidentally, not gated —
// reversed the ruling. This module is the gate that should have caught it.
//
// Non-regression against the two-call dispatch handoff (#676's own risk
// analysis): `/claude-tweaks:dispatch` hands a group to `/flow` as TWO
// sequential Task-tool calls sharing one `PIPELINE_RUN_DIR` — the first
// (`build,test`) finishing and the second (`review,polish,wrap-up`) starting
// moments later, very likely under a *different* `CLAUDE_CODE_SESSION_ID`,
// with a commit from the first call still fresh on disk. That shape must
// never be blocked. It structurally cannot trip this probe: a Task-tool
// subagent's normal turn end fires `SubagentStop`, never `SessionEnd`
// (bin/lib/hooks/subagent-stop.js's own header states SubagentStop is what
// fires "for Task dispatches"), and `SessionEnd` is the only trigger that
// stamps `interrupted` (bin/lib/hooks/session-end.js). Between the two Task
// calls the top-level dispatching session never ends, so `run-state.json`
// stays `status: active` the whole time — this probe's very first
// status-gated check (below) reads `not-interrupted` and returns safe before
// ever looking at commit recency or lock state. Corroborated by
// `skills/wrap-up/SKILL.md`'s own "Resuming a halted Review Console"
// section: "A normal turn end is not a session end, so the hooks layer's
// interruption stamp... never runs, and run-state.json stays status: active".
'use strict';
const fs = require('fs');
const ctxLib = require('./context');
const { isWorktreeLocked } = require('./worktree-reap');
const { runGit } = require('./git-exec');

// "On the order of minutes" (the spec's own phrasing): long enough that a
// burst of commits from a single working session's normal cadence doesn't
// read as a stranger, short enough that a genuinely dead run isn't gated for
// an unreasonable stretch. Not configurable via policy — this guards a
// safety decision, not a stylistic preference, and the threshold plus its
// rationale living here (rather than scattered across call sites) is the
// point of having one shared probe.
const RESUME_FRESHNESS_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

// runDir: the pipeline run directory whose run-state.json to read.
// opts: { sessionId, now, thresholdMs } — all optional; sessionId should be
// the caller's own CLAUDE_CODE_SESSION_ID, now/thresholdMs default below.
function checkResumeFreshness(runDir, opts = {}) {
  const sessionId = opts.sessionId || null;
  const now = typeof opts.now === 'number' ? opts.now : Date.now();
  const thresholdMs = typeof opts.thresholdMs === 'number' ? opts.thresholdMs : RESUME_FRESHNESS_THRESHOLD_MS;

  const state = ctxLib.readRunState(runDir);
  if (!state) return { safe: true, verdict: 'no-state' };

  // Identity check FIRST, per the spec's own Gotchas: a session restart
  // re-stamps ownership via `record-worktree`, and that continuing session
  // must never be blocked from its own run.
  if (sessionId && state.sessionId && state.sessionId === sessionId) {
    return { safe: true, verdict: 'own-session' };
  }

  // The whole probe is scoped to the `interrupted` stamp specifically — see
  // this file's header comment for why that is what makes the two-call
  // dispatch handoff provably safe rather than merely assumed safe.
  if (state.status !== 'interrupted') {
    return { safe: true, verdict: 'not-interrupted' };
  }

  const worktree = typeof state.worktree === 'string' ? state.worktree : null;
  if (!worktree) return { safe: true, verdict: 'no-worktree' };
  if (!fs.existsSync(worktree)) return { safe: true, verdict: 'worktree-gone' };

  // (b) worktree lock-file pid liveness. isWorktreeLocked already fails
  // closed (an unresolvable root or a failed `git worktree list` reads as
  // "cannot confirm free" -> true) — this probe inherits that posture
  // directly rather than re-deciding it.
  if (isWorktreeLocked(worktree)) {
    return { safe: false, verdict: 'locked', reason: 'worktree lock held by a live process' };
  }

  // (a) last-commit age in the run's recorded worktree.
  const { stdout, failure } = runGit(['log', '-1', '--format=%ct'], worktree);
  if (failure || !stdout) {
    // Fail CLOSED: a run genuinely stamped `interrupted` whose activity we
    // cannot verify is not safe-by-default — see the Global Constraints
    // note in the plan this module was built from.
    return { safe: false, verdict: 'indeterminate', reason: 'could not determine worktree activity' };
  }
  const commitMs = Number(stdout) * 1000;
  if (!Number.isFinite(commitMs)) {
    return { safe: false, verdict: 'indeterminate', reason: 'could not parse last-commit timestamp' };
  }
  const ageMs = now - commitMs;
  if (ageMs < thresholdMs) {
    return {
      safe: false,
      verdict: 'recent-commit',
      reason: `worktree committed to within the last ${Math.round(thresholdMs / 60000)} minutes`,
      ageMs,
    };
  }

  return { safe: true, verdict: 'stale' };
}

module.exports = { checkResumeFreshness, RESUME_FRESHNESS_THRESHOLD_MS };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/hooks-resume-freshness.test.js`
Expected: PASS (all 9 tests)

- [ ] **Step 5: Commit**

```bash
git add bin/lib/hooks/resume-freshness.js tests/hooks-resume-freshness.test.js
git commit -m "Add checkResumeFreshness probe — refs #676"
```

---

## Task 2: `check-resume-freshness` CLI verb

**Files:**
- Modify: `bin/hooks.js` (add a new verb branch, mirroring `record-worktree`'s shape)
- Test: `tests/hooks-dispatcher.test.js` (extend with the new verb's CLI contract)

**Interfaces:**
- Consumes: `checkResumeFreshness` + `RESUME_FRESHNESS_THRESHOLD_MS` from Task 1's `bin/lib/hooks/resume-freshness.js`; `resolveRunArg(args, cwd, env)` (already defined in `bin/hooks.js`, used by `record-worktree`/`close-run`).
- Produces: a CLI verb `node bin/hooks.js check-resume-freshness [--run <dir>]` that writes exactly one line to stdout and always returns `0` (never breaks a session — the file's own cardinal invariant). Skills branch on substring match: the safe line always contains `` freshness OK ``, the blocked line always contains `` freshness BLOCKED ``.

- [ ] **Step 1: Write the failing test**

Add to `tests/hooks-dispatcher.test.js` (append; do not remove existing tests). This file already
defines `runHook(args, { input, cwd, env })` (returns `{ code, stdout }`), `tmpProject()`, and a
local `gitRepo()` (bare `git init`, no commit) — reuse those verbatim, the same way the existing
`record-worktree --run` tests in this file do (see the "stale run" test above this one for the
pattern of hand-building a `run-state.json` at a specific directory name):

```javascript
test('check-resume-freshness: reports OK when the run is not interrupted', () => {
  const project = tmpProject();
  const run = path.join(project, '.claude-tweaks', 'pipelines', '2026-08-01T000000-record-1');
  fs.mkdirSync(run, { recursive: true });
  fs.writeFileSync(path.join(run, 'run-state.json'), JSON.stringify({ status: 'active', sessionId: 'other' }));
  const result = runHook(['check-resume-freshness', '--run', run], { cwd: project, env: { CLAUDE_CODE_SESSION_ID: 'me' } });
  assert.strictEqual(result.code, 0);
  assert.match(result.stdout, /freshness OK for 2026-08-01T000000-record-1 \(not-interrupted\)/);
});

test('check-resume-freshness: reports BLOCKED with a reason when the run is interrupted and the recorded worktree has a fresh commit', () => {
  const project = tmpProject();
  const wt = gitRepo();
  execFileSync('git', ['-C', wt, 'commit', '--allow-empty', '-m', 'recent', '-q']);
  const run = path.join(project, '.claude-tweaks', 'pipelines', '2026-08-01T000000-record-2');
  fs.mkdirSync(run, { recursive: true });
  fs.writeFileSync(path.join(run, 'run-state.json'), JSON.stringify({ status: 'interrupted', sessionId: 'other', worktree: wt }));
  const result = runHook(['check-resume-freshness', '--run', run], { cwd: project, env: { CLAUDE_CODE_SESSION_ID: 'me' } });
  assert.strictEqual(result.code, 0);
  assert.match(result.stdout, /freshness BLOCKED for 2026-08-01T000000-record-2 — run appears actively owned \(worktree committed to within the last \d+ minutes\)/);
});

test('check-resume-freshness: no resolvable --run path reports the not-found line', () => {
  const project = tmpProject();
  const result = runHook(['check-resume-freshness', '--run', path.join(project, 'nope')], { cwd: project });
  assert.strictEqual(result.code, 0);
  assert.match(result.stdout, /--run path not found/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/hooks-dispatcher.test.js`
Expected: FAIL — the three new assertions do not match (verb not yet implemented; stdout is empty because `cmd === 'check-resume-freshness'` falls through every branch and returns 0 at `if (!EVENTS.includes(cmd)) return 0;`)

- [ ] **Step 3: Implement the verb**

In `bin/hooks.js`, add a new `require` near the top (alongside the existing `ctxLib`/`siblingSessions` requires):

```javascript
const resumeFreshness = require('./lib/hooks/resume-freshness');
```

Then add a new verb branch immediately after the existing `close-run` branch (i.e. right before the `check-sibling-sessions` branch at line 169 in the current file — insert between them):

```javascript
  if (cmd === 'check-resume-freshness') {
    // Read-only: never writes run-state.json. Skills call this immediately
    // before any of the three resume paths' safe-to-resume ruling
    // (skills/_shared/run-resume-freshness.md).
    const { runDir, invalidRunArg } = resolveRunArg(argv.slice(3), process.cwd(), process.env);
    if (invalidRunArg) {
      process.stdout.write(`claude-tweaks: --run path not found: ${invalidRunArg} — resume freshness not checked\n`);
      return 0;
    }
    if (!runDir) {
      process.stdout.write('claude-tweaks: no pipeline run dir found — resume freshness not checked\n');
      return 0;
    }
    const result = resumeFreshness.checkResumeFreshness(runDir, {
      sessionId: process.env.CLAUDE_CODE_SESSION_ID,
    });
    const runId = path.basename(runDir);
    if (result.safe) {
      process.stdout.write(`claude-tweaks: resume freshness OK for ${runId} (${result.verdict})\n`);
    } else {
      process.stdout.write(`claude-tweaks: resume freshness BLOCKED for ${runId} — run appears actively owned (${result.reason})\n`);
    }
    return 0;
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/hooks-dispatcher.test.js`
Expected: PASS (all tests, including the three new ones)

- [ ] **Step 5: Commit**

```bash
git add bin/hooks.js tests/hooks-dispatcher.test.js
git commit -m "Add check-resume-freshness CLI verb — refs #676"
```

---

## Task 3: The shared fragment

**Files:**
- Create: `skills/_shared/run-resume-freshness.md`

**Interfaces:**
- Consumes: nothing (documentation only).
- Produces: the one citable procedure the three call sites in Tasks 4-6 reference by path (`_shared/run-resume-freshness.md`) instead of restating.

- [ ] **Step 1: Write the fragment**

```markdown
# Run Resume Freshness Probe — Shared

A hard precondition before any of the three resume paths below rules a run safe to re-enter.
Read by `wrap-up/SKILL.md`'s `resume` command, `dispatch/SKILL.md`'s "Resuming a parked run"
section, and `flow/steps-and-gates.md`'s "Adopting an inherited run directory" case 1.

## What `status: interrupted` means — and does not mean

`run-state.json`'s `status: interrupted` stamp (`bin/lib/hooks/session-end.js`) is a statement
about **one past session**: the session that owned this run ended (crashed, closed, or timed
out) while the run was still non-`clean`. It is explicitly **not** a statement that no session
owns this run *now* — a different session can be actively committing to the same worktree at the
exact moment a resume path reads the stamp and rules it safe. On 2026-08-16, run
2026-08-16T174412 read `interrupted` while a live sibling session was actively committing to its
shared worktree; the misjudgment was caught only by an incidental glance at fresh commit
timestamps, not by any gate (#676).

**This stamp never fires on a normal Task-tool subagent turn end** — only on a real `SessionEnd`
(`bin/lib/hooks/session-end.js`; a `SubagentStop` never touches `run-state.json`). This is why
`/claude-tweaks:dispatch`'s two-call handoff (`build,test` then `review,polish,wrap-up` against
the same `PIPELINE_RUN_DIR`, likely under two different `CLAUDE_CODE_SESSION_ID`s) never trips
this probe: between the two calls the top-level dispatching session never ends, so `status` stays
`active` throughout, and the probe below short-circuits to safe on its very first status check.

## The probe

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" check-resume-freshness --run "{run-dir}"
```

Read-only — never writes `run-state.json`. Reads `run-state.json`'s `status`, `sessionId`, and
`worktree` fields and checks, in order:

1. **Own session** — `sessionId` already matches this call's own `CLAUDE_CODE_SESSION_ID`. Safe
   unconditionally (a session restart re-stamps ownership via `record-worktree`; this probe must
   never block a run's own continuing session from itself).
2. **Not `interrupted`** — any other status (`active`, `clean`, missing) is out of scope for this
   probe; safe.
3. **No recorded worktree, or the recorded worktree no longer exists on disk** — nothing to
   probe; safe.
4. **Worktree lock-file pid liveness** — `bin/lib/hooks/worktree-reap.js`'s `isWorktreeLocked`.
   A live pid holding the worktree lock blocks — "run appears actively owned".
5. **Last-commit age** — `git -C {worktree} log -1 --format=%ct`, compared against a 10-minute
   threshold ("on the order of minutes" — long enough that one working session's normal commit
   cadence doesn't read as a stranger, short enough that a genuinely dead run isn't gated for an
   unreasonable stretch; see `bin/lib/hooks/resume-freshness.js`'s own header comment for the
   full rationale). A commit inside the threshold blocks.
6. Otherwise: safe (`stale`) — the run is genuinely quiet.

An unresolvable git call at step 5 (while status is genuinely `interrupted`) fails **closed** —
blocked, not safe-by-default.

## Branching on the result

The command writes exactly one line to stdout, and always exits `0`:

- Safe: `claude-tweaks: resume freshness OK for {run-id} ({verdict})` — proceed with the resume
  exactly as before this probe existed.
- Blocked: `claude-tweaks: resume freshness BLOCKED for {run-id} — run appears actively owned
  ({reason})` — **do not proceed.** Report the line verbatim instead of the resume's normal
  outcome, and stop; do not fall through to conversation-based work.

**On a safe verdict that came from a genuinely `interrupted` state** (i.e. `verdict` is
`'locked'`/`'recent-commit'`/`'indeterminate'` never returned, and the run *was* `interrupted`
before this check — every safe verdict other than `not-interrupted`/`own-session` implies this):
immediately reclaim ownership so the stale stamp does not linger and a later re-entry within the
same session is not re-probed for no reason:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" record-worktree --run "{run-dir}" "{worktree-path}"
```

This is the same idempotent restamp `build/worktree-setup.md` already documents for "a different
session later continues this pipeline" — it flips `status` back to `active` under the current
session's identity, which is also what makes the "Own session" fast path above correct for any
further probing inside the same now-resumed run.

## What this does not gate

- **The claim blob's TTL** (`_shared/issue-claims.md`, 72h) is untouched — it governs re-claiming
  a *record* against a competing dispatcher, a different concern with its own staleness rules,
  not resuming a *run*.
- **A run whose status is not `interrupted`** — including a dispatch-parked `pending-review` run
  before its orchestrating session has ended. Nothing needs gating there; see the "does not fire
  on a normal Task-tool subagent turn end" note above.
```

- [ ] **Step 2: Commit**

```bash
git add skills/_shared/run-resume-freshness.md
git commit -m "Add the run-resume-freshness shared fragment — refs #676"
```

---

## Task 4: Wire the probe into `/wrap-up`'s `resume`

**Files:**
- Modify: `skills/wrap-up/SKILL.md:61`

**Interfaces:**
- Consumes: `_shared/run-resume-freshness.md` (Task 3).

- [ ] **Step 1: Edit the resume paragraph**

Replace the sentence in `skills/wrap-up/SKILL.md` line 61 that currently reads:

```
Otherwise, set `$PIPELINE_RUN_DIR` to that directory and jump directly to Phase 4's Review Console, which re-reads `decisions.md`, `staged/`, and `config.yml` from it and re-presents the console exactly as it stood before the stop.
```

with:

```
Otherwise, before treating it as safe to re-enter, run `_shared/run-resume-freshness.md`'s probe: `node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" check-resume-freshness --run "{run-dir}"`. A `BLOCKED` result means a live process still holds this run's worktree or committed to it recently — report that line verbatim and stop; do not fall through to conversation-based work. On `OK`, set `$PIPELINE_RUN_DIR` to that directory and jump directly to Phase 4's Review Console, which re-reads `decisions.md`, `staged/`, and `config.yml` from it and re-presents the console exactly as it stood before the stop.
```

- [ ] **Step 2: Commit**

```bash
git add skills/wrap-up/SKILL.md
git commit -m "Gate wrap-up resume on the freshness probe — refs #676"
```

---

## Task 5: Wire the probe into `/dispatch`'s "Resuming a parked run"

**Files:**
- Modify: `skills/dispatch/SKILL.md:224`

**Interfaces:**
- Consumes: `_shared/run-resume-freshness.md` (Task 3).

- [ ] **Step 1: Edit the resume-mechanism paragraph**

The current paragraph (line 224) reads:

```
The actual resume mechanism is re-adopting the same run directory: `PIPELINE_RUN_DIR="{run-dir}" /claude-tweaks:flow "{target}" wrap-up`, run from inside the group's still-assigned worktree (`{run-dir}`'s own worktree — parking never clears a run's worktree assignment, so it is still there).
```

Insert one sentence before it (same paragraph):

```
Before re-adopting, run `_shared/run-resume-freshness.md`'s probe against `{run-dir}`: `node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" check-resume-freshness --run "{run-dir}"`. A `BLOCKED` result means the parked run's worktree is still held by a live process or was committed to recently — report that line verbatim in place of the confirmation above and stop; do not re-adopt. The actual resume mechanism, on an `OK` result, is re-adopting the same run directory: `PIPELINE_RUN_DIR="{run-dir}" /claude-tweaks:flow "{target}" wrap-up`, run from inside the group's still-assigned worktree (`{run-dir}`'s own worktree — parking never clears a run's worktree assignment, so it is still there).
```

- [ ] **Step 2: Commit**

```bash
git add skills/dispatch/SKILL.md
git commit -m "Gate dispatch's parked-run resume on the freshness probe — refs #676"
```

---

## Task 6: Wire the probe into `/flow`'s inherited-run adoption

**Files:**
- Modify: `skills/flow/steps-and-gates.md:60`

**Interfaces:**
- Consumes: `_shared/run-resume-freshness.md` (Task 3).

- [ ] **Step 1: Edit case 1 of "Adopting an inherited run directory"**

The current case 1 bullet (line 60) reads:

```
1. **Set, the directory it names exists, resolves under `$RUN_ROOT`, AND already carries `config.yml`** (`_shared/pipeline-run-dir.md`'s Anchoring section: `RUN_ROOT=$(git rev-parse --git-common-dir); RUN_ROOT=$(cd "$(dirname "$RUN_ROOT")" && pwd)` — the adopted path's realpath must be a descendant of `$RUN_ROOT`, never merely inside whatever worktree happens to be cwd) → **adopt it as-is.** Create no new run directory. Do **not** re-initialize `config.yml` or `decisions.md` — both already exist, written by the invocation that created this run, and overwriting them destroys exactly the auto-decision trail the handoff exists to preserve. Read the existing `config.yml` for this run's policy levers instead of recomputing them from the precedence chain, and render the mode's Manifesto behavior (the FYI table in `auto`, the approval gate in `confirm`/`hybrid`) from those values. Note it in the pipeline's output, one line, so the adoption is visible rather than silent:
```

Insert a new sentence immediately after "→ **adopt it as-is.**" (same bullet, before "Create no new run directory."):

```
1. **Set, the directory it names exists, resolves under `$RUN_ROOT`, AND already carries `config.yml`** (`_shared/pipeline-run-dir.md`'s Anchoring section: `RUN_ROOT=$(git rev-parse --git-common-dir); RUN_ROOT=$(cd "$(dirname "$RUN_ROOT")" && pwd)` — the adopted path's realpath must be a descendant of `$RUN_ROOT`, never merely inside whatever worktree happens to be cwd) → **adopt it as-is.** First run `_shared/run-resume-freshness.md`'s probe against this directory: `node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" check-resume-freshness --run "{run-dir}"`. This is the gate that protects a `/claude-tweaks:dispatch`-orchestrated two-call handoff (`build,test` then `review,polish,wrap-up` sharing this same directory) from ever being blocked here — see that fragment's own explanation of why the probe structurally reads `not-interrupted`/safe throughout that handoff. A `BLOCKED` result means a live process still holds this run's worktree, or committed to it recently, under a stamp this adoption did not itself just create — report that line verbatim and stop the pipeline before Step 3; do not adopt. On `OK`, create no new run directory. Do **not** re-initialize `config.yml` or `decisions.md` — both already exist, written by the invocation that created this run, and overwriting them destroys exactly the auto-decision trail the handoff exists to preserve. Read the existing `config.yml` for this run's policy levers instead of recomputing them from the precedence chain, and render the mode's Manifesto behavior (the FYI table in `auto`, the approval gate in `confirm`/`hybrid`) from those values. Note it in the pipeline's output, one line, so the adoption is visible rather than silent:
```

- [ ] **Step 2: Commit**

```bash
git add skills/flow/steps-and-gates.md
git commit -m "Gate flow's inherited-run adoption on the freshness probe — refs #676"
```

---

## Task 7: Conformance test pinning the three citations

**Files:**
- Create: `tests/flow-resume-freshness-citations.test.js`

**Interfaces:**
- Consumes: nothing beyond the filesystem — reads the three files edited in Tasks 4-6.

- [ ] **Step 1: Write the test**

```javascript
// tests/flow-resume-freshness-citations.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS_DIR = path.join(__dirname, '..', 'skills');
const FRAGMENT = '_shared/run-resume-freshness.md';

// The three resume paths named in #676's own Current State — a fresh
// citation site is a plan change, never an incidental grep hit, so this list
// is exhaustive by construction rather than discovered by a repo-wide scan.
const CALL_SITES = [
  path.join(SKILLS_DIR, 'wrap-up', 'SKILL.md'),
  path.join(SKILLS_DIR, 'dispatch', 'SKILL.md'),
  path.join(SKILLS_DIR, 'flow', 'steps-and-gates.md'),
];

test('every resume path cites the run-resume-freshness fragment', () => {
  const offenders = [];
  for (const file of CALL_SITES) {
    const text = fs.readFileSync(file, 'utf8');
    if (!text.includes(FRAGMENT)) offenders.push(path.relative(SKILLS_DIR, file));
  }
  assert.deepStrictEqual(
    offenders,
    [],
    `these resume paths do not cite ${FRAGMENT}: ${offenders.join(', ')}`,
  );
});

test('every resume path also cites the check-resume-freshness CLI verb', () => {
  const offenders = [];
  for (const file of CALL_SITES) {
    const text = fs.readFileSync(file, 'utf8');
    if (!text.includes('check-resume-freshness')) offenders.push(path.relative(SKILLS_DIR, file));
  }
  assert.deepStrictEqual(
    offenders,
    [],
    `these resume paths do not invoke check-resume-freshness: ${offenders.join(', ')}`,
  );
});
```

- [ ] **Step 2: Run all new and existing tests**

Run: `node --test tests/hooks-resume-freshness.test.js tests/hooks-dispatcher.test.js tests/flow-resume-freshness-citations.test.js`
Expected: PASS (all tests across all three files)

- [ ] **Step 3: Commit**

```bash
git add tests/flow-resume-freshness-citations.test.js
git commit -m "Pin the three resume paths' citations of the freshness fragment — refs #676"
```

---

## Deliverables checklist (traced to the spec)

- [x] Task 1-3: the shared freshness-probe fragment (`_shared/run-resume-freshness.md`) and its two-read-only-call implementation (`bin/lib/hooks/resume-freshness.js` + `bin/hooks.js check-resume-freshness`).
- [x] Task 4-6: all three resume paths name the probe as a hard precondition.
- [x] Task 7 + AC1: grep-verifiable citations, pinned by a conformance test.
- [x] AC2: Task 1's `linkedWorktreeOf`-based tests verify a probe against a synthetic worktree with a recent commit (and a live lock) yields the blocking verdict.
- [x] Deliverable 2 (the `interrupted` stamp's meaning documented at consumer sites): stated in `_shared/run-resume-freshness.md`'s "What `status: interrupted` means — and does not mean" section, cited by all three call sites.
