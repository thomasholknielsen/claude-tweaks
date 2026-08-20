---
record: 370
origin: capture
risk: low
size: low
ceremony: standard
grants: [build]
surface: backend
---
# 370: dispatch two-call-gate: relative PIPELINE_RUN_DIR risks losing decisions.md on worktree teardown

Surface: backend

**Related:** #421

## Current State

`skills/dispatch/two-call-gate.md` section 3 has the second Task call carry `PIPELINE_RUN_DIR` forward from the first call's MANIFEST report, with no constraint on the captured string's shape. A live dispatch run substituted a *relative* `{run-dir}` value; the fresh second-call agent resolved it against its own worktree cwd, so `decisions.md`/`config.yml`/`staged/` were created inside the worktree and silently destroyed at Item 4 teardown. Only git-tracked `work/` and the hook-written `events.jsonl`/`run-state.json` survived — hooks anchor via `git rev-parse --git-common-dir`, the skill-side hand-off doesn't. Sibling record #421 covers the *creation*-side anchoring gap in `/flow`'s materialize step; this record covers dispatch's *hand-off* of an already-created run dir.

## Deliverables

- `skills/dispatch/two-call-gate.md` section 3: require the `{run-dir}` substituted into the second Task call's `PIPELINE_RUN_DIR` to be an absolute path anchored under the main checkout's `.claude-tweaks/pipelines/`. State the pre-substitution check (absolute, and prefix-matches the run root derived per `_shared/pipeline-run-dir.md`'s Anchoring section) and the on-failure action: re-derive the anchored path via that section's snippet — never pass the captured string through unvalidated.
- `skills/dispatch/task-prompt.md` first-call MANIFEST template: the reported run-dir line states the value must be the absolute main-checkout-anchored path, so the hand-off value is born valid rather than repaired at the second call.

## Acceptance Criteria

- Both files state the absolute-path requirement and the on-failure re-derivation; a grep for the requirement's anchor phrase hits both files (output shown).
- No other run-dir hand-off site under `skills/dispatch/*.md` substitutes an unvalidated path — a sweep for `PIPELINE_RUN_DIR` substitution sites across the skill's files is shown, each site either validated or N/A with a stated reason.
- Wording cites `_shared/pipeline-run-dir.md`'s Anchoring section rather than restating the derivation algorithm (single-statement convention).

## Technical Approach

Instruction-text fix confined to the two named dispatch files. No hook or code changes — the hook-side anchoring already behaves correctly; the gap is purely in what the skill text lets an agent pass between Task calls.

## Gotchas

- Keep scope off `skills/flow/*.md` — #421 owns the materialize-side fix; overlapping edits would collide.
- The in-flight audit queue (#393 pending, #394 in progress) edits `skills/dispatch/SKILL.md` frontmatter; this record's files (`two-call-gate.md`, `task-prompt.md`) are different, but pick up after the queue drains to avoid rebase noise on the same skill directory.

## Original request

dispatch two-call-gate: relative PIPELINE_RUN_DIR risks losing decisions.md on worktree teardown

**Related:** none

Context: A live dispatch run substituted a relative {run-dir} into the second Task call's PIPELINE_RUN_DIR; the fresh agent resolved it against its own worktree cwd instead of the anchored main-checkout path, so decisions.md/config.yml/staged/ landed inside the worktree and were silently lost on Item 4 teardown. Only git-tracked work/ and hook-written events.jsonl/run-state.json survived (those anchor via git-common-dir).

Scope: two-call-gate.md section 3 (and task-prompt.md's first-call MANIFEST report) should require an absolute path, not just any string captured from the first call's report.
