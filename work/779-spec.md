---
record: 779
origin: capture
risk: medium
size: low
ceremony: fast-lane
grants: [build]
surface: backend
---
# 779: countFailedAttempts under-counts failure attempts reported on a closed PR

Surface: backend

## Current State

`countFailedAttempts` (dispatch/flow failure-attempt accounting) counts failure reports to determine when the retry ceiling fires. During #418, attempt 1's failure report landed as a comment on closed PR #665 instead of the issue itself, so the counter read the third identical failure attempt as attempt 2 — the retry ceiling never mechanically fired, and an unattended dispatch could have looped indefinitely on a premise-falsified record (see #418, #416 for the originating incident).

## Deliverables

- [ ] Locate `countFailedAttempts`'s implementation and confirm it only scans the issue's own comments, missing failure reports left on a linked-but-closed PR.
- [ ] Fix the accounting: either always mirror a failure report onto the issue itself (never solely onto the PR), or extend `countFailedAttempts` to count attempts across linked/closed PRs as well as the issue.
- [ ] Add a test case covering a failure report landing on a closed PR, asserting the retry ceiling still fires at the correct attempt count.

## Acceptance Criteria

1. A failure report written to a closed PR linked to the issue is counted by `countFailedAttempts` (or is structurally prevented from landing there in the first place).
2. A new test reproduces #418's exact shape — three identical failure attempts, the first landing on a closed PR — and asserts the retry ceiling fires at attempt 3, not later.
3. `npm test` passes with the new test included.

## Technical Approach

Two viable fixes, per the original scope note — pick whichever is structurally simpler once `countFailedAttempts`'s source is read: (a) change the failure-report write path so it always writes to the issue regardless of which PR is active, removing the split-source ambiguity entirely; or (b) widen `countFailedAttempts`'s read path to also scan comments on any closed PR linked to the issue. Option (a) is preferred if the write path can be made to always target the issue without losing PR-local context, since it removes an entire class of future counting bugs rather than patching the reader.

### Key Files

- `plugin/bin/lib/` — locate and fix `countFailedAttempts`'s module (counting/write-path logic)
- `tests/` — add the closed-PR failure-report test case

## Gotchas

- Don't assume failure reports are always issue comments today — confirm the actual current write target before choosing fix (a) vs (b), since the record's own scope note leaves this open.
- #416 is a related record — check it for context before duplicating investigation.

## Original request

countFailedAttempts under-counts failure attempts reported on a closed PR

**Related:** #418, #416

Context: #418's attempt-1 failure report landed on closed PR #665 instead of the issue, so the retry counter read the third identical failure as attempt 2 — the retry ceiling never mechanically fired and an unattended dispatch could have looped on a premise-falsified record.

Scope: failure-attempt accounting in the dispatch/flow failure path — either always mirror failure reports onto the issue, or count attempts across linked/closed PRs; add a closed-PR test case.

