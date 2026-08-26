# Webhook Trigger Integration for /claude-tweaks:routine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `create_webhook_trigger` integration path to `/claude-tweaks:routine`, parallel to the existing `cron_expression` path, so a routine can also fire on a GitHub event (PR/issue activity matching a filter), and resolve the recorded doc-vs-tool contradiction claim.

**Architecture:** A new `webhook-trigger <skill>` mode in `create-and-update.md`, mirroring PAUSE/RESUME's "resolve an existing record, make one `RemoteTrigger` call" shape rather than CREATE's full environment/schedule ceremony — a webhook trigger *attaches* to an already-created routine (`routine_trigger_id` = the routine's own `routine_id`) rather than creating a new one. The instantiated-record schema gains one new optional array field (`webhook_triggers`) to track attached triggers, read by STATUS/FLEET for reporting. All changes are markdown skill prose plus `node --test` conformance tests that byte-pin the new prose — there is no compiled/runtime code path here (per CLAUDE.md, `plugin/` ships skill files read by an LLM agent at invocation time, not application code).

**Tech Stack:** Markdown skill files (`plugin/skills/routine/*.md`, `plugin/skills/_shared/routine-template-schema.md`), `node --test` conformance tests (`tests/routine-*.test.js`).

**Spec:** `.claude-tweaks/pipelines/2026-08-26T084000-record-1302/work/1302-spec.md` (GitHub record #1302, refs #211)

## Global Constraints

- **Plugin scope:** only `plugin/` ships to users — CLAUDE.md's "The plugin payload is the `plugin/` subtree" rule. `tests/` and `docs/` are maintainer-side but still get updated per repo convention.
- **No runtime code path:** skill `.md` files are natural-language procedures read by an LLM agent at invocation time. "Implementation" here means prose instructing a future agent session how to assemble and call `create_webhook_trigger` — never a compiled integration, and never a fabricated live-call transcript.
- **Fully-qualified skill references:** any skill reference inside actionable instruction text (a Step body) must use `/claude-tweaks:{skill}` — bare `/{skill}` is reserved for descriptive prose (CLAUDE.md Cross-references).
- **Expand-only schema change:** `_shared/routine-template-schema.md`'s instantiated-record schema is a cross-skill contract — add the new `webhook_triggers` field as optional and additive; no existing record (which lacks it) becomes invalid, and no existing reader breaks.
- **Tool availability is unverified in this build session:** `RemoteTrigger` (and hence `create_webhook_trigger`) was confirmed unavailable via `ToolSearch select:RemoteTrigger` in this build's own session — matching two prior 2026-08-23 build attempts, and consistent with the spec's own caution that availability may be session-type-dependent (interactive vs. cloud/routine vs. Task-dispatched). This plan documents `create_webhook_trigger`'s body shape from the tool's own documented description (captured in the spec body) and does not attempt a live call. The build's own handoff/ledger notes this as a **documented dry-run**, not a live-verified integration — a residual verification gap for a future session where the tool is reachable.
- **No in-repo doc contradiction found:** a repo-wide sweep (grep for "web UI only" / "configured from the web") found zero occurrences of the "GitHub triggers are configured from the web UI only" claim anywhere in this repo's shipped docs (`plugin/`, `docs/`, `CLAUDE.md`). The three real "web UI only" hits found are about the unrelated cloud environment Setup-script field (CLAUDE.md:125, `step-14-cloud-routine-parity.md`, `scripts/claude-cloud-setup.sh`) — not GitHub triggers. The claim as described in the spec is attributed to an *external* Anthropic-hosted "public routines documentation" not mirrored in this repo. This plan does not fabricate an edit to a doc that doesn't exist in-repo (Task 5 documents this finding and adds a forward-looking clarification instead).

---

### Task 1: Extend the instantiated-record schema with `webhook_triggers`

**Files:**
- Modify: `plugin/skills/_shared/routine-template-schema.md:105-125` (Instantiated record section)
- Test: `tests/routine-template-schema.test.js` (extend — add new assertions, do not remove existing ones)

**Interfaces:**
- Produces: the `webhook_triggers` field name and its per-entry shape (`webhook_trigger_id`, `events`, `filter`, `created_at`) — Task 2's WEBHOOK-TRIGGER mode writes to this field; Task 4's STATUS/FLEET reporting reads its length/presence.

- [ ] **Step 1: Write the failing test**

Add to `tests/routine-template-schema.test.js` (append a new `test(...)` block near the existing Instantiated-record-focused tests — read the file first to match its existing style: it uses `node:test`'s `test`/`assert` and reads `plugin/skills/_shared/routine-template-schema.md` via `fs.readFileSync`):

```javascript
test('instantiated record schema documents webhook_triggers as an optional field', () => {
  const content = fs.readFileSync(schemaPath, 'utf8');
  assert.match(content, /\|\s*`webhook_triggers`\s*\|\s*array of objects\s*\|\s*no\s*\|/);
  assert.match(content, /webhook_trigger_id/);
  assert.match(content, /RemoteTrigger.*create_webhook_trigger|create_webhook_trigger.*RemoteTrigger/);
});
```

(If the existing file uses different variable names for the file-read path or a different assert style, match those exactly rather than introducing a second convention — read the file's first 30 lines before writing this step for real.)

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/routine-template-schema.test.js`
Expected: FAIL — the new assertions don't match anything yet (the schema file has no `webhook_triggers` row).

- [ ] **Step 3: Add the `webhook_triggers` field to the schema**

In `plugin/skills/_shared/routine-template-schema.md`, add a new row to the Instantiated record table (after the `branch` row, i.e. after line 121 in the current file):

```markdown
| `webhook_triggers` | array of objects | no | GitHub-event triggers attached to this routine via `RemoteTrigger {action: "create_webhook_trigger"}` (`skills/routine/create-and-update.md`'s WEBHOOK-TRIGGER mode). Each entry: `{webhook_trigger_id, events, filter, created_at}` — `webhook_trigger_id` is the trigger ID from the `create_webhook_trigger` response (source of truth for future reference; never re-derive or guess it); `events` is the array of GitHub event names the trigger matches; `filter` is the filter grammar's structured shape as sent on the wire (field/operator/value tuples — stored opaquely, never re-interpreted by this schema); `created_at` is an ISO 8601 UTC timestamp. Absent or empty array means the routine fires on its schedule only. Multiple entries are supported — a routine can have more than one GitHub-event trigger attached. |
```

Then add one sentence directly below the existing "A record is distinguishable as one-off or recurring..." paragraph (around line 123):

```markdown
A record's `webhook_triggers` array is independent of `cadence`/`schedule`/`run_once_at` — a routine can be schedule-only, event-only-in-addition-to-its-schedule, or (after a future pause of its cadence) event-triggered exclusively. This schema does not currently support a schedule-less routine at creation time; `create_webhook_trigger` always attaches to a routine that already has a cadence from CREATE.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/routine-template-schema.test.js`
Expected: PASS — all tests including the new one.

- [ ] **Step 5: Commit**

```bash
git add plugin/skills/_shared/routine-template-schema.md tests/routine-template-schema.test.js
git commit -m "routine: add webhook_triggers field to instantiated-record schema (refs #1302)"
```

---

### Task 2: Add WEBHOOK-TRIGGER mode (own file: webhook-trigger.md)

**[AMENDED post-first-attempt, ruling in progress.md]:** the original plan text below appended the WEBHOOK-TRIGGER section directly into `create-and-update.md`. That file was already at 39.6KB/98.9% of the 40KB lazy-loaded sub-file ceiling (`tests/bin-lib/skill-audit/context-cost.test.js`) on the merge base — appending broke that test (confirmed: 46508 bytes post-append). Ruling: put the whole section in a new standalone file, `plugin/skills/routine/webhook-trigger.md`, instead — mirroring `status.md`/`fleet.md`/`schedule-resolution.md`/`record-freshness.md`, already separate files in this same skill directory. Every `create-and-update.md` reference below (including inside the markdown block being written) targets `webhook-trigger.md` instead; `create-and-update.md` itself is untouched by this task. Task 3 and Task 5, further down, are amended accordingly at their own sections.

**Files:**
- Create: `plugin/skills/routine/webhook-trigger.md` (new file — content is the `## WEBHOOK-TRIGGER` section below, written as this file's own top-level content, not nested under a `##` heading matching a section of a larger file — open with a short one-line description of the file's role the way `status.md`/`fleet.md` do, then the mode body)
- Test: `tests/routine-webhook-trigger.test.js` (new file)

**Interfaces:**
- Consumes: `webhook_triggers` field shape from Task 1; `record.routine_id` (existing field, unchanged) as the `routine_trigger_id` value in the `create_webhook_trigger` body.
- Produces: the `webhook-trigger <skill>` mode name and its `--events`/`--filter`/`--dry-run` argument grammar — Task 3's `SKILL.md` Input/Workflow tables reference this mode name and argument grammar verbatim.

- [ ] **Step 1: Write the failing test**

Create `tests/routine-webhook-trigger.test.js`:

```javascript
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const createAndUpdatePath = path.join(__dirname, '../plugin/skills/routine/create-and-update.md');

test('create-and-update.md documents a WEBHOOK-TRIGGER mode', () => {
  const content = fs.readFileSync(createAndUpdatePath, 'utf8');
  assert.match(content, /## WEBHOOK-TRIGGER `<skill>`/);
});

test('WEBHOOK-TRIGGER mode calls create_webhook_trigger with routine_trigger_id', () => {
  const content = fs.readFileSync(createAndUpdatePath, 'utf8');
  const section = content.slice(content.indexOf('## WEBHOOK-TRIGGER'));
  assert.match(section, /create_webhook_trigger/);
  assert.match(section, /routine_trigger_id/);
  assert.match(section, /record\.routine_id/);
});

test('WEBHOOK-TRIGGER mode exposes the filter grammar generically, not one hardcoded shape', () => {
  const content = fs.readFileSync(createAndUpdatePath, 'utf8');
  const section = content.slice(content.indexOf('## WEBHOOK-TRIGGER'));
  for (const field of ['author', 'title', 'body', 'base_branch', 'head_branch', 'labels', 'is_draft', 'is_merged']) {
    assert.ok(section.includes(field), `filter grammar field "${field}" missing from WEBHOOK-TRIGGER section`);
  }
  for (const op of ['equals', 'contains', 'starts_with', 'is_one_of', 'is_not_one_of', 'matches_regex']) {
    assert.ok(section.includes(op), `filter operator "${op}" missing from WEBHOOK-TRIGGER section`);
  }
});

test('WEBHOOK-TRIGGER mode surfaces both preconditions', () => {
  const content = fs.readFileSync(createAndUpdatePath, 'utf8');
  const section = content.slice(content.indexOf('## WEBHOOK-TRIGGER'));
  assert.match(section, /GitHub App/i);
  assert.match(section, /hourly/i);
  assert.match(section, /dropped, not queued|drop-not-queue|not queued/i);
});

test('WEBHOOK-TRIGGER mode requires an existing routine record', () => {
  const content = fs.readFileSync(createAndUpdatePath, 'utf8');
  const section = content.slice(content.indexOf('## WEBHOOK-TRIGGER'));
  assert.match(section, /create <skill>.*first|run.*create.*first/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/routine-webhook-trigger.test.js`
Expected: FAIL — `create-and-update.md` has no `## WEBHOOK-TRIGGER` section yet.

- [ ] **Step 3: Write the WEBHOOK-TRIGGER section**

Append to `plugin/skills/routine/create-and-update.md`, after the existing `## RESUME \`<skill>\`` section:

```markdown
## WEBHOOK-TRIGGER `<skill>` `--events <e1,e2,...>` [`--filter <field>=<op>:<value>[,<field>=<op>:<value>...]`] [`--dry-run`]

Attaches a GitHub-event trigger to an already-existing routine via `RemoteTrigger {action: "create_webhook_trigger"}` — this does not create a new routine; it makes the routine named `<skill>` in this project also fire whenever a matching GitHub event occurs on this repo, in addition to its existing schedule. Requires the routine to already exist for this project (run `create <skill>` first if it doesn't) — there is no guided-creation fallback here, unlike CREATE, because there is no environment to resolve.

**Step 0 — Worktree check.** Same as CREATE Step 0 — this mode writes the instantiated record (Step 5 below).

**Step 1 — Resolve the record.** Load the template and resolve `PREFIXED_NAME` exactly as CREATE Steps 1-2 do. Then run `record-freshness.md` in this skill's directory (Steps F1-F2) and apply its Step F3 UPDATE disposition, exactly as PAUSE Step 1 does — same stale-checkout stop condition, same "read from the `upstream` authority copy when applicable" rule. Require an existing record for the current project. If none exists on either side, tell the user to run `create <skill>` first and stop.

**Step 2 — Resolve the event list.** If `--events` was passed, use it directly (comma-separated GitHub event names, e.g. `pull_request,issues`). Otherwise ask the user directly which GitHub events should fire this routine — do not guess a default event list, since a wrong default silently over-fires a routine against unrelated activity.

**Step 3 — Resolve the filter.** The filter grammar covers eight fields — `author`, `title`, `body`, `base_branch`, `head_branch`, `labels`, `is_draft`, `is_merged` — each combinable with an operator: `equals`, `contains`, `starts_with`, `is_one_of`, `is_not_one_of`, `matches_regex` (whole-value matching for `matches_regex`, e.g. `.*hotfix.*` not `hotfix`). Expose this generically — never hardcode one filter shape, since future filter fields or operators should not require another change to this step.

If `--filter` was passed, parse it as comma-separated `field=op:value` tokens (e.g. `--filter labels=is_one_of:bug,base_branch=equals:main`) — one condition per token, all conditions combined with AND. If `--filter` was not passed, ask the user directly which (if any) filter conditions to apply, looping one field/operator/value triple at a time until they indicate they're done — an empty filter (no conditions) is valid and means "every event of the listed types fires the routine," which the user must explicitly confirm rather than land on by omission.

**Step 4 — Preview and confirm.** Render the resolved event list, the filter conditions (or "no filter — every matching event fires this routine" if empty), and two precondition notes before any call is made:

- **GitHub App precondition:** "This requires the Claude GitHub App to be installed on this repository — installing it via `/web-setup` grants clone access but does not by itself enable event delivery for webhook triggers. If it isn't installed, this call will fail; install it first at the repository's GitHub App settings."
- **Hourly event cap precondition:** "GitHub-event triggers are subject to an hourly event cap (current as of the research-preview surface) — events beyond the cap for this hour are dropped, not queued. A burst of matching PR/issue activity beyond the cap will not all fire this routine; there is no backfill."

If `--dry-run` was passed: stop here — do not call `RemoteTrigger`, do not rewrite the instantiated record. Print the assembled body (below) instead.

Otherwise, call `AskUserQuestion` with `question`: `"Attach this GitHub-event trigger?"`, `header`: `"Confirm webhook trigger"`, `multiSelect`: `false`, and:
- Option 1 — `label`: `"Yes, attach (Recommended)"`, `description`: `"Proceed with the events and filter shown above"`
- Option 2 — `label`: `"Cancel"`, `description`: `"Do not attach anything"`

**Step 5 — Assemble the body and call.** Build the `create_webhook_trigger` body from Steps 2-3's resolved values and this routine's own identity:

```json
{
  "source": {"repository": "<resolved repo URL, same normalization as CREATE Step 2>"},
  "events": ["<event>", "..."],
  "filter": {"<field>": {"operator": "<op>", "value": "<value>"}, "...": "..."},
  "routine_trigger_id": "<record.routine_id — the routine this trigger attaches to, resolved in Step 1>"
}
```

Call `RemoteTrigger {action: "create_webhook_trigger", body: <assembled body>}`. If the call fails with an error shaped like an app-not-installed rejection (the response names the GitHub App or repository access rather than a validation error in the body), surface a clear, distinct message: `"{skill}: the Claude GitHub App isn't installed on this repository — install it first, then retry."` — do not let this surface as a generic/opaque failure. Any other failure: report the error to the user and stop; do not proceed to Step 6.

**Step 6 — Write the instantiated record.** Append one entry to the record's `webhook_triggers` array (`skills/_shared/routine-template-schema.md`'s Instantiated record schema — create the array if the record doesn't have one yet, never overwrite existing entries):

```yaml
webhook_triggers:
  - webhook_trigger_id: "<the trigger ID from Step 5's create_webhook_trigger response>"
    events: [<Step 2's resolved event list>]
    filter: <Step 3's resolved filter, as sent on the wire>
    created_at: "<current UTC timestamp, ISO 8601>"
```

Report the result to the user, including a note that this attachment was assembled from `create_webhook_trigger`'s documented request shape — if this is the first time this project's build session actually reached a live `RemoteTrigger` call for this action, note that in the handoff so a later reviewer knows this path has now been live-verified (rather than only documented).
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/routine-webhook-trigger.test.js`
Expected: PASS — all 5 tests.

- [ ] **Step 5: Commit**

```bash
git add plugin/skills/routine/create-and-update.md tests/routine-webhook-trigger.test.js
git commit -m "routine: add WEBHOOK-TRIGGER mode calling create_webhook_trigger (refs #1302)"
```

---

### Task 3: Wire the new mode into SKILL.md

**Files:**
- Modify: `plugin/skills/routine/SKILL.md` (Input table, Workflow dispatch table, add a WEBHOOK-TRIGGER stub section, Anti-Patterns table if applicable)
- Test: `tests/routine-webhook-trigger.test.js` (extend from Task 2)

**Interfaces:**
- Consumes: `webhook-trigger <skill>` mode name and `--events`/`--filter`/`--dry-run` argument grammar from Task 2 (must match verbatim).

- [ ] **Step 1: Write the failing test**

Append to `tests/routine-webhook-trigger.test.js`:

```javascript
const skillMdPath = path.join(__dirname, '../plugin/skills/routine/SKILL.md');

test('SKILL.md Input table documents the webhook-trigger mode', () => {
  const content = fs.readFileSync(skillMdPath, 'utf8');
  assert.match(content, /webhook-trigger\s*<skill>/);
});

test('SKILL.md Workflow table routes webhook-trigger to create-and-update.md', () => {
  const content = fs.readFileSync(skillMdPath, 'utf8');
  assert.match(content, /webhook-trigger[\s\S]{0,200}create-and-update\.md/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/routine-webhook-trigger.test.js`
Expected: FAIL on the two new tests — `SKILL.md` doesn't mention `webhook-trigger` yet.

- [ ] **Step 3: Update SKILL.md**

Read `plugin/skills/routine/SKILL.md` in full first (its Input argument table, Workflow dispatch table, and per-mode stub sections around lines 55-99 per the research above). Then:

**[AMENDED post-Task-2, ruling in progress.md]:** `create-and-update.md` was over the 40KB lazy-loaded sub-file ceiling (`tests/bin-lib/skill-audit/context-cost.test.js`) even before Task 2 landed (39.6KB/98.9% on the merge base) — Task 2's fix round relocated the whole `## WEBHOOK-TRIGGER` section to its own new file, `plugin/skills/routine/webhook-trigger.md`, mirroring how `status.md`/`fleet.md`/`schedule-resolution.md`/`record-freshness.md` are already separate lazy-loaded files in this skill directory. Wire to that file instead of `create-and-update.md` below:

1. In the Input argument table, add a row: `| \`webhook-trigger <skill> --events <e1,e2,...> [--filter <field>=<op>:<value>[,...]] [--dry-run]\` | Attach a GitHub-event trigger to an existing routine — see \`/claude-tweaks:routine\`'s WEBHOOK-TRIGGER mode in \`webhook-trigger.md\`. |`
2. In the Workflow dispatch table (the table mapping each mode to its file, e.g. the row `create <skill> → create-and-update.md "CREATE Steps 0-9"`), add: `| \`webhook-trigger <skill>\` | \`webhook-trigger.md\` "WEBHOOK-TRIGGER" |`
3. Add a stub section alongside the existing CREATE/UPDATE/PAUSE/RESUME/STATUS/FLEET stub sections: `### WEBHOOK-TRIGGER\n\nSee \`webhook-trigger.md\`.`
4. If the Anti-Patterns table has a row about hardcoding filter/trigger shapes being wrong, none needed here since Task 2 already documents the generic-exposure requirement in the procedure itself — skip unless an existing row's phrasing is now stale (read it; if none references triggers, no edit needed here).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/routine-webhook-trigger.test.js`
Expected: PASS — all 7 tests (5 from Task 2 + 2 new).

- [ ] **Step 5: Commit**

```bash
git add plugin/skills/routine/SKILL.md tests/routine-webhook-trigger.test.js
git commit -m "routine: wire webhook-trigger mode into SKILL.md Input/Workflow tables (refs #1302)"
```

---

### Task 4: Report webhook triggers in STATUS and FLEET

**Files:**
- Modify: `plugin/skills/routine/status.md` (Step 3.5 or nearby — add a webhook-trigger presence note to the per-record verdict output)
- Modify: `plugin/skills/routine/fleet.md` (fleet status table — add a webhook-trigger count/indicator column or inline note)
- Test: `tests/routine-webhook-trigger.test.js` (extend)

**Interfaces:**
- Consumes: `record.webhook_triggers` array from Task 1's schema field.

- [ ] **Step 1: Write the failing test**

Append to `tests/routine-webhook-trigger.test.js`:

```javascript
const statusMdPath = path.join(__dirname, '../plugin/skills/routine/status.md');
const fleetMdPath = path.join(__dirname, '../plugin/skills/routine/fleet.md');

test('status.md reports webhook_triggers presence in its per-record verdict', () => {
  const content = fs.readFileSync(statusMdPath, 'utf8');
  assert.match(content, /webhook_triggers/);
});

test('fleet.md surfaces webhook_triggers in its fleet status table', () => {
  const content = fs.readFileSync(fleetMdPath, 'utf8');
  assert.match(content, /webhook_triggers/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/routine-webhook-trigger.test.js`
Expected: FAIL on the two new tests.

- [ ] **Step 3: Update status.md and fleet.md**

Read `plugin/skills/routine/status.md` (its Step 3.5 field-level drift/verdict logic) and `plugin/skills/routine/fleet.md` (its fleet status table rendering, e.g. the `| {name} | {record.schedule} | ... | {STATUS verdict} |` row shape) in full first, to match their existing conventions exactly.

In `status.md`, add one sentence near Step 3.5's verdict rendering: "If the record's `webhook_triggers` array is non-empty, append a note to the rendered verdict: `+ {N} GitHub-event trigger(s) attached` — this is informational, never itself a Drifted/OK verdict input; a webhook trigger's own live state is not compared here." (This is deliberately read-only reporting — Task 4 does not add drift detection for webhook triggers, since `create_webhook_trigger` has no documented `get`/comparison shape to detect drift against; that's a residual gap, not silently glossed over — note it as such in the same sentence: "webhook-trigger drift detection is out of scope here — no comparison surface is documented for this action yet.")

In `fleet.md`, add a column (or an inline suffix on the existing name/schedule column, matching whichever the file's existing table style makes cheaper to extend) to the fleet status table: when a record's `webhook_triggers` array is non-empty, render its length, e.g. `code-health-daily (+1 webhook)`. Empty or absent array renders nothing extra — never a literal `(+0 webhook)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/routine-webhook-trigger.test.js`
Expected: PASS — all 9 tests.

- [ ] **Step 5: Commit**

```bash
git add plugin/skills/routine/status.md plugin/skills/routine/fleet.md tests/routine-webhook-trigger.test.js
git commit -m "routine: report attached webhook triggers in status and fleet output (refs #1302)"
```

---

### Task 5: Document the doc-contradiction sweep finding and clarify shipped docs

**[AMENDED post-Task-2]:** target `plugin/skills/routine/webhook-trigger.md` (not `create-and-update.md` — see Task 3's amendment note above for why).

**Files:**
- Modify: `plugin/skills/routine/webhook-trigger.md` (one clarifying sentence in its intro — see Step 3 below)
- Test: `tests/routine-webhook-trigger.test.js` (extend)

**Interfaces:** None — this task is documentation-only, no new field or mode name.

- [ ] **Step 1: Write the failing test**

Append to `tests/routine-webhook-trigger.test.js` (use whatever path variable Task 2's fix round used for `webhook-trigger.md` — read the test file first):

```javascript
test('webhook-trigger.md confirms GitHub event triggers are tool-supported, not web-UI-only', () => {
  const content = fs.readFileSync(webhookTriggerMdPath, 'utf8');
  assert.match(content, /programmatically|via this tool|via `?RemoteTrigger`?/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/routine-webhook-trigger.test.js`
Expected: FAIL — the current `webhook-trigger.md` (from Task 2's fix round) doesn't explicitly state the tool-supported claim in these terms; it demonstrates it procedurally but doesn't say so declaratively.

- [ ] **Step 3: Add the clarifying sentence**

In `plugin/skills/routine/webhook-trigger.md`, immediately after its opening paragraph (added in Task 2), add:

```markdown
GitHub-event triggers are created programmatically via `RemoteTrigger`'s `create_webhook_trigger` action — this repo's own shipped docs make no "web UI only" claim about GitHub triggers (a repo-wide sweep for that phrase turned up nothing on this subject; the closest hits are about the unrelated cloud-environment Setup-script field). If an external Anthropic-hosted doc states otherwise, that claim is stale relative to this tool surface, but correcting an externally-hosted doc is outside this plugin's scope — this section is the authoritative in-repo statement that the capability exists and how to use it.
```

This satisfies the spec's Acceptance Criterion 1 ("the 'web UI only' claim and the tool surface no longer contradict each other in the shipped docs") for this repo's shipped docs specifically — there was no contradiction to resolve here (confirmed by sweep), and this sentence makes the in-repo position explicit and searchable for the next reader who encounters the external claim.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/routine-webhook-trigger.test.js`
Expected: PASS — all 10 tests.

- [ ] **Step 5: Commit**

```bash
git add plugin/skills/routine/create-and-update.md tests/routine-webhook-trigger.test.js
git commit -m "routine: state in-repo doc position on GitHub-event trigger support (refs #1302)"
```

---

### Task 6: Full-suite verification and ledger note for the residual live-verification gap

**Files:** None new — verification-only task, plus one ledger entry.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS — no regressions in any existing suite (`tests/routine-*.test.js` and every other suite `npm test` globs).

- [ ] **Step 2: Run the new suite in isolation once more**

Run: `node --test tests/routine-webhook-trigger.test.js tests/routine-template-schema.test.js`
Expected: PASS.

- [ ] **Step 3: Add a ledger entry for the residual verification gap**

Use `/claude-tweaks:ledger` to add an open item, phase `build/verification`, status `open`:

> `create_webhook_trigger`'s request/response shape in `skills/routine/create-and-update.md`'s WEBHOOK-TRIGGER section and the `webhook_triggers` schema field in `skills/_shared/routine-template-schema.md` are documented from the tool's own description (captured at spec-shaping time, 2026-08-23) — not live-verified in this build session, since `RemoteTrigger` was confirmed unavailable via `ToolSearch select:RemoteTrigger` here (Task-dispatched session). A future session where the tool is reachable should perform a real (or explicitly logged dry-run) `create_webhook_trigger` call against a test routine, confirm the response shape and any app-not-installed error text match what's documented, and update this note.

This item is resolved by the ledger resolve gate later in the pipeline (wrap-up's Phase 3 / flow's Step 5) — do not resolve it here; Task 6 only files it.

- [ ] **Step 4: No commit for this task**

(Verification-only; the ledger entry is written via the ledger tool, not a git commit in this repo.)

---

## Self-Review Notes (already applied above, kept for the record)

1. **Spec coverage:** Deliverable 1 (doc-vs-tool contradiction) → Task 5. Deliverable 2 (document required fields/response shape/app-not-installed behavior) → Task 2 Step 5 + Task 6's ledger note (documented-dry-run framing). Deliverable 3 (WEBHOOK-TRIGGER path in create-and-update.md, generic filter grammar) → Task 2. Deliverable 4 (schema field) → Task 1. Deliverable 5 (surface both preconditions) → Task 2 Step 4. AC1 → Task 5. AC2 → Task 2 (path exists, filter grammar exposed) + Task 6 (documented-dry-run verification framing, not fabricated live-call). AC3 → Task 2 Step 5's app-not-installed error handling. AC4 → Task 2 Step 4's hourly-cap precondition note.
2. **Placeholder scan:** no TBD/TODO; every step shows concrete markdown/code content, not descriptions of content.
3. **Type consistency:** `webhook_trigger_id`/`events`/`filter`/`created_at` field names are identical across Task 1's schema definition, Task 2's write-back step, and Task 4's read-back reporting.
