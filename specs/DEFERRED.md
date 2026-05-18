# Deferred Work

## Contract-conformance test infrastructure

**Origin:** 2026-05-18 audit-and-fix reflection (`/claude-tweaks:reflect` Step 3, full mode)
**Trigger:** When the next round of fleet-wide skill drift surfaces, or when a new contributor adds a skill that violates the conventions.

Three conventions are documented in `CLAUDE.md` but have no mechanical enforcement, so drift accumulates silently between audits:

1. **Section ordering.** `## Next Actions` must precede `## Component-Skill Contract` / `## Anti-Patterns` / `## Relationship to Other Skills`. Drift hit 14 of 21 skills before the 2026-05-18 audit. A `tests/skills/section-order.test.js` that greps each SKILL.md and asserts heading order would catch this at write-time.

2. **Auto-mode contract single source of truth.** `_shared/auto-mode-contract.md` is documented as canonical, but `/build`, `/test`, and `/review` each grew local silencing semantics that drifted from it. A test that greps for per-skill silences tables outside `_shared/` and fails on match would enforce single-source.

3. **Pipeline run-dir naming.** `find -name "*${SPEC_SLUG}*"` patterns assume `spec-` prefixed slugs to avoid timestamp collisions. The convention now lives in `_shared/pipeline-run-dir.md` but isn't validated. A test asserting every multi-spec dir example in flow's sub-files uses the prefix would prevent the regression.

All three are small grep-based assertions over markdown files — likely <30 lines of Node test code combined. Bundle as one PR when ready.

**Why deferred:** the 2026-05-18 audit cycle just landed contract changes that may need to settle before being locked in by tests. Revisit after the next /flow pipeline run exercises the changes end-to-end.
