# Routine-Kickoff Wrapper Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `skills/routine-kickoff/SKILL.md` — the plugin-served firing-lifecycle home every routine kernel will invoke — behaviorally inert (nothing invokes it yet), with a text-pinning test and the three mechanically-required catalog entries.

**Architecture:** Move semantics, not invention: the body items are today's `_shared/routine-template-schema.md` preamble paragraphs relocated (stale-docs guard, plugin-list dump, manual-execution fallback with the dispatch/tidy exclusion, reconcile), minus what stays in the kernel (branch sync, resolution ladder, resolved-build line, self-heal — #529's territory). Load-bearing phrases land verbatim. **Controller ruling baked in:** `tests/skill-catalog-completeness.test.js` mechanically requires every new skill in `docs/skill-graph.md`, `skills/help/reference-card.md`, and `skills/help/context-flow.md`, so the spec's zero-reference inertness check (AC4) is narrowed to behavioral inertness — Task 3 adds those three minimal entries; no kernel, template, or `bin/` code references the skill.

**Tech Stack:** Markdown skill file; `node --test` text-pinning suite.

**Spec:** `.claude-tweaks/pipelines/2026-08-16T062945-spec-276-528-529-530/spec-528/work/528-spec.md` (materialized record #528)

## Global Constraints

- The degraded-sandbox report phrasing is the preamble's own, verbatim: "report the degraded sandbox and stop".
- The exclusion's principle sentence lands verbatim from the preamble: "Dispatch claims queue records and triggers builds and merges, and tidy's standalone-auto mode applies deletions (stale records, merged branches and worktrees) — standing effects beyond a report — and any future routine whose skill claims work or writes beyond report-only surfaces gets the same exclusion."
- Plus the maintenance sentence: the list is hand-maintained — a new work-claiming skill must be added here, and the pinning test covers only the current names.
- Skill references inside actionable instruction text use the fully-qualified `/claude-tweaks:{skill}` form.
- Frontmatter: bare `name: routine-kickoff`; `description` ≤ 260 chars stating machine-invoked; quoted `argument-hint`. Interaction-style directive included verbatim (docs/skill-authoring.md).
- The test must NOT assert that the repo contains zero references to `routine-kickoff`.
- The argument grammar is a shipped contract: whitespace-delimited tokens, first = target skill name (bare directory name), rest pass through verbatim joined by single spaces; no quoting invented.
- Commits: `{Verb} {what} — {detail}`, `refs #528`.

---

### Task 1: `skills/routine-kickoff/SKILL.md`

**Files:**
- Create: `skills/routine-kickoff/SKILL.md`

**Interfaces:**
- Produces: section headings `## Standing constraints`, `## Input`, `## Plugin-root derivation`, `## Steps`, `## Anti-Patterns` — Task 2's pinning test greps this file's literal text.

- [ ] **Step 1: Create the file with exactly this content**

````markdown
---
name: routine-kickoff
description: Machine-invoked by cloud-Routine kernels — the firing-lifecycle home. Runs the stale-docs guard, plugin-list dump, and reconcile, then invokes the target skill. Not user-facing. Keywords - routine kickoff, firing lifecycle, kernel, cloud routine.
argument-hint: "<skill> [args...]"
---
> **Interaction style:** Single decisions → one `AskUserQuestion` call, one option marked Recommended. Multi-item → batch table with recommendations pre-filled, then one `AskUserQuestion` for apply-all/override. Never more than one call per decision; resolve each before the next. Terminal `## Next Actions` → plain markdown: paste-ready fully-qualified commands, recommended first and bold, one per line — `AskUserQuestion` there only for a documented machine-consumed decision, named inline.

# Routine Kickoff — Firing-Lifecycle Home

Machine-invoked wrapper every routine kernel invokes as `Then: /claude-tweaks:routine-kickoff {skill} [args]`. Everything a cloud-Routine firing does before and around its target skill lives here and updates with each plugin release, instead of being frozen into every live routine's prompt at creation time. Humans never invoke this directly — they run the target skill itself.

## Standing constraints

- **Blast radius.** Edits to this file reach every project's next routine firing with no per-routine pin; the only rollback is a fix release. The argument grammar below is a shipped contract under expand-contract discipline — additive changes are fine, breaking changes need a kernel migration — while body behavior is otherwise free to evolve.
- **Standalone followability.** The kernel's frozen-catalog fallback reads this file as raw prose, outside the Skill tool's frontmatter mechanics — allowed-tools scoping and argument substitution do not apply on that path; it is deliberately a degraded, unconstrained path. The body below must remain executable as written by a model with no Skill-tool support.

## Input

Whitespace-delimited tokens. The first token is the target skill name — bare (e.g. `code-health`), matching the skill's directory under `skills/`. All remaining tokens (e.g. `focus=dead-code`, `--min-confidence high`, `next`, `grant`) pass through to the target invocation verbatim, joined by single spaces. Values containing spaces are unsupported — the same constraint the existing `focus=<vertical>` grammar already carries; don't invent quoting.

## Plugin-root derivation

Derive the plugin root from this skill's own loaded location: the `Base directory for this skill:` line every Skill invocation receives names `<plugin-root>/skills/routine-kickoff`, so the plugin root is that path's grandparent (the directory containing `.claude-plugin/`). Never parse the kernel's earlier output — no cross-invocation handoff exists — and never assume `${CLAUDE_PLUGIN_ROOT}` is set. When even the base-directory line is unavailable (the kernel's manual-read path, where there is no Skill invocation), the plugin root is this file's own on-disk location's grandparent, known to whoever just read the file.

