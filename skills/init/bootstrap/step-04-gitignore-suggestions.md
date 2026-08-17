# Step 4 — .gitignore suggestions (detailed content)

*Core Bootstrap step — order-dependent, so later steps may assume earlier ones completed; runs unconditionally and idempotently, acting only on missing state. Gated by `version-check.md` in this directory.*

Check whether `.gitignore` exists and already covers workflow artifacts. Suggest entries for transient files that shouldn't be committed:

```gitignore
# claude-tweaks: transient artifacts
screenshots/
.worktrees/
.claude-tweaks/pipelines/*
!.claude-tweaks/pipelines/*/
.claude-tweaks/pipelines/*/*
!.claude-tweaks/pipelines/*/work/
!.claude-tweaks/pipelines/*/work/**
!.claude-tweaks/pipelines/*/spec-*/
.claude-tweaks/pipelines/*/spec-*/*
!.claude-tweaks/pipelines/*/spec-*/work/
!.claude-tweaks/pipelines/*/spec-*/work/**
!.claude-tweaks/pipelines/archive/*/
.claude-tweaks/pipelines/archive/*/*
!.claude-tweaks/pipelines/archive/*/work/
!.claude-tweaks/pipelines/archive/*/work/**
!.claude-tweaks/pipelines/archive/*/spec-*/
.claude-tweaks/pipelines/archive/*/spec-*/*
!.claude-tweaks/pipelines/archive/*/spec-*/work/
!.claude-tweaks/pipelines/archive/*/spec-*/work/**
.claude-tweaks/research/
.claude-tweaks/code-health/
.claude-tweaks/harness-health/
.claude-tweaks/journey-health/
.claude-tweaks/docs-health/
.claude-tweaks/feedback/
.claude-tweaks/routine-environment-cache.yml
.claude-tweaks/init-state.yml
.impeccable/config.local.json
.impeccable/hook.cache.json
.impeccable/hook.pending.json
```

These entries ignore claude-tweaks' transient, project-local state — pipeline run directories (`pipelines/{ISO-timestamp}-{spec-slug}/config.yml`, `decisions.md`, `staged/`), research report output, each health skill's own local cache (`code-health/cache.json`, `harness-health/cache.json`, `journey-health/cache.json`, `docs-health/cache.json` — the only files still written under these paths; cursor and run-history state now live on the durable `health-state` git branch, see `skills/_shared/health-state.md` and `bin/lib/{skill}/cache.js` for each), the routine-environment-resolution cache (see `skills/routine/SKILL.md`), and `/claude-tweaks:feedback`'s evaluation-watermark cache (`.claude-tweaks/feedback/watermarks/*.json`, see `bin/lib/feedback/watermark.js`). Deliberately **not** blanket-ignored: `.claude-tweaks/routines/{name}.yml` (instantiated cloud-Routine records, written by `/claude-tweaks:routine`) — those are explicitly documented as safe, and meant, to commit. A blanket `.claude-tweaks/` line would make that directory permanently uncommittable regardless of user intent, since git cannot reliably re-include a subdirectory of an already-ignored parent via `!` negation. The statusline cache lives under the user's home directory (`~/.claude-tweaks/`), a separate global path — it never needs a project `.gitignore` entry. The same rule applies to Impeccable's own config directory: `.impeccable/config.json` is Impeccable's committed, shared team config (colors, typography, brand voice); only the three per-developer files above — `config.local.json`, `hook.cache.json`, and `hook.pending.json`, all written by its optional automatic-detection hook — are local state. A blanket `.impeccable/` line would make `config.json` permanently uncommittable for the identical structural reason.

The same structural rule applies one level deeper, inside `.claude-tweaks/pipelines/` itself: `flow/materialize.md` documents that a materialized spec file under `pipelines/{run-id}/work/` (and its multi-record `spec-{n}/work/` variant, plus both variants again under `pipelines/archive/{run-id}/` — the path `/claude-tweaks:wrap-up`'s cleanup step produces) is committed audit trail, never gitignored. A bare `.claude-tweaks/pipelines/` blanket line would stop git from ever traversing into the directory at all, so a nested `!work/` re-inclusion could never take effect (this project's own `.gitignore` Don't in CLAUDE.md names this exact class of bug). The template above instead un-ignores each directory level on the way down to `work/`, at both the single-record and multi-record depths, and repeats that same per-level shape under `pipelines/archive/`. This repo's own root `.gitignore` uses the identical 17-line pattern — mirror it verbatim rather than re-deriving it by hand.

**Re-run behavior (migration check):** don't just check whether `.gitignore` "already covers" `.claude-tweaks/` — a project that adopted claude-tweaks before this split existed may have the old blanket line, which silently reintroduces the routines-uncommittable bug even though something matching `.claude-tweaks` is technically present. Likewise, a project that adopted the split before the per-level `pipelines/` pattern existed may have a naive `.claude-tweaks/pipelines/` blanket sub-line — that silently reintroduces the identical class of bug one level down, permanently pruning the `work/` audit trail `flow/materialize.md` promises is tracked history.

| Current state | Action |
|---|---|
| No `.gitignore`, or one with no `.claude-tweaks` reference at all | Suggest adding the split entries above. |
| Standalone blanket `.claude-tweaks/` line (the old, pre-split form) | **Migrate.** Propose replacing the blanket line with the split entries above (the per-level `pipelines/` un-ignore block plus `.claude-tweaks/research/`, `.claude-tweaks/code-health/`, `.claude-tweaks/harness-health/`, `.claude-tweaks/journey-health/`, `.claude-tweaks/docs-health/`, `.claude-tweaks/routine-environment-cache.yml`) rather than silently treating it as already covered — the blanket form makes `.claude-tweaks/routines/{name}.yml` permanently uncommittable. Backup `.gitignore` before write. |
| Split entries present, but `.claude-tweaks/pipelines/` is a bare blanket sub-line (the old, pre-per-level form) | **Migrate.** Propose replacing that single line with the per-level un-ignore block above — the naive form makes `pipelines/{run-id}/work/` (and its `spec-*/work/` and `archive/*/work/` variants) permanently uncommittable, silently pruning the audit trail `flow/materialize.md` promises. Backup `.gitignore` before write. |
| Already has the split entries with the per-level `pipelines/` pattern | No-op (already migrated). |

If `stories/` exists or will be created, call `AskUserQuestion`:

- `question`: `"Should story YAML files be committed to version control?"`, `header`: `"Stories in git"`, `multiSelect`: `false`
- Option 1 — `label`: `"Yes — commit stories/ (Recommended)"`, `description`: `"Stories are part of the project's test suite; track them in version control."`
- Option 2 — `label`: `"No — add to .gitignore"`, `description`: `"Add stories/ to .gitignore instead of committing it."`

Do not modify `.gitignore` without asking — the user may have opinions about what to track.
