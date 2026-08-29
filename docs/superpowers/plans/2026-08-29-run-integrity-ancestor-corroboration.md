# Run-Integrity Ancestor-Evidence Corroboration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `checkRunIntegrity()` from reporting a freshly-created, zero-commit worktree as `shipped-unclosed` by corroborating `mergedEvidence()`'s `ancestor` verdict against the run directory's own start time.

**Architecture:** `mergedEvidence()` is unchanged — it still returns `'ancestor'`. `checkRunIntegrity()` gains one extra gate on that specific evidence value: the recorded branch must carry at least one commit dated at or after the run directory's own ISO-timestamp prefix. Two new module-private helpers implement it (`runStartIso()` parses the directory name; `hasCommitSinceRunStart()` runs one bounded `git log`), both fail-open toward `in-progress` per this module's existing per-field contract. The `cherry` path is untouched — `git cherry` already implies at least one divergent commit by construction.

**Tech Stack:** Node 18+, CommonJS, `node --test`. Zero runtime npm deps. Git is reached only through this module's existing `runGit()` wrapper (`plugin/bin/lib/hooks/git-exec.js`).

**Spec:** `.claude-tweaks/pipelines/2026-08-29T185308-spec-1463-1672-1673-1674/spec-1463/work/1463-spec.md` (GitHub record #1463)

## Global Constraints

- No new fields written to `run-state.json`; no schema change to any run-dir file. The run's start time comes exclusively from the run directory's own name.
- Fail-open is per-field: an unparseable run-dir name, or an indeterminate git result (timeout / spawn failure / no git), resolves the corroboration check toward `in-progress`, never toward `shipped-unclosed`.
- `plugin/bin/lib/hooks/run-integrity.js` stays read-only: no writes, no event appends, no git mutations, no `fetch`. SessionStart must remain offline-safe.
- Every git call goes through the existing `runGit(args, cwd)` wrapper — never `execFileSync` directly, never an unbounded call.
- The `cherry` evidence path in `mergedEvidence()` must not change behavior.
- All existing `tests/run-integrity.test.js` cases must keep passing.
- Test-suite command for this repo: `npm test` (full) or `node --test tests/run-integrity.test.js` (this suite alone). Run from the repo/worktree root.
- Commit message style: `{Verb} {what} — {detail}` (imperative, no conventional-commit prefixes).

---

### Task 1: Corroborate `ancestor` evidence against the run directory's start time

**Files:**
- Modify: `plugin/bin/lib/hooks/run-integrity.js`
- Modify: `tests/helpers/git-fixtures.js` (add an optional per-call options pass-through to `fixtureGit` so a fixture can pin commit dates)
- Test: `tests/run-integrity.test.js`

**Interfaces:**
- Consumes: `runGit(args, cwd)` from `./git-exec` (already imported by `run-integrity.js`); `path` (already imported).
- Produces: two module-private helpers in `run-integrity.js` — `runStartIso(runDir) -> string|null` (an ISO-8601 UTC instant, or `null` when the directory name carries no canonical timestamp prefix) and `hasCommitSinceRunStart(root, branch, runDir) -> boolean`. Neither is exported; `module.exports` is unchanged (`{ checkRunIntegrity, repoRootOf, NON_TERMINAL }`).
- `fixtureGit(args, opts = {})` in `tests/helpers/git-fixtures.js` gains an optional second parameter, spread into `execFileSync`'s options after the existing `timeout`. Every existing single-argument call site keeps byte-identical behavior.

- [ ] **Step 1: Make `fixtureGit` accept per-call `execFileSync` options**

This is needed by Step 2's fixture, which must pin committer dates so the new test never depends on the wall clock. It is additive: the default `{}` reproduces today's behavior exactly.

In `tests/helpers/git-fixtures.js`, replace the `fixtureGit` function body's signature and `execFileSync` call:

```js
// `opts` is spread into execFileSync's options AFTER the timeout, so a caller
// can pin `env` (e.g. GIT_AUTHOR_DATE/GIT_COMMITTER_DATE for a fixture whose
// assertions must not depend on the wall clock) without losing the bound.
function fixtureGit(args, opts = {}) {
  try {
    return execFileSync('git', args, { timeout: FIXTURE_TIMEOUT_MS, ...opts });
  } catch (err) {
    if (err.killed || err.code === 'ETIMEDOUT' || err.signal === 'SIGTERM') {
      throw new Error(
        `git-fixtures: \`git ${args.join(' ')}\` exceeded ${FIXTURE_TIMEOUT_MS}ms and was killed. `
        + 'This usually means the machine is heavily contended (concurrent test suites), not that the fixture is wrong.',
      );
    }
    throw err;
  }
}
```

- [ ] **Step 2: Write the failing tests**

In `tests/run-integrity.test.js`, make three edits.

**2a.** Pin `fixtureRepo()`'s two commits to a fixed instant *after* the fixture run directory's own `2026-08-01T090000` prefix, so every existing assertion becomes wall-clock-independent instead of relying on "today happens to be later than 2026-08-01". Add this constant and helper immediately above `function fixtureRepo()`:

```js
// Fixture commit dates are pinned so the run-start corroboration check (#1463)
// is decided by fixture data, not by the machine clock. `fixtureRepo`'s history
// is dated AFTER its run dir's own 2026-08-01T090000 prefix (a genuinely
// shipped branch); `fixtureZeroCommitRepo`'s is dated BEFORE it (a branch that
// has never diverged).
function datedSh(cwd, iso, ...args) {
  return fixtureGit(['-C', cwd, ...args], {
    env: { ...process.env, GIT_AUTHOR_DATE: iso, GIT_COMMITTER_DATE: iso },
  }).toString();
}
const AFTER_RUN_START = '2026-08-01T10:00:00Z';
const BEFORE_RUN_START = '2026-07-01T00:00:00Z';
```

Then, inside `fixtureRepo()`, change exactly the two `commit` lines to use `datedSh` with `AFTER_RUN_START`:

```js
  sh(root, 'add', 'a.txt');
  datedSh(root, AFTER_RUN_START, 'commit', '-q', '-m', 'base');
