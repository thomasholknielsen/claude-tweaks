---
name: claude-tweaks:routine
description: Use when you want to create, update, or check the status of a Claude Code cloud Routine for a claude-tweaks skill — instantiates a versioned, project-agnostic routine template (e.g. recon's) into a live, account-and-project-specific scheduled routine via the RemoteTrigger API. Keywords - routine, schedule, cron, cloud agent, recurring, automation.
---
> **Interaction style:** Present decisions as numbered options so the user can reply with just a number. For multi-item decisions, present a table with recommended actions and offer "apply all / override." Never present more than one batch decision table per message — resolve each before showing the next. End skills with a Next Actions block (context-specific numbered options with one recommended), not a navigation menu.

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
- You're setting up the same kind of routine (e.g. recon) in a new project and want it created the same way every time, without re-answering `/schedule`'s interactive questions from scratch.

Not for: one-off or exploratory routines you don't want templated (use `/schedule` directly). Not a replacement for `/schedule`'s `list`/`run` conveniences or for deleting a routine — deletion has no API and always happens at claude.ai/code/routines.

## Input

`$ARGUMENTS`:

| Argument | Behavior |
|---|---|
| `create <skill>` | Instantiate `<skill>`'s routine template into a live routine for the current project. Routes to the UPDATE workflow automatically if an instantiated record already exists for this project+skill. |
| `update <skill>` | Re-sync an existing routine against its (possibly changed) template. |
| `status <skill>` | Show the instantiated record alongside live routine state. |
| `--dry-run` (combine with `create`/`update`) | Assemble and display the `RemoteTrigger` body; never make a `create`/`update` call (read-only `list`/`get` calls to resolve values are still permitted), never write or rewrite the instantiated record. |

## Workflow

### CREATE `<skill>`

**Step 1 — Load the template.** Read `${CLAUDE_PLUGIN_ROOT}/skills/{skill}/routine-template.yml`. If it doesn't exist, stop: "`{skill}` has no routine-template.yml — it doesn't support routines yet." The field schema is documented once in `skills/_shared/routine-template-schema.md` — read it if any field's meaning is unclear.

**Step 2 — Idempotency check.** Check whether `.claude-tweaks/routines/{routine_name}.yml` already exists in the current project (`routine_name` from the template). If it does, stop this workflow and continue at UPDATE below instead — never create a second routine for the same project+skill.

**Step 3 — Resolve the repo URL.**

```bash
git remote get-url origin
```

Normalize to full HTTPS the same way `/schedule` does: accept `org/repo`, `git@github.com:org/repo.git`, or `https://github.com/org/repo` and produce `https://github.com/{org}/{repo}` (strip any `.git` suffix, convert the SSH form). If the command fails (no `origin` remote, not a git repo, etc.), stop and ask the user for the repo URL directly instead of proceeding with an empty or invalid value.

**Step 4 — Resolve `environment_id`.** Load the tool with `ToolSearch select:RemoteTrigger`, then call `{action: "list"}`. If existing routines are returned, read `job_config.ccr.environment_id` off the most recently created one and offer it as the default (let the user override). If none exist yet, ask the user directly which environment to use — present whatever environment names/IDs are available in context; if none are, ask the user to name one (they can check via `/schedule` once if unsure). Do not cache this value anywhere under `~/.claude-tweaks/` — that path is harness-owned, not skill-owned.

**Step 5 — Resolve the schedule.** Present the template's `default_schedule.cron_expression` (always UTC) and ask the user to confirm it actually lands off-peak in their own timezone, or supply a different cron expression. Use the same UTC-conversion-and-confirm discipline `/schedule` itself uses: state the conversion explicitly ("9am Europe/Copenhagen = 7am UTC, so `0 7 * * *`") before locking it in. Minimum interval is 1 hour — reject anything tighter and ask for a looser schedule.

**Step 6 — Assemble the `RemoteTrigger create` body.**

```json
{
  "name": "<template.routine_name>",
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

**Step 7 — Review gate.** Show the full assembled body before doing anything with it. This creates live, billed infrastructure with no delete API — always confirm explicitly here, regardless of how automated everything upstream was.

If `--dry-run` was passed: print the assembled body and stop. Do not call `RemoteTrigger`. Do not write an instantiated record.

**Step 8 — Create.** Call `RemoteTrigger {action: "create", body: <assembled body>}`. Read the routine/trigger ID and the claude.ai routine URL from the response (the tool appends a summary line with both).

**Step 9 — Write the instantiated record.** Write `.claude-tweaks/routines/{routine_name}.yml`:

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

**Step 1.** Require an existing `.claude-tweaks/routines/{routine_name}.yml` for the current project (routed here automatically from CREATE's idempotency check, or invoked directly). If none exists, tell the user to run `create <skill>` first and stop.

**Step 2.** Re-read the current template. Compare its `template_version` against the instantiated record's `template_version` — if they match and the user hasn't asked to change anything else, report "already in sync" and stop.

**Step 3.** Re-resolve repo URL / environment / schedule using the same procedure as CREATE Steps 3-5, but pre-fill each default from the existing record instead of asking from scratch.

**Step 4.** Assemble the body the same way as CREATE Step 6, then show a diff between the recorded config (schedule, template version, resolved values) and the freshly assembled one. If nothing changed, report that and stop.

**Step 5.** Review gate — same standard as CREATE Step 7: show the diff, confirm explicitly before acting.

If `--dry-run` was passed: show the diff and stop. Do not call `RemoteTrigger`. Do not rewrite the instantiated record.

**Step 6.** Call `RemoteTrigger {action: "update", trigger_id: <record.routine_id>, body: <assembled body>}`.

**Step 7.** Rewrite the instantiated record with the resolved schedule, the new `template_version`, and a fresh `created_at` timestamp (this field doubles as "last written at").

### STATUS `<skill>`

**Step 1.** Read `.claude-tweaks/routines/{routine_name}.yml`. If missing, report that no routine has been created for `<skill>` in this project and suggest `create <skill>`. Stop.

**Step 2.** Call `RemoteTrigger {action: "get", trigger_id: <record.routine_id>}` for live state — enabled/disabled, schedule, and any last/next run fields the response carries.

**Step 3.** Compare the record's `template_version` against the current template file's `template_version`. If they differ, flag it: "this routine was created from template v{N}; the template is now at v{M} — run `update {skill}` to re-sync."

Report both the live state and the drift check together.

## Next Actions

1. `/claude-tweaks:routine status <skill>` — check on a routine you just created. **(Recommended right after `create`.)**
2. `/schedule` — inspect, run, or list any routine (including ones this skill created) via the built-in conversational flow. (Deletion always happens at claude.ai/code/routines.)
3. `/claude-tweaks:routine update <skill>` — re-sync after the template changes.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|--------------|
| Writing `environment_id` or a repo URL into a skill's `routine-template.yml` | Templates ship with the plugin across every project and account — baking in one account's environment or one project's repo makes the template wrong everywhere else. |
| Skipping the review gate because the assembled body "looks right" | `RemoteTrigger create` has no delete counterpart — a mistaken routine runs on a live schedule until manually removed at claude.ai/code/routines. |
| Creating a second routine when an instantiated record already exists | Always check `.claude-tweaks/routines/{name}.yml` first and route to `update` — duplicate routines double-run the same work. |
| Committing account-specific values into the instantiated record | The record schema deliberately excludes `environment_id` and MCP credentials — it's meant to be safe to commit. |
| Treating `--dry-run`'s assembled body as already created | Nothing is created, updated, or written until the non-dry-run path completes its final API call and record write. |
| Caching `environment_id` under `~/.claude-tweaks/` | That path is harness-owned runtime state, not skill-owned — resolve it fresh via `RemoteTrigger list` each time instead. |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:recon` | Recon is this skill's first consumer — `skills/recon/routine-template.yml` is the reference template; recon's own SKILL.md points here instead of documenting manual `/schedule` setup. |
| `/schedule` (built-in) | `/routine` assembles the same `RemoteTrigger` body `/schedule` would build conversationally, but non-interactively from a template. `/schedule` remains the tool for one-off/exploratory routines and for listing, running, or inspecting a routine. Deletion always requires the web console at claude.ai/code/routines. |
| `skills/_shared/routine-template-schema.md` | Canonical schema for both the template and the instantiated record — referenced, not duplicated, here. |
