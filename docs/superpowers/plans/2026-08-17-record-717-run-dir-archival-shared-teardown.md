# Run-Dir Archival Shared Teardown + residue.js Backstop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move run-dir archival in the multi-spec consolidated Review Console out of the "On approval" resolution branch and into the shared teardown mechanics that already run identically on approval, override, and the headless `consoleAutoResolve` path — then add a `bin/residue.js` sweep finding so any already-orphaned (status `clean`, never archived) run dir left over from before this fix gets flagged with `remedy: auto` and drained via the existing wrap-up residue-sweep Phase-1 fix-now flow.

**Architecture:** `skills/flow/multispec-review-console.md`'s "Shared teardown" section (lines 294-306) already documents the mechanics that both "On approval" and "On override" execute identically for dev-server teardown, branch-finish, claim release, grants, and label cleanup. Archival is *not* one of those shared steps today — it is separately spelled out as "On approval" step 9 and "On override" step 7, and restated a third time in the `consoleAutoResolve` short-circuit's own prose (line 66) as a bolt-on clause rather than a step any procedure actually points at. Because `consoleAutoResolve`'s prose says "archive the parent run dir" without pointing at a concrete numbered mechanic, and because `bin/lib/hooks/context.js`'s `iterRunDirsWithState` permanently skips any run dir once its `run-state.json` reaches `status: 'clean'`, a run whose archival step got missed becomes invisible to the reconciler's own `archiveMerged` sweep (`bin/lib/reconcile/archive-merged.js`) forever after — nothing else in this codebase ever looks at a `status: 'clean'` dir again. This plan (1) makes archival one shared, numbered step so every resolution path runs the identical mechanic, and (2) adds a `bin/residue.js` probe that deliberately bypasses `iterRunDirsWithState`'s clean-skip filter to find exactly the already-orphaned dirs that blind spot produced, so the existing 104-dir backlog drains via wrap-up's own residue-sweep Phase-1 fix-now flow instead of growing.

**Tech Stack:** Markdown skill files (procedure prose, no runtime). Node (`bin/residue.js` CLI + `bin/lib/residue/*` modules), `node --test` for tests. No build step.

**Spec:** GitHub issue #717 (materialized at `.claude-tweaks/pipelines/2026-08-17T052653-record-717/work/717-spec.md`) — the plan argues from that spec; the implementer subagent should read both.

## Global Constraints

