---
record: 386
origin: human
risk: low
size: low
ceremony: fast-lane
grants: [build, merge]
fingerprint: design-craft-integration:explore-mode-variant-renderers-consume-the-craft-contract
blocked-by: [383, 377, 378]
surface: backend
---
# 386: Explore-mode variant renderers consume the craft contract

Surface: backend

## Overview

Amend the explore-mode variant renderers (#377 identity scope, #378 layout scope) to assemble their design context per the craft contract (`skills/_shared/design-craft.md`, #383). A tournament of flat renders tests the worlds unfairly — variants carrying Emil-grade craft produce variations worth choosing between. Identity scope: principles + the dealt world's description (no `DESIGN.md` exists yet, by definition). Layout scope: locked decisions (`DESIGN.md` + sidecar) + principles.

This is a coordinated, additive amendment to an in-flight family: coordination comments referencing the consumed design were posted on #377 and #378 on 2026-08-14, so the building session can adopt the contract directly. No acknowledgment from that session is expected or required — verification at pickup (Deliverable 3) is the adoption-check mechanism.

**Complexity:** Low
**Estimated tasks:** 3

## Non-Goals

- No change to explore mode's own semantics — dealing, reroll/steer, scope resolution, lock-in, and artifact lifecycle stay exactly as #376's design states.
- No change to `skills/design-wrapper/SKILL.md` (owned by the family's own sub-issues).
- No craft context for the comparison/switcher page or the verdict flow — only the variant-renderer dispatch prompts.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #383 | Design craft contract: decisions vs principles assembly for UI-writing dispatches | open |
| #377 | design-wrapper explore mode: identity scope (genesis worlds tournament) | open |
| #378 | design-wrapper explore mode: layout scope (established-world composition tournament) | open |

**Pickup gate — the observable signal:** this record is buildable only when #377, #378, and #383 are all **closed**. The Blocked-by links are metadata read by the pipeline's authorization/dispatch checks and by humans — they are not self-enforcing; the closed-state check above is the actual gate, and whoever picks this record verifies it first.

## Current State

- #377/#378 create `skills/design-wrapper/modes/explore.md` with variant rendering fanned out as parallel subagents under the Subagent Contract (identity: one markup, N world skins; layout: one identity, N markups). Being built in a parallel session (worktree `explore-mode-design`) at spec time — their final scope may differ from this snapshot; re-verify at pickup.
- Coordination comments on #377 (identity: principles + dealt world) and #378 (layout: decisions + principles) already describe the exact assembly each scope needs.
- `skills/_shared/design-craft.md` (#383) — the assembly procedure this sub-issue applies.

## Deliverables

- [ ] `skills/design-wrapper/modes/explore.md`: the identity-scope renderer dispatch prompts assemble the principles layer per `_shared/design-craft.md` (assembled at composition time and inlined into each renderer's prompt per the Subagent Contract) alongside the dealt world's description; no `DESIGN.md`/sidecar read is added to this scope.
- [ ] Same file: the layout-scope renderer dispatch prompts assemble decisions (`DESIGN.md` + sidecar `.impeccable/design.json`) plus the principles layer, per the contract.
- [ ] Adoption check at pickup: if `modes/explore.md` already references the contract (the building session adopted the posted comments), verify the actual assembly against the two deliverables above — not just citation presence: the identity-scope procedure must name the principles sources and the dealt world and read no decisions; the layout-scope procedure must name both decision sources plus principles. On full match, close this sub-issue with a verification note listing what was checked; on partial match, edit the gaps only.

## Acceptance Criteria

1. `grep -n "design-craft" skills/design-wrapper/modes/explore.md` shows the contract cited in both scopes' renderer dispatch sections; assembly logic is not restated (reference + assemble-at-composition-time, same pattern as `pre-build`).
2. The identity-scope renderer procedure contains no `DESIGN.md` or sidecar read, and its assembled context names the principles sources per the contract's relevance map (semantic check against the merged #383, not just string presence).
3. The layout-scope renderer procedure includes the sidecar (`.impeccable/design.json`) alongside `DESIGN.md`, plus the principles layer.
4. `git diff --stat` touches only `skills/design-wrapper/modes/explore.md` (or, in the verified-no-op case, nothing — with the verification recorded in this sub-issue's closing comment, naming the checks from Deliverable 3).

## Technical Approach

Additive prose in the renderer dispatch-prompt sections of a file another sub-issue family creates. Sequenced strictly after #377/#378/#383 close — never a racing edit against the `explore-mode-design` worktree.

### Key Files

- `skills/design-wrapper/modes/explore.md` — renderer dispatch prompts, both scopes

## Gotchas

- Never race the live session: the family's worktree (`explore-mode-design`) is locked and active at spec time. The pickup gate above (all three prerequisites closed) is the real sequencing mechanism — Blocked-by metadata alone enforces nothing.
- The renderers' craft content must be inlined into each renderer subagent's prompt — a reference to `_shared/design-craft.md` inside a dispatched prompt never reaches the agent (Subagent Contract).
- "Explore renders are web by construction, so no native-track branch is needed" is contingent on #377/#378's final merged scope — re-verify that claim at pickup; if the family shipped a native-render path, this record's scope question reopens and the gap goes back through `/claude-tweaks:capture`.


<!-- work-fingerprint: design-craft-integration:explore-mode-variant-renderers-consume-the-craft-contract -->
