---
record: 179
origin: human
risk: low
size: low
ceremony: fast-lane
grants: [build]
fingerprint: research-verification-phase:sweep-cross-references-for-research-new-lifecycle-position
blocked-by: [176, 177, 178, 153, 106]
surface: backend
---
# 179: Sweep cross-references for /research new lifecycle position

Surface: backend
Parent: #175
Blocked by #176: describes the lifecycle position that leaf establishes
Blocked by #177: describes the registry that leaf establishes
Blocked by #178: describes the brief vocabulary that leaf establishes
Blocked by #153
Blocked by #106

## Overview

`/claude-tweaks:research` currently documents its own unwiring as deliberate. Its diagram states, verbatim at `skills/research/SKILL.md:20`, that "none of these invoke /research from a numbered Workflow step; a human or the caller's own judgment decides to run it." Once `verify` mode is reachable from the pre-design path, that sentence is false.

This is the `[IL-93]` shape exactly: a claim that was true when written, goes silently stale when the mechanism widens, and cannot be found by searching for the new feature's keywords — the defect is that the old prose says nothing about it. This leaf sweeps every place that describes `/research`'s reach and brings it to the new state.

**Complexity:** Low
**Estimated tasks:** 4

## Non-Goals

- Any behavior change. This leaf edits descriptions of behavior the sibling leaves deliver.
- Rewriting `docs/skill-graph.md`'s format or conventions — only `/research`'s own edges change.
- Touching the `/challenge` → `/superpowers:brainstorming` edge semantics beyond recording that verification now sits between them.

## Current State

- `skills/research/SKILL.md:16-23` — the fenced diagram and the "none of these invoke" sentence at `:20`. Note `tests/skill-conventions.test.js`'s diagram check requires a fenced block within 15 lines of the H1 for skills outside the linear-diagram set; the diagram must stay, only its content changes.
- `docs/skill-graph.md:51` — "`/research` is autonomous multi-source web research", both-utility-skills framing.
- `docs/skill-graph.md:79` — under `## challenge`: "invoke `/research` when a backlog record needs evidence before specifying."
- `docs/skill-graph.md:264` — under `## help`: "`/research` has no fixed lifecycle position."
- `docs/skill-graph.md:310` — under `## specify`: "Prior-art lookup before authoring a record." `grep -rn "research" skills/specify/` currently returns nothing — the edge is recorded but not wired.
- `README.md`, `skills/help/SKILL.md`, `skills/help/reference-card.md`, `docs/getting-started.md` — all reference `/research`.
- CLAUDE.md — skill inventory and the cross-references convention.

## Deliverables

- [ ] `skills/research/SKILL.md`'s diagram no longer claims no skill invokes it from a numbered Workflow step; it names the `/challenge` → verify → brainstorming position.
- [ ] `docs/skill-graph.md` `/research` edges updated at every occurrence — `:51`, `:79`, `:264`, `:310` — distinguishing the still-advisory web-survey edges from the now-wired verify edge.
- [ ] `docs/skill-graph.md:310`'s specify↔research edge corrected to describe what actually happens after the sibling leaves land.
- [ ] `README.md` and `/help` (`skills/help/SKILL.md`, `skills/help/reference-card.md`) reflect the new lifecycle position.
- [ ] `tests/research/cross-refs.test.js` asserts the stale sentence is gone and the new edges resolve.

## Acceptance Criteria

1. A whitespace-flexible, case-insensitive grep across `skills/` and `docs/` for the phrase "none of these invoke" returns zero lines outside this leaf's own record.
2. Every `/research` row in `docs/skill-graph.md` describes the post-change state; no row still asserts an unqualified "no fixed lifecycle position" for the verify path.
3. `grep -rn "research" skills/specify/` returns at least one line, so `skill-graph.md:310`'s claimed edge is real rather than aspirational.
4. `/help`'s workflow diagrams list `/research` in its lifecycle position, satisfying CLAUDE.md's "workflow diagrams in `/help` must list all skills".
5. `skills/research/SKILL.md` still opens with a fenced block within 15 lines of its H1 — `node --test tests/skill-conventions.test.js` passes.
6. `node --test tests/` passes in full.

## Technical Approach

Sweep the structural pattern, not the keyword. Searching for "verify" finds only files that already mention it and cannot find a file whose defect is total silence about the new reach (`[IL-15]`). The searchable invariant here is prose describing `/research`'s *position* — "no fixed lifecycle position", "utility skill", "a human decides to run it".

### Key Files

- `skills/research/SKILL.md` — modify: diagram content at `:16-23`
- `docs/skill-graph.md` — modify: `/research` edges at `:51`, `:79`, `:264`, `:310`
- `README.md` — modify: skill inventory / lifecycle
- `skills/help/SKILL.md`, `skills/help/reference-card.md` — modify: workflow diagram + reference card
- `docs/getting-started.md` — modify: `/research` mention
- `tests/research/cross-refs.test.js` — modify: staleness assertions

## Gotchas

- `Blocked by` #153 and #106 — both also edit `docs/skill-graph.md` and `CLAUDE.md`. Not in-progress at decomposition time, but land after them or expect conflicts on shared files.
- Do not write the "prove the removed sentence is gone" sweep without excluding this record and any plan document — a record documenting the removal necessarily quotes the sentence verbatim (`[IL-28]`).
- `grep -rli PATTERN . | grep -v "^./path"` silently matches nothing: `grep -rli … .` returns paths without a leading `./`. Anchor to the bare relative path (`[IL-39]`).
- Correcting the first occurrence is not the fix; the same claim recurs reworded (`[IL-17]`).
- Widening an enforcement mechanism without sweeping the prose describing its old reach is exactly `[IL-93]` — those claims were true when written, so nothing contradicts them.
- Read the rendered result around each markdown insertion, not just the diff — next to a fenced block a stray sentence lands *inside* the fence (`[IL-27]`).


<!-- work-fingerprint: research-verification-phase:sweep-cross-references-for-research-new-lifecycle-position -->
