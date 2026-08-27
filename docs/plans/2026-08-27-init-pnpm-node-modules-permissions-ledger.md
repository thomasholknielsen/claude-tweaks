# Open Items — init: pnpm node_modules permission allowlist (#836)

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | review | `plugin/skills/init/bootstrap-steps.md:21` overclaims "idempotent drift-repair on re-run" — a bare `/claude-tweaks:init` re-run does NOT repair a missing Step 8.5 entry when the project's `.claude-tweaks/init-state.yml` marker already matches the installed plugin version (version-check.md's gate skips Steps 1-8.5 entirely in that case); only `/claude-tweaks:init bootstrap` forces the re-check | open | — |
| 2 | review | `plugin/skills/init/bootstrap/step-08-5-dependency-read-permissions.md:18` — settings.json read step has no malformed-JSON branch, unlike the sibling `init-state.yml` handling in `version-check.md` added in the same diff ("treat as absent if missing or malformed") | open | — |
| 3 | review | `plugin/skills/init/bootstrap/step-08-5-dependency-read-permissions.md:20` — idempotency merge step doesn't specify handling when `permissions.allow` exists but isn't an array | open | — |
