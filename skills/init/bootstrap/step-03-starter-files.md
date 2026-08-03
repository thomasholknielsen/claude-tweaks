# Step 3 — Starter files (detailed content)

*Core Bootstrap step (Steps 1-8). Order-dependent — later steps may assume earlier ones completed. Runs unconditionally and idempotently: only acts on missing state. Gated by the Core Bootstrap Version Check (`version-check.md` in this directory).*

Create these **only if missing** — never overwrite existing content. Idempotent and safe to skip on Update Mode runs.

No starter directory is needed for backlog work records — under `work-backend: github-issues` they live on the tracker; under `work-backend: local-files` `local-store.js` writes them directly as flat `specs/{n}-{slug}.md` files (no subdirectory to pre-create) as `/claude-tweaks:capture` and `/claude-tweaks:tidy`'s Defer action file them. `specs/` itself is already created by Step 2.

**`specs/INDEX.md`:**

```markdown
# Spec Index

Tiered roadmap of work units. Use `/claude-tweaks:specify` to add specs, `/claude-tweaks:help` to see what's ready to build.

## Tier 1 — Critical Path

| Spec | Title | Status | Blocked By |
|------|-------|--------|------------|
| — | — | — | — |

## Tier 2 — High Value

| Spec | Title | Status | Blocked By |
|------|-------|--------|------------|
| — | — | — | — |

## Tier 3 — Differentiators

| Spec | Title | Status | Blocked By |
|------|-------|--------|------------|
| — | — | — | — |
```
