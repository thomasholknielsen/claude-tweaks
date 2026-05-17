# Multi-Spec Consolidated Review Console

For multi-spec `/flow` runs in `auto` or `hybrid` mode, the per-spec Wrap-Up Review Consoles (`/wrap-up` Step 8.6) are **deferred** so the user is not interrupted between specs. After the final spec's wrap-up completes, `/flow` runs **one consolidated Review Console** that aggregates decisions and staged items from every spec in the run.

This preserves the bookend architecture (Manifesto at start, one Review Console at end) even when N > 1 specs run sequentially.

## Run directory layout (multi-spec)

`/flow` creates the standard top-level run directory at start, but namespaces each spec's outputs into a subdirectory:

```
.claude-tweaks/pipelines/{ISO-timestamp}-{spec-1}-{spec-2}-{spec-3}/
├── config.yml          ← Manifesto answers (one for the whole run)
├── manifest.yml        ← Multi-spec metadata (spec IDs, order, statuses)
├── spec-157/
│   ├── decisions.md
│   └── staged/
├── spec-159/
│   ├── decisions.md
│   └── staged/
└── spec-160/
    ├── decisions.md
    └── staged/
```

When invoking each per-spec pipeline, `/flow` sets:

- `PIPELINE_RUN_DIR=.../spec-{N}/` — the spec's namespaced directory (so per-spec skills write decisions and staged items there)
- `MULTISPEC_REVIEW_DEFER=1` — signals to `/wrap-up` Step 8.6 to skip the per-spec console
- `MULTISPEC_PARENT_DIR=.../{ISO-timestamp}-{spec-1}-...-{spec-N}/` — pointer to the parent run dir (used by the consolidated console)

The single-spec path is unchanged: `PIPELINE_RUN_DIR` points to a top-level run dir, `MULTISPEC_REVIEW_DEFER` is unset.

## When to run the consolidated console

After every spec's pipeline reaches `/wrap-up` Step 10 (or stops at a HARD-GATE failure) AND the multi-spec run is in `auto` or `hybrid` mode:

1. Read `manifest.yml` to enumerate per-spec subdirectories
2. For each `spec-{N}/`: read `decisions.md` + `staged/` contents
3. Render the consolidated console (template below)
4. Apply the user's approval/override
5. Archive the parent run dir to `.claude-tweaks/pipelines/archive/`

If `auto` was not set (interactive mode), the per-spec consoles ran inline as usual — no consolidation step. Skip this entirely.

If the multi-spec run aborted early (one spec hit a HARD-GATE), still render the consolidated console with whatever was accumulated up to the failure point. Specs that didn't run appear as a row in the "Not run" footer.

## Locating the parent run directory

1. Resolve via `MULTISPEC_PARENT_DIR` env var if set by `/flow`
2. Else find the most recent directory in `.claude-tweaks/pipelines/` whose `spec-slug` is comma-joined (e.g., `157-159-160`)
3. Else fall back to interactive single-spec behavior (no consolidation)

## Present the consolidated console

