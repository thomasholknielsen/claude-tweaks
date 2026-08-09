# Plan — #242: ADR 0001 Consequences staleness fix

Spec: `.claude-tweaks/pipelines/2026-08-09T092310-spec-242-243-115-180/spec-242/work/242-spec.md`

## Task 1: Replace the stale relationship-tables reference

**Files:** `docs/decisions/0001-deepen-standalone-and-flow-survey.md` (line 26)

Replace the exact line:

```
- Adds a skill adjacent to `/simplify`; the boundary is "line-level vs module-level," reinforced in both skills' relationship tables.
```

with:

```
- Adds a skill adjacent to `/simplify`; the boundary is "line-level vs module-level," recorded once as an edge in `docs/skill-graph.md` (the per-skill relationship-table convention this line originally described was removed project-wide in v6.34.0).
```

Verification: `grep -c "relationship tables" docs/decisions/0001-deepen-standalone-and-flow-survey.md` returns 0; `grep -c "skill-graph.md" docs/decisions/0001-deepen-standalone-and-flow-survey.md` returns ≥1.
