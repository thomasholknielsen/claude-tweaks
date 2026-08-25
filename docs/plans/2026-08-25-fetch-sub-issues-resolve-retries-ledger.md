# Open Items — fetch-sub-issues.js: fold retry resolution + canonicalization behind the CLI (#1153)

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | review | Security (lens 3b): `--resolve-retries` REST retry call interpolates owner/repo directly into a `gh api` path; `parseRepo` accepts `.`/`..` segments (empirically confirmed) — narrow hardening gap on the CLI's own `--repo` flag, not reachable via any of the three migrated prose call sites | fixed | Added owner/repo `.`/`..` guard + 2 tests — `f8208739` |
| 2 | review | Error handling (lens 3c): `trust-table.md` and `github-pr-scan-acceptance.md`'s Exit-0 branch still read "continue to the retry ladder below" after the retry ladder was replaced by `--resolve-retries` + canonicalization | fixed | Updated both to "continue to the canonicalization step below" — `cd717adf` |
| 3 | review/hindsight | Skill-worthy pattern (evaluation 5): REST URL path placeholders have no bound-variable escape hatch equivalent to GraphQL's `-f owner=`/`-f repo=` — a caller-overridable REST path must be built by interpolation and validated at that site | fixed | Documented in `.claude/skills/gh-api-module-pattern/SKILL.md` — `ec256c61` |
| 4 | review/hindsight | Missing consolidation (evaluation 3): `parseRepo`'s 8 other callers remain unguarded against `.`/`..` owner/repo segments — same gap as item 1, wider blast radius, out of #1153's scope | deferred | Staged as `staged/reflect-1.md` — Defer-reason: genuinely-larger (spans 9 files/callers); needs a per-caller reachability audit before a fix |
