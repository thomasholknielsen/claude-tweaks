---
record: 276
origin: human
risk: low
size: medium
ceremony: standard
grants: [build]
fingerprint: 2026-08-09-self-maintaining-fleet-design:routine-fleet-status-and-off-aggregated-posture-dashboard-an
surface: backend
---
# 276: routine fleet status and off: aggregated posture dashboard and pause-based shutdown

Surface: backend
Parent: #265

Blocked by #275: assumes the fleet marker convention and the reconcile round-trip contract as landed
Blocked by #213

## Overview

The fleet switch's observability and shutdown half: `fleet status` — one screen answering "what did my codebase do to itself this week" — and `fleet off` — pause-based shutdown that preserves all durable state. Status aggregates per-routine STATUS (existing `skills/routine/status.md` machinery) plus the trust table and the loop's counters: firings, findings filed, grants issued split human/machine, merges, revocations. Off pauses every fleet-marked routine rather than deleting, so rotation cursors, wontfix suppressions, and trust history survive a temporary shutdown; it depends on #213 (the pause verb `/routine` currently lacks).

Also carries the program's outward documentation: `/help` placement, README lifecycle diagram, skill-graph edges. Decision rationale on parent #265.

**Complexity:** Medium
**Estimated tasks:** 6

## Non-Goals

- Provisioning/reconcile (`fleet on`, companion leaf).
- Implementing the pause verb itself — that is #213's record; this leaf consumes it.
- New metrics infrastructure — counters derive from existing durable sources (tracker queries, auto-decision logs, trust reads); no new state files.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #275 | fleet on | this decomposition — the marker + composition this leaf enumerates |
| #213 | /routine has no pause action | open — `fleet off` requires pause-not-delete; if #213 lands differently (e.g. platform adds native pause), consume whatever shipped |

## Current State

- `skills/routine/status.md` — per-routine STATUS procedure; the aggregation loops it over fleet-marked routines.
- Trust table rendering: `/claude-tweaks:backlog overview` and `/claude-tweaks:help` already render trust read-only — reuse that rendering path, don't fork a third (IL-32).
- Counter sources: grants + origins are label/comment queries over the tracker (`gh issue list` + `parseRecordFacets`, the audit-comment markers from the grant leaves); firings come from routine STATUS; revocations from trust reads (negative evidence with the failure/revert sources).
- `/help` (`skills/help/`) — workflow diagrams must list all skills (CLAUDE.md cross-reference rule); README.md carries the artifact lifecycle diagram that must stay in sync with `/help`'s.

## Deliverables

