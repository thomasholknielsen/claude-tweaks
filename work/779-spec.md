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

## Build-time finding — Update the spec (premise already fixed by a sibling)

Independently verified against the current base before implementing (per this build's
dispatch instructions): the split-source under-counting this record describes was already
fixed structurally by #410 ("PR as run surface"), shipped in commit `cfd65c04f`
(2026-08-14T15:54:37+02:00) — **three days before this record (#779) was filed**
(2026-08-17T08:33:35Z). That commit's message states directly: "routes retry-ceiling comment
counting to the PR's own comments once the failure comment lives there instead of the
issue's."

Current `plugin/skills/dispatch/settle-and-merge.md` Step 6 step 4 ("Comment source routes on
the pr-first gate") fetches "Attempt N failed" comments from the **PR's own comments**
(`repos/{owner}/{repo}/issues/{pr-number}/comments`) whenever `run-state.json` carries a `pr`
object, and from the issue otherwise — a single source per run, never split. This is pinned by
`tests/pr-run-comments.test.js` ("retry-ceiling counting is called out as reading from the PR,
not the issue, under the gate" / "settle-and-merge.md routes the retry-ceiling comment fetch to
the PR when run-state carries one") and `_shared/pr-run-comments.md`'s own Anti-Patterns table
("Counting retry attempts from the issue's comments after the failure comment moved to the PR").
Because the source is always singular and consistently chosen per run, the split-source shape
this record's Current State describes (attempt 1 landing on a closed PR, later attempts read
from the issue) cannot occur under the current architecture within one run.

**Deliverables status:**
- Deliverable 1 (locate `countFailedAttempts`) — done, see above.
- Deliverable 2 (fix the accounting) — already satisfied by #410's existing fix; no new
  production code required. `bin/lib/issues/retry.js` itself is unchanged (`countFailedAttempts`
  was always source-agnostic; the fix lives in the *caller's* comment-source selection).
- Deliverable 3 / AC2 (add a test reproducing the closed-PR shape) — added
  `tests/bin-lib/issues/retry.test.js`'s `'#779: three attempts landing on the same pr-first
  source (the PR) still fire the ceiling at attempt 3'`, using production-shaped comment bodies
  (`attemptFailedCommentBody`'s own output) to encode AC2's intent under the architecture that
  actually exists today, rather than hand-simulating a split-source shape the current design
  structurally prevents.

**Classification: Update the spec** (architecture-alignment.md's taxonomy) — the spec's premise
was accurate as of the originating #418 incident but was superseded by #410 before this record
was filed; reality (the existing fix) is correct, kept as-built. No source-code change to
`bin/lib/issues/retry.js` or `settle-and-merge.md` was made in this build. `npm test` still gates
this build per AC3.

## Original request

countFailedAttempts under-counts failure attempts reported on a closed PR

**Related:** #418, #416

Context: #418's attempt-1 failure report landed on closed PR #665 instead of the issue, so the retry counter read the third identical failure as attempt 2 — the retry ceiling never mechanically fired and an unattended dispatch could have looped on a premise-falsified record.

Scope: failure-attempt accounting in the dispatch/flow failure path — either always mirror failure reports onto the issue, or count attempts across linked/closed PRs; add a closed-PR test case.

