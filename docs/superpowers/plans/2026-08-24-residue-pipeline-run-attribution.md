# Residue Pipeline-Run Attribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `bin/residue.js --scope blast-radius` return only the invoking run's own pipeline-run findings by tagging un-attributable clean run dirs `scope: 'observed'` in `probePipelineRuns` (record #1118).

**Architecture:** `probePipelineRuns` gains two optional attribution inputs — `runId` (the invoking run's directory basename) and `worktreeRoot` (the invoking checkout's toplevel) — and tags each clean run-dir finding `blast-radius` only when the dir's name equals `runId` or its `run-state.json` `worktree` field realpath-equals `worktreeRoot`; everything else becomes `observed`, which `scope-filter.js` already drops under `--scope blast-radius` and keeps under `--scope repo`. `bin/residue.js` computes both inputs (env `PIPELINE_RUN_DIR` basename; `git rev-parse --show-toplevel` via its existing runner). The probe itself stays fs-only.

**Tech Stack:** Node 18+ built-ins (`node:fs`, `node:path`), `node --test`.

**Spec:** `.claude-tweaks/pipelines/2026-08-24T142243-record-1118/work/1118-spec.md` (materialized record #1118)

## Global Constraints

- The record's branches-probe deliverable is ALREADY LANDED (commit `99aa3881` tags every surviving `probeBranches` finding `observed`; comment in `plugin/bin/lib/residue/probes/branches.js:79-85` cites #499). Do NOT touch `branches.js` logic — this plan implements only the pipeline-run half plus its tests and prose.
- This change deliberately supersedes the #1011 audit (commit `3271b20a`) recorded in `plugin/bin/lib/residue/probes/pipeline-runs.js:56-66` and pinned by the test `'a clean run dir belonging to an unrelated record is still blast-radius (deliberate divergence from probeBranches)'` in `tests/bin-lib/residue/probes-pipeline-runs.test.js:49-55`. Record #1118 was filed from live evidence (6 unrelated run dirs surfacing in record #706's own blast-radius sweep) and human-authorized after that audit landed — replace the audit comment and the pinning test; never leave both claims in the tree.
- `--scope repo` behavior must be unchanged: `filterResultsByScope` (`plugin/bin/lib/residue/scope-filter.js`) already passes every finding through untouched for any `cliScope !== 'blast-radius'` — no edit there.
- macOS realpath hazard: test fixtures live under `os.tmpdir()` (`/var/...` → symlink to `/private/var/...`). Every path comparison MUST realpath BOTH sides (`fs.realpathSync` with a `path.resolve` fallback for paths that no longer exist), or the worktree-match tests fail only on macOS.
- Commit messages reference the record as `refs #1118` — never `closes`/`fixes`.
- Imperative commit style, no conventional-commit prefixes (repo convention).

---

### Task 1: Attribution inputs in `probePipelineRuns` + CLI wiring (TDD)

**Files:**
- Modify: `plugin/bin/lib/residue/probes/pipeline-runs.js`
- Modify: `plugin/bin/residue.js:124-132` (the `filterResultsByScope([...])` probe list)
- Test: `tests/bin-lib/residue/probes-pipeline-runs.test.js`

**Interfaces:**
- Consumes: `makeFinding` (`../finding`), `mainCheckoutRoot` (`../../hooks/worktree-detect`), `RUN_ID_RE` (`../../hooks/context`) — all already imported by the probe.
- Produces: `probePipelineRuns({ cwd, runId, worktreeRoot })` — same return shape `{ ran, reason, findings }`; `runId` and `worktreeRoot` are optional strings; a call without them (every pre-existing caller) tags all findings `observed`.

- [ ] **Step 1: Rewrite the affected tests (write the failing tests)**

In `tests/bin-lib/residue/probes-pipeline-runs.test.js`:

(a) Change the first test's scope assertion — the no-attribution-input call now yields `observed`:

```js
test('an un-archived clean run dir is reported with remedy auto', () => {
  const root = makeFixture();
  writeRun(root, '2026-01-01T000000-spec-1', { status: 'clean' });
  const { ran, findings } = probePipelineRuns({ cwd: root });
  assert.strictEqual(ran, true);
  assert.strictEqual(findings.length, 1);
  assert.strictEqual(findings[0].kind, 'pipeline-run');
  assert.strictEqual(findings[0].remedy, 'auto');
  // No attribution inputs supplied -> nothing is provably this run's own (#1118).
  assert.strictEqual(findings[0].scope, 'observed');
  assert.match(findings[0].subject, /2026-01-01T000000-spec-1/);
});
```

(b) Replace the `'a clean run dir belonging to an unrelated record is still blast-radius (deliberate divergence from probeBranches)'` test (lines 39-55, including its #1011 comment block) with:

```js
// #1118 supersedes the #1011 audit that used to pin the opposite here:
// observed live during record #706's wrap-up, a `--scope blast-radius`
// sweep returned 6 un-archived clean run dirs belonging to OTHER records —
// exactly the cross-session noise residue-sweep.md documents blast-radius
// as excluding. A clean run dir is only this run's own blast radius when
// it can be attributed to the invoking run; sibling orphans stay visible
// under --scope repo (/tidy's sweep).
test('a clean run dir not attributable to the invoking run is observed (#1118)', () => {
  const root = makeFixture();
  writeRun(root, '2026-01-01T000000-record-999', { status: 'clean', worktree: path.join(root, 'elsewhere') });
  const { findings } = probePipelineRuns({ cwd: root, runId: '2026-01-02T000000-record-1118', worktreeRoot: root });
  assert.strictEqual(findings.length, 1);
  assert.strictEqual(findings[0].scope, 'observed');
});

test('a clean run dir whose name equals the invoking runId is blast-radius', () => {
  const root = makeFixture();
  writeRun(root, '2026-01-01T000000-record-1118', { status: 'clean' });
  const { findings } = probePipelineRuns({ cwd: root, runId: '2026-01-01T000000-record-1118' });
  assert.strictEqual(findings.length, 1);
  assert.strictEqual(findings[0].scope, 'blast-radius');
});

test('a clean run dir whose run-state worktree matches the invoking worktree root is blast-radius', () => {
  const root = makeFixture();
  // root sits under os.tmpdir(): on macOS that is a /var -> /private/var
  // symlink, so this test only passes when the probe realpaths BOTH sides.
  writeRun(root, '2026-01-01T000000-spec-7', { status: 'clean', worktree: root });
  const { findings } = probePipelineRuns({ cwd: root, worktreeRoot: root });
  assert.strictEqual(findings.length, 1);
  assert.strictEqual(findings[0].scope, 'blast-radius');
});

// Record #1118's acceptance criterion, end to end through the CLI's own
// filter: one attributable dir, one sibling dir — blast-radius keeps only
// the invoking run's own; repo scope still sees both, untouched.
test('AC #1118: blast-radius keeps only the attributable run dir; repo scope keeps both', () => {
  const root = makeFixture();
  writeRun(root, '2026-01-01T000000-record-1118', { status: 'clean', worktree: root });
  writeRun(root, '2026-01-01T000000-record-999', { status: 'clean', worktree: path.join(root, 'elsewhere') });
  const result = probePipelineRuns({ cwd: root, runId: '2026-01-01T000000-record-1118', worktreeRoot: root });
  assert.strictEqual(result.findings.length, 2);

  const [blast] = filterResultsByScope([result], 'blast-radius');
  assert.strictEqual(blast.findings.length, 1);
  assert.match(blast.findings[0].subject, /record-1118/);

  const [repo] = filterResultsByScope([result], 'repo');
  assert.strictEqual(repo.findings.length, 2);
});
```

Add the import at the top of the test file alongside the existing requires:

```js
const { filterResultsByScope } = require('../../../plugin/bin/lib/residue/scope-filter');
```

Leave every other existing test in the file untouched (non-clean dir, missing run-state.json, archive/ exclusion, ENOENT, readdir failure, archiveRunDir round-trip) — none asserts a `scope` value.

- [ ] **Step 2: Run the suite to verify the new tests fail**

Run: `cd "$WORKTREE" && node --test tests/bin-lib/residue/probes-pipeline-runs.test.js`
Expected: FAIL — current code tags everything `blast-radius`, so: `'an un-archived clean run dir...'` fails (`'blast-radius' !== 'observed'`), the not-attributable test fails (`'blast-radius' !== 'observed'`), and the AC test fails (blast-radius keeps 2 findings, not 1). The runId and worktree-match tests pass incidentally against current code — they exist to pin the attributable side of the new behavior (the worktree-match one specifically discriminates against an implementation that skips the realpath), not to go red here.

- [ ] **Step 3: Implement attribution in the probe**

In `plugin/bin/lib/residue/probes/pipeline-runs.js`:

(a) Replace the finding's hardcoded-scope comment block and `scope: 'blast-radius'` line (currently lines 52-67) with:

```js
      // Attribution (#1118, superseding the #1011 audit that used to keep
      // this unconditionally blast-radius): a clean run dir is only THIS
      // run's own blast radius when the invoking run can claim it — its
      // name equals the invoking run's own id, or its run-state.json
      // `worktree` field resolves to the invoking checkout's toplevel.
      // Everything else is another session's orphan: real, cheap to archive,
      // but not this run's residue — observed live during record #706's
      // wrap-up, where a blast-radius sweep returned 6 other records' dirs.
      // Sibling orphans stay visible under --scope repo (/tidy's sweep),
      // and reconcile's archive sweep still handles them mechanically.
      scope: isOwnRun(entry.name, state, runId, worktreeRootReal) ? 'blast-radius' : 'observed',
```

(b) Above `probePipelineRuns`, add:

```js
// Realpath both sides of every path comparison: fixture/tmp paths and real
// worktrees routinely sit behind symlinks (macOS /var -> /private/var), and
// a string-compare on unresolved paths silently never matches. Fall back to
// path.resolve for a path that no longer exists (an already-removed
// worktree can't equal the live invoking root anyway).
function safeReal(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

function isOwnRun(entryName, state, runId, worktreeRootReal) {
  if (runId && entryName === runId) return true;
  if (worktreeRootReal && state && typeof state.worktree === 'string' && state.worktree) {
    return safeReal(state.worktree) === worktreeRootReal;
  }
  return false;
}
```

(c) Change the signature and add the one-time realpath at the top of the function:

```js
function probePipelineRuns({ cwd, runId, worktreeRoot } = {}) {
  const start = cwd || process.cwd();
  const root = mainCheckoutRoot(start) || start;
  const worktreeRootReal = worktreeRoot ? safeReal(worktreeRoot) : null;
```

(d) Update the file's header comment (lines 1-10): append one sentence — `Findings are attributed to the invoking run (#1118): only a run dir the invoking run can claim (runId or worktree match) is tagged blast-radius; the rest are observed.`

- [ ] **Step 4: Wire the CLI**

In `plugin/bin/residue.js`, change the probe call inside the `filterResultsByScope([...])` list (line 130) from `probePipelineRuns({ cwd })` to:

```js
    probePipelineRuns({
      cwd,
      // The invoking run's identity, when one is threaded (wrap-up runs
      // inside a pipeline run; standalone invocations have none) — #1118.
      runId: process.env.PIPELINE_RUN_DIR ? path.basename(process.env.PIPELINE_RUN_DIR) : null,
      worktreeRoot: git(['rev-parse', '--show-toplevel']),
    }),
```

(`git(...)` returns `null` on failure via the existing runner — the probe treats a null `worktreeRoot` as no signal.)

- [ ] **Step 5: Run the suite to verify it passes**

Run: `cd "$WORKTREE" && node --test tests/bin-lib/residue/probes-pipeline-runs.test.js`
Expected: PASS (11 tests)

Run: `cd "$WORKTREE" && node --test tests/bin-lib/residue/cli.test.js tests/bin-lib/residue/scope-filter.test.js tests/bin-lib/residue/finding.test.js`
Expected: PASS — CLI smoke, filter, and finding-shape suites unaffected.

- [ ] **Step 6: Commit**

```bash
cd "$WORKTREE" && git add plugin/bin/lib/residue/probes/pipeline-runs.js plugin/bin/residue.js tests/bin-lib/residue/probes-pipeline-runs.test.js && git commit -m "Attribute pipeline-run residue findings to the invoking run (refs #1118)"
```

### Task 2: Prose sweep — residue-sweep.md documents the attribution rule

**Files:**
- Modify: `plugin/skills/wrap-up/residue-sweep.md:71-85` (the `remedy: auto` findings section)

**Interfaces:**
- Consumes: Task 1's behavior (pipeline-run findings from other runs are `observed`).
- Produces: nothing downstream — documentation only.

- [ ] **Step 1: Update the `remedy: auto` paragraph**

In `plugin/skills/wrap-up/residue-sweep.md`, the sentence spanning lines 76-80 currently covers only branches ("A merged-but-undeleted branch carries `remedy: auto` too, but never reaches here under this preamble's `--scope blast-radius` (above): `probeBranches` only ever tags a branch `scope: 'observed'` once it survives the `scope.headBranch` exclusion (#499), so it's filtered out before Phase 1 sees it — same as any other `observed` finding, and still visible under `--scope repo` (`/tidy`'s job, not this preamble's)."). Extend it — after "(`/tidy`'s job, not this preamble's)." and before "When Phase 1", insert:

```
An un-archived clean run dir belonging to another session never reaches here either (#1118):
`probePipelineRuns` tags a run dir `blast-radius` only when it is attributable to the invoking
run (its name matches this run's own id, or its `run-state.json` `worktree` field resolves to
this checkout's toplevel) — a sibling session's orphan is `observed`, visible under
`--scope repo` and still archived mechanically by reconcile's own sweep.
```

Also update line 74's parenthetical "(an unlocked stale worktree, a claim blob for a closed issue, a missing release-triple entry, an un-archived pipeline run dir whose `run-state.json` reached `status: clean`)" to "(an unlocked stale worktree, a claim blob for a closed issue, a missing release-triple entry, an un-archived pipeline run dir of this run's own whose `run-state.json` reached `status: clean`)".

- [ ] **Step 2: Negative sweep — no stale claim of the old behavior survives**

Run (repo-wide, from `$WORKTREE`): `grep -rni "deliberate divergence from probeBranches" plugin/ tests/ docs/`
Expected: no output.

Run: `grep -rni "inert regardless of which session" plugin/ tests/`
Expected: no output (the #1011 phrasing is gone from both the probe comment and the test file; the historical ledger under `docs/plans/2026-08-21-record-652-ledger.md` is an archived run record, not a live claim — leave it).

- [ ] **Step 3: Run the conformance-adjacent suites**

Run: `cd "$WORKTREE" && node --test tests/bin-lib/residue/`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd "$WORKTREE" && git add plugin/skills/wrap-up/residue-sweep.md && git commit -m "Document pipeline-run attribution in the residue-sweep preamble (refs #1118)"
```

---

## Self-review notes

- **Spec coverage:** Deliverable 1 (branches) — pre-satisfied by `99aa3881`, constraint documents it; Deliverable 1 (pipeline-run probe) — Task 1; Deliverable 2 (`--scope blast-radius` returns only own leftovers) — Task 1 Steps 3-4 + AC test; AC 1 (other session's finding excluded) — AC test; AC 2 (`--scope repo` unaffected) — AC test's repo assertion + untouched `scope-filter.js`; AC 3 (existing tests pass, new test with two fixtures one-attributable-one-not) — Task 1 Steps 1/5.
- **Type consistency:** `probePipelineRuns({ cwd, runId, worktreeRoot })` — Task 1 Steps 1, 3, 4 all use this exact shape; `safeReal`/`isOwnRun` defined and consumed only inside the probe.
- **Placeholder scan:** none.
