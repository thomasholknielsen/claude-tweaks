# /routine Multi-Instance Variants Implementation Plan — Phase 3

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let `/claude-tweaks:routine` instantiate more than one scheduled routine per skill via named template variants (`skills/{skill}/routine-template-<variant>.yml`), and ship tidy's first consumer of this — a frequent, GitHub-issue-only triage routine running alongside the existing weekly full sweep.

**Architecture:** Four tasks. Task 1 adds `--variant` support to `/claude-tweaks:routine`'s CREATE/UPDATE/STATUS workflows — no instantiated-record schema change, since `PREFIXED_NAME` already derives from each template's own `routine_name`, which differs per variant by construction. Task 2 documents the sibling-file naming convention in the shared schema file. Task 3 rewrites `/init` Step 13's candidate discovery to enumerate variants, not just skills — this requires deriving `REPO_SLUG` inside `/init` (previously avoided as "prefix-agnostic"), because the instantiated record schema has no field naming which variant a record belongs to; only the record's filename does. Task 4 ships the actual payoff: `skills/tidy/routine-template-github-triage.yml`, wired into tidy's own docs and routine's Relationship table.

Task 1 has no dependency on the others. Task 2 is independent of Task 1 (different file) but conceptually documents what Task 1 builds — order doesn't matter, listed second for narrative flow. Task 3 depends on Task 1's `--variant` argument existing (it invokes `/routine create <skill> --variant=<name>`). Task 4 depends on Task 1 (the mechanism it exercises) and on Phase 2 already having landed (`--scope=github` must be a real, working `/tidy` argument for Task 4's template's `prompt` field to do anything useful) — sequence Phase 2 before Phase 3 for this reason, per the design doc.

**Tech Stack:** Markdown (skill prose) + one new YAML file. No JS, no new dependencies.

## Global Constraints

