---
record: 958
origin: human
risk: medium
size: medium
ceremony: standard
grants: [build]
surface: backend
---
# 958: Auto-route an in-flight tombstone claim into dispatch's settle-the-existing-build handling

Surface: backend

Origin: wrap-up leftover from #315

Defer-reason: needs-human-decision

## Current State

Record #315 added an in-flight detection check (`tombstoneInFlightPr`) to both `claim-engine.js`'s `claimOne` and `claim-targets.js`'s claim loop: a `pr-opened:` tombstone whose linked PR is still open now blocks reclaim/rebuild and surfaces the linked PR via a card (`flow/claim-targets.md`'s "Flow: Claim in-flight" card, exit code 3 with an `inFlight` envelope). This satisfies the literal acceptance criteria (does not re-claim/re-build; surfaces the existing open PR) but the card currently only renders as a blocking stop — it does not auto-route into dispatch Step 6 / the Review Console's existing resume/merge-decision machinery for a run whose PR is already open, which #315's own Deliverable #2 and Gotchas section named as the fuller intent ("route to the existing settle-the-existing-build handling ... instead of a fresh claim").

## Deliverables

1. Confirm the exact hook-in point in dispatch Step 6 / the Review Console for a run whose PR is already open (per #315's own Gotchas note, which flagged this as needing confirmation before implementing).
2. Wire the "Flow: Claim in-flight" card (`flow/claim-targets.md`) to route into that existing resume/merge-decision machinery instead of rendering as a blocking stop.
3. Update `flow/claim-targets.md`'s "Known gap" note once resolved.

## Acceptance Criteria

Given a `pr-opened:` tombstone with a still-open linked PR, dispatch/`/flow`'s claim path routes the run into the existing resume/merge-decision handling for that PR (e.g. resumes review/wrap-up against it) rather than stopping with an informational card requiring manual follow-up.

_Filed by `wrap-up leftover routing` via specShapedBody._

## Technical Approach

Locate the dispatch Step 6 / Review Console code path that already resumes/merge-decides an in-flight PR for a run that reaches that step normally, then wire claim-engine.js/claim-targets.md's in-flight-tombstone branch to hand off into that same path instead of rendering the "Flow: Claim in-flight" card as a terminal stop. No new resume/merge-decision machinery — reuse what dispatch Step 6 already has for an already-open PR.

### Key Files

- `plugin/skills/dispatch/SKILL.md` — Step 6 resume/merge-decision machinery to hook into
- `plugin/bin/lib/dispatch/claim-engine.js` — `claimOne`'s in-flight detection
- `plugin/bin/lib/dispatch/claim-targets.js` — the claim loop's in-flight branch
- `plugin/skills/flow/claim-targets.md` — the "Flow: Claim in-flight" card and its "Known gap" note

## Gotchas

- The exact Step 6 hook-in point needs confirming first (Deliverable 1) — #315's own Gotchas flagged this as needing confirmation before implementing; do not guess the hand-off shape without reading that code path directly.
- Do not change the underlying in-flight *detection* (`tombstoneInFlightPr`) — it already satisfies #315's literal acceptance criteria; this record only changes what happens after detection.

## Original request

Auto-route an in-flight tombstone claim into dispatch's settle-the-existing-build handling

Origin: wrap-up leftover from #315

Defer-reason: needs-human-decision

## Current State

Record #315 added an in-flight detection check (`tombstoneInFlightPr`) to both `claim-engine.js`'s `claimOne` and `claim-targets.js`'s claim loop: a `pr-opened:` tombstone whose linked PR is still open now blocks reclaim/rebuild and surfaces the linked PR via a card (`flow/claim-targets.md`'s "Flow: Claim in-flight" card, exit code 3 with an `inFlight` envelope). This satisfies the literal acceptance criteria (does not re-claim/re-build; surfaces the existing open PR) but the card currently only renders as a blocking stop — it does not auto-route into dispatch Step 6 / the Review Console's existing resume/merge-decision machinery for a run whose PR is already open, which #315's own Deliverable #2 and Gotchas section named as the fuller intent ("route to the existing settle-the-existing-build handling ... instead of a fresh claim").

## Deliverables

1. Confirm the exact hook-in point in dispatch Step 6 / the Review Console for a run whose PR is already open (per #315's own Gotchas note, which flagged this as needing confirmation before implementing).
2. Wire the "Flow: Claim in-flight" card (`flow/claim-targets.md`) to route into that existing resume/merge-decision machinery instead of rendering as a blocking stop.
3. Update `flow/claim-targets.md`'s "Known gap" note once resolved.

## Acceptance Criteria

Given a `pr-opened:` tombstone with a still-open linked PR, dispatch/`/flow`'s claim path routes the run into the existing resume/merge-decision handling for that PR (e.g. resumes review/wrap-up against it) rather than stopping with an informational card requiring manual follow-up.

_Filed by `wrap-up leftover routing` via specShapedBody._
