# Routine Diagnostic Probe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Task 3 is NOT a normal subagent-dispatchable task.** It fires a real Claude Code cloud Routine and requires waiting on a genuine async cloud job (minutes, not seconds) plus reading its real output — a dispatched subagent cannot fabricate or assume this result. Whoever executes this plan must run Task 3 directly.

**Goal:** Ship `skills/_shared/routine-diagnostic-probe.md` — a reusable procedure any skill or plan can reference to fire an ad hoc diagnostic against a target project's Claude Code cloud Routine environment, via one reusable per-project trigger slot instead of a fresh hand-built `RemoteTrigger` call each time.

**Architecture:** One new shared markdown file (no runtime code — this is entirely skill-prose, executed by whichever agent invokes it). Environment resolution is referenced from `skills/routine/SKILL.md`'s existing CREATE Step 4, not duplicated. The manual-only trigger mechanism (`cron_expression: ""`, no `run_once_at`, `enabled: false`, fired only via `RemoteTrigger {action: "run"}`) is written as a confirmed fact, verified directly this session by reading `memenu-app`'s existing `memenu-app-env-smoke-test` trigger's live stored config (`RemoteTrigger {action: "get", trigger_id: "trig_01WhacyFwoa6MGX8A12AYGt3"}` returned exactly `"cron_expression":""`, no `run_once_at` field, `"enabled":false`) — not guessed from the `/schedule` skill's own documentation, which states "exactly one of `cron_expression`/`run_once_at` is required."

**Tech Stack:** Markdown skill-file prose. `RemoteTrigger` tool (list/get/create/update/run — no delete).

## Global Constraints

- No claim in this file may be written as fact unless it was confirmed against a live `RemoteTrigger` call this session, or is an explicit reference to another file's existing, already-shipped procedure (`skills/routine/SKILL.md`'s CREATE Step 4). No guessed API behavior.
- Work happens in the existing worktree at `.claude/worktrees/routine-diagnostic-probe`, branch `worktree-routine-diagnostic-probe` — do not create a new worktree. Commit after every task.
- `npm test` must stay green after every task (this plan touches only markdown files, so no test should be affected — a failure means something unrelated broke).

---

### Task 1: Write `skills/_shared/routine-diagnostic-probe.md`

**Files:**
- Create: `skills/_shared/routine-diagnostic-probe.md`

**Interfaces:**
- Consumes: `skills/routine/SKILL.md`'s CREATE Step 2 (`REPO_SLUG` derivation) and Step 4 (environment resolution) by reference — do not restate their logic.
- Produces: the complete procedure Task 3 exercises for real, and that `docs/superpowers/plans/2026-08-02-dispatch-mcp-bridge.md`'s Tasks 1-2 will be revised to use afterward (out of scope for this plan — that revision happens once this file exists and is verified).

- [ ] **Step 1: Write the complete file**

```markdown
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

**Not found** — create it: resolve `environment_id` exactly as `skills/routine/SKILL.md`'s CREATE Step 4 non-guided procedure does (cache → project-local records → account-wide list-and-filter → direct user input if none resolve) — follow that file's own steps rather than re-deriving the logic here. If Step 4's own guided-creation fallback would trigger (no environment resolves from any source), stop and tell the user directly: there is no existing environment for this project to run a diagnostic against, and creating one is `skills/routine/guided-environment-creation.md`'s job, not this procedure's — a diagnostic probe should never be the reason a brand-new billed environment gets created.

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
```

- [ ] **Step 2: Read the whole file back**

Confirm every fenced code block is syntactically valid (the JSON body parses, the bash/ToolSearch lines are correctly formatted) and that no section contradicts another (the "Firing" section's "fires immediately regardless of enabled/schedule state" must not conflict with Body construction's `enabled: false`).

- [ ] **Step 3: Commit**

```bash
git add skills/_shared/routine-diagnostic-probe.md
git commit -m "Add reusable cloud-environment diagnostic probe shared procedure"
```

---

### Task 2: Cross-reference from `routine/SKILL.md`

**Files:**
- Modify: `skills/routine/SKILL.md`

**Interfaces:**
- Consumes: nothing new.
- Produces: a one-line acknowledgment that a new file depends on this skill's CREATE Step 4, so a future edit to Step 4 knows to check this dependent too.

- [ ] **Step 1: Find the Relationship to Other Skills table**

