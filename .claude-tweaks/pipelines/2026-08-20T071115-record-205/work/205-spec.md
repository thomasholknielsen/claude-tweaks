---
record: 205
origin: human
risk: low
size: medium
ceremony: fast-lane
grants: [build]
surface: backend
---
# 205: Parked residue from the parent-record acceptance gate build

Surface: backend

## Current State

Residue from the parent-record acceptance gate build (v6.61.0 → v6.67.0). Each item below was reviewed during that build, judged real but not load-bearing, and parked with a ruling rather than silently dropped. None blocks anything; several are one-liners.

1. **`$CLOSING_LEAVES` has no mechanical enforcement.** `skills/wrap-up/verification-brief.md`'s Self-inclusion rule takes a caller-supplied set of leaf numbers. A default clause was added so a caller supplying none falls back to the one-element set rather than the empty one — the important half, since the empty set labels nothing and reproduces the silent no-op the rule exists to prevent. What remains is that the contract is prose: today's four callers are enumerated in a per-caller table, and a fifth added later inherits the default with nothing to catch a wrong value.
2. **`/demo` has no branch for label-present-but-no-brief.** `/claude-tweaks:tidy`'s `Open family gate` recovery path adds `demo:pending` alone when a brief already landed but the label write failed. `/demo` Step 1 assumes a `demo:pending` record has a brief; with the label present and no brief it degrades to the closing-commit branch rather than erroring. Near-unreachable, because the comment-before-label invariant means the brief lands first.
3. **Guard and verifier test different strictnesses.** `verification-brief.md`'s duplicate-brief guard skips re-posting on any comment carrying the `## Verification Brief` heading alone; `execution-and-verification.md`'s verification requires that heading **plus** a `### Confirmed` section. A hand-written comment quoting the heading without a Confirmed section would suppress the post and then fail the verify. Both halves pre-date the change that aligned everything else.
4. **`dispatch/mcp-transport.md` has no MCP form for the family-gate `gh` calls.** `/claude-tweaks:dispatch`'s group auto-merge gate now runs the acceptance-labeling procedure per member, which issues `gh` calls. `mcp-transport.md` holds the gh-absent MCP form of every call site in that skill and has no entry for these, so a gh-absent group auto-merge has no transport for the labeling it is now told to perform. Pre-existing shape, surfaced by reading the group path closely.
5. **Smaller items:**
   - `skills/wrap-up/execution-and-verification.md`'s acceptance bullet is ~1,900 characters, and its "Its `incomplete` / `gated` / `resolved` branches" now sits three sentences from its antecedent. Cosmetic.
   - `skills/_shared/work-record.md` describes the local brief as a body section "under `work-links: body-text` on the `local-files` driver" — `work-links` is orthogonal to the driver there.
   - `skills/tidy/scan-procedures.md`'s Step 5.5 says it reads "Step 1's facet counts, when Step 1 is in scope", while `skills/tidy/SKILL.md` says Step 5.5 has no data dependency on any other step. Pre-existing and hedged.
   - `docs/github-issues-integration-review.md` cites `scan-procedures.md:132`/`:147` for Step 4.7 content; those line numbers were already wrong before the Step 1 extraction. It is a dated archival review, so arguably correct to leave.
   - The `local-files` `acceptance-gap` shape's 30-day window is near-inert in practice: `closed-at` is stamped only by `closeRecord`, and a wrap-up-closed record also receives `acceptance: pending`, so it is excluded by disposition anyway. The population the shape actually catches is hand-closed records with no timestamp, which the fail-open keeps regardless of age. The file discloses the fail-open, but the adjacent claim that "the two drivers report the same population" is in tension with it.

## Deliverables

- [ ] Item 1: decide whether `$CLOSING_LEAVES` belongs in a shared helper callers pass through (rather than an instruction they follow), per the file's own per-caller table in `skills/wrap-up/verification-brief.md`. Either implement the helper, or record an explicit ruling that prose enforcement stays as-is and why.
- [ ] Item 2: add a branch to `/demo` Step 1 (`skills/demo/`) for the label-present-but-no-brief case, or record an explicit ruling that it stays unhandled given how rarely the comment-before-label invariant can be violated.
- [ ] Item 3: align the duplicate-brief guard in `skills/wrap-up/verification-brief.md` with the stricter check in `skills/wrap-up/execution-and-verification.md` (both require the `## Verification Brief` heading **and** a `### Confirmed` section), or record an explicit ruling for why the guard stays laxer.
- [ ] Item 4: add the missing MCP form for the family-gate `gh` calls to `skills/dispatch/mcp-transport.md`, covering the acceptance-labeling procedure `/claude-tweaks:dispatch`'s group auto-merge gate now runs per member.
- [ ] Item 5: for each of the five smaller items, either apply the described fix or record an explicit ruling that it stays as-is (several already carry a "arguably correct to leave" note in the original report — verify that note still holds against the current file state before accepting it).

## Acceptance Criteria

