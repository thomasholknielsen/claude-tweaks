# Routine Templates — Versioned, Reproducible Cloud Routines for claude-tweaks

**Date:** 2026-07-04
**Status:** Approved (brainstorm 2026-07-04)
**Origin:** Follow-on from the recon-routine-operationalization brainstorm. Budget-aware scheduling was researched and aborted (see memory `claude-tweaks-recon-routine-budget-decision`). This spec covers the surviving thread: routine definitions as versioned, reproducible repo artifacts, generalized so any skill can gain routine support without new plumbing.

## Problem

`/schedule` (built-in) creates Claude Code cloud Routines via the `RemoteTrigger` tool, but every routine today is a one-off manually assembled through `/schedule`'s conversational flow. Nothing captures *why* a given routine exists, what config it was created with, or how to reproduce it — recon's `SKILL.md` "Routine Configuration" section is prose documentation of a recommended setup, not something that actually produces or tracks a real routine.

claude-tweaks is a single global plugin installed across many of the user's projects. A routine (e.g. "run `/claude-tweaks:recon` nightly") is inherently tied to one project + one Anthropic account, so the mechanism must separate what's portable (plugin-owned, ships with the skill) from what's per-instantiation (account- and project-specific, resolved at creation time) — the same split claude-tweaks already uses for policy (`policy.yml`) and pipeline state (`.claude-tweaks/pipelines/`).

## Confirmed mechanism (verified 2026-07-04 by invoking `/schedule` in read-only `list` mode — no routine was created)

`/schedule` is a thin conversational wrapper around the `RemoteTrigger` tool. The tool itself requires no interactivity:

- `{action: "list"}` / `{action: "get", trigger_id}` — read
- `{action: "create", body: {...}}` — fully specified in one call; no back-and-forth required
- `{action: "update", trigger_id, body: {...}}` — partial update
- `{action: "run", trigger_id}` — run now
- **No delete action exists.** Deletion is always a manual step at claude.ai/code/routines.

`create` body shape (fields load-bearing for this design):

```json
{
  "name": "string",
  "cron_expression": "5-field cron, UTC, 1-hour minimum interval",
  "job_config": {
    "ccr": {
      "environment_id": "env_... (account-specific)",
      "session_context": {
        "model": "claude-sonnet-5",
        "sources": [{"git_repository": {"url": "https://github.com/org/repo"}}],
        "allowed_tools": ["Bash", "Read", "Grep", "Glob"]
      },
      "events": [{"data": {"uuid": "<v4 uuid>", "session_id": "", "type": "user", "parent_tool_use_id": null, "message": {"content": "PROMPT", "role": "user"}}}]
    }
  }
}
```

`cron_expression` is mutually exclusive with `run_once_at` (RFC3339 UTC). `mcp_connections` is optional (array of `{connector_uuid, name, url}`, account-scoped). Minimum cron interval is 1 hour.

## Architecture: template (plugin-owned) vs. instantiated record (project-owned)

### Template — ships with the plugin, one per skill that supports routines

Location: `skills/{skill}/routine-template.yml`. Captures only what's portable across every project and account:

```yaml
template_version: 1
routine_name: recon-daily          # base name; instantiation may suffix it
prompt: "/claude-tweaks:recon"     # the kickoff message sent to the cloud session
model: claude-sonnet-5             # default; instantiation may override
allowed_tools: [Bash, Read, Grep, Glob]
mcp_connections: []                # connector names this routine needs, if any (recon: none)
default_schedule:
  cron_expression: "0 3 * * *"     # anchor value, UTC (API requirement) — recon's existing SKILL.md
                                    # says "03:00 off-peak" without specifying a timezone; the create
                                    # workflow's schedule-override step (below) re-confirms this against
                                    # the creator's own local timezone rather than assuming this UTC
                                    # value already lands off-peak for them
  description: "off-peak anchor, UTC — confirm against your local timezone at creation time"
notes: "Recon's --budget flag defaults to 1 slice/run; see SKILL.md Routine Configuration for tuning."
```

No `environment_id`, no repo URL, no account identifiers — those never belong in a plugin-shipped file. The schema itself (field names, required vs. optional, versioning rule) is documented once in `skills/_shared/routine-template-schema.md`, referenced by every skill that ships a template — the same pattern `subagent-output-contract.md` already establishes for the Subagent Contract.

### Instantiated record — written per-project, per-routine

Location: `.claude-tweaks/routines/{routine_name}.yml` in the project the routine was created *for*. Written after a successful `RemoteTrigger create`/`update`:

```yaml
routine_id: "trig_..."             # from RemoteTrigger's response — the source of truth for update/run
template: recon                    # which skill's template this came from
template_version: 1                # template_version at creation time — deliberately not auto-synced (see Deferred)
created_at: "2026-07-04T12:34:56Z"
schedule: "0 3 * * *"               # the schedule actually chosen (may differ from the template default)
console_url: "https://claude.ai/code/routines/trig_..."
```

