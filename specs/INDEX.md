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

### Tier 3

AskUserQuestion adoption — replaces the plugin's plain-text numbered-option convention with Claude Code's native `AskUserQuestion` tool across all user-facing decision points. 8-spec decomposition; 05 is a hard prerequisite for 06-12, which have no dependencies on each other.

| Spec | Title | Status | Blocked By | Est. Tasks |
|------|-------|--------|------------|------------|
| 05 | AskUserQuestion adoption — Foundation | Not started | — | 4 |
| 06 | AskUserQuestion adoption — Lifecycle A (init, capture, challenge) | Not started | 05 | 7 |
| 07 | AskUserQuestion adoption — Lifecycle B (specify, build, test) | Not started | 05 | 6 |
| 08 | AskUserQuestion adoption — Lifecycle C (stories, review, wrap-up) | Not started | 05 | 9 |
| 09 | AskUserQuestion adoption — Component skills A (reflect, simplify, deepen) | Not started | 05 | 6 |
| 10 | AskUserQuestion adoption — Component skills, batch B (journeys, visual-review, design) | Not started | 05 | 7 |
| 11 | AskUserQuestion adoption — Utility A (help, tidy, flow, browse) | Not started | 05 | 6 |
| 12 | AskUserQuestion adoption — Utility B (ledger, version, research, code-health, routine, harness-health) | Not started | 05 | 7 |
