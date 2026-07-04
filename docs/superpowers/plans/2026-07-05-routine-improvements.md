# Routine Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close out six follow-on improvements to the already-shipped `/claude-tweaks:routine` mechanism (v5.2.0), approved in the Addendum to `docs/superpowers/specs/2026-07-04-routine-template-design.md`.

**Architecture:** No new subsystem — this plan extends the existing template/instantiated-record split. It adds real automated test coverage (Task 1), a second consumer skill (Task 2), a naming-collision fix (Task 3), a real gitignore bug fix plus a small caching improvement (Task 4), richer drift detection (Task 5), and a new `/claude-tweaks:init` integration point (Task 6), then bumps the plugin version (Task 7).

**Tech Stack:** Markdown skill files (`SKILL.md`, sub-files), YAML template/record files, `node --test` (zero runtime/dev dependencies).

## Global Constraints

- `RemoteTrigger` has no delete action. The mandatory pre-call review gate (CREATE/UPDATE) must never be weakened or bypassed by any change in this plan.
- Never write new state to `~/.claude-tweaks/` (harness-owned, per this plugin's own Don'ts). All new state introduced here is project-scoped under the current project's `.claude-tweaks/`.
- No new npm runtime or dev dependencies. `package.json` currently declares zero deps of either kind — Task 1's YAML handling must be hand-rolled, scoped to the known bounded shape of `routine-template.yml` files (flat scalars, one nested map, two arrays, one folded scalar), not a general-purpose parser.
- Templates remain portable and account-agnostic: no `environment_id`, repo URL, or account identifier is ever baked into a `routine-template.yml`. The new environment cache (Task 4) lives in a project-local gitignored file, never in the template or the instantiated record.
- The bidirectional Relationship-table convention applies to every new cross-reference added in this plan — if skill A's table gets a row for skill B, skill B's table gets a row for skill A.
- No destructive git operations (branch deletion, force-push, etc.) are in scope for this plan.
- Current baseline: `npm test` passes 387/387 with 0 failures. Every task must leave the suite fully green.

---

### Task 1: Schema-conformance test for `routine-template.yml` files

**Files:**
- Create: `bin/lib/routine-template-parser.js`
- Create: `tests/routine-template-schema.test.js`

**Interfaces:**
- Produces: `parseRoutineTemplate(text: string): object` — exported from `bin/lib/routine-template-parser.js`. Parses the narrow YAML subset used by every `routine-template.yml` (top-level scalars, inline flow arrays like `[a, b, c]`, one level of nested map like `default_schedule:`, and a folded block scalar `key: >`). Returns a plain object; `template_version` is coerced to a `number`, everything else parses as `string` or `array`. This is intentionally not a general YAML parser — Tasks 2-6 do not touch this file.
- The test dynamically globs every `skills/*/routine-template.yml` that exists at run time — Task 2 adds `skills/tidy/routine-template.yml` and requires zero changes to this test file.

- [ ] **Step 1: Write the failing test**

Create `tests/routine-template-schema.test.js`:

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseRoutineTemplate } = require('../bin/lib/routine-template-parser.js');

const SKILLS_DIR = path.join(__dirname, '..', 'skills');
const CRON_RE = /^\S+\s+\S+\s+\S+\s+\S+\s+\S+$/;
const FORBIDDEN_KEYS = ['environment_id', 'repo_url', 'account', 'credentials', 'connector_uuid', 'url'];

function findTemplates() {
  return fs
    .readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(SKILLS_DIR, d.name, 'routine-template.yml'))
    .filter((p) => fs.existsSync(p));
}

test('at least one routine-template.yml exists to validate', () => {
  const templates = findTemplates();
  assert.ok(templates.length >= 1, 'expected at least skills/recon/routine-template.yml to exist');
});

