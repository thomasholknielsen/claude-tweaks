# Journey Drift-Audit Step (7.8) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new `wrap-up` Step 7.8 (Journey Curation) that always freshly computes journeys whose `files:` frontmatter overlaps the current diff, applies the shared `_shared/journey-self-review.md` checks inline, detects missing-journey gaps, and surfaces a dedicated "Journey updates" section at the Wrap-Up Review Console — mirroring the standalone treatment Step 7 (skill curation) and Step 7.7 (documentation curation, record #56) already get.

**Architecture:** New sub-file `skills/wrap-up/journey-curation.md` (mirrors `docs-health-integration.md`'s shape, minus a domain-overlap-ranking scan — journey scope-selection is a direct diff-vs-`files:`-frontmatter computation, not a fuzzy ranked read, so there is no D0-equivalent and no `--journey-budget` flag). `skills/wrap-up/SKILL.md` gets a new `## Step 7.8: Journey Curation` heading after Step 7.7. `review-console.md` gains a "Journey updates" section between "Documentation updates" and "Configuration updates". This record lands **second** of the two sibling leaves touching `review-console.md` (record #56 already landed), so it owns the deferred cardinality-prose fix ("up to seven" → "up to nine" sections) in both `SKILL.md` and `review-console.md`.

**Tech Stack:** Markdown skill files only — no code, no `npm test` impact (verify it stays green as a no-op check, not a target).

## Global Constraints

- No `--journey-budget` flag — explicitly out of scope per the record's own Deliverables (journey scope-selection is direct computation, not a ranked scan).
- Do **not** invoke `/claude-tweaks:journey-health` or `/claude-tweaks:journeys` as a nested `Skill()` call for the self-review/gap-detection checks — inline `_shared/journey-self-review.md`'s criteria directly, the same reuse pattern `docs-health-integration.md` already uses for `_shared/criteria-docs-diataxis.md` and skill curation uses for `_shared/harness-health-analysis.md`.
- Do **not** cite `/review`'s 3g-cov lens or `_shared/journey-coverage-check.md` as a source of reusable output — independently re-verified during plan authoring (`skills/review/SKILL.md`'s 3g-cov section and `_shared/journey-coverage-check.md`'s own header) that 3g-cov computes journey-to-**story** coverage, never diff-vs-`files:`-frontmatter overlap, and is purely informational with no persisted `decisions.md` write. The diff-vs-journey-file-overlap detection that does exist (`/review` Step 6's `/claude-tweaks:visual-review --mode=recommendation` delegation, also re-verified) writes nothing persistent either — there is no artifact to reuse, so always recompute fresh at wrap-up time.
- **Pre-authoring discovery finding (bake into Task 2, don't wait for whole-branch review to catch it — this is exactly the shape of gap record #56's own plan missed until a 3rd-layer review):** `_shared/journey-self-review.md`'s own header text says "Both consumers apply the same four checks" (`/claude-tweaks:journeys` Step 3.5 and `/claude-tweaks:journey-health`'s light tier — exactly 2, named explicitly). Once this record lands, wrap-up becomes a **third** consumer of the same shared criteria file, and this "Both consumers" framing goes stale the moment Step 7.8 starts applying it. Two more live files independently assert the same "shared between exactly these two skills" framing: `skills/journeys/SKILL.md`'s Relationship-table row for `_shared/journey-self-review.md` ("shared with `/claude-tweaks:journey-health`'s audit-time check") and `skills/journey-health/SKILL.md`'s Relationship-table row for the same file ("shared with `/claude-tweaks:journeys` Step 3.5"). All three need a third-consumer update. None of these 3 files are in this record's own Key Files list — found only by grepping `journey-self-review` repo-wide during plan authoring, not by trusting the record's own Key Files enumeration as complete.
- Cardinality math (pre-computed during planning, not deferred to task execution): 7 original named sections (Auto-applied, Pending review, Low-confidence findings, Contested findings, Skill updates, Configuration updates, Cleanup actions) + Documentation updates (record #56) + Journey updates (this record) = **9** named sections. Queue writes is the **10th**, separate section.
- After every file edit, grep that file for any reference this plan didn't anticipate before moving to the next task — don't trust the Key Files list as necessarily exhaustive (see the discovery finding above).

---

### Task 1: `skills/wrap-up/SKILL.md` — new Step 7.8 heading, Anti-Patterns/Relationship rows, cardinality-prose fix

**Files:**
- Modify: `skills/wrap-up/SKILL.md`

**Interfaces:**
- Consumes: nothing from earlier tasks (first task). Consumes the *existing*, already-landed `## Step 7.7: Documentation Curation` heading (record #56) as the insertion anchor — verified present, ending at the line before `## Step 8: Analyze Next Steps (record- or spec-based only)`.
- Produces: a `## Step 7.8: Journey Curation` heading between Step 7.7 and Step 8 — Task 2 (`journey-curation.md`) and Task 3 (`review-console.md`) reference this heading's exact wording. Also produces the corrected "nine sections" cardinality prose — Task 3 must NOT independently re-derive this number; it consumes the same pre-computed "9 named, Queue writes 10th" fact stated in this plan's Global Constraints.

- [ ] **Step 1: Insert the new `## Step 7.8: Journey Curation` section**

Read `skills/wrap-up/SKILL.md` and find the exact end of Step 7.7 (the paragraph ending "...Step 9's generic Configuration Updates batch table in interactive/standalone mode (Step 9's template is intentionally not split further — see `docs-health-integration.md`'s own Gotcha note)." immediately followed by a blank line and `## Step 8: Analyze Next Steps (record- or spec-based only)`). Insert immediately after that paragraph and before the blank line + Step 8 heading:

```markdown

## Step 7.8: Journey Curation

Analyze whether journeys the current diff touches have drifted out of sync, and detect a persona-facing flow this work introduced with zero journey coverage — based on what was actually built, always recomputed fresh (no reuse of `/review`'s 3g-cov lens, which computes journey-to-story coverage, not diff overlap, and is purely informational with no persisted artifact to reuse). This step runs standalone (not batched with Step 6) for the same reason Steps 7 and 7.7 do — full-file reads and shared-criteria judgment, not a lightweight registry/CLAUDE.md scan.

Unlike Step 7's skill curation and Step 7.7's documentation curation, journey scope-selection is a direct computation — `docs/journeys/*.md` whose `files:` frontmatter overlaps `git diff --name-only` against this work's base ref — not a ranked domain-overlap scan over the whole library. There is no `--journey-budget` flag and no fast-lane-narrows-the-cap behavior to document; the computation itself is cheap and deterministic regardless of ceremony profile.

For the full procedure — the fresh diff-vs-`files:`-frontmatter overlap computation, the inline application of `_shared/journey-self-review.md`'s four checks plus structural-validity check, missing-journey gap detection, and the mandatory null-result summary line — read `journey-curation.md` in this skill's directory.

Journey curation declares "No journey updates needed" only when no journey's `files:` frontmatter overlaps the diff AND missing-journey gap detection finds no persona-facing flow with zero coverage — and even then a mandatory summary line (naming journeys checked, self-review outcome per journey, and gap-detection outcome — see `journey-curation.md`) is logged so the null result is auditable. Findings surface at the Wrap-Up Review Console (Step 8.6) in the "Journey updates" section.
```

- [ ] **Step 2: Add an Anti-Patterns row for journey curation**

In the `## Anti-Patterns` table, after the existing skill-curation and documentation-curation rows (find the row `| Declaring "no documentation updates needed" with no logged scan scope | ... |` — the last of the curation-specific rows added by record #56 — insert immediately after it):

```markdown
| Declaring "no journey updates needed" without checking `files:` frontmatter against the diff | Step 7.8's fresh diff-vs-frontmatter computation exists precisely because build-time `/journeys` and review's 3g-cov lens don't catch drift introduced after their own pass ran — skipping the recomputation reintroduces the exact silent-drift gap this step exists to close |
```

- [ ] **Step 3: Add a Relationship-table row for `/claude-tweaks:journeys` and `/claude-tweaks:journey-health` reflecting Step 7.8**

Find the existing `/claude-tweaks:journeys` relationship... actually this file's Relationship table has no row for `/claude-tweaks:journeys` yet (verify via `grep -n "claude-tweaks:journeys" skills/wrap-up/SKILL.md` — re-derive whether a row already exists before assuming; if the grep is empty, add a new row; if a row already exists from some other change, extend it instead of duplicating). Add (or extend) a row:

```markdown
| `/claude-tweaks:journeys` and `/claude-tweaks:journey-health` | Step 7.8 applies `_shared/journey-self-review.md`'s shared four-check + structural-validity criteria inline to journeys the diff touches (same reuse pattern as `_shared/criteria-docs-diataxis.md` in Step 7.7) — never a nested `Skill()` call to either. |
```

- [ ] **Step 4: Fix the cardinality prose (this record lands second — it owns this fix)**

Find (near the Step 8.6 summary):

```markdown
The Review Console is the **second bookend** of the pipeline (see `_shared/auto-mode-contract.md`). Runs in `auto` or `hybrid` mode when a pipeline run directory exists. Skipped in `interactive` mode and in standalone wrap-up. Reads `decisions.md`, `staged/`, and `config.yml` from the run directory, then presents one consolidated batch table with up to seven sections (Auto-applied / Pending review / Low-confidence findings / Contested findings / Skill updates / Configuration updates / Cleanup actions) and three actions (Approve all / Override / Stop). The two coordination-derived sections (Low-confidence findings, Contested findings) render only when non-empty.
```

Replace `up to seven sections (Auto-applied / Pending review / Low-confidence findings / Contested findings / Skill updates / Configuration updates / Cleanup actions)` with `up to nine sections (Auto-applied / Pending review / Low-confidence findings / Contested findings / Skill updates / Documentation updates / Journey updates / Configuration updates / Cleanup actions)`.

Find:

```markdown
For the run-directory resolution sequence, the multi-spec defer protocol, the full console template with all seven section tables (including the conditionally-rendered Low-confidence and Contested findings sections), approval/override/stop semantics, and the sort-order requirement, read `review-console.md` in this skill's directory.
```

Replace `all seven section tables` with `all nine section tables`.

- [ ] **Step 5: Verify and commit**

```bash
grep -n "up to seven\|seven section" skills/wrap-up/SKILL.md
```

Expect zero matches (both replaced with "nine"). Then:

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/wrap-up-drift-prevention" && pwd && git rev-parse --show-toplevel
```

Confirm both point at the worktree before committing. Then:

```bash
git add skills/wrap-up/SKILL.md
git commit -m "wrap-up: add Step 7.8 journey curation, fix cardinality prose to nine sections

refs #58"
```

---

### Task 2: `skills/wrap-up/journey-curation.md` (new file) + 3-consumer fix in `journey-self-review.md` and its 2 referrers

**Files:**
- Create: `skills/wrap-up/journey-curation.md`
- Modify: `skills/_shared/journey-self-review.md`
- Modify: `skills/journeys/SKILL.md`
- Modify: `skills/journey-health/SKILL.md`

**Interfaces:**
- Consumes: Task 1's `## Step 7.8: Journey Curation` heading text (this file's header must match — "Loaded by `/claude-tweaks:wrap-up` Step 7.8").
- Produces: the full Step 7.8 procedure and its `SCANNED`/mandatory-summary format — Task 3 (`review-console.md`) references this when describing what feeds the "Journey updates" section.

- [ ] **Step 1: Create `skills/wrap-up/journey-curation.md`**

```markdown
# Journey Curation for /wrap-up Step 7.8

Loaded by `/claude-tweaks:wrap-up` Step 7.8 to detect journey drift introduced by this work — journeys whose documented flow has fallen out of sync with the diff — and to detect a persona-facing flow this work introduced with zero journey coverage anywhere. Two checks, both always recomputed fresh: J1 judges journeys the diff touches, J2 judges the diff for missing coverage.

## J1: Diff-vs-frontmatter overlap + inline self-review

**Scope:** every journey file under `docs/journeys/*.md` whose `files:` frontmatter overlaps this work's `git diff --name-only` against the run's base ref. Always computed fresh — never reused from `/review`'s Step 6 visual-review recommendation or the 3g-cov lens (see this skill's own `SKILL.md` Step 7.8 body for why neither produces a reusable, persisted artifact).

For each journey in scope:

1. Read the journey file in full.
2. Apply the four checks and the structural-validity check from `_shared/journey-self-review.md` (persona, step shape, origin coverage, outcome clarity — structural validity checked first) — the identical criteria `/claude-tweaks:journeys` Step 3.5 (write-time) and `/claude-tweaks:journey-health` (audit-time) already apply, reused inline here as this project's third consumer, rather than invoking either skill as a nested call (same reuse pattern `docs-health-integration.md` already applies to `_shared/criteria-docs-diataxis.md`).
3. A structural-validity failure (missing frontmatter, missing `## Steps`, no steps) is a harder failure than the four content checks — treat it as a finding requiring fix, not a soft note.

Route surviving findings by severity, mirroring the shape `_shared/journey-self-review.md`'s own consumers use:

- **Structural-validity failure, or any content-check failure** → collect as `[journey] {file} — {description}` rows, surfaced in the Wrap-Up Review Console's own "Journey updates" section (Step 8.6). Applied inline in Step 10, dispatching the same fix-inline behavior `/claude-tweaks:journeys` Step 3.5 uses (one fix attempt per issue) rather than filing a GitHub issue — wrap-up has full session context on what was just built, unlike `/claude-tweaks:journey-health`'s audit-time pass on journeys nobody has touched recently.

## J2: Missing-journey gap-detection

**Scope:** this work's full diff, not any existing journey — mirrors D2's missing-doc gap detection (record #56's documentation curation) structurally.

Ask: did this work introduce a new persona-facing flow (for any persona: end users, admins, developers, internal tooling users) with **zero journey coverage anywhere** in the project — not merely a flow that doesn't map to J1's touched-journey scope, but something no existing journey documents at all? This is a deliberately high bar, identical in spirit to D2's "zero existing doc coverage anywhere." Examples that clear it: a new slash command with a real end-to-end flow, a new persona-facing capability with no journey even adjacent to it. Examples that don't: a change to an existing flow's implementation with no new persona-facing behavior, a bug fix, an internal refactor.

This check runs independent of what `/claude-tweaks:journeys` Step 1 already concluded during build — it is a wrap-up-time safety net for drift introduced after build's own journey check ran, or for a project where the "journeys build-time recalibration" leaf's 3-signal checklist (record #57) hasn't caught the gap for some other reason.

On a hit:

1. Propose a `[journey] {new-journey-name} — Create: {one-line rationale}` row, folded into the same Journey updates collection as J1's findings.
2. On approval, Step 10 creates the new journey file using `journey-template.md` (in `/claude-tweaks:journeys`' skill directory) and fills in real content from this work's own session context — the same reasoning `docs-health-integration.md`'s D2 already documents for why wrap-up (unlike `/claude-tweaks:init` Phase 8.5) writes real content immediately instead of backlogging a template pointer.

## Mandatory summary (always, regardless of outcome)

Emit exactly one summary line every Step 7.8 run, auto mode or interactive:

```
SCANNED {time} — Step 7.8 journey curation summary: {N} journeys checked ({names}), self-review: {pass/fail per journey}, gap detection: {found/not found}.
Result: {A} fixed inline, {C} new journey(s) created, {G} gap(s) found.
Reversibility: N/A.
```

`{N}`/`{names}` are J1's in-scope journeys (files: frontmatter overlapping the diff — `0`/`none` when no journey overlaps). `{self-review}` summarizes pass/fail per journey checked. `{gap detection}` names whether J2 found a hit. Auto mode appends this line to `decisions.md` under the `SCANNED` tag (see `_shared/auto-decision-log.md`); interactive mode prints the equivalent line inline instead of `decisions.md`.

Declare **"No journey updates needed"** only when J1 finds no journey in scope (or every in-scope journey passes every check) AND J2 finds no missing-journey gap — and even then, the mandatory summary line above is still emitted, naming the journeys checked and the gap-detection outcome. A "no updates needed" outcome that skips the summary line is a Step 7.8 defect, not a valid completion.
```

- [ ] **Step 2: Fix `_shared/journey-self-review.md`'s "Both consumers" framing to name three consumers**

Read the file's current header (line 3):

```markdown
Shared checklist for judging whether a journey file (`docs/journeys/{name}.md`) still holds together — used at *write time* by `/claude-tweaks:journeys` Step 3.5 (right after creating or updating a journey) and at *audit time* by `/claude-tweaks:journey-health`'s light tier (periodically, for journeys nobody has touched recently). Both consumers apply the same four checks; each layers its own response mechanism on top, documented in that consumer's own workflow.
```

Replace with:

```markdown
Shared checklist for judging whether a journey file (`docs/journeys/{name}.md`) still holds together — used at *write time* by `/claude-tweaks:journeys` Step 3.5 (right after creating or updating a journey), at *audit time* by `/claude-tweaks:journey-health`'s light tier (periodically, for journeys nobody has touched recently), and at *wrap-up time* by `/claude-tweaks:wrap-up` Step 7.8 (`journey-curation.md`, for journeys the just-completed work's diff touches). All three consumers apply the same four checks; each layers its own response mechanism on top, documented in that consumer's own workflow.
```

Also update the Structural-validity paragraph's `both consumers` phrase:

```markdown
A journey file is structurally invalid when it's missing required frontmatter, missing the `## Steps` heading, or has no steps at all. Both consumers treat this as a harder failure than the four content checks above, escalating it more strongly than an ordinary check violation — see each consumer's own workflow for its exact response.
```

Replace `Both consumers treat this` with `All three consumers treat this`.

- [ ] **Step 3: Fix `skills/journeys/SKILL.md`'s Relationship-table row for `_shared/journey-self-review.md`**

Find:

```markdown
| `_shared/journey-self-review.md` | Canonical four-check + structural-validity criteria Step 3.5 applies — shared with `/claude-tweaks:journey-health`'s audit-time check. |
```

Replace with:

```markdown
| `_shared/journey-self-review.md` | Canonical four-check + structural-validity criteria Step 3.5 applies — shared with `/claude-tweaks:journey-health`'s audit-time check and `/claude-tweaks:wrap-up` Step 7.8's wrap-up-time check. |
```

- [ ] **Step 4: Fix `skills/journey-health/SKILL.md`'s Relationship-table row for `_shared/journey-self-review.md`**

Find:

```markdown
| `_shared/journey-self-review.md` | Canonical four-check + structural-validity criteria this skill's light tier applies — shared with `/claude-tweaks:journeys` Step 3.5. |
```

Replace with:

```markdown
| `_shared/journey-self-review.md` | Canonical four-check + structural-validity criteria this skill's light tier applies — shared with `/claude-tweaks:journeys` Step 3.5 and `/claude-tweaks:wrap-up` Step 7.8. |
```

- [ ] **Step 5: Verify and commit**

```bash
grep -n "Both consumers" skills/_shared/journey-self-review.md
```

Expect zero matches. Then:

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/wrap-up-drift-prevention" && pwd && git rev-parse --show-toplevel
git add skills/wrap-up/journey-curation.md skills/_shared/journey-self-review.md skills/journeys/SKILL.md skills/journey-health/SKILL.md
git commit -m "wrap-up: add journey-curation.md (Step 7.8), name wrap-up as journey-self-review.md's 3rd consumer

refs #58"
```

---

### Task 3: `skills/wrap-up/review-console.md` — "Journey updates" section, numbering shift, cardinality-prose fix

**Files:**
- Modify: `skills/wrap-up/review-console.md`

**Interfaces:**
- Consumes: Task 1's `Step 7.8` heading name and Task 2's mandatory-summary format (this task's SCANNED-entry sentence must describe Step 7.8's summary line alongside Step 7's and Step 7.7's).
- Produces: the "Journey updates" section renders at item `14` in the console's global sequence, shifting everything after it (`Configuration updates` 14→15, `Cleanup actions` 15→16) — unlike record #56's split-in-place trick, this is a genuinely new row with no existing row to absorb it, so the shift is real and every downstream reference must be updated.

- [ ] **Step 1: Insert the new "Journey updates" section between "Documentation updates" and "Configuration updates"**

Find:

```markdown
#### Documentation updates (from Step 7.7)

| # | Type | Target | Change |
|---|---|---|---|
| 13 | doc | docs/api.md | Document new /auth/refresh endpoint |

#### Configuration updates (from Step 6)

| # | Type | Target | Change |
|---|---|---|---|
| 14 | claude.md | Commands | Add `npm run lint:fix` to test workflow |
```

Replace with:

```markdown
#### Documentation updates (from Step 7.7)

| # | Type | Target | Change |
|---|---|---|---|
| 13 | doc | docs/api.md | Document new /auth/refresh endpoint |

#### Journey updates (from Step 7.8)

| # | Type | Target | Change |
|---|---|---|---|
| 14 | journey | docs/journeys/login-flow.md | Origin-coverage check failed: `src/auth/session.ts` in `files:` but not visited by any step |

#### Configuration updates (from Step 6)

| # | Type | Target | Change |
|---|---|---|---|
| 15 | claude.md | Commands | Add `npm run lint:fix` to test workflow |
```

- [ ] **Step 2: Shift the Cleanup actions example numbering**

Find:

```markdown
#### Cleanup actions (executed in Step 10 after approval)

Render the cleanup rows from the canonical list in `cleanup-procedures.md`, filtered by Condition (e.g., omit the worktree row when no worktree strategy was used). Each row gets a globally-unique # in the shared batch-section sequence (see Numbering rules above). Example:

| # | Type | Action | Details |
|---|---|---|---|
| 15 | cleanup | {row from cleanup-procedures.md canonical list} | {details} |
| ... | cleanup | ... | ... |
```

Replace `| 15 | cleanup |` with `| 16 | cleanup |` (only the leading number changes).

- [ ] **Step 3: Broaden the SCANNED-entry sentence to cover Step 7.8 too**

Find:

```markdown
A `SCANNED` entry (skill curation's scan-summary log line from Step 7, or documentation curation's from Step 7.7 — see `_shared/auto-decision-log.md`) also renders in this section, but with `Status` = `Informational` and `Where` = the step/location it ran at (no commit ref, since nothing was applied) — there is nothing to revert for these rows.
```

Replace with:

```markdown
A `SCANNED` entry (skill curation's scan-summary log line from Step 7, documentation curation's from Step 7.7, or journey curation's from Step 7.8 — see `_shared/auto-decision-log.md`) also renders in this section, but with `Status` = `Informational` and `Where` = the step/location it ran at (no commit ref, since nothing was applied) — there is nothing to revert for these rows.
```

- [ ] **Step 4: Add a dedicated "On approval" step for Journey updates, renumber the rest**

Find:

```markdown
## On approval (option 1)

1. Apply all staged patches in `staged/` for items 5–7 (run `git apply` or equivalent for each)
2. Apply skill updates and create new skills (items 11–12, from Step 7)
3. Apply documentation updates (item 13, from Step 7.7) — including any approved missing-doc scaffolding (D2) and restructural docs-health filings (D1)
4. Apply config updates (item 14: CLAUDE.md, rules, ADRs)
5. Execute cleanup actions (items 15–21) — Step 10 picks these up
6. For each `Q#` queue write, prompt the user per item via its own `AskUserQuestion` call. On Apply (or Edit, after the modification): create the record — `gh issue create` (`work-backend: github-issues`) or `local-store.js`'s `writeRecord` (`work-backend: local-files`), reading `Title:`/`Type:`/`Labels:` and the body from the item's staged file (`staged/leftover-{slug}.md` for leftover-routed items; other sources use their own staged-file shape). Skip drops the proposal — log the decline to `decisions.md` with the user's stated reason, or "declined, no reason given" when none was offered.
7. Commit with a wrap-up message
8. Proceed to Step 9 (Present Consolidated Summary)
```

Replace with:

```markdown
## On approval (option 1)

1. Apply all staged patches in `staged/` for items 5–7 (run `git apply` or equivalent for each)
2. Apply skill updates and create new skills (items 11–12, from Step 7)
3. Apply documentation updates (item 13, from Step 7.7) — including any approved missing-doc scaffolding (D2) and restructural docs-health filings (D1)
4. Apply journey updates (item 14, from Step 7.8) — including any approved missing-journey scaffolding (J2) and self-review fixes (J1)
5. Apply config updates (item 15: CLAUDE.md, rules, ADRs)
6. Execute cleanup actions (items 16–22) — Step 10 picks these up
7. For each `Q#` queue write, prompt the user per item via its own `AskUserQuestion` call. On Apply (or Edit, after the modification): create the record — `gh issue create` (`work-backend: github-issues`) or `local-store.js`'s `writeRecord` (`work-backend: local-files`), reading `Title:`/`Type:`/`Labels:` and the body from the item's staged file (`staged/leftover-{slug}.md` for leftover-routed items; other sources use their own staged-file shape). Skip drops the proposal — log the decline to `decisions.md` with the user's stated reason, or "declined, no reason given" when none was offered.
8. Commit with a wrap-up message
9. Proceed to Step 9 (Present Consolidated Summary)
```

- [ ] **Step 5: Update "On override"'s item-range reference**

Find:

```markdown
1. Parse the user's overrides for items 1–21
```

Replace with:

```markdown
1. Parse the user's overrides for items 1–22
```

- [ ] **Step 6: Fix the cardinality prose (this record lands second — it owns this fix, per this plan's Global Constraints pre-computed math: 9 named sections, Queue writes 10th)**

Find:

```markdown
- The console has **up to seven named batch sections** — Auto-applied, Pending review, Low-confidence findings, Contested findings, Skill updates, Configuration updates, Cleanup actions (the two coordination-derived sections render only when non-empty — see `wrap-up/SKILL.md`'s own "up to seven sections" summary of this same console). Together they use a **single global sequence** starting at #1: every row across every present section has a unique number, with no restart between sections.
- Queue writes is an eighth, separate section. It uses its own **`Q`-prefixed sequence** (`Q1`, `Q2`, …) because those items require per-item approval and are NOT part of the global "Approve all" choice — it is never counted into the seven batch sections above.
```

Replace with:

```markdown
- The console has **up to nine named batch sections** — Auto-applied, Pending review, Low-confidence findings, Contested findings, Skill updates, Documentation updates, Journey updates, Configuration updates, Cleanup actions (the two coordination-derived sections — Low-confidence findings, Contested findings — render only when non-empty — see `wrap-up/SKILL.md`'s own "up to nine sections" summary of this same console). Together they use a **single global sequence** starting at #1: every row across every present section has a unique number, with no restart between sections.
- Queue writes is a tenth, separate section. It uses its own **`Q`-prefixed sequence** (`Q1`, `Q2`, …) because those items require per-item approval and are NOT part of the global "Approve all" choice — it is never counted into the nine batch sections above.
```

- [ ] **Step 7: Verify and commit**

```bash
grep -n "up to seven\|an eighth\|items 1–21\|items 15–21" skills/wrap-up/review-console.md
```

Expect zero matches. Then:

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/wrap-up-drift-prevention" && pwd && git rev-parse --show-toplevel
git add skills/wrap-up/review-console.md
git commit -m "wrap-up: add Journey updates section to Review Console, fix cardinality to nine

refs #58"
```

---

### Task 4: `CLAUDE.md` — Structure table update

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: Task 2's `journey-curation.md` file (must exist for this reference to be accurate) and its J1/J2 vocabulary.
- Produces: nothing consumed by later tasks (last task).

- [ ] **Step 1: Add `journey-curation.md` to the wrap-up row's sub-files list and description**

Find the current wrap-up row (re-derive the exact live text via `grep -n "^| wrap-up |" CLAUDE.md` — do not assume it matches any text quoted in an earlier plan, since record #56 already modified this row once):

```bash
grep -n "^| wrap-up |" CLAUDE.md
```

Add `journey-curation.md` to the sub-files list (second column, comma-separated list — insert after `docs-health-integration.md`, before `unblocked-records.md`, matching this record's own step-order position — 7.8 after 7.7): `..., docs-health-integration.md, journey-curation.md, unblocked-records.md`.

In the description column (third column), add a clause for Step 7.8, positioned after the Step 7.7 clause and before the Step 8 clause: `Step 7.8 journey curation (fresh diff-vs-files:-frontmatter overlap computation, inline _shared/journey-self-review.md four-check + structural-validity application, missing-journey gap detection, mandatory SCANNED summary) — same standalone treatment as Step 7 skill curation and Step 7.7 documentation curation;`.

Read the edited row back in full and confirm both insertions landed in the right position and the row is still valid markdown-table syntax (no stray `|` characters, no broken cell boundaries).

- [ ] **Step 2: Confirm `npm test` is unaffected**

```bash
npm test 2>&1 | tail -20
```

Expect the same pass count as before this record's changes.

- [ ] **Step 3: Verify and commit**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/wrap-up-drift-prevention" && pwd && git rev-parse --show-toplevel
git add CLAUDE.md
git commit -m "CLAUDE.md: add journey-curation.md to wrap-up's Structure row

refs #58"
```

---

## Self-Review Notes (completed during plan authoring)

1. **Spec coverage** — all 7 acceptance criteria map to a task: Step 7.8 heading positioned correctly against the *actual* landed Step 7.7 (Task 1 Step 1, verified against live file, not assumed), journey-curation.md not citing 3g-cov as reusable (Task 2 Step 1, independently re-verified against live `skills/review/SKILL.md` and `_shared/journey-coverage-check.md` during planning), inline application with no nested Skill() calls (Task 2 Step 1's J1 body), review-console.md's distinct "Journey updates" section (Task 3 Step 1), the cardinality fix owned by this second-landing leaf (Task 1 Step 4 + Task 3 Step 6, using pre-computed "nine" math so neither task has to guess), CLAUDE.md Structure row (Task 4), `npm test` unaffected (Task 4 Step 2).
2. **Placeholder scan** — no TBD/TODO; every step shows literal before/after text.
3. **Type consistency** — N/A (markdown-only).
4. **Pre-authoring discovery (folded into Task 2, not deferred to a later "Task 5 discovered mid-build" the way record #56 needed)** — grepped `journey-self-review` repo-wide before finalizing this plan and found 2 live files (`skills/journeys/SKILL.md`, `skills/journey-health/SKILL.md`) plus the shared file's own header asserting "exactly 2 consumers," none of which are in the record's own Key Files list. Folded the fix into Task 2 from the start.
5. **Blocked-by verified satisfied** — confirmed via live `grep -n "Journey updates" skills/wrap-up/review-console.md` returning zero matches before writing this plan (record #56 landed cleanly, no partial/conflicting state).

## Execution Handoff

Executing via **Subagent-Driven Development** (`superpowers:subagent-driven-development`) — fresh subagent per task, task-scoped review + fix-and-re-review loop, followed by a final whole-branch review, matching the pattern used for records #54, #55, and #56 in this same multi-record `/flow` run. SDD progress/briefs/reports namespaced under `.superpowers/sdd/r58/` to avoid collision with prior records' own SDD state. Task order matters (each of Tasks 1-4 consumes an earlier task's exact wording) — run sequentially.
