# Run-Integrity Torn-Down-Worktree Fallback Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When `deriveBranch()` can't resolve a run's branch because the worktree was torn down, resolve it from two durable artifacts instead — a `record-pr` stamp's branch field, then a `decisions.md` branch mention — so `checkRunIntegrity()` can still reach a `shipped-unclosed` verdict rather than failing open to `in-progress` forever.

**Architecture:** `checkRunIntegrity()`'s existing `deriveBranch()` call is unchanged and still tried first. Only when it returns `null` does a new `fallbackBranch(runDir, root, state)` run, trying source 1 (`run-state.json`'s `pr.branch`) then source 2 (a `decisions.md` parse). Whichever resolves is **validated against the local ref store** before use, then fed into the *same* `mergedEvidence()` + corroboration path the live-worktree case already uses — no duplicated merge logic, no second verdict path. Source 1 is made real (not vestigial) by a matching additive change to `hooks.js`'s `record-pr` verb, which records the branch at stamp time, when the worktree is still live and the branch is knowable.

**Tech Stack:** Node 18+, CommonJS, `node --test`. Zero runtime npm deps. Git only through `runGit()`.

**Spec:** `.claude-tweaks/pipelines/2026-08-29T185308-spec-1463-1672-1673-1674/spec-1672/work/1672-spec.md` (GitHub record #1672)

## Global Constraints

- **Premise correction (verified, do not re-derive).** The record's Current State says a shipped run "typically carries a recorded PR URL/branch from a `record-pr` stamp." Only half true: `plugin/bin/hooks.js`'s `record-pr` verb currently writes `{ pr: { number, url } }` — there is **no** branch field. Task 1 adds one. Do not assume any other field exists without reading the code.
- **Fail-open is per-field and must not be weakened.** This fallback trades precision for coverage, so it must never *lower* the bar. When neither source resolves, or the resolved name is not a real local ref, the verdict stays `in-progress` exactly as today. A fabricated or mis-parsed branch that happens to match some other merged branch would manufacture a false `shipped-unclosed` — the ref-existence validation in Task 2 is what prevents that, and it is not optional.
- **The live-worktree path is untouched.** `deriveBranch()` is still called first and its result still wins. This is purely an added fallback.
- `plugin/bin/lib/hooks/run-integrity.js` stays read-only at runtime: no writes, no event appends, no git mutations, no network.
- All git calls go through the existing `runGit(args, cwd)` wrapper. New calls passing a ref name use `--end-of-options` before the ref (this repo's `gh-api-module-pattern` rule; `--` only guards the pathspec slot). The two pre-existing calls in `mergedEvidence()` are **out of scope** — a separate staged backlog item covers them.
- #1673 consumes this evidence path — do not change `checkRunIntegrity`'s return shape (`{ state, evidence: { branch, merged, ledgerActive, wrapupInvoked } }`).
- Commit message style: `{Verb} {what} — {detail}`, imperative, no conventional-commit prefixes. Write `refs #1672`, never `closes`/`fixes`.
- Test command: `node --test tests/run-integrity.test.js` (this suite), `node --test tests/hooks-dispatcher.test.js` (record-pr's suite). Do **not** run the full `npm test` — the orchestrator runs it centrally.

---

### Task 1: Record the branch at `record-pr` time

Source 1 is inert unless something writes the field. At `record-pr` time the worktree is still live (`build/worktree-setup.md` Step 4.5's `record-worktree` always precedes Step 6's PR open), so the branch is knowable exactly then — and that stamp survives teardown.

**Files:**
- Modify: `plugin/bin/lib/hooks/run-integrity.js` (export `deriveBranch`)
- Modify: `plugin/bin/hooks.js` (the `record-pr` verb, around the `writeRunState(runDir, { pr: { number, url: urlArg } })` call)
- Test: `tests/hooks-dispatcher.test.js`

**Interfaces:**
- Produces: `deriveBranch(root, worktreePath, cache)` becomes an exported member of `run-integrity.js`'s `module.exports` (currently `{ checkRunIntegrity, repoRootOf, NON_TERMINAL }`). Signature and behavior unchanged — export only.
- Produces: `run-state.json`'s `pr` object gains an optional third field, `branch: string`. Readers must treat it as optional — every run stamped before this ships has `{ number, url }` only.

- [ ] **Step 1: Write the failing test**

In `tests/hooks-dispatcher.test.js`, add a test asserting `record-pr` records the branch. Find how the file's existing `record-pr` tests build their fixture and follow that shape exactly; the assertion to add is that after a `record-pr` invocation for a run whose `run-state.json` records a live worktree, the written `run-state.json` has `pr.branch` equal to that worktree's branch name.

If the file has no existing `record-pr` test to copy a fixture from, build one with the shared helpers already imported there (`gitRepo`/`harnessWorktreeOf` from `tests/helpers/git-fixtures.js`): create a repo, add a harness worktree, write `{status:'active', worktree: <wt>}` to `{runDir}/run-state.json`, then invoke the dispatcher's `record-pr` the same way that file's other verb tests invoke theirs.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/hooks-dispatcher.test.js`
Expected: FAIL — `pr.branch` is `undefined`.

- [ ] **Step 3: Export `deriveBranch`**

In `plugin/bin/lib/hooks/run-integrity.js`, change the final line to:

```js
module.exports = { checkRunIntegrity, repoRootOf, NON_TERMINAL, deriveBranch };
```

- [ ] **Step 4: Record the branch in `record-pr`**

In `plugin/bin/hooks.js`, add `deriveBranch` to the existing `run-integrity` require (or add the require if none exists in that file), then replace the `record-pr` verb's write call:

```js
      const result = ctxLib.writeRunState(runDir, { pr: { number, url: urlArg } });
```

with:

```js
      // Record the branch alongside the PR while the worktree is still live —
      // this is the one moment it is reliably knowable. run-integrity.js's
      // torn-down-worktree fallback (#1672) reads it back later, when
      // `git worktree list` no longer has an entry to derive it from.
      // Best-effort: a run with no recorded worktree, or a derivation that
      // comes back null, simply records {number, url} as before.
      const prBranch = deriveBranch(repoRootOf(runDir), (ctxLib.readRunState(runDir) || {}).worktree || null);
      const prField = prBranch ? { number, url: urlArg, branch: prBranch } : { number, url: urlArg };
      const result = ctxLib.writeRunState(runDir, { pr: prField });
```

Import both names in the same require — `const { deriveBranch, repoRootOf } = require('./lib/hooks/run-integrity');` — placed with the file's other requires. Check whether `hooks.js` already requires that module and extend the existing destructure instead of adding a duplicate require.

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/hooks-dispatcher.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add plugin/bin/lib/hooks/run-integrity.js plugin/bin/hooks.js tests/hooks-dispatcher.test.js
git commit -m "Record the branch on the record-pr stamp — the fallback needs it after teardown (refs #1672)"
```

---

### Task 2: Fallback branch resolution in `checkRunIntegrity`

**Files:**
- Modify: `plugin/bin/lib/hooks/run-integrity.js`
- Test: `tests/run-integrity.test.js`

**Interfaces:**
- Consumes: `deriveBranch` (unchanged), `runGit`, `fs`, `path` — all already in the module.
- Produces: two module-private helpers — `branchFromDecisions(runDir) -> string|null` and `fallbackBranch(root, runDir, state) -> string|null`. Neither is exported. `checkRunIntegrity`'s return shape is unchanged.

- [ ] **Step 1: Write the failing tests**

In `tests/run-integrity.test.js`, add a fixture builder immediately after `fixtureZeroCommitRepo()`. It produces a genuinely-shipped run whose worktree has been removed — the branch ref survives, the worktree does not:

```js
// #1672's shape: a run that really shipped (its branch has a commit dated
// after the run start AND is merged into trunk), whose worktree has since
// been torn down — so deriveBranch() returns null and only a durable
// artifact (a record-pr stamp, or a decisions.md line) can name the branch.
function fixtureTornDownRepo() {
  const { root, wt, runDir } = fixtureRepo();
  sh(root, 'merge', '-q', '--no-edit', 'feat-branch');
  sh(root, 'worktree', 'remove', '--force', wt);   // branch ref stays, worktree gone
  writeEvents(runDir, [EV_BUILD]);
  return { root, wt, runDir };
}
```

Then add four tests immediately after it:

```js
test('#1672 source 1: torn-down worktree + record-pr stamp carrying the branch -> shipped-unclosed', () => {
  const { wt, runDir } = fixtureTornDownRepo();
  writeRunState(runDir, {
    status: 'active', worktree: wt,
    pr: { number: 7, url: 'https://example.test/pr/7', branch: 'feat-branch' },
  });
  const r = checkRunIntegrity(runDir);
  assert.strictEqual(r.state, 'shipped-unclosed');
  assert.strictEqual(r.evidence.branch, 'feat-branch');
});

test('#1672 source 2: torn-down worktree + only a decisions.md branch mention -> shipped-unclosed', () => {
  const { wt, runDir } = fixtureTornDownRepo();
  writeRunState(runDir, { status: 'active', worktree: wt }); // no pr stamp at all
  fs.writeFileSync(path.join(runDir, 'decisions.md'),
    '- AUTO 09:05:00 — PR-early run lifecycle: pushed feat-branch to origin. Reversibility: high.\n');
  const r = checkRunIntegrity(runDir);
  assert.strictEqual(r.state, 'shipped-unclosed');
  assert.strictEqual(r.evidence.branch, 'feat-branch');
});

test('#1672 AC2: torn-down worktree with neither artifact -> in-progress (fail-open unchanged)', () => {
  const { wt, runDir } = fixtureTornDownRepo();
  writeRunState(runDir, { status: 'active', worktree: wt });
  const r = checkRunIntegrity(runDir);
  assert.strictEqual(r.state, 'in-progress');
  assert.strictEqual(r.evidence.branch, null);
});

test('#1672 validation: a resolved name that is not a real local ref never becomes evidence', () => {
  // The whole risk of this fallback is manufacturing a branch out of a bad
  // parse or a stale stamp. Ref-existence validation is what bounds it.
  const { wt, runDir } = fixtureTornDownRepo();
  writeRunState(runDir, {
    status: 'active', worktree: wt,
    pr: { number: 7, url: 'https://example.test/pr/7', branch: 'no-such-branch' },
  });
  const r = checkRunIntegrity(runDir);
  assert.strictEqual(r.state, 'in-progress');
  assert.strictEqual(r.evidence.branch, null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/run-integrity.test.js`
Expected: FAIL — the two `shipped-unclosed` tests report `'in-progress' !== 'shipped-unclosed'`. (The two `in-progress` tests pass already; they are the controls that must stay green.)

- [ ] **Step 3: Write the implementation**

In `plugin/bin/lib/hooks/run-integrity.js`, insert these helpers immediately after `deriveBranch()` and before `mergedEvidence()`:

```js
// A branch name is only usable as evidence if it actually exists in this
// checkout. Both fallback sources below are recovered from artifacts that can
// be stale (a stamp from a run whose branch was later deleted) or imprecise (a
// prose log line) — without this check a bad name could match nothing, or
// worse, match some unrelated merged branch and manufacture a false
// 'shipped-unclosed'. This is the bound on the precision/coverage trade the
// whole fallback makes.
function branchExists(root, branch) {
  if (!branch) return false;
  const r = runGit(['rev-parse', '--verify', '--quiet', '--end-of-options', `refs/heads/${branch}`], root);
  return !r.failure && r.stdout !== null && r.stdout.trim() !== '';
}

// Source 2: the branch name from decisions.md's PR-early lifecycle log lines
// (_shared/pr-early-run-lifecycle.md Steps 2-3 make both lines mandatory, which
// is what makes this parseable at all). Read-and-catch rather than
// existsSync-then-read: a concurrent sibling archiving this run dir between the
// two calls is a live hazard here, and an unreadable file means the same thing
// as an absent one.
const DECISION_BRANCH_RES = [
  /PR-early run lifecycle: pushed (\S+) to origin/,
  /PR-early run lifecycle: opened PR #?\d+ for (\S+)/,
  /PR-early run lifecycle: push of (\S+) to origin FAILED/,
];
function branchFromDecisions(runDir) {
  let text;
  try { text = fs.readFileSync(path.join(runDir, 'decisions.md'), 'utf8'); } catch { return null; }
  for (const re of DECISION_BRANCH_RES) {
    const m = re.exec(text);
    if (m && m[1]) return m[1];
  }
  return null;
}

// #1672: deriveBranch() reads `git worktree list --porcelain`, so it goes null
// the moment a finished run's worktree is torn down — which is the normal end
// state of a run that shipped. That made checkRunIntegrity fail open to
// 'in-progress' permanently for exactly the runs the shipped-unclosed advisory
// exists to catch. Two artifacts outlive the worktree; try them in the order
// the record specifies, most durable first.
function fallbackBranch(root, runDir, state) {
  const fromStamp = state && state.pr && typeof state.pr.branch === 'string' ? state.pr.branch : null;
  if (branchExists(root, fromStamp)) return fromStamp;
  const fromDecisions = branchFromDecisions(runDir);
  if (branchExists(root, fromDecisions)) return fromDecisions;
  return null;
}
```

Then, in `checkRunIntegrity()`, replace this line:

```js
    evidence.branch = deriveBranch(root, state.worktree || null, cache);
    if (!evidence.branch) return inProgress;
```

with:

```js
    evidence.branch = deriveBranch(root, state.worktree || null, cache);
    // Live worktree wins; the fallback runs only when it can't answer (#1672).
    if (!evidence.branch) evidence.branch = fallbackBranch(root, runDir, state);
    if (!evidence.branch) return inProgress;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/run-integrity.test.js`
Expected: PASS — every test in the file, including all pre-existing cases and #1463's three.

- [ ] **Step 5: Verify AC3 — the live-worktree path is unchanged**

The pre-existing `branch derivation a/b/c` tests and `AC3b` all assert `evidence.branch === null` for a live-worktree-but-unresolvable case. Confirm they still pass in Step 4's run and name them in your report — they are the regression proof that the fallback did not short-circuit or replace the existing check.

- [ ] **Step 6: Commit**

```bash
git add plugin/bin/lib/hooks/run-integrity.js tests/run-integrity.test.js
git commit -m "Resolve a torn-down run's branch from its PR stamp or decisions log — validated against the ref store (refs #1672)"
```

---

### Task 3: Verify the SessionStart banner renders for a torn-down run (Deliverable 4)

The record's Deliverable 4 is a verification, not a code change: confirm `session-start.js` renders the specific `shipped-unclosed` hint for a torn-down-worktree run exactly as it does for a live one. Pin it with a test so it cannot silently regress.

**Files:**
- Test: `tests/run-integrity.test.js`
- Read-only: `plugin/bin/lib/hooks/session-start.js`

- [ ] **Step 1: Write the test**

The file already has a `runSessionStart(cwd)` helper and two SessionStart tests at the bottom. Add a third, immediately after the existing `SessionStart: shipped-unclosed run line names both remediations` test, reusing `fixtureTornDownRepo()` from Task 2:

```js
test('#1672 AC1: SessionStart renders the shipped-unclosed hint for a torn-down-worktree run', () => {
  const { root, wt, runDir } = fixtureTornDownRepo();
  writeRunState(runDir, {
    status: 'active', worktree: wt,
    pr: { number: 7, url: 'https://example.test/pr/7', branch: 'feat-branch' },
  });
  const r = runSessionStart(root);
  assert.strictEqual(r.code, 0);
  const ctxOut = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
  assert.match(ctxOut, /appears shipped/);
  assert.match(ctxOut, /\/claude-tweaks:wrap-up/);
  assert.match(ctxOut, /close-run --run "/);
});
```

- [ ] **Step 2: Run it**

Run: `node --test tests/run-integrity.test.js`
Expected: PASS. If it FAILS, that is a real finding about `session-state.js`'s rendering, not a test bug — report it as `DONE_WITH_CONCERNS` with the actual output rather than adjusting the assertion to match.

- [ ] **Step 3: Commit**

```bash
git add tests/run-integrity.test.js
git commit -m "Pin the SessionStart shipped-unclosed hint for a torn-down worktree (refs #1672)"
```

---

## Self-Review

**1. Spec coverage.**
- Deliverable 1 (fallback fn, sources in order) → Task 2 Step 3's `fallbackBranch`, stamp before decisions.
- Deliverable 2 (feed into the same merged check, don't duplicate) → Task 2 Step 3 assigns `evidence.branch` *before* the existing `resolveIntegrationBranch`/`mergedEvidence` lines, so the identical downstream path runs.
- Deliverable 3 (neither source resolves → unchanged fail-open) → Task 2's `#1672 AC2` test.
- Deliverable 4 (session-start banner) → Task 3.
- Deliverable 5 (three test cases: source 1, source 2, neither) → Task 2's first three tests; the fourth (ref validation) is an addition, see below.
- AC1 → Task 2 source-1/source-2 tests + Task 3. AC2 → Task 2's AC2 test. AC3 → Task 2 Step 5. AC4 → orchestrator's central `npm test`.
- Gotcha "keep the fail-open discipline, don't lower the bar for coverage" → the `branchExists` validation and its fourth test exist specifically for this; it is the one addition beyond the record's stated deliverables and is justified in Global Constraints.
- Gotcha "#1673 consumes this — don't change the return shape" → Global Constraints; no export or field is removed or renamed.
- Gotcha "blocked by #1463" → satisfied; #1463 landed in `548ae56fa` on this same branch, and Task 2 edits the post-#1463 shape of `checkRunIntegrity`.

**2. Placeholder scan.** No `TBD`/`TODO`/"handle edge cases". Task 1 Step 1 deliberately says "follow the file's existing fixture shape" rather than inventing a fixture blind — that is an instruction to read a specific real file, not a placeholder, and Step 1 states the exact assertion to make.

**3. Type consistency.** `branchExists(root, branch) -> boolean`, `branchFromDecisions(runDir) -> string|null`, `fallbackBranch(root, runDir, state) -> string|null`. `fallbackBranch` is called only from `checkRunIntegrity`, with `(root, runDir, state)` — all three are in scope at that line. `deriveBranch`'s exported signature `(root, worktreePath, cache)` matches Task 1 Step 4's two-argument call (`cache` is optional — the pre-cache shape every other caller uses).