- Deliverables are scoped to exactly two files plus their tests: `skills/flow/multispec-review-console.md` and `bin/residue.js` (and the `bin/lib/residue/*` modules it composes). Do **not** touch `bin/lib/reconcile/archive-merged.js`'s `iterRunDirsWithState`/clean-skip behavior, or wire a new automatic reconcile check — that is a materially larger change than this record's own Deliverables list, and the record's `Defer-reason: genuinely-larger` on its own filing history is a signal to keep this fix narrow, not an invitation to widen it.
- `skills/wrap-up/cleanup-procedures.md`'s archival ownership row (line 18: `**Yes — parent /flow owns archival**`, line 36: "parent /flow archives the multi-spec parent dir after consolidated console") does **not** name the "On approval" branch specifically — verified by reading the file. No edit is needed there; Task 1 includes a verification sub-step recording that check rather than editing the file.
- New residue finding `kind` values must be added to `bin/lib/residue/finding.js`'s `KINDS` frozen array — the module's own `validateFinding` rejects any kind not listed there.
- `remedy` values are constrained to `'auto' | 'record'` (`bin/lib/residue/finding.js`'s `REMEDIES`) and `scope` to `'blast-radius' | 'observed'` — reuse these, do not invent new ones.

---

## Task 1: Move run-dir archival into Shared teardown (skill prose only)

**Files:**
- Modify: `skills/flow/multispec-review-console.md`

**Interfaces:** None (markdown prose, no code interface).

- [ ] **Step 1: Read the current file in full**

Already read during planning — the file is at `skills/flow/multispec-review-console.md` (336 lines). The relevant passages:
- Line 38 (inside "When to run the consolidated console"): `6. Archive the parent run dir to \`.claude-tweaks/pipelines/archive/\`` — a summary-list item, not itself a procedure.
- Line 66 (inside `## Auto-resolution short-circuit (\`consoleAutoResolve\`)`): ends with `Then proceed straight to Cleanup actions execution (Shared teardown below) and archive the parent run dir — skip the console render and its \`AskUserQuestion\` entirely.`
- Line 282 (inside `## On approval (option 1)`, numbered step 9): `9. Archive the parent run dir to \`.claude-tweaks/pipelines/archive/{run-id}/\` (subdirs included)`
- Line 292 (inside `## On override (option 2)`, numbered step 7): `7. Archive the parent run dir`
- Lines 294-306 (`### Shared teardown (dev server, branch finish, claim release, grants)`): a 5-step numbered mechanics list (dev-server teardown, branch-finish, claim release, grants, label cleanup). No archival step today.

- [ ] **Step 2: Add archival as Shared teardown's own step 6**

In `skills/flow/multispec-review-console.md`, locate the `### Shared teardown (dev server, branch finish, claim release, grants)` section (starts at the line reading exactly that heading). Its numbered list currently ends at:

```
5. **Remove `bot:in-progress`; restore `parked` if applicable** — see "Per-issue label cleanup" below.
```

Immediately after that line (and before the following `### Per-issue label cleanup` heading), add:

```
6. **Archive the parent run dir** to `.claude-tweaks/pipelines/archive/{run-id}/` (subdirs included) — the same move `wrap-up/cleanup-procedures.md` Section B performs for a single-spec run, applied here to the multi-spec parent directory. Runs last, after every row above it, regardless of which resolution path triggered this teardown.
```

- [ ] **Step 3: Replace "On approval" step 9 with a pointer to Shared teardown**

Find the line (currently numbered step 9 in `## On approval (option 1)`):

```
9. Archive the parent run dir to `.claude-tweaks/pipelines/archive/{run-id}/` (subdirs included)
```

Replace it with:

```
9. Archive the parent run dir — "Shared teardown" step 6 below.
```

- [ ] **Step 4: Replace "On override" step 7 with the same pointer**

Find the line (currently numbered step 7 in `## On override (option 2)`):

```
7. Archive the parent run dir
```

Replace it with:

```
7. Archive the parent run dir — "Shared teardown" step 6 below.
```

- [ ] **Step 5: Simplify the `consoleAutoResolve` prose to point at Shared teardown instead of restating archival**

Find the sentence at the end of the `## Auto-resolution short-circuit (\`consoleAutoResolve\`)` section:

```
Then proceed straight to Cleanup actions execution (Shared teardown below) and archive the parent run dir — skip the console render and its `AskUserQuestion` entirely.
```

Replace it with:

```
Then proceed straight to Cleanup actions execution (Shared teardown below, including its archival step) — skip the console render and its `AskUserQuestion` entirely.
```

This removes the standalone "archive the parent run dir" clause that restated (rather than pointed at) the mechanic, so the only place archival is actually specified is Shared teardown step 6 — reached identically whether this short-circuit, "On approval", or "On override" triggered teardown.

- [ ] **Step 6: Update the "When to run" summary line for consistency**

Find, inside `## When to run the consolidated console`:

```
6. Archive the parent run dir to `.claude-tweaks/pipelines/archive/`
```

Replace it with:

```
6. Archive the parent run dir — Shared teardown's own last step, run identically regardless of which resolution path triggered it.
```

- [ ] **Step 7: Verify `skills/wrap-up/cleanup-procedures.md` needs no mirrored edit**

Read `skills/wrap-up/cleanup-procedures.md` lines 1-40. Confirm the archival ownership row (`| 8 | Pipeline run directory | Section B below — archive (do not delete) to \`.claude-tweaks/pipelines/archive/{run-id}/\` | run dir exists | **Yes — parent /flow owns archival** |`) and its companion line ("Item 8 (Pipeline run dir archival) — parent /flow archives the multi-spec parent dir after consolidated console") do not say or imply "only on the approval branch" — they describe ownership (`/flow`, not `/wrap-up`), not a specific resolution path. No edit needed. Do not change this file as part of this task.

- [ ] **Step 8: Verification**

```bash
grep -n "archive" skills/flow/multispec-review-console.md
```

Expected: archival now appears under `### Shared teardown` as its own numbered step 6, and the "On approval"/"On override"/`consoleAutoResolve` occurrences all read as pointers to that step rather than independent instructions to archive. This is Acceptance Criterion 1 from the spec.

- [ ] **Step 9: Commit**

```bash
git add skills/flow/multispec-review-console.md
git commit -m "Move run-dir archival into Shared teardown — refs #717"
```

---

## Task 2: Add a `pipeline-run` finding kind

**Files:**
- Modify: `bin/lib/residue/finding.js`

**Interfaces:**
- Consumes: nothing new — this task only widens an existing frozen array.
- Produces: `KINDS` now includes `'pipeline-run'`, consumed by Task 3's new probe module and validated by `validateFinding`.

- [ ] **Step 1: Read the current file**

Already read during planning (`bin/lib/residue/finding.js`, 30 lines). `KINDS` is `Object.freeze(['worktree', 'branch', 'pr', 'suite', 'release'])` at line 11.

- [ ] **Step 2: Write the failing test**

Add to `tests/bin-lib/residue/finding.test.js` (create if it does not already exist — check first: `ls tests/bin-lib/residue/finding.test.js`; if present, append to it instead of overwriting):

```javascript
const { test } = require('node:test');
const assert = require('node:assert');
const { makeFinding, validateFinding, KINDS } = require('../../../bin/lib/residue/finding');

test('pipeline-run is a valid finding kind', () => {
  assert.ok(KINDS.includes('pipeline-run'));
  const finding = makeFinding({
    kind: 'pipeline-run', scope: 'blast-radius', subject: '.claude-tweaks/pipelines/2026-01-01T000000-spec-1',
    remedy: 'auto', evidence: 'run-state.json status: clean, not under archive/',
  });
  assert.deepStrictEqual(validateFinding(finding), []);
});
```

- [ ] **Step 3: Run it to verify it fails**

```bash
node --test tests/bin-lib/residue/finding.test.js
```

Expected: FAIL — `KINDS.includes('pipeline-run')` is `false`.

- [ ] **Step 4: Add the kind**

In `bin/lib/residue/finding.js`, change:

```javascript
const KINDS = Object.freeze(['worktree', 'branch', 'pr', 'suite', 'release']);
```

to:

```javascript
const KINDS = Object.freeze(['worktree', 'branch', 'pr', 'suite', 'release', 'pipeline-run']);
```

- [ ] **Step 5: Run it to verify it passes**

```bash
node --test tests/bin-lib/residue/finding.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add bin/lib/residue/finding.js tests/bin-lib/residue/finding.test.js
git commit -m "Add pipeline-run residue finding kind — refs #717"
```

---

## Task 3: New probe — un-archived `status: clean` run dirs

**Files:**
- Create: `bin/lib/residue/probes/pipeline-runs.js`
- Modify: `bin/lib/hooks/context.js` (export `RUN_ID_RE`)
- Modify: `bin/residue.js` (wire the new probe into `main()`)
- Test: `tests/bin-lib/residue/probes-pipeline-runs.test.js`

**Interfaces:**
- Consumes: `makeFinding` (`bin/lib/residue/finding.js`, Task 2's widened `KINDS`), `mainCheckoutRoot` (`bin/lib/hooks/worktree-detect.js`, already exported), `RUN_ID_RE` (`bin/lib/hooks/context.js`, exported by this task's Step 2).
- Produces: `probePipelineRuns({ cwd }) -> { ran: boolean, reason: string|null, findings: Finding[] }` — same three-field shape every other probe in `bin/lib/residue/probes/*` returns (see `bin/lib/residue/probes/worktrees.js`'s `probeWorktrees` for the pattern this mirrors). Exported as `{ probePipelineRuns }` from `bin/lib/residue/probes/pipeline-runs.js`.

- [ ] **Step 1: Read the two files this probe depends on**

Already read during planning:
- `bin/lib/hooks/context.js` — `RUN_ID_RE = /^\d{4}-\d{2}-\d{2}T/;` (line 26, currently module-local, not exported) and `iterRunDirsWithState`'s own `if (state && state.status === 'clean') continue;` skip (line 66) — this probe must NOT use `iterRunDirsWithState`, since that function is precisely what makes already-`clean` dirs invisible; it reads `.claude-tweaks/pipelines/` directly instead.
- `bin/lib/residue/probes/worktrees.js` — the `{ ran, reason, findings }` shape and `makeFinding` call pattern this task mirrors.
- `bin/lib/residue/probes/release.js` — the pattern of a probe that is a project-wide/opportunistic-housekeeping check rather than strictly "this run's own blast radius," and hardcodes `scope: 'blast-radius'` regardless of the CLI's own `--scope` flag (see its `findings.push(makeFinding({ kind: 'release', scope: 'blast-radius', ... }))` calls). This task's probe follows the same convention: an orphaned run dir is cheap, mechanical housekeeping any wrap-up cycle should just fix, not something to hide behind `--scope repo`.

- [ ] **Step 2: Export `RUN_ID_RE` from `bin/lib/hooks/context.js`**

In `bin/lib/hooks/context.js`, change the final export statement:

```javascript
module.exports = {
  readStdin, parseInput, resolveRun, resolveRunDir, listRunDirs, listRunDirsWithState, iterRunDirsWithState,
  readRunState, writeRunState, appendEvent, findRunByWorktreePath,
};
```

to:

```javascript
module.exports = {
  readStdin, parseInput, resolveRun, resolveRunDir, listRunDirs, listRunDirsWithState, iterRunDirsWithState,
  readRunState, writeRunState, appendEvent, findRunByWorktreePath, RUN_ID_RE,
};
```

This reuses the existing run-id pattern instead of duplicating the regex — `RUN_ID_RE` was already defined at module scope (line 26), just not exported.

- [ ] **Step 3: Write the failing test**

Create `tests/bin-lib/residue/probes-pipeline-runs.test.js`:

```javascript
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { probePipelineRuns } = require('../../../bin/lib/residue/probes/pipeline-runs');

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'residue-pipeline-runs-'));
  fs.mkdirSync(path.join(root, '.git')); // mainCheckoutRoot needs a repo marker
  fs.mkdirSync(path.join(root, '.claude-tweaks', 'pipelines'), { recursive: true });
  fs.mkdirSync(path.join(root, '.claude-tweaks', 'pipelines', 'archive'), { recursive: true });
  return root;
}

function writeRun(root, name, state) {
  const dir = path.join(root, '.claude-tweaks', 'pipelines', name);
  fs.mkdirSync(dir, { recursive: true });
  if (state !== null) {
    fs.writeFileSync(path.join(dir, 'run-state.json'), JSON.stringify(state));
  }
  return dir;
}

test('an un-archived clean run dir is reported with remedy auto', () => {
  const root = makeFixture();
  writeRun(root, '2026-01-01T000000-spec-1', { status: 'clean' });
  const { ran, findings } = probePipelineRuns({ cwd: root });
  assert.strictEqual(ran, true);
  assert.strictEqual(findings.length, 1);
  assert.strictEqual(findings[0].kind, 'pipeline-run');
  assert.strictEqual(findings[0].remedy, 'auto');
  assert.strictEqual(findings[0].scope, 'blast-radius');
  assert.match(findings[0].subject, /2026-01-01T000000-spec-1/);
});

test('a non-clean run dir is not reported', () => {
  const root = makeFixture();
  writeRun(root, '2026-01-01T000000-spec-2', { status: 'interrupted' });
  const { findings } = probePipelineRuns({ cwd: root });
  assert.deepStrictEqual(findings, []);
});

test('a run dir with no run-state.json is not reported', () => {
  const root = makeFixture();
  writeRun(root, '2026-01-01T000000-spec-3', null);
  const { findings } = probePipelineRuns({ cwd: root });
  assert.deepStrictEqual(findings, []);
});

test('the archive/ directory itself is never reported', () => {
  const root = makeFixture();
  // archive/ already exists from makeFixture(); it does not match RUN_ID_RE
  // and must never be treated as a candidate run dir.
  const { findings } = probePipelineRuns({ cwd: root });
  assert.deepStrictEqual(findings, []);
});

test('no .claude-tweaks/pipelines directory at all does not run', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'residue-pipeline-runs-empty-'));
  fs.mkdirSync(path.join(root, '.git'));
  const { ran, findings } = probePipelineRuns({ cwd: root });
  assert.strictEqual(ran, true);
  assert.deepStrictEqual(findings, []);
});
```

- [ ] **Step 4: Run it to verify it fails**

```bash
node --test tests/bin-lib/residue/probes-pipeline-runs.test.js
```

Expected: FAIL — `Cannot find module '../../../bin/lib/residue/probes/pipeline-runs'`.

- [ ] **Step 5: Implement the probe**

Create `bin/lib/residue/probes/pipeline-runs.js`:

```javascript
// bin/lib/residue/probes/pipeline-runs.js — un-archived, already-closed run
// dirs. `iterRunDirsWithState` (bin/lib/hooks/context.js) permanently skips
// any run dir once its run-state.json reaches status: 'clean' — that is
// correct for every OTHER consumer (a clean run has nothing left to reconcile
// against live git/PR state), but it also means a run whose archival step
// got missed (the bug this file's sibling skill-prose fix, #717, addresses)
// becomes invisible to bin/lib/reconcile/archive-merged.js's own sweep
// forever after. This probe deliberately reads .claude-tweaks/pipelines/
// directly instead of going through iterRunDirsWithState, so it catches
// exactly the dirs that blind spot already produced.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { makeFinding } = require('../finding');
const { mainCheckoutRoot } = require('../../hooks/worktree-detect');
const { RUN_ID_RE } = require('../../hooks/context');

function probePipelineRuns({ cwd } = {}) {
  const start = cwd || process.cwd();
  const root = mainCheckoutRoot(start) || start;
  const base = path.join(root, '.claude-tweaks', 'pipelines');
  let entries;
  try {
    entries = fs.readdirSync(base, { withFileTypes: true });
  } catch {
    // No .claude-tweaks/pipelines/ at all is a normal, clean state (a repo
    // that has never run a claude-tweaks pipeline) — not a probe failure.
    return { ran: true, reason: null, findings: [] };
  }

  const findings = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !RUN_ID_RE.test(entry.name)) continue; // skips archive/ and any non-run sibling
    const dir = path.join(base, entry.name);
    let state = null;
    try {
      state = JSON.parse(fs.readFileSync(path.join(dir, 'run-state.json'), 'utf8'));
    } catch {
      continue; // no readable run-state.json — nothing to classify as closed
    }
    if (!state || state.status !== 'clean') continue;
    findings.push(makeFinding({
      kind: 'pipeline-run',
      // Hardcoded, like probeRelease/probeSuite — this is cheap, mechanical
      // housekeeping any wrap-up cycle should surface and fix regardless of
      // which run originally produced the orphan, not something to hide
      // behind --scope repo the way another session's live worktree is.
      scope: 'blast-radius',
      subject: path.relative(root, dir),
      remedy: 'auto',
      evidence: `run-state.json status: clean, not under .claude-tweaks/pipelines/archive/ — see wrap-up/cleanup-procedures.md Section B for the archival move`,
    }));
  }
  return { ran: true, reason: null, findings };
}

module.exports = { probePipelineRuns };
```

- [ ] **Step 6: Run it to verify it passes**

```bash
node --test tests/bin-lib/residue/probes-pipeline-runs.test.js
```

Expected: PASS — all five tests green.

- [ ] **Step 7: Wire the probe into `bin/residue.js`**

In `bin/residue.js`, add the import near the other probe imports:

```javascript
const { probeRelease } = require('./lib/residue/probes/release');
```

becomes (add the new line immediately after it):

```javascript
const { probeRelease } = require('./lib/residue/probes/release');
const { probePipelineRuns } = require('./lib/residue/probes/pipeline-runs');
```

Then in `main()`, add it to the `results` array passed to `filterResultsByScope`:

```javascript
  const results = filterResultsByScope([
    probeWorktrees({ scope }),
    probeBranches({ scope, integrationBranch: opts.integrationBranch, run: git }),
    probeForge({ scope, run }),
    suiteResult,
    probeRelease({ scope, manifest, run }),
  ], opts.scope);
```

becomes:

```javascript
  const results = filterResultsByScope([
    probeWorktrees({ scope }),
    probeBranches({ scope, integrationBranch: opts.integrationBranch, run: git }),
    probeForge({ scope, run }),
    suiteResult,
    probeRelease({ scope, manifest, run }),
    probePipelineRuns({ cwd }),
  ], opts.scope);
```

`probePipelineRuns` takes `{ cwd }`, not `{ scope, ... }` — unlike the other probes, it does not depend on `resolveScope`'s git-derived worktree/branch state at all (it reads the filesystem directly), so it runs even when `scope.ran` is `false` (e.g. `--base` resolves against a shallow clone with no comparable history) — an un-archived run dir is real regardless of whether the base-commit diff resolved.

- [ ] **Step 8: Run the full residue test suite**

```bash
node --test tests/bin-lib/residue/
```

Expected: PASS — every existing residue test still green, plus the new ones from Step 3.

- [ ] **Step 9: Commit**

```bash
git add bin/lib/residue/probes/pipeline-runs.js bin/lib/hooks/context.js bin/residue.js tests/bin-lib/residue/probes-pipeline-runs.test.js
git commit -m "bin/residue.js: sweep finding for un-archived clean run dirs — refs #717"
```

---

## Task 4: Verify remedy: auto is mechanically applicable to a fixture (Acceptance Criterion 3)

**Files:**
- Test: `tests/bin-lib/residue/probes-pipeline-runs.test.js` (extend — same file as Task 3)

**Interfaces:**
- Consumes: `probePipelineRuns` (Task 3), `archiveRunDir` (`bin/lib/reconcile/archive-merged.js`, already exported — this task does not modify that module, it only proves the existing exported function correctly handles a dir this new probe flags).

This task exists to satisfy the spec's Acceptance Criterion 3 ("After one wrap-up cycle on a fixture with a closed unarchived run dir, the dir sits under `archive/`") without expanding scope into wiring a new automatic reconcile check (excluded by this plan's Global Constraints). `wrap-up/residue-sweep.md`'s existing "`remedy: auto` findings and the scratch worktree" section already documents that a `remedy: auto` finding is a Phase-1 fix-now candidate, applied by reusing `wrap-up/cleanup-procedures.md` Section B's mechanics — which is exactly what `archiveRunDir` (already shipped, `bin/lib/reconcile/archive-merged.js`) implements. This task proves that function, unmodified, correctly archives the exact kind of dir the new probe flags — i.e., that Phase 1's fix-now action for a `pipeline-run` finding is mechanically sound, not merely described in prose.

- [ ] **Step 1: Write the fixture-to-archive test**

Append to `tests/bin-lib/residue/probes-pipeline-runs.test.js`:

```javascript
const { execFileSync } = require('node:child_process');
const { archiveRunDir } = require('../../../bin/lib/reconcile/archive-merged');

test('the flagged remedy is mechanically applicable: archiveRunDir moves a flagged dir under archive/', () => {
  const root = makeFixture();
  execFileSync('git', ['-C', root, 'init', '-q']);
  execFileSync('git', ['-C', root, 'config', 'user.email', 'test@example.com']);
  execFileSync('git', ['-C', root, 'config', 'user.name', 'Test']);
  execFileSync('git', ['-C', root, 'commit', '--allow-empty', '-q', '-m', 'init']);

  const dir = writeRun(root, '2026-01-01T000000-spec-9', { status: 'clean' });

  const before = probePipelineRuns({ cwd: root });
  assert.strictEqual(before.findings.length, 1, 'the fixture must be flagged before remediation');

  const result = archiveRunDir(root, dir);
  assert.strictEqual(result.ok, true, `archiveRunDir failed: ${result.reason}`);

  const archivedPath = path.join(root, '.claude-tweaks', 'pipelines', 'archive', '2026-01-01T000000-spec-9');
  assert.strictEqual(fs.existsSync(archivedPath), true, 'the run dir must sit under archive/ after remediation');
  assert.strictEqual(fs.existsSync(dir), false, 'the original (un-archived) path must no longer exist');

  const after = probePipelineRuns({ cwd: root });
  assert.deepStrictEqual(after.findings, [], 'the archived dir must no longer be flagged');
});
```

- [ ] **Step 2: Run it to verify it passes**

```bash
node --test tests/bin-lib/residue/probes-pipeline-runs.test.js
```

Expected: PASS — the fixture dir is flagged before, `archiveRunDir` succeeds, the dir sits under `archive/` after, and the probe no longer flags it. This exercises Acceptance Criterion 3 end-to-end against a real fixture and real git operations (`git init` in a tmp dir — no network, no interaction with the actual repo's own `.git`).

- [ ] **Step 3: Run the full residue suite one more time**

```bash
node --test tests/bin-lib/residue/
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/bin-lib/residue/probes-pipeline-runs.test.js
git commit -m "Prove archiveRunDir mechanically satisfies the pipeline-run remedy — refs #717"
```

---

## Final Verification (whole plan)

- [ ] Run the full test suite: `npm test`. Expected: PASS, no regressions.
- [ ] `grep -n "archive" skills/flow/multispec-review-console.md` — confirm archival reads as Shared teardown's own step 6, referenced (not restated) from "On approval", "On override", and `consoleAutoResolve` (Acceptance Criterion 1).
- [ ] `node bin/residue.js --base HEAD~1 --scope repo` against this repo's own worktree — confirm it runs without error (manual smoke check; this repo's own `.claude-tweaks/pipelines/` is real production data, not a fixture, so do not rely on its output for pass/fail — the fixture tests in Tasks 3-4 are the actual verification for Acceptance Criteria 2 and 3).