Deliberately excludes `environment_id`, MCP credentials, and anything account-specific — this file is safe to commit. It exists so `git clone`ing the project (or opening it on a different machine) makes it visible that a live routine exists for it, and gives `update`/`run` a `routine_id` to target without re-discovering it.

## The creation mechanism: one new skill, not one per routine-supporting skill

New utility skill: `/claude-tweaks:routine` (named to avoid colliding with the built-in `/schedule`). `$ARGUMENTS`: `create <skill>`, `update <skill>`, `status <skill>`.

### `create <skill>` workflow

1. **Load the template** — read `skills/{skill}/routine-template.yml`. If absent, report that the skill doesn't support routines and stop.
2. **Idempotency check** — if `.claude-tweaks/routines/{routine_name}.yml` already exists in the current project, route to the `update` flow instead (never silently create a duplicate routine for the same project+skill).
3. **Resolve the project-specific value** — `git remote get-url origin` in the current project, normalized to full HTTPS (same normalization `/schedule` already documents: accept `org/repo`, `git@...`, etc.).
4. **Resolve the account-specific value (`environment_id`)** — no local cache file (writing to `~/.claude-tweaks/` from skill content is explicitly forbidden by this plugin's own conventions — that path is harness-owned). Instead: call `RemoteTrigger {action: "list"}` and inspect existing routines' `job_config.ccr.environment_id`. If any exist, default to the most recently created one's environment. If none exist yet, ask the user directly which environment to use. (Exactly how available environments get enumerated when none exist yet — e.g. whether a `RemoteTrigger` action or another tool call surfaces the account's environment list outside of `/schedule`'s own pre-populated prompt context — is an implementation detail to confirm when this skill is actually built, not a design-level decision; worst case, the user names it from memory or by checking `/schedule` themselves once.)
5. **Resolve the schedule** — offer the template's `default_schedule`; let the user override (with the same UTC conversion/confirmation discipline `/schedule` uses).
6. **Assemble the full `RemoteTrigger create` body** from template + resolved values. Generate the `events[].data.uuid` fresh (v4).
7. **Review gate** — show the assembled config in full before acting; this is a live, hard-to-reverse external write (no delete-by-API), so it always gets an explicit confirm, regardless of how the rest of the flow was driven.
8. **Create** — call `RemoteTrigger {action: "create", body}`. On success, write the instantiated record (above) to `.claude-tweaks/routines/{routine_name}.yml` and report the console URL.
9. **`--dry-run`** — assemble and display the body (steps 1-6) without calling `RemoteTrigger` or writing the record. For validating the mechanism without touching a live account.

### `update <skill>` workflow

Requires an existing instantiated record (routes here automatically from `create` when one is found). Reads the current template (which may have changed since the record was written), diffs against the record's `template_version` and schedule, presents what would change, confirms, calls `RemoteTrigger {action: "update", trigger_id, body}`, and rewrites the instantiated record with the new `template_version`/timestamp.

### `status <skill>`

Reads the instantiated record if present, calls `RemoteTrigger {action: "get", trigger_id}` to show live state (enabled/disabled, last run, next run) alongside the recorded template version — a lightweight drift check (has the template moved on since this routine was created?).

## Recon as first consumer

- `skills/recon/routine-template.yml` created per the schema above, with `default_schedule` matching recon's already-documented 3am-daily recommendation and `notes` carrying forward the existing `--budget`/token-cap guidance.
- `skills/recon/SKILL.md`'s existing "Routine Configuration" prose section is replaced with a short pointer: the template exists, run `/claude-tweaks:routine create recon` to instantiate it for the current project. The billing-note caveat and headless-run-flow description stay (they're not superseded by this mechanism).

## Cross-references requiring updates (bidirectional convention)

- `CLAUDE.md`: Utility skill list (`help, tidy, flow, browse, ledger, version, research, recon` → add `routine`), skill count (23 → 24).
- `README.md` and `/help`'s `reference-card.md`/command-map: add `/claude-tweaks:routine`.
- `skills/recon/SKILL.md`'s Relationship table: add a row for `/claude-tweaks:routine` (bidirectional — `routine`'s own Relationship table references `recon` back as its first consumer/example).
- `skills/_shared/subagent-output-contract.md`'s "See also"-style precedent is the model for the new `skills/_shared/routine-template-schema.md` file.

## Testing approach

`RemoteTrigger` creates real, live, billed cloud infrastructure — there is no sandbox. Testing therefore centers on `--dry-run`: assembling the body from a template + fixture project values and asserting its shape (required fields present, cron validity, URL normalization, UUID format) without ever calling the tool. A single real end-to-end creation (recon, against a disposable/test repo, immediately followed by inspecting and then manually deleting via the web UI since no delete API exists) is a one-time manual verification, not an automated test.

## Explicitly deferred (YAGNI — no second routine exists yet to design against)

