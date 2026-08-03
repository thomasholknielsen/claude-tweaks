# Step 5 — Verify Git (detailed procedure)

*Core Bootstrap step (Steps 1-8). Order-dependent — later steps may assume earlier ones completed. Runs unconditionally and idempotently: only acts on missing state. Gated by the Core Bootstrap Version Check (`version-check.md` in this directory).*

The workflow system relies on git for change tracking (`/claude-tweaks:review` uses `git diff`, `/claude-tweaks:wrap-up` checks recent commits).

- Check that the current directory is a git repo (`git rev-parse --is-inside-work-tree`).
- If not, warn the user — the workflow will partially work but `/claude-tweaks:review` and `/claude-tweaks:wrap-up` will be degraded. Do not auto-run `git init` — the user may have an intentional non-git checkout.