## Steps

1. **Stale-docs guard.** If any project documentation (CLAUDE.md, rules, README) describes the target skill's past or historical behavior in a way that doesn't match the skill's own current instructions, treat the project doc as stale historical context — never as a procedure to execute.

2. **Plugin-list dump.** Run `claude plugin list --json` once and print its output verbatim. If that command errors (non-zero exit or command not found — an empty-but-valid JSON result is NOT an error; print it as-is), fall back to `ls -la ~/.claude/plugins/cache/*/*/ 2>&1`. Diagnostic only — this output is never used to derive the plugin root.

3. **Reconcile.** Run `node "<plugin-root>/bin/hooks.js" reconcile` — the plugin root derived above — and report its one-line JSON result. Best-effort, never a gate, never a reason to stop the kickoff. Behavior differs by integration model: under `pr-first` it runs full convergence (mirrors the integration branch, releases finished claims, archives closed runs, reaps merged worktrees); under `local-merge` only the worktree reap runs.

4. **Target invocation.** Compose `/claude-tweaks:{first-token}` plus the passthrough args and invoke it via the Skill tool. If — and only if — that call fails with an error indicating the skill name is not in the session's catalog (the harness's unknown-/unrecognized-skill error, e.g. a message containing "Unknown skill" — any *other* failure means the skill was found and errored, which is reported, never fallen back from), read `<plugin-root>/skills/{first-token}/SKILL.md` and execute its instructions directly as written — **except** when the target is `dispatch` or `tidy` (or any future skill that claims work or writes beyond report-only surfaces): report the degraded sandbox and stop. Dispatch claims queue records and triggers builds and merges, and tidy's standalone-auto mode applies deletions (stale records, merged branches and worktrees) — standing effects beyond a report — and any future routine whose skill claims work or writes beyond report-only surfaces gets the same exclusion. This exclusion list is hand-maintained — a new work-claiming skill must be added here, and the pinning test covers only the current names; the drift risk is accepted and stated here deliberately.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Deriving the plugin root from step 2's plugin-list output | That listing is installation metadata, not the loaded build — the base-directory grandparent is the only authoritative source here |
| Falling back to manual execution on any invocation failure | Only the unknown-/unrecognized-skill error means the session's catalog froze before an install; any other failure means the skill was found and errored — report it, never re-route around it |
| Executing `dispatch` or `tidy` manually on the fallback path | They claim work and write beyond report-only surfaces — report the degraded sandbox and stop |
| Restating the kernel's contents (branch sync, resolution ladder, self-heal) here | One home per fact — those live in the kernel (`_shared/routine-template-schema.md`); this file owns only the firing lifecycle around the target skill |
````

- [ ] **Step 2: Verify frontmatter constraints**

Run: `node --test tests/bin-lib/skill-audit/` (house checks incl. description ceiling)
Expected: PASS. Also visually confirm the description is ≤ 260 chars.

- [ ] **Step 3: Commit**

```bash
git add skills/routine-kickoff/SKILL.md
git commit -m "Add routine-kickoff wrapper skill — plugin-served firing-lifecycle home (refs #528)"
```

---

### Task 2: `tests/routine-kickoff.test.js`

**Files:**
- Create: `tests/routine-kickoff.test.js`

**Interfaces:**
- Consumes: Task 1's literal file text.

- [ ] **Step 1: Create the test file with exactly this content**

