---
name: claude-tweaks:routine
description: Use when you want to create, update, or check the status of a Claude Code cloud Routine for a claude-tweaks skill — instantiates a versioned, project-agnostic routine template (e.g. code-health's) into a live, account-and-project-specific scheduled routine via the RemoteTrigger API. Keywords - routine, schedule, cron, cloud agent, recurring, automation.
argument-hint: "<create|update|status> <skill>|--all [--dry-run] [--defaults] [--environment <id>] [--refresh-environment]"
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
| `create <skill>` | Instantiate `<skill>`'s routine template into a live routine for the current project. Routes to the UPDATE workflow automatically if an instantiated record already exists for this project+skill combination. |
| `update <skill>` | Re-sync an existing routine against its (possibly changed) template. |
| `status <skill>` | Show the instantiated record for `<skill>` alongside live routine state. |
| `status --all` | Bulk drift check across every instantiated record in the project (`.claude-tweaks/routines/*.yml`), regardless of skill — no `<skill>` argument. The only entry point that can discover a record whose named skill no longer exists at all (renamed/retired), since every other path here starts from a skill name and checks that skill's own template file forward. See STATUS Step 1's `--all` branch for the full verdict table. |
| `--dry-run` (combine with `create`/`update`) | Assemble and display the `RemoteTrigger` body (on `create`, when an environment was already resolved) or a text preview (on `create`, when none was — no browser session opens, no body exists to assemble); never make a `create`/`update` call or open a guided-creation browser session (read-only `list`/`get` calls to resolve values are still permitted), never write or rewrite the instantiated record. |
| `--defaults` (combine with `create` or `update`) | On `create`: skip Step 5's interactive cadence picker (use the template's own `default_schedule.cron_expression` verbatim) and Step 7's interactive confirm (proceed straight to creation once the body is assembled, or straight to the guided-creation flow if none was). On `update`: skip Step 3's schedule re-resolution entirely (keep the record's existing `schedule` field untouched — no cadence picker at all) and Step 5's interactive confirm (proceed straight to Step 6 once the body is assembled). Either way, for non-interactive/batch use. Environment still resolves via Step 4's normal sources (`--environment`, the cache, or its two fallback lookups); if none yields a value, `--defaults` does **not** suppress guided creation's own browser session (opening a browser and creating live, billed infrastructure is a bigger commitment than the batch-confirm callers like `/init` Step 15 already cover — Step 7's preview is still shown as a non-blocking report either way). |
| `--environment <id>` (combine with `--defaults`, or standalone) | Use this environment ID directly in Step 4, skipping every other resolution source. |
| `--refresh-environment` (combine with `create`/`update`) | Bypass the environment cache and Step 4's `RemoteTrigger`-backed lookups (both source (a) and source (b)) — go straight to asking the user directly which environment to use, then overwrite `.claude-tweaks/routine-environment-cache.yml` with the freshly chosen value. Use this to correct a stale or wrongly-inferred cached/inferred environment without already knowing its raw ID. Mutually exclusive in effect with `--environment <id>` — if both are passed, `--environment` wins (it already skips every other source, including this one) and no prompt occurs. |
| `--source <parent-skill>` | Used by a parent skill (e.g. `/claude-tweaks:init`) to identify itself as the caller; see Component-Skill Contract below. |

## Workflow

### CREATE `<skill>`

**Step 0 — Worktree check (only when `.claude-tweaks/policy.yml` sets `worktree.always: true`).** This skill writes twice — Step 4's environment cache and Step 9's instantiated record — and this project's PreToolUse hook denies any `Write` issued from a non-isolated checkout under that policy, with no bookkeeping exemption; `/claude-tweaks:routine` has no pipeline orchestrator upstream to have already set one up, so nothing protects this invocation by default. Before proceeding: if the current session is not already inside a linked git worktree (check via `git rev-parse --show-toplevel` against the main checkout root, or via `EnterWorktree`/`isolation: "worktree"` already being active), set one up first — `/superpowers:using-git-worktrees` or `EnterWorktree`, branched from current HEAD — and run the rest of this workflow, including Steps 4 and 9's writes, from inside it. `.claude-tweaks/routines/{PREFIXED_NAME}.yml` is meant to be committed (it's a versioned project artifact), so commit it inside the worktree as usual, then merge the branch back into the main checkout (`git merge --ff-only`) before reporting the console URL to the user — the record isn't durably part of the project until that merge lands. `.claude-tweaks/routine-environment-cache.yml` is gitignored and project-local; writing it inside the worktree is fine — it exists only to spare a second skill invocation in the same checkout from re-deriving the value. If `worktree.always` isn't set, skip this step and proceed directly to Step 1.

**Step 1 — Load the template.** Read `${CLAUDE_PLUGIN_ROOT}/skills/{skill}/routine-template.yml`; if it doesn't exist, stop: "`{skill}` has no routine-template.yml — it doesn't support routines yet." The field schema is documented once in `skills/_shared/routine-template-schema.md` — read it if any field's meaning is unclear.

**Step 2 — Resolve the repo URL and derive the project-prefixed name.**

```bash
git remote get-url origin
```

Normalize to full HTTPS the same way `/schedule` does: accept `org/repo`, `git@github.com:org/repo.git`, or `https://github.com/org/repo` and produce `https://github.com/{org}/{repo}` (strip any `.git` suffix, convert the SSH form). If the command fails (no `origin` remote, not a git repo, etc.), stop and ask the user for the repo URL directly instead of proceeding with an empty or invalid value.

Derive `REPO_SLUG` from the resolved URL's `{repo}` segment: lowercase it, replace any run of characters outside `[a-z0-9]` with a single `-`, and trim leading/trailing `-`. Set `PREFIXED_NAME = "{REPO_SLUG}-{template.routine_name}"` (e.g. repo `claude-tweaks` + `routine_name: code-health-daily` → `claude-tweaks-code-health-daily`). Use `PREFIXED_NAME` everywhere the rest of this workflow refers to the routine's name or the record's filename — never the template's bare `routine_name` alone.

**Step 3 — Idempotency check.** Check whether `.claude-tweaks/routines/{PREFIXED_NAME}.yml` already exists in the current project. If it does, stop this workflow and continue at UPDATE below instead — never create a second routine for the same project+skill combination.

**Step 4 — Resolve `environment_id`, or defer to guided creation.** If `--environment <id>` was passed, use it directly — skip every other source below, including the guided-creation branch (an explicit `--environment` always wins). Otherwise, if `--refresh-environment` was passed, skip the cache and both `RemoteTrigger`-backed sources too — source (a) and source (b) below — go straight to asking the user directly which environment to use (the same direct-user-input prompt Step 8's guided-flow-unavailable fallback uses below), then continue to the cache-write step below with the freshly chosen value, overwriting whatever the cache file already held. Otherwise: check `.claude-tweaks/routine-environment-cache.yml` in the current project first. If it exists and contains an `environment_id` value, use it silently — no confirmation prompt. Otherwise, try two complementary sources, in this order, and use whichever yields a value first:

(a) **Project-local records.** If `.claude-tweaks/routines/*.yml` exist for this project, call `RemoteTrigger {action: "get", trigger_id: <record.routine_id>}` for each (most-recently-created record first, stop at the first successful `get`) and read `job_config.ccr.environment_id` off it. This source is the *only* one that finds a routine created via `skills/routine/guided-environment-creation.md`'s Create procedure — those routines never populate `session_context.sources[].git_repository.url` at all (confirmed live — see that file's own Create procedure step 7), so source (b) below cannot see them regardless of pagination. Skip (don't stop on) a record whose `get` call fails — that routine was deleted out-of-band; this is a read-only resolution step, it does not offer to clean up the stale record the way STATUS does.

(b) **Account-wide `list` + repo-URL filter**, if (a) found nothing (no instantiated records yet, or all of them stale): load the tool with `ToolSearch select:RemoteTrigger`, then call `{action: "list"}`. Reuse the repo URL Step 2 already resolved above — do not re-derive it (same "already resolved, don't re-derive" precedent UPDATE Step 3 follows for the same value). Filter the returned triggers to those whose `job_config.ccr.session_context.sources[].git_repository.url` matches this project's own resolved repo URL — never a routine belonging to a different project, even if it was created more recently. If one or more match, read `job_config.ccr.environment_id` off the most recently created match and use it silently. **Known limitation, confirmed live:** `{action: "list"}` returns only its first page — the tool exposes no cursor/pagination parameter — so on an account with enough triggers to paginate (`has_more: true` in the response), a match belonging to this project could sit on a later page and go undetected. Source (a) above already covers every routine this plugin created (regardless of pagination); this residual gap only affects a routine this project's `.claude-tweaks/routines/` never recorded — e.g. one created by hand outside `/claude-tweaks:routine` entirely. No workaround exists at the skill-prose level for that remaining case; it is a genuine `RemoteTrigger` tool constraint.

If none of the sources above (cache, then source (a), then source (b)) yields a value for *this project specifically*, this routine's creation must go through `skills/routine/guided-environment-creation.md`'s Create procedure — it creates a dedicated environment **and** this routine together in one continuous browser session (it has no separate throwaway-routine step; see that file's own header for why, and its own Anti-Patterns-documented no-delete-API constraint on `RemoteTrigger`). Do not invoke it yet: set `NEEDS_GUIDED_CREATION = true` and continue to Step 5 — the guided flow needs the resolved schedule before it can run, so it is invoked from Step 8 below, once every field it needs is in hand. Skip the cache-write step immediately below in this case; Step 8 performs the equivalent write itself, once it actually has an `environment_id` to record.

After an environment is resolved (from `--environment`, the cache, source (a), source (b), or direct user input — never when `NEEDS_GUIDED_CREATION` is set), write it to `.claude-tweaks/routine-environment-cache.yml` (skip this write if `--dry-run` was passed):

```yaml
environment_id: "<resolved environment_id>"
environment_name: "<human-readable environment name, if known — omit this key entirely when unknown>"
```

`environment_name` is only ever known when the guided-creation flow (`skills/routine/guided-environment-creation.md`) resolved or confirmed it via a real browser read — no API exposes an environment's display name, only its opaque ID. Omit the key entirely (do not write an empty string) when resolution came from `--environment`, the cache's own prior `environment_id`-only value, source (a), source (b), or direct user input, none of which can supply a name. This file is project-local and must stay gitignored — it exists purely to spare a second skill in the same project from re-deriving the same environment, never to make the value portable across projects or accounts.

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

**Step 6 — Assemble the `RemoteTrigger create` body.** Build this body whenever a `RemoteTrigger create` call will actually happen. If `NEEDS_GUIDED_CREATION` is set, skip this step for now — there's no `environment_id` yet to put in it, and the guided flow doesn't need this body at all as long as it stays on the guided path. Two places later can still need it, once an `environment_id` exists: Step 7's Customize branch, if the user overrides guided-creation with a named existing environment (clearing `NEEDS_GUIDED_CREATION`); and Step 8's guided-flow-unavailable fallback, once it resolves an environment directly. Both are pointed back to this step's body template — assemble it there, at that point, using the environment_id just resolved, before proceeding to Step 8's non-guided `RemoteTrigger create` call. Otherwise (the common case, `NEEDS_GUIDED_CREATION` not set here), assemble it now:

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

**Step 7 — Preview and confirm.** Render the resolved schedule (human-readable, e.g. "Nightly at 03:00 UTC") as plain text, along with the template's `notes` field (if present) so the user sees any tuning guidance before confirming. For the environment line: if `NEEDS_GUIDED_CREATION` is set, render "environment: will be created — `claude-tweaks: <REPO_SLUG>` (via a guided browser flow that creates the environment and this routine together, first time only for this project)"; otherwise render the resolved value as before (e.g. "environment `env-abc123` (cached)"). This creates live, billed infrastructure with no delete API, so the preview must always be shown — regardless of how automated everything upstream was.

If `--dry-run` was passed: stop here — do not call `RemoteTrigger`, do not invoke the guided-creation flow, do not write an instantiated record. If `NEEDS_GUIDED_CREATION` is not set, print the assembled body (from Step 6). If `NEEDS_GUIDED_CREATION` is set, there is no assembled body to print (Step 6 skipped it) — instead print the same preview text Step 7 rendered above, plus a note that a real (non-dry-run) invocation would open a guided browser session to create both a dedicated `claude-tweaks: <REPO_SLUG>` environment and this routine together. (This check applies whether or not `--defaults` was also passed — `--dry-run` always wins.)

If `--defaults` was passed (and not `--dry-run`): skip the `AskUserQuestion` call below — proceed straight to Step 8. The preview above is still shown, as a report rather than a prompt.

Otherwise, call `AskUserQuestion` with `question`: `"Create this routine with these settings?"`, `header`: `"Confirm routine"`, `multiSelect`: `false`, and:
- Option 1 — `label`: `"Yes, create with defaults (Recommended)"`, `description`: `"Proceed with the settings shown above"`
- Option 2 — `label`: `"Customize schedule or environment"`, `description`: `"Change the cadence, time, or environment before creating"`
- Option 3 — `label`: `"Cancel"`, `description`: `"Do not create anything"`

Marking "Yes, create with defaults" as `(Recommended)` is a deliberate change from this step's earlier no-bias convention — acceptable because the full assembled preview is always shown as part of the same round-trip; the safety property (review before commit) is preserved, only the bias-avoidance styling is relaxed.

Selecting **Customize** re-asks environment (present the value resolved in Step 4 as the recommended option, still overridable — when `NEEDS_GUIDED_CREATION` is set instead, present "create a dedicated environment via guided browser flow" as the recommended option, still overridable to an existing environment the user names directly, which clears `NEEDS_GUIDED_CREATION` for the rest of this run) and *then* runs the cadence picker (5b-5d, reached for the first and only time here), producing a customized cron. Only once both the environment and the cron are final, and only if `NEEDS_GUIDED_CREATION` is *not* set at that point (either it was never set, or the user's override just cleared it) — (re-)assemble Step 6's body using these final values, matching Step 6's own scoping (it never assembles a body while `NEEDS_GUIDED_CREATION` is set, since there's no `environment_id` yet). This still applies whenever the Customize path reaches it, whether or not `NEEDS_GUIDED_CREATION` was ever set to begin with, since the cadence picker can change the cron after Step 6's original assembly (if any) already ran. If `NEEDS_GUIDED_CREATION` is still set after the override (the user kept the guided-creation recommendation and only customized the cron), there is still no body to assemble — the customized `cron_expression` carries forward to Step 8's guided-creation invocation instead, exactly as the non-Customize path already does. Then re-render this same preview and confirm with the customized schedule/environment — but relabel Option 1 to `"Yes, create (Recommended)"` (dropping "with defaults," since the settings shown are no longer the template's defaults); Option 2 ("Customize...") and Option 3 ("Cancel") stay as before, so further adjustment remains possible. Selecting **Yes** (either the first "with defaults" render or a later customized re-render) or **Cancel** proceeds exactly as before — Step 8 (create) or stop.

**Step 8 — Create.**

If `NEEDS_GUIDED_CREATION` is set: invoke `skills/routine/guided-environment-creation.md`'s Create procedure with `project_slug = REPO_SLUG`, `repo_url` (Step 2's resolved value), `routine_name = PREFIXED_NAME`, `cron_expression` (Step 5's resolved cron), `instructions = template.prompt`, and `connectors = template.mcp_connections` (omit if empty). On success, it returns `{trigger_id, console_url, environment_id, environment_name, connectors_pending}` — treat `trigger_id`/`console_url` exactly as the routine/trigger ID and claude.ai routine URL a normal `RemoteTrigger create` response would have given (Step 9 below reads from these either way), and additionally write `environment_id`/`environment_name` to `.claude-tweaks/routine-environment-cache.yml` now (this is the deferred cache-write Step 4 skipped). If the guided flow reports it's unavailable (no browser, or the user declined) rather than a mid-flow failure: fall back to asking the user directly which environment to use, presenting whatever names/IDs are available in context, then assemble Step 6's body now (it was skipped there since `NEEDS_GUIDED_CREATION` was set at the time) using this environment_id, write the cache, and proceed with the normal (non-guided) path below. If the guided flow itself fails partway (a real browser-automation failure — UI structure changed, a click missed, environment created but routine submission failed), treat it like any other failed create below: report what succeeded/failed to the user and stop, do not proceed to Step 9.

Otherwise (environment already resolved in Step 4, `NEEDS_GUIDED_CREATION` not set): call `RemoteTrigger {action: "create", body: <assembled body>}`. Read the routine/trigger ID and the claude.ai routine URL from the response (the tool appends a summary line with both). If the call fails (e.g. an invalid or stale `environment_id` silently reused from `.claude-tweaks/routine-environment-cache.yml`), report the error to the user, suggest re-running with `--refresh-environment` (or deleting `.claude-tweaks/routine-environment-cache.yml` directly) to force re-resolution, and stop — do not proceed to Step 9 or write an instantiated record for a failed create.

**Step 9 — Write the instantiated record.** Write `.claude-tweaks/routines/{PREFIXED_NAME}.yml`:

```yaml
routine_id: "<the routine/trigger ID from Step 8 — RemoteTrigger's create response, or guided-creation's returned trigger_id>"
template: <skill>
template_version: <template.template_version>
created_at: "<current UTC timestamp, ISO 8601>"
schedule: "<resolved cron_expression>"
console_url: "<the routine URL from Step 8 — RemoteTrigger's create response, or guided-creation's returned console_url>"
```

If `NEEDS_GUIDED_CREATION` was set and Step 8's guided flow returned a non-empty `connectors_pending` array, also tell the user which of those connector names still need adding manually, and where (Edit routine → Connectors tab).

Report the console URL to the user.

### UPDATE `<skill>`

**Step 0 — Worktree check.** Same as CREATE Step 0 — run it here too, since `update` is often invoked directly rather than routed from CREATE's idempotency check, and Step 7 below writes the instantiated record just as CREATE Step 9 does.

**Step 1.** Load the template the same way as CREATE Step 1 (if missing, stop with the same message). Resolve the repo URL and derive `PREFIXED_NAME` the same way as CREATE Step 2. Require an existing `.claude-tweaks/routines/{PREFIXED_NAME}.yml` for the current project (routed here automatically from CREATE's idempotency check, or invoked directly). If none exists, tell the user to run `create <skill>` first and stop.

**Step 2.** Compare the template's `template_version` (already read in Step 1) against the instantiated record's `template_version` — if they match and the user hasn't asked to change anything else, report "already in sync" and stop.

**Step 3.** Re-resolve environment always. For environment, follow CREATE Step 4's non-guided procedure exactly: check `.claude-tweaks/routine-environment-cache.yml` first, then its source (a) (project-local records) and source (b) (repo-matched `RemoteTrigger list`) if the cache is empty — never the instantiated record itself, since the record schema deliberately never stores `environment_id` (see `skills/_shared/routine-template-schema.md`). This routine's own record is one of source (a)'s candidates like any other, so `RemoteTrigger get` on `record.routine_id` directly (skipping straight to reading its `environment_id`) is equally valid here and cheaper — either path reaches the same value. (Repo URL and `PREFIXED_NAME` were already resolved in Step 1 — do not re-derive them.)

If `--defaults` was passed: skip schedule re-resolution entirely — keep the existing record's `schedule` field verbatim, unchanged, for the rest of this workflow. No cadence picker runs.

Otherwise, re-resolve schedule too: follow CREATE Step 5's full cadence-picker procedure (5a-5d), but parse the existing record's `schedule` field for the 5a pre-selection instead of the template's `default_schedule.cron_expression` — the record's own currently-active cron is the more relevant "what's running today" starting point on an update than the template's shipped default, which may no longer match what this project actually instantiated.

**Step 4.** Assemble the body the same way as CREATE's body-assembly step, then show a diff between the recorded config (schedule, template version, resolved values) and the freshly assembled one. If nothing changed, report that and stop.

**Step 5.** Review gate — same standard as CREATE's Step 7: show the diff (Step 4's output) always, regardless of `--defaults`.

If `--dry-run` was passed: show the diff and stop. Do not call `RemoteTrigger`. Do not rewrite the instantiated record. (This check applies whether or not `--defaults` was also passed — `--dry-run` always wins, same precedent as CREATE Step 7.)

If `--defaults` was passed (and not `--dry-run`): skip the `AskUserQuestion` call below — proceed straight to Step 6. The diff above is still shown, as a report rather than a prompt.

Otherwise, call `AskUserQuestion` with `question`: `"Update this routine?"`, `header`: `"Confirm routine"`, `multiSelect`: `false`, and:
- Option 1 — `label`: `"Yes, update (Recommended)"`, `description`: `"Proceed with the assembled RemoteTrigger body shown above"`
- Option 2 — `label`: `"Cancel"`, `description`: `"Do not update anything"`

Marking "Yes, update" as `(Recommended)` follows the same reasoning as CREATE Step 7's confirm — the diff is always shown before this call, so the safety property (review before commit) is preserved even with a marked default.

**Step 6.** Call `RemoteTrigger {action: "update", trigger_id: <record.routine_id>, body: <assembled body>}`. If this call fails because `record.routine_id` no longer refers to an existing routine (e.g. deleted out-of-band at claude.ai/code/routines), report the record as stale and offer the same recourse as STATUS Step 2: delete `.claude-tweaks/routines/{PREFIXED_NAME}.yml` and re-run `create <skill>` instead — do not proceed to Step 7 or rewrite the instantiated record for a failed update.

**Step 7.** Rewrite the instantiated record with the resolved schedule, the new `template_version`, and a fresh `created_at` timestamp (this field doubles as "last written at") — preserving `routine_id`, `template`, and `console_url` from the existing record.

### STATUS `<skill>`

**Step 1.** When `--all` was passed (no `<skill>` argument), skip straight to the `--all` branch below. Otherwise, load the template and resolve `PREFIXED_NAME` exactly as CREATE Steps 1-2, then check whether `.claude-tweaks/routines/{PREFIXED_NAME}.yml` exists. If it doesn't, report that no routine has been created for `<skill>` in this project and suggest `create <skill>`. Stop. If it does, proceed with that instance for the rest of this workflow.

**Step 1, `--all` branch.** Enumerate every instantiated record directly, regardless of which skill each names:

```bash
node -e "const {listRoutineRecords}=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/routine-template-parser.js'); console.log(JSON.stringify(listRoutineRecords('.claude-tweaks/routines')))"
```

If it returns `[]`, report "no routines instantiated in this project yet" and stop. This branch never derives `REPO_SLUG` or calls `git remote get-url origin` for the purpose of resolving which template matches each record — every other STATUS path starts from a skill name and works forward to a record; this one starts from the records that already exist. (Step 3.5's existing field-level drift check may still call `git remote get-url origin` separately, to compare a record's live repo-url field against the project's current origin — an unrelated, pre-existing check this branch doesn't change.)

For each returned record, resolve its matching template:

First, check the record has both `template` and `routine_id` fields present (both are required per `skills/_shared/routine-template-schema.md`). If either is missing, report this record as **Malformed** (filename + which required field is absent) and move to the next record — never attempt to resolve a template or call `RemoteTrigger` for an incomplete record.

1. Check whether `${CLAUDE_PLUGIN_ROOT}/skills/{record.template}/routine-template.yml` exists. If it doesn't (the skill directory doesn't exist, or exists with no routine template at all), this record is **Orphaned** — record that verdict and move to the next record without calling `RemoteTrigger` for this one (there is no live template to compare against, so a `get` call adds nothing actionable).
2. Otherwise, that file is the matching template.

Read and parse the resolved template file's content (`template_version`, `model`, `allowed_tools`) now — Steps 3 and 3.5 below assume this has already happened, exactly as the per-skill path's own Step 1 already does.

For every record that resolved a template (i.e. not Orphaned or Malformed), continue to Steps 2-3.5 below to compute In sync / Drifted / Stale.

> **Parallel execution:** Use parallel tool calls aggressively — each non-Orphaned, non-Malformed record's Step 2 `RemoteTrigger get` call targets a different `trigger_id` and is independent of every other record's call, so issue them concurrently. Orphaned and Malformed records need no `RemoteTrigger` call at all and are already fully resolved after step 1 above.

Present one combined table across every record, regardless of skill (this is the one STATUS mode with no per-skill grouping, since `--all` never had a skill name to group by):

```
| Routine | Verdict | Detail |
|---|---|---|
| code-health | In sync | template v2, no field drift |
| tidy | Drifted | template v1 → v2; schedule unchanged |
| skill-health | Orphaned | no skills/skill-health/routine-template.yml found — was this skill renamed? |
| journey-health | Stale | routine_id no longer resolves via RemoteTrigger get |
| claude-tweaks-broken (unresolved) | Malformed | claude-tweaks-broken.yml is missing required field `template` |
```

"Verdict" is one of: **In sync** (template_version matches, no field drift — Steps 3/3.5's existing checks), **Drifted** (version mismatch and/or schedule/model/tools/repo-url diff), **Orphaned** (per step 1 above — no live template resolved), **Stale** (Step 2's `RemoteTrigger get` call fails because the routine no longer exists — same condition Step 2 already documents for the per-skill path), **Malformed** (the record is missing a required field — see above). "Detail" carries whichever of Step 3/3.5's messages applies, or the Orphaned/Stale/Malformed explanation.

> **Parallel execution:** Use parallel tool calls aggressively — when more than one instantiated record exists, each instance's Step 2 `RemoteTrigger get` call targets a different `trigger_id` and is independent of every other instance's call, so issue them concurrently rather than iterating sequentially. Run each instance's Step 3/3.5 analysis and assemble the combined presentation after all `get` calls complete.

**Step 2.** Call `RemoteTrigger {action: "get", trigger_id: <record.routine_id>}` for live state — enabled/disabled, schedule, and any last/next run fields the response carries. If the `get` call fails because the routine no longer exists, report the record as stale and offer to delete `.claude-tweaks/routines/{PREFIXED_NAME}.yml` and re-run `create <skill>`.

In `--all` mode, use `record.filename` in place of `{PREFIXED_NAME}` (never derived in this branch), and record this as the **Stale** verdict in that record's row rather than presenting an interactive per-record offer — the combined table already surfaces it, and any recourse (delete + recreate) is the caller's decision, not something to prompt for mid-enumeration.

**Step 3.** Compare the record's `template_version` against the current template file's (already read in Step 1) `template_version`. If they differ, flag it: "this routine was created from template v{N}; the template is now at v{M} — run `update {skill}` to re-sync."

**Step 3.5 — Field-level drift (best-effort).** Each field below is checked independently — the absence of one does not skip the others. If Step 2's `get` response includes a top-level `cron_expression` (a sibling of `job_config`, per the `create` body shape in CREATE Step 6 — not nested under `job_config.ccr`), diff it against `record.schedule`. If the response includes `job_config.ccr.session_context.model`, diff it against `template.model`. If it includes `job_config.ccr.session_context.allowed_tools`, diff it against `template.allowed_tools` (set comparison, order-independent). If it includes `job_config.ccr.session_context.sources[].git_repository.url`, diff it against the project's origin (re-resolve via `git remote get-url origin` if not already available in this invocation). Report any per-field mismatch alongside the version-drift flag from Step 3. For any field the `get` response does not carry, skip only that field's comparison and note "field-level drift unavailable for {field} — comparing template_version only for this field" instead of assuming a response shape the tool hasn't been confirmed to return.

Report both the live state and the drift check(s) together.

## Next Actions

Call `AskUserQuestion` with `question`: `"What's next?"`, `header`: `"Next step"`, `multiSelect`: `false`, and:

- Option 1 — `label`: `"Check status"`, `description`: `"/claude-tweaks:routine status <skill> — check on a routine you just created"`. Suffix the label `(Recommended)` right after a `create` operation.
- Option 2 — `label`: `"Use /schedule"`, `description`: `"/schedule — inspect, run, or list any routine (including ones this skill created) via the built-in conversational flow. Deletion always happens at claude.ai/code/routines."`
- Option 3 — `label`: `"Re-sync"`, `description`: `"/claude-tweaks:routine update <skill> — re-sync after the template changes"`

## Component-Skill Contract

When invoked with `--source init` (used by `/claude-tweaks:init`'s Step 15, and by Update Mode's Routine Drift check for `status --all` and `update --defaults`), `/claude-tweaks:routine` is running as a component of `/init`'s bootstrap flow — omit the `## Next Actions` block, since `/init` owns the overall handoff. `/init` does not set `$PIPELINE_RUN_DIR` (it is not a `/flow`-style pipeline orchestrator), so `--source init` is the sole signal for this caller, not merely a fallback for a rare ambiguity — unlike most component-skill contracts in this plugin, `$PIPELINE_RUN_DIR` is not the primary signal here.

Standalone invocation (no `--source` flag) is the common case and renders Next Actions as usual.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|--------------|
| Writing `environment_id` or a repo URL into a skill's `routine-template.yml` | Templates ship with the plugin across every project and account — baking in one account's environment or one project's repo makes the template wrong everywhere else. |
| Skipping the review gate because the assembled body "looks right" | `RemoteTrigger create` has no delete counterpart — a mistaken routine runs on a live schedule until manually removed at claude.ai/code/routines. |
| Creating a second routine for the same project+skill when an instantiated record already exists | Always check `.claude-tweaks/routines/{name}.yml` first and route to `update` — duplicate routines double-run the same work. |
| Committing account-specific values into the instantiated record | The record schema deliberately excludes `environment_id` and MCP credentials — it's meant to be safe to commit. |
| Treating `--dry-run`'s assembled body as already created | Nothing is created, updated, or written until the non-dry-run path completes its final API call and record write. |
| Caching `environment_id` under `~/.claude-tweaks/` | That path is harness-owned runtime state, not skill-owned — cache it in the project-local `.claude-tweaks/routine-environment-cache.yml` file instead (checked before falling back to CREATE Step 4's local-records and `RemoteTrigger list` sources). |
| Using `--defaults` (on `create` or `update`) to skip review on a single ad hoc invocation the user hasn't already confirmed at a higher level | `--defaults` is `/init`'s sanctioned non-interactive entry point for a batch the user already confirmed via a multiSelect picklist or apply-all batch table (see the `/claude-tweaks:init` row below) — using it standalone removes the one safety check this billed, undeletable/hard-to-revert action has, for no batching benefit. |
| Passing `--all` together with `<skill>` | `--all` is a distinct entry point with no skill name at all — it enumerates every instantiated record in the project directly. Combining it with a skill name is a contradiction, not a narrower filter; treat it the same as any other conflicting-arguments case and ask which was meant rather than silently picking one. |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:code-health` | Code-health is this skill's first consumer — `skills/code-health/routine-template.yml` is the reference template; code-health's own SKILL.md points here instead of documenting manual `/schedule` setup. |
| `/claude-tweaks:dispatch` | Third consumer — `skills/dispatch/routine-template.yml` is the headless queue consumer — `/routine create dispatch` instantiates it; carries write tools unlike code-health's report-only template. |
| `/claude-tweaks:flow` | Indirect only, via `/claude-tweaks:dispatch` — `/flow` no longer ships its own routine template; `/routine create dispatch` instantiates the scheduled headless dispatcher that claims work and invokes `/flow`, so this skill never talks to `/flow` directly. |
| `/schedule` (built-in) | `/routine` assembles the same `RemoteTrigger` body `/schedule` would build conversationally, but non-interactively from a template. `/schedule` remains the tool for one-off/exploratory routines and for listing, running, or inspecting a routine. Deletion always requires the web console at claude.ai/code/routines. |
| `skills/_shared/routine-template-schema.md` | Canonical schema for both the template and the instantiated record — referenced, not duplicated, here. |
| `skills/_shared/routine-diagnostic-probe.md` | Consumer, not a skill — references this skill's CREATE Step 4 environment-resolution procedure by name rather than duplicating it, for firing ad hoc diagnostics against an already-existing project environment. A future change to Step 4's resolution sources must consider this dependent. |
| `/claude-tweaks:init` | Step 14 (Cloud/Routine Parity Setup) runs immediately before Step 15 deliberately — it declares claude-tweaks + superpowers in the project's `.claude/settings.json#enabledPlugins` and generates `scripts/claude-cloud-setup.sh`, so a Routine Step 15 creates doesn't silently fail its first cloud firing for lack of a declared plugin. Step 15 itself discovers skills with a `routine-template.yml` and no existing record, presents them via one multiSelect `AskUserQuestion` call (grouped into ≤4-option questions when there are more than 4 candidates) with their default schedules, resolves environment where possible (cache/local-records/`list`, mirroring CREATE Step 4's own non-guided sources), then invokes `/claude-tweaks:routine create <skill> --defaults --environment=<id> --source init` for each selected candidate once resolved — or, on a fresh project where nothing resolved yet, omits `--environment` for the first selected candidate so that candidate's own CREATE flow runs guided creation and populates the cache for the rest — pure discovery + handoff, no logic duplicated; `--defaults` is `/routine`'s own sanctioned non-interactive entry point, not a shortcut `/init` invented around it. Update Mode also invokes `/claude-tweaks:routine status --all --source init` to detect drifted, orphaned, stale, and malformed routines across the whole project in one call, staging any Drifted ones as a batch re-sync offer — see `update-mode.md`'s Routine Drift entry. Both this skill's CREATE Step 4 fallthrough and `/init`'s own Update Mode Routine Environment Dedication check delegate actual environment creation/reading/re-pointing to `skills/routine/guided-environment-creation.md` — neither duplicates its browser-automation procedure inline. |
| `/claude-tweaks:tidy` | Tidy is this skill's second consumer — `skills/tidy/routine-template.yml` relies on tidy's own Standalone-auto support for safe unattended execution. |
| `/claude-tweaks:harness-health` | Fourth consumer — `skills/harness-health/routine-template.yml` audits `.claude/skills/*.md`, `.claude/rules/*.md`, and CLAUDE.md for drift, template-conformance, and best-practice gaps, sharing its judgment procedure with `/init` and `/wrap-up`. |
| `/claude-tweaks:journey-health` | Fifth consumer — `skills/journey-health/routine-template.yml` audits `docs/journeys/*.md` for drift and coverage gaps (light tier only; the deep tier is interactive-only, pending a cloud-Routine feasibility spike). |
| `/claude-tweaks:docs-health` | Sixth consumer — `skills/docs-health/routine-template.yml` audits `docs/**` for Diátaxis genre-drift, depth-mismatch, findability, and staleness (report-only, like code-health's and harness-health's templates), filing `by:docs-health` findings. |
