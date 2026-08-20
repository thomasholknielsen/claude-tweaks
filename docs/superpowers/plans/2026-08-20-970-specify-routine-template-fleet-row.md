# specify routine-template + fleet row Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the headless shaping unit (`/claude-tweaks:specify next`, #967) fireable on a schedule — a new routine template plus its fleet composition row, positioned between the finder window and the grant unit.

**Architecture:** Copy `dispatch/routine-template.yml` verbatim as the starting point (same headless-`next` shape, same schema, same no-op economics), changing only the identity/schedule/notes fields. Insert one new row into `fleet.md`'s composition table between the generalist sweeps (row 8) and the grant unit (row 9), renumbering everything after it by +1. Sweep the whole repo for stale row-number citations. Add one comment to #524. Extend the schema test with a permanent name-based membership assertion.

**Tech Stack:** YAML (routine templates), markdown (fleet.md), `node --test`.

**Spec:** `.claude-tweaks/pipelines/2026-08-20T044958-spec-967-968-969-970/spec-970/work/970-spec.md`

## Global Constraints

- No new Manifesto policy levers — the row rides the existing `autonomy` ceiling like every non-grant fleet row.
- No changes to other rows' schedules or to the grant unit's conditional provisioning logic.
- No #524 kernel restructure — the template follows today's frozen-preamble convention; only a one-line comment names it as a future migration consumer.
- `fleet on` re-run IS the reconcile path — no migration step for existing fleets.
- The template's preamble must match current template conventions byte-for-byte where the schema requires it.
- The composition table in `fleet.md` is the single enumeration of fleet membership (cardinality rule) — the new row goes there and nowhere else.
- `npm test` passes; the schema test's new membership assertion must fail if the template is removed or `findTemplates()`'s scan pattern silently stops matching it (verify once during development).

---

### Task 1: `specify/routine-template.yml` — new template

**Files:**
- Create: `plugin/skills/specify/routine-template.yml`
- Test: `tests/routine-template-schema.test.js` (add the permanent name-based membership assertion)

**Interfaces:**
- Consumes: the routine-template schema (`plugin/bin/lib/routine-template-parser.js`'s `parseRoutineTemplate`) — same schema every other template conforms to. `next-mode.md`'s eligibility predicate text (cited verbatim in `notes:`, not paraphrased): "open records carrying none of `ready`, `needs:definition`, `parked`, `parent-issue`, and `bot:in-progress`".
- Produces: a discoverable `plugin/skills/specify/routine-template.yml` that `tests/routine-template-schema.test.js`'s `findTemplates()` (a directory scan over `plugin/skills/*/routine-template.yml`) picks up automatically, plus one new named test asserting its presence explicitly.

- [ ] **Step 1: Create the template file**

`plugin/skills/dispatch/routine-template.yml`'s current full content (read it fresh before copying — this plan quotes it verbatim as of this plan's authoring, but always diff against the live file first):

```yaml
# Migration note: a Routine created from /claude-tweaks:triage's old template still
# fires "triage dispatch", a skill that no longer exists (grants now live at
# /claude-tweaks:backlog refine). Re-create it via
# `/claude-tweaks:routine create dispatch` (this template) — the old routine keeps
# firing a dead prompt until you replace or delete it at claude.ai/code/routines.
template_version: 9
routine_name: dispatch-weekdays
kickoff: dispatch next
# Optional: `branch: <name>` pins the assembled kernel's target-branch placeholder.
# Normally unset here — a branch is project-specific, so /claude-tweaks:routine resolves
# it at instantiation.
model: claude-sonnet-5
allowed_tools: [Bash, Read, Edit, Write, Grep, Glob, Task]
mcp_connections: []
default_schedule:
  cron_expression: "11 */2 * * 1-5"
  description: "..."
notes: >
  ...
```

Write `plugin/skills/specify/routine-template.yml` with:

