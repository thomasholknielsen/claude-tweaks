# Record #655 — Decision-Lane Report + Missing-Priority Vocabulary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace refine's 10-column unified table with six decision lanes (paste blocks, consequence-line trust, needs-you lane, two-channel `Next:` line), retire the "unscored" vocabulary, add the first refine journey, and sync the docs cross-references — closing out #460.

**Architecture:** Three tasks: (1) the refine-mode.md Step 4 rewrite (lanes, templates, gate anchor); (2) the vocabulary sweep + docs cross-reference sync; (3) the journey file. All prose/docs work over #654's already-merged `refineWorklist` output (verified live on this branch: `{ fresh, blocked, inProgress, missingPriority, missingRiskSize, prioritySlice, grantSlice, counts }`).

**Tech Stack:** Markdown skill prose; docs; `node --test` conformance suites.

**Spec:** `.claude-tweaks/pipelines/2026-08-16T190902-spec-654-655/spec-655/work/655-spec.md`

## Global Constraints

- One lane per record, precedence: Re-authorize → Grant → Flag-back (populated during the run by Step 3.5 downgrades) → Priority → Dependency repair (annotation-line when the record is already laned) → Needs you (residual: `needs:definition` records, then judgment-required rows; interactive launchers, no paste block).
- The Step 4 confirm gate's `AskUserQuestion` block survives with only lane-input renaming, anchored by `<!-- refine-confirm-gate -->`; its never-silenced status is untouched.
- The trust semantics paragraphs (provenance/verdict wording, `no-cell` vs `not fetched`, advisory-never-the-reason, skip-case footer) survive as consequence-line semantics — moved and reshaped, never deleted.
- Refine-facing text retires the bare word "unscored"; overview-mode.md's own risk-value lens vocabulary stays.
- Step 5 (Apply) mechanics are untouched.
- `docs/skill-graph.md` gains no new edges — existing rows reworded only.
- Skill references in actionable text use the fully-qualified `/claude-tweaks:{skill}` form.

---

### Task 1: Step 4 lanes rewrite in refine-mode.md

**Files:**
- Modify: `skills/backlog/refine-mode.md` (the `## Step 4: Unified table` section, heading through the `AskUserQuestion` block)

**Interfaces:**
- Consumes: `/tmp/backlog-refine-worklist.json`'s fields as Step 1-3 now produce them (`grantSlice.selected`, `blocked`, `prioritySlice.selected`, `counts.*`) and the Step 3 outputs (grant-check recommendations, Step 3.5 downgrades, dependency-mismatch `{ flags }`).
- Produces: the lane templates Task 2's docs rewording describes and Task 3's journey walks.

- [ ] **Step 1: Replace the section**

Retitle `## Step 4: Unified table` to `## Step 4: Decision lanes` and rewrite the section per the spec's deliverable. Required structure, in order:

