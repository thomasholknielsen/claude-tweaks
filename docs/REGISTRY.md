# Doc Registry

> Maps documentation to the code areas it covers. Created by /init, maintained by /build and /wrap-up.
> When code matching an Auto-detect pattern changes, the corresponding doc should be reviewed and updated.

## Tier: 3

| Doc | Covers | Auto-detect |
|-----|--------|-------------|
| README.md | Project overview, install, skill index | `.claude-plugin/plugin.json`, `skills/**/SKILL.md` |
| CLAUDE.md | How to work in this codebase — stack, structure, conventions, philosophy, releasing, Don'ts | `.claude-plugin/plugin.json`, `package.json`, `skills/_shared/*.md` |
| docs/getting-started.md | Full skill reference — every `/claude-tweaks:*` command with its behavior | `skills/**/SKILL.md` |
| docs/plugin-structure.md | Directory tree, per-skill sub-file table, command reference | `skills/**/*.md`, `bin/**/*.js` |
| docs/skill-graph.md | Every skill-to-skill relationship/edge (single source of truth) | `skills/**/SKILL.md` |
| docs/donts.md | Full Don'ts rule list (extracted from CLAUDE.md's `## Don'ts`, which now holds only a pointer) | CLAUDE.md `## Don'ts` |
| docs/hooks.md | Hook dispatcher contract — tiered posture, run-dir resolution and ownership, never-break-a-session invariant, consumers (extracted from CLAUDE.md's `### Hooks`, which now holds only a pointer) | `bin/hooks.js`, `bin/lib/hooks/**`, `hooks/hooks.json` |
| docs/incident-log.md | Post-mortems behind each `[IL-nn]`-tagged Don't in CLAUDE.md | CLAUDE.md `## Don'ts`, docs/donts.md |
| docs/shipped-versions.tsv | Authoritative record of every shipped version + date | `.claude-plugin/plugin.json`, `CHANGELOG.md` |
| docs/decisions/*.md | Architecture Decision Records — hard-to-reverse, surprising trade-offs | *(no auto-detect — written deliberately by /wrap-up's ADR gate)* |
| docs/diagrams/*.html | Generated visual diagrams | *(no auto-detect — generated on demand by `/claude-tweaks:visualize`)* |
| docs/journeys/*.md | User/developer journeys backing agent e2e testing | *(no auto-detect — see per-journey `files:` frontmatter instead)* |
| docs/plans/*.md | Per-run pipeline ledgers (spec/record scoping, resolve-gate state) | *(no auto-detect — generated per pipeline run by `/claude-tweaks:ledger`)* |
| docs/superpowers/plans/*.md, docs/superpowers/specs/*.md | Execution plans and design docs produced and consumed by the pipeline (`/superpowers:writing-plans`, `/superpowers:brainstorming`) | *(no auto-detect — generated per run; consumed artifacts are deleted at wrap-up)* |
| docs/skill-authoring.md | Skill-file authoring conventions — structure, frontmatter, interaction patterns, CSC | `skills/**/*.md` |
| docs/releasing.md | Release procedure + judgment calls | `bin/release.js`, `bin/lib/release/**` |