- Auto-propagating template changes to already-instantiated routines (the `update` flow surfaces drift; it doesn't push automatically).
- A routine-listing/status dashboard beyond what `status <skill>` and `/schedule list` already give.
- Cross-project routine discovery/inventory (e.g. "show me every routine across every project I've created one in") — `RemoteTrigger {action: "list"}` already returns everything account-wide if this is ever needed ad hoc.
- MCP-connector resolution UX beyond "ask if the template declares a need and the account doesn't have it connected" (mirrors `/schedule`'s own existing behavior).
- Push notification on routine failure — considered and dropped 2026-07-05 (see Addendum below); genuinely speculative without having seen a real failure yet.

## Addendum (2026-07-05) — closing out deferred items, post-implementation improvements

The mechanism shipped (v5.2.0) with exactly one consumer (recon). Using it surfaced six follow-on improvements, approved for implementation as a single follow-on plan:

1. **Schema-conformance test.** No automated check validates `routine-template.yml` files against the schema — only manual dry-run does. Add a `node --test` check that walks every `skills/*/routine-template.yml` and asserts required fields, types, and the anti-pattern exclusions (no `environment_id`, no repo URL, no account identifiers). No YAML library exists in this repo (`package.json` declares zero deps, runtime or dev) — write a minimal reader scoped to exactly this schema's shape (flat scalars, one nested map, two arrays, one folded scalar), not a general-purpose YAML parser.
2. **A second consumer skill.** The template/record split has one example. `/claude-tweaks:tidy` is the right second case, not `/claude-tweaks:research` (research's `$ARGUMENTS` is an arbitrary per-invocation topic — a fixed template `prompt` can't represent that portably). Tidy already has first-class standalone-auto support (aggressiveness-routed staging, atomic actions, its own `decisions.md` audit trail) — it's a better-suited unattended-execution candidate than initially assumed, not a contrived one.
3. **Routine names prefixed by project.** `routine_name` in a template (e.g. `recon-daily`) collides across every project it's instantiated in — confirmed live during Task 6's dry-run verification, which surfaced a pre-existing unrelated routine sharing the name. Fix: derive a repo-name slug from the already-resolved repo URL (CREATE Step 3) and prefix it onto the template's `routine_name` at creation time (e.g. `claude-tweaks-recon-daily`) — for both the live routine's `name` and the instantiated record's filename. Confirmed via clarifying question: repo name from git remote, not folder name or a user-supplied alias (deterministic, reuses an already-resolved value).
4. **Fix the `.claude-tweaks/` `.gitignore` contradiction, and cache environment resolution.** Two related fixes to the same area:
   - **Bug (verified 2026-07-05):** `/init`'s Step 0.4 suggests a blanket `.claude-tweaks/` gitignore line. The instantiated record lives at `.claude-tweaks/routines/{name}.yml` and is explicitly documented as "safe to commit" — but a blanket parent-directory ignore makes it uncommittable in any project that follows `/init`'s own suggestion, and git's negation rules can't cleanly un-ignore a subdirectory of an already-ignored parent. Fix: replace the blanket line with explicit subdirectory entries (`.claude-tweaks/pipelines/`, `.claude-tweaks/research/`, plus the new cache file below), leaving `.claude-tweaks/routines/` untouched (and therefore trackable).
   - **Improvement:** CREATE Step 4's environment resolution (`RemoteTrigger list`, default to the most recently created routine's environment) is fragile in multi-project accounts. Add a small project-local, gitignored cache (`.claude-tweaks/routine-environment-cache.yml`, explicitly excluded by the fix above) that CREATE/UPDATE check first and write back to after resolving/confirming an environment — still overridable, just a better-than-nothing default within one project across multiple skills.
5. **Richer drift detection in STATUS.** Today's drift check only compares `template_version` integers. Extend it to diff whatever resolved fields (`cron_expression`, `model`, `allowed_tools`, repo URL) the `RemoteTrigger get` response actually returns against the template/record — falling back to the version-only comparison when the response doesn't carry them (no assumption is made about the exact response shape beyond what the original design already confirmed: "enabled/disabled, schedule, and any last/next run fields").
6. **`/claude-tweaks:init` facilitates routine installation.** New Phase 0.96 (mirroring the existing Impeccable/diagram-design optional-companion pattern in Phase 0.9/0.95): detect which claude-tweaks skills ship a `routine-template.yml` without an existing instantiated record for the current project, and offer to walk through `/claude-tweaks:routine create <skill>` for each. `/init` does not reimplement any resolution/review-gate logic — it discovers candidates and hands off entirely to `/routine`'s own CREATE workflow, inheriting its mandatory confirmation gate for free. Since `/init` is not a `/flow`-style pipeline orchestrator, it does not set `$PIPELINE_RUN_DIR` — invocations pass `--source init` instead, which `/claude-tweaks:routine`'s new Component-Skill Contract section treats as an equally authoritative parent-invocation signal for this specific caller (a deliberate, documented deviation from the canonical CSC template's usual "rare fallback" framing, since it's the *only* signal available for this particular parent).

Testing approach for this addendum: Task 1 is real, automated `node --test` coverage. Tasks 2-6 remain markdown/YAML procedure changes verified by grep/read self-checks and `npm test` staying green, same as the original implementation.
