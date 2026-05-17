# Pipeline Run Directory Resolution — Shared

Operational TLDR for skills that need to locate the active pipeline run directory. The canonical contract lives in `auto-mode-contract.md` (section "Pipeline run directory: location and collision-safety"); this file is the lookup-and-bash quick reference.

## Resolution order

1. **`PIPELINE_RUN_DIR` env var** — set explicitly by `/flow` when orchestrating. Use this when present (preferred path).
2. **Most-recent matching directory** — when the env var is unset, find the most recent directory under `.claude-tweaks/pipelines/` whose `spec-slug` segment matches the current spec or topic.
3. **Fall back to interactive mode** — when neither resolves to an existing directory, no policy lookup is possible and no auto-decisions are allowed. The skill MUST behave as if invoked in interactive mode for this run.

## What lives in the run directory

```
.claude-tweaks/pipelines/{ISO-timestamp}-{spec-slug}/
├── config.yml         ← Pipeline Config Manifesto answers (read for policy lookups)
├── decisions.md       ← Auto-decision log (append per _shared/auto-decision-log.md)
└── staged/            ← Patches and proposals awaiting the Wrap-Up Review Console
    ├── review-{n}.patch
    ├── tidy-{n}.md
    └── ...
```

`ISO-timestamp` is `YYYY-MM-DDTHHMMSS` (no colons). `spec-slug` is the spec number(s) or topic slug.

## Bash snippet (resolution)

```bash
RUN_DIR="${PIPELINE_RUN_DIR:-}"
if [ -z "$RUN_DIR" ]; then
  RUN_DIR=$(find .claude-tweaks/pipelines/ -maxdepth 1 -type d -name "*${SPEC_SLUG}*" 2>/dev/null | sort | tail -n 1)
fi
[ -d "$RUN_DIR" ] || RUN_DIR=""  # empty = fall back to interactive mode
```

Skills should set `SPEC_SLUG` from their input (spec number, topic slug, or `git branch --show-current` as a last-resort match).

## Lifecycle

- Created by the pipeline entrypoint (`/flow`, or the first standalone skill in a chain).
- Archived by the Wrap-Up Review Console on successful pipeline closure to `.claude-tweaks/pipelines/archive/{run-id}/` — preserves the audit trail; never deleted outright.
- `/tidy` may compact archive entries older than 30 days.

## See also

- `_shared/auto-mode-contract.md` — full spec (collision-safety rationale, lifecycle, multi-spec defer protocol)
- `_shared/auto-decision-log.md` — log entry format for `decisions.md`
