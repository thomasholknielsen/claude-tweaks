# Pipeline Run Directory Resolution — Shared

Operational TLDR for skills that need to locate the active pipeline run directory. The canonical contract (directory structure, collision-safety rationale, lifecycle, multi-spec defer protocol) lives in `auto-mode-contract.md` — section "Pipeline run directory: location and collision-safety". This file is the lookup-and-bash quick reference; consult the contract for anything not covered here.

## Resolution order

1. **`PIPELINE_RUN_DIR` env var** — set explicitly by `/flow` when orchestrating. Use this when present (preferred path).
2. **Most-recent matching directory** — when the env var is unset, find the most recent directory under `.claude-tweaks/pipelines/` whose `spec-slug` segment matches the current spec or topic.
3. **Fall back to interactive mode** — when neither resolves to an existing directory, no policy lookup is possible and no auto-decisions are allowed. The skill MUST behave as if invoked in interactive mode for this run.

The resolved directory contains `config.yml` (Manifesto answers / policy), `decisions.md` (auto-decision log), and `staged/` (proposals awaiting the Review Console). Full layout and lifecycle in `auto-mode-contract.md`.

## Bash snippet (resolution)

```bash
RUN_DIR="${PIPELINE_RUN_DIR:-}"
if [ -z "$RUN_DIR" ]; then
  RUN_DIR=$(find .claude-tweaks/pipelines/ -maxdepth 1 -type d -name "*${SPEC_SLUG}*" 2>/dev/null | sort | tail -n 1)
fi
[ -d "$RUN_DIR" ] || RUN_DIR=""  # empty = fall back to interactive mode
```

Skills should set `SPEC_SLUG` from their input (spec number, topic slug, or `git branch --show-current` as a last-resort match — only after a worktree exists; `/flow` and `/build` create the worktree before any path-sensitive command, so this fallback is safe at the time the resolution runs).

## See also

- `_shared/auto-mode-contract.md` — full spec (directory layout, lifecycle, archive rules)
- `_shared/auto-decision-log.md` — log entry format for `decisions.md`
