# Routine Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a versioned, project-agnostic routine-template mechanism — a shared schema, recon as the first template consumer, and a new `/claude-tweaks:routine` skill that instantiates a template into a live cloud Routine via the `RemoteTrigger` tool, non-interactively.

**Architecture:** Templates (`skills/{skill}/routine-template.yml`) ship with the plugin and are project/account-agnostic. Instantiated records (`.claude-tweaks/routines/{name}.yml`) are written per-project after a real `RemoteTrigger create`/`update` call and are safe to commit (no account secrets). `/claude-tweaks:routine` is the one generic mechanism that reads a template, resolves project/account-specific values, and drives `RemoteTrigger` directly — skipping `/schedule`'s own conversational flow, which exists for humans typing free-form requests, not for a skill that already has the answers. Spec: `docs/superpowers/specs/2026-07-04-routine-template-design.md`.

**Tech Stack:** Pure markdown/YAML skill content — no Node code, no npm dependency, no `bin/` script. This whole feature is prose-driven skill content interpreted directly by the agent (Read/Write/Bash), the same way `.claude-tweaks/pipelines/{run}/config.yml` is read/written today. There is nothing to `node --test` here — verification is manual dry-run invocation (Task 6), not an automated suite.

## Global Constraints

- `RemoteTrigger` tool contract (confirmed 2026-07-04 via live `/schedule` invocation, action list): `{action: "list"|"get"|"create"|"update"|"run"}`; `body` required for `create`/`update`; `trigger_id` required for `get`/`update`/`run`, pattern `^[\w-]+$`. Minimum cron interval is 1 hour. **No delete action exists** — deletion is always manual at claude.ai/code/routines.
- Templates NEVER contain `environment_id`, repo URLs, MCP credentials, or any other account/project-specific value — those are resolved at instantiation time only.
- Instantiated records NEVER contain `environment_id` or MCP credentials — they must be safe to commit to a project repo.
- Never write to `~/.claude-tweaks/` from skill content — that path is harness-owned (statusline wrapper, caches, usage state), per this plugin's own CLAUDE.md convention. Environment-ID resolution must not invent a cache file there.
- Every live `RemoteTrigger create`/`update` call requires an explicit user review/confirm step before it fires — no silent automation, since there is no delete-by-API to undo a mistake.
- Skill file conventions (from CLAUDE.md, applies to `skills/routine/SKILL.md`): frontmatter `name`/`description`; the standard interaction-style directive verbatim; ASCII lifecycle diagram; `## When to Use`; `## Input`; numbered `## Workflow`; `## Next Actions` (top-level, before Anti-Patterns/Relationship); `## Anti-Patterns` table (`| Pattern | Why It Fails |`); `## Relationship to Other Skills` table (bidirectional — every reference must be reciprocated). No emojis anywhere.
- Commit style: imperative, no conventional-commit prefixes, e.g. `Add routine-template-schema — canonical schema for plugin templates and project records`.

---

### Task 1: Shared routine-template schema doc

**Files:**
- Create: `skills/_shared/routine-template-schema.md`

**Interfaces:**
- Produces: the canonical field list for `routine-template.yml` (read by Task 2, Task 3) and for the instantiated `.claude-tweaks/routines/{name}.yml` record (read/written by Task 3).

- [ ] **Step 1: Write the schema doc**

Follow the precedent of `skills/_shared/subagent-output-contract.md` (single source of truth, referenced not duplicated). Write `skills/_shared/routine-template-schema.md`:

```markdown
# Routine Template Schema

Canonical schema for the two file types the routine-template mechanism uses. This file is the single source of truth — `/claude-tweaks:routine` and every skill's own `routine-template.yml` reference it rather than restating the field list.

## Why this exists

claude-tweaks is a single global plugin installed across many projects and one Anthropic account. A routine (a scheduled cloud agent, created via the `RemoteTrigger` tool) is inherently tied to one project + one account. Splitting "what's portable" from "what's per-instantiation" keeps a plugin-shipped template safe to reuse everywhere, and keeps the per-project record safe to commit.

## Template — `skills/{skill}/routine-template.yml`

Ships with the plugin. Plugin-owned, project-agnostic, account-agnostic. NEVER contains `environment_id`, a repo URL, or MCP credentials.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `template_version` | integer | yes | Bumped whenever this file's fields change. Instantiated records capture the version they were created from; `/claude-tweaks:routine status` compares live vs. recorded to detect drift. |
| `routine_name` | string | yes | Base name used for both the created routine's `name` field and the instantiated record's filename (`.claude-tweaks/routines/{routine_name}.yml`). |
| `prompt` | string | yes | The exact kickoff message sent to the cloud session on each firing — must be self-contained (the cloud session starts with zero conversation history). |
| `model` | string | yes | Default model for the routine's session (e.g. `claude-sonnet-5`). Instantiation may let the user override. |
| `allowed_tools` | array of strings | yes | Tool allowlist for the cloud session, e.g. `[Bash, Read, Grep, Glob]`. |
| `mcp_connections` | array | no (default `[]`) | Connector names this routine needs, if any. Each entry is a plain name string here — actual `connector_uuid`/`url` values are account-specific and resolved at instantiation time, never stored in the template. |
| `default_schedule.cron_expression` | string | yes | A UTC cron anchor (5-field, `RemoteTrigger` requires UTC, 1-hour minimum interval). This is a starting suggestion, not a guarantee it lands off-peak for whoever instantiates it — the creation flow always re-confirms against the creator's own timezone. |
| `default_schedule.description` | string | yes | Human-readable intent (e.g. "off-peak anchor, UTC — confirm against your local timezone at creation time"). |
| `notes` | string | no | Free-text guidance for whoever instantiates this (budget flags, tuning advice, links to the owning skill's own docs). |

## Instantiated record — `.claude-tweaks/routines/{routine_name}.yml`

Written per-project, after a successful `RemoteTrigger create` or `update`. Project-owned. Safe to commit — deliberately excludes anything account-specific.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `routine_id` | string | yes | The trigger/routine ID from `RemoteTrigger`'s create response. Source of truth for subsequent `update`/`get`/`run` calls — never re-derive or guess this. |
| `template` | string | yes | Which skill's template this came from (matches the directory under `skills/`). |
| `template_version` | integer | yes | The template's `template_version` at the time this record was written. Compared against the template's current value to detect drift. |
| `created_at` | string | yes | ISO 8601 UTC timestamp of creation (or last update). |
| `schedule` | string | yes | The `cron_expression` actually chosen at instantiation (may differ from the template's `default_schedule`). |
| `console_url` | string | yes | The claude.ai routine URL from the create/update response. |

**Never write to this record:** `environment_id`, MCP connector credentials, or any other account secret. If a future need arises to reference the environment, store only a human-readable label the user chose, never the raw ID.

## Anti-Patterns

| Pattern | Why It Fails |
|---|---|
| Putting `environment_id` or a repo URL in a `routine-template.yml` | Templates ship with the plugin across every project and account. A baked-in environment or repo makes the template wrong everywhere except the one place it was authored. |
| Skipping `template_version` bumps when editing a template | `/claude-tweaks:routine status` relies on version comparison to detect drift — an unbumped version hides real changes. |
| Storing `environment_id` in the instantiated record "for convenience" | The record is meant to be safe to commit; account-scoped identifiers don't belong in a project repo. |

## See also

- `skills/routine/SKILL.md` — the skill that reads templates and writes instantiated records
- `skills/recon/routine-template.yml` — the reference template implementation
```

- [ ] **Step 2: Self-check against the design spec**

Re-read `docs/superpowers/specs/2026-07-04-routine-template-design.md`'s template and instantiated-record YAML examples. Confirm every field named there (`template_version`, `routine_name`, `prompt`, `model`, `allowed_tools`, `mcp_connections`, `default_schedule.cron_expression`, `default_schedule.description`, `notes` for the template; `routine_id`, `template`, `template_version`, `created_at`, `schedule`, `console_url` for the record) appears in the schema doc with matching semantics. Fix any mismatch before committing.

- [ ] **Step 3: Commit**

```bash
git add skills/_shared/routine-template-schema.md
git commit -m "Add routine-template-schema — canonical schema for plugin templates and project records"
```

---

### Task 2: Recon becomes the first template consumer

**Files:**
- Create: `skills/recon/routine-template.yml`
- Modify: `skills/recon/SKILL.md:225-241` (replace the "Routine Configuration" section), and its Relationship to Other Skills table (`skills/recon/SKILL.md:307-317`)

