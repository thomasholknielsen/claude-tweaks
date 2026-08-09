# Routine Model Drift Detection and Stale Statusline Fixtures — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist a routine template's `model` into the instantiated record at create/update time, include it in the significant-field drift diff, document the existing `session_context.model` override, and refresh stale `claude-sonnet-4-6` statusline test fixtures (spec: `#218`, materialized at `.claude-tweaks/pipelines/2026-08-08T163319-spec-216-217-218/spec-218/work/218-spec.md`).

**Architecture:** Two independent halves. (1) Record persistence + drift detection: `create-and-update.md`'s CREATE Step 9 *and* UPDATE Step 7 both gain a `model` field in the instantiated-record write (the record's own premise only named CREATE Step 9 — UPDATE Step 7's rewrite was verified live and does not mention `model` among its resolved/preserved fields, so it would silently drop the key on the very next `update` after CREATE started writing it); `routine-template-schema.md`'s table documents the new field; `SIGNIFICANT_FIELDS` in `routine-template-parser.js` gains `'model'`. (2) Fixture refresh: `tests/statusline.test.js`'s stale `claude-sonnet-4-6` fixtures move to `claude-sonnet-5`/`Sonnet 5`.

**Tech Stack:** Node 18+ built-ins; `node --test`.

## Global Constraints

