# Tidy: Design Quality Extract Recommendation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `/claude-tweaks:tidy` Step 5.5's cross-spec pattern scan to also read the review summary's "Design Quality" section, and add one new signal row that recommends `/impeccable:impeccable extract` when the same Design Quality category recurs across 3+ specs — closing the gap where a repeated UI pattern gets independently flagged spec-by-spec with nothing ever connecting the dots.

**Architecture:** A single prose edit to one existing skill markdown file, following the approach approved in the design doc: extend Step 5.5's "How to scan" step 3 to also extract findings from the Design Quality section (by its own `category` field, a separate vocabulary from the existing Code Review Findings taxonomy), and add one new row to the "What to look for" signal table. No new gating, no new threshold, no format change to the `[pattern]` collection line.

**Tech Stack:** Markdown skill files (Claude Code plugin content). No code, no build step. Verification is grep-based consistency checking, not `node --test` — matching the prose-only threads in this series (`2026-07-08-animate-frequency-gate.md`, `2026-07-08-design-decisions-log-compliance.md`).

## Global Constraints

- **This is a scan-scope extension, not a new mechanism.** The new signal row reuses the existing `[pattern] {description} — seen in {spec list} — {recommendation}` collection format verbatim — do not invent a new collection prefix or a new rendering path.
- **No new threshold.** The new row uses "3+ specs," matching every existing row in the table. Do not introduce a different number or a config knob.
- **No gating on `design-integration` or any other flag.** A project with no Design Quality sections in its review summaries simply yields nothing from the new extraction step — this is intentional (see design doc's Non-Goals) and matches how every other row in this table already behaves (scan what exists).
- **Scope boundary:** only `skills/tidy/scan-procedures.md` changes. Do not touch `skills/tidy/SKILL.md` or any other file — the Cross-Spec Patterns table rendering and the `[pattern]` routing are unchanged and out of scope.
- **No test suite applies:** `npm test` (this repo's `node --test` suite) covers `bin/` JS and hook logic, not skill markdown prose. Do not add or modify any `.test.js` file for this plan.

---

### Task 1: Extend Step 5.5's scan to include Design Quality findings

**Files:**
- Modify: `skills/tidy/scan-procedures.md` (Step 5.5's "How to scan" step 3; "What to look for" table)

**Interfaces:**
- Consumes: nothing from other tasks — this is the only task in this plan.
- Produces: nothing consumed by later tasks (single-task plan).

- [ ] **Step 1: Extend "How to scan" step 3 and add the new table row**

In `skills/tidy/scan-procedures.md`, find this exact existing text:

```markdown
3. Extract findings by category (Security, Convention, Performance, Error Handling, Architecture, Test Quality)

### What to look for

| Signal | Example | Recommendation |
|--------|---------|---------------|
| Same finding category in 3+ reviews | "Convention: import from shared package" in specs 41, 43, 45 | Add rule to CLAUDE.md or `.claude/rules/` |
| Same file flagged across specs | `src/utils/validate.ts` modified and reviewed in 4 specs | Refactor — this file may be a responsibility magnet |
| Same gotcha rediscovered | "Use upsert not delete+insert" in 3 spec Gotchas | Add to CLAUDE.md as a project convention |
| Recurring deferred items with similar themes | "Add error boundary" deferred in 3 specs | Promote to its own spec — it's not going away |

→ Collect each as: `[pattern] {description} — seen in {spec list} — {recommendation}`
```

Replace it with:

```markdown
3. Extract findings by category (Security, Convention, Performance, Error Handling, Architecture, Test Quality) from the Code Review Findings section. Also read each review summary's Design Quality section (present when `/claude-tweaks:review` Step 6.5 ran and Impeccable returned findings) and extract those findings by their own `category` field — a separate vocabulary (Impeccable's categories: typography, spacing, color, component, and others), not the Code Review Findings taxonomy above.

### What to look for

| Signal | Example | Recommendation |
|--------|---------|---------------|
| Same finding category in 3+ reviews | "Convention: import from shared package" in specs 41, 43, 45 | Add rule to CLAUDE.md or `.claude/rules/` |
| Same file flagged across specs | `src/utils/validate.ts` modified and reviewed in 4 specs | Refactor — this file may be a responsibility magnet |
| Same gotcha rediscovered | "Use upsert not delete+insert" in 3 spec Gotchas | Add to CLAUDE.md as a project convention |
| Recurring deferred items with similar themes | "Add error boundary" deferred in 3 specs | Promote to its own spec — it's not going away |
| Same Design Quality category recurring in 3+ reviews | "component" findings in specs 41, 44, 47's Design Quality sections (a card/button/layout pattern reimplemented each time) | Run `/impeccable:impeccable extract` — this pattern is being reimplemented, not reused |

→ Collect each as: `[pattern] {description} — seen in {spec list} — {recommendation}`
```

- [ ] **Step 2: Verify the edit landed correctly**

Run:

```bash
grep -n "Design Quality" skills/tidy/scan-procedures.md
```

Expected: exactly 2 matching lines — the extended step 3 sentence, and the new table row (both "Design Quality" mentions in the row's Signal and Example cells land on the same line, counting as one match).

Run:

```bash
grep "^| Same Design Quality" skills/tidy/scan-procedures.md | grep -o '|' | wc -l
```

Expected: `4` (3 columns = 4 pipe characters: leading, 2 internal separators, trailing). A different count means a stray `|` broke the table — check for an unescaped pipe inside the row's prose (there shouldn't be one; this row's text uses no literal `|` outside the column separators).

Run:

```bash
grep -n "impeccable extract" skills/tidy/scan-procedures.md
```

Expected: exactly 1 match — inside the new row's Recommendation cell.

- [ ] **Step 3: Full-file consistency check**

Run:

```bash
grep -c "^|" skills/tidy/scan-procedures.md
```

Expected: `59` — the file has `58` lines starting with `|` before this edit (verified 2026-07-09); the table gained exactly one row (the header, separator row, and all four pre-existing rows are unchanged), so the post-edit count is `58 + 1 = 59`. A different count means either the new row wasn't added, or an unrelated table elsewhere in the file was accidentally touched.

- [ ] **Step 4: Commit**

```bash
git add skills/tidy/scan-procedures.md
git commit -m "Add Design Quality extract recommendation to tidy's cross-spec pattern scan"
```

---

## Self-Review Notes

- **Spec coverage:** Design doc's single "Changes" section (extend "How to scan" step 3 + new table row) maps 1:1 onto this plan's one task. Design doc's "Testing" section (manual consistency checking — pipe count, coherent prose) → Task 1 Step 2.
- **Placeholder scan:** No TBD/TODO; the one step shows exact before/after text and exact commands with expected output. No code-step placeholders since this plan contains no code.
- **Type consistency:** N/A — no code, no cross-task interfaces (single task). The one repeated term, `category`, is used consistently to mean "Impeccable's Design Quality category vocabulary" throughout the new sentence and the new row — not confused with the pre-existing Code Review Findings category taxonomy it's explicitly distinguished from.
