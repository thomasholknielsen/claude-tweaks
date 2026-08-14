---
record: 389
origin: capture
risk: low
size: low
ceremony: fast-lane
grants: [build]
surface: backend
---
# 389: init: stale-routine advisory jumps straight to 'fleet on' without flagging composition change

Surface: backend

## Current State

`/init`'s Update Mode Routine Drift check correctly flags stale routines as advisory-only, with no bulk auto-fix (per the routine-drift contract). But a caller building a Next Actions recommendation from that advisory can jump straight to "re-provision via `/claude-tweaks:routine fleet on`" without surfacing that `fleet on` may mean adopting a materially different, larger fleet composition than what previously existed — not just restoring parity.

## Deliverables

Update the stale-routine advisory (`skills/init/update-mode.md`'s Routine Drift section) so that, when recommending recovery, it explicitly notes that `fleet on` reconciles against the *current* fleet composition table — which may differ from what the project previously had live — and points at `/claude-tweaks:routine status <skill>` as the lower-commitment first step, rather than only naming `fleet on`.

## Acceptance Criteria

- The stale-routine advisory's recovery recommendation explicitly warns that `fleet on` reconciles against current fleet composition, not prior state
- The advisory offers `/claude-tweaks:routine status <skill>` as a lower-commitment alternative before pointing at `fleet on`
- The Routine Drift check remains advisory-only — no bulk auto-fix introduced

## Technical Approach

Edit `skills/init/update-mode.md`'s Routine Drift section prose/Next Actions wording to add the composition-change caveat and the `routine status` pointer.

## Gotchas

- Related to #388 (same `update-mode.md` area) — coordinate wording/tone if built in the same pass
- Must stay advisory-only; don't introduce an auto-fix

## Original request

init: stale-routine advisory jumps straight to 'fleet on' without flagging composition change

**Related:** #388

Context: /init's Update Mode Routine Drift check correctly flags Stale routines as advisory-only, with no bulk auto-fix (per the routine-drift contract). But a caller building a Next Actions recommendation from that advisory can jump straight to "re-provision via /claude-tweaks:routine fleet on" without surfacing that fleet on may mean adopting a materially different, larger fleet composition than what previously existed.

Scope: The stale-routine advisory (skills/init/update-mode.md's Routine Drift section) should explicitly note when recommending recovery that fleet on reconciles against the current fleet composition table, which may differ from what the project previously had live, and point at /claude-tweaks:routine status <skill> as the lower-commitment first step rather than only naming fleet on.
