---
record: 385
origin: human
risk: low
size: low
ceremony: standard
grants: []
fingerprint: design-craft-integration:craft-context-consumers-flow-polish-visual-review-fix-path-a
blocked-by: [383]
surface: backend
---
# 385: Craft-context consumers: flow polish, visual-review fix path, and docs

Surface: backend

## Overview

Wire the two remaining code-modifying dispatch sites to the craft contract (`skills/_shared/design-craft.md`, #383), and update user-facing docs. `/flow`'s polish phase and `/visual-review`'s standalone code-modifying paths compose work for agents (or direct in-session edits) that change UI code — today neither carries design-engineering principles. Also fixes a known stale count in `docs/getting-started.md` while touching its design section.

**Build after #383 merges** (native Blocked-by link recorded); at pickup, verify the citation pattern against #383's merged file rather than this record's assumptions.

**Complexity:** Low
**Estimated tasks:** 4

## Non-Goals

- No change to `pre-build` (#384 owns it) or to explore-mode renderers (#386 owns those).
- No change to polish's stop-the-pipeline error posture, its decision-log entries, or its one-cycle re-verify cap.
- No change to visual-review's read-only default — only the two existing standalone-only, consent-gated code-modifying paths gain craft context; parent-invoked visual-review is untouched.
- No new edges restated outside `docs/skill-graph.md` (#383 already records the consumer edges).

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #383 | Design craft contract: decisions vs principles assembly for UI-writing dispatches | open — build after it lands |

## Current State

- `skills/flow/polish-execution.md` — one composition procedure covering both the refinement-set and intent-driven Impeccable command dispatches; writes `AUTO`/`STAGED` decision-log entries and `staged/polish-suggestion-{n}.md`. The run's `Design-intent:` value is available from the materialized record header (`/flow`'s materialize step lifts the `Design-intent:` body-metadata line, per `skills/flow/materialize.md`).
- `skills/visual-review/standalone-followup.md` — the standalone-only apply gate (Step 4) and Step 5 Boost gate; both code-modifying options re-verify via `/test skip-qa`. These paths may apply changes directly in-session rather than dispatching a subagent.
- `docs/getting-started.md` — user-facing description of the polish phase and Creative Opportunities; its design-wrapper mode count ("Seven active modes") predates the `doctor`/`reset-recommendations` additions and is stale.
- `skills/_shared/design-craft.md` (#383) — assembly procedure and relevance map.

## Deliverables

- [ ] `skills/flow/polish-execution.md`: one short instruction in the composition procedure (a single citation — the file has one composition site covering both dispatch kinds) directing the composer to assemble craft context per `_shared/design-craft.md` **at runtime** and inline the assembled result into what the executing agent receives. The static file carries only the citation instruction; no assembly logic (lookup order, relevance triggers) is restated. Motion-scoped Emil skills (`animate`, `animation-vocabulary`) ride along exactly when the materialized header's `Design-intent:` includes `delightful`; when the header carries no `Design-intent:`, the motion add-on is skipped — the ambient baseline still applies.
- [ ] `skills/visual-review/standalone-followup.md`: one short instruction per code-modifying gate (two citations in this file — one adjacent to the Step 4 apply gate, one adjacent to Step 5 Boost's "Fix flagged issues" option). For a path that dispatches an agent, the assembled content is inlined into the dispatch prompt (Subagent Contract — agents can't follow references); for a path that applies fixes directly in-session, the composer assembles the same context into its own working context before editing. Step 5 Boost's "Explore alternatives" option (a delegation to `live` mode that processes no outcome) gets nothing.
- [ ] `docs/getting-started.md`: add a short "craft layer" paragraph to the design section (decisions vs principles in one breath, pointer to the contract); replace the stale "Seven active modes" phrasing with **count-free phrasing** (e.g. "the modes listed below") — count-free is the requirement, not a preference, per the cardinality rule; a re-hardcoded number fails AC 2.

## Acceptance Criteria

1. `grep -c "design-craft" skills/flow/polish-execution.md` returns 1; `grep -c "design-craft" skills/visual-review/standalone-followup.md` returns 2 (one adjacent to each code-modifying gate). No assembly logic (lookup order, relevance triggers) is restated in either file.
2. `docs/getting-started.md` no longer contains the string "Seven active modes" and states no literal mode count at all — the phrasing is count-free.
3. `git diff --stat` touches only `skills/flow/polish-execution.md`, `skills/visual-review/standalone-followup.md`, and `docs/getting-started.md`.
4. Polish's error posture, decision-log entry formats, and staged-file paths are byte-unchanged (diff in that file shows only the craft-context instruction, inserted as its own self-contained sentence/paragraph).
5. Visual-review's re-verify gate (`/test skip-qa`), its read-only default, and the Boost gate's option structure are byte-unchanged — the diff in that file shows only the two craft-context instructions.

## Technical Approach

Three small prose additions, each a reference-plus-assemble-at-runtime instruction mirroring how `design-prebuild.md` forwards `pre-build` output: the citation lives in the composing skill's own procedural text; only the assembled result reaches the executing agent. Insert each instruction as its own paragraph so AC 4/5's byte-unchanged checks hold structurally.

### Key Files

- `skills/flow/polish-execution.md` — craft-context instruction in the composition procedure
- `skills/visual-review/standalone-followup.md` — same, both code-modifying gates
- `docs/getting-started.md` — craft-layer paragraph + count-free fix

## Gotchas

- Polish is the pipeline's only code-modifying wrapper mode; its caller re-verifies via `/test skip-qa` — nothing here may weaken or duplicate that re-verify.
- Step 5 Boost's "Explore alternatives" option delegates to `live` mode and does not process outcomes — it gets no craft-context instruction (only the code-modifying options do).
- If #383's merged contract names its sections differently than this record assumes, follow the merged file — the citation is to the contract as shipped, not as speculated here.


<!-- work-fingerprint: design-craft-integration:craft-context-consumers-flow-polish-visual-review-fix-path-a -->
