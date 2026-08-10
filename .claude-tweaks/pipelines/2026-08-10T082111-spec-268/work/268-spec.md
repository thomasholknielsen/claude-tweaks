---
record: 268
origin: human
risk: medium
size: medium
ceremony: standard
grants: [build]
surface: backend
---
# 268: Trust ladder: failure classifications and reverts write negative evidence that auto-revokes a class

Surface: backend
Parent: #265

Blocked by #267: assumes the operational-outcome evidence-store shape and revert-detection helper landed in trust.js (closed 2026-08-10, prerequisite satisfied)

## Overview

The revocation half of the trust ladder, and it ships **unconditionally** — it exists at every autonomy ceiling tier, not just `unattended`. Two negative-evidence sources: (1) `/claude-tweaks:dispatch`'s settle path already classifies failures (`correctness` / `ambiguous` / `transient`, see `skills/dispatch/settle-and-merge.md`) — a `correctness` or `ambiguous` classification must persist as durable negative evidence for the record's class; (2) a revert detected by the operational-outcome detector (companion leaf) must likewise write negative evidence. Either drops the class below `clean` at the next trust read — machine-granting for that class stops automatically with no human action, while lowering the ceiling still revokes everything instantly and evidence history survives.

Decision rationale for the program lives on parent #265.

**Complexity:** Medium
**Estimated tasks:** 5

## Non-Goals

- The positive operational-outcome source (the companion trust leaf owns detection and known-good grading).
- Changing dispatch's failure classification itself, its retry ceilings, or its `auto:merge` revocation on retry — those stay exactly as `settle-and-merge.md` documents; this leaf only makes the classification durably visible to trust.
- Any UI/reporting surface (fleet `status` renders the trust table later; nothing here).

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #267 | Trust ladder: merged-unreverted operational outcomes | this decomposition — shares the evidence-store shape; must land first |

## Current State

- `bin/lib/issues/trust.js` — evidence store and grading; after the companion leaf, also a revert-detection helper. **Read the store shape as landed before choosing the persistence channel.**
- `skills/dispatch/settle-and-merge.md` — the settle procedure: classification via `/claude-tweaks:assess-agent-autonomy` failure-check, `bot:blocked` escalation, retry counting. Settle already writes labels and comments on the record at classification time — the persistence this leaf adds must ride an *existing* settle write, not introduce a new step prose alone is expected to remember (IL-94/IL-102: bind the new item to the write that already executes).
- `bin/lib/issues/tests/trust.test.js` — fixture patterns.

## Deliverables

- [ ] A durable, machine-parseable negative-evidence marker for a `correctness`/`ambiguous`-classified failure — **decided: a line-anchored structured marker embedded inside the `Attempt N failed: {reason}` comment settle already posts**, added only in the branch that handles `correctness`/`ambiguous` (a `transient` classification's path never carries it, satisfying the classification gate by construction). Idempotency is attempt-keyed: the marker includes the attempt number, and one attempt produces one comment — a re-read counts distinct attempt numbers, so a retried settle never double-counts. Readable from the comments fetch trust's caller already performs for failure counting (`countFailedAttempts`'s input), no new API scopes.
- [ ] `trust.js` reads that marker as a known-bad outcome for the record's class (class = the provenance.js Origin-line class trust.js already keys on — no new class notion); a class with a known-bad outcome inside its evidence sample cannot read `clean` regardless of positive count. **This is a new precedence rule layered onto the existing floor computation, not a reuse of it** — locate where the landed grading applies its floors and add the override there, with its own header comment. "Below `clean`" means whichever existing non-`clean` verdict the landed enum provides for conflicting evidence — align to the real enum at build, never invent a parallel state.
- [ ] **Negative evidence is not permanent**: it participates in the same bounded evidence sample as every other outcome (trust.js's existing sample-size cap), so a class recovers when the known-bad outcome ages out of the sample as newer outcomes accrue — self-healing by the existing mechanism, no new expiry machinery. State this in `autonomy-ceiling.md` alongside the revocation semantics.
- [ ] A revert detected on a previously-counted known-good record (companion leaf's detector — **this leaf adds no revert-detection code**; it is purely the grading consequence of #267's detector output) converts that record's contribution to known-bad on the same lazy read — no stored verdict to invalidate, recomputation covers it.
- [ ] `skills/dispatch/settle-and-merge.md` updated: the classification-persist instruction attached to the exact existing write step, plus one sentence on why (trust revocation).
- [ ] `skills/_shared/autonomy-ceiling.md` updated: revocation semantics — what flips a class below `clean`, that it is ceiling-independent, and that history is never destroyed.
- [ ] Unit suite: fixtures proving each bullet in Acceptance Criteria.

## Acceptance Criteria

1. A fixture class with enough known-good outcomes to grade `clean` plus one `correctness`-classified failure marker reads below `clean`; removing the marker fixture restores `clean` (both directions asserted, one claim per assertion — a multi-assertion test short-circuits, IL-105).
2. A `transient`-classified failure writes no negative evidence and leaves the class verdict unchanged.
3. A revert entry targeting a counted known-good record's closing commit flips that record's contribution to known-bad, and the class verdict downgrades accordingly on the next read with no other state change.
4. The settle-side marker is idempotent: two settle retries of the same record produce one unit of negative evidence, not two.
5. `settle-and-merge.md`'s persist instruction names the exact existing write it rides (verifiable by reading the step — the instruction is inside that step's command block, not a separate paragraph).

## Technical Approach

Persistence channel is decided at build time against trust.js's landed reader — the constraint that matters: trust.js's evidence scan already consumes record bodies/labels/Origin lines from the standard record fetch; the marker must be visible in that same fetch. A structured comment marker (like the `work-fingerprint` body-marker convention) or a dedicated label are both acceptable; a run-dir file is not (dies with the worktree). Negative evidence enters the same evidence sample the positive source feeds — one store, two outcome polarities, graded by the existing floors.

### Data / API Surface

- Negative-outcome marker (exact syntax decided at build; must be line-anchored and idempotently detectable, mirroring `record.js`'s existing marker-parsing conventions).
- `trust.js` outcome resolution: `{known: true, grade: 'bad', source: 'failure-classification' | 'revert'}` aligned to the landed result shape.

### Key Files

- `bin/lib/issues/trust.js` — negative-outcome reading + grading consequence
- `bin/lib/issues/tests/trust.test.js` — new cases
- `skills/dispatch/settle-and-merge.md` — persist instruction on the existing settle write
- `skills/_shared/autonomy-ceiling.md` — revocation semantics prose

### Package Dependencies

- None new.

## Gotchas

- The persist rides dispatch's settle write, which runs in *worktree* sessions under `worktree.always` — a `gh issue comment`/`gh issue edit` call works from anywhere, but any git-local persistence would not survive teardown (IL-116 territory). Prefer the tracker.
- Idempotency under retries is load-bearing: settle can run more than once for the same record (retry ceiling), and double-counted negative evidence would over-revoke.
- Don't let the marker's *absence* on old records read as "no failures ever" in prose — it means "no failures since this shipped"; say so in autonomy-ceiling.md (IL-100: don't promote observed-on-available-runs to a guarantee).
- Skill-prose edits to `settle-and-merge.md` must respect dispatch's inline-reference discipline — check what `dispatch/SKILL.md` says it inlines from the sub-file before assuming a new subsection reaches consumers (IL-60).
- Re-verify this record's premises (file names, settle step shape) against the live tree immediately before building — the dispatch skill is actively maintained (IL-109).
