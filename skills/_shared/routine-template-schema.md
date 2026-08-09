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
| `prompt` | string | yes | The exact kickoff message sent to the cloud session on each firing — must be self-contained (the cloud session starts with zero conversation history). Every template's `prompt` opens with the standard preamble below, ending with the actual `/claude-tweaks:{skill}` kickoff. The preamble's one placeholder, `{{TARGET_BRANCH}}`, is substituted at instantiation and never ships to a live routine. |
| `branch` | string | no | An explicit target branch for the preamble's `{{TARGET_BRANCH}}` placeholder. **Normally unset in a plugin-shipped template** — which branch a routine should audit is a property of the project, not of the plugin, so `/claude-tweaks:routine` resolves it per project (CREATE Step 5.5's precedence list) and this field is only the pin that outranks everything below an explicit `--branch`. Set it only in a template vendored alongside exactly one project. Unset *and* unresolvable → the placeholder falls back to the pre-`branch` wording, preserving the behavior every template had before this field existed. |
| `model` | string | yes | Default model for the routine's session (e.g. `claude-sonnet-5`). |
| `allowed_tools` | array of strings | yes | Tool allowlist for the cloud session, e.g. `[Bash, Read, Grep, Glob]`. |
| `mcp_connections` | array of strings | no | Connector names this routine needs, if any. Each entry is a plain name string here — actual `connector_uuid`/`url` values are account-specific and resolved at instantiation time, never stored in the template. |
| `default_schedule.cron_expression` | string | yes | A UTC cron anchor (5-field, `RemoteTrigger` requires UTC, 1-hour minimum interval). This is a starting suggestion, not a guarantee it lands off-peak for whoever instantiates it — the creation flow always re-confirms against the creator's own timezone. |
| `default_schedule.description` | string | yes | Human-readable intent (e.g. "off-peak anchor, UTC — confirm against your local timezone at creation time"). |
| `notes` | string | no | Free-text guidance for whoever instantiates this (budget flags, tuning advice, links to the owning skill's own docs). |

## Standard prompt preamble

Every `prompt` field opens with this preamble before its actual `/claude-tweaks:{skill}` kickoff, addressing the failure modes observed in production cloud-Routine firings that a headless run has nobody present to notice: a CCR container can start from a stale or even detached checkout; a firing can re-enact a project's own stale documentation as if it were this skill's live procedure; and the sandbox can resolve a plugin build older than the one the marketplace serves, which reads from the outside exactly like a bug in the current build (see `## Resolved-build line` below):

```
Before anything else, fetch origin and confirm this checkout is on {{TARGET_BRANCH}}
and at its tip. If the container started on a different branch, check the target
branch out first (`git checkout <branch>`, creating it from `origin/<branch>` if it
isn't local yet). If it's merely behind, fast-forward it via `git merge --ff-only` —
never `git reset --hard`. If it has diverged rather than just fallen behind, stop and
report that instead of proceeding on unverified state.

If any project documentation (CLAUDE.md, rules, README) describes this skill's past
or historical behavior in a way that doesn't match this skill's own current
instructions, treat the project doc as stale historical context — never as a
procedure to execute.

Before invoking the skill below, print exactly one line recording which plugin build
this session resolved AND which path resolved it. Try these in order, stopping at the
first that yields a readable `.claude-plugin/plugin.json`.

(1) `env` — if `${CLAUDE_PLUGIN_ROOT}` is set and non-empty, read
`${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`. Never assume it is set: it is
routinely empty in a cloud Routine sandbox, which is the whole reason the rungs below
exist.

(2) `hook-path` — the claude-tweaks SessionStart hook emits its own harness-resolved
plugin root into this session's context, embedded in a `node "<path>/bin/hooks.js"`
invocation. That path carries the same authority as (1), since the harness expanded it.
It is emitted only when the repo has unfinished pipeline runs to report, so it is often
simply absent — that is normal, not an error.

(3) `cache-scan` — glob `~/.claude/plugins/cache/*/claude-tweaks/*/.claude-plugin/plugin.json`.
Exactly one match is unambiguous: report it as `cache-scan-unique`. Two or more means
the highest-semver directory is a GUESS at which build this session actually loaded —
report it as `cache-scan-highest-of-N`, N being the candidate count, and never as a
confirmed answer.

(4) If nothing resolves, say `claude-tweaks version unresolved (no CLAUDE_PLUGIN_ROOT,
no hook path, no plugin cache found)` and carry on.

Format: `claude-tweaks v{version} @ {path} (resolved via: {env | hook-path |
cache-scan-unique | cache-scan-highest-of-N})`. Never report a version without its
resolution path — the point is that a hook-derived answer is stronger evidence than a
directory guess, and a bare version string hides which one you got. Diagnostic only —
never a gate, never a reason to stop — but without it a sandbox pinned to a stale
plugin build and a real bug in the current build are indistinguishable from the
outside.

Regardless of which rung resolved, also run `claude plugin list --json` once and print
its output verbatim (fall back to `ls -la ~/.claude/plugins/cache/*/*/ 2>&1` if that
command errors). This is the single, deterministic listing of every plugin actually
installed, not just claude-tweaks — printing it now means a later diagnostic pass, if
one becomes necessary, doesn't have to re-derive the same fact through several more
exploratory commands.

If all four rungs above came up empty (`unresolved`), the plugin cache is genuinely
empty. Do not attempt the kickoff below first — invoking a skill against zero installed
plugins fails predictably and only spends a turn re-establishing what the `unresolved`
line already established. Go straight to `bash scripts/claude-cloud-setup.sh` to
self-heal (the same script this project's cloud environment's Setup script field should
already run automatically — if it simply wasn't invoked for this container, this
repairs it for the rest of this session), then re-run the resolved-build line once
before proceeding to the kickoff.

Then: /claude-tweaks:{skill}
```

`--ff-only` (not `--reset --hard`) deliberately keeps this compatible with `_shared/git-discipline.md`'s NEVER-`git reset` rule — a fresh routine firing hasn't made any commits of its own yet, so nothing is lost by refusing to proceed on a genuine divergence instead of forcing past it.

### `{{TARGET_BRANCH}}` — substituted at instantiation, never sent literally

`{{TARGET_BRANCH}}` is the preamble's only placeholder. Templates ship it unsubstituted because the branch a routine should audit is a property of the project, not of the plugin. `/claude-tweaks:routine` resolves it per project (CREATE Step 5.5) and substitutes it into the `message.content` it hands to `RemoteTrigger`, so a live routine never contains the literal placeholder:

| Resolution outcome | Text substituted for `{{TARGET_BRANCH}}` |
|---|---|
| A branch resolved (say `dev`) | `` `dev` `` — the branch name, in backticks |
| Nothing resolved | ``the target branch (resolve it from `git remote show origin`'s HEAD branch line if not already obvious)`` |

The unresolved substitution reproduces this preamble's pre-`branch` wording, so a project where nothing resolves keeps exactly the behavior it had before the field existed.

**Why the placeholder exists.** That unresolved wording is only correct when a repo's active development branch *is* its GitHub default branch. On a `dev` → `staging` → `main` model where `main` is the default, every firing audited `main`: on one reported repo a tree 102 commits behind the active branch **and 51 ahead of it** — divergent, not merely stale, because urgent fixes are cherry-picked straight onto it. Findings were judged against a tree matching neither branch's current state, and fixes already merged to the active branch were re-reported as live problems on every firing, with nothing in the report indicating why (#132, confirming for all four health engines what #61 could only show for `/dispatch`). Naming the branch is only half the fix — the "check the target branch out first" sentence is the other half, since a container that starts on the wrong branch previously had no instruction to leave it.

Copying a template's `prompt` by hand — into `/schedule`, or into the claude.ai routine editor — means substituting `{{TARGET_BRANCH}}` by hand too. A live routine whose prompt still shows the literal placeholder was provisioned without substitution; re-sync it per "Re-provisioning" below.

### Resolved-build line

`${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json` is the only authoritative answer to "which build is this session running" — it is the directory the running skill files were loaded from, so it cannot disagree with them the way an installation record can. Three nearby surfaces are **not** substitutes:

- `claude plugin list --json`'s `version` and `installed_plugins.json` are installation *metadata*, written beside the cache directory rather than read out of it.
- `installed_plugins.json`'s `gitCommitSha` records the original **install** and is not refreshed by `claude plugin update` (confirmed live: a cross-version 6.23.7 → 6.38.1 update left the pre-update sha in place), so it can name a commit the installed files were never at.
- A successful `claude plugin update` proves nothing about content — it compares the installed version string against the *local* marketplace catalog and stops there. See `skills/init/bootstrap/step-14-cloud-routine-parity.md`'s Setup-script verify step for what that means for a sandbox, and why the generated script re-checks instead of trusting it.

Changing this preamble does not reach routines that already exist — a `RemoteTrigger`'s prompt is a frozen copy taken at creation time. Existing routines pick it up only via `/claude-tweaks:routine update {skill}`.

## Instantiated record — `.claude-tweaks/routines/{prefixed-name}.yml`

Written per-project, after a successful `RemoteTrigger create` or `update`. Project-owned. Safe to commit — deliberately excludes anything account-specific.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `routine_id` | string | yes | The trigger/routine ID from `RemoteTrigger`'s create response. Source of truth for subsequent `update`/`get`/`run` calls — never re-derive or guess this. |
| `template` | string | yes | Which skill's template this came from (matches the directory under `skills/`). |
| `template_version` | integer | yes | The template's `template_version` at the time this record was written. Compared against the template's current value to detect drift. |
| `model` | string | yes | The template's `model` value at the time this record was last written (create or update). A significant field for `skills/routine/record-freshness.md`'s comparison, so a copy naming a different model than the integration branch's is reported as drift. |
| `created_at` | string | yes | ISO 8601 UTC timestamp of creation (or last update). |
| `schedule` | string | yes | The `cron_expression` actually chosen at instantiation (may differ from the template's `default_schedule`). |
| `console_url` | string | yes | The claude.ai routine URL from the create/update response. |
| `branch` | string | no | The branch actually substituted into this routine's live prompt. Omitted entirely when nothing resolved (the routine runs the fallback wording). `update` reuses this value as its default, so a re-sync can't silently re-point an existing routine at a different branch just because the session happens to be on one. A branch name is project-scoped, not account-scoped, so it is safe to commit — unlike the values the paragraph below bans. |

**Never write to this record:** `environment_id`, MCP connector credentials, or any other account secret. If a future need arises to reference the environment, store only a human-readable label the user chose, never the raw ID.

## Re-provisioning after a template change

A live routine carries a *copy* of the template's `prompt`, frozen when it was created. Editing a template here never reaches a routine that is already running — a template fix looks landed while every firing keeps executing the old text. Closing that gap takes one of:

| Situation | What to run |
|---|---|
| The project has an instantiated record (`.claude-tweaks/routines/*.yml`) | `/claude-tweaks:routine update <skill>` — re-assembles the body from the current template and calls `RemoteTrigger update` on the recorded `routine_id`, replacing the live prompt in place. The routine keeps its ID, its schedule, and its console URL. |
| Several routines in one project | `/claude-tweaks:routine status --all` first — it names every record whose `template_version` is behind — then `update` each row it reports as **Drifted**. `/claude-tweaks:init`'s Update Mode already runs both in sequence. |
| The routine was created outside this skill, so no record exists | Nothing here can find it: source (b)'s `RemoteTrigger list` is unpaginated, and a hand-made routine populates no repo URL to match on anyway. Edit its prompt directly at claude.ai/code/routines, or delete it there and run `/claude-tweaks:routine create <skill>`. |

`template_version` is what makes any of this discoverable — STATUS compares the record's recorded version against the template's current one, so bumping it on every template edit is what turns a silently-stale routine into a **Drifted** row. A template edit that skips the bump leaves every existing routine running the old prompt with nothing reporting it.

## Anti-Patterns

| Pattern | Why It Fails |
|---|---|
| Putting `environment_id` or a repo URL in a `routine-template.yml` | Templates ship with the plugin across every project and account. A baked-in environment or repo makes the template wrong everywhere except the one place it was authored. |
| Storing resolved `connector_uuid` or `url` values in a template's `mcp_connections` | Templates ship with the plugin across every project and account. A resolved connector value is account-specific and won't exist for anyone else. |
| Skipping `template_version` bumps when editing a template | `/claude-tweaks:routine status` relies on version comparison to detect drift — an unbumped version hides real changes. |
| Storing `environment_id` in the instantiated record "for convenience" | The record is meant to be safe to commit; account-scoped identifiers don't belong in a project repo. |
| Storing MCP connector credentials in the instantiated record | The record is meant to be safe to commit — account-scoped credentials don't belong in a project repo. |
| Claiming a template's routine runs safely unattended without checking the target skill's actual auto-mode behavior | A bare routine firing has zero conversation history and no CLI arg to signal `auto` mode — per `_shared/auto-mode-contract.md`'s precedence, a skill with no mode signal falls back to interactive and blocks forever on a prompt nobody answers. If a consumer skill needs `auto` mode to run unattended safely, its `notes` field (and the skill's own Routine Configuration section) must say so explicitly — don't invent new routine-specific mode-signaling to paper over it. |
| Hardcoding a project's development branch into a plugin-shipped `routine-template.yml`'s `branch` field | Same reason `environment_id` and repo URLs are banned from templates — one file ships to every project and account. `dev` is right for the repo it was authored against and wrong for the next one, and it silently outranks that project's own `integration-branch` policy. Leave `branch` unset and let `/claude-tweaks:routine` resolve it per project. |
| Sending a prompt with `{{TARGET_BRANCH}}` still in it | The placeholder is instantiation-time only. A live routine containing it tells the cloud agent to check out a branch literally named `{{TARGET_BRANCH}}`, which matches nothing — so the firing proceeds on whatever the container happened to check out, which is precisely the failure the placeholder exists to prevent. |
| Writing a new `prompt` that skips the standard preamble | Observed in production: a CCR container started from a checkout up to a week stale (once detached from its expected branch entirely), and a separate firing narrated executing a step and label that don't exist anywhere in the shipped skill — apparently re-enacting a consuming project's own stale documentation about the skill's past behavior. A third firing hard-gated on a check the shipped build no longer gates on, because its sandbox was still resolving a build from before that gate was removed — days after the removal shipped, with every `claude plugin update` in between reporting success (#129). The preamble is the cheap, self-contained mitigation for all three; every template's `prompt` must open with it. |
| Granting `Edit` (or any write tool) in a template whose owning skill's `SKILL.md` documents a report-only contract | The tool allowlist is the actual enforcement boundary — a stale write grant left over from an earlier design can silently contradict the skill's own current Anti-Patterns table with no test or lint catching the mismatch. Keep the two in sync whenever either changes. |

## See also

- `skills/routine/SKILL.md` — the skill that reads templates and writes instantiated records
- `skills/code-health/routine-template.yml` — the reference template implementation (no auto-mode prerequisite — code-health has no interactive gate)
- `skills/tidy/routine-template.yml` — a template whose unattended safety genuinely depends on the target project's `auto-mode: default-on` already being set