```js
'use strict';
// Pins the load-bearing text of skills/routine-kickoff/SKILL.md (#528) so none
// of it can be silently dropped: the dispatch/tidy manual-execution exclusion,
// the blast-radius note, and the standalone-followability note. Deliberately
// does NOT assert the repo contains zero references to routine-kickoff --
// the kernel migration (#529) wires references in immediately after landing.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const skill = fs.readFileSync(
  path.join(__dirname, '..', 'skills', 'routine-kickoff', 'SKILL.md'), 'utf8');

test('names dispatch and tidy as manual-execution exclusions, with the principle', () => {
  assert.ok(skill.includes('the target is `dispatch` or `tidy`'));
  assert.ok(skill.includes('report the degraded sandbox and stop'));
  assert.ok(skill.includes(
    'Dispatch claims queue records and triggers builds and merges, and tidy\'s '
    + 'standalone-auto mode applies deletions'));
  assert.ok(skill.includes(
    'any future routine whose skill claims work or writes beyond report-only '
    + 'surfaces gets the same exclusion'));
});

test('states the hand-maintenance rule for the exclusion list', () => {
  assert.ok(skill.includes('hand-maintained'));
  assert.ok(skill.includes('the pinning test covers only the current names'));
});

test('carries the blast-radius standing constraint', () => {
  assert.ok(skill.includes('**Blast radius.**'));
  assert.ok(skill.includes('no per-routine pin'));
  assert.ok(skill.includes('the only rollback is a fix release'));
  assert.ok(skill.includes('shipped contract under expand-contract discipline'));
});

test('carries the standalone-followability standing constraint', () => {
  assert.ok(skill.includes('**Standalone followability.**'));
  assert.ok(skill.includes('reads this file as raw prose'));
  assert.ok(skill.includes('executable as written by a model with no Skill-tool support'));
});
```

- [ ] **Step 2: Run the test**

Run: `node --test tests/routine-kickoff.test.js`
Expected: PASS (4 tests). If any assertion fails, the SKILL.md text drifted from Task 1's content — fix the file, not the test.

- [ ] **Step 3: Commit**

```bash
git add tests/routine-kickoff.test.js
git commit -m "Pin routine-kickoff load-bearing text — exclusions, blast radius, followability (refs #528)"
```

---

### Task 3: Minimal catalog entries + inertness verification

**Files:**
- Modify: `docs/skill-graph.md` (new `## routine-kickoff` section)
- Modify: `skills/help/reference-card.md` (one mention, marked machine-invoked)
- Modify: `skills/help/context-flow.md` (one Artifact-Flow-table mention)

**Interfaces:**
- Consumes: the skill name from Task 1. Ruling context: these three entries are mechanically required by `tests/skill-catalog-completeness.test.js`; keep them minimal — #530 owns the substantive docs pass.

- [ ] **Step 1: docs/skill-graph.md**

Add a new `## routine-kickoff` section (alphabetical placement among the existing `## {name}` sections), minimal:

```markdown
## routine-kickoff

| Target | Relationship |
|---|---|
| (inert at landing) | Machine-invoked firing-lifecycle wrapper — shipped by #528 with no live consumer; the kernel migration (#529) wires routine kernels to invoke it, and #530 verifies these edges against the merged implementation |
| `bin/hooks.js reconcile` | Step 3 runs reconcile best-effort before the target-skill invocation |
```

- [ ] **Step 2: skills/help/reference-card.md**

Add one row in the Utility section (match the surrounding row format): `/claude-tweaks:routine-kickoff` — machine-invoked by routine kernels (firing-lifecycle wrapper); not for direct human use.

- [ ] **Step 3: skills/help/context-flow.md**

Add one row to the per-skill Reads/Writes/Deletes table (match the file's `—` empty-cell convention): `routine-kickoff | Reads: plugin cache listing, target SKILL.md (fallback path) | Writes: — (reconcile side effects belong to bin/lib/reconcile) | Deletes: —`. If the Artifact Flow diagrams are what the completeness test checks, a mention in the table suffices (the test checks `mentionsSkill` over the whole file); do not redraw diagrams — #530 owns diagram work if needed.

- [ ] **Step 4: Verify — targeted suites + behavioral inertness**

Run: `node --test tests/routine-kickoff.test.js tests/skill-catalog-completeness.test.js tests/research/cross-refs.test.js`
Expected: PASS.

Behavioral inertness check (narrowed per controller ruling): `grep -rn "routine-kickoff" bin/ skills/_shared/` and `grep -l "routine-kickoff" skills/*/routine-template.yml`
Expected: zero matches (no kernel, template, or bin/ code references the skill). Run a positive control: `grep -c "routine-kickoff" skills/routine-kickoff/SKILL.md` ≥ 1.

- [ ] **Step 5: Commit**

```bash
git add docs/skill-graph.md skills/help/reference-card.md skills/help/context-flow.md
git commit -m "Add minimal catalog entries for routine-kickoff — completeness-test requirement (refs #528)"
```
