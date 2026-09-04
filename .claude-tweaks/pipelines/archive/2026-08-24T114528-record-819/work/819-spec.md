---
record: 819
origin: capture
risk: low
size: low
ceremony: fast-lane
grants: [build]
surface: backend
---
# 819: multispec-review-console.md 'On override' path cites the wrong 'Shared teardown' step, skipping parent run-dir archival

Surface: backend

## Current State

`skills/flow/multispec-review-console.md`'s "On override" path step 7 (and the overview near line 38) cites "Shared teardown, step 6" for archiving the parent run dir, but Shared teardown's actual step 6 is "Remove the shared worktree" — there is no archive step there. Only the "On approval" path performs its own separate inline archive action. A run that goes through "On override" never archives its parent run dir.

## Deliverables

Fix the stale citation — either point "On override" at the actual archive action (duplicating "On approval"'s inline step, or extracting a shared step), and correct the overview line near line 38 to match.

## Acceptance Criteria

- Both the "On override" and "On approval" paths archive the parent run dir to `.claude-tweaks/pipelines/archive/{run-id}/`.
- Doc citations no longer point at a step that doesn't perform the archive.

## Technical Approach

Compare "On approval"'s existing inline archive step against "On override"'s step 7 citation, and either add the same inline action to "On override" or extract a shared archive step both paths reference — whichever keeps the file's existing structure most intact. Update the overview line near line 38 to match whichever fix is chosen.

### Key Files

- `plugin/skills/flow/multispec-review-console.md`

## Gotchas

- The fix must not change "On approval"'s existing, working archive behavior — only add the missing action to "On override" (or extract a shared step both call correctly).

## Original request

multispec-review-console.md 'On override' path cites the wrong 'Shared teardown' step, skipping parent run-dir archival

**Related:** none

## Current State
`skills/flow/multispec-review-console.md`'s "On override" path step 7 (and the overview near line 38) cites "Shared teardown, step 6" for archiving the parent run dir, but Shared teardown's actual step 6 is "Remove the shared worktree" — there is no archive step there. Only the "On approval" path performs its own separate inline archive action. A run that goes through "On override" never archives its parent run dir.

## Deliverables
Fix the stale citation — either point "On override" at the actual archive action (duplicating "On approval"'s inline step, or extracting a shared step), and correct the overview line.

## Acceptance Criteria
Both the "On override" and "On approval" paths archive the parent run dir to `.claude-tweaks/pipelines/archive/{run-id}/`; doc citations no longer point at a step that doesn't do this.

Defer-reason: found-during-review — surfaced by a whole-branch `/code-review` pass ahead of a release; not the review's own scope to fix.

