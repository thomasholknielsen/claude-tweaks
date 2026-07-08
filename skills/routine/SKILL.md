---
name: claude-tweaks:routine
description: Use when you want to create, update, or check the status of a Claude Code cloud Routine for a claude-tweaks skill — instantiates a versioned, project-agnostic routine template (e.g. code-health's) into a live, account-and-project-specific scheduled routine via the RemoteTrigger API. Keywords - routine, schedule, cron, cloud agent, recurring, automation.
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
| `create <skill>` | Instantiate `<skill>`'s routine template into a live routine for the current project. Routes to the UPDATE workflow automatically if an instantiated record already exists for this project+skill. |
| `update <skill>` | Re-sync an existing routine against its (possibly changed) template. |
| `status <skill>` | Show the instantiated record alongside live routine state. |
| `--dry-run` (combine with `create`/`update`) | Assemble and display the `RemoteTrigger` body; never make a `create`/`update` call (read-only `list`/`get` calls to resolve values are still permitted), never write or rewrite the instantiated record. |
| `--source <parent-skill>` | Used by a parent skill (e.g. `/claude-tweaks:init`) to identify itself as the caller; see Component-Skill Contract below. |

## Workflow

### CREATE `<skill>`

**Step 1 — Load the template.** Read `${CLAUDE_PLUGIN_ROOT}/skills/{skill}/routine-template.yml`. If it doesn't exist, stop: "`{skill}` has no routine-template.yml — it doesn't support routines yet." The field schema is documented once in `skills/_shared/routine-template-schema.md` — read it if any field's meaning is unclear.

**Step 2 — Resolve the repo URL and derive the project-prefixed name.**

```bash
git remote get-url origin
```

Normalize to full HTTPS the same way `/schedule` does: accept `org/repo`, `git@github.com:org/repo.git`, or `https://github.com/org/repo` and produce `https://github.com/{org}/{repo}` (strip any `.git` suffix, convert the SSH form). If the command fails (no `origin` remote, not a git repo, etc.), stop and ask the user for the repo URL directly instead of proceeding with an empty or invalid value.

Derive `REPO_SLUG` from the resolved URL's `{repo}` segment: lowercase it, replace any run of characters outside `[a-z0-9]` with a single `-`, and trim leading/trailing `-`. Set `PREFIXED_NAME = "{REPO_SLUG}-{template.routine_name}"` (e.g. repo `claude-tweaks` + `routine_name: code-health-daily` → `claude-tweaks-code-health-daily`). Use `PREFIXED_NAME` everywhere the rest of this workflow refers to the routine's name or the record's filename — never the template's bare `routine_name` alone.

**Step 3 — Idempotency check.** Check whether `.claude-tweaks/routines/{PREFIXED_NAME}.yml` already exists in the current project. If it does, stop this workflow and continue at UPDATE below instead — never create a second routine for the same project+skill.

**Step 4 — Resolve `environment_id`.** Check `.claude-tweaks/routine-environment-cache.yml` in the current project first. If it exists and contains an `environment_id` value, offer it as the default (let the user override). Otherwise, load the tool with `ToolSearch select:RemoteTrigger`, then call `{action: "list"}`. If existing routines are returned, read `job_config.ccr.environment_id` off the most recently created one and offer it as the default (let the user override). If none exist yet, ask the user directly which environment to use — present whatever environment names/IDs are available in context; if none are, ask the user to name one (they can check via `/schedule` once if unsure). Do not cache this value anywhere under `~/.claude-tweaks/` — that path is harness-owned, not skill-owned.

After the user confirms an environment (whether sourced from the cache, `list`, or direct input), write it to `.claude-tweaks/routine-environment-cache.yml` (skip this write if `--dry-run` was passed):

```yaml
environment_id: "<confirmed environment_id>"
```

This file is project-local and must stay gitignored — it exists purely to spare a second skill in the same project from re-deriving the same environment, never to make the value portable across projects or accounts.

**Step 5 — Resolve the schedule.** Present the template's `default_schedule.cron_expression` (always UTC) and ask the user to confirm it actually lands off-peak in their own timezone, or supply a different cron expression. Use the same UTC-conversion-and-confirm discipline `/schedule` itself uses: state the conversion explicitly ("9am Europe/Copenhagen = 7am UTC, so `0 7 * * *`") before locking it in. Minimum interval is 1 hour — reject anything tighter and ask for a looser schedule.

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

**Step 7 — Review gate.** Show the full assembled body before doing anything with it, along with the template's `notes` field (if present) so the user sees any tuning guidance before confirming. This creates live, billed infrastructure with no delete API — always confirm explicitly here, regardless of how automated everything upstream was.

Call `AskUserQuestion` with `question`: `"Create this routine?"`, `header`: `"Confirm routine"`, `multiSelect`: `false`, and:
- Option 1 — `label`: `"Create"`, `description`: `"Proceed with the assembled RemoteTrigger body shown above"`
- Option 2 — `label`: `"Cancel"`, `description`: `"Do not create anything"`

**Neither option carries `(Recommended)`** — this is a consequential, hard-to-reverse action (live, billed infrastructure with no delete API), so the tool's normal "mark a recommended default" convention is deliberately not followed here.

If `--dry-run` was passed: print the assembled body and stop. Do not call `RemoteTrigger`. Do not write an instantiated record.

**Step 8 — Create.** Call `RemoteTrigger {action: "create", body: <assembled body>}`. Read the routine/trigger ID and the claude.ai routine URL from the response (the tool appends a summary line with both).

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

**Step 1.** Load the template at `${CLAUDE_PLUGIN_ROOT}/skills/{skill}/routine-template.yml` (if missing, stop with the same message as CREATE Step 1). Resolve the repo URL and derive `PREFIXED_NAME` the same way as CREATE Step 2. Require an existing `.claude-tweaks/routines/{PREFIXED_NAME}.yml` for the current project (routed here automatically from CREATE's idempotency check, or invoked directly). If none exists, tell the user to run `create <skill>` first and stop.

**Step 2.** Compare the template's `template_version` (already read in Step 1) against the instantiated record's `template_version` — if they match and the user hasn't asked to change anything else, report "already in sync" and stop.

**Step 3.** Re-resolve environment and schedule — the two fields pre-fill from different sources, not both from the record. For environment, follow CREATE Step 4's procedure exactly: check `.claude-tweaks/routine-environment-cache.yml` first, falling back to `RemoteTrigger list` if the cache is empty — never the instantiated record itself, since the record schema deliberately never stores `environment_id` (see `skills/_shared/routine-template-schema.md`). For schedule, follow CREATE Step 5's procedure but pre-fill the default from the existing record's `schedule` field instead of asking from scratch. (Repo URL and `PREFIXED_NAME` were already resolved in Step 1 — do not re-derive them.)

**Step 4.** Assemble the body the same way as CREATE's body-assembly step, then show a diff between the recorded config (schedule, template version, resolved values) and the freshly assembled one. If nothing changed, report that and stop.

**Step 5.** Review gate — same standard as CREATE's review gate: show the diff, then call `AskUserQuestion` with `question`: `"Update this routine?"`, `header`: `"Confirm routine"`, `multiSelect`: `false`, and:
- Option 1 — `label`: `"Update"`, `description`: `"Proceed with the assembled RemoteTrigger body shown above"`
- Option 2 — `label`: `"Cancel"`, `description`: `"Do not update anything"`

**Neither option carries `(Recommended)`** — same reasoning as CREATE Step 7 (live, billed infrastructure with no delete API).

If `--dry-run` was passed: show the diff and stop. Do not call `RemoteTrigger`. Do not rewrite the instantiated record.

**Step 6.** Call `RemoteTrigger {action: "update", trigger_id: <record.routine_id>, body: <assembled body>}`.

**Step 7.** Rewrite the instantiated record with the resolved schedule, the new `template_version`, and a fresh `created_at` timestamp (this field doubles as "last written at") — preserving `routine_id`, `template`, and `console_url` from the existing record.

### STATUS `<skill>`

**Step 1.** Read the template at `${CLAUDE_PLUGIN_ROOT}/skills/{skill}/routine-template.yml`. Resolve the repo URL and derive `PREFIXED_NAME` the same way as CREATE Step 2, then read `.claude-tweaks/routines/{PREFIXED_NAME}.yml`. If missing, report that no routine has been created for `<skill>` in this project and suggest `create <skill>`. Stop.

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
| Creating a second routine when an instantiated record already exists | Always check `.claude-tweaks/routines/{name}.yml` first and route to `update` — duplicate routines double-run the same work. |
| Committing account-specific values into the instantiated record | The record schema deliberately excludes `environment_id` and MCP credentials — it's meant to be safe to commit. |
| Treating `--dry-run`'s assembled body as already created | Nothing is created, updated, or written until the non-dry-run path completes its final API call and record write. |
| Caching `environment_id` under `~/.claude-tweaks/` | That path is harness-owned runtime state, not skill-owned — cache it in the project-local `.claude-tweaks/routine-environment-cache.yml` file instead (checked before falling back to `RemoteTrigger list`, per CREATE Step 4). |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:code-health` | Code-health is this skill's first consumer — `skills/code-health/routine-template.yml` is the reference template; code-health's own SKILL.md points here instead of documenting manual `/schedule` setup. |
| `/claude-tweaks:flow` | `skills/flow/routine-template.yml` is a consumer — a headless issue dispatcher; `/routine create flow` instantiates it. Unlike code-health's report-only template it carries write tools. |
| `/schedule` (built-in) | `/routine` assembles the same `RemoteTrigger` body `/schedule` would build conversationally, but non-interactively from a template. `/schedule` remains the tool for one-off/exploratory routines and for listing, running, or inspecting a routine. Deletion always requires the web console at claude.ai/code/routines. |
| `skills/_shared/routine-template-schema.md` | Canonical schema for both the template and the instantiated record — referenced, not duplicated, here. |
| `/claude-tweaks:init` | Step 13 discovers skills with a `routine-template.yml` and no existing record, then invokes `/claude-tweaks:routine create <skill> --source init` for each the user selects — pure discovery + handoff, no logic duplicated. |
| `/claude-tweaks:tidy` | Tidy is this skill's second consumer — `skills/tidy/routine-template.yml` relies on tidy's own Standalone-auto support for safe unattended execution. |
| `/claude-tweaks:harness-health` | Fourth consumer — `skills/harness-health/routine-template.yml` audits `.claude/skills/*.md`, `.claude/rules/*.md`, and CLAUDE.md for drift, template-conformance, and best-practice gaps, sharing its judgment procedure with `/init` and `/wrap-up`. |
