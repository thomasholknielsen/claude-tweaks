# Step 2 — Create Directory Structure (detailed procedure)

*Core Bootstrap step (Steps 1-8). Order-dependent — later steps may assume earlier ones completed. Runs unconditionally and idempotently: only acts on missing state. Gated by the Core Bootstrap Version Check (`version-check.md` in this directory).*

Check and create the required directories (only create what's missing):

```
specs/                      → Spec files; also backlog work records when work-backend: local-files (flat specs/{n}-{slug}.md, local-store.js)
docs/                       → Documentation root (REGISTRY.md created in Phase 8.5)
docs/superpowers/specs/     → Design docs (from /superpowers:brainstorming)
docs/superpowers/plans/     → Execution plans (from /superpowers:writing-plans)
docs/plans/                 → Claude-tweaks pipeline state (briefs, ledger, audit/recommendations caches)
docs/journeys/              → User and developer journey files (created by /journeys, tested by /visual-review)
.claude/skills/             → Skill files (should already exist if this skill is running)
```
