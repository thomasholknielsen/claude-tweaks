---
record: 421
origin: capture
risk: low
size: medium
ceremony: standard
grants: [build]
surface: backend
---
# 421: /flow's materialize step doesn't anchor run directories to the main checkout inside a worktree

Surface: backend

**Related:** #370

## Current State

`_shared/pipeline-run-dir.md`'s Anchoring section requires every run directory to live under the **main checkout's** `.claude-tweaks/pipelines/`, resolved via `git rev-parse --git-common-dir`, precisely so `git worktree remove` can never destroy a run's `decisions.md`/`config.yml`/`staged/`. A live run (#389's `/flow`, dispatched inside worktree `record-389`) created its run dir *inside the worktree* instead; only `work/` was git-tracked (the gitignore pattern unignores only `*/work/**`), and the rest of the audit trail survived teardown only because the dispatching session manually copied it out first. `git rev-parse --git-common-dir` resolves correctly from inside a worktree (verified live), so the documented algorithm was not followed — `/flow`'s materialize step (or an earlier step) computes the path relative to cwd or adopts a pre-set `$PIPELINE_RUN_DIR` without verifying it is anchored. Sibling record #370 covers the dispatch-side hand-off of a relative run-dir string; this record covers creation/adoption inside `/flow`.

## Deliverables

- Audit every run-dir creation or adoption site in `skills/flow/materialize.md` and any earlier `/flow` step: fix each site that computes the path without the documented `git-common-dir` derivation, and require any adopted `$PIPELINE_RUN_DIR` to be verified as main-checkout-anchored before use (re-derive on mismatch), citing `_shared/pipeline-run-dir.md`'s Anchoring section rather than restating it.
- Regression coverage matched to what is executable: at minimum a `node --test` case that runs the documented anchoring snippet from inside a temporary worktree and asserts the resolved run root is under the main checkout. If the fix is purely instruction text, additionally state in the PR why an `evals/` scenario is or isn't warranted — don't silently skip the question.
- `docs/incident-log.md` `[IL-nn]` entry for the #389 near-miss and a `docs/donts.md` rule ("verify the run dir anchored to the main checkout after any `/flow` invocation dispatched inside a worktree"), cross-tagged per the incident-log convention.

## Acceptance Criteria

- Every run-dir creation/adoption site across `skills/flow/*.md` either derives via the anchoring snippet or verifies the adopted path — the PR lists each site found by the audit with its resolution.
- The new test fails against pre-fix behavior when the anchoring step is reverted/bypassed (verify-by-revert, output shown) and passes post-fix.
- Incident-log entry and donts rule landed, tag matching between the two files.

## Technical Approach

Instruction-text audit plus a small executable test around the anchoring snippet itself. No hook changes — `bin/lib/hooks/context.js` already anchors correctly; the gap is the skill-side path construction.

## Gotchas

- Do not "fix" survivability by git-tracking more of the run dir — the gitignore shape (`*/work/**` only) is deliberate; anchoring is the fix.
- Keep scope off `skills/dispatch/*.md` — #370 owns the hand-off-side fix.
- Pick up after the in-flight audit queue drains; several queue records edit `skills/flow` adjacent files.

## Original request

/flow's materialize step doesn't anchor run directories to the main checkout inside a worktree

Title: /flow's materialize step doesn't anchor run directories to the main checkout inside a worktree
Type: bug
Labels: none

# Reflect — staged finding 1

**Category:** tangential
**Severity:** high
**Reversibility:** high
**Source:** full mode, lens "Near-misses"
**Causal:** systemic
**Files:** skills/flow/materialize.md, skills/_shared/pipeline-run-dir.md

## Finding

`_shared/pipeline-run-dir.md`'s Anchoring section requires every pipeline run directory to live
under the **main checkout's** `.claude-tweaks/pipelines/`, resolved via `git rev-parse
--git-common-dir` (which correctly resolves to the main checkout even from inside a linked
worktree), specifically so `git worktree remove` can never destroy a run's `decisions.md` /
`config.yml` / `staged/`. During this session's manual `/claude-tweaks:dispatch "#388,#389"` run,
record #389's own `/flow` invocation — dispatched inside the Task-agent-created worktree
`record-389` — instead created its run directory at
`<worktree>/.claude-tweaks/pipelines/2026-08-14T103746-record-389/`, literally inside the
worktree. Confirmed on the merged branch: only `work/389-spec.md` under that run-dir path is
git-tracked (the gitignore pattern only unignores `*/work/**`); `decisions.md`, `config.yml`,
`engine-state.json`, and `run-state.json` were never committed and existed solely as
worktree-local files. The dispatching session had to manually copy them to
`.claude-tweaks/pipelines/archive/2026-08-14T103746-record-389/` in the main checkout before the
worktree was torn down — had that copy been skipped, `git worktree remove` would have silently
destroyed the run's entire audit trail, exactly the failure the Anchoring section's design exists
to prevent. `git rev-parse --git-common-dir` from inside a worktree does correctly resolve to the
main checkout's `.git` (verified directly in this session), so the documented anchoring algorithm
would not have produced this path — whatever agent executed `/flow`'s materialize step for #389
did not follow it. This is a reproducible gap between documented and actual behavior, not a
one-off fluke.

## Suggested resolution

Audit `flow/materialize.md`'s (and any earlier step's) run-directory creation/adoption logic for a
path that computes the run dir relative to the invocation's own `cwd` instead of re-deriving
`$RUN_ROOT` via the documented `git rev-parse --git-common-dir` snippet — most likely a step that
adopts an already-set `$PIPELINE_RUN_DIR` without verifying it is anchored, or a step that
constructs the path fresh without the anchoring call. Add regression coverage: invoke the
materialize step from inside a worktree and assert the resulting run dir resolves under the main
checkout. Once fixed, also add a `docs/incident-log.md` `[IL-nn]` entry and a `docs/donts.md` rule
("verify a run dir actually anchored to the main checkout after any `/flow` invocation dispatched
inside a worktree") — CLAUDE.md's own Hooks section names this anchoring guarantee as load-bearing.

## Decision-log reference

STAGED (see `## /wrap-up — Phase 1 (ESTABLISH)` in this run's `decisions.md`)


