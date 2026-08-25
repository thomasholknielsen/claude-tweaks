# Wrap-Up Standalone Fast Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a standalone `/claude-tweaks:wrap-up` run (no record, no worktree, not part of a multi-spec run) a cheaper cleanup-execution path than reading `cleanup-procedures-execution.md` in full, since that run shape can never trigger Sections A (design-wrapper caches), C (git worktree), or E (issue claim release) — together the majority of that file's ~29 KB.

**Architecture:** A new lazy-loaded fragment (`standalone-fast-path.md`) states the applicability precondition, confirms which of the 8 canonical cleanup items can ever survive Condition-filtering under that precondition ({2, 6, 8}), and restates items 2 and 8's already-inline-simple procedures directly (item 8 mirrors `cleanup-procedures-execution.md`'s Section B verbatim in spirit, citing the same two `hooks.js` verbs — never a third, independently-drifting restatement). `cleanup-procedures.md`'s own text — the file that already tells a reader when to open `cleanup-procedures-execution.md` — gets one new paragraph routing to the fragment instead, for the qualifying case. `SKILL.md`'s cleanup-planning step gets a one-sentence pointer to that same paragraph, per the "top of SKILL.md" framing in the deliverable. `review-console.md`/`review-console-interactive.md` are explicitly left untouched: their content (Numbering rules, Hard requirements, Q#/M#/U# handling, skill/doc/journey/config-update rendering) applies identically regardless of record/worktree/multi-spec status, so there is no safe, non-duplicative way to shortcut them for this run shape — the fragment says so explicitly rather than silently pretending otherwise.

**Tech Stack:** Markdown skill prose (Claude Code plugin skill files), read by an LLM at runtime — no executable code. "Tests" here are Node `node --test` conformance suites that pin exact substrings/headings in the touched files, plus the repo's own 40 KB per-file context-cost ceiling.

**Spec:** `.claude-tweaks/pipelines/2026-08-24T090114-record-797/work/797-spec.md` (materialized from GitHub issue #797) — the spec travels with this plan; the implementer reads both.

## Global Constraints

- 40 KB soft ceiling per `SKILL.md` and per lazy-loaded sub-file (`tests/bin-lib/skill-audit/context-cost.test.js`'s `CEILING_BYTES = 40 * 1024`) — `wrap-up/SKILL.md` starts this work at 39,060 bytes (already within the 90% near-ceiling band), so any addition to it must be minimal (a one-sentence pointer, not restated logic).
- `cleanup-procedures-execution.md`'s existing `## A.`/`## B.`/`## C.`/`## D.`/`## E.` section headings and their content are load-bearing citation addresses used by at least 15 other skill files across `dispatch/`, `tidy/`, `flow/`, and `_shared/` (verified via repo-wide grep) — **never rename, move, or restructure them**. Three `node --test` files also pin exact substrings inside specific sections (`tests/archive-run-verb.test.js` on Section B, `tests/scratch-worktree-remote-branch-delete.test.js` on the Section C→D boundary, `tests/dispatch-flow-rundir-handoff.test.js` on Section E onward) — this plan's changes stay entirely outside those sections' existing text.
- Do not duplicate the Review Console's own rendering/decision logic (Numbering rules, Hard requirements, Q#/M#/U# handling) anywhere — it is not record/worktree/multi-spec-conditional, so a "lighter" restatement of it would either drop real functionality or drift from the canonical copy. State this constraint explicitly in the new fragment rather than silently working around it.

---

### Task 1: Create the `standalone-fast-path.md` fragment

**Files:**
- Create: `plugin/skills/wrap-up/standalone-fast-path.md`

**Interfaces:**
- Consumes: nothing new — cites the same `node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" close-run --run "$RUN_DIR"` / `archive-run --run "$RUN_DIR"` verbs `cleanup-procedures-execution.md`'s Section B already names, and points at that file's Section D for item 6 (no restatement — it's already under 1.5 KB).
- Produces: a new lazy-loaded skill sub-file, cited from `cleanup-procedures.md` (Task 2) and mentioned in `SKILL.md` (Task 3) and `docs/plugin-structure.md` (Task 4).

- [x] **Step 1: Write the fragment**

Content (verified against the live files during design — see the Self-Review section below for the exact substrings each claim was checked against):

```markdown
# Standalone Fast Path — cleanup for a no-record, no-worktree, non-multi-spec run

Referenced by `cleanup-procedures.md`'s own text (#797) as an alternative to reading
`cleanup-procedures-execution.md` in full at Phase 4's execution step, for the one run shape
that structurally can never need most of that file's content.

## Applicability

All three must hold for this run:

- **No record identity** — Phase 1 (`SKILL.md`'s "Identify the work context") determined
  conversation-based work, not record-based.
- **No worktree strategy** — this run committed directly on the current branch.
- **Not part of a multi-spec run** — `MULTISPEC_REVIEW_DEFER`/`MULTISPEC_PARENT_DIR` are unset.

Under this precondition, cleanup items 1 (record-based), 3 (design wrapper caches), 4 (git
worktree), 5 (record lifecycle), and 7 (issue claim release) can never hold their Condition —
each requires record identity, a worktree, or design-wrapper activity this run by construction
does not have (`cleanup-procedures.md`'s canonical table). Once cleanup planning filters the
list, this run's filtered list can only ever be a subset of **{2 (ledger), 6 (ephemeral dev
server), 8 (pipeline run directory)}**.

**If the filtered list contains anything outside {2, 6, 8}** — the precondition's own assumption
turned out false (a bug in this file, or a run shape this file didn't anticipate) — stop reading
this file and read `cleanup-procedures-execution.md` in full instead, exactly as a non-qualifying
run would. Never partially execute from here in that case.

## What this does NOT shortcut

The Review Console itself — `review-console.md`'s gate/empty-console logic, and, when a real
stop renders, `review-console-interactive.md`'s batch tables, Numbering rules, and Hard
requirements — applies identically regardless of record/worktree/multi-spec status: a queue
write, memory update, upstream-feedback proposal, or skill/doc/journey/config update can surface
on any run shape. Read those files normally; nothing here duplicates or replaces them. This
file's only scope is Phase 4's **cleanup execution** step, for the narrow item set above.

## Cleanup execution

**Item 2 (ledger)** — delete via `/ledger`'s delete operation, only after Phase 3's ledger gate
confirmed zero open items. Already "simple enough to execute inline" per
`cleanup-procedures.md` — no further procedure needed.

**Item 6 (ephemeral dev server)** — only reachable if this conversation-based, no-worktree run
still triggered a frontend visual review that auto-started a dev server
(`${RUN_DIR}/ephemeral-server.txt` exists). Read `cleanup-procedures-execution.md`'s
"## D. Ephemeral dev server" section for the kill procedure — short (under 1.5 KB), not worth a
separate fragment. If `ephemeral-server.txt` does not exist, this item never applied; skip it.

**Item 8 (pipeline run directory)** — always applies (a run directory exists from Phase 1
onward). Execute directly, the same procedure as `cleanup-procedures-execution.md`'s
"## B. Pipeline run directory" section (both this file and that one cite the same two verbs —
never restate their internals a third way):

1. Verify the Review Console ran and applied/dismissed all staged items.
2. Mark the run terminal: `node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" close-run --run "$RUN_DIR"`
   (idempotent — safe even if nothing closed the run already).
3. Archive it: `node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" archive-run --run "$RUN_DIR"`. This
   archives the tracked `work/` directory and moves every other entry (`config.yml`,
   `decisions.md`, `events.jsonl`, `staged/`, and anything else present) in one call. The verb
   refuses a non-terminal run — step 2 above is what makes that refusal unreachable here.
4. Skipped staged items remain in the archive; they are NOT silently dropped. Do NOT delete the
   run directory outright — the auto-decision log is project history, not disposable pipeline
   state.

Proceed to `SKILL.md`'s phase-trace report and "Execute approved actions" step as normal —
nothing about the report, commit, or verification changes for this run shape.
```

- [x] **Step 2: Verify byte size is well under the 40 KB ceiling**

Run: `wc -c plugin/skills/wrap-up/standalone-fast-path.md`
Expected: a few KB (well under 40,960 bytes) — confirmed at implementation time.

- [x] **Step 3: Commit**

```bash
git add plugin/skills/wrap-up/standalone-fast-path.md
git commit -m "Add wrap-up standalone fast-path fragment for no-record/no-worktree cleanup"
```

---

### Task 2: Route `cleanup-procedures.md` to the fragment for the qualifying case

**Files:**
- Modify: `plugin/skills/wrap-up/cleanup-procedures.md` (the paragraph immediately after the canonical table, currently ending "...without a dedicated sub-procedure.")

**Interfaces:**
- Consumes: Task 1's `standalone-fast-path.md`.
- Produces: the routing decision `SKILL.md`'s "Plan cleanup actions" step (Task 3) points at instead of restating.

- [x] **Step 1: Append the fast-path paragraph**

After the existing paragraph ending "Items 1, 2, and 5 are simple enough to execute inline at Phase 4's execution step without a dedicated sub-procedure.", add:

```markdown

**Fast path (#797).** When this run's filtered list (Condition-filtered, above) is a subset of
{2, 6, 8} — guaranteed whenever this run has no record identity, used no worktree strategy, and
is not part of a multi-spec run — read `standalone-fast-path.md` in this skill's directory
instead of `cleanup-procedures-execution.md`: items 3, 4, 5, and 7 structurally can't apply
under that precondition, so the ~27 KB of Sections A/C/E covering them is never needed. Any other
filtered list reads `cleanup-procedures-execution.md` as before.
```

- [x] **Step 2: Confirm the file still reads correctly end-to-end**

Run: `sed -n '1,30p' plugin/skills/wrap-up/cleanup-procedures.md`
Expected: the new paragraph appears once, directly after the "Items 1, 2, and 5..." sentence, before the "## Multi-spec defer behavior" heading.

- [x] **Step 3: Commit**

```bash
git add plugin/skills/wrap-up/cleanup-procedures.md
git commit -m "Route cleanup-procedures.md to the standalone fast-path fragment"
```

---

### Task 3: One-sentence pointer in `SKILL.md`

**Files:**
- Modify: `plugin/skills/wrap-up/SKILL.md` (Phase 4 "Plan cleanup actions" step, the "At least one holds" bullet)

**Interfaces:**
- Consumes: Task 2's new paragraph in `cleanup-procedures.md`.

- [x] **Step 1: Add the pointer sentence**

Change:
```
- **At least one holds** → read `cleanup-procedures.md` in this skill's directory for the canonical cleanup list, filter it to rows whose Condition holds for this run (e.g., skip the worktree row when no worktree strategy was used), and carry the filtered list forward into the report and the execution step.
```
to:
```
- **At least one holds** → read `cleanup-procedures.md` in this skill's directory for the canonical cleanup list, filter it to rows whose Condition holds for this run (e.g., skip the worktree row when no worktree strategy was used), and carry the filtered list forward into the report and the execution step. That file's own text names a fast-path fragment for the common no-record/no-worktree/non-multi-spec case (#797) — read it there, not restated here.
```

- [x] **Step 2: Verify the ceiling still holds**

Run: `wc -c plugin/skills/wrap-up/SKILL.md`
Expected: under 40,960 bytes (verified at implementation time: 39,210 bytes — 150 bytes added to a 39,060-byte starting point, 1,750 bytes of headroom remaining).

- [x] **Step 3: Commit**

```bash
git add plugin/skills/wrap-up/SKILL.md
git commit -m "Point SKILL.md's cleanup-planning step at the standalone fast-path routing rule"
```

---

### Task 4: Update `docs/plugin-structure.md`'s wrap-up sub-file table

**Files:**
- Modify: `docs/plugin-structure.md` (the `wrap-up` row — file list and description prose)

- [x] **Step 1: Add `standalone-fast-path.md` to the file list**

Insert it into the comma-separated list immediately after `cleanup-procedures-execution.md`.

- [x] **Step 2: Add one clause to the description prose**

Immediately after the existing "cleanup-procedures-execution.md holds Sections A-E's detailed procedures..." clause, add: "standalone-fast-path.md (#797) is an alternative to cleanup-procedures-execution.md for the one run shape that structurally can never need Sections A/C/E (no record, no worktree, not multi-spec) — cleanup-procedures.md's own text routes to it instead when the filtered cleanup list is a subset of {2, 6, 8};"

- [x] **Step 3: Commit**

```bash
git add docs/plugin-structure.md
git commit -m "Document standalone-fast-path.md in the wrap-up sub-file table"
```

---

### Task 5: Verification

**Files:** none (verification only)

- [ ] **Step 1: Run the pinned tests that touch the files this plan modifies**

Run: `node --test tests/archive-run-verb.test.js tests/scratch-worktree-remote-branch-delete.test.js tests/dispatch-flow-rundir-handoff.test.js tests/skill-catalog-completeness.test.js tests/bin-lib/skill-audit/context-cost.test.js`
Expected: all pass — none of these touch content this plan added, only content the plan deliberately left untouched (Sections A-E of `cleanup-procedures-execution.md`).

- [ ] **Step 2: Full verification per `test/verification.md`**

Run: `npm test`
Expected: full suite green (subject to the CLAUDE.md load-variance caveat — re-run any file that fails in isolation before concluding it's a real regression).

- [ ] **Step 3: Grep self-check — every citation this plan added resolves to a real file/heading**

Run:
```bash
grep -n "standalone-fast-path.md" plugin/skills/wrap-up/*.md docs/plugin-structure.md
ls plugin/skills/wrap-up/standalone-fast-path.md
grep -n "^## D. Ephemeral dev server" plugin/skills/wrap-up/cleanup-procedures-execution.md
grep -n "^## B. Pipeline run directory" plugin/skills/wrap-up/cleanup-procedures-execution.md
```
Expected: every citation resolves; no dangling reference.

## Self-Review

**1. Spec coverage.**
- Deliverable 1 ("lighter-weight fragment for the common case... goes straight to render the console, apply on approval, archive the run dir") — Task 1's fragment covers the archive-the-run-dir half directly (item 8) and explicitly defers to the existing, correct render/apply logic for the console half (deliberately, per the Global Constraints — duplicating that logic would violate the spec's own Gotcha). This is a narrower win than the spec's Current State loosely implies (the ~74K figure conflates review-console.md/-interactive.md's genuinely record/worktree-agnostic weight with cleanup-procedures-execution.md's genuinely branch-specific weight) — documented honestly in the fragment itself rather than overclaiming.
- Deliverable 2 ("routing rule at the top of wrap-up/SKILL.md... that loads the light fragment... when none of the branch-triggering conditions apply") — Task 3 adds the SKILL.md-level pointer; Task 2 adds the actual routing logic where cleanup-procedures.md already documents when to open cleanup-procedures-execution.md (the more precise, already-established location for this specific decision).
- AC1 ("loads meaningfully less than ~74K combined") — for the common clean-standalone-run case, cleanup-procedures-execution.md's 29,375 bytes is replaced by standalone-fast-path.md's few KB — a real, substantial reduction on the one file this plan safely touches.
- AC2 ("still correctly renders the console, applies on approval, archives the run dir") — rendering/applying is untouched (not shortcut, not duplicated); archival is restated correctly, citing the same two `hooks.js` verbs Section B already names.
- AC3 ("a run that does need one of the branches still reaches full coverage") — Task 1's fragment explicitly falls back to `cleanup-procedures-execution.md` in full when its own precondition doesn't hold, and Task 2's routing only ever applies when the filtered list is provably {2, 6, 8}-only.

**2. Placeholder scan.** No TBD/TODO markers; every step names an exact file, exact text, and an exact verification command.

**3. Type consistency.** N/A — no code, only prose and shell commands, all naming the same two `hooks.js` verbs (`close-run`, `archive-run`) consistently across Task 1's fragment and the existing Section B it mirrors.
