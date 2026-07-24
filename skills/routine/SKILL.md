---
name: claude-tweaks:routine
description: Use when you want to create, update, or check the status of a Claude Code cloud Routine for a claude-tweaks skill — instantiates a versioned, project-agnostic routine template (e.g. code-health's) into a live, account-and-project-specific scheduled routine via the RemoteTrigger API. Keywords - routine, schedule, cron, cloud agent, recurring, automation.
argument-hint: "<create|update|status> <skill> [--variant <name>] [--dry-run] [--defaults] [--environment <id>] [--refresh-environment]"
---
> **Interaction style:** Present single decisions via the `AskUserQuestion` tool (options with one marked Recommended) instead of a plain-text numbered list. For multi-item decisions, render a batch table with recommended actions pre-filled, then capture the apply-all/override decision via one `AskUserQuestion` call. Never make more than one `AskUserQuestion` call per logical decision — resolve each before showing the next. End skills with a `## Next Actions` block rendered via `AskUserQuestion` (context-specific options, one recommended), not a navigation menu.

# Routine — Instantiate Versioned Cloud Routines

Turns a skill's plugin-shipped routine template into a live Claude Code cloud Routine for the current project — resolving the account- and project-specific values (environment, repo) that a portable template can't hardcode, then driving the `RemoteTrigger` API directly. Skips `/schedule`'s own conversational flow entirely: the template already has the answers.

```
              [ /claude-tweaks:routine ] <- utility (no fixed lifecycle position)
                           |  reads {skill}/routine-template.yml
                           v
template + resolved project/account values -> RemoteTrigger create/update -> .claude-tweaks/routines/{name}.yml
```

## When to Use

- You want a skill's documented "Routine Configuration" to become a real, live scheduled cloud Routine instead of a manual `/schedule` walkthrough.
- You want that routine's config captured as a versioned, reproducible project artifact — not something that only exists in claude.ai's UI.
- You're setting up the same kind of routine (e.g. code-health) in a new project and want it created the same way every time, without re-answering `/schedule`'s interactive questions from scratch.

Not for: one-off or exploratory routines you don't want templated (use `/schedule` directly). Not a replacement for `/schedule`'s `list`/`run` conveniences or for deleting a routine — deletion has no API and always happens at claude.ai/code/routines.

## Input

`$ARGUMENTS`:

| Argument | Behavior |
|---|---|
| `create <skill>` | Instantiate `<skill>`'s routine template into a live routine for the current project. Routes to the UPDATE workflow automatically if an instantiated record already exists for this project+skill+variant combination. |
| `update <skill>` | Re-sync an existing routine against its (possibly changed) template. |
| `status <skill>` | Show the instantiated record(s) alongside live routine state. With no `--variant`, lists every instantiated variant found for `<skill>`. |
| `--variant <name>` | Use `skills/{skill}/routine-template-<name>.yml` instead of the default `skills/{skill}/routine-template.yml`. Combine with `create`/`update`/`status`. Omit for the default template — fully backward compatible with every existing consumer (code-health, dispatch, harness-health, journey-health, docs-health), none of which ship a variant; `tidy` is the only skill with a named variant today (see Relationship below). `/claude-tweaks:flow` does not ship a routine template at all — it is reached only indirectly via `/claude-tweaks:dispatch`'s template (see Relationship below). |
| `--dry-run` (combine with `create`/`update`) | Assemble and display the `RemoteTrigger` body; never make a `create`/`update` call (read-only `list`/`get` calls to resolve values are still permitted), never write or rewrite the instantiated record. |
| `--defaults` (combine with `create`) | Skip Step 5's interactive cadence picker (use the template's own `default_schedule.cron_expression` verbatim) and Step 7's interactive confirm (proceed straight to creation once the body is assembled) — for non-interactive/batch creation. Environment still resolves via Step 4 (cache, `list`, or `--environment`); if none of those yields a value, `--defaults` does not suppress that one unavoidable prompt. |
| `--environment <id>` (combine with `--defaults`, or standalone) | Use this environment ID directly in Step 4, skipping cache/list lookup. |
| `--refresh-environment` (combine with `create`/`update`) | Bypass both the environment cache and the `RemoteTrigger list` heuristic in Step 4 — go straight to asking the user directly which environment to use, then overwrite `.claude-tweaks/routine-environment-cache.yml` with the freshly chosen value. Use this to correct a stale or wrongly-inferred cached/inferred environment without already knowing its raw ID. Mutually exclusive in effect with `--environment <id>` — if both are passed, `--environment` wins (it already skips every other source, including this one) and no prompt occurs. |
| `--source <parent-skill>` | Used by a parent skill (e.g. `/claude-tweaks:init`) to identify itself as the caller; see Component-Skill Contract below. |

