---
record: 842
origin: capture
risk: medium
size: medium
ceremony: fast-lane
grants: [build]
---
# 842: Backlog refine: Related/dependency-repair rows overwrite record body from a stale Step 1 fetch

**Related:** #843

Origin: session evaluation during /claude-tweaks:flow #764's final whole-branch review (via the review's own architecture observations; self-reference routed the findings to local records)

Defer-reason: genuinely-larger

## Current State

`/claude-tweaks:backlog refine`'s Step 5 (Apply) now re-fetches live GitHub labels before writing priority/related, grant, and flag-back rows (#764), closing the label-state race. But the same Step 5's Related-rows and Blocked-by dependency-repair rows still rewrite a record's full body from a copy fetched at Step 1's read — potentially hours before the write, across the same long-lived AskUserQuestion gate #764 just fixed for labels. `gh issue edit "$ISSUE" --body-file` (Related rows, refine-mode.md ~line 347) and the body-text append path (dependency-repair, ~line 381) both silently overwrite the record body as it stood at Step 1's fetch, clobbering any concurrent body edit that landed in between — a sibling `/specify` reshape, another session's own `Blocked by #N` append, or a human editing the issue directly. This is strictly worse than the label race #764 fixed: a label flip is a one-bit, recoverable-by-re-grant mistake; a full-body overwrite silently discards prose with no trace of what was lost.

## Deliverables

- [ ] Extend (or adapt) #764's pre-write reverify pattern to the body-rewrite paths in `skills/backlog/refine-mode.md` Step 5: before a Related-rows or dependency-repair body write, re-fetch the record's live body and diff against the Step 1-fetched premise; on a mismatch, skip the write (log + report, same shape as #764's label-mismatch skip) rather than overwriting silently.
- [ ] Decide whether a body-diff can reuse #764's SKIPPED/AUTO log-line and tally-bucket mechanism as-is, or needs its own (a body mismatch may need a richer "what changed" description than a label diff does).

## Acceptance Criteria

1. A worked trace or test demonstrates a Related-rows or dependency-repair write against a record whose body changed since Step 1's fetch is skipped, not silently applied.
2. `npm test` passes.

_Filed by `capture` via specShapedBody._