- [ ] `skills/routine/fleet.md` (status/off sections): status aggregation — fleet-marked routine table (name, schedule, last firing, health), trust table (reused rendering), and the weekly counters with each counter's source named inline; renders cleanly when the fleet is partially provisioned. **"Weekly" is defined: a rolling 7×24h window ending at render time, boundaries computed from full ISO datetimes (IL-47).** **Posture taxonomy, defined here since status reports it: `supervised` fleet = no grant routine provisioned (or unattended keys unset); `unattended` fleet = grant routine present and both unattended keys true — detected from the provisioned set plus policy, and a supervised-posture render shows no grant counters and states why.** Counter sources, concrete: grants from the audit-comment markers **whose shape #269 defines** (read its landed marker, don't re-derive) split human/machine by marker presence; firings from per-routine STATUS; merges from closed records with merged closing commits in-window; revocations from trust reads — negative-evidence outcomes (failure-classification markers and detected reverts) whose evidence entered the window, counted per class-downgrade event, not per marker.
- [ ] `fleet off`: enumerate fleet-marked routines, pause each via #213's landed verb, report the paused set + what state survives; explicitly never deletes, and never touches non-fleet routines. A repo with no fleet-marked routines reports that plainly (not an error).
- [ ] `/help` placement: fleet status as a first-class surface in the reference card and workflow diagram; artifact-lifecycle diagram updated in BOTH `/help` and README.md (the two-copy sync rule).
- [ ] `docs/skill-graph.md`: status/off edges (fleet→status machinery, fleet→trust rendering, fleet off→#213 pause).
- [ ] Counter honesty: each counter states its enumeration source and its blind spots (e.g. grants counted from audit comments cannot see pre-feature history) — never a total over a domain the lookup can't enumerate (IL-110, IL-67).

## Acceptance Criteria

1. `fleet status` against a fixture/dry state with two fleet routines, one machine grant, one human grant, and one revocation renders all three counter groups with the human/machine split correct — the machine grant identified by the audit-comment marker, not by guessing from label history.
2. `fleet status` on a supervised-only fleet renders without grant-unit rows and states the posture.
3. `fleet off` pauses exactly the fleet-marked set — a hand-created routine sharing a skill is untouched; asserted in the procedure's own verification step (list before/after).
4. `fleet off` then `fleet on` round-trips: reconcile detects the paused fleet, resumes/updates rather than duplicating. **The shared contract lives in `fleet.md` itself** — the marker and paused-state semantics both leaves consume are documented there by the companion leaf, and this AC is verified against that landed section plus a live round-trip, never against this record's assumption alone.
5. `/help`'s diagram and README's diagram both contain the fleet surface — checked as two separate assertions (the sync rule's known drift mode is fixing one copy, IL-77-adjacent). The exact `/help` file carrying the workflow diagram is located at build (reference-card.md or context-flow.md — whichever holds it then).
6. The #213-wontfix fallback is a tested path, not an escape hatch: with no pause verb available, `fleet off` reports the deletion-vs-keep tradeoff per routine and performs no destructive action — asserted as its own scenario alongside AC3's pause path.

## Technical Approach

Skill prose over existing machinery, with one exception made **required**: counter derivation extracts to a `bin/lib/` flat module with its own fixture suite — that is what makes AC1 an automated test rather than a narrated walkthrough. The trust table render must call the same path `backlog overview` uses; the extraction trigger is concrete — if reuse would mean replicating more than ~30 lines of backlog-local prose into fleet.md, extract the render to `bin/lib/issues/` first (shared logic gets one home, bugs get fixed once). "Mode wiring completion" in Key Files means specifically: the `status`/`off` argument rows in routine SKILL.md's mode table plus their Next Actions entries — the `on` row lands with the companion leaf.

### Data / API Surface

- None new beyond optional counter-derivation extraction.

### Key Files

- `skills/routine/fleet.md` — status/off sections
- `skills/routine/SKILL.md` — mode wiring completion
- `skills/help/reference-card.md` + the workflow diagram file — fleet placement
- `README.md` — lifecycle diagram
- `docs/skill-graph.md` — edges

### Package Dependencies

- None new.

## Gotchas

- #213's landed shape is unknowable from here — the off procedure must be written against whatever pause mechanism shipped, and if #213 closed as wontfix, this leaf's off falls back to reporting the deletion-vs-keep tradeoff to the human instead of pausing silently (fail loud, never delete by default: deletion destroys billed-infrastructure state that IL-69 says must have a decided owner).
- Counters derived from `gh issue list` queries share the search-index lag the record-creation path documents — derive from the REST list, not `--search` (the same trap Step 3's idempotency map avoids).
- The weekly window needs a time anchor — compute from full ISO datetimes, never a date-only `--since` boundary (IL-47).
- Two-diagram sync (help + README) is the exact two-copy drift CLAUDE.md's cross-reference section warns about — treat both edits as one task, not two.
- Re-verify #213's state and I's landed marker convention immediately before building (IL-109).


<!-- work-fingerprint: 2026-08-09-self-maintaining-fleet-design:routine-fleet-status-and-off-aggregated-posture-dashboard-an -->

## Blocked / Future Work

- **AC4's live round-trip half is blocked on #213.** With no pause verb landed, `fleet off` never pauses anything, so an off→on live round-trip cannot be exercised — the fallback path (AC6) is the tested live path instead. The marker-semantics half of AC4 is verified against fleet.md Step 4.2; the paused-state half becomes testable when #213 ships a pause mechanism. Unblocks: #213 landing (any shape); then run a live off→on round-trip and extend fleet.md's pause path against the landed verb.
