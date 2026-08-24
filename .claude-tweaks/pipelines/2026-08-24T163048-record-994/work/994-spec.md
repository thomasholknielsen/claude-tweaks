---
record: 994
origin: capture
risk: low
size: medium
ceremony: fast-lane
grants: [build]
surface: backend
---
# 994: residue.js --scope blast-radius does not attribute branches/pipeline-runs to the sweeping run

Defer-reason: pre-existing-outside-diff

## Current State

`bin/residue.js --scope blast-radius` is documented (`wrap-up/residue-sweep.md`) to narrow the sweep to "this run's own blast radius (a branch this run's worktree left behind, a PR from this run's own head branch, a missing release-triple entry)". `bin/lib/residue/scope-filter.js` implements this by keeping only findings each probe already labeled `scope: 'blast-radius'` (vs. `'observed'`).

`bin/lib/residue/probes/branches.js`'s `probeBranches` labels **every** entry `git branch -r --merged {integration-branch}` returns as `scope: 'blast-radius'`, excluding only the sweeping run's own `scope.headBranch`. It has no mechanism to attribute a merged branch to a *specific other* run — everything that isn't the current run's own head branch is misclassified as this run's blast radius rather than `'observed'`.

Discovered during record #638's wrap-up residue-sweep (`node bin/residue.js --base 0399b89b --integration-branch origin/main --scope blast-radius --no-suite`, worktree `worktree-record-638`): the sweep surfaced `origin/worktree-record-627`, `origin/worktree-record-789`, `origin/worktree-record-893` (merged branches) and pipeline-run dir `.claude-tweaks/pipelines/2026-08-20T045254-record-627` — all belonging to unrelated records, none touched by #638's own worktree or diff. `bin/lib/residue/probes/pipeline-runs.js` likely has the same gap (same symptom: an unarchived run dir for record #627, unrelated to #638, surfaced as this run's blast radius).

## Deliverables

1. Give `probeBranches` (and `probePipelineRuns` if it has the same gap) a way to attribute a merged branch / clean-but-unarchived run dir to whichever run actually produced it, so only branches/run-dirs traceable to the *sweeping* run's own worktree/branch get `scope: 'blast-radius'` — everything else gets `scope: 'observed'`.
2. Update `wrap-up/residue-sweep.md` if the attribution mechanism changes what `--scope blast-radius` can and can't guarantee.

## Acceptance Criteria

- A `--scope blast-radius` sweep run from worktree A never surfaces a merged branch or unarchived run dir that traces back to a different worktree/run B.
- `--scope repo` behavior is unchanged (still returns everything, unfiltered).
- Existing residue tests still pass; new tests cover the cross-run attribution the fix adds.

_Filed by `capture` via specShapedBody (discovered during record #638 wrap-up)._

## Build note (2026-08-24, refs #994)

No code changes were made. Both Deliverables already appear satisfied on this branch's base
(`a5701bc1`, `origin/main` as of this run):

1. `probeBranches` (`plugin/bin/lib/residue/probes/branches.js`) already tags a fallthrough merged
   branch `scope: 'observed'`, not `'blast-radius'` — fixed and tested under **#499**
   (`3f2eaf19`/`99aa3881`). `tests/bin-lib/residue/probes-git.test.js` lines 179-209 cover exactly
   the cross-run-attribution scenario this record's Acceptance Criteria describe.
2. `probePipelineRuns` (`plugin/bin/lib/residue/probes/pipeline-runs.js`) was separately audited
   under **#1011** and found *not* to share the gap — a `run-state.json` with `status: 'clean'` is
   a terminal, self-reported state that's inert regardless of which session produced it (unlike a
   merged branch, which could still be in use elsewhere), so unconditional `scope: 'blast-radius'`
   there is safe. The audit trail is recorded in-code (lines 56-66 of that file); no fix applied,
   deliberately.
3. `wrap-up/residue-sweep.md` already documents #499's fix (line 78) — Deliverable 2 for
   `branches.js` was already done at the same time as the code fix.

Verified: `node --test tests/bin-lib/residue/probes-git.test.js tests/bin-lib/residue/probes-pipeline-runs.test.js tests/bin-lib/residue/scope-filter.test.js`
— 38/38 pass, including both of this record's Acceptance Criteria scenarios directly.

Recommend closing #994 as a duplicate/already-resolved-by (#499, #1011) at review/wrap-up rather
than merging further work.
