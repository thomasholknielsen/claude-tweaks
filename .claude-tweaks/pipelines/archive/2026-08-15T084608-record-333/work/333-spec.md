---
record: 333
origin: human
risk: medium
size: low
ceremony: standard
grants: []
surface: backend
---
# 333: Extract sub-files from flow/SKILL.md and dispatch/SKILL.md — both sit bytes under the 40 KB ceiling

Surface: backend

## Current State

`skills/flow/SKILL.md` is 40,952 bytes against `bin/lib/skill-audit/context-cost.js`'s `CEILING_BYTES` of 40,960 — **8 bytes of headroom**. `npm test`'s `context-cost.test.js` currently passes, but any further addition to this file trips it, and recent edits have already required compensating same-line trims to stay under (the IL-72 shape: content inlined into a size-capped file with extraction deferred).

`skills/dispatch/SKILL.md` has since moved to 38,281 bytes, with `settle-and-merge.md`, `task-prompt.md`, `two-call-gate.md`, and `mcp-transport.md` extracted since this record was filed — **2,679 bytes of headroom**, no longer in crisis. This record's scope narrows accordingly: `dispatch/SKILL.md` needs no extraction right now; touch it only if the byte-check in Acceptance Criteria below shows it dipping close to the ceiling again.

`flow/SKILL.md` already has 11 sub-files (`materialize.md`, `validation.md`, `manifesto.md`, `steps-and-gates.md`, `multi-spec.md`, `multispec-review-console.md`, `polish-execution.md`, `survey.md`, `worktree-merge.md`, `failure-cards.md`) — prior extraction passes have kept pace with growth but not created headroom, because content keeps being added to the base file as fast as it's extracted. `failure-cards.md` (`Loaded by /claude-tweaks:flow Step 4 only when a gate fails`) already establishes the precedent this record extends: pull a self-contained, usage-conditional template block into its own file, leave a stub pointer, load it only on the branch that needs it.

## Deliverables

- Extract the Step 5 success-path template (`skills/flow/SKILL.md`, from `On successful completion of all steps` through the end of the `### Next Actions` `AskUserQuestion` instructions — currently lines 195–270, ~4.4 KB: the `## Flow: Pipeline Complete` markdown block, the Creative/Depth Opportunities block conventions, and the Next Actions call) into a new `skills/flow/summary-template.md`, mirroring `failure-cards.md`'s own framing (a file "loaded only when [the matching path] fires — never rendered on [the other] path").
- Replace the extracted span in `skills/flow/SKILL.md` with a short stub: the two lines of surrounding procedural prose (the Nothing-left-behind gate and both survey paragraphs stay in `SKILL.md` — they're decision logic, not template; do not move them) plus a pointer sentence, e.g. "On successful completion of all steps (`wrap-up` in the step list), read `summary-template.md` in this skill's directory and render it — never on the failure path (see `failure-cards.md`)."
- Update `docs/plugin-structure.md`'s per-skill sub-file table to list the new `summary-template.md` entry for `/flow`.
- Re-run the byte check on `skills/dispatch/SKILL.md` after this change lands (it isn't touched by this extraction, but confirm it hasn't independently drifted back toward the ceiling since the pre-flight measurement above) and note the result in this record's build log; only extract further if it's back within a few hundred bytes of `CEILING_BYTES`.

## Acceptance Criteria

- `wc -c skills/flow/SKILL.md` reports a value with at least 3,000 bytes of headroom under `CEILING_BYTES` (40,960) — not merely "smaller than before."
- `npm test` passes, including `bin/lib/skill-audit/tests/context-cost.test.js`.
- Every substantive line from the extracted span survives verbatim in `summary-template.md` — diff the pre-extraction span against the new file's content (minus the added orientation header) and confirm no line was dropped or altered beyond the stub replacement in `SKILL.md`.
- Per IL-76, this is measured as a per-mode load, not a raw byte-move count: confirm a step-list run that never reaches `wrap-up` (e.g. `/claude-tweaks:flow #N build,test`) does not load `summary-template.md` at all — i.e. the extraction is a genuine skip for that path, not just bytes relocated.
- `skills/flow/failure-cards.md`'s existing note ("the success path uses Step 5's Pipeline Summary instead") still resolves correctly — it should now point at `summary-template.md` by name, or continue to describe the success path accurately without naming a stale location.
- `docs/plugin-structure.md`'s sub-file table lists `summary-template.md` under `/flow`, matching the on-disk `skills/flow/` directory contents exactly (no entry added for a file that doesn't exist, no on-disk file left undocumented).
- No other skill's cross-reference into the extracted span's old inline location breaks — grep the repo for direct line/heading references into that span before and after (the `[IL-93]` failure mode: a moved section leaving stale pointers in other files).

