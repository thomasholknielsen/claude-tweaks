# Open Items — Agent Browser migration (v4.0.0)

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | build | `/stories` Task 4 introduced an unspec'd `servers.yml` artifact as the credentials-free successor to old `auth.yml` server-section. Verify this propagates correctly into `agents/qa-agent.md` (Task 12) — accept if integrated, remove and inline otherwise. | open | — |
| 2 | build | Plan omitted `CLAUDE.md` (project root) which contains stale references: "Skills with sub-files" row for `browse` lists `playwright-reference.md, chrome-reference.md`; Stack table lists `playwright-cli (optional)` as a dependency; plugin version reference reads "v3.20.0". Fix in Task 15 (cross-reference audit). | open | — |
