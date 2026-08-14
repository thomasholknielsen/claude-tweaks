---
record: 350
origin: human
risk: medium
size: medium
ceremony: standard
grants: [build]
fingerprint: autonomy-console-headless-wrapup:review-console-fold-m-q-u-into-approve-all-and-add-the-conso
surface: backend
---
# 350: Review Console: fold M#/Q#/U# into Approve all and add the consoleAutoResolve path

Surface: backend

## Overview

Implement the console side of the ceiling-aware stance: fold `M#`/`Q#`/`U#` under the console's single "Approve all" answer (all tiers, interactive), add the `consoleAutoResolve` auto-resolution path (`unattended`: zero `AskUserQuestion` calls, report render, `AUTO` logging, one consolidated `PushNotification`, staged files retained), move the `M#` write to batch-approval-or-auto-resolution time, demote the per-item chunking contracts to the Override drill, and fix `console-template.md`'s stale per-item line. The stance itself (what is permitted at which tier, the recorded reversals) is defined by the contract sub-issue — this sub-issue implements it and must not re-derive or contradict it.

**Complexity:** Medium
**Estimated tasks:** 7

## Non-Goals

- No contract-stance changes in `auto-mode-contract.md` / `auto-mode-card.md` / `memory-curation.md` (contract sub-issue).
- No `ledger/resolve-gate.md`, `summary-template.md` report section, `review/SKILL.md`, or `dispatch/SKILL.md` changes (ledger/sweep sub-issue).
- The auto-merge short-circuit's own mechanics are untouched (its `git -C` anchoring bug is #299; unifying it with dispatch's gate is #335 — neither is this sub-issue's scope even where the same lines are nearby).
- `_shared/pending-review-durability.md`'s push-before-console ordering is unchanged at every tier.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #348 | Autonomy capabilities: consoleAutoResolve and ledgerRouteRemainder behind the unattended ceiling | must land first — `bookkeepingPermissions(ceiling).consoleAutoResolve` does not exist in code until #348 lands; this sub-issue's Technical Approach depends on it directly |
| #349 | Contract rewrite: never-silenced rows learn the autonomy ceiling | must land first — this sub-issue implements that stance |
| #221 | Frontier self-improvement singletons: wrap-up, reflect, feedback, init | bot:in-progress on wrap-up sub-files — rebase over its landed changes before editing |

## Current State

