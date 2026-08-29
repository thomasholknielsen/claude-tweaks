---
record: 879
origin: capture
risk: low
size: medium
ceremony: standard
grants: [build]
---
# 879: Ledger files drift stale after Review Console / Ledger Phase 2 resolves items post-hoc

## Current State

Six pipeline runs' local `docs/plans/*-ledger.md` files were found holding 20 items marked `open`, but every one of those runs had already resolved them — via the Multi-Spec/Consolidated Review Console, Ledger Phase 2 backlog-routing, or a merged follow-up PR — with the resolution logged only to that run's `decisions.md`. Nothing in `/claude-tweaks:wrap-up`, the Review Console, or Ledger Phase 2 writes the resolution back to the ledger file's own Status column, so a ledger can sit indefinitely claiming open items that are actually done. Manually verified and corrected across 6 ledgers (2026-08-18): 19 items were stale (fixed commits, closed backlog issues #564/#565, merged PRs #542/#609/#618/#698/#792, or a self-corrected misdiagnosis logged in the same run's decisions.md); 1 was a genuine still-open blocker (#276 AC4, blocked on open issue #213).

## Deliverables

- Identify every point where a ledger item's resolution is decided but not written back to the ledger file (Review Console apply step, Ledger Phase 2 backlog-routing, any post-hoc fix landing after the console closed)
- Make the ledger file the write target at each of those points, not just `decisions.md` — same status/resolution text, same terminal-status rules from `_shared/ledger-format.md`
- Cover the specific patterns observed: (1) a staged review/reflect finding applied at the console, (2) an item auto-routed to backlog and later closed, (3) a low-confidence finding deliberately left open for human attention that gets fixed in a later, separate PR, (4) an item resolved by a misdiagnosis correction recorded elsewhere in the same run

## Acceptance Criteria

- A ledger item resolved by the Review Console or Ledger Phase 2 is terminal in the ledger file itself by the time that step completes — not just in `decisions.md`
- The "fixed in a later, separate PR" case doesn't need live auto-sync (inherently post-hoc), but `/claude-tweaks:ledger resolve` gets a re-check step so a human doesn't spend a Phase 2 decision on an item that's already externally resolved
- Test coverage proving a console-applied finding lands as `fixed` in the ledger file itself, not only in `decisions.md`

_Filed by `capture` via specShapedBody._
