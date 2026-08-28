# Changelog-Coverage Stale-Branch Recognition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teach `tests/changelog-coverage.test.js` to recognize "this branch's base predates the missing version" and report those versions as non-blocking diagnostics instead of failures, so a stale worktree branch no longer needs a per-session investigation to accept this failure class (record #1373).

**Architecture:** Add one helper inside the test file (`staleWalkedVersions`) that computes `git merge-base HEAD <ref>` and diffs `walkedVersions(ref)` against `walkedVersions(base)` — versions visible on the ref's first-parent chain but not at the branch base are "stale" (introduced on `origin/main` after this branch forked, so this branch's local `CHANGELOG.md`/`docs/shipped-versions.tsv` cannot carry them and its own diff never touched them). The two ref-comparing tests ("every version that shipped... has a CHANGELOG entry" and "the record accounts for every version the git walk can still see") filter their `missing`/`unrecorded` lists through that set, emit a `t.diagnostic(...)` naming the excused versions, and still fail hard on anything not excused. On `main` (or any branch containing the ref's tip) the merge base equals the tip, the stale set is empty, and behavior is byte-identical to today. A companion test proves discrimination deterministically from real history: from the parent of the commit that introduced the newest first-appearing walked version, that version must be reported stale; from the ref itself, nothing is.

**Tech Stack:** Node built-in `node:test` / `node:assert/strict`, `node:child_process` `execFileSync` git calls, existing helpers `walkedVersions`/`shippedVersionRuns` from `plugin/bin/lib/changelog-git.js` (unchanged — the fix is maintainer-side; nothing under `plugin/` ships differently).

**Spec:** `.claude-tweaks/pipelines/2026-08-24T182158-record-1373/work/1373-spec.md` (materialized from GitHub record #1373)

## Global Constraints

- Only `tests/changelog-coverage.test.js` is modified. No changes under `plugin/` (the shipped payload), no changes to `CLAUDE.md` — the record's Deliverables offer "teach the test" OR "add a CLAUDE.md sentence"; this plan takes the code path, which satisfies the acceptance criterion on its own ("the gate self-recognizes it").
- git plumbing calls use `--end-of-options` (never bare `--`) with `rev-parse`/`merge-base` — `--` flips them into pathspec mode (CLAUDE.md Don'ts / incident-tagged rule).
- Commit messages reference the record as `refs #1373` — never `closes`/`fixes`.
- The strict path must be provably unchanged when the branch contains the ref's tip (this worktree currently does — its base equals `origin/main`'s tip — so the full suite passing on this branch exercises exactly the strict path).

---

### Task 1: Stale-branch recognition in changelog-coverage.test.js

**Files:**
- Modify: `tests/changelog-coverage.test.js` (helper after the `manifestVersion` const, `~line 27`; wiring inside the two ref-comparing tests at `~lines 64-84` and `~141-159`; companion test appended at end of file)

**Interfaces:**
- Consumes: `walkedVersions(repoRoot, ref)` and `shippedVersionRuns(repoRoot, ref)` from `plugin/bin/lib/changelog-git.js` — `shippedVersionRuns` returns runs **oldest-first**, each `{ version, date, commits: [{ hash, date, subject }, ...] }` with `commits[0]` the commit that introduced that run's version on the first-parent chain. `walkedVersions` accepts any commit-ish (it feeds `git rev-list <ref>`), so a raw merge-base sha works as `ref`.
- Produces: `staleWalkedVersions(ref, headRef = 'HEAD')` → `string[]` of versions visible from `ref` but not from `merge-base(headRef, ref)`; internal to this test file, nothing else consumes it.

- [x] **Step 1: Write the failing companion test**

Append to the end of `tests/changelog-coverage.test.js`:

```js
// --- stale-branch recognition (#1373) ----------------------------------------
//
// A worktree branch created before a later main release cannot carry that
// release's CHANGELOG/record lines, and its own diff never touched them. The
// two ref-comparing tests above excuse exactly those versions (as diagnostics,
// not failures); this test proves the recognition actually discriminates,
// deterministically, from real history.

test('stale-branch recognition discriminates by branch base', (t) => {
  const availability = historyAvailable(REPO_ROOT);
  if (!availability.ok) {
    test.skip(`git history unavailable: ${availability.reason}`);
    return;
  }
  // From a head that already contains the ref's tip, nothing is stale — the
  // strict path is unchanged. (The ref itself is the degenerate such head.)
  assert.deepStrictEqual(
    staleWalkedVersions(availability.ref, availability.ref),
    [],
    'a head at the ref tip must excuse nothing',
  );

  // Pick the newest run whose version appears for the FIRST time in that run
  // (a rollback re-ship like 6.24.0 appears in two runs; its later run would
  // be visible at the base via the earlier one and must not be the probe).
  const runs = shippedVersionRuns(REPO_ROOT, availability.ref);
  const seen = new Set();
  let candidate = null;
  for (const run of runs) {
    if (!seen.has(run.version)) candidate = run;
    seen.add(run.version);
  }
  if (!candidate || runs.length < 2) {
    t.skip('walk sees too little history to probe discrimination');
    return;
  }
  const introducing = candidate.commits[0].hash;
  let stale;
  try {
    stale = staleWalkedVersions(availability.ref, `${introducing}~1`);
  } catch {
    t.skip(`no parent commit for ${introducing} — cannot probe`);
    return;
  }
  assert.ok(
    stale.includes(candidate.version),
    `expected ${candidate.version} (introduced by ${introducing}) to be stale ` +
      `from ${introducing}~1; got: ${stale.join(', ') || '(none)'}`,
  );
});
```

Also add `shippedVersionRuns` to the existing line-19 destructure so it reads:

```js
const { historyAvailable, shippedVersions, shippedVersionRuns, walkedVersions } = require('../plugin/bin/lib/changelog-git.js');
```

- [x] **Step 2: Run the companion test to verify it fails**

Run: `cd "<worktree>" && node --test --test-name-pattern "stale-branch recognition" tests/changelog-coverage.test.js`
Expected: FAIL with `ReferenceError: staleWalkedVersions is not defined`

- [x] **Step 3: Implement the helper**

Insert after the `const manifestVersion = ...` line (~line 27):

```js
// Versions introduced on `ref`'s first-parent chain after this branch's base
// (#1373). A branch created before a later release cannot carry that release's
// CHANGELOG.md/docs/shipped-versions.tsv lines, and its own diff never touched
// them — so the ref-comparing tests below excuse those versions as diagnostics,
// not failures; they are caught for real when the branch rebases or merges.
// When `headRef` already contains the ref's tip (main, or a caught-up branch),
// the merge base IS the tip and this returns [] — the strict path, unchanged.
const staleCache = new Map();
function staleWalkedVersions(ref, headRef = 'HEAD') {
  const key = `${headRef}${ref}`;
  if (staleCache.has(key)) return staleCache.get(key);
  const gitOut = (args) =>
    execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  let stale;
  try {
    const base = gitOut(['merge-base', '--end-of-options', headRef, ref]);
    const tip = gitOut(['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]);
    if (base === tip) {
      stale = [];
    } else {
      const visibleAtBase = new Set(walkedVersions(REPO_ROOT, base));
      stale = walkedVersions(REPO_ROOT, ref).filter((v) => !visibleAtBase.has(v));
    }
  } catch {
    // No resolvable merge base (unrelated histories, bad ref): excuse nothing —
    // fail-strict is the safe direction for a coverage gate.
    stale = [];
  }
  staleCache.set(key, stale);
  return stale;
}
```

And add `execFileSync` to the imports near the top (after the existing `node:path` require):

```js
const { execFileSync } = require('node:child_process');
```

- [x] **Step 4: Run the companion test to verify it passes**

Run: `cd "<worktree>" && node --test --test-name-pattern "stale-branch recognition" tests/changelog-coverage.test.js`
Expected: PASS (2 assertions: empty at tip, probe version reported stale from the introducing commit's parent)

- [x] **Step 5: Wire the stale set into the two ref-comparing tests**

In `test('every version that shipped on the release branch has a CHANGELOG entry', ...)`: change the callback signature to `(t)` and replace the final assertion block

```js
  const { missing } = findCoverageGaps(shipped, changelog);
  assert.deepStrictEqual(
    missing,
    [],
    `${missing.length} version(s) shipped on ${availability.ref} with no CHANGELOG entry: ${missing.join(', ')}`,
  );
```

with:

```js
  const { missing } = findCoverageGaps(shipped, changelog);
  const stale = new Set(staleWalkedVersions(availability.ref));
  const basePredates = missing.filter((v) => stale.has(v));
  const missingHere = missing.filter((v) => !stale.has(v));
  if (basePredates.length > 0) {
    t.diagnostic(
      `${basePredates.length} version(s) shipped on ${availability.ref} after this branch's base ` +
        `(${basePredates.join(', ')}) — not this branch's omission; caught on rebase/merge (#1373)`,
    );
  }
  assert.deepStrictEqual(
    missingHere,
    [],
    `${missingHere.length} version(s) shipped on ${availability.ref} with no CHANGELOG entry: ${missingHere.join(', ')}`,
  );
```

In `test('the record accounts for every version the git walk can still see', ...)`: change the callback signature to `(t)` and replace

```js
  const recorded = new Set(recordedVersions(REPO_ROOT));
  const unrecorded = walkedVersions(REPO_ROOT, availability.ref).filter((v) => !recorded.has(v));
  assert.deepStrictEqual(
    unrecorded,
    [],
    `${availability.ref} reports these versions but ${RECORD_PATH} does not list them: ` +
      `${unrecorded.join(', ')}. Append them.`,
  );
```

with:

```js
  const recorded = new Set(recordedVersions(REPO_ROOT));
  const walked = walkedVersions(REPO_ROOT, availability.ref).filter((v) => !recorded.has(v));
  const stale = new Set(staleWalkedVersions(availability.ref));
  const basePredates = walked.filter((v) => stale.has(v));
  const unrecorded = walked.filter((v) => !stale.has(v));
  if (basePredates.length > 0) {
    t.diagnostic(
      `${basePredates.length} version(s) on ${availability.ref} postdate this branch's base ` +
        `(${basePredates.join(', ')}) — not this branch's omission; caught on rebase/merge (#1373)`,
    );
  }
  assert.deepStrictEqual(
    unrecorded,
    [],
    `${availability.ref} reports these versions but ${RECORD_PATH} does not list them: ` +
      `${unrecorded.join(', ')}. Append them.`,
  );
```

- [x] **Step 6: Run the whole file to verify the strict path is unchanged**

Run: `cd "<worktree>" && node --test tests/changelog-coverage.test.js`
Expected: PASS, all tests (this branch's base equals `origin/main`'s tip, so the stale set is empty and every pre-existing assertion runs exactly as before — no diagnostics emitted)

- [x] **Step 7: Commit**

```bash
git add tests/changelog-coverage.test.js
git commit -m "Teach changelog-coverage to excuse versions postdating the branch base — stale worktrees stop false-failing (refs #1373)"
```
