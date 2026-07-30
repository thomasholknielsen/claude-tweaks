# Routine Drift & Relevance Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/claude-tweaks:init`'s Update Mode currently only detects *missing* routine records — it never looks at routines that already exist. This plan adds bulk mechanical-drift detection (`/claude-tweaks:routine status --all`, reusing the existing field-diff logic) plus a new relevance-judgment pass (a harness-health-owned analysis file, invoked only by `/init`), both wired into Update Mode as new Phase 1u.5 entries.

**Architecture:** Two independent mechanisms sharing one trigger point. Mechanical drift lives entirely in `/claude-tweaks:routine` (a new `--all` mode on STATUS, a new `--defaults` flag on UPDATE) — `/init`'s Update Mode calls it and stages results as the usual batch offer. Relevance judgment lives in a new `skills/harness-health/routine-relevance-analysis.md` sub-file with no cursor of its own, invoked directly by `/init`'s Update Mode only — never by harness-health's own SELECT rotation, never filed as a GitHub issue.

**Tech Stack:** Markdown skill files (prose procedures); one small Node addition to `bin/lib/routine-template-parser.js` with `node --test` coverage.

## Global Constraints

- `--all`/`status --all` never calls `git remote get-url origin` — it enumerates existing record *files* directly and resolves each one's matching template by skill name (and, only when a skill ships more than one template, by matching the record's filename suffix against each candidate template's own `routine_name` — see Task 2's exact algorithm). Never re-derive `REPO_SLUG` inside `--all` mode.
- `update --defaults` is interactive-only in spirit — it exists solely so a batch already confirmed via `/init`'s own `AskUserQuestion` doesn't trigger a second interactive round-trip per item. Never invoke it standalone without an already-confirmed batch context, exactly like the existing `create --defaults` anti-pattern.
- Both new `update-mode.md` checks (Routine Drift, Routine Relevance) skip entirely and silently when `.claude-tweaks/routines/` doesn't exist — this repo's own current state.
- Orphaned and Stale records (from `status --all`) get no bulk auto-fix in Routine Drift — flag only, since neither has a safe default action.
- Routine Drift counts toward Phase 1u.6's Total drift count. Routine Relevance does NOT — same treatment as Maturity Drift (not a presence/absence signal Phase 1u.6 can precompute before Phase 3).
- No new CLAUDE.md config flag and no new durable-state cursor for either mechanism.
- `routine-relevance-analysis.md` has no YAML frontmatter and no interaction-style directive — it's a lazy-loaded sub-file, not a top-level skill, matching `library-shape-analysis.md`'s exact shape.
- `RemoteTrigger update` (the actual fix Routine Drift stages) is never silently applied under `auto` mode — same reasoning as `/init` Step 9's repo creation: an external, hard-to-reverse API call.
- Version bump (Task 6) follows this repo's documented release convention: `git fetch origin main` first, check `git log --oneline -5 origin/main -- .claude-plugin/plugin.json` for a concurrent bump before choosing the next version number.

---

### Task 1: `listRoutineRecords` helper in `bin/lib/routine-template-parser.js`

**Files:**
- Modify: `bin/lib/routine-template-parser.js`
- Modify: `tests/routine-template-parser.test.js`

**Interfaces:**
- Produces: `listRoutineRecords(dir)` — exported alongside the existing `parseRoutineTemplate`. Reads every `*.yml` file directly under `dir` (non-recursive), parses each with the *existing, unmodified* `parseRoutineTemplate` (the instantiated record schema — `routine_id`, `template`, `template_version`, `created_at`, `schedule`, `console_url` — is flat scalars only, no nested maps or folded blocks, so the existing parser already handles it correctly with zero changes). Returns an array of `{ filename, ...parsedFields }` objects, sorted by filename. If `dir` doesn't exist (`ENOENT`), returns `[]` — this is the normal "nothing instantiated yet" state, not an error. Any other `readdirSync`/`readFileSync` error propagates. Does not validate the record schema (missing required fields) — that's the caller's job (Task 2), matching `parseRoutineTemplate`'s own narrow "parse, don't validate" scope.
- Consumes: nothing new — reuses `parseRoutineTemplate` as already implemented.

- [ ] **Step 1: Write the failing tests**

Add to the top of `tests/routine-template-parser.test.js`, alongside the existing requires:

```js
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseRoutineTemplate, listRoutineRecords } = require('../bin/lib/routine-template-parser.js');
```

(This replaces the existing `const { parseRoutineTemplate } = require('../bin/lib/routine-template-parser.js');` line — same destructure, plus the new export and the three new top-level requires needed for temp-directory tests.)

Append these tests at the end of the file:

