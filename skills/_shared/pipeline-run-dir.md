# Pipeline Run Directory Resolution — Shared

Operational TLDR for skills that need to locate the active pipeline run directory. The canonical contract (directory structure, collision-safety rationale, lifecycle, multi-spec defer protocol) lives in `auto-mode-contract.md` — section "Pipeline run directory: location and collision-safety". This file is the lookup-and-bash quick reference; consult the contract for anything not covered here.

## Resolution order

1. **`PIPELINE_RUN_DIR` env var** — set explicitly by `/flow` when orchestrating. Use this when present (preferred path).
2. **Most-recent matching directory** — when the env var is unset, find the most recent directory under `.claude-tweaks/pipelines/` whose `spec-slug` segment matches the current spec or topic.
3. **Record-mode materialization exception** — when neither step 1 nor step 2 resolves AND the invocation is `/claude-tweaks:build #{n}` running standalone (no `/flow` parent), create a standalone run dir at `.claude-tweaks/pipelines/{ISO-timestamp}-record-{n}-standalone/` via `skills/flow/materialize.md`'s own fallback, purely as artifact storage for the materialized file. This is a mode-independent branch keyed on the invocation itself, distinct from step 4's auto-mode allowlist below: it fires regardless of mode — materialization needs somewhere to write the file whether or not `auto` is active — and `/build` is not itself on the step 4 allowlist.
4. **Standalone auto fallback** — when steps 1-3 don't resolve AND the skill is running in `auto` mode AND the skill is on the standalone-auto allowlist (`/tidy`, `/init`, `/capture`, `/claude-tweaks:dispatch`, `/claude-tweaks:triage`, `/claude-tweaks:review-backlog`), create a standalone run dir at `.claude-tweaks/pipelines/{ISO-timestamp}-{skill-name}-standalone/` with `decisions.md` and `staged/`. The audit log stays on; the skill auto-resolves per project policy in CLAUDE.md. The dir is presented in a Pending Review section at the end of the skill's report (no separate Review Console — this is the bookend-end for a standalone run).

   `/reflect`, `/journeys`, `/visual-review`, and `/simplify` are NOT on this allowlist — they are component skills whose own Component-Skill Contract gates auto-mode behavior on `$PIPELINE_RUN_DIR` already being set by a parent (`/build`, `/review`, `/wrap-up`, or `/flow`). None of them implement a standalone-run-dir fallback; invoked directly with no active pipeline run, they fall through to step 5 (interactive mode) like any other non-allowlisted skill.

   `/claude-tweaks:dispatch`'s `next` form is a special case: it's the headless-safe selection form a scheduled Routine fires unattended (no human present), so step 5's interactive fallback below is never a real option for it — `next` always needs a standalone run dir to resolve, which is why dispatch is on this allowlist despite not being one of the original "auto-mode skills." (Dispatch's bare and `#N` forms can run with a human present and answering prompts, but resolve their own claim/release audit trail through this same allowlisted path regardless of form — dispatch never inherits `$PIPELINE_RUN_DIR`, since it is never invoked as a pipeline component.)
5. **Fall back to interactive mode** — when none of steps 1-4 resolve, no policy lookup is possible and no auto-decisions are allowed. The skill MUST behave as if invoked in interactive mode for this run.

The resolved directory contains `config.yml` (Manifesto answers / policy — absent for standalone runs), `decisions.md` (auto-decision log), `staged/` (proposals awaiting the Review Console / Pending Review section), `run-state.json` (hook-maintained status/worktree assignment; terminal = status `clean`), and `events.jsonl` (hook-appended typed events). Full layout and lifecycle in `auto-mode-contract.md`.

## Bash snippet (resolution)

```bash
RUN_DIR="${PIPELINE_RUN_DIR:-}"
if [ -z "$RUN_DIR" ]; then
  RUN_DIR=$(find .claude-tweaks/pipelines/ -maxdepth 1 -type d -name "*${SPEC_SLUG}*" 2>/dev/null | sort | tail -n 1)
fi
if [ -z "$RUN_DIR" ] && [ "$MODE" = "auto" ] && [ -n "$STANDALONE_SKILL" ]; then
  # Standalone auto fallback — see resolution order step 4 (step 3, the record-mode
  # materialization exception, is /build-specific and handled separately in materialize.md)
  TS=$(date -u +%Y-%m-%dT%H%M%S)
  RUN_DIR=".claude-tweaks/pipelines/${TS}-${STANDALONE_SKILL}-standalone"
  mkdir -p "$RUN_DIR/staged"
  touch "$RUN_DIR/decisions.md"
fi
[ -d "$RUN_DIR" ] || RUN_DIR=""  # empty = fall back to interactive mode
```

**SPEC_SLUG conventions** (load-bearing — short numeric slugs would collide with timestamps without a prefix):
- Spec runs: pass `SPEC_SLUG="spec-42"` (with `spec-` prefix) — matches dirs like `2026-05-15T143207-spec-42` without colliding with timestamp digits.
- Multi-spec runs: pass `SPEC_SLUG="spec-42-45-48"` (single prefix, dash-joined IDs).
- Topic runs: pass `SPEC_SLUG="meal-planning"` (no prefix — non-numeric slugs don't collide).
- Last-resort: `git branch --show-current` after a worktree exists. `/flow` and `/build` create the worktree before any path-sensitive command, so this fallback is safe at the time the resolution runs.

## See also

- `_shared/auto-mode-contract.md` — full spec (directory layout, lifecycle, archive rules)
- `_shared/auto-decision-log.md` — log entry format for `decisions.md`
