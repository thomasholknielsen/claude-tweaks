---
record: 226
origin: human
risk: low
size: low
ceremony: fast-lane
grants: [build, merge]
surface: backend
---
# 226: Section E's ownership check reads 'never claimed' as 'a successor holds the lock'

Surface: backend

## Current State

`skills/wrap-up/cleanup-procedures.md` Section E step 3 treats any `claim.runId !== $RUN_ID` as "a successor holds the lock." When no claim ever existed, `claimStatus()` returns `{claim: null}`, so that condition also evaluates true — `decisions.md` gets a line like `AUTO — skipped release of issue #N: claim held by run undefined` for records that were never claimed at all.

This is pre-existing, but 6.69.0 widened Section E's Condition from "materialized header present" to "record-based work," so this path is now reachable on likely the majority of standalone wrap-ups rather than a rare edge case. It fails in the safe direction — an unclaimed record is skipped rather than having a nonexistent ref deleted — but it accumulates confusing log lines fast.

A second, currently undocumented consequence of the same 6.69.0 widening: Section E's Detection Ladder is a declared hard gate ("if `gh` is unavailable there is nothing safe to degrade to — stop"). Moving item 7's Condition to record-based work newly exposes standalone `/wrap-up #N` runs in `gh`-absent environments — the cloud-Routine/MCP-transport case CLAUDE.md explicitly supports — to a hard stop during cleanup, a path that wouldn't previously have reached this gate at all.

Found by the whole-branch review of 6.69.0.

## Deliverables

- In `skills/wrap-up/cleanup-procedures.md` Section E step 3, distinguish `claim === null` (never claimed — nothing to release, proceed quietly, no log line) from `claim.runId !== $RUN_ID` (a successor genuinely holds the lock — skip and log, unchanged from today).
- Decide, and record the decision inline in the same section, whether the Detection Ladder's hard-gate-on-`gh`-absent behavior should stay hard for standalone `/wrap-up #N` runs now that item 7's Condition covers record-based work broadly, or whether that path needs its own degrade behavior for the `gh`-absent/MCP-transport case CLAUDE.md supports.

## Acceptance Criteria

- Running Section E step 3 against a record whose `claimStatus()` returns `{claim: null}` produces no "skipped release... claim held by run undefined" log line — it proceeds quietly, as a genuinely-unclaimed record should.
- Running Section E step 3 against a record whose `claim.runId` differs from `$RUN_ID` still logs the "skipped release... claim held by run {other-run}" line unchanged — the successor-holds-the-lock path is untouched.
- The Detection Ladder's `gh`-absent behavior for standalone `/wrap-up #N` runs is explicitly confirmed as intentionally hard-gated (with a one-line rationale in the doc) or given a degrade path — not left silently ambiguous.
- `skills/wrap-up/cleanup-procedures.md` Section E reads consistently with the fix — no stale prose describing the old (bugged) behavior.

## Technical Approach

Locate Section E step 3's ownership check in `skills/wrap-up/cleanup-procedures.md`. Split the current single condition (`claim.runId !== $RUN_ID`) into two explicit branches: `claim === null` (or claim undefined) short-circuits to "nothing to release" with no log line; `claim.runId !== $RUN_ID` keeps today's skip-and-log behavior. Update any accompanying prose/pseudocode in that section to match. Resolve the Detection Ladder question above as a documentation decision (and a behavior change only if the decision calls for one).

## Gotchas

- This is prose/skill-file logic, not a code module — the fix is an edit to `skills/wrap-up/cleanup-procedures.md`'s Section E, not a `bin/lib` change.
- Fails in the safe direction today (skip rather than delete a nonexistent ref), so this is a log-noise and gate-correctness fix, not a data-loss fix — don't let that lower urgency lead to skipping the Detection Ladder documentation decision.
- 6.69.0's widening is the root cause of the increased exposure; confirm the fix targets the widened condition without narrowing it back to "materialized header present only" as a shortcut.

## Original request

Section E's ownership check reads 'never claimed' as 'a successor holds the lock'

`skills/wrap-up/cleanup-procedures.md` Section E step 3 treats any `claim.runId !== $RUN_ID` as 'a successor holds the lock'. When no claim ever existed, `claimStatus()` returns `{claim: null}`, so that condition is also true — and `decisions.md` gets `AUTO — skipped release of issue #N: claim held by run undefined`.

Pre-existing, but 6.69.0 widened Section E's Condition from 'materialized header present' to 'record-based work', so this path is now reachable on likely the majority of standalone wrap-ups rather than a rare edge case.

Fails in the safe direction — an unclaimed record is skipped rather than having a nonexistent ref deleted — so the prose now documents the behavior rather than the logic being changed. But it will accumulate confusing log lines fast.

**Fix:** distinguish `claim === null` (never claimed — nothing to release, proceed quietly) from `claim.runId !== $RUN_ID` (a successor genuinely holds it — skip and log).

**Second consequence of the same widening, unlogged until now:** Section E's Detection Ladder is a declared hard gate ('if `gh` is unavailable there is nothing safe to degrade to — stop'). Moving item 7's Condition to record-based work newly exposes standalone `/wrap-up #N` runs in `gh`-absent environments — the cloud-Routine/MCP-transport case CLAUDE.md explicitly supports — to a hard stop during cleanup. Worth deciding whether that gate should stay hard on this path.

Found by the whole-branch review of 6.69.0.