1. An intro paragraph stating the one-lane-per-record precedence rule verbatim from the Global Constraints above, and the lead count-summary line (adapting the existing 10+-rows rule): "`{total}` suggestions across `{k}` lanes: {per-lane counts}" — numbers from lane array lengths.
2. Six lane subsections in precedence order. Each of the first five: a table template `| # | Record | Current → Recommended | Evidence |` with 1-2 example rows drawn from the old table's examples, followed by a fenced paste-ready command batch for that lane's accepted defaults (the same commands Step 5 documents — cite Step 5 rather than duplicating its bootstrap comments). The Grant lane includes: the in-flight exclusion line verbatim ("`{n}` in flight — excluded from grant checks; a grant changes nothing mid-run.", count from `counts.inProgress`), the trust consequence line under each row — literal template `  ↳ trust: {provenance} / {band} — {verdict}{, {coverage}% coverage}` — rendered only when the trust fetch ran, with the existing `no-cell`→"no cell yet" rewording and `not fetched` semantics carried into the line's variants, and the existing "advisory, never the reason a row is recommended" paragraph kept beneath the lane; the `framing:baked` annotation line — literal template `  # framing:baked — read the record's Gotchas before approving` — under any lane's row whose record carries it.
3. The Suggested Tier column is gone; move its two-source distinction (real `ceremony:*` label plain vs LLM guess suffixed `(guess)`) into one sentence inside the Priority lane's rationale/evidence guidance.
4. The Needs-you lane: positive definition (records carrying `needs:definition` in the fetch, then judgment-required rows with no batchable command — `framing:baked` confirmations, judgment-required dependency repairs), exempt from paste blocks, rows carry interactive launchers (fully-qualified commands, e.g. `/claude-tweaks:specify #{n}`), mirroring overview's needs-you lane by citation.
5. The closing `Next:` line rule: names the top Needs-you item when non-empty, else the highest-value batch — recomputed fresh each run; cite overview-mode.md's precedence rule, do not restate it.
6. The confirm gate: keep the existing `AskUserQuestion` block (question/options byte-identical except "the table above" → "the lanes above"), preceded on its own line by `<!-- refine-confirm-gate -->`.
7. The skip-case footer paragraph and ceiling footer stay (they already carry #654's wording) — reposition beneath the lanes if needed, unchanged in content.

Delete what the lanes replace: the 10-column template, the `Type` column paragraph (superseded by lanes themselves — note that in one clause), the `Suggested Tier` column paragraphs, the `Framing` column paragraph (superseded by the annotation line — its "not a reason to withhold a grant" sentence survives next to the annotation template).

- [ ] **Step 2: Verify**

```bash
grep -n "refine-confirm-gate" skills/backlog/refine-mode.md
```
Expected: exactly 1 hit, immediately above the `AskUserQuestion` block.

```bash
grep -n "Suggested Tier" skills/backlog/refine-mode.md
```
Expected: no table-column occurrence (at most one prose mention inside the Priority lane's guess-vs-label sentence).

```bash
grep -c "↳ trust:" skills/backlog/refine-mode.md
```
Expected: 1 or more (the literal consequence-line template).

```bash
grep -n "Unified table" skills/backlog/refine-mode.md
```
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add skills/backlog/refine-mode.md
git commit -m "Rewrite refine Step 4 into six decision lanes with paste blocks and consequence-line trust — refs #655"
```

### Task 2: Vocabulary sweep + docs cross-reference sync

**Files:**
- Modify: `skills/backlog/refine-mode.md`, `skills/backlog/SKILL.md` (any surviving refine-facing "unscored")
- Modify: `docs/getting-started.md` (the `/claude-tweaks:backlog` paragraph's refine description)
- Modify: `docs/skill-graph.md` (the `/backlog` row's "unified table's Recommended column" wording; the `_shared/trust-table.md` row's "advisory Trust column (Step 3)" wording)
- Check (modify only if it mentions refine's report shape): `skills/help/SKILL.md`

**Interfaces:**
- Consumes: Task 1's lane names and consequence-line shape — describe them exactly as Task 1 wrote them.

- [ ] **Step 1: Enumerate and disposition every "unscored" hit**

```bash
grep -rni "unscored\|not yet scored" skills/backlog/ docs/getting-started.md
```
List every hit in your report with its disposition: refine-facing → reword to "missing priority" or "missing risk/size" (whichever population the sentence actually means); overview-facing (`overview-mode.md`'s risk-value lens and its docs description) → keep, note why. Then apply the rewordings.

- [ ] **Step 2: Rework the three named docs passages**

- `docs/getting-started.md`: in the `/claude-tweaks:backlog` paragraph, replace the "single unified batch confirm" refine description with the lane shape (six lanes by decision kind, one confirm gate, trust as consequence lines fetched only at `trusted`+/`--trust`) — keep the paragraph's length discipline.
- `docs/skill-graph.md` `/backlog` row: "the output becomes the unified table's Recommended column for grant rows directly" → "the output becomes the Grant lane's Recommended value directly".
- `docs/skill-graph.md` `_shared/trust-table.md` row: "Supplies `refine`'s advisory `Trust` column (Step 3)" → "Supplies `refine`'s advisory trust consequence lines (Step 4's Grant lane, fetched only at `trusted`+ or `--trust`)".
- `skills/help/SKILL.md`: grep for "unified table"/refine-report mentions; reword only if present.

- [ ] **Step 3: Verify**

```bash
grep -rni "unscored" skills/backlog/refine-mode.md skills/backlog/SKILL.md
```
Expected: no output.

```bash
grep -n "unified table" docs/skill-graph.md docs/getting-started.md skills/
```
Expected: no refine-facing output (run recursively on skills/ — `grep -rn "unified table" skills/`).

- [ ] **Step 4: Commit**

```bash
git add skills/backlog/ docs/getting-started.md docs/skill-graph.md skills/help/SKILL.md
git commit -m "Retire unscored vocabulary in refine; sync docs to the decision-lane report — refs #655 refs #460"
```

### Task 3: Refine journey

**Files:**
- Create: `docs/journeys/refine-the-backlog-through-decision-lanes.md`

**Interfaces:**
- Consumes: Task 1's lane names and the `--trust`/supervised cheap path from #654 — the journey must describe what the skill text actually says.

- [ ] **Step 1: Write the journey**

Follow the structure of an existing journey (read `docs/journeys/triage-backlog-via-funnel-overview.md` as the template — frontmatter `files:` list, `# title`, Persona/Goal/Entry point/Success state, `## Steps` with per-step Action / Should feel / Should understand). Frontmatter `files:`: `skills/backlog/refine-mode.md`, `skills/backlog/SKILL.md`, `bin/lib/issues/backlog.js`. Four steps:
1. Run `/claude-tweaks:backlog refine` at `supervised` — the cheap path: no trust fetch, the supervised footer states why, `--trust` is the opt-in.
2. Read the lanes — precedence order, one lane per record, count-summary line first.
3. Apply a batch — the confirm gate is the single stop; paste blocks carry the accepted defaults.
4. Resolve a Needs-you row — interactive launchers, no batch; the `Next:` line names the top item.

- [ ] **Step 2: Verify + commit**

```bash
node --test tests/ 2>/dev/null | tail -3
```
Run the journey-related conformance suites if a targeted file exists (`ls tests/ | grep -i journey`); otherwise rely on the controller's central full-suite run.

```bash
git add docs/journeys/refine-the-backlog-through-decision-lanes.md
git commit -m "Add refine decision-lanes journey — refs #655"
```
