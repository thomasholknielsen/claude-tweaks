# Open Items — reconcile: dedup hand-duplicated sync/async primitive pairs (#1652)

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | build/skill | `.claude/skills/gh-api-module-pattern` documents the injectable-runner seam and call-time-resolution rules for sync/async `execFileSync`/`execFile` pairs, but not this build's consolidation technique — a shared `runClassified`/`runClassifiedAsync` try/execute/catch scaffold plus per-pair `buildSuccess`/`buildFailure` shaping, extracted once two independently-written twin pairs (`runGit`/`runGitAsync`, `ghHealthCheck`/`ghHealthCheckAsync`) drifted from each other. Extends the skill's existing patterns with a new wrinkle worth documenting for the next such pair (follow-up #1679 will add two more). | observation | — |
