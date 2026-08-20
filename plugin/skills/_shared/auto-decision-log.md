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
- AUTO 14:34:02 — profile capable resolved opus/high via policy. Reversibility: n/a (dispatch-time model selection, not a code mutation).

## /review
- AUTO 14:41:02 — Step 3 Routing: applied 3 severity:low findings (formatting nits). Files: src/auth/login.ts:42, src/auth/logout.ts:18, src/auth/session.ts:91. Reversibility: high (commit `def5678`).
- STAGED 14:41:15 — Step 3 Routing: 2 severity:medium findings. Patches at `staged/review-2.patch`, `staged/review-3.patch`. Surface at Review Console.
- KEPT-PROMPT 14:41:22 — Step 3 Routing: 1 severity:high finding (potential race condition in src/auth/session.ts:140). Required user input — surfaced inline.

## /test
- AUTO 14:48:31 — Step 1 fix mode: auto-fixed 4 lint failures (per `auto-fix-threshold: lint+type`). Commit `ghi9012`. Reversibility: high.

## /stories
- AUTO 14:52:08 — Step 6: applied 2 journey link suggestions (mechanical mapping). Files: stories/login.yml, stories/logout.yml.

## /wrap-up
- AUTO 15:02:18 — Leftover routing: 2 sections routed to `defer` per policy (defer-reason: blocked-external, blocked-dependency). Detail: error-handling-edge-cases (cannot finish — external API spec), localization-pass (deferred to spec 45).
- AUTO 15:02:24 — Skills row: applied 1 additive change (new anti-pattern in `auth/SKILL.md`). Restructure to `session-management/SKILL.md` staged at `staged/wrap-up-skill-restructure.md` for review.
```

An aggregate line lists one `defer-reason` value per item, comma-separated in item order; single-item lines carry exactly one value — the shape `summary-template.md` parses.

## Entry schema

**`bin/log-decision.js --run-dir <dir> [--spec <n>] [--skill <name>] <STATUS> <message>`** is the
canonical appender for this schema — it timestamps and status-prefixes `message` (composed by the
caller per the shape below) and inserts it under the given `--skill` heading (creating the section
if absent) or at end of file otherwise. Every consumer of this file writes through it instead of
hand-appending a formatted line per call site.

Each entry follows this shape:

```
- {STATUS} {HH:MM:SS} — {step or location}: {short action}. {detail line if needed}. Reversibility: {high|med|low}{; commit ref or stage path}.
```

| Field | Required | Format |
|---|---|---|
| `STATUS` | yes | `AUTO` (auto-applied), `STAGED` (logged but not acted; needs Review Console), `KEPT-PROMPT` (auto would not apply; asked user inline), `SCANNED` (scan completed — reports scope/outcome, whether or not anything was found), `REFUSED` (a queue-write proposal blocked at creation — no valid `Defer-reason:`; see `wrap-up/refused-proposals.md`) |
| `HH:MM:SS` | yes | Local time of the decision |
| Step or location | yes | Skill step name OR file:line if relevant |
| Short action | yes | One sentence: what was decided |
| Detail line | optional | Wraps to second line if needed; explain rationale |
| Reversibility | yes | `high` / `med` / `low` — drives Review Console sort order (SCANNED and REFUSED entries: N/A — nothing to revert) |
| Commit ref / stage path | when reversible | `commit abc1234` or `stage path: staged/...` |

## Lever attribution (optional trailing field)

A decision that consulted a policy/config lever may name it at the end of its entry:

```
- {STATUS} {HH:MM:SS} — {step or location}: {short action}. {detail line if needed}. Reversibility: {high|med|low}{; commit ref or stage path}. [lever: {key}={value} ({source})]
```

The bracketed field is **always last** — after the existing optional `{; commit ref or stage path}` element when that is present. Multiple levers are semicolon-separated inside one bracket pair. The lever field is optional; absence is valid and no reader may require its presence. Absence means "not lever-governed or not yet adopted" — never an error.

**"Consulted" means every lever whose value the logging site's own procedure read to make this decision — including levers read by a sub-skill this procedure invokes on this path** — a weighted or advisory input counts; a lever the procedure never read does not. The field cites levers consulted, not which one alone decided.

- **Source words:** `run-config | policy | default` (matching `resolve-policy.js`'s envelope `source`), plus `arg` for a value set by an explicit CLI/skill argument override. No other source words.
- **Statuses:** any status (`AUTO`/`STAGED`/`KEPT-PROMPT`/`SCANNED`) whose decision consulted a lever carries the field; HARD-GATE stops and other non-policy decisions never carry it — attribution on a non-policy decision is noise that erodes the signal.
- **Keys are literal:** copy lever names from `POLICY_KEYS` (`bin/lib/policy-schema.js`) verbatim; never paraphrase.
- **List-valued levers** render the configured comma-joined string truncated at 60 chars with `…`; an unset list renders `[]`.
- **Table-cell rendering:** inside any markdown table cell the field renders as an inline code span (backticks), which neutralizes `|` and brackets — e.g. `` `[lever: scope-creep=add-to-plan (policy)]` `` as a suffix in the cell that carries the entry's detail.

Worked examples:

```
- AUTO 14:32:14 — Step 1.5: scope-creep — added 2 files to plan (src/utils/cache.ts, src/utils/keys.ts). Reversibility: high (commit abc1234). [lever: scope-creep=add-to-plan (policy)]
- AUTO 15:41:09 — Auto-merge: group [42], assess-agent-autonomy verdict auto-merge for every member. Merge commit: def5678. Reversibility: high (git revert). [lever: auto-merge-max-lines=40 (default); auto-merge-max-files=2 (policy)]
- STAGED 14:41:15 — Step 3 Routing: 2 severity:medium findings staged. Surface at Review Console. [lever: review-auto-apply-ceiling=low (default)]
- KEPT-PROMPT 14:12:40 — Step 2.6 shape check: cross-task dependency chain > 3 deep. Surfaced inline.
```

The third example is a decision whose outcome was driven by the findings' own severity, not by the floor alone — the floor was still consulted, so it is still cited. The fourth is a non-policy decision (a HARD-GATE surface): no field.

**Adoption:** sites not yet writing the field adopt it when next touched — no compatibility shim, no deadline.

## Status semantics

| Status | Meaning | Review Console treatment |
|---|---|---|
| `AUTO` | Skill auto-applied the decision per policy. Action complete. | Shown in "Auto-applied" section. Override = revert commit or undo edit. |
| `STAGED` | Skill detected a decision-worthy item but did not act. Patch / proposal is written to the run's `staged/` directory. | Shown in "Pending Review" section. User chooses Apply / Skip / Modify per item. |
| `REFUSED` | Console blocked a reason-less queue-write proposal at creation; kept staged (or flipped its ledger item back to `open`). | Shown under "Refused — no defer reason". No default; human edits the staged header or drops via Override → Skip. |
| `KEPT-PROMPT` | Skill could not auto-resolve (floor failed or item is in "not silenced" list). Asked user inline. | Already resolved — informational entry only. |
| `SCANNED` | Skill ran its independent scan/gap-detection and is reporting the scan's scope and outcome — emitted on every run of a scanning step, whether or not the scan found anything actionable. Not itself a decision — the decision, if any, is a separate AUTO/STAGED entry. | Shown in "Auto-applied" section as an informational line (no action to override). |

## Append protocol

Skills append, never rewrite. Pattern:

1. Read the current contents (small file, cheap)
2. Append the new entry under the matching `## /{skill}` heading (create the heading if absent)
3. Write the full updated contents back