```markdown
### Multi-Spec Wrap-Up Review Console

Pipeline complete for specs 157, 159, 160. The pipeline auto-resolved {N} decisions and staged {M} items across all 3 specs. One batch decision below resolves everything.

#### Auto-applied (already in commits — override = revert)

| # | Spec | Skill | What | Where |
|---|---|---|---|---|
| 1 | 157 | /review | Applied 3 severity:low formatting fixes | commit `def5678` |
| 2 | 157 | /test | Auto-fixed 4 lint failures | commit `ghi9012` |
| 3 | 159 | /build | Scope-creep: added src/utils/cache.ts to plan | commit `abc1234` |
| 4 | 159 | /review | Applied 2 severity:low naming consistency fixes | commit `jkl4567` |
| 5 | 160 | /stories | Applied 2 journey link suggestions | stories/login.yml, stories/logout.yml |

#### Pending review (staged — apply, skip, or modify per item)

| # | Spec | Skill | What | Detail | Patch |
|---|---|---|---|---|---|
| 6 | 157 | /review | 2 severity:medium findings | Unhandled rejection in src/api.ts:180; missing null check in src/auth/session.ts:42 | `spec-157/staged/review-2.patch`, `spec-157/staged/review-3.patch` |
| 7 | 159 | /wrap-up | Skill restructure proposed | Split `auth/SKILL.md` into `auth/` + `session-management/` | `spec-159/staged/wrap-up-skill-restructure.md` |
| 8 | 160 | /stories | Legacy v1 stories detected (3 files) | stories/checkout.yml, stories/profile.yml, stories/settings.yml | Migration: `/claude-tweaks:stories migrate` |

#### Skill updates (from each spec's Step 7.5)

| # | Spec | Skill | Section | Change |
|---|---|---|---|---|
| 9 | 157 | auth | Anti-Patterns | Add: "Don't share session tokens via querystring" |
| 10 | 159 | NEW | session-management | Create new skill for session lifecycle patterns |

#### Configuration updates (from each spec's Steps 6 + 8)

| # | Spec | Type | Target | Change |
|---|---|---|---|---|
| 11 | 157 | doc | docs/api.md | Document new /auth/refresh endpoint |
| 12 | 159 | claude.md | Commands | Add `npm run lint:fix` to test workflow |

#### Not run / Failed (if any spec didn't complete cleanly)

| Spec | Status | Reason | Worktree |
|---|---|---|---|
| 159 | failed | test gate (3 type errors) — see `spec-159/decisions.md` | `.worktrees/spec-159` preserved |
| 160 | not-run | previous spec failed (159); `keep-going` not set | — |

Status values:
- **failed** — spec hit a HARD-GATE but the run continued (only happens under `keep-going`). Worktree is preserved for inspection.
- **not-run** — spec was skipped because an earlier spec failed and `keep-going` was not set. No worktree was created.
- **incomplete** — spec started but did not reach `/wrap-up` Step 10 for a reason other than HARD-GATE (rare; e.g., subagent crash).

Populate this footer from `manifest.yml` — any spec with `status: failed`, `not-run`, or `incomplete` gets a row.

---

1. **Approve all** — apply pending items, accept auto-applied, apply skill + config updates **(Recommended)**
2. **Override specific items** — reply with `#`s to skip/modify (e.g., `skip 6, modify 8, revert 2`)
3. **Stop and re-engage** — pause; resume after manual review

Below each table, show the full patch / diff for each pending item.
```

## On approval (option 1)

1. For each `spec-{N}/staged/` patch: `git apply` (each spec already has its own commit context — patches apply against the cumulative pipeline state)
2. Apply skill updates and create new skills (from each spec's Step 7.5)
3. Apply config updates (docs, CLAUDE.md, rules)
4. Commit with a multi-spec wrap-up message that lists which specs contributed which changes
5. Archive the parent run dir to `.claude-tweaks/pipelines/archive/{run-id}/` (subdirs included)

## On override (option 2)

1. Parse the user's overrides — `#`s map to consolidated table rows; resolve back to the originating spec's subdirectory for each
2. Apply, skip, or modify per item
3. For items the user wants reverted: `git revert {commit}` (one revert commit per item)
4. Archive the parent run dir

## On stop (option 3)

Halt before applying. Leave the parent run dir intact. User resumes with `/claude-tweaks:flow {specs} review-console` (a dedicated resume step that re-reads the same parent dir and re-presents the console).

## Empty-console fast path

If every per-spec `decisions.md` has zero entries AND every per-spec `staged/` is empty AND there are no skill or config updates across the run, skip the console entirely. Log "Multi-spec Review Console: nothing to review" and archive silently.

## Sort order

Within each section: reversibility:low first (highest-stakes revert), then reversibility:med, then reversibility:high. Within the same reversibility, severity:high first. **Tiebreaker: spec ID ascending** — so the user sees consistent spec ordering across sections.

## Hard requirements

- The console MUST present every entry from every per-spec `decisions.md` (auto-applied + staged + kept-prompt) and every file in every per-spec `staged/` directory. Silently dropping any item is forbidden.
- The `Spec` column is mandatory in every table — the user must be able to trace any row to its originating spec for context.
- The `Not run` footer is mandatory when any spec was skipped due to a HARD-GATE earlier in the pipeline — those specs' contexts are explicit, not buried.

## Anti-patterns

| Pattern | Why it fails |
|---|---|
| Running per-spec consoles inline AND a consolidated one at the end | Double approval. If `MULTISPEC_REVIEW_DEFER=1` is set, the per-spec console MUST skip — the consolidated one is the single approval point. |
| Aggregating across runs (e.g., yesterday's spec + today's spec in one console) | Each `/flow` invocation has its own parent run dir. The consolidated console is scoped to one `/flow` invocation only. |
| Omitting the `Spec` column to keep the table narrow | Spec attribution is the whole point of the consolidated view. Wide tables wrap; the column stays. |
| Replacing per-spec audit trails with a merged `decisions.md` | The per-spec subdirectories are the audit trail. Merging discards the spec attribution and makes archive review harder. The consolidated console *reads* multiple per-spec files; it does not *replace* them. |