1. Each of items 1-4 and each of the five item-5 bullets has a recorded outcome: fixed (with the change described in this record's Technical Approach), or explicitly re-parked with a written ruling and reason — no item is silently dropped.
2. No new `TBD`, `TODO`, or `<!-- ambiguity:` placeholder markers are introduced in any touched file.
3. `npm test` passes with no regressions in `tests/bin-lib/wrap-up`, `tests/bin-lib/demo`, `tests/bin-lib/dispatch`, and `tests/bin-lib/tidy` (or their nearest equivalents) after the touched files change.
4. For item 3 specifically: a fixture comment carrying the `## Verification Brief` heading without a `### Confirmed` section is either rejected by the duplicate-brief guard (so it doesn't suppress a real post) or accepted by the verifier — the two checks agree on the same input after the fix, whichever direction the ruling picks.
5. For item 4 specifically: the acceptance-labeling `gh` calls issued by `/claude-tweaks:dispatch`'s group auto-merge gate each have a corresponding entry in `mcp-transport.md`'s gh-absent MCP form table.

## Technical Approach

Work item-by-item; each is independent and can be fixed or re-parked without touching the others.

- **Item 1** — `skills/wrap-up/verification-brief.md` (Self-inclusion rule / `$CLOSING_LEAVES` default and its per-caller table).
- **Item 2** — `skills/demo/` (wherever `/demo` Step 1 lives) and `skills/tidy/`'s `Open family gate` recovery path, for the shared assumption between them.
- **Item 3** — `skills/wrap-up/verification-brief.md` (duplicate-brief guard) and `skills/wrap-up/execution-and-verification.md` (verification check).
- **Item 4** — `skills/dispatch/mcp-transport.md`, cross-referenced against `skills/dispatch/settle-and-merge.md`'s group auto-merge gate for the exact `gh` call sites needing an MCP form.
- **Item 5** — `skills/wrap-up/execution-and-verification.md`, `skills/_shared/work-record.md`, `skills/tidy/scan-procedures.md` + `skills/tidy/SKILL.md`, `docs/github-issues-integration-review.md`, and the `local-files` `acceptance-gap` shape's doc (wherever the 30-day-window/fail-open language lives).

## Gotchas

- Items 4 and the `docs/github-issues-integration-review.md` bullet under item 5 are explicitly flagged in the original report as "arguably correct to leave" — re-verify against the current file state before treating either as a defect; both may resolve as re-parked rather than fixed.
- Item 2 is "near-unreachable" per the original report, because the comment-before-label invariant means the brief lands first in practice — a documented ruling may be the right outcome instead of new code.
- Item 3's misalignment only triggers on a hand-written comment quoting the heading without a Confirmed section — real but low-probability.
- This record bundles five independent, low-blast-radius findings from a single retrospective; do not treat "fix everything" as mandatory — the record is satisfied by a per-item disposition (fixed or re-parked-with-reason), consistent with how these were originally handled.

## Original request

Parked residue from the parent-record acceptance gate build

Residue from the parent-record acceptance gate build (v6.61.0 → v6.67.0). Each was reviewed, judged real but not load-bearing, and parked with a ruling rather than silently dropped. None blocks anything; several are one-liners.

## 1. `$CLOSING_LEAVES` has no mechanical enforcement

`skills/wrap-up/verification-brief.md`'s Self-inclusion rule takes a caller-supplied set of leaf numbers. A default clause was added so a caller supplying none falls back to the one-element set rather than the empty one — which was the important half, since the empty set labels nothing and reproduces the silent no-op the rule exists to prevent.

What remains is that the contract is prose. Today's four callers are enumerated in a per-caller table; a fifth added later inherits the default with nothing to catch a wrong value. Worth considering whether the set belongs in a helper that callers pass through, rather than an instruction they follow.

## 2. `/demo` has no branch for label-present-but-no-brief

`/claude-tweaks:tidy`'s `Open family gate` recovery path adds `demo:pending` alone when a brief already landed but the label write failed. `/demo` Step 1 assumes a `demo:pending` record has a brief; with the label present and no brief it degrades to the closing-commit branch rather than erroring. Near-unreachable, because the comment-before-label invariant means the brief lands first.

## 3. Guard and verifier test different strictnesses

`verification-brief.md`'s duplicate-brief guard skips re-posting on any comment carrying the `## Verification Brief` heading alone; `execution-and-verification.md`'s verification requires that heading **plus** a `### Confirmed` section. A hand-written comment quoting the heading without a Confirmed section would suppress the post and then fail the verify. Both halves pre-date the change that aligned everything else.

## 4. `dispatch/mcp-transport.md` has no MCP form for the family-gate `gh` calls

`/claude-tweaks:dispatch`'s group auto-merge gate now runs the acceptance-labeling procedure per member, which issues `gh` calls. `mcp-transport.md` holds the gh-absent MCP form of every call site in that skill and has no entry for these. So a gh-absent group auto-merge has no transport for the labeling it is now told to perform. Pre-existing shape, surfaced by reading the group path closely.

## 5. Smaller items

- `skills/wrap-up/execution-and-verification.md`'s acceptance bullet is ~1,900 characters, and its "Its `incomplete` / `gated` / `resolved` branches" now sits three sentences from its antecedent. Cosmetic.
- `skills/_shared/work-record.md` describes the local brief as a body section "under `work-links: body-text` on the `local-files` driver" — `work-links` is orthogonal to the driver there.
- `skills/tidy/scan-procedures.md`'s Step 5.5 says it reads "Step 1's facet counts, when Step 1 is in scope", while `skills/tidy/SKILL.md` says Step 5.5 has no data dependency on any other step. Pre-existing and hedged.
- `docs/github-issues-integration-review.md` cites `scan-procedures.md:132`/`:147` for Step 4.7 content; those line numbers were already wrong before the Step 1 extraction. It is a dated archival review, so arguably correct to leave.
- The `local-files` `acceptance-gap` shape's 30-day window is near-inert in practice: `closed-at` is stamped only by `closeRecord`, and a wrap-up-closed record also receives `acceptance: pending`, so it is excluded by disposition anyway. The population the shape actually catches is hand-closed records with no timestamp, which the fail-open keeps regardless of age. The file discloses the fail-open, but the adjacent claim that "the two drivers report the same population" is in tension with it.

