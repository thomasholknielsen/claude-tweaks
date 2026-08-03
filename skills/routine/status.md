# Routine — STATUS

Loaded by `/claude-tweaks:routine`'s Workflow dispatch when the resolved mode is `status`. Kept out
of `SKILL.md` because this mode needs nothing from CREATE or UPDATE — and `status --all`, the form
`/claude-tweaks:init`'s Update Mode fires in bulk, is the highest-frequency entry point into this
skill.

Step numbering matches `SKILL.md`'s pre-split numbering exactly, so existing cross-references from
other skills (`skills/init/update-mode.md` cites STATUS Step 2) keep pointing at the right step.
Steps 1-2 mirror CREATE Steps 1-2 for the per-skill path; that procedure lives in
`create-and-update.md` in this skill's directory, but the `--all` branch below needs neither.

---

**Step 1.** When `--all` was passed (no `<skill>` argument), skip straight to the `--all` branch below. Otherwise, load the template and resolve `PREFIXED_NAME` exactly as CREATE Steps 1-2 do (`create-and-update.md` in this skill's directory), then check whether `.claude-tweaks/routines/{PREFIXED_NAME}.yml` exists. If it doesn't, report that no routine has been created for `<skill>` in this project and suggest `create <skill>`. Stop. If it does, proceed with that instance for the rest of this workflow.

**Step 1, `--all` branch.** Enumerate every instantiated record directly, regardless of which skill each names:

```bash
node -e "const {listRoutineRecords}=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/routine-template-parser.js'); console.log(JSON.stringify(listRoutineRecords('.claude-tweaks/routines')))"
```

If it returns `[]`, report "no routines instantiated in this project yet" and stop. This branch never derives `REPO_SLUG` or calls `git remote get-url origin` for the purpose of resolving which template matches each record — every other STATUS path starts from a skill name and works forward to a record; this one starts from the records that already exist. (Step 3.5's existing field-level drift check may still call `git remote get-url origin` separately, to compare a record's live repo-url field against the project's current origin — an unrelated, pre-existing check this branch doesn't change.)

For each returned record, resolve its matching template:

First, check the record has both `template` and `routine_id` fields present (both are required per `skills/_shared/routine-template-schema.md`). If either is missing, report this record as **Malformed** (filename + which required field is absent) and move to the next record — never attempt to resolve a template or call `RemoteTrigger` for an incomplete record.

1. Check whether `${CLAUDE_PLUGIN_ROOT}/skills/{record.template}/routine-template.yml` exists. If it doesn't (the skill directory doesn't exist, or exists with no routine template at all), this record is **Orphaned** — record that verdict and move to the next record without calling `RemoteTrigger` for this one (there is no live template to compare against, so a `get` call adds nothing actionable).
2. Otherwise, that file is the matching template.

Read and parse the resolved template file's content (`template_version`, `model`, `allowed_tools`) now — Steps 3 and 3.5 below assume this has already happened, exactly as the per-skill path's own Step 1 already does.

For every record that resolved a template (i.e. not Orphaned or Malformed), continue to Steps 2-3.5 below to compute In sync / Drifted / Stale.

> **Parallel execution:** Use parallel tool calls aggressively — each non-Orphaned, non-Malformed record's Step 2 `RemoteTrigger get` call targets a different `trigger_id` and is independent of every other record's call, so issue them concurrently. Orphaned and Malformed records need no `RemoteTrigger` call at all and are already fully resolved after step 1 above.

Present one combined table across every record, regardless of skill (this is the one STATUS mode with no per-skill grouping, since `--all` never had a skill name to group by):

```
| Routine | Verdict | Detail |
|---|---|---|
| code-health | In sync | template v2, no field drift |
| tidy | Drifted | template v1 → v2; schedule unchanged |
| skill-health | Orphaned | no skills/skill-health/routine-template.yml found — was this skill renamed? |
| journey-health | Stale | routine_id no longer resolves via RemoteTrigger get |
| claude-tweaks-broken (unresolved) | Malformed | claude-tweaks-broken.yml is missing required field `template` |
```

"Verdict" is one of: **In sync** (template_version matches, no field drift — Steps 3/3.5's existing checks), **Drifted** (version mismatch and/or schedule/model/tools/repo-url diff), **Orphaned** (per step 1 above — no live template resolved), **Stale** (Step 2's `RemoteTrigger get` call fails because the routine no longer exists — same condition Step 2 already documents for the per-skill path), **Malformed** (the record is missing a required field — see above). "Detail" carries whichever of Step 3/3.5's messages applies, or the Orphaned/Stale/Malformed explanation.

> **Parallel execution:** Use parallel tool calls aggressively — when more than one instantiated record exists, each instance's Step 2 `RemoteTrigger get` call targets a different `trigger_id` and is independent of every other instance's call, so issue them concurrently rather than iterating sequentially. Run each instance's Step 3/3.5 analysis and assemble the combined presentation after all `get` calls complete.

**Step 2.** Call `RemoteTrigger {action: "get", trigger_id: <record.routine_id>}` for live state — enabled/disabled, schedule, and any last/next run fields the response carries. If the `get` call fails because the routine no longer exists, report the record as stale and offer to delete `.claude-tweaks/routines/{PREFIXED_NAME}.yml` and re-run `create <skill>`.

In `--all` mode, use `record.filename` in place of `{PREFIXED_NAME}` (never derived in this branch), and record this as the **Stale** verdict in that record's row rather than presenting an interactive per-record offer — the combined table already surfaces it, and any recourse (delete + recreate) is the caller's decision, not something to prompt for mid-enumeration.

**Step 3.** Compare the record's `template_version` against the current template file's (already read in Step 1) `template_version`. If they differ, flag it: "this routine was created from template v{N}; the template is now at v{M} — run `update {skill}` to re-sync."

**Step 3.5 — Field-level drift (best-effort).** Each field below is checked independently — the absence of one does not skip the others. If Step 2's `get` response includes a top-level `cron_expression` (a sibling of `job_config`, per the `create` body shape in CREATE Step 6 — not nested under `job_config.ccr`), diff it against `record.schedule`. If the response includes `job_config.ccr.session_context.model`, diff it against `template.model`. If it includes `job_config.ccr.session_context.allowed_tools`, diff it against `template.allowed_tools` (set comparison, order-independent). If it includes `job_config.ccr.session_context.sources[].git_repository.url`, diff it against the project's origin (re-resolve via `git remote get-url origin` if not already available in this invocation). Report any per-field mismatch alongside the version-drift flag from Step 3. For any field the `get` response does not carry, skip only that field's comparison and note "field-level drift unavailable for {field} — comparing template_version only for this field" instead of assuming a response shape the tool hasn't been confirmed to return.

Report both the live state and the drift check(s) together.
