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

## /wrap-up
- AUTO 15:02:18 — Step 4 leftover routing: 2 sections routed to `defer` per policy. Detail: error-handling-edge-cases (cannot finish — external API spec), localization-pass (deferred to spec 45).
- AUTO 15:02:24 — Step 7 skill updates: applied 1 additive change (new anti-pattern in `auth/SKILL.md`). Restructure to `session-management/SKILL.md` staged at `staged/wrap-up-skill-restructure.md` for review.
```

## Entry schema

Each entry follows this shape:

```
- {STATUS} {HH:MM:SS} — {step or location}: {short action}. {detail line if needed}. Reversibility: {high|med|low}{; commit ref or stage path}.
```

| Field | Required | Format |
|---|---|---|
| `STATUS` | yes | `AUTO` (auto-applied), `STAGED` (logged but not acted; needs Review Console), `KEPT-PROMPT` (auto would not apply; asked user inline), `SCANNED` (scan completed — reports scope/outcome, whether or not anything was found) |
| `HH:MM:SS` | yes | Local time of the decision |
| Step or location | yes | Skill step name OR file:line if relevant |
| Short action | yes | One sentence: what was decided |
| Detail line | optional | Wraps to second line if needed; explain rationale |
| Reversibility | yes | `high` / `med` / `low` — drives Review Console sort order (SCANNED entries: N/A — nothing to revert) |
| Commit ref / stage path | when reversible | `commit abc1234` or `stage path: staged/...` |

## Status semantics

| Status | Meaning | Review Console treatment |
|---|---|---|
| `AUTO` | Skill auto-applied the decision per policy. Action complete. | Shown in "Auto-applied" section. Override = revert commit or undo edit. |
| `STAGED` | Skill detected a decision-worthy item but did not act. Patch / proposal is written to the run's `staged/` directory. | Shown in "Pending Review" section. User chooses Apply / Skip / Modify per item. |
| `KEPT-PROMPT` | Skill could not auto-resolve (floor failed or item is in "not silenced" list). Asked user inline. | Already resolved — informational entry only. |
| `SCANNED` | Skill ran its independent scan/gap-detection and is reporting the scan's scope and outcome — emitted on every run of a scanning step, whether or not the scan found anything actionable. Not itself a decision — the decision, if any, is a separate AUTO/STAGED entry. | Shown in "Auto-applied" section as an informational line (no action to override). |

## Append protocol

Skills append, never rewrite. Pattern:

1. Read the current contents (small file, cheap)
2. Append the new entry under the matching `## /{skill}` heading (create the heading if absent)
3. Write the full updated contents back

For the very first entry of a pipeline run, `/flow` (or the first standalone skill) writes the file header and the pipeline config snapshot. Subsequent entries are added under skill headings.

**Under `worktree.always: true`, before a worktree exists for this run.** Every standalone-auto skill (`_shared/pipeline-run-dir.md`'s step 4 allowlist: `/tidy`, `/init`, `/capture`, `/dispatch`, `/backlog`) writes its own `decisions.md` directly against the main checkout — there is no per-run worktree the way a `/build`/`/flow` pipeline has one. The `worktree.always` PreToolUse gate blocks `Edit`/`Write`/`NotebookEdit` there, so the Read+Write pattern above is denied. Use a Bash append instead — the gate's Bash coverage is the `cp`/`mv`/`tee` shapes only, not output redirection (see CLAUDE.md's Hooks section):

```bash
HEADING="## /{skill-name}"
if [ ! -f "$RUN_DIR/decisions.md" ] || ! grep -qF "$HEADING" "$RUN_DIR/decisions.md" 2>/dev/null; then
  printf '%s\n' "$HEADING" >> "$RUN_DIR/decisions.md"
fi
cat >> "$RUN_DIR/decisions.md" <<'EOF'
AUTO 14:32:14 — {step or location}: {short action}. Reversibility: high.
EOF
```

This produces the identical entry format (Entry schema, above) and end state as the Read+Write pattern — it's a mechanical substitution for *how* the write lands under this specific policy condition, not a different log format. A skill already running inside a `/flow`/`/build`-created worktree is unaffected and keeps using the Read+Write pattern — the worktree already satisfies the gate.

## Reading the log (for /wrap-up Review Console)

The Review Console reads the log file for the current pipeline run:

1. Resolve `PIPELINE_RUN_DIR` env var, or find the most recent run matching the current spec
2. Read `{run-dir}/decisions.md`
3. Group entries by status: AUTO / STAGED / KEPT-PROMPT / SCANNED
4. List staged artifacts from `{run-dir}/staged/`
5. Present in the Review Console (see `/wrap-up` Step 8.6)

## Archival on completion

On successful pipeline closure, `/wrap-up` moves the run directory to:

```
.claude-tweaks/pipelines/archive/{ISO-timestamp}-{spec-slug}/
```

The archive preserves the decision log, the staged directory (if any items were skipped at review), and the config snapshot. Users can review past pipelines or feed patterns back into project policy.

`/tidy` compacts archive entries older than 30 days: any standalone run directory (name matches `*-standalone`) under `.claude-tweaks/pipelines/` whose ISO-timestamp prefix is more than 30 days old gets its `decisions.md` content folded into `.claude-tweaks/pipelines/archive/index-{YYYY-MM}.md` (one monthly rollup file, appended per compacted run — keyed by the run's own timestamp so entries stay chronologically traceable), then the run directory itself moves to `.claude-tweaks/pipelines/archive/{run-id}/` — the same archive root completed pipeline runs already use. See `tidy/SKILL.md`'s "Archival compaction" subsection for the exact procedure.

**Abandoned non-standalone runs.** A `/flow`-orchestrated run directory (no `-standalone` suffix) that stops at an interactive HARD-GATE and is never resumed or wrapped up falls into neither bucket above — it doesn't reach `/wrap-up`'s successful-closure archival, and the standalone compaction rule's `*-standalone` name match structurally excludes it. `/tidy`'s compaction sweep also covers this case: a non-standalone run directory whose ISO-timestamp prefix is more than 30 days old AND whose `run-state.json` status is not `active` (`interrupted`, or the file is missing/unreadable — treat either as abandoned) is compacted the same way as a standalone run. The `status` check is the difference from the standalone rule (which compacts on age alone) — it exists so a genuinely long-running, still-active pipeline is never swept purely for being old.

## Anti-Patterns

| Anti-pattern | Why it fails |
|---|---|
| Skipping the log entry "to save tokens" | Silent automation without an audit trail is forbidden. Always log. The log is the contract. |
| Rewriting or editing prior entries | Append-only. Prior entries are history. |
| Logging the full reasoning chain | The entry is a one-liner. Detail line is optional and short. Long rationale belongs in the staged file under `{run-dir}/staged/`. |
| Reading the log to make decisions | The log is for the user (via Review Console). Skills don't read their own log to decide what to do — they read pipeline config and project policy. |
| Logging KEPT-PROMPT for decisions that were never auto candidates | KEPT-PROMPT is only for "auto would have applied but a floor failed." For decisions inherently not silenceable (challenge lenses, capture routing), don't log — they're not auto-decisions. |
| Writing the log to `docs/plans/` or any git-tracked path | The log is runtime state. Pipeline runs are not committed history. Use `.claude-tweaks/pipelines/{run-id}/`. |