```

```js
  sh(wt, 'add', 'b.txt');
  datedSh(wt, AFTER_RUN_START, 'commit', '-q', '-m', 'feature work');
```

Leave every other line of `fixtureRepo()` unchanged.

**2b.** Add a second fixture builder immediately after `fixtureRepo()`:

```js
// The #1463 false-positive shape: a worktree branch created from the
// integration branch with ZERO commits of its own, so `merge-base
// --is-ancestor branch integration` is trivially true. All history predates
// the run directory's own 2026-08-01T090000 start time.
function fixtureZeroCommitRepo() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ct-ri-zc-')));
  fixtureGit(['init', '-q', '-b', 'trunk', root]);
  sh(root, 'config', 'user.email', 't@example.com');
  sh(root, 'config', 'user.name', 'T');
  fs.writeFileSync(path.join(root, 'a.txt'), 'base\n');
  sh(root, 'add', 'a.txt');
  datedSh(root, BEFORE_RUN_START, 'commit', '-q', '-m', 'base');
  fs.mkdirSync(path.join(root, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude-tweaks', 'policy.yml'), 'integration-branch: trunk\n');
  const wt = path.join(root, '.claude', 'worktrees', 'fresh');
  sh(root, 'worktree', 'add', '-q', '-b', 'fresh-branch', wt);
  const runDir = path.join(root, '.claude-tweaks', 'pipelines', '2026-08-01T090000-spec-9');
  fs.mkdirSync(runDir, { recursive: true });
  writeRunState(runDir, { status: 'active', worktree: wt });
  return { root, wt, runDir };
}
```

**2c.** Add three tests. Put them immediately after the existing `AC3b:` test:

```js
test('#1463: zero-commit worktree branch (trivially an ancestor) -> in-progress, even with a non-wrap-up ledger event', () => {
  const { runDir } = fixtureZeroCommitRepo();
  writeEvents(runDir, [EV_OTHER, EV_BUILD]);
  const r = checkRunIntegrity(runDir);
  assert.strictEqual(r.state, 'in-progress');
  // mergedEvidence() itself is unchanged — it still reports 'ancestor'; the
  // corroboration gate is what downgrades the verdict.
  assert.strictEqual(r.evidence.merged, 'ancestor');
  assert.strictEqual(r.evidence.branch, 'fresh-branch');
});

test('#1463 discrimination: same fixture, one commit dated after the run start -> shipped-unclosed', () => {
  // Orthogonal control for the test above: the ONLY difference is a commit at
  // or after the run dir's own timestamp. Without the corroboration gate both
  // cases return shipped-unclosed; without a working gate this case would be
  // the one that regressed.
  const { wt, runDir } = fixtureZeroCommitRepo();
  fs.writeFileSync(path.join(wt, 'b.txt'), 'feature\n');
  sh(wt, 'add', 'b.txt');
  datedSh(wt, AFTER_RUN_START, 'commit', '-q', '-m', 'feature work');
  writeEvents(runDir, [EV_BUILD]);
  const r = checkRunIntegrity(runDir);
  assert.strictEqual(r.state, 'shipped-unclosed');
  assert.strictEqual(r.evidence.merged, 'ancestor');
});

test('#1463 fail-open: a run dir name with no parseable timestamp prefix -> in-progress', () => {
  // The corroboration reference is the run dir NAME; when it cannot be parsed
  // the check must resolve toward in-progress, matching every other fail-open
  // field in this module.
  const { root, wt } = fixtureZeroCommitRepo();
  const oddRunDir = path.join(root, '.claude-tweaks', 'pipelines', 'not-a-timestamp-spec-9');
  fs.mkdirSync(oddRunDir, { recursive: true });
  writeRunState(oddRunDir, { status: 'active', worktree: wt });
  writeEvents(oddRunDir, [EV_BUILD]);
  const r = checkRunIntegrity(oddRunDir);
  assert.strictEqual(r.state, 'in-progress');
  assert.strictEqual(r.evidence.merged, 'ancestor');
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test tests/run-integrity.test.js`
Expected: FAIL — the two `-> in-progress` tests report `'shipped-unclosed' !== 'in-progress'`. (The discrimination test passes already; it is the control that must stay green.)

- [ ] **Step 4: Write the implementation**

In `plugin/bin/lib/hooks/run-integrity.js`, insert both helpers immediately after `mergedEvidence()` and before `checkRunIntegrity()`:

```js
// Run dirs are named `{YYYY-MM-DDTHHMMSS}-{slug}` (run-dir-resolve.js's
// formatTimestamp(), always UTC). That prefix already encodes exactly the
// reference point the ancestor check needs — when this run started — so the
// corroboration below needs no new run-state.json field. Returns null for any
// name that doesn't carry a parseable canonical prefix.
const RUN_START_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})(\d{2})(\d{2})(?:-|$)/;
function runStartIso(runDir) {
  const m = RUN_START_RE.exec(path.basename(runDir));
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

// Corroboration for the 'ancestor' evidence path (#1463). `merge-base
// --is-ancestor branch integration` is trivially true for a branch that has
// never diverged from its base, so a freshly created worktree with zero
// commits of its own produces byte-identical evidence to a genuinely
// fast-forward-merged branch. Require at least one commit on the branch dated
// at or after this run's own start time before 'ancestor' counts as shipped.
//
// Fail-open, per this module's per-field contract: an unparseable run-dir name
// or an indeterminate git result returns false, resolving toward in-progress.
// `--since` filters on committer date, so a rebase/amend that rewrites
// timestamps can move a commit out of the window — an accepted edge case, not
// the freshly-created-worktree path this guards.
function hasCommitSinceRunStart(root, branch, runDir) {
  const since = runStartIso(runDir);
  if (!since) return false;
  const log = runGit(['log', branch, `--since=${since}`, '--format=%H', '--max-count=1', '--'], root);
  if (log.failure || log.stdout === null) return false;
  return log.stdout.trim() !== '';
}
```

Then, in `checkRunIntegrity()`, insert one line immediately after the existing `if (evidence.merged !== 'ancestor' && evidence.merged !== 'cherry') return inProgress;`:

```js
    // 'cherry' needs no corroboration — `git cherry` only reports commits the
    // branch actually has, so that path already implies real divergent work.
    if (evidence.merged === 'ancestor' && !hasCommitSinceRunStart(root, evidence.branch, runDir)) return inProgress;
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test tests/run-integrity.test.js`
Expected: PASS — every test in the file, including the pre-existing AC1/AC2/AC3a/AC3b/AC4a/AC4b/AC5 cases and the two SessionStart cases.

- [ ] **Step 6: Run the suites that consume these helpers**

Run: `node --test tests/run-integrity.test.js tests/hooks-worktree-detect.test.js tests/hooks-dispatcher.test.js tests/hooks-session-start.test.js`
Expected: PASS — confirms the `fixtureGit` signature change broke no existing consumer.

- [ ] **Step 7: Commit**

```bash
git add plugin/bin/lib/hooks/run-integrity.js tests/run-integrity.test.js tests/helpers/git-fixtures.js
git commit -m "Corroborate ancestor evidence against run start — a zero-commit worktree is no longer read as shipped (refs #1463)"
```

---

## Self-Review

**1. Spec coverage.**
- Deliverable "ancestor result is corroborated … at least one commit dated at or after the run directory's start time" → Task 1 Step 4, `hasCommitSinceRunStart`.
- Deliverable "start time derived from the run directory's ISO-timestamp-prefixed name; no new `run-state.json` fields" → Task 1 Step 4, `runStartIso`; nothing in this plan writes any file at runtime.
- Deliverable "falls back to `in-progress` … even though `mergedEvidence()` still returns `'ancestor'`" → Task 1 Step 4's single guard line; asserted by the first and third tests in Step 2c (`evidence.merged === 'ancestor'` with `state === 'in-progress'`).
- Deliverable "the `cherry` evidence path is untouched" → the guard is conditioned on `evidence.merged === 'ancestor'`; `mergedEvidence()` is not edited at all. AC2 covers it.
- AC "zero-commit branch yields `in-progress` even when a non-wrap-up ledger event is present" → first test in Step 2c (writes `EV_OTHER, EV_BUILD`).
- AC "existing AC1 scenario still yields `shipped-unclosed`" → the pre-existing AC1 test, made deterministic by Step 2a's date pinning; plus the new discrimination test.
- AC "existing AC2 (cherry) unaffected" → pre-existing AC2 test, run in Step 5.
- AC "all existing cases pass; a new test covers the false positive" → Steps 5 and 6.
- Gotcha "`--since` filters by commit date, rebase/amend edge case" → recorded verbatim as a comment in `hasCommitSinceRunStart`.
- Gotcha "fail-open per field" → `runStartIso` null and `runGit` failure both return `false`; third test in Step 2c pins the direction.
- Gotcha "non-canonical run-dir names are out of scope" → `RUN_START_RE` simply does not match them, and the fail-open direction is the safe one; no special handling added.

**2. Placeholder scan.** No `TBD`/`TODO`/"handle edge cases"/"similar to Task N". Every code step carries literal code.

**3. Type consistency.** `runStartIso(runDir) -> string|null` is consumed only by `hasCommitSinceRunStart(root, branch, runDir) -> boolean`, which is consumed only by the one guard line in `checkRunIntegrity`. `fixtureGit(args, opts = {})` is called with one argument at every pre-existing site and with two arguments only from `datedSh`. `module.exports` is unchanged, so no external consumer sees a new name.
