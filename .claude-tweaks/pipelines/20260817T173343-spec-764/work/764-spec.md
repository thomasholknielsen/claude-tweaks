---
record: 764
origin: capture
risk: medium
size: low
ceremony: standard
grants: [build, merge]
surface: backend
---
# 764: backlog refine: Apply step doesn't reverify live label state before writing

Origin: session evaluation of a /claude-tweaks:backlog refine run (via /claude-tweaks:feedback; self-reference routed the findings to local records)

Defer-reason: genuinely-larger

## Current State

`/claude-tweaks:backlog refine`'s Step 4→Step 7 confirm gate (`skills/backlog/refine-mode.md`) renders a batch table and waits on a single `AskUserQuestion`, then Step 5 applies every row exactly as confirmed, with no re-read of live label state between confirmation and write. In a live run on 2026-08-16/17 the confirmation sat unanswered for roughly 7 hours; in that window a sibling session independently scored and granted 3 of the same "unscored, flag back" rows (#616, #649, #645) and dispatch claimed two of them (`bot:in-progress`). The apply step then stripped `ready` from live, in-progress records and posted stale "needs scoring" comments on all three, all of which had to be detected via `gh api .../timeline` and manually reverted (deleted the stale comment, restored `ready`) before the run could report cleanly. Nothing in `refine-mode.md`'s Step 5 (Apply) checks whether a row's premise still holds at write time.

## Deliverables

- [ ] `skills/backlog/refine-mode.md` Step 5 (Apply): immediately before writing each row (grant, flag-back, priority/related), re-fetch that record's live `labels` (`gh issue view $ISSUE --json labels`) and compare against the premise the row was built on. A flag-back target that now carries `risk:*`/`size:*`/`auto:build`/`bot:in-progress`, or a grant target that lost `ready`, is dropped from the write with a one-line report, never written.
- [ ] State this as a general rule other batch-confirm-then-apply flows in the plugin should follow (the same shape applies anywhere a long-lived `AskUserQuestion` gate precedes a write loop); cross-reference from a sibling skill with the same pattern if one is identified during the build.

## Acceptance Criteria

1. `grep -n "re-fetch\|live label" skills/backlog/refine-mode.md` shows the pre-write reverify step in Step 5.
2. A test or worked trace demonstrates a row confirmed against a stale premise (built before a concurrent grant/claim) is skipped at write time, not applied.
3. `npm test` passes.

## Technical Approach

One `gh issue view` call per row immediately before its write in Step 5's existing loop; compare against the row's own recorded premise (current labels at Step 4 render time, already available) rather than re-deriving anything.

_Filed by `capture` via specShapedBody._
