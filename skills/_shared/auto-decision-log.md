# Auto-Decision Log

Audit trail for every decision auto-resolved in `auto` or `hybrid` mode. Read by `/wrap-up` Review Console to surface what was auto-decided so the user can override before the pipeline closes.

## Why this exists

Silent automation without an audit trail is a quality-killer — the user has no way to know what was decided on their behalf, no way to roll back, and no way to learn whether the auto-decisions matched their intent. The log fixes this:

- **Auditability** — every auto-decision has a written record with rationale
- **Reversibility** — the Wrap-Up Review Console can re-present any auto-decision for override
- **Calibration** — the user can see patterns ("auto keeps choosing X but I want Y") and update project policy

## Location

Per-pipeline run, inside the run directory (collision-safe across parallel pipelines):

```
.claude-tweaks/pipelines/{ISO-timestamp}-{spec-slug}/decisions.md
```

Skills locate the active log via `PIPELINE_RUN_DIR` env var or most-recent-matching-run lookup (see `auto-mode-contract.md`).

## File format

```markdown
# Auto-Decision Log — pipeline 2026-05-15T143207-spec-42

Pipeline config snapshot:
- mode: auto
- scope-creep: add-to-plan
- overlap: companion
- design-intent: none
- leftover-default: defer
- auto-fix-threshold: lint+type

## /build
- AUTO 14:32:14 — Common Step 1.5: scope-creep detected (src/utils/cache.ts mentioned, not in plan). Applied policy `add-to-plan`. Reversibility: high (in worktree commit `abc1234`).
- AUTO 14:33:48 — Common Step 1 (worktree consent): pre-authorized by `auto` arg. Worktree created at `.worktrees/spec-42`.

## /review
- AUTO 14:41:02 — Step 3 Routing: applied 3 severity:low findings (formatting nits). Files: src/auth/login.ts:42, src/auth/logout.ts:18, src/auth/session.ts:91. Reversibility: high (commit `def5678`).
- STAGED 14:41:15 — Step 3 Routing: 2 severity:medium findings. Patches at `staged/review-2.patch`, `staged/review-3.patch`. Surface at Review Console.
- KEPT-PROMPT 14:41:22 — Step 3 Routing: 1 severity:high finding (potential race condition in src/auth/session.ts:140). Required user input — surfaced inline.

## /test
- AUTO 14:48:31 — Step 1 fix mode: auto-fixed 4 lint failures (per `auto-fix-threshold: lint+type`). Commit `ghi9012`. Reversibility: high.

## /stories
- AUTO 14:52:08 — Step 6: applied 2 journey link suggestions (mechanical mapping). Files: stories/login.yml, stories/logout.yml.
- STAGED 14:52:11 — Step 1: legacy v1 stories detected (3 files). Migration deferred. Stage path: `staged/stories-legacy-migration.md`. Surface at Review Console with command: `/claude-tweaks:stories migrate`.

## /wrap-up
- AUTO 15:02:18 — Step 4 leftover routing: 2 sections routed to `defer` per policy. Detail: error-handling-edge-cases (cannot finish — external API spec), localization-pass (deferred to spec 45).
- AUTO 15:02:24 — Step 7.5 skill updates: applied 1 additive change (new anti-pattern in `auth/SKILL.md`). Restructure to `session-management/SKILL.md` staged at `staged/wrap-up-skill-restructure.md` for review.
```

## Entry schema

Each entry follows this shape:

```
- {STATUS} {HH:MM:SS} — {step or location}: {short action}. {detail line if needed}. Reversibility: {high|med|low}{; commit ref or stage path}.
```

| Field | Required | Format |
|---|---|---|
| `STATUS` | yes | `AUTO` (auto-applied), `STAGED` (logged but not acted; needs Review Console), `KEPT-PROMPT` (auto would not apply; asked user inline) |
| `HH:MM:SS` | yes | Local time of the decision |
| Step or location | yes | Skill step name OR file:line if relevant |
| Short action | yes | One sentence: what was decided |
| Detail line | optional | Wraps to second line if needed; explain rationale |
| Reversibility | yes | `high` / `med` / `low` — drives Review Console sort order |
| Commit ref / stage path | when reversible | `commit abc1234` or `stage path: staged/...` |

## Status semantics

| Status | Meaning | Review Console treatment |
|---|---|---|
| `AUTO` | Skill auto-applied the decision per policy. Action complete. | Shown in "Auto-applied" section. Override = revert commit or undo edit. |
| `STAGED` | Skill detected a decision-worthy item but did not act. Patch / proposal is written to the run's `staged/` directory. | Shown in "Pending Review" section. User chooses Apply / Skip / Modify per item. |
| `KEPT-PROMPT` | Skill could not auto-resolve (floor failed or item is in "not silenced" list). Asked user inline. | Already resolved — informational entry only. |

## Append protocol

Skills append, never rewrite. Pattern:

1. Read the current contents (small file, cheap)
2. Append the new entry under the matching `## /{skill}` heading (create the heading if absent)
3. Write the full updated contents back

For the very first entry of a pipeline run, `/flow` (or the first standalone skill) writes the file header and the pipeline config snapshot. Subsequent entries are added under skill headings.

## Reading the log (for /wrap-up Review Console)

The Review Console reads the log file for the current pipeline run:

1. Resolve `PIPELINE_RUN_DIR` env var, or find the most recent run matching the current spec
2. Read `{run-dir}/decisions.md`
3. Group entries by status: AUTO / STAGED / KEPT-PROMPT
4. List staged artifacts from `{run-dir}/staged/`
5. Present in the Review Console (see `/wrap-up` Step 8.6)

## Archival on completion

On successful pipeline closure, `/wrap-up` moves the run directory to:

```
.claude-tweaks/pipelines/archive/{ISO-timestamp}-{spec-slug}/
```

The archive preserves the decision log, the staged directory (if any items were skipped at review), and the config snapshot. Users can review past pipelines or feed patterns back into project policy.

`/tidy` may compact archive entries older than 30 days into `.claude-tweaks/pipelines/archive/index-{YYYY-MM}.md` (not implemented in v4.6.0).

## Anti-patterns

| Anti-pattern | Why it fails |
|---|---|
| Skipping the log entry "to save tokens" | Silent automation without an audit trail is forbidden. Always log. The log is the contract. |
| Rewriting or editing prior entries | Append-only. Prior entries are history. |
| Logging the full reasoning chain | The entry is a one-liner. Detail line is optional and short. Long rationale belongs in the staged file under `{run-dir}/staged/`. |
| Reading the log to make decisions | The log is for the user (via Review Console). Skills don't read their own log to decide what to do — they read pipeline config and project policy. |
| Logging KEPT-PROMPT for decisions that were never auto candidates | KEPT-PROMPT is only for "auto would have applied but a floor failed." For decisions inherently not silenceable (challenge lenses, capture routing), don't log — they're not auto-decisions. |
| Writing the log to `docs/plans/` or any git-tracked path | The log is runtime state. Pipeline runs are not committed history. Use `.claude-tweaks/pipelines/{run-id}/`. |
