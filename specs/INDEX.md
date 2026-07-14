# Specs Index

The durable record of work units. `/claude-tweaks:specify` produces specs from design docs; `/claude-tweaks:build` and `/claude-tweaks:flow` consume them.

## Tiers

| Tier | Meaning |
|------|---------|
| 1 | Must-have / blocks the next capability |
| 2 | High-value / unlocks future work |
| 3 | Nice-to-have / polish |

(Tier rows added as specs land. INDEX.md is forward-looking — completed specs are removed by `/claude-tweaks:wrap-up`.)

## Active specs

### Tier 1 — Unified work record on GitHub Issues (major version program)

One program, decomposed from `docs/superpowers/specs/2026-07-13-unified-work-record-design.md` (design absorbed into the specs; doc deleted). Build order follows `blocked-by`.

| Spec | Title | Status | Blocked by |
|------|-------|--------|------------|
| 13 | Work-record shared contracts and label taxonomy | **Complete** | — |
| 14 | Record-store core modules (bin/lib) | **Complete** | 13 |
| 15 | Health producers on the unified record | **Complete** | 14 |
| 16 | /capture and /challenge on the unified record | **Complete** | 14 |
| 17 | /specify as the shaper | **Complete** | 14 |
| 18 | /triage as the pure human gate | Not started | 14 |
| 19 | /dispatch — queue consumer (new skill) | Not started | 18 |
| 20 | Executors — /flow, /build, /wrap-up materialization | Not started | 17 |
| 21 | Dashboards and hygiene — /tidy, /help | Not started | 20 |
| 22 | /init — work-backend, labels, Types probe | Not started | 13 |
| 23 | Docs consolidation + major version (6.0.0) | Not started | 15, 16, 19, 20, 21, 22 |

**Physical-overlap note:** specs 18 and 19 both modify `skills/triage/SKILL.md` (`groupByFileOverlap` group `[18,19]`) — never build concurrently; 19's `blocked-by: [18]` enforces order. All other parallel branches are file-disjoint.
