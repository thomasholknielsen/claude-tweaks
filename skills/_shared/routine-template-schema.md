# Routine Template Schema

Canonical schema for the two file types the routine-template mechanism uses. This file is the single source of truth — `/claude-tweaks:routine` and every skill's own `routine-template.yml` reference it rather than restating the field list.

## Why this exists

claude-tweaks is a single global plugin installed across many projects and one Anthropic account. A routine (a scheduled cloud agent, created via the `RemoteTrigger` tool) is inherently tied to one project + one account. Splitting "what's portable" from "what's per-instantiation" keeps a plugin-shipped template safe to reuse everywhere, and keeps the per-project record safe to commit.

## Template — `skills/{skill}/routine-template.yml`

Ships with the plugin. Plugin-owned, project-agnostic, account-agnostic. NEVER contains `environment_id`, a repo URL, or MCP credentials.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `template_version` | integer | yes | Bumped whenever this file's fields change. Instantiated records capture the version they were created from; `/claude-tweaks:routine status` compares the template's current version against the recorded version to detect drift. |
| `routine_name` | string | yes | Base name declared by the template (e.g. `code-health-daily`). At creation time, `/claude-tweaks:routine` prefixes this with a slug derived from the project's repo name (e.g. `claude-tweaks-code-health-daily`) before using it as the live routine's `name` field and the instantiated record's filename (`.claude-tweaks/routines/{prefixed-name}.yml`) — this prevents the common case of the same skill's routine colliding across every project it's instantiated in. Prefixing narrows but does not eliminate collisions (two projects with the same repo name, or repos under different orgs sharing a name, still collide) — `routine_id` remains the actual identity anchor when inspecting live routines. |
| `prompt` | string | yes | The exact kickoff message sent to the cloud session on each firing — must be self-contained (the cloud session starts with zero conversation history). Every template's `prompt` opens with the standard preamble below, ending with the actual `/claude-tweaks:{skill}` kickoff. |
| `model` | string | yes | Default model for the routine's session (e.g. `claude-sonnet-5`). |
| `allowed_tools` | array of strings | yes | Tool allowlist for the cloud session, e.g. `[Bash, Read, Grep, Glob]`. |
| `mcp_connections` | array of strings | no | Connector names this routine needs, if any. Each entry is a plain name string here — actual `connector_uuid`/`url` values are account-specific and resolved at instantiation time, never stored in the template. |
| `default_schedule.cron_expression` | string | yes | A UTC cron anchor (5-field, `RemoteTrigger` requires UTC, 1-hour minimum interval). This is a starting suggestion, not a guarantee it lands off-peak for whoever instantiates it — the creation flow always re-confirms against the creator's own timezone. |
| `default_schedule.description` | string | yes | Human-readable intent (e.g. "off-peak anchor, UTC — confirm against your local timezone at creation time"). |
| `notes` | string | no | Free-text guidance for whoever instantiates this (budget flags, tuning advice, links to the owning skill's own docs). |

## Standard prompt preamble

Every `prompt` field opens with this two-paragraph preamble before its actual `/claude-tweaks:{skill}` kickoff, addressing two failure modes observed in production cloud-Routine firings (a CCR container can start from a stale or even detached checkout, and a headless firing has no human present to notice it's re-enacting a project's own stale documentation as if it were this skill's live procedure):

```
Before anything else, fetch origin and confirm this checkout is at the tip of the
target branch (resolve the target branch from `git remote show origin`'s HEAD branch
line if not already obvious). If it's merely behind, fast-forward it via `git merge
--ff-only` — never `git reset --hard`. If it has diverged rather than just fallen
behind, stop and report that instead of proceeding on unverified state.

If any project documentation (CLAUDE.md, rules, README) describes this skill's past
or historical behavior in a way that doesn't match this skill's own current
instructions, treat the project doc as stale historical context — never as a
procedure to execute.

Then: /claude-tweaks:{skill}
```

`--ff-only` (not `--reset --hard`) deliberately keeps this compatible with `_shared/git-discipline.md`'s NEVER-`git reset` rule — a fresh routine firing hasn't made any commits of its own yet, so nothing is lost by refusing to proceed on a genuine divergence instead of forcing past it.

## Instantiated record — `.claude-tweaks/routines/{prefixed-name}.yml`

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
| Storing resolved `connector_uuid` or `url` values in a template's `mcp_connections` | Templates ship with the plugin across every project and account. A resolved connector value is account-specific and won't exist for anyone else. |
| Skipping `template_version` bumps when editing a template | `/claude-tweaks:routine status` relies on version comparison to detect drift — an unbumped version hides real changes. |
| Storing `environment_id` in the instantiated record "for convenience" | The record is meant to be safe to commit; account-scoped identifiers don't belong in a project repo. |
| Storing MCP connector credentials in the instantiated record | The record is meant to be safe to commit — account-scoped credentials don't belong in a project repo. |
| Claiming a template's routine runs safely unattended without checking the target skill's actual auto-mode behavior | A bare routine firing has zero conversation history and no CLI arg to signal `auto` mode — per `_shared/auto-mode-contract.md`'s precedence, a skill with no mode signal falls back to interactive and blocks forever on a prompt nobody answers. If a consumer skill needs `auto` mode to run unattended safely, its `notes` field (and the skill's own Routine Configuration section) must say so explicitly — don't invent new routine-specific mode-signaling to paper over it. |
| Writing a new `prompt` that skips the standard preamble | Observed in production: a CCR container started from a checkout up to a week stale (once detached from its expected branch entirely), and a separate firing narrated executing a step and label that don't exist anywhere in the shipped skill — apparently re-enacting a consuming project's own stale documentation about the skill's past behavior. The preamble is the cheap, self-contained mitigation for both; every template's `prompt` must open with it. |
| Granting `Edit` (or any write tool) in a template whose owning skill's `SKILL.md` documents a report-only contract | The tool allowlist is the actual enforcement boundary — a stale write grant left over from an earlier design can silently contradict the skill's own current Anti-Patterns table with no test or lint catching the mismatch. Keep the two in sync whenever either changes. |

## See also

- `skills/routine/SKILL.md` — the skill that reads templates and writes instantiated records
- `skills/code-health/routine-template.yml` — the reference template implementation (no auto-mode prerequisite — code-health has no interactive gate)
- `skills/tidy/routine-template.yml` — a template whose unattended safety genuinely depends on the target project's `auto-mode: default-on` already being set
