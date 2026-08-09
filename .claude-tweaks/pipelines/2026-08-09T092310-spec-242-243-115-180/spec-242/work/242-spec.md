---
record: 242
origin: docs-health
risk: low
effort: low
ceremony: fast-lane
grants: [build]
fingerprint: docshealth-4b8c4387
---
# 242: Doc staleness: decisions/0001-deepen-standalone-and-flow-survey — Consequences

**Doc:** decisions/0001-deepen-standalone-and-flow-survey | **Section:** Consequences | **Category:** staleness | **Misleads:** human engineer + coding agent | **Classification:** additive | **Confidence:** high

## Current State

The line asserts the /simplify-/deepen boundary is 'reinforced in both skills' relationship tables.' That convention was removed project-wide in v6.34.0 (CLAUDE.md: 'Skills do not carry a Relationship to Other Skills table. That convention was removed in v6.34.0 — every edge is recorded once in docs/skill-graph.md instead.'). Confirmed live: skills/deepen/SKILL.md and skills/simplify/SKILL.md carry no Relationship section (grep for 'relationship' in deepen/SKILL.md returns nothing), while docs/skill-graph.md line 310 now states the exact boundary this line describes ('/simplify cleans up within files (line-level complexity), /deepen restructures across module interfaces (depth/leverage)'). A reader or agent following this ADR literally would look for a table that no longer exists in either skill file.

## Deliverables

**Current:**
```
- Adds a skill adjacent to `/simplify`; the boundary is "line-level vs module-level," reinforced in both skills' relationship tables.
```

**Proposed:**
```
- Adds a skill adjacent to `/simplify`; the boundary is "line-level vs module-level," recorded once as an edge in `docs/skill-graph.md` (the per-skill relationship-table convention this line originally described was removed project-wide in v6.34.0).
```

## Acceptance Criteria

Replace the stale reference to per-skill "relationship tables" with a reference to `docs/skill-graph.md`, which is where this boundary is now recorded.

_Filed by `/claude-tweaks:docs-health`. Close to resolve; label `wontfix` to suppress future reports of this finding._

<!-- work-fingerprint: docshealth-4b8c4387 -->