- `skills/wrap-up/review-console.md` — Hard requirements block (~line 302: "Queue writes, Memory updates, and Upstream feedback each require an explicit per-item decision… Never group any of them under 'Approve all'"; "A different table's approval never satisfies this gate"); `M#`/`Q#` resolve via `_shared/batched-item-drill.md` multiSelect chunking pre-checked to Apply (~line 256), `U#` via `_shared/upstream-feedback-batch.md` unchecked (~line 302); "On approval" step 8 (~line 274) writes each memory file at per-item approval; Override rules (~line 285); `--dry-run` behavior (~line 22); empty-console fast path (~line 294); auto-merge short-circuit runs before the console renders (~line 230, "the console ends in a blocking `AskUserQuestion` that a headless firing never returns from").
- `skills/wrap-up/console-template.md` — line 8 still says "one `AskUserQuestion` call per item for Queue writes/Memory updates" (stale even against today's chunking); the `M#` section header says "REQUIRES PER-ITEM APPROVAL (not covered by 'Approve all')" (~line 145); `U#` section header analogous, with the scrub blockquote.
- `skills/wrap-up/execution-and-verification.md` — "Memory updates — already written when approved… step 8 wrote the memory file… at the moment of approval" (~line 21); Verify-execution checks the file on disk + index line (~line 44).
- `skills/_shared/batched-item-drill.md` — generic chunking contract; "What stays forbidden" section.
- `skills/_shared/upstream-feedback-batch.md` — U#-specific batch contract (unchecked default per [IL-114]).
- `skills/wrap-up/SKILL.md` (~line 231) — console description naming the three actions; `bookkeepingPermissions` and the ceiling resolve via `bin/lib/issues/autonomy.js` / `bin/resolve-policy.js` (see `_shared/autonomy-ceiling.md`).

## Deliverables

- [ ] `review-console.md` Hard requirements rewritten: the terminal Approve all / Override / Stop decision covers `M#`/`Q#`/`U#`; per-item chunking (batched-item-drill for `M#`/`Q#`, upstream-feedback-batch for `U#`, unchecked default intact there) becomes the **Override** drill; the "different table's approval" sentence replaced consistently with the contract sub-issue's stance.
- [ ] `review-console.md` gains the `consoleAutoResolve` path: when the resolved ceiling grants it (`bookkeepingPermissions(ceiling).consoleAutoResolve`, from #348), render the full console as an informational report (every `decisions.md` entry, staged item, and section still presented — nothing silently dropped), resolve all sections per the **checked/apply** default with zero `AskUserQuestion` calls — this explicitly includes `U#`: at `unattended`, upstream feedback auto-files exactly like `M#`/`Q#` (Thomas's explicit direction, per #347's Decision Rationale), even though `U#`'s default is unchecked everywhere else (Override drill at `supervised`/`trusted`) — `consoleAutoResolve` is not "apply the Override-drill defaults," it is "apply the Approve-all default to everything." Log one `AUTO` line per resolved item to `decisions.md`, send one consolidated `PushNotification` at the same send point `_shared/autonomy-ceiling.md`'s Notification section already documents ("sent at the same point the existing auto-merge fast lane sends its FYI — see wrap-up/review-console.md's auto-merge short-circuit"), and retain `staged/` files as revert artifacts instead of consuming them.
- [ ] `M#` write timing: step 8 executes approved memory writes at batch approval (or auto-resolution), still per `_shared/learning-routing.md`'s D4 procedure; decline logging unchanged.
- [ ] `review-console.md` documents the tier split for headless firings: `supervised`/`trusted` keep the unanswered-console `pending-review` resting state; `unattended` completes. `--dry-run` and the empty-console fast path unchanged.
- [ ] `console-template.md`: line 8 rewritten to the single-decision shape; `M#`/`U#` section headers lose "REQUIRES PER-ITEM APPROVAL"/"not covered by 'Approve all'"; the memory blast-radius and U# scrub blockquotes stay.
- [ ] `execution-and-verification.md`: "already written when approved" language updated to the batch/auto timing; Verify-execution targets unchanged (file on disk at the memory dir + `MEMORY.md` index line).
- [ ] `batched-item-drill.md` + `upstream-feedback-batch.md`: consumer prose updated — their console role is the Override drill; the "What stays forbidden" rule (no shared bulk toggle *within* a drill) is unchanged.

## Acceptance Criteria

1. `grep -in "per-item decision\|never group any of them" skills/wrap-up/review-console.md` returns zero matches in the Hard requirements block's operative rules (historical/reversal-record mentions naming the old stance as retired are allowed and must read as history).
2. `grep -in "consoleautoresolve" skills/wrap-up/review-console.md` matches the new auto-resolution path, and that path's text contains "PushNotification", "AUTO", and "staged" (retention).
3. `grep -in "one .AskUserQuestion. call per item" skills/wrap-up/console-template.md` returns zero matches.
4. `grep -in "REQUIRES PER-ITEM APPROVAL" skills/wrap-up/console-template.md` returns zero matches; `grep -in "scrub" skills/wrap-up/console-template.md` still matches the U# blockquote.
5. `grep -in "moment of approval\|already written when approved" skills/wrap-up/execution-and-verification.md` returns zero matches; the Verify section still checks the memory file + index line.
6. `review-console.md` stays under the 40KB SKILL.md-family ceiling: `wc -c skills/wrap-up/review-console.md` < 40960 (see #336 for the early-warning context).
7. `npm test` passes, including any registry/console prose-pin tests updated in the same commit as the prose they pin.

## Technical Approach

Prose-mechanics work in the console files, implementing the contract stance. The ceiling is resolved once (standard precedence via the policy resolver), then `bookkeepingPermissions(ceiling).consoleAutoResolve` picks the render mode: prompt (terminal decision covering all sections) or report (auto-resolve). Override keeps today's chunking calls verbatim.

### Key Files

- `skills/wrap-up/review-console.md` — Hard requirements, terminal decision, consoleAutoResolve path, step 8 timing, tier-split note
- `skills/wrap-up/console-template.md` — line 8, section headers
- `skills/wrap-up/execution-and-verification.md` — write-timing language
- `skills/_shared/batched-item-drill.md` — consumer-role prose
- `skills/_shared/upstream-feedback-batch.md` — consumer-role prose

## Gotchas

- `review-console.md`'s auto-merge short-circuit note (~line 230) says the console "ends in a blocking `AskUserQuestion` that a headless firing never returns from" — that sentence becomes tier-conditional; update it or the ordering rationale it anchors breaks.
- The U# unchecked-by-default survives **only inside the Override drill** — do not delete it from `upstream-feedback-batch.md`; do not resurrect it as a console-level gate.
- `wrap-up/SKILL.md`'s console summary (~line 231) and `summary-template.md`'s header both describe the console's decision surface — the first is updated here; `summary-template.md` belongs to the ledger/sweep sub-issue (its report section). Coordinate wording, don't duplicate.
- Rebase over #221's landed wrap-up changes before editing; if #221 is still in flight at build time, the Blocked-by link makes dispatch wait — do not build around it.
- Keep `M#`/`Q#`/`U#` numbering sequences and section renderings — visibility is the load-bearing half of the fold decision.
- Read `docs/skill-authoring.md` before editing any `skills/**/*.md`.


<!-- work-fingerprint: autonomy-console-headless-wrapup:review-console-fold-m-q-u-into-approve-all-and-add-the-conso -->
