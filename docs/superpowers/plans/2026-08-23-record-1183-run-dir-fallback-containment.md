# Record #1183: run-dir --run fallback containment + twin-guard fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close two confirmed gaps in `bin/hooks.js`'s `resolveRunArg` (the `#280` worktree-local `--run` fallback): it currently adopts ANY directory carrying a marker file with zero same-repo/same-worktree containment check, and its authoritative-twin guard joins only `path.basename()`, so it is blind to nested multi-spec (`pipelines/{parent}/spec-N`) and archived (`pipelines/archive/{id}`) shadow layouts.

**Architecture:** One function, `resolveRunArg` in `plugin/bin/hooks.js`. Replace its unanchored-fallback branch with an explicit containment check (candidate must resolve inside a linked worktree of THIS repo, under `.claude-tweaks/pipelines/` with a run-id-shaped leading segment — reusing `context.js`'s exported `RUN_ID_RE`, the same signal `pre-tool-use.js`'s `shadowPipelineRunDir` already uses for an adjacent guard) and fix the twin-guard join to compare the candidate's full path relative to its own `pipelines/` root against the main checkout's `pipelines/` root at that same relative path — this naturally covers both the nested `spec-N` and `archive/{id}` shapes without special-casing either, since an archived run keeps its original run-id-shaped directory name one level deeper.

**Tech Stack:** Node.js (`plugin/bin/hooks.js`, `plugin/bin/lib/hooks/worktree-detect.js`, `plugin/bin/lib/hooks/context.js`) + `node --test`.

**Spec:** `.claude-tweaks/pipelines/2026-08-22T081916-spec-1068-1103-1122-1130-1140-1170-1183-1059-1060-1123-1129-1131-1137-1145-1146-1147-1148-1171-1172-1174-1181-1184-1034-1051-1138-1139-1167-1175-1176-1177/spec-1183/work/1183-spec.md`

## Global Constraints

- Worktree `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow+spec-1068-1177`, branch `worktree-flow+spec-1068-1177`; every shell step `cd`s there.
- Commit message imperative, body ends `refs #1183` (never closes/fixes).
- The fix is scoped to `resolveRunArg` in `plugin/bin/hooks.js` only — this function is shared by `record-worktree`, `record-pr`, `spec-status`, `close-run`, `teardown-run`, and `archive-run` (`_shared/pipeline-run-dir.md` line 145-146), so the fix applies to all of them automatically; do not touch any other resolver (`context.js`'s `resolveRunDir`/`resolveRun` is explicitly out of scope per that file's own "Scoped to `resolveRunArg` only" note, line 168).
- Reuse existing exports — do not reimplement: `wtDetect.repoInfo` and `wtDetect.mainCheckoutRoot` (both already required in `hooks.js` as `wtDetect`), and `ctxLib.RUN_ID_RE` (already required in `hooks.js` as `ctxLib`, exported from `context.js` line 475: `/^\d{4}-\d{2}-\d{2}T/`).
- Confirmed empirically (read at plan time, current HEAD): `plugin/bin/hooks.js` lines 78-145 (`resolveRunArg`), `plugin/bin/lib/hooks/worktree-detect.js` (`repoInfo`, `mainCheckoutRoot`, `isAnchoredUnderRoot`), `plugin/bin/lib/hooks/context.js` line 59 (`RUN_ID_RE`) and lines 61-71 (`NON_CANONICAL_RUN_ID_RE` — a documented near-miss shape that is explicitly never adopted anywhere in this codebase; the new run-id-shape check must test against `RUN_ID_RE` only, not the non-canonical shape, to stay consistent with every other consumer).

### Task 1: Fix the containment + twin-guard logic, add regression tests, update the doc