## Technical Approach

Follow CLAUDE.md's extraction rule directly: split by the stub's own usage unit (the success-path template is read only when Step 5 renders it — a single, clean usage boundary, same as `failure-cards.md`'s "only when a gate fails"), extract rather than reorganize in place, leave the old heading structure in `SKILL.md` as a short pointer rather than deleting the section outright, confirm every substantive line survives the move, and measure what each resolved mode loads afterward per IL-76 rather than trusting the raw byte count moved.

Do not touch `skills/dispatch/SKILL.md` as part of this record's Deliverables — it already has adequate headroom (see Current State). Do not attempt to also extract `Multi-Spec Sequential Flow` or `Parallel Development with Worktrees` in `flow/SKILL.md`; both are already thin stubs delegating to `multi-spec.md`/`worktree-merge.md` and aren't part of this record's scope.

## Gotchas

- The Nothing-left-behind gate paragraph and both survey (Creative/Depth Opportunities) procedural paragraphs immediately preceding the fenced template are decision logic that determines *whether* and *what* to render — they stay in `SKILL.md`. Only the literal fenced markdown template and its trailing `### Next Actions` `AskUserQuestion` instructions move.
- `failure-cards.md`'s header comment already asserts "the success path uses Step 5's Pipeline Summary instead" — update that cross-reference to name `summary-template.md` once it exists, so it doesn't go stale the way CLAUDE.md's `[IL-93]` incident describes (five files restating a list that drifted out of sync).
- `skills/dispatch/SKILL.md`'s current 2,679-byte headroom is a snapshot, not a guarantee — #463 (blocked on this record per its own Prerequisites table) adds prose to `flow/SKILL.md` once this record lands, and other in-flight work may add to `dispatch/SKILL.md` independently. Re-measure both at build time rather than trusting this record's numbers verbatim.

### Key Files
- skills/flow/SKILL.md
- skills/flow/summary-template.md (new)
- skills/flow/failure-cards.md (cross-reference update only)
- docs/plugin-structure.md (sub-file table)
- bin/lib/skill-audit/tests/context-cost.test.js (verification, not modified)

## Original request

Extract sub-files from flow/SKILL.md and dispatch/SKILL.md — both sit bytes under the 40 KB ceiling

**Origin:** spec #330/#331 build (pipeline run 2026-08-11T195542-spec-329-330-331) — surfaced by three separate implementer agents having to trim prose in-region to keep `bin/lib/skill-audit`'s `context-cost.test.js` green.

## Problem

`skills/flow/SKILL.md` (~40,934 bytes) and `skills/dispatch/SKILL.md` (~40,948 bytes) sit within a few dozen bytes of the 40,960-byte ceiling. Any next addition to either file trips the suite, and edits now require compensating same-line trims — the IL-72 shape (inlining into a size-capped file and hoping to extract later).

## Deliverable

A deliberate sub-file extraction for each, following CLAUDE.md's extraction rule: split by the stubs' own unit, extract don't reorganize in place, leave old headings as stubs, confirm every substantive line survives, and measure what each resolved mode loads afterward (IL-76 — the extraction must actually reduce per-mode load, not just move bytes).

### Key Files
- skills/flow/SKILL.md
- skills/dispatch/SKILL.md
- docs/plugin-structure.md (sub-file table)

Refs #330.
