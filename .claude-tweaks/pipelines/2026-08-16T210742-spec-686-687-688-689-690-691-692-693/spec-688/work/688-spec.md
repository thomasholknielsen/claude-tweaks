---
record: 688
origin: capture
risk: medium
size: medium
ceremony: standard
grants: []
surface: backend
---
# 688: flow: auto-mode PR title/CI-wait step invents a third AskUserQuestion stop beyond the two-bookend contract

Surface: backend

## Current State

- `_shared/auto-mode-contract.md` and CLAUDE.md contract exactly two stops in `auto` (Manifesto + Wrap-Up Review Console): "skills MUST NOT invent new mid-flow stops in auto mode."
- One multi-spec `auto` run added a third `AskUserQuestion` — whether to refresh a stale PR title/description and wait for CI before merging. Neither is a user decision: `_shared/pr-first-merge.md` Step 2.5 already resolves the CI wait mechanically from the `merge-verification` lever, and `_shared/pr-early-run-lifecycle.md` (~line 199) already refreshes the PR body via `gh pr edit --body-file`.
- Root of the improvisation: `flow/multispec-review-console.md`'s Shared teardown (Cleanup row 16 / step 2) finishes the shared branch via `/superpowers:finishing-a-development-branch` — a skill whose own procedure asks the human how to integrate — instead of routing `pr-first` runs through `_shared/pr-first-merge.md` (which has no human stop). The console's terminal Approve-all / Override / Stop call therefore doesn't carry the merge decision, and the model filled the gap with a third stop.
- No conformance test bounds the number of `AskUserQuestion` calls an auto-mode `/flow` path may make.
- **Related:** #689 (same teardown routing — draft-PR merge failure), #693 (same teardown — worktree-removal order), #691, #646.

## Deliverables

1. Fold the merge decision into the Review Console's option set: the terminal call's options become e.g. "Approve all + merge (Recommended)" / "Approve all, leave PR open" / "Override specific items" / "Stop" — in both `wrap-up/review-console.md` (single-spec) and `flow/multispec-review-console.md` (bundle). Under `consoleAutoResolve` the merge half resolves per its own default with zero calls.
2. Make PR title/description refresh and the CI wait unconditional AUTO steps: title/description refresh becomes a named step in `_shared/pr-early-run-lifecycle.md`'s pre-merge/settle section, `pr-first-merge.md` Step 2.5 stays the only CI-wait authority; each logs an `AUTO …` line per `_shared/auto-decision-log.md`. `auto-mode-contract.md` names both as explicitly *not* stops.
3. Under `pr-first`, `flow/multispec-review-console.md`'s Shared teardown "Finish the shared branch" row routes to `_shared/pr-first-merge.md` (bundle tag), reserving `/superpowers:finishing-a-development-branch` for `local-merge` — the same split `flow/worktree-merge.md` already states. (Shared with #689 item 1 — implement once.)
4. Conformance test in `tests/`: the auto-mode `/flow` prose path (`flow/SKILL.md`, `flow/manifesto.md`, `wrap-up/review-console.md`, `flow/multispec-review-console.md`) contains at most two `AskUserQuestion` decision points outside blocks tagged HARD-GATE / failure-card / Manifesto / Review Console — a scan that enforces what the prose asserts, not a shape match.

## Acceptance Criteria

- The Review Console's terminal `AskUserQuestion` (both files) lists a merge-carrying option; a grep for the chosen label (e.g. `leave PR open`) hits both files.
- `grep -n "finishing-a-development-branch" skills/flow/multispec-review-console.md` shows it gated to `local-merge` only.
- `_shared/pr-early-run-lifecycle.md` has a named title/description-refresh step that logs AUTO; `_shared/auto-mode-contract.md` names PR refresh and CI wait as non-stops.
- The new conformance test fails when a third un-tagged `AskUserQuestion` block is inserted into `flow/SKILL.md` (verify by inserting one temporarily and watching it fail), passes on the shipped text.
- `npm test` green.

## Technical Approach

Prose changes to the four skill files + one new test file. Coordinate with #689/#693 (same Shared-teardown lines) — build in one flow run or rebase in order.

## Gotchas

- `wrap-up/review-console.md` is at 40,899 of the 40,960-byte ceiling (`tests/console-on-pr.test.js`, measured 2026-08-16 — 61 bytes headroom), so adding a merge-carrying option there requires slimming first: move rows to `console-template.md` before adding, and re-measure `wc -c` after.
- The Manifesto is where a "merge or leave open" *policy* would live; the console option is the per-run *decision*. Don't add a Manifesto lever unless a policy default is actually needed.
- Under `local-merge`, `/superpowers:finishing-a-development-branch`'s own prompt is a legitimate human stop only in interactive mode; in `auto` the local-merge path must still not prompt — check that path too.

## Original request

flow: auto-mode PR title/CI-wait step invents a third AskUserQuestion stop beyond the two-bookend contract

**Related:** none

Context: `auto` mode contracts for exactly two stops (Manifesto + Wrap-Up Review Console) -- CLAUDE.md: "skills MUST NOT invent new mid-flow stops in auto mode." One run added a third stop asking whether to refresh a stale PR title/description and wait for CI before merging -- none of that is a genuine user decision.

Scope: Fold the merge decision into the Review Console's option set (e.g. "apply everything + merge" vs "apply everything, leave PR open"); make PR title/description refresh and the CI wait unconditional AUTO steps logged to decisions.md. Consider a conformance check capping auto-mode /flow at 2 AskUserQuestion calls.