**Files:**
- Modify: `plugin/bin/hooks.js` (`resolveRunArg`, ~lines 114-141)
- Modify: `plugin/skills/_shared/pipeline-run-dir.md` (~lines 154-166, the Worktree-local `--run` fallback (#280) section)
- Modify: `tests/hooks-run-arg-anchoring.test.js` (append new tests)

**Interfaces:**
- Consumes: `wtDetect.repoInfo(p)` → `{ repoRoot, isLinkedWorktree, indeterminate }`; `wtDetect.mainCheckoutRoot(p)` → resolved main-checkout path or `null`; `ctxLib.RUN_ID_RE` → `/^\d{4}-\d{2}-\d{2}T/`. All three already imported in `hooks.js`.
- Produces: no new exports — `resolveRunArg`'s return shape (`{ runDir, invalidRunArg, rest, explicit, worktreeLocalFallback }`) is unchanged; only the logic deciding when `worktreeLocalFallback: true` is returned changes.

- [ ] **Step 1: Write the failing regression tests**

Append to the end of `tests/hooks-run-arg-anchoring.test.js` (after the last existing test, before end of file):

```js
test('#1183: reject — an arbitrary non-repo directory with a stray config.yml is not adopted via the #280 fallback', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  const stray = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-wtd-stray-'));
  fs.writeFileSync(path.join(stray, 'config.yml'), '');
  const out = runRecordWorktree(['--run', stray, wt], wt);
  assert.match(out.stdout, /not anchored|resolves outside the main checkout/i);
  assert.doesNotMatch(out.stdout, /worktree recorded/);
  assert.doesNotMatch(out.stdout, /worktree-local fallback/i);
});

test('#1183: reject — an unrelated git repo (not a worktree of this repo) with a config.yml is not adopted via the #280 fallback', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  const otherRepo = gitRepo();
  fs.writeFileSync(path.join(otherRepo, 'config.yml'), '');
  const out = runRecordWorktree(['--run', otherRepo, wt], wt);
  assert.match(out.stdout, /not anchored|resolves outside the main checkout/i);
  assert.doesNotMatch(out.stdout, /worktree recorded/);
  assert.doesNotMatch(out.stdout, /worktree-local fallback/i);
});

test('#1183: reject — a worktree shadow of a nested pipelines/{parent}/spec-N run dir is refused when the anchored copy exists at the correct nested path', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  const parentRunId = '2026-01-01T000000-spec-multi';
  const specSub = 'spec-967';
  // The anchored twin only needs to exist as a directory — matches the
  // existing twin-guard tests' isDirectory-only bar (no marker files needed).
  mkRunDir(main, ['.claude-tweaks', 'pipelines', parentRunId, specSub]);
  const trapped = mkRunDir(wt, ['.claude-tweaks', 'pipelines', parentRunId, specSub]);
  fs.writeFileSync(path.join(trapped, 'decisions.md'), '');
  const out = runRecordWorktree(['--run', trapped, wt], wt);
  assert.match(out.stdout, /not anchored|resolves outside the main checkout/i);
  assert.doesNotMatch(out.stdout, /worktree recorded/);
  assert.doesNotMatch(out.stdout, /worktree-local fallback/i);
});

test('#1183: accept — a worktree shadow of a nested pipelines/{parent}/spec-N run dir adopts via the #280 fallback when no anchored copy exists at all', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  const parentRunId = '2026-01-01T000000-spec-multi2';
  const specSub = 'spec-968';
  const trapped = mkRunDir(wt, ['.claude-tweaks', 'pipelines', parentRunId, specSub]);
  fs.writeFileSync(path.join(trapped, 'decisions.md'), '');
  const out = runRecordWorktree(['--run', trapped, wt], wt);
  assert.match(out.stdout, /worktree-local fallback \(#280\)/i);
  assert.match(out.stdout, /worktree recorded/);
});

test('#1183: reject — a worktree shadow of an archived pipelines/archive/{id} run dir is refused when the anchored copy exists', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  const archivedRunId = '2026-01-01T000000-spec-archived';
  mkRunDir(main, ['.claude-tweaks', 'pipelines', 'archive', archivedRunId]);
  const trapped = mkRunDir(wt, ['.claude-tweaks', 'pipelines', 'archive', archivedRunId]);
  fs.writeFileSync(path.join(trapped, 'decisions.md'), '');
  const out = runRecordWorktree(['--run', trapped, wt], wt);
  assert.match(out.stdout, /not anchored|resolves outside the main checkout/i);
  assert.doesNotMatch(out.stdout, /worktree recorded/);
  assert.doesNotMatch(out.stdout, /worktree-local fallback/i);
});
```

- [ ] **Step 2: Run to verify the new tests fail (red gate)**

Run: `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow+spec-1068-1177" && node --test tests/hooks-run-arg-anchoring.test.js 2>&1 | tail -40`

Expected: the five new `#1183` tests FAIL against the current (unfixed) code:
- The two "arbitrary directory"/"unrelated repo" tests fail because the old code adopts them (`worktree-local fallback` appears in stdout when the assertion expects it absent).
- The nested-spec-N "reject" test fails the same way (old code adopts despite the anchored twin existing at the correct nested path, because it computed `mainCandidate` from `basename()` alone).
- The archive/{id} "reject" test fails the same way.
- The nested-spec-N "accept" test should already PASS even pre-fix (old code adopts it too, just via the wrong/coincidentally-matching logic) — if it does not pass, note why in the ledger before proceeding; do not treat that as expected.

If any test's failure mode doesn't match this description, the test itself may be wrong — fix the test, not the expectation, before moving to Step 3.

- [ ] **Step 3: Replace `resolveRunArg`'s unanchored-fallback branch**

In `plugin/bin/hooks.js`, replace the entire block from `if (!wtDetect.isAnchoredUnderRoot(resolved, mainRoot)) {` (the block that begins after the `mainRoot` no-repo early-return, currently starting around line 114) through its matching closing `}` (currently ending around line 141, immediately before `return { runDir: resolved, invalidRunArg: null, rest, explicit: true };`) with:

```js
    if (!wtDetect.isAnchoredUnderRoot(resolved, mainRoot)) {
      // #280/#1183: the general case above (a bare or stray worktree-local
      // directory) stays rejected — that's the [IL-96]/[IL-127] shadow this
      // anchoring check exists to prevent. The one narrow exception: a
      // session whose harness refused every write to the main checkout for
      // the whole session has no anchored copy to name at all, so its run
      // dir was legitimately initialized worktree-local as the only
      // available option (the incident #280 documents). Adopt it ONLY when
      // ALL of:
      //   (a) resolved sits inside a linked worktree of THIS SAME repo — not
      //       an arbitrary directory, and not an unrelated repo's checkout
      //       (#1183: the old check never verified this at all — any
      //       directory carrying a stray marker file was adopted);
      //   (b) that path, relative to the worktree's own
      //       .claude-tweaks/pipelines/, has a run-id-shaped leading segment
      //       (mirroring pre-tool-use.js's shadowPipelineRunDir and
      //       context.js's RUN_ID_RE — the signal that distinguishes a real
      //       pipeline run dir from an arbitrary directory that merely
      //       happens to contain one of the three marker files);
      //   (c) it is already an INITIALIZED run dir — not merely a directory
      //       that exists, the same bar isInitializedRunDir states; and
      //   (d) no same-named run dir already exists at the SAME
      //       pipelines-relative path under the main checkout, which would
      //       make that copy the authoritative one instead.
      // #1183: (d) used to join only path.basename(resolved), so a nested
      // multi-spec shadow (pipelines/{parent}/spec-N) or an archived shadow
      // (pipelines/archive/{id}) computed the wrong main-checkout candidate
      // (pipelines/spec-N, pipelines/{id} — neither ever exists) and was
      // adopted even though the anchored copy existed at the correct
      // nested/archived path. Comparing the full pipelines-relative path
      // fixes both shapes without special-casing either — an archive/{id}
      // shadow's run-id segment is relParts[1] (the archived run keeps its
      // original run-id-shaped directory name one level deeper); every
      // other shape's run-id segment is relParts[0].
      const candidateRepo = wtDetect.repoInfo(resolved);
      const sameRepo = !candidateRepo.indeterminate && candidateRepo.repoRoot && candidateRepo.isLinkedWorktree
        && wtDetect.mainCheckoutRoot(candidateRepo.repoRoot) === mainRoot;
      const relFromPipelines = sameRepo
        ? path.relative(path.join(candidateRepo.repoRoot, '.claude-tweaks', 'pipelines'), resolved)
        : null;
      const inPipelines = !!relFromPipelines && !relFromPipelines.startsWith('..') && !path.isAbsolute(relFromPipelines);
      const relParts = inPipelines ? relFromPipelines.split(path.sep) : [];
      const runIdSegment = relParts[0] === 'archive' ? relParts[1] : relParts[0];
      const runIdShaped = !!runIdSegment && ctxLib.RUN_ID_RE.test(runIdSegment);
      const mainCandidate = inPipelines ? path.join(mainRoot, '.claude-tweaks', 'pipelines', relFromPipelines) : null;
      if (sameRepo && inPipelines && runIdShaped && isInitializedRunDir(resolved) && !isDirectory(mainCandidate)) {
        return {
          runDir: resolved, invalidRunArg: null, rest, explicit: true, worktreeLocalFallback: true,
        };
      }
      return {
        runDir: null,
        invalidRunArg: `${candidate} (exists, but not anchored under the main checkout at ${mainRoot} — refusing a worktree-relative shadow run dir; see resolve-run-dir)`,
        rest,
        explicit: true,
      };
    }
```

Change nothing else in the function — the `return { runDir: resolved, invalidRunArg: null, rest, explicit: true };` line immediately after this block (the plain-anchored-success path) is untouched.

- [ ] **Step 4: Run the regression tests to verify they pass**

Run: `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow+spec-1068-1177" && node --test tests/hooks-run-arg-anchoring.test.js 2>&1 | tail -20`
Expected: all tests in the file pass (the 6 pre-existing tests plus the 5 new `#1183` tests) — the pre-existing tests must not regress; if any pre-existing test now fails, the fix broke a previously-correct case and needs revisiting before proceeding.

- [ ] **Step 5: Update the doc this code is meant to enforce**

In `plugin/skills/_shared/pipeline-run-dir.md`, in the `### Worktree-local `--run` fallback (#280)` section (~lines 154-166), replace the paragraph beginning "The gating signal that separates this from an ordinary stray worktree-local directory is **initialization, not existence**:" with:

```markdown
The gating signal that separates this from an ordinary stray worktree-local directory is
**containment and initialization, not mere existence**: a `--run` candidate is adopted only
when (a) it resolves inside a linked worktree *of this same repo* — not an arbitrary directory,
and not an unrelated repo's checkout (`#1183`: an earlier version of this check verified none of
this, so any directory carrying a stray marker file was adopted); (b) that path, relative to the
worktree's own `.claude-tweaks/pipelines/`, has a run-id-shaped leading segment (the same
`RUN_ID_RE` shape `context.js`'s run-dir enumeration and `checkPipelineShadowGuard` above both
use); (c) it is already an **initialized** run dir — carries at least one of `decisions.md`,
`run-state.json`, or `config.yml`, the same bar every other resolver in this file uses to tell a
real run from a bare `mkdir`; and (d) no directory exists at the *same pipelines-relative path*
under the main checkout, which would make that copy the authoritative one instead (`#1183`: this
used to compare only the directory's basename, so a nested multi-spec shadow
(`pipelines/{parent}/spec-N`) or an archived shadow (`pipelines/archive/{id}`) computed the wrong
main-checkout candidate and was adopted even though the anchored copy existed at the correct
nested/archived path). A bare `mkdir` of a worktree-local pipelines path (the [IL-96]/[IL-127]
shadow shape `checkPipelineShadowGuard` exists to prevent, above) fails condition (c) and is
rejected exactly as before — an ordinary run with no worktree-local run dir at all can never
spuriously match this fallback, satisfying the "blocked vs. absent" distinction the record's
Deliverables call for. `record-worktree`'s stdout names the fallback explicitly (`resolved via
the worktree-local fallback (#280)`) rather than reporting it identically to the ordinary
anchored path, so the degraded state (this run's audit trail lives only in the worktree until
merge) is diagnosable, not silent.
```

- [ ] **Step 6: Full suite**

Run: `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow+spec-1068-1177" && npm test > /tmp/1183-full.txt 2>&1; tail -8 /tmp/1183-full.txt; grep "^not ok" /tmp/1183-full.txt`
Expected: 0 failures (the `resolvePrStateAsync` event-loop test and `recordDecline` are known machine-load flakes this session — re-run any failing file in isolation via `node --test <file>` before treating it as real).

- [ ] **Step 7: Commit**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow+spec-1068-1177" && git add plugin/bin/hooks.js plugin/skills/_shared/pipeline-run-dir.md tests/hooks-run-arg-anchoring.test.js && git commit -m "Fix #280 --run fallback: verify same-repo containment, fix basename-only twin guard

resolveRunArg adopted ANY directory carrying a stray marker file with no
check that it actually sat inside a linked worktree of this same repo, and
its authoritative-twin guard joined only path.basename(), leaving it blind
to nested multi-spec (pipelines/{parent}/spec-N) and archived
(pipelines/archive/{id}) shadow layouts. Both now require the candidate to
resolve inside a linked worktree of this repo under a run-id-shaped
pipelines/ segment, and the twin check compares the full pipelines-relative
path instead of the basename.

refs #1183"
```

## Verification against Acceptance Criteria

- **AC1** (`record-worktree --run /some/project` with a stray config.yml is rejected as unanchored): Step 1's two "arbitrary directory"/"unrelated repo" tests, closed by Step 3's `sameRepo` containment check.
- **AC2** (a worktree shadow of `pipelines/{parent}/spec-N` is refused when the anchored copy exists): Step 1's nested-spec-N "reject" test, closed by Step 3's pipelines-relative-path twin comparison. The paired "accept" test proves the fix isn't overzealous — the same shape still adopts correctly when no anchored twin exists.
- Additional coverage beyond the two stated ACs, matching the spec's Deliverables ("tests for all three confirmed shapes") and Gotchas ("verify against all three confirmed shapes, not just the nested spec-N one"): the `archive/{id}` shadow test.

## Scope keywords:

resolveRunArg, worktree-local fallback, #280, RUN_ID_RE, isAnchoredUnderRoot, mainCandidate
