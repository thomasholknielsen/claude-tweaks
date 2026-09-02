---
record: 671
origin: capture
risk: low
size: low
ceremony: fast-lane
grants: [build, merge]
---
# 671: Reconcile auto-decision-log's entry schema with shipped STAGED lines — Reversibility is required in the schema but omitted by every shipped STAGED producer

Defer-reason: tangential

## Current State

`_shared/auto-decision-log.md`'s Entry schema (the "Entry schema" section's field table) marks `Reversibility:` as required for every entry — the Reversibility row states "yes" for all statuses except `SCANNED`/`REFUSED`, which explicitly resolve to `N/A`. `STAGED` is not exempted, so per the schema as written every `STAGED` line must carry `Reversibility:`.

Two shipped producer templates omit it entirely:

- `skills/flow/polish-execution.md` lines 19-20 — the two `STAGED` line templates for the `manual-only` and `unclassified` polish-suggestion kinds — end with "Staged at staged/polish-suggestion-{n}.md. Surface at Review Console[.| for routing]." and never mention `Reversibility:`.
- `skills/design-wrapper/modes/review.md` line 430 — the Step 5.5 decisions-staging line — ends "Remedy: {remedy}. Surface at Review Console." and never mentions `Reversibility:`.

This was independently re-flagged three times across two records (a #599 3a reproduction agent, the #599 whole-branch review, and an earlier fix-wave note) and each time adjudicated "consistent-with-practice, rides" rather than fixed — the repeated re-adjudication cost is what filed #671.

**Verified against the live repo during shaping** (2026-08-17, worktree `issue-671-decision-log-reversibility`, HEAD `bb1ae052`): the omission still reproduces exactly as described at both files, at the same lines.

Shaping investigation also found the deciding evidence for which side of the issue's own proposed two-way fork to take: several other shipped `STAGED` producers in the same file family already carry a `Reversibility:` field on their `STAGED` lines — e.g. `skills/wrap-up/skill-curation.md` lines 66 and 70 (`Reversibility: high (stage path: staged/wrap-up-skill-{N}.md).`), `skills/wrap-up/memory-curation.md` line 15, and `skills/wrap-up/upstream-feedback.md` line 19. The two outlier templates in scope here are the exception, not the rule — the codebase's own established convention already answers the issue's "which side to pick" question in favor of making the producers conform to the schema, not carving a permanent `STAGED` exemption into the schema doc itself.

## Deliverables

Add the missing `Reversibility:` field to the three outlier `STAGED` line templates, using the value `high (staged only)` — nothing is applied when an entry is staged, so the disposition is genuinely high-reversibility by construction (this is the same "high (staged only)"-shaped value the issue's own alternative proposed for a schema exemption sentence — used here as the field's actual value instead):

1. `skills/flow/polish-execution.md` line 19 (`manual-only` kind) — insert `Reversibility: high (staged only).` after the existing `Staged at staged/polish-suggestion-{n}.md.` sentence and before `Surface at Review Console.`
2. `skills/flow/polish-execution.md` line 20 (`unclassified` kind) — same insertion, before `Surface at Review Console for routing.`
3. `skills/design-wrapper/modes/review.md` line 430 (Step 5.5) — insert `Reversibility: high (staged only).` after `Remedy: {remedy}.` and before `Surface at Review Console.`

No change to `_shared/auto-decision-log.md`'s Entry schema itself — its existing "Reversibility: yes, required" row is correct as written; the producers were the side that drifted from it.

## Acceptance Criteria

- [ ] `skills/flow/polish-execution.md`'s `manual-only` STAGED template (currently line 19) reads: `- STAGED {HH:MM:SS} — Polish phase: audit suggested {command} on {files} (manual-only, not auto-dispatched). Staged at staged/polish-suggestion-{n}.md. Reversibility: high (staged only). Surface at Review Console.`
- [ ] `skills/flow/polish-execution.md`'s `unclassified` STAGED template (currently line 20) reads: `- STAGED {HH:MM:SS} — Polish phase: audit finding {id} ({category}) on {files} had no usable suggestion — no command dispatched. Staged at staged/polish-suggestion-{n}.md. Reversibility: high (staged only). Surface at Review Console for routing.`
- [ ] `skills/design-wrapper/modes/review.md`'s Step 5.5 STAGED template (currently line 430) reads: `STAGED {time} — review Step 5.5: decisions finding from {provider} on {file} staged at staged/{filename}. Remedy: {remedy}. Reversibility: high (staged only). Surface at Review Console.`
- [ ] `grep -c "Reversibility:" skills/flow/polish-execution.md` increases by exactly 2 over the pre-change count; `grep -c "Reversibility:" skills/design-wrapper/modes/review.md` increases by exactly 1 over the pre-change count
- [ ] No other line in either file changes — a surgical, template-text-only edit; `git diff --stat` shows only these two files, and `git diff` shows only the three targeted lines changed
- [ ] `npm test` passes

## Technical Approach

Plain markdown string edits inside two prose skill files — no code, no schema change, no new label, no new test infrastructure. Before editing, re-confirm no `tests/**` file byte-pins the exact old template strings at `skills/flow/polish-execution.md:19-20` or `skills/design-wrapper/modes/review.md:430` (checked during shaping via `grep -rln "Surface at Review Console" tests/` and a search for the review.md line's literal text — none found as of 2026-08-17); if the live repo has since gained such a test, update it in the same commit rather than leaving a stale-text pin.

## Gotchas

- The issue's own "Suggested resolution" section frames this as a binary choice — exempt `STAGED` in the schema, or sweep the producers — and says either is fine "so reviewers stop re-flagging it." This spec picks the sweep-the-producers side on evidence found during shaping, not arbitrarily: several other shipped `STAGED` producers (`skill-curation.md`, `memory-curation.md`, `upstream-feedback.md`) already carry the field, so bringing the two outliers into line is smaller in scope than it first looks, and it converges the codebase on one already-dominant pattern rather than adding a second, permanent exception to the schema doc.
- Insertion point matters for schema field-ordering conformance: `_shared/auto-decision-log.md`'s Entry schema table lists Reversibility as the last required field, before only the optional trailing `[lever: ...]` field. "Surface at Review Console" is product-specific call-to-action text outside the four formal schema fields, so in all three edits it stays last, after `Reversibility:`, not before it.
- Framing-check verdict: `open` (not solution-baked) — the record cites concrete schema-vs-shipped-code evidence, reproduced it live, and traded off both sides of the issue's own named fork before picking one, rather than asserting a single implementation with no alternative considered. No `## Gotchas` assumption bullets required by that verdict.

_Filed by `capture` via specShapedBody._