**Interfaces:**
- Consumes: schema from Task 1 (`skills/_shared/routine-template-schema.md`).
- Produces: `skills/recon/routine-template.yml` — the reference template Task 3's manual verification (Task 6) instantiates.

- [ ] **Step 1: Write recon's routine template**

Create `skills/recon/routine-template.yml`:

```yaml
template_version: 1
routine_name: recon-daily
prompt: "/claude-tweaks:recon"
model: claude-sonnet-5
allowed_tools: [Bash, Read, Grep, Glob]
mcp_connections: []
default_schedule:
  cron_expression: "0 3 * * *"
  description: "off-peak anchor, UTC — confirm against your local timezone at creation time"
notes: >
  Recon's own next-slice rotation makes a skipped or repeated firing harmless — no
  --area flag is passed, so next-slice always picks the highest-priority slice
  automatically. See skills/recon/SKILL.md's "Routine Configuration" section for
  the --budget / token-cap tuning guidance this template doesn't need to restate.
```

- [ ] **Step 2: Replace recon's Routine Configuration section**

In `skills/recon/SKILL.md`, replace lines 225-241 (the entire `## Routine Configuration` section, from the `## Routine Configuration` heading through the `> **Billing note:**` line) with:

```markdown
## Routine Configuration

`/recon` ships a routine template (`skills/recon/routine-template.yml`) designed for small, predictable sips: one slice per run, so a scheduled firing is cheap and a skipped one is harmless. Instantiate it for the current project with:

```
/claude-tweaks:routine create recon
```

This resolves the account- and project-specific values a portable template can't hardcode (which environment, which repo) and creates a live cloud Routine via `RemoteTrigger` directly — see `skills/routine/SKILL.md` for the full mechanism. Add `--dry-run` to inspect the assembled configuration before anything is created.

**Headless run flow:** SCOPE(`next-slice`) → CLASSIFY → JUDGE → `validate-findings` → file issues. Triage happens later in GitHub — the Routine does not wait for interactive input. The template's prompt omits `--area` so `next-slice` always picks the highest-priority slice automatically.

A skipped run (e.g., `next-slice` returns `null` because all slices are fresh) is harmless — rotation resumes from the same position on the next window.

> **Billing note:** Routines run inside the subscription; verify automation-credit specifics against the live account.
```

- [ ] **Step 3: Add the bidirectional Relationship row**

In `skills/recon/SKILL.md`'s `## Relationship to Other Skills` table, add a new row (matching the existing table's style, e.g. after the `/claude-tweaks:deepen` row):

```markdown
| `/claude-tweaks:routine` | `/routine create recon` instantiates recon's `routine-template.yml` into a live, scheduled cloud Routine — the mechanism behind this skill's own "Routine Configuration" section. |
```

- [ ] **Step 4: Verify the SKILL.md edit didn't break structure**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks" && grep -n "^## " skills/recon/SKILL.md
```

Expected: the section order is unchanged except `## Routine Configuration` is shorter — `## Regression and Critical Gating` still immediately follows it, and `## Relationship to Other Skills` still has its new row before the closing of the file. No duplicate headings, no orphaned content from the old section.

- [ ] **Step 5: Commit**

```bash
git add skills/recon/routine-template.yml skills/recon/SKILL.md
git commit -m "Give recon a routine template — first consumer of the routine-template mechanism"
```

---

### Task 3: New skill — frontmatter, structure, and the CREATE workflow

**Files:**
- Create: `skills/routine/SKILL.md`

**Interfaces:**
- Consumes: `RemoteTrigger` tool (`{action: "list"|"get"|"create"|"update"|"run", body?, trigger_id?}`, confirmed contract above); schema from Task 1; template shape from Task 2 (recon's is the concrete example this task's prose refers to).
- Produces: `skills/routine/SKILL.md` containing frontmatter through the full CREATE workflow (Task 4 appends UPDATE/STATUS/Next Actions/Anti-Patterns/Relationship to the same file).

- [ ] **Step 1: Write the skill file through the CREATE workflow**

Create `skills/routine/SKILL.md`:

```markdown
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
| `--dry-run` (combine with `create`/`update`) | Assemble and display the `RemoteTrigger` body; never call the tool, never write or rewrite the instantiated record. |

## Workflow

### CREATE `<skill>`

**Step 1 — Load the template.** Read `${CLAUDE_PLUGIN_ROOT}/skills/{skill}/routine-template.yml`. If it doesn't exist, stop: "`{skill}` has no routine-template.yml — it doesn't support routines yet." The field schema is documented once in `skills/_shared/routine-template-schema.md` — read it if any field's meaning is unclear.

**Step 2 — Idempotency check.** Check whether `.claude-tweaks/routines/{routine_name}.yml` already exists in the current project (`routine_name` from the template). If it does, stop this workflow and continue at UPDATE below instead — never create a second routine for the same project+skill.

**Step 3 — Resolve the repo URL.**

```bash
git remote get-url origin
```

Normalize to full HTTPS the same way `/schedule` does: accept `org/repo`, `git@github.com:org/repo.git`, or `https://github.com/org/repo` and produce `https://github.com/{org}/{repo}` (strip any `.git` suffix, convert the SSH form).

**Step 4 — Resolve `environment_id`.** Load the tool with `ToolSearch select:RemoteTrigger`, then call `{action: "list"}`. If existing routines are returned, read `job_config.ccr.environment_id` off the most recently created one and offer it as the default (let the user override). If none exist yet, ask the user directly which environment to use — present whatever environment names/IDs are available in context; if none are, ask the user to name one (they can check via `/schedule` once if unsure). Do not cache this value anywhere under `~/.claude-tweaks/` — that path is harness-owned, not skill-owned.

**Step 5 — Resolve the schedule.** Present the template's `default_schedule.cron_expression` (always UTC) and ask the user to confirm it actually lands off-peak in their own timezone, or supply a different cron expression. Use the same UTC-conversion-and-confirm discipline `/schedule` itself uses: state the conversion explicitly ("9am Europe/Copenhagen = 7am UTC, so `0 7 * * *`") before locking it in. Minimum interval is 1 hour — reject anything tighter and ask for a looser schedule.

**Step 6 — Assemble the `RemoteTrigger create` body.**

```json
{
  "name": "<template.routine_name, or user override>",
  "cron_expression": "<resolved cron, UTC>",
  "job_config": {
    "ccr": {
      "environment_id": "<resolved environment_id>",
      "session_context": {
        "model": "<template.model>",
        "sources": [{"git_repository": {"url": "<resolved repo URL>"}}],
        "allowed_tools": ["<template.allowed_tools, verbatim>"]
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
```

- [ ] **Step 2: Self-check the CREATE workflow against the design spec and RemoteTrigger contract**

Re-read `docs/superpowers/specs/2026-07-04-routine-template-design.md`'s "Confirmed mechanism" section and this plan's Global Constraints. Confirm: the assembled JSON body matches the documented `create` shape field-for-field (`name`, `cron_expression`, `job_config.ccr.environment_id`, `session_context.model`/`sources`/`allowed_tools`, `events[0].data.uuid`/`session_id`/`type`/`parent_tool_use_id`/`message`); the review gate (Step 7) happens before Step 8's actual call in every case, including `--dry-run` (which stops before Step 8 entirely); no step writes to `~/.claude-tweaks/`. Fix any drift before committing.

- [ ] **Step 3: Commit**

```bash
git add skills/routine/SKILL.md
git commit -m "Add claude-tweaks:routine skill — frontmatter, structure, and the CREATE workflow"
```

---

### Task 4: New skill — UPDATE/STATUS workflows, Next Actions, Anti-Patterns, Relationship table

**Files:**
- Modify: `skills/routine/SKILL.md` (append after the CREATE workflow written in Task 3)

**Interfaces:**
- Consumes: everything Task 3 established (file location, `RemoteTrigger` contract, instantiated-record schema from Task 1).
- Produces: the complete `skills/routine/SKILL.md`.

- [ ] **Step 1: Append the UPDATE and STATUS workflows, then the closing sections**