## Workflow

### CREATE `<skill>`

**Step 0 — Worktree check (only when `.claude-tweaks/policy.yml` sets `worktree.always: true`).** This skill writes twice — Step 4's environment cache and Step 9's instantiated record — and this project's PreToolUse hook denies any `Write` issued from a non-isolated checkout under that policy, with no bookkeeping exemption; `/claude-tweaks:routine` has no pipeline orchestrator upstream to have already set one up, so nothing protects this invocation by default. Before proceeding: if the current session is not already inside a linked git worktree (check via `git rev-parse --show-toplevel` against the main checkout root, or via `EnterWorktree`/`isolation: "worktree"` already being active), set one up first — `/superpowers:using-git-worktrees` or `EnterWorktree`, branched from current HEAD — and run the rest of this workflow, including Steps 4 and 9's writes, from inside it. `.claude-tweaks/routines/{PREFIXED_NAME}.yml` is meant to be committed (it's a versioned project artifact), so commit it inside the worktree as usual, then merge the branch back into the main checkout (`git merge --ff-only`) before reporting the console URL to the user — the record isn't durably part of the project until that merge lands. `.claude-tweaks/routine-environment-cache.yml` is gitignored and project-local; writing it inside the worktree is fine — it exists only to spare a second skill invocation in the same checkout from re-deriving the value. If `worktree.always` isn't set, skip this step and proceed directly to Step 1.

**Step 1 — Load the template.** When `--variant=<name>` was passed, read `${CLAUDE_PLUGIN_ROOT}/skills/{skill}/routine-template-<name>.yml`; if it doesn't exist, stop: "`{skill}` has no routine-template-{name}.yml — check the variant name." Otherwise (no `--variant`), read `${CLAUDE_PLUGIN_ROOT}/skills/{skill}/routine-template.yml` exactly as before; if it doesn't exist, stop: "`{skill}` has no routine-template.yml — it doesn't support routines yet." The field schema — identical for the default template and every named variant — is documented once in `skills/_shared/routine-template-schema.md` — read it if any field's meaning is unclear.

**Step 2 — Resolve the repo URL and derive the project-prefixed name.**

```bash
git remote get-url origin
```

Normalize to full HTTPS the same way `/schedule` does: accept `org/repo`, `git@github.com:org/repo.git`, or `https://github.com/org/repo` and produce `https://github.com/{org}/{repo}` (strip any `.git` suffix, convert the SSH form). If the command fails (no `origin` remote, not a git repo, etc.), stop and ask the user for the repo URL directly instead of proceeding with an empty or invalid value.

Derive `REPO_SLUG` from the resolved URL's `{repo}` segment: lowercase it, replace any run of characters outside `[a-z0-9]` with a single `-`, and trim leading/trailing `-`. Set `PREFIXED_NAME = "{REPO_SLUG}-{template.routine_name}"` (e.g. repo `claude-tweaks` + `routine_name: code-health-daily` → `claude-tweaks-code-health-daily`). Use `PREFIXED_NAME` everywhere the rest of this workflow refers to the routine's name or the record's filename — never the template's bare `routine_name` alone.

**Step 3 — Idempotency check.** Check whether `.claude-tweaks/routines/{PREFIXED_NAME}.yml` already exists in the current project. If it does, stop this workflow and continue at UPDATE below instead — never create a second routine for the same project+skill+variant combination. (`PREFIXED_NAME` already encodes the loaded template's `routine_name`, which differs per variant by construction — creating `tidy` with `--variant=github-triage` while `tidy-weekly`'s record already exists is a legitimate second instance, not a duplicate; see the Anti-Patterns table below.)

**Step 4 — Resolve `environment_id`.** If `--environment <id>` was passed, use it directly — skip every other source below. Otherwise, if `--refresh-environment` was passed, skip the cache and `list` sources too — go straight to asking the user directly which environment to use (the same prompt used below when no source yields a value), then continue to the cache-write step below with the freshly chosen value, overwriting whatever the cache file already held. Otherwise: check `.claude-tweaks/routine-environment-cache.yml` in the current project first. If it exists and contains an `environment_id` value, use it silently — no confirmation prompt. Otherwise, load the tool with `ToolSearch select:RemoteTrigger`, then call `{action: "list"}`. If existing routines are returned, read `job_config.ccr.environment_id` off the most recently created one and use it silently. If none of these three sources yields a value, ask the user directly which environment to use — present whatever environment names/IDs are available in context; if none are, ask the user to name one (they can check via `/schedule` once if unsure). Do not cache this value anywhere under `~/.claude-tweaks/` — that path is harness-owned, not skill-owned.

After an environment is resolved (from `--environment`, the cache, `list`, or direct user input), write it to `.claude-tweaks/routine-environment-cache.yml` (skip this write if `--dry-run` was passed):

```yaml
environment_id: "<resolved environment_id>"
```

This file is project-local and must stay gitignored — it exists purely to spare a second skill in the same project from re-deriving the same environment, never to make the value portable across projects or accounts.

**Step 5 — Resolve the schedule.**

On the default forward path — reached before any Customize selection, whether or not `--defaults` was passed — skip the interactive picker entirely: use the template's `default_schedule.cron_expression` verbatim as the resolved cron. Still run 5a's classification below to produce the human-readable form Step 7's preview needs (e.g. "Daily, 03:00 UTC"). The picker itself (5b-5d) is reached only when Step 7's Customize branch is selected — never on the default forward path, regardless of `--defaults`.

**5a. Parse a cron expression back into a cadence** (here, the template's `default_schedule.cron_expression`; UPDATE Step 3 reuses this same sub-step against the instantiated record's `schedule` field instead — the classification logic below is source-agnostic, it only looks at the cron string itself). Given the 5-field cron string `M H DOM MON DOW` (always UTC), classify it against these patterns in order — the first match wins:

| # | Pattern (MON/DOM/DOW fixed values, H/M shape) | Cadence | Parsed value |
|---|---|---|---|
| 1 | `MON=*`, `DOM=*`, `DOW=*`, `M=0`, `H` matches `*/N` | Every N hours | N |
| 2 | `MON=*`, `DOM=*`, `DOW=*`, `H`/`M` plain integers | Daily | time `H:M` UTC |
| 3 | `MON=*`, `DOM=*`, `DOW=1-5`, `H`/`M` plain integers | Weekdays only | time `H:M` UTC |
| 4 | `MON=*`, `DOM=*`, `DOW` a single digit 0-6, `H`/`M` plain integers | Weekly | day = DOW (0=Sun..6=Sat), time `H:M` UTC |
| 5 | `MON=*`, `DOW=*`, `DOM` a plain integer 1-31, `H`/`M` plain integers | Monthly | day-of-month = DOM, time `H:M` UTC |
| 6 | Anything else | (no match) | none — no cadence pre-selected |

Row 1 requires `M=0` because every cron this workflow itself generates for "Every N hours" is `0 */N * * *` (see 5c below) — a custom-typed cron with an `H` shaped like `*/N` but a non-zero minute (e.g. `15 */6 * * *`, entered via 5b's `Other` field on an earlier run) is *not* safely re-classifiable as "Every N hours," since accepting the N-only picker on a later re-parse would silently reset that minute offset to 0. Such a cron falls through to row 6 instead (no cadence pre-selected) — it still parses fine as a raw string everywhere else, it just isn't offered as a pre-filled recommendation.

**5b. Present the cadence picker.** (On the CREATE flow, reached only via Step 7's Customize branch — never on CREATE's default forward path, regardless of `--defaults`; see above. UPDATE Step 3 invokes 5a-5d directly, with no Customize branch of its own.) Call `AskUserQuestion` with `question`: `"How often should this routine run?"`, `header`: `"Cadence"`, `multiSelect`: `false`, and exactly these 4 options — a typed cron expression is still available via the tool's built-in `Other` field, so there is no separate "Custom cron expression" option consuming one of the 4 slots:

- Option 1 — `label`: `"Every N hours"`, `description`: `"Fires every N hours starting from UTC midnight (e.g. N=3 fires at 00:00, 03:00, 06:00 UTC, ...)"`
- Option 2 — `label`: `"Daily"`, `description`: `"Fires once a day (or on weekdays only) at a UTC time you choose"`
- Option 3 — `label`: `"Weekly"`, `description`: `"Fires once a week on a day you choose, at a UTC time you choose"`
- Option 4 — `label`: `"Monthly"`, `description`: `"Fires once a month on a day-of-month you choose, at a UTC time you choose"`

Mark `(Recommended)` according to the 5a match: rows 1, 4, and 5 map directly to the same-named option above. Rows 2 and 3 (Daily and Weekdays only) both map to the **Daily** option — weekdays-only is now a follow-up modifier under Daily, not a separate top-level choice (see 5c). Row 6 (no match) also recommends **Daily**, as the sensible fallback rather than leaving nothing marked.

**5c. Per-cadence follow-up**, based on which option was chosen in 5b. Each follow-up bundles every sub-answer it needs into a single `AskUserQuestion` call (multiple `questions` entries in one call) rather than one call per sub-answer:

- **Every N hours:** call `AskUserQuestion` with one question, `question`: `"Every how many hours?"`, `header`: `"Interval"`, `multiSelect`: `false`; if 5a pre-selected this cadence, pre-fill the recommended value from the parsed N — if that parsed N isn't among the common values offered as options, add it as its own explicit option so it can still carry `(Recommended)` (a value tucked inside `Other` can't be pre-marked recommended). Accept a free-text number via the tool's `Other` field (there is no fixed small set of sensible N values to enumerate as options — offer 2 or 3 common values as options, e.g. `"3"`, `"6"`, `"12"`, each undescribed beyond the number, plus rely on `Other` for anything else). Reject N < 1 with the same rejection wording the existing minimum-interval check uses today ("reject anything tighter and ask for a looser schedule"). Resulting cron: `0 */N * * *`. No time-of-day follow-up for this cadence — a sub-daily `*/N` cycle anchored at UTC hour 0 has no single time-of-day to anchor, unlike the three calendar-based cadences below.
- **Daily:** call `AskUserQuestion` with **two** `questions` entries in the same call: (1) `question`: `"Every day, or weekdays only?"`, `header`: `"Days"`, `multiSelect`: `false`, options `"Every day"` and `"Weekdays only"` — mark `(Recommended)` on `"Weekdays only"` if 5a's match was row 3, otherwise mark `(Recommended)` on `"Every day"` (covers both row 2 and the row-6 fallback); (2) `question`: `"What UTC time?"`, `header`: `"Time"`, `multiSelect`: `false`, free-text `HH:MM` (24-hour) via `Other`, pre-filled as the recommendation from the parsed `H:M` when 5a matched row 2 or row 3. State the conversion example explicitly in question (2)'s prompt text, exactly as before: "e.g. 9am Europe/Copenhagen = 7am UTC, so you'd enter `07:00` here." Resulting cron: `M H * * *` if "Every day" was chosen, `M H * * 1-5` if "Weekdays only" was chosen.
- **Weekly:** call `AskUserQuestion` with **two** `questions` entries in the same call: (1) day of week (Sunday through Saturday; if 5a pre-selected this cadence, pre-fill the recommendation from the parsed day), (2) the same UTC time-of-day question as Daily's question (2) above. Resulting cron: `M H * * D` (D = 0-6, Sunday=0).
- **Monthly:** call `AskUserQuestion` with **two** `questions` entries in the same call: (1) day-of-month (1-31; if 5a pre-selected this cadence, pre-fill the recommendation from the parsed day), (2) the same UTC time-of-day question as Daily's question (2) above. Resulting cron: `M H D * *`.

A typed cron expression via `Other` on the 5b question bypasses 5c entirely — no parsing, no pre-selection, no time-of-day sub-prompt, identical to today's Custom cron path.

**5d. Validate and lock in.** For every cadence produced by 5b/5c, the resulting cron is assembled mechanically from the 5c inputs per the "Resulting cron" formulas above — no further confirmation prompt beyond what 5b/5c already gathered. For a typed cron via `Other`, validate it against the same 1-hour minimum interval floor as today — reject anything tighter and ask for a looser schedule, identical wording to before this change.

**Step 6 — Assemble the `RemoteTrigger create` body.**

```json
{
  "name": "<PREFIXED_NAME>",
  "cron_expression": "<resolved cron, UTC>",
  "job_config": {
    "ccr": {
      "environment_id": "<resolved environment_id>",
      "session_context": {
        "model": "<template.model>",
        "sources": [{"git_repository": {"url": "<resolved repo URL>"}}],
        "allowed_tools": <template.allowed_tools, verbatim — this is already an array, e.g. ["Bash", "Read", "Grep", "Glob"], do not add another layer of brackets>
      },
      "events": [{"data": {
        "uuid": "<fresh lowercase v4 UUID, generated now>",
        "session_id": "",
        "type": "user",
        "parent_tool_use_id": null,
        "message": {"content": "<template.prompt>", "role": "user"}
      }}]
    }
  }
}
```

If `template.mcp_connections` is non-empty, add a top-level `mcp_connections` array with `{connector_uuid, name, url}` entries (same shape `/schedule` uses) — warn the user if a named connector isn't currently connected, and direct them to https://claude.ai/customize/connectors.

**Step 7 — Preview and confirm.** Render the resolved schedule (human-readable, e.g. "Nightly at 03:00 UTC") and environment (e.g. "environment `env-abc123` (cached)") as plain text, along with the template's `notes` field (if present) so the user sees any tuning guidance before confirming. This creates live, billed infrastructure with no delete API, so the preview must always be shown — regardless of how automated everything upstream was.

If `--dry-run` was passed: print the assembled body and stop here. Do not call `RemoteTrigger`. Do not write an instantiated record. (This check applies whether or not `--defaults` was also passed — `--dry-run` always wins.)

If `--defaults` was passed (and not `--dry-run`): skip the `AskUserQuestion` call below — proceed straight to Step 8. The preview above is still shown, as a report rather than a prompt.

Otherwise, call `AskUserQuestion` with `question`: `"Create this routine with these settings?"`, `header`: `"Confirm routine"`, `multiSelect`: `false`, and:
- Option 1 — `label`: `"Yes, create with defaults (Recommended)"`, `description`: `"Proceed with the settings shown above"`
- Option 2 — `label`: `"Customize schedule or environment"`, `description`: `"Change the cadence, time, or environment before creating"`
- Option 3 — `label`: `"Cancel"`, `description`: `"Do not create anything"`

Marking "Yes, create with defaults" as `(Recommended)` is a deliberate change from this step's earlier no-bias convention — acceptable because the full assembled preview is always shown as part of the same round-trip; the safety property (review before commit) is preserved, only the bias-avoidance styling is relaxed.

Selecting **Customize** re-asks environment (present the value resolved in Step 4 as the recommended option, still overridable) and runs the cadence picker (5b-5d, reached for the first and only time here), producing a customized cron. Then re-render this same preview and confirm with the customized schedule/environment — but relabel Option 1 to `"Yes, create (Recommended)"` (dropping "with defaults," since the settings shown are no longer the template's defaults); Option 2 ("Customize...") and Option 3 ("Cancel") stay as before, so further adjustment remains possible. Selecting **Yes** (either the first "with defaults" render or a later customized re-render) or **Cancel** proceeds exactly as before — Step 8 (create) or stop.

**Step 8 — Create.** Call `RemoteTrigger {action: "create", body: <assembled body>}`. Read the routine/trigger ID and the claude.ai routine URL from the response (the tool appends a summary line with both). If the call fails (e.g. an invalid or stale `environment_id` silently reused from `.claude-tweaks/routine-environment-cache.yml`), report the error to the user, suggest re-running with `--refresh-environment` (or deleting `.claude-tweaks/routine-environment-cache.yml` directly) to force re-resolution, and stop — do not proceed to Step 9 or write an instantiated record for a failed create.

**Step 9 — Write the instantiated record.** Write `.claude-tweaks/routines/{PREFIXED_NAME}.yml`:

```yaml
routine_id: "<id from the create response>"
template: <skill>
template_version: <template.template_version>
created_at: "<current UTC timestamp, ISO 8601>"
schedule: "<resolved cron_expression>"
console_url: "<url from the create response>"
```

Report the console URL to the user.

### UPDATE `<skill>`

**Step 0 — Worktree check.** Same as CREATE Step 0 — run it here too, since `update` is often invoked directly rather than routed from CREATE's idempotency check, and Step 7 below writes the instantiated record just as CREATE Step 9 does.

**Step 1.** Load the template the same way as CREATE Step 1 (respecting `--variant` if passed; if missing, stop with the same message). Resolve the repo URL and derive `PREFIXED_NAME` the same way as CREATE Step 2. Require an existing `.claude-tweaks/routines/{PREFIXED_NAME}.yml` for the current project (routed here automatically from CREATE's idempotency check, or invoked directly). If none exists, tell the user to run `create <skill> [--variant=<name>]` first and stop.

**Step 2.** Compare the template's `template_version` (already read in Step 1) against the instantiated record's `template_version` — if they match and the user hasn't asked to change anything else, report "already in sync" and stop.

**Step 3.** Re-resolve environment and schedule — the two fields pre-fill from different sources, not both from the record. For environment, follow CREATE Step 4's procedure exactly: check `.claude-tweaks/routine-environment-cache.yml` first, falling back to `RemoteTrigger list` if the cache is empty — never the instantiated record itself, since the record schema deliberately never stores `environment_id` (see `skills/_shared/routine-template-schema.md`). For schedule, follow CREATE Step 5's full cadence-picker procedure (5a-5d), but parse the existing record's `schedule` field for the 5a pre-selection instead of the template's `default_schedule.cron_expression` — the record's own currently-active cron is the more relevant "what's running today" starting point on an update than the template's shipped default, which may no longer match what this project actually instantiated. (Repo URL and `PREFIXED_NAME` were already resolved in Step 1 — do not re-derive them.)

**Step 4.** Assemble the body the same way as CREATE's body-assembly step, then show a diff between the recorded config (schedule, template version, resolved values) and the freshly assembled one. If nothing changed, report that and stop.

**Step 5.** Review gate — same standard as CREATE's Step 7: show the diff, then call `AskUserQuestion` with `question`: `"Update this routine?"`, `header`: `"Confirm routine"`, `multiSelect`: `false`, and:
- Option 1 — `label`: `"Yes, update (Recommended)"`, `description`: `"Proceed with the assembled RemoteTrigger body shown above"`
- Option 2 — `label`: `"Cancel"`, `description`: `"Do not update anything"`

Marking "Yes, update" as `(Recommended)` follows the same reasoning as CREATE Step 7's confirm — the diff is always shown before this call, so the safety property (review before commit) is preserved even with a marked default.

If `--dry-run` was passed: show the diff and stop. Do not call `RemoteTrigger`. Do not rewrite the instantiated record.

**Step 6.** Call `RemoteTrigger {action: "update", trigger_id: <record.routine_id>, body: <assembled body>}`. If this call fails because `record.routine_id` no longer refers to an existing routine (e.g. deleted out-of-band at claude.ai/code/routines), report the record as stale and offer the same recourse as STATUS Step 2: delete `.claude-tweaks/routines/{PREFIXED_NAME}.yml` and re-run `create <skill>` instead — do not proceed to Step 7 or rewrite the instantiated record for a failed update.

**Step 7.** Rewrite the instantiated record with the resolved schedule, the new `template_version`, and a fresh `created_at` timestamp (this field doubles as "last written at") — preserving `routine_id`, `template`, and `console_url` from the existing record.

### STATUS `<skill>`

**Step 1.** When `--variant=<name>` was passed, load the template and resolve `PREFIXED_NAME`/record path exactly as CREATE Steps 1-2, then read that single `.claude-tweaks/routines/{PREFIXED_NAME}.yml`; if missing, report no routine for `<skill> --variant=<name>` and suggest `create <skill> --variant=<name>`. Stop.

When `--variant` is omitted: glob `${CLAUDE_PLUGIN_ROOT}/skills/{skill}/routine-template.yml` and `${CLAUDE_PLUGIN_ROOT}/skills/{skill}/routine-template-*.yml` to enumerate every template `<skill>` ships, read each one's `routine_name`, and derive `REPO_SLUG` (same recipe as CREATE Step 2) to check which of `.claude-tweaks/routines/{REPO_SLUG}-{routine_name}.yml` exist. If none exist, report that no routine has been created for `<skill>` in this project and suggest `create <skill>`. Stop. If exactly one exists, proceed with that single instance for the rest of this workflow, exactly as before. If more than one exists, run Steps 2-3.5 below once per existing instance and present all of them together, each labeled by its variant name (or "default" for the base template).

> **Parallel execution:** Use parallel tool calls aggressively — when more than one instantiated record exists, each instance's Step 2 `RemoteTrigger get` call targets a different `trigger_id` and is independent of every other instance's call, so issue them concurrently rather than iterating sequentially. Run each instance's Step 3/3.5 analysis and assemble the combined presentation after all `get` calls complete.

**Step 2.** Call `RemoteTrigger {action: "get", trigger_id: <record.routine_id>}` for live state — enabled/disabled, schedule, and any last/next run fields the response carries. If the `get` call fails because the routine no longer exists, report the record as stale and offer to delete `.claude-tweaks/routines/{PREFIXED_NAME}.yml` and re-run `create <skill>`.

**Step 3.** Compare the record's `template_version` against the current template file's (already read in Step 1) `template_version`. If they differ, flag it: "this routine was created from template v{N}; the template is now at v{M} — run `update {skill}` to re-sync."

**Step 3.5 — Field-level drift (best-effort).** Each field below is checked independently — the absence of one does not skip the others. If Step 2's `get` response includes a top-level `cron_expression` (a sibling of `job_config`, per the `create` body shape in CREATE Step 6 — not nested under `job_config.ccr`), diff it against `record.schedule`. If the response includes `job_config.ccr.session_context.model`, diff it against `template.model`. If it includes `job_config.ccr.session_context.allowed_tools`, diff it against `template.allowed_tools` (set comparison, order-independent). If it includes `job_config.ccr.session_context.sources[].git_repository.url`, diff it against the project's origin (re-resolve via `git remote get-url origin` if not already available in this invocation). Report any per-field mismatch alongside the version-drift flag from Step 3. For any field the `get` response does not carry, skip only that field's comparison and note "field-level drift unavailable for {field} — comparing template_version only for this field" instead of assuming a response shape the tool hasn't been confirmed to return.

Report both the live state and the drift check(s) together.

## Next Actions

Call `AskUserQuestion` with `question`: `"What's next?"`, `header`: `"Next step"`, `multiSelect`: `false`, and:

- Option 1 — `label`: `"Check status"`, `description`: `"/claude-tweaks:routine status <skill> — check on a routine you just created"`. Suffix the label `(Recommended)` right after a `create` operation.
- Option 2 — `label`: `"Use /schedule"`, `description`: `"/schedule — inspect, run, or list any routine (including ones this skill created) via the built-in conversational flow. Deletion always happens at claude.ai/code/routines."`
- Option 3 — `label`: `"Re-sync"`, `description`: `"/claude-tweaks:routine update <skill> — re-sync after the template changes"`

## Component-Skill Contract

When invoked with `--source init` (used by `/claude-tweaks:init`'s Step 13), `/claude-tweaks:routine` is running as a component of `/init`'s bootstrap flow — omit the `## Next Actions` block, since `/init` owns the overall handoff. `/init` does not set `$PIPELINE_RUN_DIR` (it is not a `/flow`-style pipeline orchestrator), so `--source init` is the sole signal for this caller, not merely a fallback for a rare ambiguity — unlike most component-skill contracts in this plugin, `$PIPELINE_RUN_DIR` is not the primary signal here.

Standalone invocation (no `--source` flag) is the common case and renders Next Actions as usual.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|--------------|
| Writing `environment_id` or a repo URL into a skill's `routine-template.yml` | Templates ship with the plugin across every project and account — baking in one account's environment or one project's repo makes the template wrong everywhere else. |
| Skipping the review gate because the assembled body "looks right" | `RemoteTrigger create` has no delete counterpart — a mistaken routine runs on a live schedule until manually removed at claude.ai/code/routines. |
| Creating a second routine for the same project+skill+**variant** when an instantiated record already exists | Always check `.claude-tweaks/routines/{name}.yml` first and route to `update` — duplicate routines double-run the same work. A second routine for a **different** variant of the same skill (e.g. `tidy-weekly` and `tidy-github-triage` coexisting) is not a duplicate — it's a distinct `PREFIXED_NAME`, and both instances legitimately run side by side. |
| Committing account-specific values into the instantiated record | The record schema deliberately excludes `environment_id` and MCP credentials — it's meant to be safe to commit. |
| Treating `--dry-run`'s assembled body as already created | Nothing is created, updated, or written until the non-dry-run path completes its final API call and record write. |
| Caching `environment_id` under `~/.claude-tweaks/` | That path is harness-owned runtime state, not skill-owned — cache it in the project-local `.claude-tweaks/routine-environment-cache.yml` file instead (checked before falling back to `RemoteTrigger list`, per CREATE Step 4). |
| Using `--defaults` to skip review on a single ad hoc `create` invocation the user hasn't already confirmed at a higher level | `--defaults` is `/init`'s sanctioned non-interactive entry point for a batch the user already confirmed via a multiSelect picklist (see the `/claude-tweaks:init` row below) — using it standalone removes the one safety check this billed, undeletable action has, for no batching benefit. |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:code-health` | Code-health is this skill's first consumer — `skills/code-health/routine-template.yml` is the reference template; code-health's own SKILL.md points here instead of documenting manual `/schedule` setup. |
| `/claude-tweaks:dispatch` | Third consumer — `skills/dispatch/routine-template.yml` is the headless queue consumer — `/routine create dispatch` instantiates it; carries write tools unlike code-health's report-only template. |
| `/claude-tweaks:flow` | Indirect only, via `/claude-tweaks:dispatch` — `/flow` no longer ships its own routine template; `/routine create dispatch` instantiates the scheduled headless dispatcher that claims work and invokes `/flow`, so this skill never talks to `/flow` directly. |
| `/schedule` (built-in) | `/routine` assembles the same `RemoteTrigger` body `/schedule` would build conversationally, but non-interactively from a template. `/schedule` remains the tool for one-off/exploratory routines and for listing, running, or inspecting a routine. Deletion always requires the web console at claude.ai/code/routines. |
| `skills/_shared/routine-template-schema.md` | Canonical schema for both the template and the instantiated record — referenced, not duplicated, here. |
| `/claude-tweaks:init` | Step 13 discovers skills with a `routine-template.yml` (plus any named `routine-template-<variant>.yml` siblings) and no existing record, presents them via one multiSelect `AskUserQuestion` call (grouped into ≤4-option questions when there are more than 4 candidates) with their default schedules, resolves environment once, then invokes `/claude-tweaks:routine create <skill> [--variant=<name>] --defaults --environment=<id> --source init` for each selected candidate — pure discovery + handoff, no logic duplicated; `--defaults` is `/routine`'s own sanctioned non-interactive entry point, not a shortcut `/init` invented around it. |
| `/claude-tweaks:tidy` | Tidy is this skill's second consumer — `skills/tidy/routine-template.yml` relies on tidy's own Standalone-auto support for safe unattended execution. Tidy also ships this skill's first named variant, `skills/tidy/routine-template-github-triage.yml` (`--variant=github-triage`), a frequent `--scope=github`-only companion to the weekly full sweep. |
| `/claude-tweaks:harness-health` | Fourth consumer — `skills/harness-health/routine-template.yml` audits `.claude/skills/*.md`, `.claude/rules/*.md`, and CLAUDE.md for drift, template-conformance, and best-practice gaps, sharing its judgment procedure with `/init` and `/wrap-up`. |
| `/claude-tweaks:journey-health` | Fifth consumer — `skills/journey-health/routine-template.yml` audits `docs/journeys/*.md` for drift and coverage gaps (light tier only; the deep tier is interactive-only, pending a cloud-Routine feasibility spike). |
| `/claude-tweaks:docs-health` | Sixth consumer — `skills/docs-health/routine-template.yml` audits `docs/**` for Diátaxis genre-drift, depth-mismatch, findability, and staleness (report-only, like code-health's and harness-health's templates), filing `by:docs-health` findings. |