- Design doc: `docs/superpowers/specs/2026-07-09-backlog-simplify-tidy-scope-routine-variants-design.md`, Section C.
- **No instantiated-record schema change.** `skills/_shared/routine-template-schema.md`'s "Instantiated record" field table (`routine_id`, `template`, `template_version`, `created_at`, `schedule`, `console_url`) is not touched by any task in this phase.
- **No breaking change for existing consumers.** code-health, flow, and harness-health ship only a default `routine-template.yml` each — every edit in this phase must leave `--variant`-omitted behavior byte-identical to today for them.
- Variant file naming is fixed: `skills/{skill}/routine-template-<variant>.yml`, sibling to the default `skills/{skill}/routine-template.yml`. Not a subdirectory restructure (design doc's rejected alternative).
- This phase depends on Phase 2 (`/tidy --scope`) already being merged — Task 4's template references `--scope=github` as a real argument.

---

### Task 1: `--variant` support in `/claude-tweaks:routine`

**Files:**
- Modify: `skills/routine/SKILL.md` (Input table, CREATE Step 1, CREATE Step 3, UPDATE Step 1, STATUS Step 1, Anti-Patterns table — six edits)

**Interfaces:**
- Consumes: nothing from other tasks in this phase.
- Produces (for Task 3): the working `create <skill> --variant=<name> [--source init]` invocation Task 3's rewritten `/init` Step 13 depends on. Produces (for Task 4): the working `create tidy --variant=github-triage` invocation the design's testing section exercises.

- [ ] **Step 1: Confirm current exact text before editing**

Read `skills/routine/SKILL.md` in full. Confirm the `## Input` table (currently lines 26-36) reads exactly:

```markdown
`$ARGUMENTS`:

| Argument | Behavior |
|---|---|
| `create <skill>` | Instantiate `<skill>`'s routine template into a live routine for the current project. Routes to the UPDATE workflow automatically if an instantiated record already exists for this project+skill. |
| `update <skill>` | Re-sync an existing routine against its (possibly changed) template. |
| `status <skill>` | Show the instantiated record alongside live routine state. |
| `--dry-run` (combine with `create`/`update`) | Assemble and display the `RemoteTrigger` body; never make a `create`/`update` call (read-only `list`/`get` calls to resolve values are still permitted), never write or rewrite the instantiated record. |
| `--source <parent-skill>` | Used by a parent skill (e.g. `/claude-tweaks:init`) to identify itself as the caller; see Component-Skill Contract below. |
```

If the text differs (another session edited this file concurrently), stop and re-read the current file in full before proceeding.

- [ ] **Step 2: Edit the Input table**

Use the Edit tool with this exact `old_string`:

```
`$ARGUMENTS`:

| Argument | Behavior |
|---|---|
| `create <skill>` | Instantiate `<skill>`'s routine template into a live routine for the current project. Routes to the UPDATE workflow automatically if an instantiated record already exists for this project+skill. |
| `update <skill>` | Re-sync an existing routine against its (possibly changed) template. |
| `status <skill>` | Show the instantiated record alongside live routine state. |
| `--dry-run` (combine with `create`/`update`) | Assemble and display the `RemoteTrigger` body; never make a `create`/`update` call (read-only `list`/`get` calls to resolve values are still permitted), never write or rewrite the instantiated record. |
| `--source <parent-skill>` | Used by a parent skill (e.g. `/claude-tweaks:init`) to identify itself as the caller; see Component-Skill Contract below. |
```

and this exact `new_string`:

```
`$ARGUMENTS`:

| Argument | Behavior |
|---|---|
| `create <skill>` | Instantiate `<skill>`'s routine template into a live routine for the current project. Routes to the UPDATE workflow automatically if an instantiated record already exists for this project+skill+variant combination. |
| `update <skill>` | Re-sync an existing routine against its (possibly changed) template. |
| `status <skill>` | Show the instantiated record(s) alongside live routine state. With no `--variant`, lists every instantiated variant found for `<skill>`. |
| `--variant <name>` | Use `skills/{skill}/routine-template-<name>.yml` instead of the default `skills/{skill}/routine-template.yml`. Combine with `create`/`update`/`status`. Omit for the default template — fully backward compatible with every existing consumer (code-health, flow, harness-health), none of which ship a variant. |
| `--dry-run` (combine with `create`/`update`) | Assemble and display the `RemoteTrigger` body; never make a `create`/`update` call (read-only `list`/`get` calls to resolve values are still permitted), never write or rewrite the instantiated record. |
| `--source <parent-skill>` | Used by a parent skill (e.g. `/claude-tweaks:init`) to identify itself as the caller; see Component-Skill Contract below. |
```

- [ ] **Step 3: Edit CREATE Step 1 (template load)**

Use the Edit tool with this exact `old_string`:

```
**Step 1 — Load the template.** Read `${CLAUDE_PLUGIN_ROOT}/skills/{skill}/routine-template.yml`. If it doesn't exist, stop: "`{skill}` has no routine-template.yml — it doesn't support routines yet." The field schema is documented once in `skills/_shared/routine-template-schema.md` — read it if any field's meaning is unclear.
```

and this exact `new_string`:

```
**Step 1 — Load the template.** When `--variant=<name>` was passed, read `${CLAUDE_PLUGIN_ROOT}/skills/{skill}/routine-template-<name>.yml`; if it doesn't exist, stop: "`{skill}` has no routine-template-{name}.yml — check the variant name." Otherwise (no `--variant`), read `${CLAUDE_PLUGIN_ROOT}/skills/{skill}/routine-template.yml` exactly as before; if it doesn't exist, stop: "`{skill}` has no routine-template.yml — it doesn't support routines yet." The field schema — identical for the default template and every named variant — is documented once in `skills/_shared/routine-template-schema.md` — read it if any field's meaning is unclear.
```

- [ ] **Step 4: Edit CREATE Step 3 (idempotency check)**

Use the Edit tool with this exact `old_string`:

```
**Step 3 — Idempotency check.** Check whether `.claude-tweaks/routines/{PREFIXED_NAME}.yml` already exists in the current project. If it does, stop this workflow and continue at UPDATE below instead — never create a second routine for the same project+skill.
```

and this exact `new_string`:

```
**Step 3 — Idempotency check.** Check whether `.claude-tweaks/routines/{PREFIXED_NAME}.yml` already exists in the current project. If it does, stop this workflow and continue at UPDATE below instead — never create a second routine for the same project+skill+variant combination. (`PREFIXED_NAME` already encodes the loaded template's `routine_name`, which differs per variant by construction — creating `tidy` with `--variant=github-triage` while `tidy-weekly`'s record already exists is a legitimate second instance, not a duplicate; see the Anti-Patterns table below.)
```

- [ ] **Step 5: Edit UPDATE Step 1**

Use the Edit tool with this exact `old_string`:

```
**Step 1.** Load the template at `${CLAUDE_PLUGIN_ROOT}/skills/{skill}/routine-template.yml` (if missing, stop with the same message as CREATE Step 1). Resolve the repo URL and derive `PREFIXED_NAME` the same way as CREATE Step 2. Require an existing `.claude-tweaks/routines/{PREFIXED_NAME}.yml` for the current project (routed here automatically from CREATE's idempotency check, or invoked directly). If none exists, tell the user to run `create <skill>` first and stop.
```

and this exact `new_string`:

```
**Step 1.** Load the template the same way as CREATE Step 1 (respecting `--variant` if passed; if missing, stop with the same message). Resolve the repo URL and derive `PREFIXED_NAME` the same way as CREATE Step 2. Require an existing `.claude-tweaks/routines/{PREFIXED_NAME}.yml` for the current project (routed here automatically from CREATE's idempotency check, or invoked directly). If none exists, tell the user to run `create <skill> [--variant=<name>]` first and stop.
```

- [ ] **Step 6: Verify Steps 1-5's edits landed correctly**

Run:

```bash
grep -n "project+skill+variant combination" skills/routine/SKILL.md
grep -n "read \`\${CLAUDE_PLUGIN_ROOT}/skills/{skill}/routine-template-<name>.yml\`" skills/routine/SKILL.md
grep -n "run \`create <skill> \[--variant=<name>\]\` first" skills/routine/SKILL.md
```

Expected: each grep matches at least once (the first matches twice — once in the Input table's `create` row, once in CREATE Step 3's parenthetical — confirm both).

- [ ] **Step 7: Edit STATUS Step 1**

Read the current `### STATUS \`<skill>\`` section's Step 1 to confirm it reads:

```
**Step 1.** Read the template at `${CLAUDE_PLUGIN_ROOT}/skills/{skill}/routine-template.yml`. Resolve the repo URL and derive `PREFIXED_NAME` the same way as CREATE Step 2, then read `.claude-tweaks/routines/{PREFIXED_NAME}.yml`. If missing, report that no routine has been created for `<skill>` in this project and suggest `create <skill>`. Stop.
```

Use the Edit tool with this exact `old_string`:

```
**Step 1.** Read the template at `${CLAUDE_PLUGIN_ROOT}/skills/{skill}/routine-template.yml`. Resolve the repo URL and derive `PREFIXED_NAME` the same way as CREATE Step 2, then read `.claude-tweaks/routines/{PREFIXED_NAME}.yml`. If missing, report that no routine has been created for `<skill>` in this project and suggest `create <skill>`. Stop.
```

and this exact `new_string`:

```
**Step 1.** When `--variant=<name>` was passed, load the template and resolve `PREFIXED_NAME`/record path exactly as CREATE Steps 1-2, then read that single `.claude-tweaks/routines/{PREFIXED_NAME}.yml`; if missing, report no routine for `<skill> --variant=<name>` and suggest `create <skill> --variant=<name>`. Stop.

When `--variant` is omitted: glob `${CLAUDE_PLUGIN_ROOT}/skills/{skill}/routine-template.yml` and `${CLAUDE_PLUGIN_ROOT}/skills/{skill}/routine-template-*.yml` to enumerate every template `<skill>` ships, read each one's `routine_name`, and derive `REPO_SLUG` (same recipe as CREATE Step 2) to check which of `.claude-tweaks/routines/{REPO_SLUG}-{routine_name}.yml` exist. If none exist, report that no routine has been created for `<skill>` in this project and suggest `create <skill>`. Stop. If exactly one exists, proceed with that single instance for the rest of this workflow, exactly as before. If more than one exists, run Steps 2-3.5 below once per existing instance and present all of them together, each labeled by its variant name (or "default" for the base template).
```

- [ ] **Step 8: Edit the Anti-Patterns table**

Use the Edit tool with this exact `old_string`:

```
| Creating a second routine when an instantiated record already exists | Always check `.claude-tweaks/routines/{name}.yml` first and route to `update` — duplicate routines double-run the same work. |
```

and this exact `new_string`:

```
| Creating a second routine for the same project+skill+**variant** when an instantiated record already exists | Always check `.claude-tweaks/routines/{name}.yml` first and route to `update` — duplicate routines double-run the same work. A second routine for a **different** variant of the same skill (e.g. `tidy-weekly` and `tidy-github-triage` coexisting) is not a duplicate — it's a distinct `PREFIXED_NAME`, and both instances legitimately run side by side. |
```

- [ ] **Step 9: Verify Steps 7-8's edits landed correctly**

Run:

```bash
grep -n "When \`--variant\` is omitted" skills/routine/SKILL.md
grep -n "is not a duplicate — it's a distinct \`PREFIXED_NAME\`" skills/routine/SKILL.md
grep -c "^| Creating a second routine" skills/routine/SKILL.md
```

Expected: the first two greps each match once; the third prints `1` (confirms the old row was replaced, not duplicated alongside a new one).

- [ ] **Step 10: Run the full test suite to confirm no regressions**

Run: `npm test`
Expected: all tests pass (this task touches only markdown prose).

- [ ] **Step 11: Commit**

```bash
git add skills/routine/SKILL.md
git commit -m "Add --variant support to /claude-tweaks:routine for multi-instance-per-skill routines"
```

---

### Task 2: Document the variant convention in the routine template schema

**Files:**
- Modify: `skills/_shared/routine-template-schema.md`

**Interfaces:**
- Consumes: nothing (documentation-only task, independent of Task 1's code path but describes what it builds).
- Produces: nothing consumed by later tasks — this is reference documentation.

- [ ] **Step 1: Confirm current exact text before editing**

Read `skills/_shared/routine-template-schema.md`. Confirm the Template section header and intro (currently lines 9-11) read exactly:

```markdown
## Template — `skills/{skill}/routine-template.yml`

Ships with the plugin. Plugin-owned, project-agnostic, account-agnostic. NEVER contains `environment_id`, a repo URL, or MCP credentials.
```

- [ ] **Step 2: Edit the Template section header/intro**

Use the Edit tool with this exact `old_string`:

```
## Template — `skills/{skill}/routine-template.yml`

Ships with the plugin. Plugin-owned, project-agnostic, account-agnostic. NEVER contains `environment_id`, a repo URL, or MCP credentials.
```

and this exact `new_string`:

```
## Template — `skills/{skill}/routine-template.yml` (default) or `skills/{skill}/routine-template-<variant>.yml` (named variant)

Ships with the plugin. Plugin-owned, project-agnostic, account-agnostic. NEVER contains `environment_id`, a repo URL, or MCP credentials. A skill may ship just the default template, or the default plus one or more named variants — every variant uses this identical field schema, just with its own `routine_name` (and typically its own `prompt`/`default_schedule`) so it produces a distinct `PREFIXED_NAME` and can be instantiated alongside the default. `/claude-tweaks:routine create/update/status <skill> --variant=<name>` selects `routine-template-<name>.yml`; omitting `--variant` selects the default file.
```

- [ ] **Step 3: Add an Anti-Patterns row for `routine_name` collisions across a skill's own templates**

Read the current last row of the Anti-Patterns table to confirm it reads:

```
| Claiming a template's routine runs safely unattended without checking the target skill's actual auto-mode behavior | A bare routine firing has zero conversation history and no CLI arg to signal `auto` mode — per `_shared/auto-mode-contract.md`'s precedence, a skill with no mode signal falls back to interactive and blocks forever on a prompt nobody answers. If a consumer skill needs `auto` mode to run unattended safely, its `notes` field (and the skill's own Routine Configuration section) must say so explicitly — don't invent new routine-specific mode-signaling to paper over it. |
```

Use the Edit tool with this exact `old_string`:

```
| Claiming a template's routine runs safely unattended without checking the target skill's actual auto-mode behavior | A bare routine firing has zero conversation history and no CLI arg to signal `auto` mode — per `_shared/auto-mode-contract.md`'s precedence, a skill with no mode signal falls back to interactive and blocks forever on a prompt nobody answers. If a consumer skill needs `auto` mode to run unattended safely, its `notes` field (and the skill's own Routine Configuration section) must say so explicitly — don't invent new routine-specific mode-signaling to paper over it. |
```

and this exact `new_string`:

```
| Claiming a template's routine runs safely unattended without checking the target skill's actual auto-mode behavior | A bare routine firing has zero conversation history and no CLI arg to signal `auto` mode — per `_shared/auto-mode-contract.md`'s precedence, a skill with no mode signal falls back to interactive and blocks forever on a prompt nobody answers. If a consumer skill needs `auto` mode to run unattended safely, its `notes` field (and the skill's own Routine Configuration section) must say so explicitly — don't invent new routine-specific mode-signaling to paper over it. |
| Giving a variant template the same `routine_name` as the skill's default template, or as another variant of the same skill | `PREFIXED_NAME` derives from `routine_name` — a collision means the second template can never be instantiated without silently colliding with the first's instantiated record file. Every template a skill ships (default + every variant) must have a unique `routine_name`. |
```

- [ ] **Step 4: Verify the edits landed correctly**

Run:

```bash
grep -n "^## Template — " skills/_shared/routine-template-schema.md
grep -n "must have a unique \`routine_name\`" skills/_shared/routine-template-schema.md
```

Expected: both match exactly once.

- [ ] **Step 5: Run the full test suite to confirm no regressions**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add skills/_shared/routine-template-schema.md
git commit -m "Document the routine-template-<variant>.yml naming convention"
```

---

### Task 3: `/init` Step 13 — discover variants, not just skills

**Files:**
- Modify: `skills/init/bootstrap-steps.md:598-625` (Step 13)

**Interfaces:**
- Consumes: Task 1's `--variant` argument (this task's rewritten Step 13 invokes `/claude-tweaks:routine create <skill> [--variant=<name>] --source init`).
- Produces: nothing consumed by Task 4 — Task 4's new template just needs to exist on disk; Step 13 will discover it automatically the next time `/init` runs (no code path in Task 4 depends on this task directly).

- [ ] **Step 1: Confirm current exact text before editing**

Read `skills/init/bootstrap-steps.md` lines 598-625. Confirm it reads exactly:

```markdown
### Step 13 — Routine Installation (detailed procedure)

claude-tweaks skills can ship a `routine-template.yml` (schema: `skills/_shared/routine-template-schema.md`) enabling `/claude-tweaks:routine create <skill>` to instantiate a scheduled cloud Routine for this project — e.g. code-health's nightly LLM-as-judge sweep, or tidy's periodic backlog hygiene pass. This step surfaces that option right after bootstrap instead of leaving it to be discovered later.

**Detect candidates:**

```bash
ls "${CLAUDE_PLUGIN_ROOT}"/skills/*/routine-template.yml 2>/dev/null
```

For each match, note the candidate skill name (the directory under `skills/`). Then glob `.claude-tweaks/routines/*.yml` in the current project and read each match's `template:` field (per `skills/_shared/routine-template-schema.md`'s instantiated-record schema — `template` names the skill the record came from). Build the set of skill names that already have a record this way, and only offer candidates NOT in that set. This is prefix-agnostic — it never needs to re-derive the project-prefixed record filename (`PREFIXED_NAME`, computed by `/routine` itself) inside init — and makes the step idempotent and safe on every `/init` re-run. If no candidates remain (none shipped, or every candidate already has a record), skip this step silently.

**Present:**

```
{N} claude-tweaks skill(s) support scheduled cloud Routines: {list, e.g. "code-health (nightly repo sweep), tidy (periodic backlog hygiene)"}.

Set any of these up now?
1. Yes — walk me through each **(Recommended)**
2. Not now — I'll use `/claude-tweaks:routine create <skill>` later
```

**For option 1:** For each skill the user selects, invoke `/claude-tweaks:routine create <skill> --source init` directly. `/routine`'s own CREATE workflow (template load, repo/name resolution, idempotency check, environment/schedule resolution, review gate) handles everything end-to-end, including the mandatory explicit confirmation before any live `RemoteTrigger` call — the invocation may also include `--dry-run` if the user wants to inspect the assembled configuration first without creating anything live. `/init` does not reimplement, shortcut, or pre-answer any part of that workflow — it only discovers candidates and hands off.

**For option 2:** Note the skipped candidates and continue. The same offer reappears on the next `/init` run for any candidate still missing a record.

**Failure handling:** If a `create` invocation fails or the user backs out mid-flow, continue with the remaining selected candidates (or none) rather than aborting the rest of `/init`.
```

If the text differs (another session edited this file concurrently), stop and re-read the current file in full before proceeding.

- [ ] **Step 2: Replace Step 13 in full**

Use the Edit tool with the exact `old_string` shown in Step 1 above (the entire Step 13 block, from `### Step 13 — Routine Installation (detailed procedure)` through the `**Failure handling:**` paragraph, inclusive) and this exact `new_string`:

```markdown
### Step 13 — Routine Installation (detailed procedure)

claude-tweaks skills can ship one or more routine templates (schema: `skills/_shared/routine-template-schema.md`) — a skill's default template at `skills/{skill}/routine-template.yml`, plus optional named variants at `skills/{skill}/routine-template-<variant>.yml` — each enabling `/claude-tweaks:routine create <skill> [--variant=<name>]` to instantiate a scheduled cloud Routine for this project. Examples: code-health's nightly LLM-as-judge sweep, tidy's periodic backlog hygiene pass, or tidy's frequent GitHub-issue-triage variant. This step surfaces that option right after bootstrap instead of leaving it to be discovered later.

**Detect candidates:**

```bash
ls "${CLAUDE_PLUGIN_ROOT}"/skills/*/routine-template.yml "${CLAUDE_PLUGIN_ROOT}"/skills/*/routine-template-*.yml 2>/dev/null
```

For each match, note the candidate skill name (the directory under `skills/`) and, for a `routine-template-<variant>.yml` match, the variant name (everything between `routine-template-` and `.yml`). Read each candidate's `routine_name` field.

Derive `REPO_SLUG` once, the same way `/claude-tweaks:routine`'s own CREATE Step 2 does: resolve `git remote get-url origin`, take the resolved URL's `{repo}` segment, lowercase it, replace any run of characters outside `[a-z0-9]` with a single `-`, trim leading/trailing `-`. For each candidate, a record already exists iff `.claude-tweaks/routines/{REPO_SLUG}-{routine_name}.yml` exists in the current project — check per candidate, not per skill, since a skill with a default template plus a variant can have zero, one, or both already instantiated; the instantiated record's own `template:` field only names the skill, not which variant, so filename existence (not field content) is the correct check here. Only offer candidates without a matching record. If no candidates remain, skip this step silently.

**Present:**

```
{N} claude-tweaks routine(s) available to set up: {list, e.g. "code-health (nightly repo sweep), tidy (periodic backlog hygiene), tidy --variant=github-triage (frequent GitHub issue triage)"}.

Set any of these up now?
1. Yes — walk me through each **(Recommended)**
2. Not now — I'll use `/claude-tweaks:routine create <skill> [--variant=<name>]` later
```

**For option 1:** For each candidate the user selects, invoke `/claude-tweaks:routine create <skill> [--variant=<name>] --source init` directly (omit `--variant` for a default-template candidate). `/routine`'s own CREATE workflow (template load, repo/name resolution, idempotency check, environment/schedule resolution, review gate) handles everything end-to-end, including the mandatory explicit confirmation before any live `RemoteTrigger` call — the invocation may also include `--dry-run` if the user wants to inspect the assembled configuration first without creating anything live. `/init` does not reimplement, shortcut, or pre-answer any part of that workflow — it only discovers candidates and hands off.

**For option 2:** Note the skipped candidates and continue. The same offer reappears on the next `/init` run for any candidate still missing a record.

**Failure handling:** If a `create` invocation fails or the user backs out mid-flow, continue with the remaining selected candidates (or none) rather than aborting the rest of `/init`.
```

- [ ] **Step 3: Verify the edit landed correctly**

Run:

```bash
grep -n "routine-template-\*.yml" skills/init/bootstrap-steps.md
grep -n "Derive \`REPO_SLUG\` once" skills/init/bootstrap-steps.md
grep -n "prefix-agnostic" skills/init/bootstrap-steps.md
grep -c "^### Step 13" skills/init/bootstrap-steps.md
```

Expected: the first two greps each match once; the third grep (`prefix-agnostic`) matches **zero** times — that claim is no longer accurate under the new discovery logic and must not survive the edit; the fourth prints `1` (heading not duplicated).

- [ ] **Step 4: Run the full test suite to confirm no regressions**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add skills/init/bootstrap-steps.md
git commit -m "Make /init Step 13 discover routine template variants, not just skills"
```

---

### Task 4: Ship `skills/tidy/routine-template-github-triage.yml`

**Files:**
- Create: `skills/tidy/routine-template-github-triage.yml`
- Modify: `skills/tidy/SKILL.md` (Routine Configuration section)
- Modify: `skills/routine/SKILL.md` (Relationship to Other Skills table, tidy row)

**Interfaces:**
- Consumes: Task 1's `--variant` mechanism (this template is inert without it) and Phase 2's `--scope=github` argument (this template's `prompt` field is meaningless without it).
- Produces: nothing consumed by later tasks — this is Phase 3's terminal deliverable.

- [ ] **Step 1: Read the existing template to match its structure**

Read `skills/tidy/routine-template.yml` in full (6 lines + notes block) to confirm the field order and YAML style to match.

- [ ] **Step 2: Create the new variant template**

Create `skills/tidy/routine-template-github-triage.yml`:

```yaml
template_version: 1
routine_name: tidy-github-triage
prompt: "/claude-tweaks:tidy --scope=github"
model: claude-sonnet-5
allowed_tools: [Bash, Read, Grep, Glob, Edit, Write, Task]
mcp_connections: []
default_schedule:
  cron_expression: "0 */3 * * *"
  description: "off-peak-ish anchor, UTC, every 3 hours — confirm against your local timezone at creation time"
notes: >
  A frequent, cheap companion to the base tidy-weekly routine
  (skills/tidy/routine-template.yml) — this variant runs only Step 4.8's GitHub
  PR/issue triage (--scope=github), skipping specs/docs/plans/worktrees/registry/claims
  entirely, so it's safe to fire far more often without paying for a full sweep. Both
  routines can be instantiated in the same project simultaneously: tidy-weekly for
  periodic full-backlog hygiene, tidy-github-triage for keeping GitHub issue/PR state
  fresh in between. Like the base template, this only runs safely unattended when the
  target project's own CLAUDE.md already sets `auto-mode: default-on` — see
  skills/tidy/SKILL.md's "Standalone auto" fallback and
  skills/_shared/auto-mode-contract.md for the mode-precedence rules. `Task` is
  included in allowed_tools so the scoped scan can still dispatch as a parallel Task
  agent per skills/tidy/SKILL.md's Parallel execution note; if Task-based subagent
  dispatch isn't supported in a given cloud routine session, it degrades to running
  sequentially, same as the base template.
```

- [ ] **Step 3: Verify the new file is valid**

Run:

```bash
node -e "console.log(require('fs').existsSync('skills/tidy/routine-template-github-triage.yml') ? 'exists' : 'MISSING')"
grep -n "^routine_name: tidy-github-triage$" skills/tidy/routine-template-github-triage.yml
grep -n "^prompt: \"/claude-tweaks:tidy --scope=github\"$" skills/tidy/routine-template-github-triage.yml
```

Expected: `exists`, and both greps match once each.

- [ ] **Step 4: Update tidy's "Routine Configuration" section**

Read the current `## Routine Configuration` section in `skills/tidy/SKILL.md` to confirm it reads:

```markdown
## Routine Configuration

`/tidy` ships a routine template (`skills/tidy/routine-template.yml`) for unattended backlog hygiene. Instantiate it for the current project with:

```
/claude-tweaks:routine create tidy
```

This resolves the account- and project-specific values a portable template can't hardcode (which environment, which repo) and creates a live cloud Routine via `RemoteTrigger` directly — see `skills/routine/SKILL.md` for the full mechanism. Add `--dry-run` to inspect the assembled configuration before anything is created.

**Unattended execution:** a scheduled firing runs Steps 1-7.5 exactly as an interactive invocation would, except Step 6's Standalone auto fallback takes over in place of the interactive batch-approval prompt — but only when the target project's own CLAUDE.md already sets `auto-mode: default-on` (project policy, not a routine-specific mechanism — see `_shared/auto-mode-contract.md`). A bare scheduled firing (`/claude-tweaks:tidy`, no arguments, no conversation history) has no other way to supply an `auto` mode signal; if the project hasn't configured `auto-mode: default-on`, the routine falls back to interactive and blocks on a batch-approval prompt that will never be answered. When auto-mode is enabled project-wide, safe, atomic actions (stale deletes and cleanly-merged worktree/branch removals) auto-apply per the `conservative` aggressiveness default, and everything requiring judgment is staged to that run's `decisions.md` rather than blocking on input. Nothing is invented here for routines specifically — this is the same Standalone auto path `/tidy` already uses whenever it runs outside a parent pipeline. If Task-based subagent dispatch isn't available in a given cloud routine session, Steps 1-4.8 degrade to running sequentially in the main thread instead of in parallel — same steps, same output, just not parallelized.
```

Use the Edit tool with this exact `old_string`:

```
## Routine Configuration

`/tidy` ships a routine template (`skills/tidy/routine-template.yml`) for unattended backlog hygiene. Instantiate it for the current project with:

```
/claude-tweaks:routine create tidy
```

This resolves the account- and project-specific values a portable template can't hardcode (which environment, which repo) and creates a live cloud Routine via `RemoteTrigger` directly — see `skills/routine/SKILL.md` for the full mechanism. Add `--dry-run` to inspect the assembled configuration before anything is created.
```

and this exact `new_string`:

```
## Routine Configuration

`/tidy` ships two routine templates. The default, `skills/tidy/routine-template.yml`, is a weekly full-backlog hygiene sweep — instantiate it with:

```
/claude-tweaks:routine create tidy
```

A second variant, `skills/tidy/routine-template-github-triage.yml`, runs only GitHub issue/PR triage (`--scope=github`) on a much tighter cadence, and can be instantiated alongside the default in the same project:

```
/claude-tweaks:routine create tidy --variant=github-triage
```

Both resolve the account- and project-specific values a portable template can't hardcode (which environment, which repo) and create a live cloud Routine via `RemoteTrigger` directly — see `skills/routine/SKILL.md` for the full mechanism, including how `--variant` selects between them. Add `--dry-run` to inspect the assembled configuration before anything is created.
```

- [ ] **Step 5: Verify Step 4's edit landed correctly**

Run:

```bash
grep -n "routine create tidy --variant=github-triage" skills/tidy/SKILL.md
grep -n "runs only GitHub issue/PR triage" skills/tidy/SKILL.md
```

Expected: both match exactly once.

- [ ] **Step 6: Update routine's Relationship table row for tidy**

Read the current Relationship to Other Skills row for tidy in `skills/routine/SKILL.md` to confirm it reads:

```
| `/claude-tweaks:tidy` | Tidy is this skill's second consumer — `skills/tidy/routine-template.yml` relies on tidy's own Standalone-auto support for safe unattended execution. |
```

Use the Edit tool with this exact `old_string`:

```
| `/claude-tweaks:tidy` | Tidy is this skill's second consumer — `skills/tidy/routine-template.yml` relies on tidy's own Standalone-auto support for safe unattended execution. |
```

and this exact `new_string`:

```
| `/claude-tweaks:tidy` | Tidy is this skill's second consumer — `skills/tidy/routine-template.yml` relies on tidy's own Standalone-auto support for safe unattended execution. Tidy also ships this skill's first named variant, `skills/tidy/routine-template-github-triage.yml` (`--variant=github-triage`), a frequent `--scope=github`-only companion to the weekly full sweep. |
```

- [ ] **Step 7: Verify Step 6's edit landed correctly**

Run:

```bash
grep -n "ships this skill's first named variant" skills/routine/SKILL.md
```

Expected: matches exactly once.

- [ ] **Step 8: Dry-run the new variant against this repo's real GitHub backend**

Run (this is a live check against this repo's actual, already-authenticated `gh`/GitHub state — read-only, per `--dry-run`):

```
/claude-tweaks:routine create tidy --variant=github-triage --dry-run
```

Expected: the assembled `RemoteTrigger` body shows `name` ending in `-tidy-github-triage`, `job_config.ccr.session_context.model` = `claude-sonnet-5`, the prompt message content = `/claude-tweaks:tidy --scope=github`, and the cron expression resolved from `0 */3 * * *` (after the interactive UTC-conversion confirmation). No live `RemoteTrigger` call is made and no `.claude-tweaks/routines/` file is written (dry-run).

- [ ] **Step 9: Run the full test suite to confirm no regressions**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 10: Commit**

```bash
git add skills/tidy/routine-template-github-triage.yml skills/tidy/SKILL.md skills/routine/SKILL.md
git commit -m "Ship tidy's GitHub-triage routine variant (--variant=github-triage)"
```

---

## Self-Review Notes

- **Spec coverage:** Every element of the design doc's Section C has a task: sibling-file convention (Task 1 Step 3, Task 2), `--variant` on create/update/status (Task 1), the idempotency-check clarification and anti-pattern addendum (Task 1 Steps 4 and 8), `/init` Step 13 discovery (Task 3), and the concrete tidy variant with its documented cron/notes (Task 4).
- **Refinement beyond the design doc, disclosed here rather than silently deviating:** the design doc states "no schema change is needed to the instantiated record" — still true, no field was added. But Task 3 required going further than the design doc spelled out: since the instantiated record's `template:` field only names the skill (not which variant), Step 13's candidate-completeness check must derive `REPO_SLUG` and check per-candidate filename existence rather than reading a field — the design doc didn't specify this mechanism because it didn't drill into `/init`'s discovery internals. This does *not* touch the record schema itself, so it doesn't contradict the design's key decision — it's a necessary implementation detail the design left at a higher level of abstraction.
- **No placeholders:** every step has an exact old_string/new_string pair, exact new file content, or an exact grep/command with an exact expected result.
- **Type consistency:** `--variant=<name>` is spelled identically everywhere across Tasks 1, 3, and 4 (routine/SKILL.md's Input table, CREATE/UPDATE/STATUS steps, init's Step 13, and tidy's own Routine Configuration section) — no drift between `--variant` and a differently-named flag.
- **Out of scope, confirmed absent from this plan:** Phase 1 (backend simplification) and Phase 2 (`/tidy --scope`) are separate plan files; Phase 2 must land first per this plan's Architecture note.