Append to `skills/routine/SKILL.md` (immediately after Task 3's CREATE workflow, still under the `## Workflow` heading):

```markdown
### UPDATE `<skill>`

**Step 1.** Require an existing `.claude-tweaks/routines/{routine_name}.yml` for the current project (routed here automatically from CREATE's idempotency check, or invoked directly). If none exists, tell the user to run `create <skill>` first and stop.

**Step 2.** Re-read the current template. Compare its `template_version` against the instantiated record's `template_version` — if they match and the user hasn't asked to change anything else, report "already in sync" and stop.

**Step 3.** Re-resolve repo URL / environment / schedule using the same procedure as CREATE Steps 3-5, but pre-fill each default from the existing record instead of asking from scratch.

**Step 4.** Assemble the body the same way as CREATE Step 6, then show a diff between the recorded config (schedule, template version, resolved values) and the freshly assembled one. If nothing changed, report that and stop.

**Step 5.** Review gate — same standard as CREATE Step 7: show the diff, confirm explicitly before acting.

If `--dry-run` was passed: show the diff and stop. Do not call `RemoteTrigger`. Do not rewrite the instantiated record.

**Step 6.** Call `RemoteTrigger {action: "update", trigger_id: <record.routine_id>, body: <assembled body>}`.

**Step 7.** Rewrite the instantiated record with the new `template_version` and a fresh `created_at` timestamp (this field doubles as "last written at").

### STATUS `<skill>`

**Step 1.** Read `.claude-tweaks/routines/{routine_name}.yml`. If missing, report that no routine has been created for `<skill>` in this project and suggest `create <skill>`. Stop.

**Step 2.** Call `RemoteTrigger {action: "get", trigger_id: <record.routine_id>}` for live state — enabled/disabled, schedule, and any last/next run fields the response carries.

**Step 3.** Compare the record's `template_version` against the current template file's `template_version`. If they differ, flag it: "this routine was created from template v{N}; the template is now at v{M} — run `update {skill}` to re-sync."

Report both the live state and the drift check together.
```

- [ ] **Step 2: Append Next Actions, Anti-Patterns, and Relationship to Other Skills**

Append (as new top-level `##` sections, in this order — Next Actions before Anti-Patterns per this plugin's placement convention):

```markdown
## Next Actions

1. `/claude-tweaks:routine status <skill>` — check on a routine you just created. **(Recommended right after `create`.)**
2. `/schedule` — inspect or run any routine (including ones this skill created) via the built-in conversational flow; also the only path to delete one.
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
| `/schedule` (built-in) | `/routine` assembles the same `RemoteTrigger` body `/schedule` would build conversationally, but non-interactively from a template. `/schedule` remains the tool for one-off/exploratory routines and for listing, running now, or deleting a routine. |
| `skills/_shared/routine-template-schema.md` | Canonical schema for both the template and the instantiated record — referenced, not duplicated, here. |
```

- [ ] **Step 3: Self-check the full file's structure**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks" && grep -n "^## \|^# " skills/routine/SKILL.md
```

Expected order: `# Routine — Instantiate Versioned Cloud Routines`, `## When to Use`, `## Input`, `## Workflow`, `## Next Actions`, `## Anti-Patterns`, `## Relationship to Other Skills`. Confirm no `## Component-Skill Contract` section exists (this skill is directly user-invoked, not called as a sub-step by other skills — matching `/claude-tweaks:version`'s precedent of omitting that section entirely).

- [ ] **Step 4: Commit**

```bash
git add skills/routine/SKILL.md
git commit -m "Complete claude-tweaks:routine — UPDATE/STATUS workflows and closing sections"
```

---

### Task 5: Cross-reference updates

**Files:**
- Modify: `CLAUDE.md:34` (skill count), `CLAUDE.md:38` (Utility skill list)
- Modify: `README.md` (new Utility skill paragraph, after the existing recon paragraph)
- Modify: `skills/help/reference-card.md` (new Utility table row, after the existing recon row)

**Interfaces:**
- Consumes: nothing new — this task only adds mentions of the skill built in Tasks 3-4.

- [ ] **Step 1: Update CLAUDE.md**

In `CLAUDE.md`, change:

```
### Skill directories (23 total)
```

to:

```
### Skill directories (24 total)
```

And change line 38 from:

```
**Utility:** help, tidy, flow, browse, ledger, version, research, recon
```

to:

```
**Utility:** help, tidy, flow, browse, ledger, version, research, recon, routine
```

- [ ] **Step 2: Update README.md**

In `README.md`, immediately after the existing `**\`/claude-tweaks:recon\`**` paragraph (the one ending "...Runs on a scheduled Routine for continuous coverage."), add a new paragraph in the same style:

```markdown
**`/claude-tweaks:routine`** — Instantiates a skill's plugin-shipped routine template (e.g. recon's) into a live Claude Code cloud Routine for the current project, resolving account- and project-specific values (environment, repo) that a portable template can't hardcode, then calling `RemoteTrigger` directly — no manual `/schedule` walkthrough needed. Writes a committable instantiated record to `.claude-tweaks/routines/`. Supports `create`, `update`, and `status`, plus `--dry-run` to inspect the assembled configuration before anything is created.
```

- [ ] **Step 3: Update the help reference card**

In `skills/help/reference-card.md`, in the `## Utility` table, immediately after the existing `/claude-tweaks:recon` row, add:

```markdown
| `/claude-tweaks:routine` | Instantiate a skill's routine template (e.g. recon's) into a live cloud Routine via `RemoteTrigger`, non-interactively | `create <skill>`, `update <skill>`, `status <skill>`, `--dry-run` |
```

- [ ] **Step 4: Verify all three edits landed correctly**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks" && grep -n "routine" CLAUDE.md README.md skills/help/reference-card.md
```

Expected: at least one match in each file referencing `/claude-tweaks:routine` (plus CLAUDE.md's count and list-line matches), no leftover "23 total".

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md README.md skills/help/reference-card.md
git commit -m "Cross-reference claude-tweaks:routine — CLAUDE.md skill list, README, help reference card"
```

---

### Task 6: Manual dry-run verification

**Files:** none created or modified — this task is a verification pass, not a code change.

**Interfaces:**
- Consumes: everything built in Tasks 1-5, exercised as a real (dry-run) invocation.

This feature has no automated test suite — it's prose-driven skill content, not `bin/` code, and `RemoteTrigger` has no sandbox to run tests against. This task is the actual verification: invoke the real skill, in dry-run mode, and confirm the assembled body is correct by inspection.

- [ ] **Step 1: Invoke the skill for real, in dry-run mode**

In a live Claude Code session with the claude-tweaks plugin loaded (`claude --plugin-dir "/Users/thomasholknielsen/Code Workspaces/claude-tweaks"`, run from inside that same repo so `git remote get-url origin` resolves to the real claude-tweaks GitHub URL):

```
/claude-tweaks:routine create recon --dry-run
```

- [ ] **Step 2: Confirm the assembled body against the checklist**

Verify the printed (not created — dry-run) body has:
- `name` equal to `recon-daily` (or whatever `routine_name` Task 2 set).
- `cron_expression` present and 5-field, UTC, at least 1 hour between fires (recon's template default: `0 3 * * *`).
- `job_config.ccr.environment_id` populated with something the skill resolved during Step 4 of CREATE (not a placeholder string).
- `job_config.ccr.session_context.sources[0].git_repository.url` equal to `https://github.com/thomasholknielsen/claude-tweaks` (normalized, no `.git` suffix).
- `job_config.ccr.session_context.allowed_tools` equal to `["Bash", "Read", "Grep", "Glob"]` (from recon's template).
- `job_config.ccr.session_context.model` equal to `claude-sonnet-5`.
- `job_config.ccr.events[0].data.message.content` equal to `/claude-tweaks:recon`.
- `job_config.ccr.events[0].data.uuid` is a fresh, valid lowercase v4 UUID (different each invocation).
- No `mcp_connections` key present (recon's template declares none).

- [ ] **Step 3: Confirm nothing was actually created or written**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks" && git status --short && ls .claude-tweaks/routines/ 2>&1
```

Expected: `git status --short` shows no changes (dry-run wrote nothing), and `.claude-tweaks/routines/` either doesn't exist or doesn't contain a `recon-daily.yml` from this run.

- [ ] **Step 4: Record the verification outcome**

If all checks in Step 2 pass and Step 3 confirms no side effects, the feature is verified end-to-end. If anything fails, fix the relevant task's `skills/routine/SKILL.md` content and re-run this task's Step 1 before considering the plan complete — do not mark this task done with an unresolved discrepancy.

No commit for this task (nothing changed on disk) — but note the verification result when reporting the plan's completion.
