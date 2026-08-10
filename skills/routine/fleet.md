# Routine — Fleet Mode (`fleet on`)

Loaded by `/claude-tweaks:routine`'s Workflow dispatch when the resolved mode is `fleet on`. Turns on the self-maintaining posture in one deliberate action: a Manifesto collecting the human-owned policy decisions, then instantiation of every fleet routine from the project's already-parameterized templates, staggered so they don't collide, with an idempotent reconcile on every re-run. `fleet status` and `fleet off` are a companion leaf's job (Non-Goals) — this file covers `on` only, and `on`'s own re-run **is** the reconcile path (there is no separate `fleet reconcile` verb).

This mode is a loop over the existing CREATE/UPDATE procedure (`create-and-update.md` in this skill's directory), parameterized by the composition table below — never a reimplementation of `RemoteTrigger` handling. Read `create-and-update.md` and `schedule-resolution.md` first; this file states only what fleet mode does differently (per-entry naming, fleet-resolved cron instead of the interactive picker, the reconcile marker rule, and the Manifesto/conditional-provisioning wrapper around the loop).

## Fleet composition table

Two buckets, named explicitly (never restated elsewhere as a bare list, per this project's cardinality-drift rule — this table is the one place the fleet's membership is enumerated):

| # | Bucket | Entry | Source template | `focus` override | Cron (UTC) | PREFIXED_NAME |
|---|---|---|---|---|---|---|
| 1 | Vertical finder | dead-code | `skills/code-health/routine-template.yml` | `dead-code` | `0 5 * * *` | `{REPO_SLUG}-code-health-dead-code` |
| 2 | Vertical finder | test-hygiene | `skills/code-health/routine-template.yml` | `test-hygiene` | `15 5 * * *` | `{REPO_SLUG}-code-health-test-hygiene` |
| 3 | Vertical finder | abstraction-police | `skills/code-health/routine-template.yml` | `abstraction-police` | `30 5 * * *` | `{REPO_SLUG}-code-health-abstraction-police` |
| 4 | Vertical finder | experiment-cleanup | `skills/code-health/routine-template.yml` | `experiment-cleanup` | `45 5 * * *` | `{REPO_SLUG}-code-health-experiment-cleanup` |
| 5 | Generalist sweep | code-health (generalist) | `skills/code-health/routine-template.yml` | none | `0 6 * * *` | `{REPO_SLUG}-code-health-daily` |
| 6 | Generalist sweep | docs-health | `skills/docs-health/routine-template.yml` | n/a | `15 6 * * *` | `{REPO_SLUG}-docs-health-daily` |
| 7 | Generalist sweep | journey-health | `skills/journey-health/routine-template.yml` | n/a | `30 6 * * *` | `{REPO_SLUG}-journey-health-daily` |
| 8 | Generalist sweep | harness-health | `skills/harness-health/routine-template.yml` | n/a | `45 6 * * *` | `{REPO_SLUG}-harness-health-daily` |
| 9 | Grant unit (conditional) | backlog grant | `skills/backlog/routine-template.yml` | n/a | `0 9 * * 1-5` | `{REPO_SLUG}-backlog-grant-weekdays` |
| 10 | Dispatch drain | dispatch | `skills/dispatch/routine-template.yml` | n/a | `0 10 * * 1-5` | `{REPO_SLUG}-dispatch-weekdays` |
| 11 | Tidy | tidy weekly | `skills/tidy/routine-template.yml` | n/a | `0 11 * * 0` | `{REPO_SLUG}-tidy-weekly` |

`{REPO_SLUG}` is `create-and-update.md` CREATE Step 2's own derivation (lowercased, non-`[a-z0-9]` runs collapsed to `-`, trimmed) — resolve it once per fleet run and reuse it across every row.

**Stagger rationale (the exact defaults, settled here — not implementer-invented at some later point, per the parent record's Acceptance Criteria):** rows 1-8 (vertical finders + generalist sweeps) sit in the 05:00-07:00 UTC early-morning window at 15-minute offsets — cheap, read-only sweeps that don't compete with each other for the same repo state. Row 9 (grant unit) sits at 09:00, after the finders have had time to file anything new but before the dispatch drain would otherwise claim records nobody has reviewed. Row 10 (dispatch drain) sits at 10:00, after the grant unit so freshly-granted `auto:build`/`auto:merge` records are visible to it the same morning. Row 11 (tidy) is weekly, Sunday 11:00, clear of every daily/weekday row above.

**Naming deviates from `create-and-update.md`'s standard `{REPO_SLUG}-{routine_name}` derivation for rows 1-4 only** — code-health's `routine_name` (`code-health-daily`) is fixed across all five code-health instances (rows 1-5), so reusing it verbatim would collide four times over. Rows 1-4 use `{REPO_SLUG}-code-health-{focus}` instead (dropping the `-daily` suffix, since a focus-scoped routine isn't the daily generalist). Row 5 (the generalist) keeps the standard derivation unchanged — `{REPO_SLUG}-code-health-daily` is exactly what a standalone `/claude-tweaks:routine create code-health` would also produce, so a project that already ran that command before ever running `fleet on` gets that routine *adopted into* the fleet on first reconcile (Idempotent reconcile, below), not duplicated. Rows 6-11 use the standard derivation unchanged, one instance per template.

**Composition, not exhaustiveness.** A repo missing a template (e.g. a fork of this plugin that dropped `journey-health/`) gets a **partial fleet**: provision every row whose template exists, skip the rest, and name each skipped row plus the skill it belongs to in the summary — never a refusal, never silence (per this leaf's own Deliverables).

## Step 1 — Manifesto

One structured message, the bookend "begin stop" for this action (`_shared/auto-mode-contract.md`'s bookend pattern — this is a single-instance bookend for one `fleet on` invocation, not a multi-step pipeline). Collects every human-owned lever `fleet on` needs, **renders each one back before writing anything** (IL-114 — a render instruction does not bind itself; this is the explicit pre-write check that closes it):

1. Read current values: `autonomy` (`.claude-tweaks/policy.yml`, default `supervised`), `grant-origination-enabled` (default `false`), `automerge-max-lines`/`automerge-max-files` (defaults `40`/`2`), `merge-sensitive-paths` (default `[]`), `fleet-daily-grant-cap` (default unset/uncapped) — all five already schema-registered in `bin/lib/policy-schema.js` (the first two by this leaf's own prerequisite work in `_shared/autonomy-ceiling.md`; `automerge-max-lines`/`automerge-max-files`/`merge-sensitive-paths` predate this leaf; `fleet-daily-grant-cap` landed with #269 — this leaf reads it, never re-registers it).
2. Render every value as a table — key, current value, source (policy.yml / default) — **before** any `AskUserQuestion` call, so the render-then-write ordering IL-114 requires is structural, not a documentation promise:

   ```
   ### Fleet Config (Manifesto)
   | Lever | Current | Meaning |
   |---|---|---|
   | autonomy | supervised | Ceiling on autonomous action — 'unattended' + the opt-in below are both required to provision the grant unit (row 9) |
   | grant-origination-enabled | false | The reserved second opt-in `_shared/autonomy-ceiling.md` names — a human sets this deliberately, no skill ever writes it except this Manifesto |
   | automerge-max-lines / automerge-max-files | 40 / 2 | Consumed by assess-agent-autonomy/dispatch/the grant gate — this Manifesto persists them, never validates their semantics |
   | merge-sensitive-paths | (none) | Same — persisted only |
   | fleet-daily-grant-cap | (unset — uncapped) | Grants-issued-per-UTC-day ceiling the grant unit's own gate chain reads (see the choke-point note below) |
   ```

3. Call `AskUserQuestion` with `question`: `"Confirm fleet configuration before provisioning?"`, `header`: `"Fleet config"`, `multiSelect`: `false`:
   - Option 1 — `label`: `"Provision with current values (Recommended)"`, `description`: `"Use the levers shown above — supervised-only fleet unless autonomy/grant-origination-enabled are already both set"`
   - Option 2 — `label`: `"Change a lever"`, `description`: `"Edit autonomy, grant-origination-enabled, automerge caps, merge-sensitive-paths, or fleet-daily-grant-cap before provisioning"`
   - Option 3 — `label`: `"Cancel"`, `description`: `"Don't provision anything"`

   Selecting **Change a lever** re-asks each of the five as its own follow-up (autonomy/grant-origination-enabled as enum/boolean pickers; automerge-max-lines/automerge-max-files as integers; merge-sensitive-paths as a free-text comma list; fleet-daily-grant-cap as an optional positive integer), writes every changed value to `.claude-tweaks/policy.yml` in the shape `bin/lib/policy-schema.js` expects, re-renders the table with the new values, then proceeds as if Option 1 had been chosen. Selecting **Cancel** stops here — nothing is provisioned, nothing is written.

4. **Every value this step writes echoes in the fleet summary at the end** (Step 5) — no silent config write, per this leaf's own Deliverables.

## Step 2 — Cloud-parity honesty check

Fleet routines are scheduled Routines — the exact case CLAUDE.md's Cloud Parity section says the Setup script is measured **not** reaching (IL-113/IL-117). This step never fixes or guarantees anything; it only reports a known gap before creating infrastructure against it, so `fleet on` never silently assumes firings will work:

1. Run the same declaration check `skills/init/bootstrap/step-14-cloud-routine-parity.md`'s Detect section runs: read this project's `.claude/settings.json#enabledPlugins`, confirm `claude-tweaks@claude-tweaks-marketplace` and `superpowers@claude-plugins-official` are both declared.
2. Confirm `scripts/claude-cloud-setup.sh` exists in this repo.
3. If either check fails, report the specific gap (which plugin is undeclared, or that the script is missing) and call `AskUserQuestion` with `question`: `"Cloud/Routine parity isn't fully configured — proceed anyway?"`, `header`: `"Parity gap"`, `multiSelect`: `false`:
   - Option 1 — `label`: `"Proceed anyway"`, `description`: `"Provision the fleet; note the gap in the summary — run /claude-tweaks:init Step 14 to close it later"`
   - Option 2 — `label`: `"Stop and fix parity first"`, `description`: `"Don't provision anything — run /claude-tweaks:init to declare plugins and generate the setup script"`

   This is neither an unconditional refusal nor a silent proceed — the explicit choice this leaf's Deliverables require. Record whichever was chosen in the summary (Step 5); "Proceed anyway" records the acknowledged gap verbatim.
4. Both checks passing is a silent pass-through — no prompt, proceed to Step 3.

## Step 3 — Conditional grant-unit provisioning

Row 9 (backlog grant) provisions **only when both** `autonomy: unattended` **and** `grant-origination-enabled: true` hold after Step 1 — "the unattended keys," exactly these two fields, no third, no paraphrase (per this leaf's own Deliverables wording).

- **Both set** → row 9 provisions like every other row in Step 4's loop.
- **Either unset** → skip row 9 entirely; the summary states plainly that the grant unit was withheld and names which policy change(s) would enable it (e.g. "grant unit withheld — set `autonomy: unattended` and `grant-origination-enabled: true` in `.claude-tweaks/policy.yml` to enable").
- **Downgrade on re-run** — a prior `fleet on` provisioned row 9 (both keys were set then), and this Manifesto pass now reads `supervised` (or `grant-origination-enabled: false`): row 9's existing record is not silently left running unexplained. Check whether the routine skill's pause verb exists (#213); if it does, pause row 9's live routine and note "paused — autonomy downgraded to {ceiling}" in the summary. If no pause verb exists yet, leave the routine running and surface it prominently in the summary instead: "grant unit still live but autonomy is now {ceiling} — remove `{PREFIXED_NAME}` manually at claude.ai/code/routines, or restore the unattended keys." Either way this is **harmless-by-construction**: `bin/lib/issues/grant-gate.js`'s own gate chain re-checks the ceiling on every firing and denies every candidate at `supervised` (Gate 0, per `grant-mode.md`'s own contract) — a still-live but downgraded grant unit fires, finds nothing it's allowed to grant, and reports a clean no-op. State this explicitly in the summary so the human doesn't read "still live" as still-dangerous.

## Step 4 — Per-routine provisioning loop

For every row in the composition table whose source template exists on disk (Composition, not exhaustiveness — above), and that Step 3 didn't withhold:

1. **Resolve `PREFIXED_NAME`** from the table (row 5-11 via `create-and-update.md` CREATE Step 2's standard derivation; rows 1-4 via this file's own `{REPO_SLUG}-code-health-{focus}` naming — both above).
2. **Idempotent reconcile marker check** (this is the loop's create-vs-update fork, and the "fleet marker" decision rule, fixed here): run `record-freshness.md` Steps F1-F2 for `{PREFIXED_NAME}.yml`, exactly as `create-and-update.md` CREATE Step 3 does.
   - `presence: none` (no local or upstream record) → before treating this as a fresh create, check for a **name collision**: call `RemoteTrigger {action: "list"}` once per fleet run (reuse across every row in this loop — don't re-list per row), filter to triggers whose `job_config.ccr.session_context.sources[].git_repository.url` matches this project's resolved repo URL (same filter as `create-and-update.md` CREATE Step 4 source (b)) **and** whose `name` equals this row's `PREFIXED_NAME`. A match here is a routine created by hand (or by a tool other than this skill) that happens to collide with the fleet's deterministic name — **detected and reported, never adopted or overwritten**: skip this row, note the collision in the summary ("`{PREFIXED_NAME}` already exists as a live routine not tracked by any record — rename it or remove it before re-running `fleet on`"), and move to the next row. No match → proceed to CREATE below.

     **Why name-prefix, not a metadata field:** `RemoteTrigger create`'s body (`create-and-update.md` Step 6) carries no field beyond `name`/`cron_expression`/`job_config`/`mcp_connections` that could hold an owner tag — confirmed against that step's own body schema. The deterministic `PREFIXED_NAME` is therefore the only marker available today; if a future `RemoteTrigger` version adds a metadata field, this check should read it directly instead of the list-and-filter above, but until then the fallback is unconditional, not merely a degraded path.
   - `presence: both` or `local-only` (a record exists) → **reconcile**, not create: run Drift detection below.
   - `presence: upstream-only` → same STOP as `create-and-update.md` CREATE Step 3 (BLOCKED — creating now would mint a duplicate live routine). Report it for this row and continue with the rest of the loop; do not abort the whole fleet run over one row.
3. **CREATE** (no record, no collision): follow `create-and-update.md` CREATE Steps 4 (environment — resolves once, reused across every row in this loop, since one project has one environment) through 9, with two fleet-specific substitutions:
   - **Step 5 (schedule) is replaced entirely** by this row's own composition-table cron — never the template's `default_schedule.cron_expression`, and never the interactive picker (5b-5d). Fleet mode supplies its own coordinated stagger; asking per-row would re-introduce the collision risk staggering exists to avoid.
   - **Step 6 (assemble body)**, for rows 1-4 only: after computing `RESOLVED_PROMPT` per the template's own substitution table, append `focus=<value>` to the kickoff line per `_shared/routine-template-schema.md`'s `focus` field contract (`Then: /claude-tweaks:code-health focus=dead-code`, etc.) — this is exactly the mechanism that field was reserved for.
   - Step 7's preview/confirm collapses into the Manifesto's own confirm (Step 1 above) for a `fleet on` run — do not re-prompt per row; render each row's assembled preview as one line in a single batch table before Step 4's loop actually calls `RemoteTrigger create` for any row (batch-table convention, not N separate confirms).
   - Step 9 writes the instantiated record exactly as documented, using this row's `PREFIXED_NAME` as the record's filename.
4. **RECONCILE** (a record exists): re-render `RESOLVED_PROMPT` fresh from the row's current template + this run's resolved branch (and `focus=`, for rows 1-4) — the exact same computation Step 3 above's CREATE path would produce for this row today. Call `RemoteTrigger {action: "get", trigger_id: record.routine_id}` and read the live prompt back off `job_config.ccr.session_context.events[].data.message.content` (or the equivalent field the `get` response actually returns — same field CREATE's body assembles into). Compare:
   - **Prompt differs, or the live `cron_expression` differs from this row's composition-table cron** → drift. Run `create-and-update.md` UPDATE Steps 4-7 (assemble, diff, confirm folded into the batch table below, call `RemoteTrigger update`, rewrite the record) for this row.
   - **Both match** → no drift. Nothing to do for this row; note it in the summary as "reconciled, no drift" (AC1's exact expected wording).

   **This is re-render-and-compare, never a `template_version` check** (IL-89) — `template_version` still gets rewritten in the record on an update, but it is never itself the trigger; the byte comparison above is.

## Step 5 — Fleet summary

One consolidated report, closing the Manifesto's begin-stop with an end-of-action summary (not a second bookend — a single `fleet on` invocation is short enough that Manifesto-then-summary is the whole interaction):

```markdown
## Fleet: Provisioning Complete

### Config (from Step 1)
| Lever | Value | Source |
|---|---|---|
| autonomy | {value} | {policy.yml | default} |
| grant-origination-enabled | {value} | {policy.yml | default} |
| automerge-max-lines / automerge-max-files | {v}/{v} | {...} |
| merge-sensitive-paths | {list or "(none)"} | {...} |
| fleet-daily-grant-cap | {n or "(uncapped)"} | {...} |

### Cloud parity
{"OK — claude-tweaks + superpowers declared, setup script present." | "Gap acknowledged: {what's missing} — proceeded anyway." | "N/A — parity check not run (Step 2 was skipped)."}

### Routines
| Row | Entry | Status | Schedule | Console URL |
|---|---|---|---|---|
| 1 | dead-code | Created | 05:00 UTC daily | {url} |
| ... | ... | ... | ... | ... |
| 9 | backlog grant | Withheld — set autonomy: unattended + grant-origination-enabled: true to enable | — | — |
| — | (missing template) | Skipped — {skill} has no routine-template.yml | — | — |

Status is one of: `Created`, `Updated (drift)`, `Reconciled, no drift`, `Withheld — {reason}`, `Collision — {PREFIXED_NAME} already exists, not tracked by any record`, `Skipped — {skill} has no routine-template.yml`, `BLOCKED — record exists upstream only, not in this checkout`.
```

## Anti-Patterns

| Pattern | Why It Fails |
|---|---|
| Re-deriving repo URL / `REPO_SLUG` / environment per row | `create-and-update.md` CREATE Steps 2 and 4 resolve these once per project, not per routine — a fleet with 11 rows makes 11x the `RemoteTrigger`/git calls for values that don't change across rows |
| Comparing `template_version` to decide drift | IL-89 — a version string proves nothing about content. Re-render the prompt and compare bytes (Step 4's RECONCILE) |
| Treating a `presence: none` + live-routine-name-match as "adopt it" | The routine wasn't created by this skill (no record exists) — adopting it silently could overwrite a hand-tuned prompt with no way to recover it (`RemoteTrigger` has no delete-and-restore). Report the collision; never touch it |
| Provisioning row 9 because `autonomy: unattended` alone is set | The reserved second opt-in (`grant-origination-enabled`) is deliberately a separate human decision — `_shared/autonomy-ceiling.md`'s whole point is that the ceiling alone never authorizes a machine-originated grant |
| Silently deleting or pausing a downgraded grant-unit routine | Deletion has no undo (`RemoteTrigger` has no delete API to call in the first place, at claude.ai/code/routines this is a manual step) — pause when the verb exists, otherwise surface prominently, never act unprompted beyond what Step 3 documents |
| Re-prompting per row for schedule/environment/confirm | Fleet mode's whole point is one deliberate action — the Manifesto (Step 1) and the batch preview (Step 4.3) are the only confirmation points; 11 separate `AskUserQuestion` calls would defeat "one-action provisioning" |
| Treating a missing template as a fleet-wide failure | Composition, not exhaustiveness — provision what exists, name what's missing, never refuse the whole fleet over one absent template |
