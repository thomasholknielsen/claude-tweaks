# Multi-Spec Console: Engine-Fed Sections + Prose Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `skills/flow/multispec-review-console.md` up to parity with `skills/wrap-up/review-console.md` — call #286's `render --section console --spec-state ...` engine mode for the 5 engine-rendered sections instead of hand-writing them, and extend the file's existing prose-aggregation pattern to cover Low-confidence findings, Contested findings, and a visible/overridable Cleanup actions section.

**Architecture:** This is a pure markdown skill-file rewrite — no application code, no `node --test`. Each task edits one coherent slice of `skills/flow/multispec-review-console.md` and verifies via the specific grep(s)/manual-read check from the spec's Acceptance Criteria that apply to that slice. The final task re-reads the whole rewritten file against all 8 ACs plus the Non-Goals list.

**Tech Stack:** N/A — markdown skill-authoring conventions per `docs/skill-authoring.md`.

## Global Constraints

- Do not change `skills/wrap-up/review-console.md` (single-spec) or any of its behavior.
- Do not change `bin/lib/wrap-up/engine-render.js` or `bin/wrap-up-engine.js` beyond what #286 already shipped.
- Do not change `skills/flow/multi-spec.md`'s run-directory layout, `manifest.yml` schema, or the `MULTISPEC_REVIEW_DEFER`/`MULTISPEC_PARENT_DIR` environment-variable contract.
- Do not change the `[adr-convention]` row's own three-way prompt mechanics — only how it's aggregated per-spec (already works like Queue writes).
- Do not change `/claude-tweaks:dispatch`'s own group-scoped Auto-merge gate.
- Do not invent a new detection heuristic for Low-confidence/Contested findings — copy `review-console.md`'s render conditions verbatim.
- Do not add machinery to detect a "weakened" conditional-render clause programmatically — the qualitative check in Task 6 is a manual read.
- The shipped `--spec-state` flag shape (confirmed against #286 as actually shipped in this worktree, commit `31681891` and earlier): `render --section console --spec-state <id>=<path> [--spec-state <id>=<path> ...] [--start-at n] [--strict]` (no `--run-dir`).

---

### Task 1: Rewrite "When to run the consolidated console" to call the engine; expand the engine-rendered block to all 5 sections (split Documentation updates out of Configuration updates, add Journey updates and Reference repairs)

**Files:**
- Modify: `skills/flow/multispec-review-console.md` (the "When to run the consolidated console" section, lines ~15-30 in the pre-rewrite file, and the "Present the consolidated console" template's 5 engine-rendered sections + worked example, lines ~42-98)

**Interfaces:**
- Consumes: `bin/wrap-up-engine.js render --section console --spec-state <id>=<path> [--spec-state <id>=<path> ...] [--start-at n] [--strict]` (shipped by #286, confirmed above).
- Produces: the rewritten "When to run the consolidated console" section (steps 1-3) and the engine-insertion paragraph + worked-example rows for Skill updates / Documentation updates / Journey updates / Configuration updates / Reference repairs, which Task 2's Low-confidence/Contested sections slot in immediately before, and Task 4's Numbering rules cites by name.

- [ ] **Step 1: Read the current file in full**

```bash
cat skills/flow/multispec-review-console.md
```

Confirm current line ranges match what's described below (they may have shifted slightly since this plan was written — always match by content, not by line number).

- [ ] **Step 2: Rewrite "When to run the consolidated console" steps 1-3**

Replace:

```markdown
## When to run the consolidated console

After every spec's pipeline reaches `/wrap-up`'s Phase 4 execution step (or stops at a HARD-GATE failure) AND the multi-spec run is in `auto` or `hybrid` mode:

1. Read `manifest.yml` to enumerate per-spec subdirectories
2. For each `spec-{N}/`: read `decisions.md` + `staged/` contents (including any
   `staged/leftover-*.md` queue-write proposals — see Queue writes below); ALSO read the parent run
   dir's own `decisions.md` + `staged/` (Manifesto-created — holds run-level items such as
   freeform-issue translations and any parent-level leftover proposals)
3. Render the consolidated console (template below)
4. Apply the user's approval/override
5. Archive the parent run dir to `.claude-tweaks/pipelines/archive/`
```

with:

```markdown
## When to run the consolidated console

After every spec's pipeline reaches `/wrap-up`'s Phase 4 execution step (or stops at a HARD-GATE failure) AND the multi-spec run is in `auto` or `hybrid` mode:

1. Read `manifest.yml` to enumerate per-spec subdirectories, in spec execution order.
2. For each `spec-{N}/` whose `engine-state.json` is present: read `decisions.md` + `staged/` contents (including any `staged/leftover-*.md` queue-write proposals — see Queue writes below) for the prose-aggregated sections (Auto-applied, Pending review, Low-confidence findings, Contested findings, Cleanup actions, Issue closures, Translated briefs, Queue writes, Memory updates, Upstream feedback). ALSO read the parent run dir's own `decisions.md` + `staged/` (Manifesto-created — holds run-level items such as freeform-issue translations and any parent-level leftover proposals). A `spec-{N}/` with no `engine-state.json` present (its wrap-up never reached Phase 2, e.g. a spec that failed before that point) contributes nothing to the engine call in step 2 below, but still contributes to the prose-aggregated sections and to the Not run/Failed footer.
2.5. Invoke the engine for the 5 engine-rendered sections — Skill updates, Documentation updates, Journey updates, Configuration updates, Reference repairs — using one repeated `--spec-state` flag per spec with an `engine-state.json` present, in the spec execution order from step 1:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/wrap-up-engine.js" render --section console \
     --spec-state {id1}={path1} --spec-state {id2}={path2} [...] \
     --start-at {n} [--strict]
   ```

   `{id}` is each spec's own id (`157`, `159`, …); `{path}` is that spec's `engine-state.json` path (`spec-{N}/engine-state.json`). `{n}` is the next number in this console's global row sequence — see "Numbering rules" below for how it's derived from whatever prose-aggregated sections precede the engine-fed block. Insert the command's stdout verbatim into the console response — do not hand-expand it into a different table shape, exactly as `wrap-up/review-console.md` instructs for its own single-spec `render --section console` call.
3. Render the consolidated console (template below): the prose-aggregated sections from step 2's reads, then the engine's verbatim output from step 2.5 in its own position (see the template), then the remaining prose-aggregated sections (Cleanup actions, Queue writes, Memory updates, Upstream feedback, Issue closures, Translated briefs).
4. Apply the user's approval/override
5. Archive the parent run dir to `.claude-tweaks/pipelines/archive/`
```

- [ ] **Step 3: Split Documentation updates out of Configuration updates in the template's worked example, and replace the hand-composed 5-section block's lead-in with the engine-insertion instruction**

**Exact anchor — the current file has only 2 of the 5 engine-rendered sections (Journey updates and Reference repairs don't exist at all yet).** In the "Present the consolidated console" template block, find this exact span, from the `#### Skill updates` heading through the end of the `#### Configuration updates` table (do not include the `#### Issue closures` heading that follows it):

```markdown
#### Skill updates (from each spec's Skills curation row)

| # | Spec | Skill | Section | Change |
|---|---|---|---|---|
| 9 | 157 | auth | Anti-Patterns | Add: "Don't share session tokens via querystring" |
| 10 | 159 | NEW | session-management | Create new skill for session lifecycle patterns |

#### Configuration updates (from each spec's Steps 6 + 8)

| # | Spec | Type | Target | Change |
|---|---|---|---|---|
| 11 | 157 | doc | docs/api.md | Document new /auth/refresh endpoint |
| 12 | 159 | claude.md | Commands | Add `npm run lint:fix` to test workflow |
```

Replace that whole span (both existing sections) with the full 5-section sequence below, matching `wrap-up/review-console.md`'s order (Skill updates, Documentation updates, Journey updates, Configuration updates, Reference repairs) — this both splits Documentation updates out of the old combined Configuration updates table AND adds the two sections (Journey updates, Reference repairs) that don't exist in the file at all yet:

```markdown
Generate the next five sections — Skill updates, Documentation updates, Journey updates, Configuration updates, and Reference repairs, in that order, matching `engine-render.js`'s `SECTION_SPECS` emission order — via the `--spec-state` engine call in "When to run the consolidated console" step 2.5 above. The engine's real output shape is plainer than the worked examples below: `renderConsoleSectionsMulti` emits a bare `#### {title}` heading per section plus one uniform `| # | Spec | Target | Change | Disposition |` table (integer `#`, the contributing spec's id, `finding.targetPath`, `finding.summary`, and `applied ({commit})` / `staged ({stagePath})`) — the same five columns for all five sections. The richer per-section shapes below are the worked-example illustration of what those rows mean, not a second render shape — on an engine run, insert `render`'s output verbatim into the response; do not hand-expand it into a different table shape.

#### Skill updates (from each spec's Skills curation row)

| # | Spec | Skill | Section | Change |
|---|---|---|---|---|
| 9 | 157 | auth | Anti-Patterns | Add: "Don't share session tokens via querystring" |
| 10 | 159 | NEW | session-management | Create new skill for session lifecycle patterns |

#### Documentation updates (from each spec's Docs curation row)

| # | Spec | Type | Target | Change |
|---|---|---|---|---|
| 11 | 157 | doc | docs/api.md | Document new /auth/refresh endpoint |

#### Journey updates (from each spec's Journeys curation row)

| # | Spec | Type | Target | Change |
|---|---|---|---|---|
| — | — | — | — | (none in this example) |

#### Configuration updates (from each spec's CLAUDE.md & rules and Decision records curation rows)

| # | Spec | Type | Target | Change |
|---|---|---|---|---|
| 12 | 159 | claude.md | Commands | Add `npm run lint:fix` to test workflow |

An `[adr-convention]` row renders inside this section but carries its own three-way prompt, following the same not-covered-by-"Approve all" rule as Queue writes below — the row's mechanics are unchanged from the single-spec console (`wrap-up/review-console.md`'s Configuration updates section), only its aggregation is per-spec here, the same way Queue writes already aggregates.

#### Reference repairs (from each spec's Broken references curation row)

Render this section whenever any spec's broken-reference sweep found a surviving reference, in either of two states — **applied** (already happened in that spec's own `Initiative-Fix:` commit) or **staged** (an ordinary approval row). Omit the section entirely when every spec's sweep found nothing.

| # | Spec | State | Target | Repair | Broken by | Why |
|---|---|---|---|---|---|---|
| — | — | — | — | — | — | (none in this example) |
```

Note: the worked-example numbering above (9-12) is illustrative only — real numbering follows "Numbering rules" (Task 4).

- [ ] **Step 4: Verify**

```bash
grep -c "spec-state" skills/flow/multispec-review-console.md
grep -c "^#### Configuration updates" skills/flow/multispec-review-console.md
grep -E "^#### Documentation updates" skills/flow/multispec-review-console.md
```

Expected: first command ≥ 1 (AC 3a); second command returns exactly `1` (AC 2); third command matches (part of AC 1). Then read the rewritten "When to run the consolidated console" steps and confirm the old "read each spec's `staged/`/`decisions.md` contents" instruction for the 5 engine-rendered sections is gone — replaced by the `--spec-state` invocation (AC 3b; steps 2 and 2.5 above split reading for prose-aggregated sections from the engine call for engine-rendered ones, so this is a manual confirmation, not just the grep).

- [ ] **Step 5: Commit**

```bash
git add skills/flow/multispec-review-console.md
git commit -m "Wire multi-spec console's 5 engine-rendered sections to render --spec-state

refs #287"
```

---

### Task 2: Add Low-confidence findings and Contested findings sections

**Files:**
- Modify: `skills/flow/multispec-review-console.md` (insert two new `####` sections into the "Present the consolidated console" template, between "Pending review" and the engine-insertion paragraph added in Task 1)

**Interfaces:**
- Consumes: nothing from Task 1 (independent insertion point — sits between "Pending review" and the "Generate the next five sections..." paragraph Task 1 wrote).
- Produces: two new section headings (`#### Low-confidence findings (not reproduced)`, `#### Contested findings (debate inconclusive)`) that Task 4's Numbering rules update and Task 5's Hard requirements update both reference by name.

- [ ] **Step 1: Insert the two new sections**

Immediately after the existing "Pending review" worked-example table (and before the "Generate the next five sections..." paragraph from Task 1), insert:

```markdown
#### Low-confidence findings (not reproduced)

Render this section only when `decisions.md` contains STAGED entries with the unconfirmed-finding rationale (single-source per-lens findings, or findings downgraded by cross-lens debate). Aggregated across every spec in the run, `Spec`-tagged. Omit the section entirely when empty for every spec.

| # | Spec | Path:Line | Finding | Severity | Lens |
|---|---|---|---|---|---|
| 8 | 157 | src/auth.ts:42 | Possible null check missing | medium | error-handling |
| 9 | 157 | src/api.ts:180 | Race condition on token refresh | high | security |

> These findings were surfaced by exactly one reviewer agent (or downgraded by a debate that converged negative). The signal is real but unreplicated; the user decides whether to apply, ignore, or escalate.

#### Contested findings (debate inconclusive)

Render this section only when `decisions.md` contains STAGED entries from cross-lens debate with mixed/partial verdicts. Aggregated across every spec in the run, `Spec`-tagged. Omit the section entirely when empty for every spec.

| # | Spec | Path:Line | Lens A verdict | Lens B verdict |
|---|---|---|---|---|
| 10 | 159 | src/auth.ts:42 | agree (security) | partial (architecture) |

> Two reviewer lenses disagreed on this region and one debate round did not converge. Both verdicts are staged at `spec-{N}/staged/review-contested-{M}.md` with reasoning side-by-side. Pick one — or accept both as informational — from the action prompt below.
```

- [ ] **Step 2: Verify**

```bash
grep -E "^#### (Low-confidence findings|Contested findings)" skills/flow/multispec-review-console.md
```

Expected: 2 matches (part of AC 1).

- [ ] **Step 3: Commit**

```bash
git add skills/flow/multispec-review-console.md
git commit -m "Add Low-confidence findings and Contested findings sections to multi-spec console

refs #287"
```

---

### Task 3: Rewrite Cleanup actions as a visible, numbered, overridable section; update On approval/On override

**Files:**
- Modify: `skills/flow/multispec-review-console.md` (the "Cleanup actions" section — new, inserted after Reference repairs and before Queue writes — plus "On approval" step and "On override" step, plus "Shared teardown"'s own numbered list)

**Interfaces:**
- Consumes: `wrap-up/cleanup-procedures.md`'s existing Section E (issue claim release), Section E step 6 (grant removal), and "Per-issue label cleanup" (`bot:in-progress` removal, `parked` restore) — all already referenced by the current "Shared teardown" prose; this task does not change what they do, only how they're surfaced and gated.
- Produces: the Cleanup actions section's row numbers, which Task 4's Numbering rules cites as "the last engine-independent prose-aggregated section before the per-item ones."

- [ ] **Step 1: Read the current "Shared teardown" section and "On approval"/"On override" steps in full**

```bash
grep -n "Shared teardown\|## On approval\|## On override" skills/flow/multispec-review-console.md
```

- [ ] **Step 2: Insert the new "Cleanup actions" section**

Immediately after the Reference repairs section (added in Task 1) and before "Queue writes", insert:

```markdown
#### Cleanup actions (executed after approval, per row — branch-finish gates the per-spec rows below it)

Render 2 run-level rows (no `Spec` column) plus 3 rows per spec with a populated `Spec` column, drawn from `wrap-up/cleanup-procedures.md`'s Section D (ephemeral dev server) and Section E (issue claim release, grant removal, per-issue label cleanup) — the same 5 steps "Shared teardown" below already performs, now visible and individually overridable before they execute.

**Branch-finish is a hard prerequisite for every per-spec row below it.** Claim release needs branch-finish's outcome ($LINK — merge commit sha or PR URL) to release each issue correctly; grant removal and label cleanup key off the same outcome. Dev-server teardown has no such dependency and may be skipped independently of every other row.

| # | Spec | Action | Details |
|---|---|---|---|
| 19 | — | Tear down shared ephemeral dev server | `{parent-run-dir}/ephemeral-server.txt`, if one was started |
| 20 | — | Finish the shared branch | `/superpowers:finishing-a-development-branch` — merge / PR / discard; every row below depends on this outcome |
| 21 | 157 | Release issue claim | `claims/issue-157.json` on `claims-registry` |
| 22 | 157 | Remove grants | `auto:build`/`auto:merge`, if present |
| 23 | 157 | Per-issue label cleanup | Remove `bot:in-progress`; restore `parked` if applicable |
| 24 | 159 | Release issue claim | `claims/issue-159.json` on `claims-registry` |
| 25 | 159 | Remove grants | `auto:build`/`auto:merge`, if present |
| 26 | 159 | Per-issue label cleanup | Remove `bot:in-progress`; restore `parked` if applicable |
```

- [ ] **Step 3: Update "On approval" to execute the visible Cleanup actions rows, in dependency order**

Find "On approval (option 1)" and its numbered execution list. After the existing steps that apply patches/skill/config updates and before the queue-write/memory/upstream per-item prompts, ensure step order reads:

```markdown
X. Execute Cleanup actions rows in order — dev-server teardown (no dependency) may run any time; branch-finish (row 20 in this example) must complete before any per-spec claim-release/grant-removal/label-cleanup row runs, since those rows read branch-finish's outcome for the release reason and `$LINK`. This is "Shared teardown" below, now gated on the visible rows above instead of running unconditionally.
```

- [ ] **Step 4: Update "On override" to auto-skip per-spec rows when branch-finish is overridden**

Find "On override (option 2)" and add, as its own numbered step (after the general per-item override-parsing step, before the Queue writes/Memory/Upstream per-item step):

```markdown
X. **If the branch-finish row (Cleanup actions) is skipped or reverted:** auto-skip every per-spec claim-release/grant-removal/label-cleanup row for this run — render each as "skipped — depends on branch-finish" rather than executing it against a branch-finish outcome that never happened, and rather than leaving it pending or orphaned. Log the auto-skip to the parent run dir's `decisions.md`. Dev-server teardown is unaffected — it has no dependency on branch-finish and executes (or is skipped) per the user's own choice for that row alone.
```

- [ ] **Step 5: Update "Shared teardown"'s own prose to point at the now-visible rows**

In the "Shared teardown (dev server, branch finish, claim release, grants)" section, add a sentence at the top: "These 5 steps are now presented as visible, numbered Cleanup actions rows above — this section documents their mechanics; the console template above is what the user actually sees and approves/overrides."

- [ ] **Step 6: Verify**

```bash
grep -n "Cleanup actions" skills/flow/multispec-review-console.md
grep -n "depends on branch-finish\|skipped — depends" skills/flow/multispec-review-console.md
```

Expected: Cleanup actions section present with the worked example showing exactly 2 rows with no `Spec` value and 3 rows per spec with a populated `Spec` value (AC 4), and prose stating the branch-finish dependency (AC 4, AC 8) plus the auto-skip rule in "On override" (AC 8).

- [ ] **Step 7: Commit**

```bash
git add skills/flow/multispec-review-console.md
git commit -m "Make multi-spec Cleanup actions a visible, overridable, branch-finish-gated section

refs #287"
```

---

### Task 4: Update "Numbering rules" to state engine-rendered vs. prose-aggregated provenance

**Files:**
- Modify: `skills/flow/multispec-review-console.md` (the "Numbering rules" section)

**Interfaces:**
- Consumes: the full section list from Tasks 1-3 (Auto-applied, Pending review, Low-confidence findings, Contested findings, Skill/Documentation/Journey/Configuration updates, Reference repairs, Cleanup actions, Queue writes, Memory updates, Upstream feedback, Issue closures, Translated briefs).
- Produces: nothing consumed by a later task — this is a documentation-only update, verified directly by its own AC.

- [ ] **Step 1: Read the current "Numbering rules" section**

```bash
grep -n "## Numbering rules" -A 10 skills/flow/multispec-review-console.md
```

- [ ] **Step 2: Rewrite it to add the provenance statement**

Append this paragraph to the end of the existing "Numbering rules" section (after the existing bullets, before the next `##` heading):

```markdown

**Two provenances, one sequence.** Five sections — Skill updates, Documentation updates, Journey updates, Configuration updates, Reference repairs — are **engine-rendered**: their row numbers and content come verbatim from the `--spec-state` engine call in "When to run the consolidated console" step 2.5, which receives `{n}` (the next number in the global sequence) as its own `--start-at` argument. Every other batch section — Auto-applied, Pending review, Low-confidence findings, Contested findings, Cleanup actions — plus the three per-item sections (Queue writes, Issue closures, Translated briefs are prose-aggregated too, though the latter two sit outside the global sequence per the note above) is **prose-aggregated**: composed by hand from each spec's own `decisions.md`/`staged/` reads (step 2 above), the same aggregation pattern this file has always used. `{n}` for the engine call is therefore: 1 (the start of the global sequence) plus the row count of every prose-aggregated section that renders *before* the engine block in the template — Auto-applied, Pending review, Low-confidence findings, Contested findings.
```

- [ ] **Step 3: Verify**

```bash
grep -n "engine-rendered\|prose-aggregated" skills/flow/multispec-review-console.md
```

Expected: both phrases appear, together, in the Numbering rules section (AC 5).

- [ ] **Step 4: Commit**

```bash
git add skills/flow/multispec-review-console.md
git commit -m "State engine-rendered vs prose-aggregated provenance in multi-spec Numbering rules

refs #287"
```

---

### Task 5: Update "Hard requirements" and "Anti-Patterns" to name the new sections

**Files:**
- Modify: `skills/flow/multispec-review-console.md` (the "Hard requirements" section and the "Anti-Patterns" table)

**Interfaces:**
- Consumes: the section names from Tasks 1-3.
- Produces: nothing consumed by a later task — verified directly by its own AC.

- [ ] **Step 1: Read the current "Hard requirements" and "Anti-Patterns" sections**

```bash
grep -n "## Hard requirements" -A 6 skills/flow/multispec-review-console.md
grep -n "## Anti-Patterns" -A 10 skills/flow/multispec-review-console.md
```

- [ ] **Step 2: Update the first "Hard requirements" bullet**

Find:

```markdown
- The console MUST present every entry from every per-spec `decisions.md` AND the parent run dir's `decisions.md` (auto-applied + staged + kept-prompt + scanned), and every file in every per-spec `staged/` directory and every file in the parent run dir's `staged/`. Silently dropping any item is forbidden.
```

Replace with:

```markdown
- The console MUST present every entry from every per-spec `decisions.md` AND the parent run dir's `decisions.md` (auto-applied + staged + kept-prompt + scanned), every file in every per-spec `staged/` directory and every file in the parent run dir's `staged/`, every Low-confidence and Contested finding surfaced by any spec's `/review`, and every Cleanup actions row that would otherwise run at teardown. Silently dropping any item is forbidden.
```

- [ ] **Step 3: Check the Anti-Patterns table for wording assuming the old 2-section-family engine subset**

Read the current Anti-Patterns table (from Step 1's grep above). None of its existing rows name a specific section count or list ("Running per-spec consoles inline...", "Aggregating across runs...", "Omitting the Spec column...", "Replacing per-spec audit trails...", "Bulk-approving queue writes..."), so none assumes the old subset — confirm this by reading each row's full text, and if none needs a wording change, add nothing (do not invent a row to pad the table).

- [ ] **Step 4: Verify**

```bash
grep -n "Low-confidence\|Contested findings\|Cleanup actions" skills/flow/multispec-review-console.md | grep -i "hard requirement\|MUST present"
```

Read the "Hard requirements" section directly to confirm the three new section names appear in the "MUST present" bullet (AC 6) — the grep above is a coarse check; the manual read is the actual verification since the names may not be on the same line as "MUST present".

- [ ] **Step 5: Commit**

```bash
git add skills/flow/multispec-review-console.md
git commit -m "Name Low-confidence/Contested findings/Cleanup actions in multi-spec Hard requirements

refs #287"
```

---

### Task 6: Final read-through against all 8 ACs and Non-Goals; cross-reference check

**Files:**
- Read: `skills/flow/multispec-review-console.md` (full file, post-rewrite)
- Read: `skills/flow/multi-spec.md`, `docs/skill-graph.md`, `docs/plugin-structure.md` (cross-reference check — read-only, no edit expected)

**Interfaces:**
- Consumes: the complete rewritten file from Tasks 1-5.
- Produces: nothing — this is the plan's final verification task. No later task depends on it.

- [ ] **Step 1: Diff against the pre-rewrite version to confirm no existing section was removed (AC 7a)**

```bash
git log --oneline -- skills/flow/multispec-review-console.md | tail -1
git show $(git log --format=%H -- skills/flow/multispec-review-console.md | tail -1)^:skills/flow/multispec-review-console.md > /tmp/multispec-console-before.md
grep -E "^#### " /tmp/multispec-console-before.md
grep -E "^#### " skills/flow/multispec-review-console.md
```

Confirm every heading from the first grep (the pre-Task-1 version) also appears in the second grep's output.

- [ ] **Step 2: Read each pre-existing section's aggregation condition against the current wording to confirm it wasn't narrowed (AC 7b)**

Read the full current file. For each of: Auto-applied, Pending review, Queue writes, Memory updates, Upstream feedback, Issue closures, Translated briefs, Not run/Failed footer — compare its current render condition/aggregation sentence against `/tmp/multispec-console-before.md`'s version of the same section. Confirm no condition was narrowed (e.g., a section that used to render "whenever X" now requiring "X AND Y" would be a narrowing — none of Tasks 1-5 touch these sections' own conditions, so this should be a clean pass, but verify by reading, not by assuming).

- [ ] **Step 3: Run every grep-based AC directly, in one batch**

```bash
grep -E "^#### (Low-confidence findings|Contested findings|Documentation updates|Cleanup actions)" skills/flow/multispec-review-console.md
grep -c "^#### Configuration updates" skills/flow/multispec-review-console.md
grep -c "spec-state" skills/flow/multispec-review-console.md
grep -n "engine-rendered\|prose-aggregated" skills/flow/multispec-review-console.md
```

Expected: AC 1 — 4 matches; AC 2 — exactly `1`; AC 3a — ≥ 1; AC 5 — both phrases present together.

- [ ] **Step 4: Manually verify the remaining non-grep ACs**

- AC 3b — re-read "When to run the consolidated console" steps: confirm the hand-read instruction for the 5 engine-rendered sections is gone.
- AC 4 — re-read the Cleanup actions worked example: exactly 2 rows with no `Spec` value, ≥ 3 rows per example spec with a populated `Spec` value, branch-finish dependency stated in prose next to the example.
- AC 6 — re-read "Hard requirements": Low-confidence findings, Contested findings, and Cleanup actions all named in the "MUST present" bullet.
- AC 8 — re-read the Cleanup actions section and "On override": branch-finish → per-spec dependency stated explicitly; "On override" auto-skips (not orphans/errors) the three per-spec rows per spec when branch-finish is overridden.

- [ ] **Step 5: Confirm Non-Goals were respected**

```bash
git diff $(git log --format=%H -- skills/flow/multispec-review-console.md | tail -1)^..HEAD -- skills/wrap-up/review-console.md bin/lib/wrap-up/engine-render.js bin/wrap-up-engine.js skills/flow/multi-spec.md
```

Expected: empty output — none of these files were touched by Tasks 1-5.

- [ ] **Step 6: Cross-reference check — `docs/skill-graph.md` and `docs/plugin-structure.md`**

```bash
grep -n "multispec-review-console" docs/skill-graph.md docs/plugin-structure.md
```

`docs/skill-graph.md` tracks skill-to-skill edges; `multispec-review-console.md` is a sub-file of the `flow` skill, not a skill itself, so it should have no entry there (confirm the grep returns nothing for that file). `docs/plugin-structure.md`'s one-line description of this sub-file (in the `flow` skill's sub-file row) should still read accurately — it already says "consolidated multi-spec Review Console," which remains true after this rewrite (no new file added, no skill relationship changed) — confirm by reading the matched line; if it's still accurate, no edit is needed.

- [ ] **Step 7: Read `skills/flow/multi-spec.md` to confirm no edit is needed there**

Read the file in full. Confirm it does not itself hand-describe the 5 engine-rendered sections' old shape (it shouldn't — per the spec's own Non-Goals, run-directory layout / `manifest.yml` schema / env-var contract are out of scope, and a grep during plan-writing found no `render --section console`/`renderConsoleSections` references in this file). If an edit turns out to be needed, make it now and note why the spec's own expectation ("likely no change") didn't hold.

- [ ] **Step 8: Clean up the temp diff file**

```bash
rm -f /tmp/multispec-console-before.md
```

- [ ] **Step 9: Final commit (only if Step 7 found something to fix; otherwise this task has nothing new to commit)**

```bash
git status --short
```

If clean (no edits from Step 7), this task makes no commit — Tasks 1-5's commits already cover the full rewrite. If Step 7 required an edit, commit it now with a message describing what was found and fixed.
