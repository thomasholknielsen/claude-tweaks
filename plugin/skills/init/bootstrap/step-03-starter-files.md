# Step 3 — Work-record storage (no starter files)

*Core Bootstrap step — order-dependent, so later steps may assume earlier ones completed; runs unconditionally and idempotently, acting only on missing state. Gated by `version-check.md` in this directory.*

No starter files are written. Work records need no scaffolding: under `work-backend: github-issues` they live on the tracker; under `work-backend: local-files` `local-store.js` writes them directly as flat `specs/{n}-{slug}.md` files (no subdirectory to pre-create) as `/claude-tweaks:capture` and `/claude-tweaks:tidy`'s Defer action file them. `specs/` itself is already created by Step 2.

This step is retained as a no-op so the surrounding Bootstrap step numbers keep resolving.