for (const templatePath of findTemplates()) {
  const skillName = path.basename(path.dirname(templatePath));

  test(`${skillName}/routine-template.yml conforms to schema`, () => {
    const text = fs.readFileSync(templatePath, 'utf8');
    const tpl = parseRoutineTemplate(text);

    assert.equal(typeof tpl.template_version, 'number');
    assert.ok(
      Number.isInteger(tpl.template_version) && tpl.template_version >= 1,
      'template_version must be a positive integer'
    );

    assert.equal(typeof tpl.routine_name, 'string');
    assert.match(
      tpl.routine_name,
      /^[a-z0-9]+(-[a-z0-9]+)*$/,
      'routine_name must be a lowercase hyphenated slug (it becomes both a live routine name and a filename)'
    );

    assert.equal(typeof tpl.prompt, 'string');
    assert.ok(tpl.prompt.startsWith('/'), 'prompt must be a self-contained slash-command string');

    assert.equal(typeof tpl.model, 'string');
    assert.ok(tpl.model.length > 0, 'model must be non-empty');

    assert.ok(Array.isArray(tpl.allowed_tools), 'allowed_tools must be an array');
    assert.ok(tpl.allowed_tools.length > 0, 'allowed_tools must not be empty');
    for (const t of tpl.allowed_tools) {
      assert.equal(typeof t, 'string');
      assert.ok(t.length > 0);
    }

    assert.ok(Array.isArray(tpl.mcp_connections), 'mcp_connections must be an array (may be empty)');

    assert.ok(
      tpl.default_schedule && typeof tpl.default_schedule === 'object',
      'default_schedule must be a nested map'
    );
    assert.equal(typeof tpl.default_schedule.cron_expression, 'string');
    assert.match(tpl.default_schedule.cron_expression, CRON_RE, 'cron_expression must be a 5-field cron string');
    assert.equal(typeof tpl.default_schedule.description, 'string');
    assert.ok(tpl.default_schedule.description.length > 0, 'default_schedule.description must be non-empty');

    for (const forbidden of FORBIDDEN_KEYS) {
      assert.equal(tpl[forbidden], undefined, `template must never contain account-specific field "${forbidden}"`);
      if (tpl.default_schedule) {
        assert.equal(
          tpl.default_schedule[forbidden],
          undefined,
          `default_schedule must never contain account-specific field "${forbidden}"`
        );
      }
    }
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/routine-template-schema.test.js`
Expected: FAIL — `Cannot find module '../bin/lib/routine-template-parser.js'`

- [ ] **Step 3: Write the parser implementation**

Create `bin/lib/routine-template-parser.js`:

```js
'use strict';

function stripQuotes(s) {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

function coerceScalar(raw) {
  const v = stripQuotes(raw);
  return /^-?\d+$/.test(v) ? Number(v) : v;
}

function parseInlineArray(s) {
  const inner = s.trim().replace(/^\[/, '').replace(/\]$/, '');
  if (inner.trim() === '') return [];
  return inner.split(',').map((item) => stripQuotes(item.trim()));
}

function indentOf(line) {
  return line.match(/^(\s*)/)[1].length;
}

// Parses the narrow YAML subset every routine-template.yml uses: top-level
// scalars, inline flow arrays, one level of nested map, and a single folded
// block scalar (`>`). Not a general-purpose YAML parser by design — see
// Global Constraints in docs/superpowers/plans/2026-07-05-routine-improvements.md.
function parseRoutineTemplate(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const result = {};
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') {
      i++;
      continue;
    }
    if (indentOf(line) !== 0) {
      i++;
      continue;
    }

    const m = line.match(/^([A-Za-z_][A-Za-z0-9_.]*):\s*(.*)$/);
    if (!m) {
      i++;
      continue;
    }
    const key = m[1];
    const rest = m[2].trim();

    if (rest === '') {
      const nested = {};
      let j = i + 1;
      let sawNested = false;
      while (j < lines.length) {
        const nl = lines[j];
        if (nl.trim() === '') {
          j++;
          continue;
        }
        if (indentOf(nl) === 0) break;
        sawNested = true;
        const nm = nl.match(/^\s*([A-Za-z_][A-Za-z0-9_.]*):\s*(.*)$/);
        if (nm) nested[nm[1]] = coerceScalar(nm[2]);
        j++;
      }
      result[key] = sawNested ? nested : '';
      i = j;
    } else if (rest === '>') {
      let j = i + 1;
      const parts = [];
      while (j < lines.length) {
        const nl = lines[j];
        if (nl.trim() === '') {
          j++;
          continue;
        }
        if (indentOf(nl) === 0) break;
        parts.push(nl.trim());
        j++;
      }
      result[key] = parts.join(' ');
      i = j;
    } else if (rest.startsWith('[')) {
      result[key] = parseInlineArray(rest);
      i++;
    } else {
      result[key] = coerceScalar(rest);
      i++;
    }
  }

  return result;
}

module.exports = { parseRoutineTemplate };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/routine-template-schema.test.js`
Expected: PASS — 2 tests (`at least one routine-template.yml exists to validate` + `recon/routine-template.yml conforms to schema`), 0 failures.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: 0 failures (387 pre-existing + 2 new = 389 passing).

- [ ] **Step 6: Commit**

```bash
git add bin/lib/routine-template-parser.js tests/routine-template-schema.test.js
git commit -m "Add automated schema-conformance test for routine-template.yml files"
```

---

### Task 2: `/claude-tweaks:tidy` becomes the second routine-template consumer

**Files:**
- Create: `skills/tidy/routine-template.yml`
- Modify: `skills/tidy/SKILL.md` (insert new `## Routine Configuration` section after Step 7.5, before `## Next Actions`; add one row to `## Relationship to Other Skills`)

**Interfaces:**
- Consumes: the schema documented in `skills/_shared/routine-template-schema.md` (unchanged by this task).
- Produces: a second `routine-template.yml` that Task 1's dynamic test glob will validate on its next run.

- [ ] **Step 1: Create the template**

Create `skills/tidy/routine-template.yml`:

```yaml
template_version: 1
routine_name: tidy-weekly
prompt: "/claude-tweaks:tidy"
model: claude-sonnet-5
allowed_tools: [Bash, Read, Grep, Glob, Edit, Write]
mcp_connections: []
default_schedule:
  cron_expression: "0 4 * * 0"
  description: "off-peak anchor, UTC, weekly on Sunday — confirm against your local timezone at creation time"
notes: >
  Tidy already has first-class standalone-auto support: Step 6's aggressiveness
  routing (conservative by default) stages judgment-requiring items to
  decisions.md rather than blocking on interactive input, and auto-applies only
  the safe, atomic actions (stale deletes, clean merges). No new mechanism is
  needed for unattended execution — see skills/tidy/SKILL.md's "Standalone auto"
  fallback and its own Routine Configuration section for tuning guidance.
```

`allowed_tools` includes `Edit, Write` (unlike recon's read-only allowlist) because tidy writes to `specs/DEFERRED.md`, `specs/INDEX.md`, and removes/updates INBOX entries — recon never edits code, tidy does edit backlog files.

- [ ] **Step 2: Add the Routine Configuration section to tidy's SKILL.md**

Read `skills/tidy/SKILL.md` and find the text immediately after `## Step 7.5: Verify Execution` (ending with "Commit with a message summarizing the tidy-up.") and immediately before `## Next Actions`. Insert this new section between them:

```markdown
## Routine Configuration

`/tidy` ships a routine template (`skills/tidy/routine-template.yml`) for unattended backlog hygiene. Instantiate it for the current project with:

```
/claude-tweaks:routine create tidy
```

This resolves the account- and project-specific values a portable template can't hardcode (which environment, which repo) and creates a live cloud Routine via `RemoteTrigger` directly — see `skills/routine/SKILL.md` for the full mechanism. Add `--dry-run` to inspect the assembled configuration before anything is created.

**Unattended execution:** a scheduled firing runs Steps 1-7.5 exactly as an interactive invocation would, except Step 6's Standalone auto fallback takes over in place of the interactive batch-approval prompt — safe, atomic actions (stale deletes, clean merges) auto-apply per the `conservative` aggressiveness default, and everything requiring judgment is staged to that run's `decisions.md` rather than blocking on input that will never arrive. Nothing is invented here for routines specifically — this is the same Standalone auto path `/tidy` already uses whenever it runs outside a parent pipeline.

> **Billing note:** Routines run inside the subscription; verify automation-credit specifics against the live account.
```

- [ ] **Step 3: Add the Relationship table row**

In `skills/tidy/SKILL.md`'s `## Relationship to Other Skills` table, add this row (position doesn't matter — append before the final `_shared/subagent-output-contract.md` row):

```markdown
| `/claude-tweaks:routine` | `/routine create tidy` instantiates tidy's `routine-template.yml` into a live, scheduled cloud Routine — the mechanism behind this skill's own "Routine Configuration" section. |
```

- [ ] **Step 4: Verify**

Run: `node --test tests/routine-template-schema.test.js`
Expected: PASS — 3 tests now (existence check + recon + tidy), 0 failures.

```bash
grep -n "Routine Configuration" skills/tidy/SKILL.md
grep -n "claude-tweaks:routine" skills/tidy/SKILL.md
```

Expected: both greps return at least one match.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: 0 failures.

- [ ] **Step 6: Commit**

```bash
git add skills/tidy/routine-template.yml skills/tidy/SKILL.md
git commit -m "Make /claude-tweaks:tidy the second routine-template consumer"
```

---

### Task 3: Routine names prefixed by project

**Files:**
- Modify: `skills/routine/SKILL.md` (replace the entire `### CREATE`, `### UPDATE`, and `### STATUS` sections)
- Modify: `skills/_shared/routine-template-schema.md` (update the `routine_name` field row)

**Interfaces:**
- Produces: `PREFIXED_NAME` — a workflow-local value (repo-name slug + `-` + `template.routine_name`, e.g. `claude-tweaks-recon-daily`), used everywhere CREATE/UPDATE/STATUS previously used the template's bare `routine_name` for the live routine's `name` field and the instantiated record's filename. Tasks 4 and 5 build on the step numbering this task establishes — read this task's final CREATE/UPDATE/STATUS text before starting either.

- [ ] **Step 1: Replace the CREATE section**

In `skills/routine/SKILL.md`, replace the entire section starting at `### CREATE \`<skill>\`` and ending immediately before `### UPDATE \`<skill>\`` with:

```markdown
### CREATE `<skill>`

**Step 1 — Load the template.** Read `${CLAUDE_PLUGIN_ROOT}/skills/{skill}/routine-template.yml`. If it doesn't exist, stop: "`{skill}` has no routine-template.yml — it doesn't support routines yet." The field schema is documented once in `skills/_shared/routine-template-schema.md` — read it if any field's meaning is unclear.

**Step 2 — Resolve the repo URL and derive the project-prefixed name.**

```bash
git remote get-url origin
```

Normalize to full HTTPS the same way `/schedule` does: accept `org/repo`, `git@github.com:org/repo.git`, or `https://github.com/org/repo` and produce `https://github.com/{org}/{repo}` (strip any `.git` suffix, convert the SSH form). If the command fails (no `origin` remote, not a git repo, etc.), stop and ask the user for the repo URL directly instead of proceeding with an empty or invalid value.

Derive `REPO_SLUG` from the resolved URL's `{repo}` segment: lowercase it, replace any run of characters outside `[a-z0-9]` with a single `-`, and trim leading/trailing `-`. Set `PREFIXED_NAME = "{REPO_SLUG}-{template.routine_name}"` (e.g. repo `claude-tweaks` + `routine_name: recon-daily` → `claude-tweaks-recon-daily`). Use `PREFIXED_NAME` everywhere the rest of this workflow refers to the routine's name or the record's filename — never the template's bare `routine_name` alone.

**Step 3 — Idempotency check.** Check whether `.claude-tweaks/routines/{PREFIXED_NAME}.yml` already exists in the current project. If it does, stop this workflow and continue at UPDATE below instead — never create a second routine for the same project+skill.

**Step 4 — Resolve `environment_id`.** Load the tool with `ToolSearch select:RemoteTrigger`, then call `{action: "list"}`. If existing routines are returned, read `job_config.ccr.environment_id` off the most recently created one and offer it as the default (let the user override). If none exist yet, ask the user directly which environment to use — present whatever environment names/IDs are available in context; if none are, ask the user to name one (they can check via `/schedule` once if unsure). Do not cache this value anywhere under `~/.claude-tweaks/` — that path is harness-owned, not skill-owned.

**Step 5 — Resolve the schedule.** Present the template's `default_schedule.cron_expression` (always UTC) and ask the user to confirm it actually lands off-peak in their own timezone, or supply a different cron expression. Use the same UTC-conversion-and-confirm discipline `/schedule` itself uses: state the conversion explicitly ("9am Europe/Copenhagen = 7am UTC, so `0 7 * * *`") before locking it in. Minimum interval is 1 hour — reject anything tighter and ask for a looser schedule.

**Step 6 — Assemble the `RemoteTrigger create` body.**

```json
{
  "name": "<PREFIXED_NAME>",
  "cron_expression": "<resolved cron, UTC>",
  "job_config": {
    "ccr": {
      "environment_id": "<resolved environment_id>",
      "session_context": {
        "model": "<template.model>",
        "sources": [{"git_repository": {"url": "<resolved repo URL>"}}],
        "allowed_tools": <template.allowed_tools, verbatim — this is already an array, e.g. ["Bash", "Read", "Grep", "Glob"], do not add another layer of brackets>
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

**Step 7 — Review gate.** Show the full assembled body before doing anything with it, along with the template's `notes` field (if present) so the user sees any tuning guidance before confirming. This creates live, billed infrastructure with no delete API — always confirm explicitly here, regardless of how automated everything upstream was.

If `--dry-run` was passed: print the assembled body and stop. Do not call `RemoteTrigger`. Do not write an instantiated record.

**Step 8 — Create.** Call `RemoteTrigger {action: "create", body: <assembled body>}`. Read the routine/trigger ID and the claude.ai routine URL from the response (the tool appends a summary line with both).

**Step 9 — Write the instantiated record.** Write `.claude-tweaks/routines/{PREFIXED_NAME}.yml`:

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

- [ ] **Step 2: Replace the UPDATE section**

Replace the entire section starting at `### UPDATE \`<skill>\`` and ending immediately before `### STATUS \`<skill>\`` with:

```markdown
### UPDATE `<skill>`

**Step 1.** Load the template at `${CLAUDE_PLUGIN_ROOT}/skills/{skill}/routine-template.yml` (if missing, stop with the same message as CREATE Step 1). Resolve the repo URL and derive `PREFIXED_NAME` the same way as CREATE Step 2. Require an existing `.claude-tweaks/routines/{PREFIXED_NAME}.yml` for the current project (routed here automatically from CREATE's idempotency check, or invoked directly). If none exists, tell the user to run `create <skill>` first and stop.

**Step 2.** Compare the template's `template_version` (already read in Step 1) against the instantiated record's `template_version` — if they match and the user hasn't asked to change anything else, report "already in sync" and stop.

**Step 3.** Re-resolve environment and schedule using the same procedure as CREATE's environment-resolution and schedule-resolution steps, but pre-fill each default from the existing record instead of asking from scratch. (Repo URL and `PREFIXED_NAME` were already resolved in Step 1 — do not re-derive them.)

**Step 4.** Assemble the body the same way as CREATE's body-assembly step, then show a diff between the recorded config (schedule, template version, resolved values) and the freshly assembled one. If nothing changed, report that and stop.

**Step 5.** Review gate — same standard as CREATE's review gate: show the diff, confirm explicitly before acting.

If `--dry-run` was passed: show the diff and stop. Do not call `RemoteTrigger`. Do not rewrite the instantiated record.

**Step 6.** Call `RemoteTrigger {action: "update", trigger_id: <record.routine_id>, body: <assembled body>}`.

**Step 7.** Rewrite the instantiated record with the resolved schedule, the new `template_version`, and a fresh `created_at` timestamp (this field doubles as "last written at") — preserving `routine_id`, `template`, and `console_url` from the existing record.
```

- [ ] **Step 3: Replace the STATUS section**

Replace the entire section starting at `### STATUS \`<skill>\`` and ending immediately before `## Next Actions` with:

```markdown
### STATUS `<skill>`

**Step 1.** Read the template at `${CLAUDE_PLUGIN_ROOT}/skills/{skill}/routine-template.yml`. Resolve the repo URL and derive `PREFIXED_NAME` the same way as CREATE Step 2, then read `.claude-tweaks/routines/{PREFIXED_NAME}.yml`. If missing, report that no routine has been created for `<skill>` in this project and suggest `create <skill>`. Stop.

**Step 2.** Call `RemoteTrigger {action: "get", trigger_id: <record.routine_id>}` for live state — enabled/disabled, schedule, and any last/next run fields the response carries. If the `get` call fails because the routine no longer exists, report the record as stale and offer to delete `.claude-tweaks/routines/{PREFIXED_NAME}.yml` and re-run `create <skill>`.

**Step 3.** Compare the record's `template_version` against the current template file's (already read in Step 1) `template_version`. If they differ, flag it: "this routine was created from template v{N}; the template is now at v{M} — run `update {skill}` to re-sync."

Report both the live state and the drift check together.
```

- [ ] **Step 4: Update the schema doc's `routine_name` row**

In `skills/_shared/routine-template-schema.md`, replace the `routine_name` row:

```markdown
| `routine_name` | string | yes | Base name used for both the created routine's `name` field and the instantiated record's filename (`.claude-tweaks/routines/{routine_name}.yml`). Not guaranteed unique account-wide — two unrelated routines can share a display name. `routine_id` (not this name) is the actual identity anchor when inspecting live routines. |
```

with:

```markdown
| `routine_name` | string | yes | Base name declared by the template (e.g. `recon-daily`). At creation time, `/claude-tweaks:routine` prefixes this with a slug derived from the project's repo name (e.g. `claude-tweaks-recon-daily`) before using it as the live routine's `name` field and the instantiated record's filename (`.claude-tweaks/routines/{prefixed-name}.yml`) — this prevents the common case of the same skill's routine colliding across every project it's instantiated in. Prefixing narrows but does not eliminate collisions (two projects with the same repo name, or repos under different orgs sharing a name, still collide) — `routine_id` remains the actual identity anchor when inspecting live routines. |
```

- [ ] **Step 5: Verify**

```bash
grep -n "PREFIXED_NAME" skills/routine/SKILL.md
grep -c "PREFIXED_NAME" skills/routine/SKILL.md
```

Expected: `PREFIXED_NAME` appears in CREATE Step 2 (defined), Steps 3/6/9 (used), UPDATE Step 1 (used), and STATUS Step 1 (used) — at least 6 occurrences total.

```bash
grep -n "routine_name" skills/routine/SKILL.md
```

Expected: no remaining references to a bare, unprefixed `{routine_name}` being used as a filename or `name` field anywhere in CREATE/UPDATE/STATUS.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: 0 failures.

- [ ] **Step 7: Commit**

```bash
git add skills/routine/SKILL.md skills/_shared/routine-template-schema.md
git commit -m "Prefix routine names with a repo-derived slug to reduce cross-project collisions"
```

---

### Task 4: Fix the `.claude-tweaks/` gitignore contradiction + add environment-resolution caching

**Files:**
- Modify: `skills/init/bootstrap-steps.md` (Step 0.4's suggested gitignore block)
- Modify: `skills/routine/SKILL.md` (CREATE Step 4 and UPDATE Step 3, as established by Task 3)

**Interfaces:**
- Consumes: the CREATE/UPDATE step structure and `PREFIXED_NAME` established in Task 3 — this task's edits target CREATE Step 4 and the environment-resolution portion of UPDATE Step 3 by name, which Task 3 already established.
- Produces: `.claude-tweaks/routine-environment-cache.yml` (project-local, gitignored, never committed) — a new state file, referenced only within `skills/routine/SKILL.md`.

- [ ] **Step 1: Fix the gitignore suggestion in bootstrap-steps.md**

In `skills/init/bootstrap-steps.md`, find the `## Step 0.4 — .gitignore suggestions (detailed procedure)` section. Replace:

```markdown
```gitignore
# claude-tweaks: transient artifacts
screenshots/
.worktrees/
stories/auth.yml
.claude-tweaks/
```

The `.claude-tweaks/` directory holds per-pipeline run state (`pipelines/{ISO-timestamp}-{spec-slug}/config.yml`, `decisions.md`, `staged/`) plus the statusline cache. None of it should be committed — the auto-decision log is for the user's calibration of project policy, not git history.
```

with:

```markdown
```gitignore
# claude-tweaks: transient artifacts
screenshots/
.worktrees/
stories/auth.yml
.claude-tweaks/pipelines/
.claude-tweaks/research/
.claude-tweaks/routine-environment-cache.yml
```

These entries ignore claude-tweaks' transient, project-local state — pipeline run directories (`pipelines/{ISO-timestamp}-{spec-slug}/config.yml`, `decisions.md`, `staged/`), research report output, and the routine-environment-resolution cache (see `skills/routine/SKILL.md`). Deliberately **not** blanket-ignored: `.claude-tweaks/routines/{name}.yml` (instantiated cloud-Routine records, written by `/claude-tweaks:routine`) — those are explicitly documented as safe, and meant, to commit. A blanket `.claude-tweaks/` line would make that directory permanently uncommittable regardless of user intent, since git cannot reliably re-include a subdirectory of an already-ignored parent via `!` negation. The statusline cache lives under the user's home directory (`~/.claude-tweaks/`), a separate global path — it never needs a project `.gitignore` entry.
```

- [ ] **Step 2: Add environment-resolution caching to CREATE Step 4**

In `skills/routine/SKILL.md`, replace CREATE's Step 4 (established by Task 3):

```markdown
**Step 4 — Resolve `environment_id`.** Load the tool with `ToolSearch select:RemoteTrigger`, then call `{action: "list"}`. If existing routines are returned, read `job_config.ccr.environment_id` off the most recently created one and offer it as the default (let the user override). If none exist yet, ask the user directly which environment to use — present whatever environment names/IDs are available in context; if none are, ask the user to name one (they can check via `/schedule` once if unsure). Do not cache this value anywhere under `~/.claude-tweaks/` — that path is harness-owned, not skill-owned.
```

with:

```markdown
**Step 4 — Resolve `environment_id`.** Check `.claude-tweaks/routine-environment-cache.yml` in the current project first. If it exists and contains an `environment_id` value, offer it as the default (let the user override). Otherwise, load the tool with `ToolSearch select:RemoteTrigger`, then call `{action: "list"}`. If existing routines are returned, read `job_config.ccr.environment_id` off the most recently created one and offer it as the default (let the user override). If none exist yet, ask the user directly which environment to use — present whatever environment names/IDs are available in context; if none are, ask the user to name one (they can check via `/schedule` once if unsure). Do not cache this value anywhere under `~/.claude-tweaks/` — that path is harness-owned, not skill-owned.

After the user confirms an environment (whether sourced from the cache, `list`, or direct input), write it to `.claude-tweaks/routine-environment-cache.yml`:

```yaml
environment_id: "<confirmed environment_id>"
```

This file is project-local and must stay gitignored — it exists purely to spare a second skill in the same project from re-deriving the same environment, never to make the value portable across projects or accounts.
```

- [ ] **Step 3: Wire the cache into UPDATE's re-resolution step**

In `skills/routine/SKILL.md`, in UPDATE's Step 3 (established by Task 3), replace:

```markdown
**Step 3.** Re-resolve environment and schedule using the same procedure as CREATE's environment-resolution and schedule-resolution steps, but pre-fill each default from the existing record instead of asking from scratch. (Repo URL and `PREFIXED_NAME` were already resolved in Step 1 — do not re-derive them.)
```

with:

```markdown
**Step 3.** Re-resolve environment and schedule using the same procedure as CREATE's environment-resolution step (checking `.claude-tweaks/routine-environment-cache.yml` first, per that step) and schedule-resolution step, but pre-fill each default from the existing record instead of asking from scratch. (Repo URL and `PREFIXED_NAME` were already resolved in Step 1 — do not re-derive them.)
```

- [ ] **Step 4: Verify**

```bash
grep -n "routine-environment-cache" skills/init/bootstrap-steps.md skills/routine/SKILL.md
```

Expected: at least 3 matches total (one in the gitignore block, one in CREATE Step 4, one in UPDATE Step 3).

```bash
grep -n "^\.claude-tweaks/$" skills/init/bootstrap-steps.md
```

Expected: no match — the blanket line must be fully gone, not just supplemented.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: 0 failures.

- [ ] **Step 6: Commit**

```bash
git add skills/init/bootstrap-steps.md skills/routine/SKILL.md
git commit -m "Fix .claude-tweaks/ gitignore blocking committable routine records; cache resolved environment_id per project"
```

---

### Task 5: Richer drift detection in STATUS

**Files:**
- Modify: `skills/routine/SKILL.md` (STATUS Step 3, as established by Task 3)

**Interfaces:**
- Consumes: STATUS's step structure from Task 3 (Step 1 loads template + record, Step 2 calls `RemoteTrigger get`, Step 3 compares `template_version`).
- Produces: a new STATUS Step 3.5 for field-level drift, purely additive — does not change Step 1/2's behavior or STATUS's external contract (still one report, still stops the same way on a missing record).

- [ ] **Step 1: Extend STATUS with field-level drift detection**

In `skills/routine/SKILL.md`, in the STATUS section (established by Task 3), replace:

```markdown
**Step 3.** Compare the record's `template_version` against the current template file's (already read in Step 1) `template_version`. If they differ, flag it: "this routine was created from template v{N}; the template is now at v{M} — run `update {skill}` to re-sync."

Report both the live state and the drift check together.
```

with:

```markdown
**Step 3.** Compare the record's `template_version` against the current template file's (already read in Step 1) `template_version`. If they differ, flag it: "this routine was created from template v{N}; the template is now at v{M} — run `update {skill}` to re-sync."

**Step 3.5 — Field-level drift (best-effort).** If Step 2's `get` response includes `job_config.ccr` fields (`cron_expression`, `session_context.model`, `session_context.allowed_tools`, `session_context.sources[].git_repository.url`), diff each against the resolved template + record values: cron against `record.schedule`, model against `template.model`, allowed_tools against `template.allowed_tools` (set comparison, order-independent), repo URL against the project's origin (re-resolve via `git remote get-url origin` if not already available in this invocation). Report any per-field mismatch alongside the version-drift flag from Step 3. If the `get` response does not carry these fields, skip this step and note "field-level drift unavailable — comparing template_version only" instead of assuming a response shape the tool hasn't been confirmed to return.

Report both the live state and the drift check(s) together.
```

- [ ] **Step 2: Verify**

```bash
grep -n "Step 3.5" skills/routine/SKILL.md
grep -n "field-level drift" skills/routine/SKILL.md
```

Expected: both return at least one match, inside the STATUS section.

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: 0 failures.

- [ ] **Step 4: Commit**

```bash
git add skills/routine/SKILL.md
git commit -m "Extend STATUS drift detection to resolved fields, not just template_version"
```

---

### Task 6: `/claude-tweaks:init` facilitates routine installation

**Files:**
- Modify: `skills/init/SKILL.md` (new Phase 0.96 pointer, Actions Performed table row, Relationship table row)
- Modify: `skills/init/bootstrap-steps.md` (new Step 0.96 detailed procedure)
- Modify: `skills/routine/SKILL.md` (new Component-Skill Contract section, new Relationship table rows for `/claude-tweaks:init` and `/claude-tweaks:tidy`)
- Modify: `skills/tidy/SKILL.md` (Relationship table row was already added in Task 2 — no further change here)

**Interfaces:**
- Consumes: the finished CREATE workflow from Tasks 3-5 — this task never reimplements resolution/review-gate logic, it only discovers candidates and invokes `/claude-tweaks:routine create <skill> --source init`.
- Produces: nothing new consumed elsewhere — this is the last task before the version bump.

- [ ] **Step 1: Add the Phase 0.96 pointer to init's SKILL.md**

In `skills/init/SKILL.md`, find `### Step 0.95: Diagram Design (Recommended Companion)` and its paragraph (ending "...Read `bootstrap-steps.md` (Step 0.95) for the full procedure."). Immediately after that paragraph and before the `---` that follows it, insert:

```markdown

### Step 0.96: Routine Installation (Optional Companion)

Always offered (not gated) — detect which claude-tweaks skills ship a `routine-template.yml` without an existing instantiated record for this project, and offer to walk through `/claude-tweaks:routine create <skill> --source init` for each. Idempotent: skills with an existing record are never re-offered. Read `bootstrap-steps.md` (Step 0.96) for the full procedure.
```

- [ ] **Step 2: Add the detailed procedure to bootstrap-steps.md**

At the end of `skills/init/bootstrap-steps.md` (after the `## Step 0.95 — Diagram Design (Recommended Companion)` section's final paragraph), append:

```markdown

---

## Step 0.96 — Routine Installation (detailed procedure)

claude-tweaks skills can ship a `routine-template.yml` (schema: `skills/_shared/routine-template-schema.md`) enabling `/claude-tweaks:routine create <skill>` to instantiate a scheduled cloud Routine for this project — e.g. recon's nightly LLM-as-judge sweep, or tidy's periodic backlog hygiene pass. This step surfaces that option right after bootstrap instead of leaving it to be discovered later.

**Detect candidates:**

```bash
ls "${CLAUDE_PLUGIN_ROOT}"/skills/*/routine-template.yml 2>/dev/null
```

For each match, read its `routine_name` field, then check whether `.claude-tweaks/routines/{routine_name}.yml` already exists in the current project. Only offer skills without an existing record — this makes the step idempotent and safe on every `/init` re-run. If no candidates remain (none shipped, or every candidate already has a record), skip this step silently.

**Present:**

```
{N} claude-tweaks skill(s) support scheduled cloud Routines: {list, e.g. "recon (nightly repo sweep), tidy (periodic backlog hygiene)"}.

Set any of these up now?
1. Yes — walk me through each **(Recommended)**
2. Not now — I'll use `/claude-tweaks:routine create <skill>` later
```

**For option 1:** For each skill the user selects, invoke `/claude-tweaks:routine create <skill> --source init` directly. `/routine`'s own CREATE workflow (template load, repo/name resolution, idempotency check, environment/schedule resolution, review gate, dry-run offer) handles everything end-to-end, including the mandatory explicit confirmation before any live `RemoteTrigger` call. `/init` does not reimplement, shortcut, or pre-answer any part of that workflow — it only discovers candidates and hands off.

**For option 2:** Note the skipped candidates and continue. The same offer reappears on the next `/init` run for any candidate still missing a record.

**Failure handling:** If a `create` invocation fails or the user backs out mid-flow, continue with the remaining selected candidates (or none) rather than aborting the rest of `/init`.
```

- [ ] **Step 3: Add the Actions Performed row**

In `skills/init/SKILL.md`'s `### Actions Performed` table, find the `| Design integration | ... | Phase 0.9 |` row. Immediately after it, insert:

```markdown
| Routines | Instantiated {N} routine(s): `{list}` (or "Offered, none set up") | Phase 0.96 |
```

- [ ] **Step 4: Add the init Relationship table row**

In `skills/init/SKILL.md`'s `## Relationship to Other Skills` table, add:

```markdown
| `/claude-tweaks:routine` | Phase 0.96 discovers claude-tweaks skills shipping a `routine-template.yml` with no existing instantiated record, and offers to invoke `/claude-tweaks:routine create <skill> --source init` for each — pure discovery + handoff. |
```

- [ ] **Step 5: Add the Component-Skill Contract section to routine's SKILL.md**

In `skills/routine/SKILL.md`, find `## Next Actions` and the `## Anti-Patterns` section that follows it. Insert a new section between them:

```markdown
## Component-Skill Contract

When invoked with `--source init` (used by `/claude-tweaks:init`'s Phase 0.96), `/claude-tweaks:routine` is running as a component of `/init`'s bootstrap flow — omit the `## Next Actions` block, since `/init` owns the overall handoff. `/init` does not set `$PIPELINE_RUN_DIR` (it is not a `/flow`-style pipeline orchestrator), so `--source init` is the sole signal for this caller, not merely a fallback for a rare ambiguity — unlike most component-skill contracts in this plugin, `$PIPELINE_RUN_DIR` is not the primary signal here.

Standalone invocation (no `--source` flag) is the common case and renders Next Actions as usual.
```

- [ ] **Step 6: Add routine's Relationship table rows**

In `skills/routine/SKILL.md`'s `## Relationship to Other Skills` table, add both:

```markdown
| `/claude-tweaks:init` | Phase 0.96 discovers skills with a `routine-template.yml` and no existing record, then invokes `/claude-tweaks:routine create <skill> --source init` for each the user selects — pure discovery + handoff, no logic duplicated. |
| `/claude-tweaks:tidy` | Tidy is this skill's second consumer — `skills/tidy/routine-template.yml` relies on tidy's own Standalone-auto support for safe unattended execution. |
```

- [ ] **Step 7: Cross-reference sweep**

```bash
grep -n "Phase 0" README.md skills/help/reference-card.md 2>/dev/null
```

If either file enumerates `/init`'s phases individually (rather than describing `/init` at a high level), add a one-line mention of Phase 0.96 matching that file's existing level of detail. If neither enumerates phases (expected, since 0.9/0.95 also aren't individually listed in either file today), make no change — do not invent detail these files don't already carry for sibling phases.

- [ ] **Step 8: Verify**

```bash
grep -n "0.96" skills/init/SKILL.md skills/init/bootstrap-steps.md
grep -n "Component-Skill Contract" skills/routine/SKILL.md
grep -n "claude-tweaks:init\|claude-tweaks:tidy" skills/routine/SKILL.md
grep -n "claude-tweaks:routine" skills/init/SKILL.md
```

Expected: every grep returns at least one match.

- [ ] **Step 9: Run the full suite**

Run: `npm test`
Expected: 0 failures.

- [ ] **Step 10: Commit**

```bash
git add skills/init/SKILL.md skills/init/bootstrap-steps.md skills/routine/SKILL.md
git commit -m "Add /claude-tweaks:init Phase 0.96 — offer routine installation for candidate skills"
```

---

### Task 7: Version bump

**Files:**
- Modify: `.claude-plugin/plugin.json`

**Interfaces:**
- Consumes: nothing — this is the final task, run only once Tasks 1-6 are complete and reviewed.

- [ ] **Step 1: Bump the version**

In `.claude-plugin/plugin.json`, change:

```json
  "version": "5.2.0",
```

to:

```json
  "version": "5.3.0",
```

- [ ] **Step 2: Verify**

```bash
grep '"version"' .claude-plugin/plugin.json
```

Expected: `"version": "5.3.0",`

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: 0 failures.

- [ ] **Step 4: Commit**

```bash
git add .claude-plugin/plugin.json
git commit -m "Bump version to 5.3.0 — routine-template follow-on improvements"
```
