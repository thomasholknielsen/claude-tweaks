# Cloud Routine Environment Freshness & Per-Project Dedication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop cloud Routines from silently running stale plugin code, and stop new projects from silently inheriting an unrelated project's cloud environment.

**Architecture:** Three coupled skill-file changes (no backing `.js` code exists for any of this — `/routine`'s resolution logic and `/init`'s Step 14/15 are pure SKILL.md prose plus one embedded bash template). (1) Make the generated `claude-cloud-setup.sh` template idempotent so re-running it updates an already-installed plugin instead of hard-failing. (2) Make `/routine`'s environment resolution match by repo instead of inferring from whatever routine was most recently created account-wide. (3) Add a guided, browser-automated environment-creation/re-pointing procedure (`/browse backend=chrome`, the only viable backend — `agent-browser` has no authenticated claude.ai session) for when no project-specific environment exists yet, plus an Update-Mode audit that offers to migrate a project's existing routines onto a dedicated environment.

**Tech Stack:** Markdown skill files (prose + one embedded bash script), YAML (routine records + a project-local cache file), `mcp__claude-in-chrome__*` browser automation tools (driven only through the existing `/claude-tweaks:browse backend=chrome` entry point — this plan never calls those tools directly from a skill file, matching this repo's documented convention).

## Global Constraints

- Every skill reference inside actionable instruction text (a `## Step N` body) must use the fully-qualified `/claude-tweaks:{skill}` form, never a bare `/{skill}`.
- No new runtime npm dependency — this plugin ships zero runtime deps by design.
- `.claude-tweaks/routine-environment-cache.yml` stays gitignored and project-local; never write account-portable values to a committed file.
- Every skill file this plan touches keeps its existing "Interaction style" directive and `AskUserQuestion` batch-table conventions (pre-filled recommendation + one apply-all/override gate) — do not invent a new interaction pattern.
- `worktree.always` is set in this repo's own `.claude-tweaks/policy.yml` — every task's Edit/Write/git commit must run from inside the worktree this plan is implemented in (already created before this plan was written: `worktree-cloud-routine-env-freshness`).
- Bump `.claude-plugin/plugin.json`'s `version` (patch bump) as this plan's final step, per this repo's own Releasing convention — check `git fetch origin main` first for a concurrent bump before picking the next number.

---

### Task 1: Idempotent `claude-cloud-setup.sh` template (Fix A)

**Files:**
- Modify: `skills/init/bootstrap-steps.md:768-778` (the marketplace-add and plugin-install lines inside Step 14's generated-script template, lines 756-783 overall)

**Interfaces:**
- Produces: the corrected bash template text that Tasks 2-4 do not depend on (fully independent fix).

- [ ] **Step 1: Replace the non-idempotent install lines with a check-then-branch**

Read the current template block first (`skills/init/bootstrap-steps.md:756-783`) to confirm line numbers haven't shifted, then replace lines 768-778 (the marketplace-add block through the plugin-install block, inclusive of their comments) with:

```bash
# Marketplaces referenced below that Claude Code doesn't already know by name — refreshed
# every run so a later `update` pulls from a current catalog pointer, not a stale local clone.
claude plugin marketplace add thomasholknielsen/claude-tweaks-marketplace 2>/dev/null || true
claude plugin marketplace update claude-tweaks-marketplace >/dev/null 2>&1 || true
# (one additional `claude plugin marketplace add <org>/<repo> 2>/dev/null || true` line plus
# a matching `claude plugin marketplace update <name> >/dev/null 2>&1 || true` line per
# mirrored plugin's marketplace, sourced from that marketplace's `source.repo` field in
# extraKnownMarketplaces — omit both for `claude-plugins-official`, which needs no add/update
# call of its own)

# Plugins declared in .claude/settings.json#enabledPlugins. `claude plugin install` is NOT
# idempotent (errors if the plugin is already present), so every session after this
# environment's first ever run must take the `update` branch instead, or this script hard-fails
# under `set -euo pipefail` and never reaches the agent-browser install below it.
_ct_installed_ids="$(claude plugin list --json 2>/dev/null | node -e '
  let i="";process.stdin.on("data",d=>i+=d).on("end",()=>{try{
    JSON.parse(i).forEach(p=>console.log(p.id))
  }catch{}})
' 2>/dev/null)"
for spec in claude-tweaks@claude-tweaks-marketplace superpowers@claude-plugins-official; do
  if printf '%s\n' "$_ct_installed_ids" | grep -Fqx "$spec"; then
    claude plugin update "$spec" --scope project
  else
    claude plugin install "$spec" --scope project
  fi
done
# (one additional spec added to the `for spec in ...` list per mirrored plugin, in the same
# order enabledPlugins lists them — same install-vs-update branch handles it automatically)
```

Update the file-level comment at the top of the generated script (currently lines 758-765) to add one line after the existing "Regenerated in full..." line: `# Idempotent: safe to run on every cloud session, not just the first.` — this documents the property the rest of Step 14's Idempotency/re-run prose (line 815) already relies on, but the script's own header never stated explicitly.

- [ ] **Step 2: Update the "Apply" prose above the template to describe the new behavior**

`skills/init/bootstrap-steps.md:785` currently reads:

> `2>/dev/null || true` on the marketplace-add lines only — a duplicate-add is the expected no-op case on a re-run; the `plugin install`/`npm install` lines are left unguarded so a real failure surfaces loudly within the Setup script's own ~5-minute budget, rather than being silently swallowed.

Replace this line with:

> `2>/dev/null || true` on the marketplace-add and marketplace-update lines — a duplicate-add or a transient catalog-refresh failure are both expected no-op cases on a re-run. The plugin install-or-update branch and the final `npm install -g agent-browser` line are left unguarded so a real failure surfaces loudly within the Setup script's own ~5-minute budget, rather than being silently swallowed.

- [ ] **Step 3: Hand-run the updated template twice in sequence to verify idempotency**

This is markdown-embedded bash with no unit-test harness (consistent with this file's existing untested-template precedent) — verify by extracting and executing it directly:

```bash
cd /tmp && mkdir -p ct-fix-a-verify && cd ct-fix-a-verify
cat > setup.sh << 'SCRIPT_EOF'
#!/usr/bin/env bash
set -euo pipefail
claude plugin marketplace add thomasholknielsen/claude-tweaks-marketplace 2>/dev/null || true
claude plugin marketplace update claude-tweaks-marketplace >/dev/null 2>&1 || true
_ct_installed_ids="$(claude plugin list --json 2>/dev/null | node -e '
  let i="";process.stdin.on("data",d=>i+=d).on("end",()=>{try{
    JSON.parse(i).forEach(p=>console.log(p.id))
  }catch{}})
' 2>/dev/null)"
for spec in claude-tweaks@claude-tweaks-marketplace; do
  if printf '%s\n' "$_ct_installed_ids" | grep -Fqx "$spec"; then
    echo "would run: claude plugin update $spec --scope project"
  else
    echo "would run: claude plugin install $spec --scope project"
  fi
done
SCRIPT_EOF
bash setup.sh   # first run — expect "would run: claude plugin install ..." if not yet installed, or "update" if it already is
bash setup.sh   # second run — must print the SAME branch as whatever claude plugin list --json reports right now, and must exit 0 both times
echo "exit code: $?"
```

Expected: both runs exit 0, and both print the identical branch (since nothing about the local install state changed between the two runs) — confirming the check-then-branch logic is stable and non-erroring on repeat, which is the property Fix A exists to guarantee. Clean up: `cd /tmp && rm -rf ct-fix-a-verify`.

- [ ] **Step 4: Commit**

```bash
cd "$(git rev-parse --show-toplevel)"
git add skills/init/bootstrap-steps.md
git commit -m "init: make generated claude-cloud-setup.sh idempotent (claude plugin update, not just install)"
```

---

### Task 2: Repo-matched environment resolution (Fix B)

**Files:**
- Modify: `skills/routine/SKILL.md:63` (CREATE Step 4's resolution prose)
- Modify: `skills/init/bootstrap-steps.md:847` (Step 15's "Resolve environment once" prose, which currently restates Step 4's old behavior instead of purely deferring to it)
- Modify: `skills/routine/SKILL.md:65-71` (the cache-write block — schema gains `environment_name`, populated later by Task 3's guided-creation flow; this task only widens the schema, it does not yet populate the new field)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: the repo-matching resolution behavior Task 3's fallthrough and Task 4's migration check both call into; the widened `.claude-tweaks/routine-environment-cache.yml` schema (`environment_id` + `environment_name`, `environment_name` optional/absent until Task 3 populates it) that Task 4 reads.

- [ ] **Step 1: Rewrite CREATE Step 4's resolution prose**

Read `skills/routine/SKILL.md:63` first to confirm it still reads as quoted below (this plan was written against the current committed text):

> **Step 4 — Resolve `environment_id`.** If `--environment <id>` was passed, use it directly — skip every other source below. Otherwise, if `--refresh-environment` was passed, skip the cache and `list` sources too — go straight to asking the user directly which environment to use (the same prompt used below when no source yields a value), then continue to the cache-write step below with the freshly chosen value, overwriting whatever the cache file already held. Otherwise: check `.claude-tweaks/routine-environment-cache.yml` in the current project first. If it exists and contains an `environment_id` value, use it silently — no confirmation prompt. Otherwise, load the tool with `ToolSearch select:RemoteTrigger`, then call `{action: "list"}`. If existing routines are returned, read `job_config.ccr.environment_id` off the most recently created one and use it silently. If none of these three sources yields a value, ask the user directly which environment to use — present whatever environment names/IDs are available in context; if none are, ask the user to name one (they can check via `/schedule` once if unsure). Do not cache this value anywhere under `~/.claude-tweaks/` — that path is harness-owned, not skill-owned.

Replace the `RemoteTrigger list` sentence (the one starting "If existing routines are returned...") and everything through "...if none are, ask the user to name one" with:

> Otherwise, load the tool with `ToolSearch select:RemoteTrigger`, then call `{action: "list"}`. Resolve the current project's own repo URL first (Step 2 already does this later in CREATE's own flow, but Step 4 runs before Step 2 in argument order for `--environment`/`--refresh-environment` callers and must resolve it independently here: `git remote get-url origin`, normalized the same way Step 2 normalizes it). Filter the returned triggers to those whose `job_config.ccr.session_context.sources[].git_repository.url` matches this project's own resolved repo URL — never a routine belonging to a different project, even if it was created more recently. If one or more match, read `job_config.ccr.environment_id` off the most recently created match and use it silently. If none of the three sources above yields a value for *this project specifically*, invoke `skills/routine/guided-environment-creation.md`'s Create procedure instead of asking the user to name an environment from memory — it drives a real browser session to create a dedicated one and reports back both its `environment_id` and its human-readable name. Only if that guided flow is unavailable (see that file's own fallback) does this step fall back to asking the user directly which environment to use, presenting whatever names/IDs are available in context.

- [ ] **Step 2: Widen the cache-write block's schema**

Read `skills/routine/SKILL.md:65-71` first to confirm it still reads as quoted below:

> After an environment is resolved (from `--environment`, the cache, `list`, or direct user input), write it to `.claude-tweaks/routine-environment-cache.yml` (skip this write if `--dry-run` was passed):
>
> ```yaml
> environment_id: "<resolved environment_id>"
> ```
>
> This file is project-local and must stay gitignored — it exists purely to spare a second skill in the same project from re-deriving the same environment, never to make the value portable across projects or accounts.

Replace the YAML block and the sentence introducing it with:

> After an environment is resolved (from `--environment`, the cache, `list`, direct user input, or the guided-creation flow), write it to `.claude-tweaks/routine-environment-cache.yml` (skip this write if `--dry-run` was passed):
>
> ```yaml
> environment_id: "<resolved environment_id>"
> environment_name: "<human-readable environment name, if known — omit this key entirely when unknown>"
> ```
>
> `environment_name` is only ever known when the guided-creation flow (`skills/routine/guided-environment-creation.md`) resolved or confirmed it via a real browser read — no API exposes an environment's display name, only its opaque ID. Omit the key entirely (do not write an empty string) when resolution came from `--environment`, the cache's own prior `environment_id`-only value, `list`, or direct user input, none of which can supply a name. This file is project-local and must stay gitignored — it exists purely to spare a second skill in the same project from re-deriving the same environment, never to make the value portable across projects or accounts.

- [ ] **Step 3: Fix the duplicated resolution description in `/init`'s Step 15**

Read `skills/init/bootstrap-steps.md:847` first to confirm it still reads as quoted below:

> **Resolve environment once**, shared across every candidate the user may select: check `.claude-tweaks/routine-environment-cache.yml` first, then `RemoteTrigger {action: "list"}` (read `job_config.ccr.environment_id` off the most recent routine) — identical sources and order to `/claude-tweaks:routine`'s own CREATE Step 4. Use it silently if either source yields a value. Only ask the user directly when neither source has anything.

Replace with:

> **Resolve environment once**, shared across every candidate the user may select: follow `/claude-tweaks:routine`'s own CREATE Step 4 procedure exactly — cache, then repo-matched `RemoteTrigger list`, then guided creation if this project has no environment of its own yet. Use it silently once resolved. This step never restates Step 4's own source list — see that step for the authoritative order, so the two can't drift out of sync with each other again.

This removes the parenthetical "(read `job_config.ccr.environment_id` off the most recent routine)" — the exact restatement of Step 4's old, now-replaced account-wide-inference behavior — so this file no longer has its own copy of logic that only lives correctly in one place.

- [ ] **Step 4: Re-read all three edited passages together for internal consistency**

Confirm: Step 4 (SKILL.md) is the single source of truth for resolution order; Step 15 (bootstrap-steps.md) purely defers to it with no restated mechanics; the cache-write block's new `environment_name` field is described identically in both its own section and anywhere else it's mentioned. No other file in this repo restates CREATE Step 4's resolution order (checked via `grep -rn "most recently created" skills/` and `grep -rn "most recent routine" skills/` before editing — both hits were the two passages just fixed).

- [ ] **Step 5: Commit**

```bash
cd "$(git rev-parse --show-toplevel)"
git add skills/routine/SKILL.md skills/init/bootstrap-steps.md
git commit -m "routine: resolve environment by repo match, not account-wide most-recent inference"
```

---

### Task 3: Guided environment creation (Fix C, new-project case)

**Files:**
- Create: `skills/routine/guided-environment-creation.md`
- Modify: `skills/routine/SKILL.md` (Relationship to Other Skills table, `/claude-tweaks:init` row) — add a one-clause mention so the new sub-file is discoverable from the table that already documents Step 14/15's relationship to this skill.

**Interfaces:**
- Consumes: Task 2's Step 4 fallthrough (`invoke skills/routine/guided-environment-creation.md's Create procedure`), and the naming convention `claude-tweaks: <project-slug>` (project-slug = the same `REPO_SLUG` derivation CREATE Step 2 already performs — lowercase repo name, non-`[a-z0-9]` runs collapsed to `-`, trimmed).
- Produces: a `Create` procedure (returns `{environment_id, environment_name}` to whichever step invoked it — written into the prose as "report back both values to the caller") and an `Audit` procedure (reads an existing routine's currently-configured environment name without changing anything — used by Task 4).

- [ ] **Step 1: Write the new sub-file's Create procedure**

Create `skills/routine/guided-environment-creation.md`:

```markdown
# Guided Environment Creation

Referenced by `/claude-tweaks:routine`'s CREATE Step 4 (when no environment exists yet for the
current project) and by `/claude-tweaks:init`'s Update Mode Routine Environment Dedication check
(`skills/init/update-mode.md`). Not invoked directly by a human — always reached from one of those
two call sites, which supply the project-slug and the resolved repo URL this file needs.

No tool available to this plugin can create, list, or configure a cloud environment object
directly (`RemoteTrigger` is scoped to `/v1/code/triggers` only) — this is always a human-browser,
web-UI action. `agent-browser` (this plugin's default `/browse` backend) has no authenticated
claude.ai session, so every procedure below drives `/claude-tweaks:browse backend=chrome`
specifically — this repo's existing documented exception for human-invoked, non-Routine browser
automation. Both procedures below are interactive-only: if claude-in-chrome is unavailable (no
extension connected, or the user declines when `/browse` offers it), fall back immediately to
printing the exact values below for the user to enter manually, and return `{environment_id: null,
environment_name: null}` to the caller — never block the calling step's own flow waiting on a
browser that isn't there.

## Naming convention

An environment dedicated to a project's claude-tweaks routines is named:

```
claude-tweaks: <project-slug>
```

`<project-slug>` is the same `REPO_SLUG` value `/claude-tweaks:routine`'s CREATE Step 2 already
derives (lowercase repo name, runs of non-`[a-z0-9]` characters collapsed to a single `-`, leading/
trailing `-` trimmed) — reuse the caller's already-resolved value; never re-derive it here.

## Create procedure

Takes: `project_slug`, `repo_url` (already resolved by the caller).

1. Dispatch `/claude-tweaks:browse backend=chrome` with the instruction: navigate to
   `claude.ai/code`, open the routine-creation flow (the "New" affordance in the left sidebar,
   leading to a new-routine form — confirm this entry point still exposes the same Environment
   combobox the edit-routine dialog does; if the new-routine flow's layout differs, fall back to
   creating a throwaway routine via the edit-dialog-verified path below and note the discrepancy
   for a follow-up fix rather than guessing at an unverified flow).
2. In that form, locate the "Environment" combobox (a `find` query for "Environment selector
   combobox" locates it reliably — confirmed live against the edit-routine dialog's identical
   component) and click it.
3. **Timing note, confirmed empirically during design:** the dropdown's contents do not reliably
   appear in the very next screenshot or accessibility-tree read after the click — insert an
   explicit 1-second `wait` action between the click and whatever comes next, every time this
   combobox is opened. Reading or clicking immediately after the open-click, with no wait, was
   observed to silently miss the open state during design verification.
4. Click "+ Add environment" (the last item in the dropdown, below any existing environments).
5. In the resulting "Update cloud environment" dialog: set Name to `claude-tweaks: <project_slug>`,
   leave Network access at its default (`Trusted`), leave Environment variables empty, and set
   Setup script to exactly:
   ```
   bash scripts/claude-cloud-setup.sh 2>/dev/null || true
   ```
   (repo-agnostic by construction — a safe no-op on any repo that hasn't run `/claude-tweaks:init`
   yet). Click "Save changes".
6. Continue the same browser flow to actually create a routine using this environment (any minimal
   routine is fine — the caller supplies the real one it wants via its own subsequent
   `/claude-tweaks:routine create` call; this step's only job is to get the environment's ID
   discoverable). Complete the routine creation.
7. Call `RemoteTrigger {action: "list"}`, filter to the just-created trigger (matches `repo_url`
   and was created most recently), and read `job_config.ccr.environment_id` off it — this is the
   new environment's ID. Report `{environment_id: <that id>, environment_name: "claude-tweaks:
   <project_slug>"}` back to the caller (the name is already known — it was just typed in step 5).

## Audit procedure

Takes: `trigger_id` (an existing routine's own ID, from a prior `RemoteTrigger list` call).

Used only to *read* a routine's currently-configured environment name — never writes anything.

1. Dispatch `/claude-tweaks:browse backend=chrome`: navigate to
   `claude.ai/code/routines/<trigger_id>`, click the routine's Edit (pencil) affordance (a `find`
   query for "Edit button" locates it reliably), then locate and click the "Environment" combobox
   exactly as in Create steps 2-3 above (same 1-second wait requirement applies).
2. Read the combobox's currently-selected value (its displayed text, e.g. `"Default"` or
   `"claude-tweaks: memenu-app"`) — do not open the dropdown itself for a read-only audit, the
   collapsed combobox already shows the current selection.
3. Close the dialog via Cancel (never Save) — an audit must never leave a routine's own name/
   instructions/schedule fields modified, even if nothing in this procedure intentionally touched
   them.
4. Report `{environment_name: <the read value>}` back to the caller.

## Re-point procedure

Takes: `trigger_id`, `target_environment_name`.

1. Dispatch `/claude-tweaks:browse backend=chrome`: navigate to
   `claude.ai/code/routines/<trigger_id>`, click Edit, open the Environment combobox (steps 2-3 of
   Create, same wait requirement).
2. Click the option matching `target_environment_name` in the now-open dropdown.
3. Click "Save" on the routine-edit dialog (not the environment sub-dialog — this step only
   changes which environment the routine references, it never edits the environment's own Setup
   script or other fields).
4. Report success/failure back to the caller. On failure (option not found, save rejected), leave
   the routine untouched and report the failure — never leave a routine in a partially-edited
   state.
```

- [ ] **Step 2: Add the sub-file to `/routine`'s Relationship to Other Skills table**

Read `skills/routine/SKILL.md`'s `/claude-tweaks:init` row (in the Relationship to Other Skills table near the end of the file — confirm current text matches what Task 2 already quoted from it) and append one clause to the end of that row's existing text (after "...Update Mode also invokes `/claude-tweaks:routine status --all --source init`..." and before the closing `|`):

> Both this skill's CREATE Step 4 fallthrough and `/init`'s own Update Mode Routine Environment Dedication check delegate actual environment creation/reading/re-pointing to `skills/routine/guided-environment-creation.md` — neither duplicates its browser-automation procedure inline.

- [ ] **Step 3: Live-verify the Create procedure once, end-to-end, against a real throwaway routine**

Per the design doc's own testing plan — this is the main fragility point (browser UI structure can change) and has no substitute for an actual live run. Execute the Create procedure exactly as written above against a disposable test project/routine, confirm: the "+ Add environment" affordance is still reachable via the described `find` query, the 1-second wait is still necessary (re-confirm the timing quirk hasn't been fixed upstream), the Setup-script textarea accepts the literal one-liner without mangling it, and the resulting environment's ID is correctly recoverable via the described `RemoteTrigger list` filter. If any sub-step's described mechanism (a `find` query, a click target, a field label) no longer matches reality, correct the file's own text in this same task before moving on — do not commit a procedure known to not match the live UI. Delete the throwaway routine/environment afterward via the standard web console (no API deletion path exists, confirmed).

- [ ] **Step 4: Commit**

```bash
cd "$(git rev-parse --show-toplevel)"
git add skills/routine/guided-environment-creation.md skills/routine/SKILL.md
git commit -m "routine: add guided browser-driven environment creation for projects with none yet"
```

---

### Task 4: Existing-project migration (Fix C, Update Mode)

**Files:**
- Modify: `skills/init/update-mode.md` (new "Routine Environment Dedication" subsection, inserted between the existing "Routine Relevance" section and "Phase 1u.6")

**Interfaces:**
- Consumes: Task 2's repo-matched `RemoteTrigger list` filtering, Task 3's Audit and Re-point procedures (`skills/routine/guided-environment-creation.md`), and the widened `.claude-tweaks/routine-environment-cache.yml` schema (`environment_name`) Task 2 introduced.
- Produces: nothing consumed elsewhere in this plan — this is the terminal, user-facing task.

- [ ] **Step 1: Write the new subsection**

Read `skills/init/update-mode.md` around the existing "Routine Relevance" section's end (confirm it still ends with the "does not count toward Phase 1u.6's Total drift count" sentence, immediately before "## Phase 1u.6: Update Mode Early-Exit Gate") — insert the following new `### Routine Environment Dedication` subsection immediately after "Routine Relevance" ends and before "## Phase 1u.6" begins:

```markdown
### Routine Environment Dedication

Skip entirely if `.claude-tweaks/routines/` doesn't exist (same gate as Routine Drift and Routine
Relevance above).

Call `RemoteTrigger {action: "list"}`, filter to triggers whose
`job_config.ccr.session_context.sources[].git_repository.url` matches this project's own resolved
repo URL (`git remote get-url origin`, normalized the same way `/claude-tweaks:routine`'s CREATE
Step 2 normalizes it) — this is the project's own routine set, regardless of which skill each was
created from. If none, skip.

No API exposes a cloud environment's human-readable name — only its opaque `environment_id`. Check
`.claude-tweaks/routine-environment-cache.yml` first: if it holds both `environment_id` and
`environment_name`, and every one of this project's routines' `environment_id` values (from the
`list` call above) already equals the cached one, report "Routine Environment Dedication: already
on a dedicated environment" and skip further action — no browser pass needed on this run.

Otherwise, at least one routine's `environment_id` is unknown-by-name or doesn't match the cache.
Resolve names for the *distinct* `environment_id` values found among this project's routines by
invoking `skills/routine/guided-environment-creation.md`'s Audit procedure once per distinct ID
(not once per routine — routines sharing the same `environment_id` share the same name, no need to
re-read it). If claude-in-chrome isn't available (Audit's own fallback), skip this entire check for
this run and note in the inventory summary: "Routine Environment Dedication: skipped — browser
automation unavailable to read environment names this run."

For each of this project's routines, its environment now has a known name. Group them: routines
already on an environment whose name matches `claude-tweaks: <project-slug>` (this project's own
`REPO_SLUG`, per `/claude-tweaks:routine`'s CREATE Step 2) need no action. Routines on anything
else (an environment named `Default`, or any other non-matching name — most commonly a shared
environment also used by unrelated ad hoc sessions or other projects) are migration candidates.

If zero candidates, update the cache file's `environment_name` to the now-confirmed matching name
(if it wasn't already cached) and report "already dedicated" as above.

If one or more candidates: present a batch table (Routine | Current environment | Recommended
action: "Move to claude-tweaks: <project-slug>"), then call `AskUserQuestion`:

- `question`: `"{N} routine(s) aren't on a dedicated claude-tweaks environment for this project
  (currently on: {list of distinct current names}). Move them?"`, `header`: `"Env dedication"`,
  `multiSelect`: `false`
- Option 1 — `label`: `"Apply all recommended (Recommended)"`, `description`: `"Move all {N}
  routine(s) to a dedicated 'claude-tweaks: {project-slug}' environment, creating it first if it
  doesn't already exist"`
- Option 2 — `label`: `"Override specific items"`, `description`: `"Choose per-routine whether to
  move it"`
- Option 3 — `label`: `"Skip entirely"`, `description`: `"Leave routines on their current
  environment(s) — I'll move them manually later"`

On "Apply all recommended" or a partial "Override specific items" selection: if no environment
already named `claude-tweaks: <project-slug>` was found among the names resolved above, invoke
`skills/routine/guided-environment-creation.md`'s Create procedure once (using this project's
`project_slug` and resolved `repo_url`) to create it, and write its returned `{environment_id,
environment_name}` into `.claude-tweaks/routine-environment-cache.yml`. Then invoke the Re-point
procedure once per selected routine (its `trigger_id` from the `list` call above,
`target_environment_name` = `claude-tweaks: <project-slug>`). Report per-routine success/failure;
a failed re-point leaves that routine on its prior environment, unchanged.

On any outcome except "Skip entirely," log to `decisions.md` (or the inventory summary, if this
project has no active pipeline run dir):
```
AUTO {time} — Update Mode: moved {M} of {N} routine(s) to a dedicated claude-tweaks environment.
```

This check's candidate count counts toward Phase 1u.6's Total drift count, the same
self-classifying convention Routine Drift above already uses — treat each migration candidate as
an additional Contract Drift entry, so Phase 1u.6's own "Contract Drift entries from 1u.5" formula
picks it up without that table needing its own edit.
```

- [ ] **Step 2: Verify the new subsection's gate ordering against the file's existing structure**

Re-read the full edited region (`Routine Drift` → `Routine Relevance` → new `Routine Environment
Dedication` → `Phase 1u.6`) to confirm heading levels are consistent (`###` for each named check,
matching Routine Drift/Relevance's own level) and that no section boundary comment or cross-reference
elsewhere in the file assumed exactly two subsections existed between the Contract Drift heading and
Phase 1u.6 (`grep -n "Routine Relevance\|Routine Drift\|Phase 1u.6" skills/init/update-mode.md` — confirm
nothing outside this file references these section names positionally, e.g. "the section after Routine
Relevance").

- [ ] **Step 3: Dry-run the detection logic (read-only) against a real project with instantiated routines, before any re-point is ever executed**

Per the design doc's own testing commitment — verify the *detection* half of this subsection (everything through "present the batch table") is correct before trusting it to drive an actual re-point anywhere. Against a real project that already has `.claude-tweaks/routines/*.yml` entries (e.g. this session's own account has `memenu-io/memenu-app` with 4 instantiated routines, all currently on an environment named "Default" per this plan's own design-phase recon):

1. Run the `RemoteTrigger {action: "list"}` + repo-URL-filter step by hand and confirm it returns exactly that project's own routines — no more, no fewer.
2. Run the Audit procedure (Task 3) once against one of the distinct `environment_id` values found, and confirm it reports back the name that matches what's actually configured (cross-check against what the live UI shows, or against this plan's own design-phase finding that these 4 routines are on "Default").
3. Confirm the grouping logic correctly buckets all 4 as migration candidates (none should match `claude-tweaks: memenu-app` yet, since no such environment has been created for that project) and that the batch table's rendered text reads correctly with real values substituted in.
4. Do **not** proceed to the "Apply all recommended" branch as part of this verification — stop once the detection + batch-table-rendering is confirmed correct. Actually executing a re-point against a real project's live routines is a separate, deliberate action for whoever runs Update Mode against that project next, not something this implementation task should trigger as a side effect of its own verification.

- [ ] **Step 4: Commit**

```bash
cd "$(git rev-parse --show-toplevel)"
git add skills/init/update-mode.md
git commit -m "init: add Routine Environment Dedication check to Update Mode"
```

---

### Task 5: Version bump and final verification

**Files:**
- Modify: `.claude-plugin/plugin.json`

- [ ] **Step 1: Check for a concurrent version bump before picking the next number**

```bash
git fetch origin main
git log --oneline -5 origin/main -- .claude-plugin/plugin.json
```

Confirm the current worktree's `.claude-plugin/plugin.json` version is still the highest one visible on `origin/main`; if a concurrent session bumped past it, renumber this task's bump to the next free version instead of the one assumed below.

- [ ] **Step 2: Bump the patch version**

Read the current `version` field, increment its patch component by one, and write it back (e.g. `6.23.4` → `6.23.5` — confirm the actual current value first, since other work may have landed on `main` since this plan was written).

- [ ] **Step 3: Run the full test suite**

```bash
npm test
```

Expected: all existing tests still pass (this plan touches no `.js` files, so no test count should change) — confirms nothing in Tasks 1-4's markdown edits accidentally broke a test that greps skill-file content (several exist in this repo, per `bin/lib/*/tests/skill-md.test.js` files).

- [ ] **Step 4: Commit**

```bash
cd "$(git rev-parse --show-toplevel)"
git add .claude-plugin/plugin.json
git commit -m "Bump to <version> for cloud routine environment freshness + per-project dedication"
```
