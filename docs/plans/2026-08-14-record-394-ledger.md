# Open Items — 394: Trim 13 frontmatter descriptions and add a frontmatter budget to context-cost.js

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | review | Trimming to the new 260-char ceiling silently dropped Keywords tokens on 3 of 15 touched skills — `backlog` (related, next, unattended, headless), `docs-health` (documentation drift, orphan docs, proactive), `harness-health` (skill health, scheduled) — contradicting the spec's own AC2 ("keeps every Keywords token unless demonstrably redundant") and Gotchas warning ("a lost keyword can stop a skill from firing"). All three descriptions have only 6-14 chars of headroom under the 260 ceiling, so restoring every dropped token requires further prose compression, not a mechanical add-back — a judgment call on which tokens are genuinely redundant vs. load-bearing, not something to auto-resolve in review. | open | — |
