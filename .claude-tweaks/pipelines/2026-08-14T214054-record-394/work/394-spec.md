---
record: 394
origin: capture
risk: medium
size: medium
ceremony: standard
grants: [build, merge]
surface: backend
---
# 394: Trim 13 frontmatter descriptions and add a frontmatter budget to context-cost.js

Surface: backend

## Current State

The 33 skill frontmatter descriptions total 10,455 chars (~2.6k tokens), loaded into every session of every project with the plugin enabled. Thirteen carry body content — procedure summaries, architecture notes, negative-scope clauses, full enumerations (`visualize` lists all 15 diagram types in the description and again in `argument-hint`). Worst offenders (chars): docs-health 812, assess-agent-autonomy 706, harness-health 593, demo 549, journey-health 527, backlog 496, visualize 426, research 404, code-health 402, dispatch 399, stories 385, deepen 372, routine 355. No enforcement exists: `bin/lib/skill-audit/context-cost.js` checks the 40KB SKILL.md ceiling only. Precedents: #233 (CLAUDE.md shrink + ceiling test), #336 (early-warning tier, open).

## Deliverables

- Rewrite the 13 descriptions to a ~200-char working ceiling, preserving each trigger clause and the full Keywords list; boundary-drawing and mechanism notes move into the body where not already stated there.
- Add a frontmatter description budget check to `context-cost.js` plus its test; align with #336's early-warning direction where trivially compatible.

## Acceptance Criteria

- Total description chars ≤ ~6,000; no single description exceeds ~260 chars (asserted by the new test, not by hand).
- Every trimmed description still answers when-to-use and keeps every Keywords token unless demonstrably redundant.
- `npm test` passes including the new budget test.

## Technical Approach

Trim per the audit's per-skill cut list (drop implementation detail, negative-scope clauses, and enumerations; keep trigger phrasing). The four health-sweep descriptions currently spend 2,334 chars (22% of the corpus budget) — trim them uniformly since their shared phrasing is part of the waste.

## Gotchas

- Descriptions are the skill-selection surface: a lost keyword can stop a skill from firing. Trim prose, never Keywords.
- #393 (dispatch YAML truncation) edits the same dispatch description line — land #393 first or fold its one-line fix here; don't collide.
- The deepen and version descriptions also churn under #397/#398 — file-overlap grouping at dispatch will serialize these; if built manually, sequence this record last among the three.

## Original request

Trim 13 frontmatter descriptions and add a frontmatter budget to context-cost.js

**Related:** #336, #233

Context: Bloat audit: the 33 descriptions total 10,455 chars (~2.6k tokens) loaded into every session of every project; 13 carry body content (procedure summaries, architecture, negative-scope clauses, full enumerations) — worst is docs-health at 812 chars. No enforcement exists: context-cost.js checks SKILL.md bytes only.

Scope: ~200-char working ceiling (10.5k → ~5.5k) preserving trigger clauses + keyword lists; add the budget check to bin/lib/skill-audit/context-cost.js.