- Worktree anchor: before every commit, `pwd` and `git rev-parse --show-toplevel` must print `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/model-profile-strategy-design`.
- Commits: `{Verb} {what} — {detail}`, ending `refs #218` (never a closing keyword). Stage named files only; `git diff --cached --name-only` before each commit.
- Not in scope: changing any routine template's actual `model:` value (all six stay `claude-sonnet-5`), adding a `--model` CLI flag, any statusline rendering behavior change (fixtures only), `skills/routine/status.md`'s live-API check (a different, independent comparison over a different object pair).
- **Corrected premise (verified live before this plan, not taken from the record's own text):** the record's Deliverables/Key-Files list `tests/routine-template-parser.test.js` as the home for the two new significant-field-diff tests. Verified false — `compareRoutineRecords` (the function that performs the diff) has zero references in that file; every one of its existing tests lives in `tests/routine-record-freshness.test.js`, confirmed by grep. `routine-template-parser.test.js` covers only `parseRoutineTemplate` and `listRoutineRecords`, unrelated concerns. The two new tests go in `tests/routine-record-freshness.test.js`.
- **Corrected premise:** `tests/statusline.test.js`'s stale fixtures are NOT just "~140-148, ~500" as the record estimated — verified live: 10 lines carry `claude-sonnet-4-6` or `Sonnet 4.6` (140, 144, 148, 500, 505, 513, 518, 525, 539, 567). All 10 are in scope.
- IL-105: every new discriminating assertion demonstrated red before shipping. IL-62: expected values derived independently, not from the implementation (statusline fixture rewrites keep `renderModel`'s two precedence branches — `display_name` present vs. absent — exercised, per the record's own Gotcha).

---

### Task 1: Persist `model` into the instantiated record (CREATE + UPDATE)

**Files:**
- Modify: `skills/routine/create-and-update.md` (CREATE Step 9's YAML block, ~line 127-137; UPDATE Step 7's prose, ~line 185)
- Modify: `skills/_shared/routine-template-schema.md` (Instantiated record table, ~line 109-117)

**Interfaces:**
- Consumes: `template.model` (already resolved and available at Step 6's body-assembly time — verified live, `"model": "<template.model>"` already appears in the `RemoteTrigger create` body at line 79; this task only adds it to the *record* write, not the API call, which already carries it).
- Produces: every record CREATE writes carries `model: <template.model>`; every record UPDATE rewrites also carries `model`, resolved fresh from the current template (not merely preserved from the old record — matching how `template_version` is refreshed on update, since a template's model can change between versions and the record should reflect the version it was last synced to, not a stale copy).

- [ ] **Step 1: Edit CREATE Step 9.** In the YAML block (~line 130-136), add a `model: "<template.model>"` line, positioned after `template_version` (grouping template-derived fields together, ahead of the runtime-derived `created_at`/`schedule`/`console_url`/`branch`).
- [ ] **Step 2: Edit UPDATE Step 7.** Its prose currently reads: "Rewrite the instantiated record with the resolved schedule, the resolved `branch` ..., the new `template_version`, and a fresh `created_at` timestamp ... preserving `routine_id`, `template`, and `console_url` from the existing record." Add `model` to the "resolved fresh from the current template" group (alongside `template_version`), not the "preserved" group — the current template's `model` value, not the old record's.
- [ ] **Step 3: Edit `routine-template-schema.md`'s Instantiated record table.** Add a row: `| \`model\` | string | yes | The template's \`model\` value at the time this record was last written (create or update). Compared against the upstream copy to detect drift, same as \`template_version\`. |` — positioned after the `template_version` row, matching Step 1's grouping.
- [ ] **Step 4: Render check (IL-27).** Read both edited files' surrounding context after the edit — confirm the YAML block in CREATE Step 9 still parses as a coherent example (no broken indentation), and the new schema table row renders as a proper table row (matching column count and alignment of its siblings).
- [ ] **Step 5: Commit** `Persist template model into the instantiated routine record on create and update — refs #218` (both files).

### Task 2: `SIGNIFICANT_FIELDS` + drift-detection tests

**Files:**
- Modify: `bin/lib/routine-template-parser.js` (~line 195)
- Modify: `tests/routine-record-freshness.test.js` (the actual home of `compareRoutineRecords` coverage — see Global Constraints' corrected premise)

**Interfaces:**
- Consumes: Task 1's `model` field in written records (this task's tests construct fixture record objects directly — they do not depend on Task 1's prose edits actually running, only on the shape those edits describe).
- Produces: `SIGNIFICANT_FIELDS = ['routine_id', 'template', 'template_version', 'schedule', 'branch', 'model']`; `compareRoutineRecords` reports a `model` difference as a significant field.

- [ ] **Step 1: Write the failing tests** — in `tests/routine-record-freshness.test.js`, following the file's existing style for constructing local/upstream record pairs and calling `compareRoutineRecords({ cwd, branch })` (read 2-3 existing tests in the file first for the exact fixture-construction pattern used there — do not guess the shape). Add:
  1. A test where the local and upstream copies of the instantiated record differ only in `model` (e.g. local `claude-opus-5`, upstream `claude-sonnet-5`) — assert the reported significant-fields list includes `'model'`.
  2. A transition-fixture test: an "old" record with no `model:` key at all (simulating a record written before this rename) compared against a "new" record that has `model: claude-sonnet-5` — assert this is reported as a significant difference (present vs. absent counts as changed), not silently treated as equal and not a crash.
  Run the file — both new assertions fail (no `model` in `SIGNIFICANT_FIELDS` yet, so neither diff is reported).
- [ ] **Step 2: Implement** — add `'model'` to `SIGNIFICANT_FIELDS` in `routine-template-parser.js`.
- [ ] **Step 3: Run** `node --test tests/routine-record-freshness.test.js` → PASS, both new tests green, all pre-existing tests in the file still green.
- [ ] **Step 4: Commit** `Add model to the significant-field routine drift diff, with a create/update transition case — refs #218`.

### Task 3: Document the `session_context.model` override

**Files:**
- Modify: `skills/routine/SKILL.md`

**Interfaces:** prose only, no behavior change.

- [ ] **Step 1: Add one sentence** after the Workflow table's CREATE stub (after line ~62, "Steps 0-9 live in `create-and-update.md` ...; Step 5's own 5a-5d live in `schedule-resolution.md`."), in the same paragraph or as a new short one: state that the live routine's own `session_context.model` is caller-overridable (not fixed to the template's declared model), pointing at `_shared/routine-diagnostic-probe.md`'s existing note (verified live — that file's line 63 already states: "`session_context.model` is also overridable by the caller — the value shown is the default, not a fixed requirement").
- [ ] **Step 2: Render check (IL-27).** Read the edited section to confirm the new sentence reads naturally and doesn't fragment the existing paragraph.
- [ ] **Step 3: Commit** `Document the routine session model override in SKILL.md — refs #218`.

### Task 4: Refresh stale statusline fixtures

**Files:**
- Modify: `tests/statusline.test.js` (lines 140, 144, 148, 500, 505, 513, 518, 525, 539, 567 — verified live count, wider than the record's own "~140-148, ~500" estimate)

**Interfaces:** test-fixture data only — no assertion logic changes, no `renderModel`/statusline source changes.

- [ ] **Step 1: Replace every `claude-sonnet-4-6` id and `Sonnet 4.6` display value** with `claude-sonnet-5` and `Sonnet 5` respectively, at all 10 lines. Preserve each fixture's existing shape exactly — where a fixture supplies only `display_name` (no `id`), keep it that way (just change the value); where a fixture supplies only `id` (no `display_name`), keep it that way too (per the record's Gotcha: `renderModel` prefers `display_name` over `id`, so both precedence branches must stay exercised with the new family's data, not collapse to one shape).
- [ ] **Step 2: Run** `node --test tests/statusline.test.js` → PASS, same test count as before, assertions unchanged in behavior (only the literal strings compared differ).
- [ ] **Step 3: Commit** `Refresh statusline test fixtures from claude-sonnet-4-6 to claude-sonnet-5 — refs #218`.

## Self-Review

1. **Spec coverage:** record persistence at create AND update (T1, AC1 — corrected to cover both write sites, not just CREATE); `SIGNIFICANT_FIELDS` + significant-diff tests including the transition case (T2, AC1/AC2 — corrected test-file location); SKILL.md doc sentence (T3); statusline fixtures (T4, AC3 — corrected line count); `npm test` green (AC4, run centrally after all 4 tasks).
2. **Placeholder scan:** clean.
3. **Type consistency:** `model` is a plain string field throughout — the template's `model` value, the record's `model` key, `SIGNIFICANT_FIELDS`'s new entry — no shape mismatch between what's written and what's compared.