```yaml
template_version: 1
routine_name: specify-weekdays
kickoff: specify next
# Optional: `branch: <name>` pins the assembled kernel's target-branch placeholder.
# Normally unset here — a branch is project-specific, so /claude-tweaks:routine resolves
# it at instantiation.
model: claude-sonnet-5
allowed_tools: [Bash, Read, Edit, Write, Grep, Glob, Task]
mcp_connections: []
default_schedule:
  cron_expression: "23 */2 * * 1-5"
  description: "every 2 hours on weekdays, UTC — confirm against your local timezone at creation time. Offset from dispatch's 11 */2 cadence to avoid same-minute collisions; the fleet-table cron (0 8 * * 1-5) is a separate, independently-chosen value — see fleet.md's own composition table"
notes: >
  Headless shaping unit: each firing selects exactly one open record carrying none of
  `ready`, `needs:definition`, `parked`, `parent-issue`, and `bot:in-progress` (next-mode.md's
  eligibility predicate — #967), claims it, and shapes it into spec form. A record that
  fails a framing-check guard is routed to `needs:definition` instead (#968) rather than
  shaped — that is a productive, successful outcome for this firing, not a failure. A
  firing with no eligible records is a cheap no-op: no claim, no write, no self-report.
  This routine's own output feeds the grant unit and the dispatch drain downstream — a
  freshly-shaped record still needs a human or the grant unit (#969, provenance-gated) to
  authorize it before dispatch will pick it up.
```

No migration-note preamble comment — this is a brand-new template (`template_version: 1`), unlike `dispatch/routine-template.yml`'s comment which exists only because that file replaced an older `/claude-tweaks:triage` template. Do not copy that comment.

- [ ] **Step 2: Add the permanent name-based membership assertion**

Read `tests/routine-template-schema.test.js`'s current top section (the `findTemplates()` function and the existing `'at least one routine-template.yml exists to validate'` test) before editing — confirm it still matches what this plan quotes, since another commit could have touched it. Add a new test immediately after that existing test:

```javascript
test('specify/routine-template.yml is present in the scanned template set (#970)', () => {
  const templates = findTemplates();
  assert.ok(
    templates.some((p) => p.endsWith(path.join('specify', 'routine-template.yml'))),
    'expected plugin/skills/specify/routine-template.yml to be discovered by findTemplates() — a later glob/enumeration refactor must not silently drop it'
  );
});
```

This is a name-based pin distinct from the existing generic `>= 1` count check — it survives even if every other template were somehow removed, and fails loudly if `findTemplates()`'s directory-scan logic itself changes in a way that stops matching this specific file.

- [ ] **Step 3: Run the schema and parser tests**

