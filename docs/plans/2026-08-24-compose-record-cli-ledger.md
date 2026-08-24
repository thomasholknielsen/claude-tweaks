# Open Items — bin/ composer CLI for record-body composition (#800)

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | build/skill | flow/materialize.md's "Multi-record layout" diagram states single-record work files land at {run-dir}/work/{n}-spec.md (i.e. nested under .claude-tweaks/pipelines/{run-id}/work/), but every observed real commit (e.g. work/252-spec.md, de6aaf5d) and .gitignore's own allow-list only cover .claude-tweaks/pipelines/*/work/** — the actual, consistently-used convention is a plain top-level work/{n}-spec.md at the repo root, matching CLAUDE.md's Anchoring-section aside ("work/{n}-spec.md is the exception and stays inside the worktree"). The doc's illustrative diagram appears stale against the real convention. [route: D2] | open | — |