For the very first entry of a pipeline run, `/flow` (or the first standalone skill) writes the file header and the pipeline config snapshot. Subsequent entries are added under skill headings.

**One command per entry.** `bin/log-decision.js` performs steps 1-3 for a single entry — format
per the Entry schema above; when `--section` is passed, the entry is placed under the `## /{skill}`
heading (creating it when absent), otherwise appended at EOF. It refuses to write with exit `3`
when the run dir is missing, not anchored under `$RUN_ROOT` (`_shared/pipeline-run-dir.md`'s
Anchoring section — i.e. a worktree-local shadow), or unwritable, so a worktree-local shadow is
never written silently:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/log-decision.js" --run "$PIPELINE_RUN_DIR" --status AUTO \
  --section "/{skill-name}" --step "{step or location}" --text "{short action}" --reversibility high \
  [--spec <n>] [--lever "<key>=<value> (<source>)"]
```

Prefer it over composing the line by hand or via a scratch `node -e` at every AUTO/STAGED site.

**Staged proposal files** (the `staged/` directory a `STAGED` entry points at) are written the
same way — through a CLI, never a hand-rolled `fs.writeFileSync`:
`bin/stage-item.js --run <run-dir> --id <kind>-<n> --file <path>` copies the caller-composed
proposal at `<path>` into `<run-dir>/staged/<id><ext>` (extension taken from `<path>`), anchoring
`--run` under the main checkout the same way `bin/log-decision.js` does. `<kind>-<n>` is the same
item-id shape `_shared/console-on-pr.md`'s "Item ID scheme" assigns at render time; a caller
staging a new proposal composes its own descriptive id (e.g. `leftover-{slug}`,
`polish-suggestion-{n}`) — the console re-keys rows to `{kind}-{n}` only when it renders them, not
when they are written. This binds new and migrated call sites going forward — it is not a claim
that every existing `staged/` writer already goes through this CLI; several pre-date it (e.g.
`test/SKILL.md`'s `test-fix-*.patch`, `reflect/SKILL.md`'s `reflect-*.md`) and migrate on their own
schedule.

**Regardless of worktree state.** `bin/log-decision.js` (above) is the sole append path for `decisions.md` — unconditional, regardless of whether the session sits in a worktree or the main checkout. The run directory is always anchored to the main checkout (`_shared/pipeline-run-dir.md`'s Anchoring section); a worktree session's `Edit`/`Write`/heredoc/redirect attempts against a file under it are refused by the harness regardless of whether a worktree exists for this run — worktree existence was never the deciding factor, and there is no separate append shape for the worktree case.

## Reading the log (for /wrap-up Review Console)

The Review Console reads the log file for the current pipeline run:

1. Resolve `PIPELINE_RUN_DIR` env var, or find the most recent run matching the current spec
2. Read `{run-dir}/decisions.md`
3. Group entries by status: AUTO / STAGED / KEPT-PROMPT / SCANNED
4. List staged artifacts from `{run-dir}/staged/`
5. Present in the Review Console (see `/wrap-up`'s Phase 4)

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
| Logging KEPT-PROMPT for decisions that were never auto candidates | KEPT-PROMPT is only for "auto would have applied but a floor failed." For decisions inherently not silenceable (capture routing), don't log — they're not auto-decisions. |
| Writing the log to `docs/plans/` or any git-tracked path | The log is runtime state. Pipeline runs are not committed history. Use `.claude-tweaks/pipelines/{run-id}/`. |

## Consumers

- `/wrap-up` Review Console — reads for display in Phase 4
- `plugin/bin/lib/calibration/tsv-reader.js` — parses logged terminal-decision entries for calibration analysis (surfaced via `/claude-tweaks:tidy`'s calibration read-out row)