Run: `node --test tests/routine-template-schema.test.js tests/routine-template-parser.test.js`
Expected: PASS — the parameterized `for (const templatePath of findTemplates())` loop automatically generates a `specify/routine-template.yml conforms to schema` test case (no code change needed for that part, it's data-driven), plus the new name-based assertion passes.

- [ ] **Step 4: Verify the new test actually discriminates**

Temporarily rename `plugin/skills/specify/routine-template.yml` to `plugin/skills/specify/routine-template.yml.bak`, re-run `node --test tests/routine-template-schema.test.js`, confirm the new name-based test fails (and the parameterized per-template test for `specify` disappears from the run, as expected for a data-driven loop). Restore the filename, re-run, confirm green again.

- [ ] **Step 5: Commit**

```bash
git add plugin/skills/specify/routine-template.yml tests/routine-template-schema.test.js
git commit -m "specify: new routine-template.yml for the headless shaping unit (#970)"
```

---

### Task 2: `fleet.md` — new composition row + renumber + stagger rationale

**Files:**
- Modify: `plugin/skills/routine/fleet.md` (composition table, stagger-rationale paragraph, the illustrative example table's row-9 citation, and any other row-number prose citation in this file)

**Interfaces:**
- Consumes: Task 1's `plugin/skills/specify/routine-template.yml` (as the new row's `Source template` column value).
- Produces: the fleet's row numbering shifts — grant unit 9→10, dispatch 10→11, tidy 11→12 — which Task 3's repo-wide sweep must account for everywhere else these numbers are cited.

- [ ] **Step 1: Insert the new row and renumber**

Read the current composition table (`fleet.md`'s `## Fleet composition table` section) directly before editing — this plan quotes it as of authoring time, but confirm line numbers/exact text first. Current table:

```
| # | Bucket | Entry | Source template | `focus` override | Cron (UTC) | PREFIXED_NAME |
|---|---|---|---|---|---|---|
| 1 | Vertical finder | dead-code | `skills/code-health/routine-template.yml` | `dead-code` | `0 5 * * *` | `{REPO_SLUG}-code-health-dead-code` |
| 2 | Vertical finder | test-hygiene | `skills/code-health/routine-template.yml` | `test-hygiene` | `15 5 * * *` | `{REPO_SLUG}-code-health-test-hygiene` |
| 3 | Vertical finder | abstraction-police | `skills/code-health/routine-template.yml` | `abstraction-police` | `30 5 * * *` | `{REPO_SLUG}-code-health-abstraction-police` |
| 4 | Vertical finder | experiment-cleanup | `skills/code-health/routine-template.yml` | `experiment-cleanup` | `45 5 * * *` | `{REPO_SLUG}-code-health-experiment-cleanup` |
| 5 | Generalist sweep | code-health (generalist) | `skills/code-health/routine-template.yml` | none | `0 6 * * *` | `{REPO_SLUG}-code-health-daily` |
| 6 | Generalist sweep | docs-health | `skills/docs-health/routine-template.yml` | n/a | `15 6 * * *` | `{REPO_SLUG}-docs-health-daily` |
| 7 | Generalist sweep | journey-health | `skills/journey-health/routine-template.yml` | n/a | `30 6 * * *` | `{REPO_SLUG}-journey-health-daily` |
| 8 | Generalist sweep | harness-health | `skills/harness-health/routine-template.yml` | n/a | `45 6 * * *` | `{REPO_SLUG}-harness-health-daily` |
| 9 | Grant unit (conditional) | backlog grant | `skills/backlog/routine-template.yml` | n/a | `0 9 * * 1-5` | `{REPO_SLUG}-backlog-grant-weekdays` |
| 10 | Dispatch drain | dispatch | `skills/dispatch/routine-template.yml` | n/a | `0 10 * * 1-5` | `{REPO_SLUG}-dispatch-weekdays` |
| 11 | Tidy | tidy weekly | `skills/tidy/routine-template.yml` | n/a | `0 11 * * 0` | `{REPO_SLUG}-tidy-weekly` |
```

Replace rows 9-11 (leave rows 1-8 untouched) with:

```
| 9 | Shaping unit | specify | `skills/specify/routine-template.yml` | n/a | `0 8 * * 1-5` | `{REPO_SLUG}-specify-weekdays` |
| 10 | Grant unit (conditional) | backlog grant | `skills/backlog/routine-template.yml` | n/a | `0 9 * * 1-5` | `{REPO_SLUG}-backlog-grant-weekdays` |
| 11 | Dispatch drain | dispatch | `skills/dispatch/routine-template.yml` | n/a | `0 10 * * 1-5` | `{REPO_SLUG}-dispatch-weekdays` |
| 12 | Tidy | tidy weekly | `skills/tidy/routine-template.yml` | n/a | `0 11 * * 0` | `{REPO_SLUG}-tidy-weekly` |
```

- [ ] **Step 2: Extend the stagger-rationale paragraph**

The existing paragraph (immediately after the table) reads:

```
**Stagger rationale (the exact defaults, settled here — not implementer-invented at some later point, per the parent record's Acceptance Criteria):** rows 1-8 (vertical finders + generalist sweeps) sit in the 05:00-07:00 UTC early-morning window at 15-minute offsets — cheap, read-only sweeps that don't compete with each other for the same repo state. Row 9 (grant unit) sits at 09:00, after the finders have had time to file anything new but before the dispatch drain would otherwise claim records nobody has reviewed. Row 10 (dispatch drain) sits at 10:00, after the grant unit so freshly-granted `auto:build`/`auto:merge` records are visible to it the same morning. Row 11 (tidy) is weekly, Sunday 11:00, clear of every daily/weekday row above.
```

Replace with:

```
**Stagger rationale (the exact defaults, settled here — not implementer-invented at some later point, per the parent record's Acceptance Criteria):** rows 1-8 (vertical finders + generalist sweeps) sit in the 05:00-07:00 UTC early-morning window at 15-minute offsets — cheap, read-only sweeps that don't compete with each other for the same repo state. Row 9 (shaping unit) sits at 08:00, after the finder window so overnight-filed records are visible to the firing, and before the grant unit so the one record each firing shapes is grantable the same morning. Row 10 (grant unit) sits at 09:00, after the shaping unit has had a chance to turn a record into `ready` but before the dispatch drain would otherwise claim records nobody has reviewed. Row 11 (dispatch drain) sits at 10:00, after the grant unit so freshly-granted `auto:build`/`auto:merge` records are visible to it the same morning. Row 12 (tidy) is weekly, Sunday 11:00, clear of every daily/weekday row above.
```

- [ ] **Step 3: Fix the illustrative example table's row-9 citation**

`fleet.md`'s `### Routines` example block (inside the fenced report-template near the Manifesto/summary rendering section) currently has:

```
| 9 | backlog grant | Withheld — set autonomy: unattended + grant-origination-enabled: true to enable | — | — |
```

Change `9` to `10` (the grant unit's new row number) — do not change any other cell in that row. Grep the same file for every other bare "row 9"/"9" reference tied to the grant unit (e.g. the `autonomy` lever's Meaning column, the conditional-provisioning section's prose) and update each to the new number; leave any reference to rows 1-8 untouched.

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS except the 3 known pre-existing baseline failures — a markdown-only change touches no test directly, but confirm nothing in `tests/` asserts on `fleet.md`'s literal row numbers in a way this edit could have broken (a docs-scan test, if one exists, would need the exact new numbers too).

- [ ] **Step 5: Commit**

```bash
git add plugin/skills/routine/fleet.md
git commit -m "fleet.md: insert row 9 (shaping unit) between finders and grant unit, renumber 9-11 to 10-12 (#970)"
```

---

### Task 3: Repo-wide renumbering sweep

**Files:**
- Modify: any file the sweep finds with a stale row-number citation (unknown until the sweep runs — this task's own first step determines its own file list).

**Interfaces:**
- Consumes: Task 2's new row numbering (grant unit now row 10, dispatch row 11, tidy row 12).
- Produces: either zero further edits (sweep reports clean) or a list of fixed files — either way, an explicit statement in the commit/report, never a silent "nothing to do."

- [ ] **Step 1: Run both sweep patterns exactly as the spec's Deliverable 3 names them**

```bash
grep -rnE "row (9|10|11|12)" plugin/ docs/ tests/
grep -nE "^\| (9|10|11) \|" plugin/skills/routine/fleet.md
```

The second pattern re-checks `fleet.md` itself for any bare-numeral table cell Task 2 didn't already catch (Task 2's own edits should already have handled the composition table and the one illustrative example row, but this is the independent verification pass the spec's own AC 3 requires — run it fresh, don't assume Task 2 got everything).

- [ ] **Step 2: Triage every hit**

For each hit from the first grep: read the surrounding context. A hit is **stale** if it refers to the grant unit, dispatch, or tidy by their OLD row number (9, 10, or 11 respectively) after Task 2's renumber — fix it to the new number (10, 11, 12). A hit is **not stale** if it refers to rows 1-8 (unaffected by this renumber), or is inside this plan file itself, or inside the spec/materialized-header files for #970 (which correctly describe the change in terms of old→new numbers as history, not as current fleet state — do not "fix" those). A hit inside a git-log/CHANGELOG entry describing a past state is also not stale — never rewrite history.

For each hit from the second grep: this is a `fleet.md`-only pattern; every legitimate hit should already have been fixed by Task 2. If this pattern still returns anything, it's exactly the case AC 3 exists to catch — fix it.

- [ ] **Step 3: Report the sweep's actual result explicitly**

If both greps return zero hits needing a fix (either no hits at all, or every hit triaged as not-stale in Step 2): state this explicitly in the task report — "renumbering sweep run, N total hits found, 0 required fixing, reasons: {brief list}." Do not silently skip reporting just because there was nothing to fix — the spec's AC 3 requires the sweep be *reported*, empty or not.

If any hits required fixing: apply the fixes, then re-run both grep commands once more to confirm zero remaining stale hits.

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS except the 3 known pre-existing baseline failures.

- [ ] **Step 5: Commit** (only if Step 2 found and fixed anything; if the sweep was clean, skip this commit and note that in the task report instead)

```bash
git add -A
git commit -m "Renumbering sweep: fix stale row-9/10/11 citations after fleet.md's row 9 insertion (#970)"
```

---

### Task 4: #524 migration-consumer comment

**Files:**
- None in this repo — this task posts a GitHub comment on issue #524, no local file changes.

**Interfaces:**
- Consumes: Task 1's confirmation that `specify/routine-template.yml` exists and conforms to the current (pre-#524) template schema.
- Produces: nothing consumed by any other task — this is a standalone, informational GitHub comment.

- [ ] **Step 1: Post the comment**

```bash
gh issue comment 524 --body "\`plugin/skills/specify/routine-template.yml\` (#970) is the eighth template following today's frozen-preamble convention (backlog, dispatch, tidy, code-health, docs-health, journey-health, harness-health, specify) — one more migration consumer for this restructure, no action needed until #524 itself is scoped."
```

Verify #524 is still open before posting (`gh issue view 524 --json state`) — if it's since closed, note that in the task report and post the comment anyway (a closed issue can still receive an informational comment; this is not a reopen).

- [ ] **Step 2: Verify the comment landed**

```bash
gh issue view 524 --json comments -q '.comments[-1].body'
```

Confirm the output matches what was posted.

- [ ] **Step 3: No commit needed** — this task makes no local file changes. Note the comment URL in the task report instead.
