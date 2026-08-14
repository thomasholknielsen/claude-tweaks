---
record: 409
origin: human
risk: medium
size: medium
ceremony: standard
grants: []
blocked-by: [406, 405]
surface: backend
---
# 409: PR-early run lifecycle: draft PR at run start, push at every phase exit

Surface: backend

## Overview

Make every pr-first pipeline run born-public: immediately after worktree + branch creation and the materialize commit, push the branch and open a **draft PR** — title from the record (`{title} (#{N})`), body carrying the spec summary, a live phase checklist, and one `Fixes #{n}` line per record. Add the phase-exit push rule — every pipeline step that commits ends by pushing the branch — stated once in `_shared/git-discipline.md` and cited by build/test/review/polish/wrap-up. This is what makes durability structural (nothing exists only in a sandbox for longer than one phase), makes wrap-up's review fixes ordinary commits that keep the PR current, and gives every run a visible handle from minute one.

**Complexity:** Medium
**Estimated tasks:** 7

## Non-Goals

- No verdict comments, failure tombstones, or PR-state reads — the PR-as-run-surface sub-issue.
- No merge behavior changes — the merge-path sub-issue.
- No change for `integration-model: local-merge` runs — they keep today's no-PR lifecycle.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| integration-model | Integration-model resolution | ready |
| spike-api-calls | API call volume spike | ready |

## Current State

- `skills/build/worktree-setup.md` — worktree/branch creation + materialize commit (run start).
- `skills/flow/steps-and-gates.md` — the step list and gate table each phase runs through.
- `skills/_shared/git-discipline.md` — commit discipline rules the phase-exit push rule joins.
- `skills/_shared/pending-review-durability.md` — today's late-push procedure; its PR body composition (Verification Brief + `### Branch` resume section) is prior art for the draft-PR body. Its `Refs`-not-`Fixes` rule exists because its PR could be human-merged before gates ran — see Gotchas for why `Fixes` is safe at draft-create time here.
- `skills/dispatch/task-prompt.md` — dispatch's two Task-call templates that launch `/flow` inside the group worktree.

## Deliverables

- [x] Run-start step in `build/worktree-setup.md` (pr-first only, routed on `_shared/integration-model.md`): push branch, create draft PR with `gh pr create --draft`, record the PR via a new `hooks.js record-pr <number> <url>` verb — run-state.json is written only through `hooks.js` verbs (CLAUDE.md's write-ownership rule; the `record-worktree`/`close-run` precedent), so this field gets its own sanctioned verb, never a direct write.
- [x] Draft-PR body template: a `<!-- claude-tweaks-run: {run-id} -->` marker as the first line (the GitHub-side "plugin-created" signal the sweep and reconciler key on — no local run-dir join needed), spec summary, phase checklist delimited by HTML comment markers (`<!-- phases-start -->`/`<!-- phases-end -->` so re-composition parses reliably), one `Fixes #{n}` line per record (a bundle — dispatch's file-overlap grouping — lists every record's line; a bundle's title is the lowest-numbered record's title plus ` (+N more)`), resume command.
- [x] Phase-exit push rule in `_shared/git-discipline.md` (one canonical statement), with each phase's skill file citing it — build, test, review, polish, wrap-up. The rule carries its failure semantics: a failed phase-exit push logs a warning to decisions.md and continues; the next phase exit retries naturally — degradation is per-attempt, never a persisted run flag. The rule's cadence is whatever the spike recommended: this sub-issue's first task reads the spike record's closing recommendation and implements per-phase pushes or its named batching alternative accordingly.
- [x] Phase-checklist update: each phase exit edits the PR body checklist via `gh pr edit --body-file` (compose-then-write-once from the current body).
- [x] Idempotent resume: run start finds an existing open PR for the branch (`gh pr list --head`) and reuses it instead of erroring or duplicating. Between phases, `run-state.json`'s `pr` field is the authoritative identity; resume re-verifies against `gh pr list --head` and reconciles differences via `record-pr` (stored PR closed or gone → recreate or degrade, logged). A found PR that is open but no longer draft is reused as-is — never flipped back to draft — and logged.
- [x] Skip behavior stated for no-forge/offline: push failure degrades to today's local-only run with a logged warning — never blocks the build. gh-absent environments degrade the same way with a distinguished reason: PR creation has no confirmed MCP mapping in `_shared/github-write-transport.md`, so there is no fallback transport to attempt.

## Acceptance Criteria

1. A pr-first `/flow` run on a test record produces a draft PR before the build phase's first task commit, verifiable in the run's decisions.md ordering.
2. After the run's review phase completes, `git log origin/{branch}` shows the review-phase commits — pushed at the cadence the spike recommended (per-phase unless it named a batching alternative), not at run end.
3. Re-running a resumed pipeline against the same branch reuses the existing draft PR (no duplicate PR; asserted via `gh pr list --head {branch}` count = 1).
4. With the network down at run start, the run proceeds local-only and decisions.md carries the degradation entry.
5. `npm test` passes.

## Technical Approach

Route on `integration-model` at run start; local-merge takes the existing path untouched. The PR number and URL persist in `run-state.json` so later phases and the reconciler join without re-deriving. Pushes run from inside the worktree (where `worktree.always` permits them), one plain command per call. The spike sub-issue's recommendation gates the push cadence — if it recommended batching, implement its named alternative instead of per-phase pushes and record that in `_shared/git-discipline.md`'s rule text.

### Data / API Surface

- `run-state.json` gains `pr: { number, url }` — written once at run start, read by later phases/reconciler.
- Draft PR body sections: `### Spec summary`, `### Phases` (checklist), `### Resume`, closing `Fixes` lines.

## Gotchas

- `Fixes #N` in a draft PR body is inert until merge, and this design never merges an ungated PR — but a human force-merging a draft mid-run is accepting ungated work; keep the PR draft until the merge path marks it ready after gates pass (GitHub blocks merging drafts by default). This is why `Fixes` is safe here while `pending-review-durability.md` required `Refs`. The draft-blocks-merge protection is a platform default, not something this design enforces — an accepted, stated risk; nothing else in the plugin ever marks a run PR ready.
- Shell state does not survive between Bash calls — substitute PR numbers/branches literally, never via carried variables.
- `gh pr list --head` uses the REST list, not the lagging search index — required for the idempotent-resume check.
- A failed run's PR is handled by the PR-as-run-surface sub-issue (tombstone close) — this sub-issue must not add its own failure handling beyond the degradation logging.
- Worktree sessions refuse compound Bash commands — one plain command per call in every procedure step written here.
