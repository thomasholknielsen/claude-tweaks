# Specs Index

The durable record of work units. `/claude-tweaks:specify` produces specs from design docs; `/claude-tweaks:build` and `/claude-tweaks:flow` consume them.

## Tiers

| Tier | Meaning |
|------|---------|
| 1 | Must-have / blocks the next capability — the multi-agent coordination work |

(Additional tiers added as the project's roadmap grows.)

## Dependency graph

```
01 (Multi-Agent Coordination Primitive)
 ├── 02 (/review reproduction + cross-lens debate + Wrap-Up Console categorisation)
 ├── 03 (/specify multi-persona red-team)
 └── 04 (/challenge layered MoA)
```

Spec 01 must merge before any of 02 / 03 / 04 can start. Specs 02–04 are logically independent of each other but share one file (`tests/multi-agent-coordination.test.js`); the conservative build order is **01 → 02 → 03 → 04** sequentially via `/claude-tweaks:flow 01,02,03,04` to avoid concurrent test-file conflicts.

## Tier 1

| # | Title | Status | Progress | Blocked By | File |
|---|-------|--------|----------|------------|------|
| 01 | Multi-Agent Coordination Primitive | Complete | 100% | — | [01-multi-agent-coordination-primitive.md](./01-multi-agent-coordination-primitive.md) |
| 02 | /review Reproduction Pairs + Cross-Lens Debate + Wrap-Up Console Categorisation | Not started | 0% | 01 | [02-review-reproduction-and-debate.md](./02-review-reproduction-and-debate.md) |
| 03 | /specify Multi-Persona Red-Team Integration | Not started | 0% | 01 | [03-specify-redteam.md](./03-specify-redteam.md) |
| 04 | /challenge Layered MoA Integration | Not started | 0% | 01 | [04-challenge-moa.md](./04-challenge-moa.md) |

## Implicit dependencies (file-level)

| Specs | Shared file | Resolution |
|-------|-------------|------------|
| 02, 03, 04 | `tests/multi-agent-coordination.test.js` (created by 01; each gate spec adds its integration test block) | Sequential build order recommended. Concurrent builds across these specs will cause merge conflicts at this file — `/flow 02,03,04` serialises by default. |
| 02 | `skills/wrap-up/review-console.md`, `skills/wrap-up/SKILL.md` (Console template additions for Low-confidence + Contested subsections) | No other spec touches wrap-up files; conflict-free. |

## Decomposition source

All four specs were decomposed from `docs/superpowers/specs/2026-05-18-multi-agent-coordination-design.md` on 2026-05-18 (the design doc was deleted after Step 5 of `/claude-tweaks:specify` confirmed full absorption). Background research for the design lives at `.claude-tweaks/research/2026-05-17-llm-council-prompting-claude-tweaks/research_report.md`.
