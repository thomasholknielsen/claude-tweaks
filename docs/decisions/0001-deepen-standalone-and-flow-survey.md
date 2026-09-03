# 0001. Deepen is a standalone analysis-only skill, surfaced via a flow survey

- **Status:** accepted
- **Date:** 2026-06-14
- **Context:** Architectural-depth integration drawn from the Matt Pocock skills teardown (`improve-codebase-architecture`)

## Context

The plugin had no module-level architectural review — `/simplify` works at the line level and `/review` lens 3e is a generic checklist. We wanted to add depth-as-leverage analysis (find shallow modules, propose deepening or collapsing). Two questions had to be settled: (1) where the capability lives, and (2) how `/flow`, which runs hands-off, captures its value without doing something irresponsible.

## Decision

`/claude-tweaks:deepen` is a **standalone component skill** (not merged into `/simplify`, not a `/review` mode). Its core loop is two-stage and interactive: present leverage-ranked candidates, then design the interface only for the ones the user picks.

`/flow` captures the value by invoking `/deepen` in an **analysis-only** path at the Pipeline Summary (mirroring the Creative Opportunities survey): it runs the read-only analysis automatically and renders a Depth Opportunities recommendation block, but **never applies a refactor**. The user runs `/deepen` deliberately to act.

## Alternatives considered

- **Merge into `/simplify`** — rejected. The two have opposite contracts: `/simplify` is automatic, behavior-preserving, applies in every build; `/deepen` is interactive, low-reversibility, must stage-not-apply in auto. Merging forces those opposites into one skill as mode-branching and corrupts simplify's clean auto-apply model — the dangerous failure being an architecture refactor auto-applied "because simplify always runs."
- **A `/review deepen` mode** — rejected *for now*, but the weakest point of this decision and explicitly revisitable. `/review` is a gate, not a refactoring tool, so the two-stage apply loop sits awkwardly there. If the skill count starts feeling heavy, collapsing `/deepen` into a `/review` mode is the fallback — file it as a backlog work record via `/claude-tweaks:capture` if revisited (this project's backlog now lives in GitHub issues, not a `specs/INBOX.md` file).
- **Detection-only, no dedicated skill** (lens flags shallow modules, human refactors freehand) — rejected. Loses the enforced discipline (deletion test, leverage ranking, stage-don't-apply) that is the whole point.
- **A full `deepen` pipeline step in `/flow`** — rejected. It could only ever stage in a hands-off run (Step 4 is interactive), adding latency for no applied work.

## Consequences

- Adds a skill adjacent to `/simplify`; the boundary is "line-level vs module-level," recorded once as an edge in `docs/skill-graph.md` (the per-skill relationship-table convention this line originally described was removed project-wide in v6.34.0).
- Clean separation of the auto-apply (simplify) and stage-only (deepen) contracts — no reversibility-floor violations.
- `/flow` stays responsible in auto: analysis runs, action is deliberate. The Creative Opportunities survey is the canonical precedent for this "auto-analyze, manual-act" pattern.
- Revisit trigger: if total skill count or the simplify/deepen adjacency becomes confusing, convert `/deepen` to a `/review deepen` mode (the discipline survives the move).
