---
name: claude-tweaks:routine
description: Use when you want to create, update, or check the status of a Claude Code cloud Routine for a claude-tweaks skill — instantiates a versioned, project-agnostic routine template (e.g. code-health's) into a live, account-and-project-specific scheduled routine via the RemoteTrigger API. Keywords - routine, schedule, cron, cloud agent, recurring, automation.
argument-hint: "<create|update|status> <skill>|--all [--dry-run] [--defaults] [--environment <id>] [--refresh-environment]"
---
> **Interaction style:** Single decisions → one `AskUserQuestion` call, one option marked Recommended. Multi-item → batch table with recommendations pre-filled, then one `AskUserQuestion` for apply-all/override. Never more than one call per decision; resolve each before the next. End with `## Next Actions` via `AskUserQuestion`, not a navigation menu.

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

Resolve the mode from `$ARGUMENTS` (`create` | `update` | `status`), then read exactly one procedure file from this skill's directory. The three modes are mutually exclusive, and `status --all` — the form `/claude-tweaks:init`'s Update Mode fires in bulk — has no use for CREATE's or UPDATE's body at all.

| Mode | Read | Covers |
|---|---|---|
| `create <skill>` | `create-and-update.md` | CREATE Steps 0-9. Its Step 3 idempotency check routes to UPDATE automatically — same file, no second read. |
| `update <skill>` | `create-and-update.md` | UPDATE Steps 0-7. UPDATE reuses CREATE's Steps 1, 2, 4, and 6 by name, which is why the two modes share one file rather than splitting into two that would each read the other. |
| `status <skill>` / `status --all` | `status.md` | STATUS Steps 1-3.5, including the `--all` bulk-enumeration branch. Needs nothing from CREATE or UPDATE. |

`create` and `update` additionally read `schedule-resolution.md` for CREATE Step 5's sub-steps (5a's cron-to-cadence classification, 5b-5d's interactive picker). `update --defaults` skips schedule re-resolution entirely and never reads it; `status` never reaches it at all.

Step numbering inside those files is unchanged from before the split, so cross-references from other skills that name a step by number (`/claude-tweaks:init`'s Step 15 and Update Mode, `_shared/routine-diagnostic-probe.md`, `guided-environment-creation.md`) still resolve — via the three stubs below.

### CREATE `<skill>`

Steps 0-9 live in `create-and-update.md` in this skill's directory; Step 5's own 5a-5d live in `schedule-resolution.md`.

### UPDATE `<skill>`

Steps 0-7 live in `create-and-update.md` in this skill's directory, after the CREATE section.

### STATUS `<skill>`

Steps 1-3.5, including the `--all` branch, live in `status.md` in this skill's directory.

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
