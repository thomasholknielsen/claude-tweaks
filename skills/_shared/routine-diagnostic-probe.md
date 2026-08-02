# Routine Diagnostic Probe — Shared Procedure

Single source of truth for firing an ad hoc diagnostic check against a target project's Claude Code cloud Routine environment — verifying an MCP tool exists, a dependency chain works, or general environment health — without hand-constructing a one-off `RemoteTrigger` call from scratch each time. This file has no callable surface of its own — every step below is executed by the calling skill/plan.

## Slot resolution

One reusable, deterministically-named trigger per project, not a fresh one per diagnostic (`RemoteTrigger` has no delete action — see Cleanup below):

```
{REPO_SLUG}-diagnostic-probe
```

Derive `REPO_SLUG` exactly as `skills/routine/SKILL.md`'s CREATE Step 2 does: lowercase the target repo URL's `{repo}` segment, replace any run of characters outside `[a-z0-9]` with a single `-`, trim leading/trailing `-`.

```
ToolSearch select:RemoteTrigger
RemoteTrigger {action: "list"}
```

Filter the returned triggers to `name === "{REPO_SLUG}-diagnostic-probe"`.

**Found** — reuse it: skip straight to Body construction below with this `trigger_id`, using the **Update** branch.

**Not found** — create it: resolve `environment_id` exactly as `skills/routine/SKILL.md`'s CREATE Step 4 non-guided procedure does (cache → project-local records → account-wide list-and-filter → guided-creation fallback if none resolve) — follow that file's own steps rather than re-deriving the logic here. If Step 4's own guided-creation fallback would trigger (no environment resolves from any source), stop and tell the user directly: there is no existing environment for this project to run a diagnostic against, and creating one is `skills/routine/guided-environment-creation.md`'s job, not this procedure's — a diagnostic probe should never be the reason a brand-new billed environment gets created.

## Body construction

```json
{
  "name": "{REPO_SLUG}-diagnostic-probe",
  "enabled": false,
  "cron_expression": "",
  "job_config": {
    "ccr": {
      "environment_id": "<resolved environment_id>",
      "session_context": {
        "model": "claude-sonnet-5",
        "sources": [{"git_repository": {"url": "<target project's resolved repo URL>"}}],
        "allowed_tools": ["Bash", "Read", "Grep", "Glob"]
      },
      "events": [{"data": {
        "uuid": "<fresh lowercase v4 uuid>",
        "session_id": "",
        "type": "user",
        "parent_tool_use_id": null,
        "message": {"content": "<caller's diagnostic prompt, per Prompt content below>", "role": "user"}
      }}]
    }
  },
  "mcp_connections": [{
    "connector_uuid": "bf7c680d-5fdc-5ef4-b4a0-abadb619bf0a",
    "name": "Claude_Code_Remote",
    "url": "https://api.anthropic.com/v1/code/mcp/meta",
    "transport_type": "http"
  }]
}
```

`"cron_expression": ""` (an explicit empty string, not an omitted field) plus no `run_once_at` at all is the confirmed shape of a manual-only trigger — verified directly against `memenu-app`'s own pre-existing `memenu-app-env-smoke-test` trigger's live stored config, not assumed from `/schedule`'s own docs (which describe "exactly one of `cron_expression`/`run_once_at`" as required — that requirement evidently doesn't hold, or an empty-string `cron_expression` satisfies it).

`allowed_tools` above is the minimum — a caller whose diagnostic needs to write files adds `Write`/`Edit` itself. The `mcp_connections` entry is not optional: every real, working routine in this account carries it, and it is almost certainly what exposes GitHub MCP tools inside the sandbox — a diagnostic built without it may silently run with no MCP tools available at all, invalidating whatever it was trying to check.

**Create** (slot didn't exist): `RemoteTrigger {action: "create", body: <above>}`.

**Update** (slot already existed): `RemoteTrigger {action: "update", trigger_id: <found trigger_id>, body: {"job_config": <the job_config object above, with a fresh uuid>}}` — a partial update; only `job_config` needs to change, `name`/`enabled`/`cron_expression`/`mcp_connections` stay as they already are.

## Prompt content

The caller supplies the full diagnostic prompt — checks vary too much (GitHub MCP primitives, environment health, plugin invocability) for this procedure to templatize. The prompt must end with this exact reporting-convention paragraph, verbatim:

> Report one PASS/FAIL line per check. For any MCP tool call, name the exact tool and parameters used. On failure, quote the exact error message verbatim — do not paraphrase.

## Firing and waiting

`RemoteTrigger {action: "run", trigger_id: <trigger_id>}` fires immediately regardless of `enabled`/schedule state — confirmed live against `memenu-app`'s own `memenu-app-env-smoke-test` trigger.

No polling mechanism exists for this. The caller waits a real interval (minutes, not seconds) before reading the result — via the console URL the `create`/`run` response includes, or `RemoteTrigger {action: "get", trigger_id}`. This is a genuine async wait; do not fabricate or assume a result before reading the real transcript.

## Cleanup

None needed. Leave the slot `enabled: false` (its resting state) after reading results — it stays in the account, reused by the next diagnostic against this same project. `RemoteTrigger` has no delete action; deleting the slot entirely (if ever wanted) requires the claude.ai/code/routines web UI.

## Accepted limitation

Two callers firing different diagnostics against the same project's slot concurrently race on last-write-wins for the prompt. Self-correcting, low-stakes — not worth a lock for an occasional manual diagnostic, same posture this codebase already accepts for `/claude-tweaks:backlog refine`'s own label race.

## Consumers

| Consumer | Use |
|---|---|
| `docs/superpowers/plans/2026-08-02-dispatch-mcp-bridge.md` | Tasks 1-2 (to be revised once this file exists) — verifying the gh-CLI/MCP bridge's confirmed tool primitives |