```js
test('listRoutineRecords returns [] for a directory that does not exist', () => {
  const missing = path.join(os.tmpdir(), 'routine-records-does-not-exist-' + process.pid);
  assert.deepStrictEqual(listRoutineRecords(missing), []);
});

test('listRoutineRecords parses every .yml file in the directory, attaching filename', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'routine-records-'));
  try {
    fs.writeFileSync(
      path.join(dir, 'claude-tweaks-code-health-daily.yml'),
      'routine_id: "trig_abc123"\ntemplate: code-health\ntemplate_version: 2\ncreated_at: "2026-06-01T00:00:00Z"\nschedule: "0 3 * * *"\nconsole_url: "https://claude.ai/code/routines/trig_abc123"\n',
    );
    fs.writeFileSync(
      path.join(dir, 'claude-tweaks-tidy-weekly.yml'),
      'routine_id: "trig_def456"\ntemplate: tidy\ntemplate_version: 3\ncreated_at: "2026-05-15T00:00:00Z"\nschedule: "0 4 * * 0"\nconsole_url: "https://claude.ai/code/routines/trig_def456"\n',
    );
    const records = listRoutineRecords(dir);
    assert.strictEqual(records.length, 2);
    assert.deepStrictEqual(records[0], {
      filename: 'claude-tweaks-code-health-daily.yml',
      routine_id: 'trig_abc123',
      template: 'code-health',
      template_version: 2,
      created_at: '2026-06-01T00:00:00Z',
      schedule: '0 3 * * *',
      console_url: 'https://claude.ai/code/routines/trig_abc123',
    });
    assert.strictEqual(records[1].filename, 'claude-tweaks-tidy-weekly.yml');
    assert.strictEqual(records[1].template, 'tidy');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('listRoutineRecords ignores non-.yml files in the same directory', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'routine-records-'));
  try {
    fs.writeFileSync(path.join(dir, 'claude-tweaks-code-health-daily.yml'), 'template: code-health\n');
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'not a routine record\n');
    const records = listRoutineRecords(dir);
    assert.strictEqual(records.length, 1);
    assert.strictEqual(records[0].filename, 'claude-tweaks-code-health-daily.yml');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/routine-template-parser.test.js`
Expected: FAIL — `listRoutineRecords` is not exported yet (`TypeError: listRoutineRecords is not a function` or similar).

- [ ] **Step 3: Implement `listRoutineRecords`**

At the top of `bin/lib/routine-template-parser.js`, after the `'use strict';` line, add:

```js
const fs = require('fs');
const path = require('path');
```

Immediately before the final `module.exports = { parseRoutineTemplate };` line, add:

```js
function listRoutineRecords(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  return entries
    .filter((name) => name.endsWith('.yml'))
    .sort()
    .map((filename) => {
      const text = fs.readFileSync(path.join(dir, filename), 'utf8');
      return { filename, ...parseRoutineTemplate(text) };
    });
}
```

Replace the final line with:

```js
module.exports = { parseRoutineTemplate, listRoutineRecords };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/routine-template-parser.test.js`
Expected: PASS — all tests including the 3 new ones.

- [ ] **Step 5: Run the full suite to confirm no regressions**

Run: `npm test`
Expected: PASS, same total count as before plus 3.

- [ ] **Step 6: Commit**

```bash
git add bin/lib/routine-template-parser.js tests/routine-template-parser.test.js
git commit -m "Add listRoutineRecords helper for bulk routine-record enumeration"
```

---

### Task 2: `/claude-tweaks:routine status --all`

**Files:**
- Modify: `skills/routine/SKILL.md`

**Interfaces:**
- Consumes: Task 1's `listRoutineRecords(dir)`.
- Produces: STATUS `--all` mode — a verdict per record (In sync / Drifted / Orphaned / Stale), presented as one combined table across every instantiated record in the project regardless of skill. This is the shape Task 4 invokes.

- [ ] **Step 1: Update the frontmatter and Input table**

In `skills/routine/SKILL.md`, replace the frontmatter `argument-hint` line:

```
argument-hint: "<create|update|status> <skill> [--variant <name>] [--dry-run] [--defaults] [--environment <id>] [--refresh-environment]"
```

with:

```
argument-hint: "<create|update|status> <skill>|--all [--variant <name>] [--dry-run] [--defaults] [--environment <id>] [--refresh-environment]"
```

In the `## Input` table, replace this row:

```
| `status <skill>` | Show the instantiated record(s) alongside live routine state. With no `--variant`, lists every instantiated variant found for `<skill>`. |
```

with:

```
| `status <skill>` | Show the instantiated record(s) alongside live routine state. With no `--variant`, lists every instantiated variant found for `<skill>`. |
| `status --all` | Bulk drift check across every instantiated record in the project (`.claude-tweaks/routines/*.yml`), regardless of skill or variant — no `<skill>` argument. The only entry point that can discover a record whose named skill no longer exists at all (renamed/retired), since every other path here starts from a skill name and globs that skill's own template file forward. See STATUS Step 1's `--all` branch for the full verdict table. |
```

- [ ] **Step 2: Rewrite STATUS Step 1 to add the `--all` branch**

Replace the two paragraphs that currently open the `### STATUS <skill>` section:

```
**Step 1.** When `--variant=<name>` was passed, load the template and resolve `PREFIXED_NAME`/record path exactly as CREATE Steps 1-2, then read that single `.claude-tweaks/routines/{PREFIXED_NAME}.yml`; if missing, report no routine for `<skill> --variant=<name>` and suggest `create <skill> --variant=<name>`. Stop.

When `--variant` is omitted: glob `${CLAUDE_PLUGIN_ROOT}/skills/{skill}/routine-template.yml` and `${CLAUDE_PLUGIN_ROOT}/skills/{skill}/routine-template-*.yml` to enumerate every template `<skill>` ships, read each one's `routine_name`, and derive `REPO_SLUG` (same recipe as CREATE Step 2) to check which of `.claude-tweaks/routines/{REPO_SLUG}-{routine_name}.yml` exist. If none exist, report that no routine has been created for `<skill>` in this project and suggest `create <skill>`. Stop. If exactly one exists, proceed with that single instance for the rest of this workflow, exactly as before. If more than one exists, run Steps 2-3.5 below once per existing instance and present all of them together, each labeled by its variant name (or "default" for the base template).
```

with:

```
**Step 1.** When `--all` was passed (no `<skill>` argument), skip straight to the `--all` branch below. Otherwise, when `--variant=<name>` was passed, load the template and resolve `PREFIXED_NAME`/record path exactly as CREATE Steps 1-2, then read that single `.claude-tweaks/routines/{PREFIXED_NAME}.yml`; if missing, report no routine for `<skill> --variant=<name>` and suggest `create <skill> --variant=<name>`. Stop.

When `--variant` is omitted (and `--all` wasn't passed): glob `${CLAUDE_PLUGIN_ROOT}/skills/{skill}/routine-template.yml` and `${CLAUDE_PLUGIN_ROOT}/skills/{skill}/routine-template-*.yml` to enumerate every template `<skill>` ships, read each one's `routine_name`, and derive `REPO_SLUG` (same recipe as CREATE Step 2) to check which of `.claude-tweaks/routines/{REPO_SLUG}-{routine_name}.yml` exist. If none exist, report that no routine has been created for `<skill>` in this project and suggest `create <skill>`. Stop. If exactly one exists, proceed with that single instance for the rest of this workflow, exactly as before. If more than one exists, run Steps 2-3.5 below once per existing instance and present all of them together, each labeled by its variant name (or "default" for the base template).

**Step 1, `--all` branch.** Call `listRoutineRecords('.claude-tweaks/routines')` (`bin/lib/routine-template-parser.js`) to enumerate every instantiated record directly, regardless of which skill each names. If it returns `[]`, report "no routines instantiated in this project yet" and stop. This branch never derives `REPO_SLUG` or calls `git remote get-url origin` — every other STATUS path starts from a skill name and works forward to a record; this one starts from the records that already exist.

For each returned record, resolve its matching template:

1. Glob `${CLAUDE_PLUGIN_ROOT}/skills/{record.template}/routine-template*.yml`. If the glob is empty (the skill directory doesn't exist, or exists with no routine templates at all), this record is **Orphaned** — record that verdict and move to the next record without calling `RemoteTrigger` for this one (there is no live template to compare against, so a `get` call adds nothing actionable).
2. If the glob returned exactly one file, that is the matching template — the common case (every shipped skill today except `tidy`).
3. If the glob returned more than one file (only `tidy` ships a named variant today), read each candidate's `routine_name` field and find the one where `record.filename` (minus its `.yml` suffix) ends with `-{that candidate's routine_name}`. This disambiguates without ever deriving `REPO_SLUG` — a record's filename already encodes its `routine_name` as a suffix, by construction (see CREATE Step 2's `PREFIXED_NAME` recipe). If no candidate's `routine_name` matches as a suffix (shouldn't happen in practice), fall back to the skill's default `routine-template.yml` and note "variant ambiguous — compared against the default template" alongside this record's row.

For every record that resolved a template (i.e. not Orphaned), continue to Steps 2-3.5 below to compute In sync / Drifted / Stale.

> **Parallel execution:** Use parallel tool calls aggressively — each non-Orphaned record's Step 2 `RemoteTrigger get` call targets a different `trigger_id` and is independent of every other record's call, so issue them concurrently. Orphaned records need no `RemoteTrigger` call at all and are already fully resolved after step 1 above.

Present one combined table across every record, regardless of skill (this is the one STATUS mode with no per-skill grouping, since `--all` never had a skill name to group by):

```
| Routine | Verdict | Detail |
|---|---|---|
| code-health (default) | In sync | template v2, no field drift |
| tidy (github-triage) | Drifted | template v1 → v2; schedule unchanged |
| skill-health (default) | Orphaned | no skills/skill-health/routine-template*.yml found — was this skill renamed? |
| journey-health (default) | Stale | routine_id no longer resolves via RemoteTrigger get |
```

"Verdict" is one of: **In sync** (template_version matches, no field drift — Steps 3/3.5's existing checks), **Drifted** (version mismatch and/or schedule/model/tools/repo-url diff), **Orphaned** (per step 1 above — no live template resolved), **Stale** (Step 2's `RemoteTrigger get` call fails because the routine no longer exists — same condition Step 2 already documents for the per-skill path). "Detail" carries whichever of Step 3/3.5's messages applies, or the Orphaned/Stale explanation.
```

- [ ] **Step 3: Add the Anti-Patterns row**

In the `## Anti-Patterns` table, add a new row (after the existing `--defaults` row):

```
| Passing `--all` together with `<skill>` or `--variant` | `--all` is a distinct entry point with no skill name at all — it enumerates every instantiated record in the project directly. Combining it with a skill name is a contradiction, not a narrower filter; treat it the same as any other conflicting-arguments case and ask which was meant rather than silently picking one. |
```

- [ ] **Step 4: Update the Relationship table row for `/claude-tweaks:init`**

Replace the existing `/claude-tweaks:init` row's text (in `## Relationship to Other Skills`) — append this sentence to the end of the existing cell content, after "...pure discovery + handoff, no logic duplicated; `--defaults` is `/routine`'s own sanctioned non-interactive entry point, not a shortcut `/init` invented around it.":

```
 Update Mode also invokes `/claude-tweaks:routine status --all --source init` to detect drifted, orphaned, and stale routines across the whole project in one call, staging any Drifted ones as a batch re-sync offer — see `update-mode.md`'s Routine Drift entry.
```

- [ ] **Step 5: Manual verification**

No `node --test` coverage applies (prose-only change; `--all`'s only code dependency, `listRoutineRecords`, was already tested in Task 1). Dry-run verification: in a scratch directory, hand-author two records under `.claude-tweaks/routines/` — one matching a real shipped skill's current template_version (should read "In sync"), one naming a nonexistent skill (should read "Orphaned") — and walk `status --all`'s Step 1 branch by hand against the written procedure, confirming both verdicts resolve as documented.

- [ ] **Step 6: Commit**

```bash
git add skills/routine/SKILL.md
git commit -m "Add /claude-tweaks:routine status --all for bulk drift detection"
```

---

### Task 3: `/claude-tweaks:routine update --defaults`

**Files:**
- Modify: `skills/routine/SKILL.md`

**Interfaces:**
- Consumes: nothing new.
- Produces: UPDATE `--defaults` mode — re-syncs a record to its current template without an interactive round-trip. This is the fix path Task 4's batch offer invokes per confirmed Drifted record.

- [ ] **Step 1: Update the Input table's `--defaults` row**

Replace:

```
| `--defaults` (combine with `create`) | Skip Step 5's interactive cadence picker (use the template's own `default_schedule.cron_expression` verbatim) and Step 7's interactive confirm (proceed straight to creation once the body is assembled) — for non-interactive/batch creation. Environment still resolves via Step 4 (cache, `list`, or `--environment`); if none of those yields a value, `--defaults` does not suppress that one unavoidable prompt. |
```

with:

```
| `--defaults` (combine with `create` or `update`) | On `create`: skip Step 5's interactive cadence picker (use the template's own `default_schedule.cron_expression` verbatim) and Step 7's interactive confirm (proceed straight to creation once the body is assembled). On `update`: skip Step 3's schedule re-resolution entirely (keep the record's existing `schedule` field untouched — no cadence picker at all) and Step 5's interactive confirm (proceed straight to Step 6 once the body is assembled). Either way, for non-interactive/batch use. Environment still resolves via the normal cache/`list`/`--environment` sources; if none yields a value, `--defaults` does not suppress that one unavoidable prompt. |
```

- [ ] **Step 2: Update UPDATE Step 3 to branch on `--defaults`**

Replace:

```
**Step 3.** Re-resolve environment and schedule — the two fields pre-fill from different sources, not both from the record. For environment, follow CREATE Step 4's procedure exactly: check `.claude-tweaks/routine-environment-cache.yml` first, falling back to `RemoteTrigger list` if the cache is empty — never the instantiated record itself, since the record schema deliberately never stores `environment_id` (see `skills/_shared/routine-template-schema.md`). For schedule, follow CREATE Step 5's full cadence-picker procedure (5a-5d), but parse the existing record's `schedule` field for the 5a pre-selection instead of the template's `default_schedule.cron_expression` — the record's own currently-active cron is the more relevant "what's running today" starting point on an update than the template's shipped default, which may no longer match what this project actually instantiated. (Repo URL and `PREFIXED_NAME` were already resolved in Step 1 — do not re-derive them.)
```

with:

```
**Step 3.** Re-resolve environment always. For environment, follow CREATE Step 4's procedure exactly: check `.claude-tweaks/routine-environment-cache.yml` first, falling back to `RemoteTrigger list` if the cache is empty — never the instantiated record itself, since the record schema deliberately never stores `environment_id` (see `skills/_shared/routine-template-schema.md`). (Repo URL and `PREFIXED_NAME` were already resolved in Step 1 — do not re-derive them.)

If `--defaults` was passed: skip schedule re-resolution entirely — keep the existing record's `schedule` field verbatim, unchanged, for the rest of this workflow. No cadence picker runs.

Otherwise, re-resolve schedule too: follow CREATE Step 5's full cadence-picker procedure (5a-5d), but parse the existing record's `schedule` field for the 5a pre-selection instead of the template's `default_schedule.cron_expression` — the record's own currently-active cron is the more relevant "what's running today" starting point on an update than the template's shipped default, which may no longer match what this project actually instantiated.
```

- [ ] **Step 3: Update UPDATE Step 5 to branch on `--defaults`**

Replace:

```
**Step 5.** Review gate — same standard as CREATE's Step 7: show the diff, then call `AskUserQuestion` with `question`: `"Update this routine?"`, `header`: `"Confirm routine"`, `multiSelect`: `false`, and:
- Option 1 — `label`: `"Yes, update (Recommended)"`, `description`: `"Proceed with the assembled RemoteTrigger body shown above"`
- Option 2 — `label`: `"Cancel"`, `description`: `"Do not update anything"`

Marking "Yes, update" as `(Recommended)` follows the same reasoning as CREATE Step 7's confirm — the diff is always shown before this call, so the safety property (review before commit) is preserved even with a marked default.

If `--dry-run` was passed: show the diff and stop. Do not call `RemoteTrigger`. Do not rewrite the instantiated record.
```

with:

```
**Step 5.** Review gate — same standard as CREATE's Step 7: show the diff (Step 4's output) always, regardless of `--defaults`.

If `--dry-run` was passed: show the diff and stop. Do not call `RemoteTrigger`. Do not rewrite the instantiated record. (This check applies whether or not `--defaults` was also passed — `--dry-run` always wins, same precedent as CREATE Step 7.)

If `--defaults` was passed (and not `--dry-run`): skip the `AskUserQuestion` call below — proceed straight to Step 6. The diff above is still shown, as a report rather than a prompt.

Otherwise, call `AskUserQuestion` with `question`: `"Update this routine?"`, `header`: `"Confirm routine"`, `multiSelect`: `false`, and:
- Option 1 — `label`: `"Yes, update (Recommended)"`, `description`: `"Proceed with the assembled RemoteTrigger body shown above"`
- Option 2 — `label`: `"Cancel"`, `description`: `"Do not update anything"`

Marking "Yes, update" as `(Recommended)` follows the same reasoning as CREATE Step 7's confirm — the diff is always shown before this call, so the safety property (review before commit) is preserved even with a marked default.
```

- [ ] **Step 4: Update the Anti-Patterns row for `--defaults`**

Replace:

```
| Using `--defaults` to skip review on a single ad hoc `create` invocation the user hasn't already confirmed at a higher level | `--defaults` is `/init`'s sanctioned non-interactive entry point for a batch the user already confirmed via a multiSelect picklist (see the `/claude-tweaks:init` row below) — using it standalone removes the one safety check this billed, undeletable action has, for no batching benefit. |
```

with:

```
| Using `--defaults` (on `create` or `update`) to skip review on a single ad hoc invocation the user hasn't already confirmed at a higher level | `--defaults` is `/init`'s sanctioned non-interactive entry point for a batch the user already confirmed via a multiSelect picklist or apply-all batch table (see the `/claude-tweaks:init` row below) — using it standalone removes the one safety check this billed, undeletable/hard-to-revert action has, for no batching benefit. |
```

- [ ] **Step 5: Manual verification**

Prose-only change, no automated coverage. Dry-run: hand-trace `update <skill> --defaults` against a record whose `schedule` differs from the template's `default_schedule.cron_expression`, confirming the traced procedure keeps the record's existing schedule untouched and skips straight past Step 5's confirm to Step 6.

- [ ] **Step 6: Commit**

```bash
git add skills/routine/SKILL.md
git commit -m "Add --defaults to /claude-tweaks:routine update for non-interactive batch re-sync"
```

---

### Task 4: Wire Mechanical Drift Sync into `/init`'s Update Mode

**Files:**
- Modify: `skills/init/update-mode.md`

**Interfaces:**
- Consumes: Task 2's `status --all` verdict table shape; Task 3's `update --defaults` entry point.
- Produces: a new "Routine Drift" `###` subsection under Phase 1u.5, contributing to Phase 1u.6's Total drift count.

- [ ] **Step 1: Add the Routine Drift subsection**

In `skills/init/update-mode.md`, immediately after the "Auto-Mode-Policy Migration" subsection ends (i.e. immediately before the `## Phase 1u.6: Update Mode Early-Exit Gate` heading), insert:

```markdown
### Routine Drift

Unlike the checks above, this isn't a CLAUDE.md/policy.yml marker — it audits the project's
instantiated cloud Routines (`.claude-tweaks/routines/*.yml`) against the templates they were
created from. Skip this entire check if `.claude-tweaks/routines/` doesn't exist — nothing is
instantiated yet, most commonly a project that has never run `/claude-tweaks:routine create`.

Run:

```bash
/claude-tweaks:routine status --all --source init
```

Each returned record resolves to one of four verdicts (see `skills/routine/SKILL.md`'s STATUS
`--all` mode for the full detection logic): In sync, Drifted, Orphaned, or Stale.

- **In sync** records need no action — omit them from the presented table entirely.
- **Drifted** records are staged the standard way: present a batch table (Routine | Current →
  live template_version | Field drift | Recommended action: "Re-sync"), then call
  `AskUserQuestion`:
  - `question`: `"{N} routine(s) have drifted from their templates. Re-sync now?"`, `header`:
    `"Routine drift"`, `multiSelect`: `false`
  - Option 1 — `label`: `"Apply all recommended (Recommended)"`, `description`: `"Re-sync all
    {N} drifted routine(s) to their current templates, keeping each one's existing schedule"`
  - Option 2 — `label`: `"Override specific items"`, `description`: `"Choose per-routine what
    happens to each of the {N} entries"`
  - Option 3 — `label`: `"Skip entirely"`, `description`: `"Leave routines as-is — I'll re-sync
    manually later"`

  On "Apply all recommended," invoke `/claude-tweaks:routine update <skill> [--variant=<name>]
  --defaults --source init` once per Drifted record. On "Override specific items," follow up
  with the per-item choices as ordinary free-text in the next message, per CLAUDE.md's
  Multi-item Decisions convention (not the tool's `Other` field). On any outcome except "Skip
  entirely," log to `decisions.md`:
  ```
  AUTO {time} — Update Mode: re-synced {M} of {N} drifted routine(s) to their current templates.
  ```
- **Orphaned** and **Stale** records are presented as flagged advisories only — no bulk
  auto-fix offered, since neither has a safe default action (Orphaned suggests manual
  investigation — was the skill renamed, delete and recreate under the new name; Stale
  suggests the same delete-and-recreate recourse STATUS Step 2 already documents for a
  routine deleted out-of-band).

This check's Drifted count (not Orphaned/Stale, which have no auto-fix and so aren't "drift
a re-run of /init would resolve" in the same sense) counts toward Phase 1u.6's Total drift
count, the same way Work-Record Backend Drift does above.
```

- [ ] **Step 2: Manual verification**

Prose-only, no automated coverage. Verify the new subsection reads correctly in place by viewing the file end-to-end: confirm it sits between "Auto-Mode-Policy Migration" and "Phase 1u.6," and that its batch-table/AskUserQuestion shape matches the Auto-Mode-Policy Migration subsection's own established convention.

- [ ] **Step 3: Commit**

```bash
git add skills/init/update-mode.md
git commit -m "Wire /claude-tweaks:routine status --all into /init Update Mode as Routine Drift"
```

---

### Task 5: Routine Relevance Audit (new harness-health sub-file + Update Mode wiring)

**Files:**
- Create: `skills/harness-health/routine-relevance-analysis.md`
- Modify: `skills/init/update-mode.md`

**Interfaces:**
- Consumes: nothing code-level. Reads `.claude-tweaks/routines/*.yml` records (via the same enumeration Task 4's Routine Drift check already ran this firing — this pass runs against records that STATUS `--all` resolved a template for, skipping ones flagged Orphaned) and `git log` for each record's corresponding skill directory.
- Produces: zero or more relevance-note rows, folded into `/init`'s own Drift Report by the new "Routine Relevance" subsection.

- [ ] **Step 1: Write the new harness-health sub-file**

Create `skills/harness-health/routine-relevance-analysis.md`:

```markdown
# Routine Relevance Analysis

A judgment pass over a project's already-instantiated cloud Routines
(`.claude-tweaks/routines/*.yml`), invoked directly by `/claude-tweaks:init`'s Update Mode
only — never by this skill's own SELECT/due-ness rotation, and never filed as a GitHub issue.
Unlike every other check `_shared/harness-health-analysis.md` and `library-shape-analysis.md`
perform, this pass has no cursor of its own; it re-runs in full every time `/init`'s Update
Mode invokes it.

## What this checks

`/claude-tweaks:routine status --all`'s Drifted verdict (see `skills/routine/SKILL.md`)
already catches every staleness a `template_version` bump would signal — a changed prompt,
model, tools, or schedule default. This pass exists for staleness that does NOT bump
`template_version` at all: the underlying skill's own behavior or scope shifting since the
routine was instantiated.

## Procedure

For each instantiated record whose `template` skill still resolves to a real
`skills/{template}/routine-template*.yml` (records `/claude-tweaks:routine status --all`
flagged Orphaned are skipped here entirely — Routine Drift already surfaces those, and there
is no live skill left to judge relevance against):

1. Read the record's `created_at` field (ISO 8601 — set at creation or the routine's last
   `update`).
2. Run `git log --since="<created_at>" --oneline -- skills/{template}/`. Zero or trivial
   commits (a handful of typo/formatting fixes) → skip this record silently, no finding.
3. For non-trivial churn, read the actual commit messages and diffs in that range — not just
   the count. Judge, grounded in what actually changed: has the skill's scope shifted enough
   that this routine's cadence, model, or tool access (as recorded, not as currently
   templated — this pass is about behavior drift, not template drift) might now be
   miscalibrated? Has a newer sibling routine-template (one that didn't exist as of
   `created_at`) started covering ground this routine also covers?
4. If the judgment surfaces something worth a look, emit one row: `{routine identity, e.g.
   "tidy --variant=github-triage"} | {N} commits touching skills/{template}/ since
   {created_at date} | {one or two sentence relevance note grounded in what the diffs
   actually showed}`. If nothing from steps 2-3 surfaces a concern, this record produces no
   row — most records in most audits should produce nothing.

## Output

Hand the resulting rows (zero or more) back to `/init`'s Update Mode, which folds them into
the same Drift Report the other Phase 1u.5 checks populate — see `update-mode.md`'s "Routine
Relevance" entry for the exact presentation and resolution. This pass never calls `gh issue
create` and never writes to this skill's own cursor/cache state — it is pure analysis, with
`/init` owning both the presentation and the resolution.

## Anti-patterns

| Pattern | Why it fails |
|---|---|
| Flagging a record based on commit *count* alone | A high commit count on cosmetic/doc-only changes is not scope drift — read the actual diffs before judging. |
| Re-checking anything `template_version` would already catch | That's Routine Drift's (STATUS `--all`'s Drifted verdict) job — this pass only fires on behavior drift a template edit wouldn't capture. |
| Running this pass on a schedule, or filing its findings as GitHub issues | This pass has no cursor and is never invoked by this skill's own SELECT step or a scheduled Routine — `/init`'s Update Mode is its only caller, by design. |
| Judging an Orphaned record's relevance | Orphaned records (no resolvable template at all) are Routine Drift's territory — there is no live skill here to judge scope drift against. |
```

- [ ] **Step 2: Add the Routine Relevance subsection to update-mode.md**

In `skills/init/update-mode.md`, immediately after the "Routine Drift" subsection Task 4 added (still before `## Phase 1u.6: Update Mode Early-Exit Gate`), insert:

```markdown
### Routine Relevance

Skip entirely if `.claude-tweaks/routines/` doesn't exist (same gate as Routine Drift above).
Otherwise, read `skills/harness-health/routine-relevance-analysis.md` and apply its procedure
directly against this project's instantiated records — this is the one place `/init` reaches
into a harness-health-owned file outside that skill's own SELECT/JUDGE/FILE pipeline (see
that file's own header for why).

Fold any resulting rows into the same Drift Report this phase already produces, as their own
"Routine Relevance" subsection:

```
| Routine | Churn since created_at | Relevance note |
|---|---|---|
| {routine identity} | {N} commits, {date range} | {note} |
```

Resolve with a single acknowledge/defer choice, not a per-row apply (these are judgment calls
with no single mechanical fix, unlike Routine Drift's clean version-diff apply path):

- `question`: `"{N} routine(s) may be worth reconsidering given recent changes to their
  skills. Anything to act on now?"`, `header`: `"Routine relevance"`, `multiSelect`: `false`
- Option 1 — `label`: `"Acknowledged — I'll look into these myself (Recommended)"`,
  `description`: `"No changes made now; revisit manually (e.g. /claude-tweaks:routine update
  <skill> to adjust cadence/tools)"`
- Option 2 — `label`: `"Skip — not relevant"`, `description`: `"Dismiss this run's relevance
  notes entirely"`

This check does not count toward Phase 1u.6's Total drift count — like Maturity Drift above,
it isn't a presence/absence signal Phase 1u.6 can cheaply precompute before Phase 3 runs (it
requires reading git history and judging diffs, not checking a marker's existence).
```

- [ ] **Step 3: Manual verification**

Prose-only, no automated coverage. Verify by reading `routine-relevance-analysis.md` end-to-end for internal consistency (no placeholders, Anti-patterns table matches the Procedure section's own stated boundaries), and confirm `update-mode.md`'s new "Routine Relevance" subsection correctly sits after "Routine Drift" and before "Phase 1u.6."

- [ ] **Step 4: Commit**

```bash
git add skills/harness-health/routine-relevance-analysis.md skills/init/update-mode.md
git commit -m "Add Routine Relevance audit: new harness-health analysis file, invoked only by /init Update Mode"
```

---

### Task 6: Cross-reference sweep, CHANGELOG, and version bump

**Files:**
- Modify: `skills/init/SKILL.md`
- Modify: `skills/harness-health/SKILL.md`
- Modify: `CLAUDE.md`
- Modify: `CHANGELOG.md`
- Modify: `.claude-plugin/plugin.json`

**Interfaces:**
- Consumes: final skill/behavior names from Tasks 2-5 (this task only adds cross-references and bumps version — no new behavior).

- [ ] **Step 1: Update `skills/init/SKILL.md`'s Step 15 summary**

In the `### Step 15: Routine Installation (Optional Companion)` paragraph, the current text ends:

```
...Idempotent: candidates with an existing record are never re-offered. Read `bootstrap-steps.md` (Step 15) for the full procedure.
```

Append a sentence before "Read `bootstrap-steps.md`...":

```
...Idempotent: candidates with an existing record are never re-offered — but Update Mode does audit existing records for drift and relevance; see `update-mode.md`'s Routine Drift and Routine Relevance entries. Read `bootstrap-steps.md` (Step 15) for the full procedure.
```

- [ ] **Step 2: Update `skills/init/SKILL.md`'s Relationship table rows**

In the `/claude-tweaks:routine` row, the current text ends:

```
...pure discovery + handoff, no logic duplicated.
```

Append:

```
 Update Mode also invokes `/claude-tweaks:routine status --all --source init` and, on confirmation, `update <skill> [--variant=<name>] --defaults --source init` to detect and re-sync drifted routines — see `update-mode.md`'s Routine Drift entry.
```

In the `/claude-tweaks:harness-health and _shared/harness-health-analysis.md` row, the current text ends:

```
...only `.claude-tweaks/harness-health/cache.json` is still local (see `bootstrap-steps.md` Step 4).
```

Append:

```
 Update Mode also invokes `skills/harness-health/routine-relevance-analysis.md` directly — outside harness-health's own SELECT/JUDGE/FILE pipeline — to judge whether this project's instantiated routines are still relevant given recent skill changes; see `update-mode.md`'s Routine Relevance entry.
```

- [ ] **Step 3: Update `skills/init/SKILL.md`'s Actions Performed table**

Add a new row after the existing "Routines" row:

```
| Routine re-sync | Re-synced {M} drifted routine(s) to their current templates: `{list}` (Update Mode only) | Update Mode |
```

- [ ] **Step 4: Update `skills/harness-health/SKILL.md`'s Relationship table**

The current `/claude-tweaks:init` row reads:

```
| `/claude-tweaks:init` | Phase 6 (Update Mode skill patches) and Phase 3/1u's skill classification apply the same shared procedure on whole-codebase reconnaissance, sharing the same cursor/cache state. |
```

Append a sentence before the closing `|`:

```
| `/claude-tweaks:init` | Phase 6 (Update Mode skill patches) and Phase 3/1u's skill classification apply the same shared procedure on whole-codebase reconnaissance, sharing the same cursor/cache state. Update Mode also invokes this skill's `routine-relevance-analysis.md` directly to judge whether a project's instantiated cloud Routines are still relevant given recent skill changes — the only consumer of that file, and the only case where `/init` reaches into a harness-health-owned analysis file outside this skill's own SELECT/JUDGE/FILE pipeline. |
```

- [ ] **Step 5: Update root `CLAUDE.md`'s "Skills with sub-files" table**

The current harness-health row reads:

```
| harness-health | library-shape-analysis.md | Periodic cross-skill-comparison pass (too-shallow / overlapping / bloated) — loaded on its own 90-day due-ness cursor, independent of the standard per-target rotation |
```

Replace with:

```
| harness-health | library-shape-analysis.md, routine-relevance-analysis.md | Periodic cross-skill-comparison pass (too-shallow / overlapping / bloated) — loaded on its own 90-day due-ness cursor, independent of the standard per-target rotation; routine-relevance-analysis.md judges whether a project's instantiated cloud Routines are still relevant given recent skill changes — invoked directly by `/init`'s Update Mode only, never by this skill's own SELECT rotation or filed as an issue |
```

In the `init` row, the description currently ends with:

```
...`.claude/rules/` frontmatter template + common rule candidates
```

Append (still inside the same table cell, before the closing `|`):

```
; Update-Mode Routine Drift + Routine Relevance checks (bulk `/claude-tweaks:routine status --all` audit + harness-health's routine-relevance-analysis.md judgment, both gated on `.claude-tweaks/routines/` existing)
```

- [ ] **Step 6: Add the CHANGELOG entry**

At the top of `CHANGELOG.md` (above the current topmost entry), add:

```markdown
## v6.24.0 — /init Update Mode: Routine Drift & Relevance Audit

- `/claude-tweaks:routine` gains `status --all` (bulk drift check across every instantiated
  routine in the project, including ones whose skill was renamed or retired) and
  `update --defaults` (non-interactive re-sync, for batch-confirmed use).
- `/claude-tweaks:init`'s Update Mode gains two new Phase 1u.5 checks: Routine Drift (stages
  a batch re-sync offer for drifted routines) and Routine Relevance (a new harness-health-
  owned judgment pass, invoked only by `/init`, surfacing routines whose underlying skill has
  changed enough to warrant a second look).
```

- [ ] **Step 7: Whole-repo verification sweep**

```bash
grep -rn "status --all\|update --defaults\|routine-relevance-analysis" skills/ CLAUDE.md | grep -v "docs/superpowers/"
```

Confirm every match is one of the edits made in this plan (Tasks 2-6) and no other file references these capabilities in a stale or inconsistent way.

Run the full test suite:

```bash
npm test
```

Expected: PASS, same total as after Task 1 (no further test additions in Tasks 2-6, which are prose-only).

- [ ] **Step 8: Version bump**

```bash
git fetch origin main
git log --oneline -5 origin/main -- .claude-plugin/plugin.json
```

If a concurrent bump landed on `origin/main` past `6.23.0` since this branch forked, renumber this bump to the next free version instead of `6.24.0`. Otherwise, bump `.claude-plugin/plugin.json`'s `version` field from `6.23.0` to `6.24.0`.

- [ ] **Step 9: Commit**

```bash
git add skills/init/SKILL.md skills/harness-health/SKILL.md CLAUDE.md CHANGELOG.md .claude-plugin/plugin.json
git commit -m "Bump to 6.24.0 for /init Update Mode's Routine Drift & Relevance Audit"
```

---

## Self-Review Notes

**Spec coverage:** every in-scope item from the design doc has a task — Task 1 (parser helper), Tasks 2-3 (`/routine` bulk-check + non-interactive update), Task 4 (Routine Drift wiring), Task 5 (Routine Relevance file + wiring), Task 6 (cross-references, CHANGELOG, version). The design doc's "out of scope"/"non-goals" items (auto-mode application, renamed-skill auto-resolution, harness-health cadence changes, other-project auditing, `created_at` backfill) have no corresponding task, correctly.

**Placeholder scan:** no TBD/TODO; every step has literal before/after text or literal code, not a description of what to write.

**Type/interface consistency:** `listRoutineRecords(dir)` (Task 1) is consumed by Task 2's STATUS `--all` branch by name, matching its Task 1 signature exactly. Task 4's `AskUserQuestion` batch table matches the exact shape (`Apply all recommended` / `Override specific items` / `Skip entirely`) already established by `update-mode.md`'s existing Auto-Mode-Policy Migration subsection, for consistency across all Phase 1u.5 checks.

**One correction made during self-review:** the design doc's "Mechanism 1" description said `--all` "resolves each one's `template:` field back to a skill directory" without addressing the case where a skill ships more than one template (`tidy`, today). Task 2 Step 2 now spells out the exact filename-suffix-matching algorithm this requires, confirmed not to need `REPO_SLUG` derivation (the design doc's stated constraint) — verified by tracing through a concrete example (`claude-tweaks-tidy-github-triage.yml` ending with `-tidy-github-triage`, matching that variant template's own `routine_name` field) before writing it into the task.