Locate the `## Relationship to Other Skills` section (near the end of the file, per this project's standard SKILL.md structure).

- [ ] **Step 2: Add one row**

Add a new row to that table:

```markdown
| `_shared/routine-diagnostic-probe.md` | Consumer, not a skill — references this skill's CREATE Step 4 environment-resolution procedure by name rather than duplicating it, for firing ad hoc diagnostics against an already-existing project environment. A future change to Step 4's resolution sources must consider this dependent. |
```

- [ ] **Step 3: Commit**

```bash
git add skills/routine/SKILL.md
git commit -m "Cross-reference the new diagnostic-probe procedure from routine/SKILL.md"
```

---

### Task 3: Real end-to-end verification

**Files:** None modified — this task only exercises Task 1's procedure for real.

**Interfaces:**
- Consumes: Task 1's complete `routine-diagnostic-probe.md` procedure, executed literally, step by step, exactly as written — this is the test.
- Produces: confirmation (or a found bug to fix in Task 4) that the documented mechanism works against a real project (`memenu-io/memenu-app`).

- [ ] **Step 1: Follow the Slot resolution section against `memenu-io/memenu-app`**

```
RemoteTrigger {action: "list"}
```

Filter for `name === "memenu-app-diagnostic-probe"`. Expected: not found (this is a new slot, distinct from the existing `memenu-app-env-smoke-test`). Confirm this expectation — if it unexpectedly already exists, treat that as the **Found** branch instead and adjust (reuse it).

- [ ] **Step 2: Resolve `environment_id`**

Per Task 1's file, follow `skills/routine/SKILL.md`'s CREATE Step 4. Since `memenu-app` already has multiple live routines, source (a) or (b) should resolve `env_01JUAbDzSvXMmhNuB9aERiVi` without needing guided creation — confirm this is what happens; if guided creation would trigger instead, stop and report (per Task 1's file, this procedure never creates a new environment).

- [ ] **Step 3: Construct and create the trigger**

Build the body exactly per Task 1's Body construction section, with this trivial diagnostic prompt as the `message.content`:

```
This is a one-time diagnostic probe verifying the routine-diagnostic-probe shared procedure itself works end-to-end — not a real check of anything else. Run `echo "diagnostic probe reachable"` via Bash and report its exact output.

Report one PASS/FAIL line per check. For any MCP tool call, name the exact tool and parameters used. On failure, quote the exact error message verbatim — do not paraphrase.
```

Call `RemoteTrigger {action: "create", body: <constructed body>}`. Report the returned `trigger_id` and console URL.

- [ ] **Step 4: Fire it**

```
RemoteTrigger {action: "run", trigger_id: <trigger_id from Step 3>}
```

- [ ] **Step 5: Wait, then read the real result**

Wait a real interval (do not poll aggressively). Read the actual run output via the console URL or `RemoteTrigger {action: "get", trigger_id}`. Confirm: the echo command actually ran and its output was reported, in the PASS/FAIL format the prompt requested.

- [ ] **Step 6: Leave the trigger in its resting state**

Confirm `enabled: false` (it should already be, since Body construction sets it and nothing in this task changes it). No further action needed — this is the slot future diagnostics against `memenu-app` will reuse.

---

### Task 4: Finalize based on verification

**Files:**
- Modify: `skills/_shared/routine-diagnostic-probe.md` (only if Task 3 found a discrepancy)

**Interfaces:**
- Consumes: Task 3's real results.

- [ ] **Step 1: Compare Task 3's actual results against Task 1's documented procedure**

If everything matched exactly (slot resolution, body construction, creation, firing, and reading back all worked as documented) — no file changes needed, proceed to Step 3.

If anything differed (a field name was wrong, an extra field was required, the `cron_expression: ""` convention didn't behave as expected for a newly-created trigger even though it did for the pre-existing one) — fix `skills/_shared/routine-diagnostic-probe.md` to match the real, now-twice-confirmed behavior.

- [ ] **Step 2: If Step 1 required a fix, commit it**

```bash
git add skills/_shared/routine-diagnostic-probe.md
git commit -m "Correct routine-diagnostic-probe.md per live verification findings"
```

- [ ] **Step 3: Run `npm test`**

```bash
npm test
```

Expected: all passing (this plan touches only markdown files).

- [ ] **Step 4: Merge and report**

Follow this project's normal `superpowers:finishing-a-development-branch` flow to merge `worktree-routine-diagnostic-probe`. Report to the user: the shared procedure is live and verified against a real cloud firing. Next step is revising `docs/superpowers/plans/2026-08-02-dispatch-mcp-bridge.md`'s Tasks 1-2 to use it instead of the original ad hoc `/schedule` approach — a small edit to that plan, not a new design cycle.
