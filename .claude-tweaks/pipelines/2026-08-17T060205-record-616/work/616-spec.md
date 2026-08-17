---
record: 616
origin: capture
risk: low
size: medium
ceremony: fast-lane
grants: [build]
surface: backend
---
# 616: backlog overview: funnelBuckets ignores isParentIssue — decomposition parents render as scored → /specify

**Related:** #512, #563, #565

Context: The 2026-08-16 `/claude-tweaks:backlog overview` run rendered 99 `scored` records; 13 of them carry `parent-issue` (#579 #558 #532 #524 #512 #506 #462 #451 #416 #365 #328 #265 #215) — decomposition containers, not shaping work. Five (#532 #512 #506 #462 #365) have every native sub-issue closed and are open only pending parent close-out.

## Current State

`funnelBuckets` (`bin/lib/issues/backlog.js`) partitions on `bot.inProgress` / `stage` / `notPlanned` / grants / `priority|risk|size`, and never reads `facets.isParentIssue`. A parent with `risk:*` or `size:*` lands in `scored`; one without lands in `captured`. Overview's funnel header therefore tells the human "scored N → /claude-tweaks:specify #N (shape them)" for records `/specify` already decomposed, and the Shape paste block can emit `/claude-tweaks:specify #{parent}` terminals. `_shared/work-record.md`'s Decomposition rules say parents are never `ready` and are not agent-sized work units.

## Deliverables

- `funnelBuckets` excludes `facets.isParentIssue === true` records from `captured`/`scored`/`shaped`/`granted`/`dispatchable` — either a dedicated `parents` bucket (rendered as one annotation line, like `parked`/`not-planned`) or an explicit exclusion; the mutual-exclusivity and sum-to-total invariants stay intact.
- `overview-mode.md` Step 2's bare-mode header/annotation renders the parent count with a pointer to the lane that owns them (parent close-out is `/wrap-up`'s verification brief / `/demo`'s parent gate, not `/specify`), and the Shape block never emits a `/claude-tweaks:specify` line for a parent.
- `refine-mode.md`'s priority/Related worklist gets the same exclusion if it shares the bucketing (verify; do not assume).
- Tests in `tests/bin-lib/issues/` pin the exclusion with a parent fixture carrying `size:*`.

## Acceptance Criteria

- On the current open set, the funnel header's `scored` count drops by the number of open `parent-issue` records and no paste block names a parent.
- A parent record with `risk:*`/`size:*` labels is not in `scored`, `captured`, or any buildable bucket; the buckets still sum to the record total plus the parent count.
- `node --test tests/bin-lib/issues/` passes, including a new discriminating test that fails on the pre-fix implementation.
