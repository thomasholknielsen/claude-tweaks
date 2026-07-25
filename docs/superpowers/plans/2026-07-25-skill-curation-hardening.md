# Skill Curation Hardening (record #54) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/claude-tweaks:wrap-up` Step 7 (skill curation) log a mandatory summary on every run (including null results), broaden `_shared/harness-health-analysis.md`'s new-skill gap-detection signal to catch single-module reuse, and add a fold-into-existing-skill branch to the new-skill qualification gate.

**Architecture:** All changes are to skill-markdown prose (SKILL.md / shared procedure files) — no `bin/lib/*` code is touched. Each task is a targeted, verbatim `Edit` against an exact quoted location, verified by re-reading the edited section and grepping sibling consumer files for now-stale paraphrases.

**Tech Stack:** Markdown skill files only. Verification is `npm test` (confirms the untouched `bin/lib/*` suite still passes) plus manual grep-based consistency checks (there is no automated test harness for skill-file prose).

## Global Constraints

- No `bin/lib/*` code may be touched by this leaf (record #54's own acceptance criterion).
- `oldString` for every `Edit` call must be an exact, unique, verbatim quote from the target file (per `_shared/harness-health-analysis.md`'s own Finding Shape rule, which this leaf is editing — dogfood it).
- Do not weaken the existing ≥2-of-3 new-skill qualification gate while broadening Step 3's input signals (record #54's own Gotcha).
- This project's CLAUDE.md: "Don't consider a stale cross-skill relationship description fixed after correcting the first place it appears" — re-grep all three consumers of `harness-health-analysis.md` after editing it.

---

### Task 1: Null-result logging in skill curation (Step 7.6 + wrap-up SKILL.md's two references) + new auto-decision-log status tag

**Files:**
- Modify: `skills/wrap-up/skill-curation.md` (section `## 7.6: Stage or Present`)
- Modify: `skills/wrap-up/SKILL.md:200` (Step 7 prose paragraph) and `skills/wrap-up/SKILL.md:309` (Step 9 summary template) and `skills/wrap-up/SKILL.md` Anti-Patterns table (new row)
- Modify: `skills/_shared/auto-decision-log.md` (Status-semantics table — add `SCANNED` tag)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: the `SCANNED` status-log tag other null-result-logging leaves in this same decomposition (#56 docs curation, #58 journey drift-audit) may reuse — do not rename it later without checking those.

- [ ] **Step 1: Add the `SCANNED` tag to `_shared/auto-decision-log.md`'s Status-semantics table**

  Read the file, locate the exact 3-row table (`AUTO` / `STAGED` / `KEPT-PROMPT`), and add a fourth row immediately after `KEPT-PROMPT`:

  ```
  | `SCANNED` | Skill ran its independent scan/gap-detection and found nothing actionable. Not a decision — a report that the scan ran and its scope. | Shown in "Auto-applied" section as an informational line (no action to override). |
  ```

  Use `Edit` with `old_string` set to the exact `KEPT-PROMPT` row line (`| \`KEPT-PROMPT\` | Skill could not auto-resolve (floor failed or item is in "not silenced" list). Asked user inline. | Already resolved — informational entry only. |`) and `new_string` set to that same line followed by the new `SCANNED` row on the next line.

- [ ] **Step 2: Rewrite `skill-curation.md`'s 7.6 to require the mandatory summary line**

  In `skills/wrap-up/skill-curation.md`, section `## 7.6: Stage or Present`, after the numbered auto-mode list (currently ending at item 4, the "New skill candidates" bullet) and before the "Staged items surface at the Wrap-Up Review Console..." sentence, insert a new numbered item 5:

  ```markdown
  5. **Mandatory summary (always, regardless of outcome)** — emit exactly one summary line every Step 7 run, auto mode or interactive:
     ```
     SCANNED {time} — Step 7 skill curation summary: {S} seeds, {R} skills read
     (top-{cap}: {names}), gap detection: {what was examined, found/not found}.
     Result: {N} applied, {M} staged, {K} new-skill candidates ({proposed}/{declined}).
     ```
     `{S}` is 7.1's seed count. `{R}` counts the skills actually read in 7.2's independent scan — the union of the ranked top-`{cap}` set and any seeded skills from 7.1 (the same "read set" 7.2 step 5 defines). `{cap}` is 7.2's own existing default-5/fast-lane-2/`--skill-budget`-override value. When `{S}` is 0, render `{names}` as the literal text `none (no seeds)`. Auto mode appends this line to `decisions.md` under the `SCANNED` tag (see `_shared/auto-decision-log.md`); interactive mode prints the equivalent line inline instead of `decisions.md`.
  ```

  Then replace the existing sentence:

  > Declare **"No skill updates needed"** only when 7.1 found no seeds, 7.2's scan found no relevant skills and no gap candidates, and 7.3-7.5 produced no candidates. Do not declare it merely because no ledger entries were tagged.

  with:

  > Declare **"No skill updates needed"** only when 7.1 found no seeds, 7.2's scan found no relevant skills and no gap candidates, and 7.3-7.5 produced no candidates — and even then, the mandatory summary line above (item 5) is still emitted, naming the seed count, skills read, and gap-detection outcome. A "no updates needed" outcome that skips the summary line is a Step 7 defect, not a valid completion. Do not declare it merely because no ledger entries were tagged.

  Use `Edit` with exact verbatim `old_string`/`new_string` for both edits (verify against the file read in Step 0 before writing).

- [ ] **Step 3: Update `wrap-up/SKILL.md`'s Step 7 prose paragraph (line 200)**

  Exact current text (verify by reading the file first — do not trust this plan's line numbers, re-locate by content):

  ```
  Skill curation declares "No skill updates needed" only when seeds, the independent scan, and gap detection all come up empty — never merely because no ledger entry was tagged. Staged updates and new-skill candidates surface at the Wrap-Up Review Console (Step 8.6), or the interactive batch table per `skill-curation.md`.
  ```

  Replace with:

  ```
  Skill curation declares "No skill updates needed" only when seeds, the independent scan, and gap detection all come up empty — never merely because no ledger entry was tagged, and even then a mandatory `SCANNED` summary line (naming the seed count, skills read, and gap-detection outcome — see `skill-curation.md` 7.6) is logged so the null result is auditable. Staged updates and new-skill candidates surface at the Wrap-Up Review Console (Step 8.6), or the interactive batch table per `skill-curation.md`.
  ```

- [ ] **Step 4: Update `wrap-up/SKILL.md`'s Step 9 summary template line**

  Exact current text: `Resolved in Step 7 — {N} updates applied / 0 updates needed.`

  Replace with: `Resolved in Step 7 — {N} updates applied, {M} staged, {K} new-skill candidates ({proposed}/{declined}); {R} skills read, gap detection: {found/not found}. See \`decisions.md\` for the full \`SCANNED\` summary line.`

- [ ] **Step 5: Add a new Anti-Patterns table row to `wrap-up/SKILL.md`**

  Find the Anti-Patterns table (contains the existing row starting `| Skipping skill curation because nothing was ledger-tagged |`). Add a new row immediately after it:

  ```
  | Declaring "no skill updates needed" with no logged scan scope | The null result is unfalsifiable without a record of what was scanned and how deep the ranking went — Step 7's mandatory `SCANNED` summary line (`skill-curation.md` 7.6) exists precisely so "nothing needed updating" is auditable, not just asserted |
  ```

- [ ] **Step 6: Verify and commit**

  ```bash
  grep -n "SCANNED" skills/_shared/auto-decision-log.md skills/wrap-up/skill-curation.md skills/wrap-up/SKILL.md
  ```
  Expected: at least one match in each of the three files.
  ```bash
  npm test
  ```
  Expected: PASS (unmodified — no `bin/lib/*` touched).
  ```bash
  git add skills/wrap-up/skill-curation.md skills/wrap-up/SKILL.md skills/_shared/auto-decision-log.md
  git commit -m "Add mandatory SCANNED summary line to wrap-up skill curation (Step 7)

refs #54"
  ```

---

### Task 2: Broaden new-skill gap-detection Step 3 with a fourth signal (single-module reuse)

**Files:**
- Modify: `skills/_shared/harness-health-analysis.md` (`## Step 3: New-Skill Gap Detection`)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: the fourth bullet signal Task 3's Step 4 domain-fit check applies to candidates this signal admits.

- [ ] **Step 1: Read the current Step 3 section**

  Re-read `skills/_shared/harness-health-analysis.md`'s `## Step 3: New-Skill Gap Detection` section in full (already quoted in this plan's context above) to get the exact bullet list text before editing.

- [ ] **Step 2: Add the fourth signal**

  Exact current text (the three-bullet list ending the section):

  ```
  - A new top-level directory with 3+ files sharing a naming convention (e.g. `*.queue.js`, `*Repository.ts`).
  - A recurring import combination (the same 2+ modules imported together) appearing in 3+ files with no matching skill.
  - A commit-message keyword or phrase recurring across 3+ commits, none of which are covered by an existing skill's domain.
  ```

  Replace with (adds a fourth bullet, no change to the first three):

  ```
  - A new top-level directory with 3+ files sharing a naming convention (e.g. `*.queue.js`, `*Repository.ts`).
  - A recurring import combination (the same 2+ modules imported together) appearing in 3+ files with no matching skill.
  - A commit-message keyword or phrase recurring across 3+ commits, none of which are covered by an existing skill's domain.
  - A single new file/module reused (imported/called) from 2+ other files, where the reused interface is itself non-trivial (2+ exported functions/methods, or a documented options/config surface — not a one-line wrapper). Requires actual 2+ call sites with a non-trivial interface; a module with a single call site, however well-designed, does not qualify under this signal — there is no softer "clearly designed for reuse" alternate clause, to keep this signal as mechanically anchored as the other three.
  ```

- [ ] **Step 3: Verify and commit**

  ```bash
  grep -n "non-trivial (2+ exported" skills/_shared/harness-health-analysis.md
  npm test
  git add skills/_shared/harness-health-analysis.md
  git commit -m "Broaden harness-health-analysis Step 3 with single-module-reuse gap signal

refs #54"
  ```

---

### Task 3: Fold-into-existing-skill branch on Step 4's qualification gate + per-consumer scope note

**Files:**
- Modify: `skills/_shared/harness-health-analysis.md` (`## Step 4: New-Skill Qualification Gate`)

**Interfaces:**
- Consumes: Task 2's fourth signal (referenced in the scope-note text below, not a code dependency — safe to run in either order, but written assuming Task 2 already landed so cross-references read correctly).
- Produces: `kind: "patch"` as a valid Step 4 output alongside the existing `kind: "new-skill"` / drop outcomes — read by `skill-curation.md`'s 7.3-7.5 (already generic: "Apply the full procedure... Emit findings in the Finding Shape that file defines").

- [ ] **Step 1: Read the current Step 4 section**

  Re-read `skills/_shared/harness-health-analysis.md`'s `## Step 4: New-Skill Qualification Gate` section (already quoted in this plan's context above).

- [ ] **Step 2: Add the fold-into-existing-skill branch after the existing gate**

  Exact current text (the full Step 4 section body):

  ```
  Evaluate each gap candidate (from Step 3, or seeded by a caller — e.g. wrap-up's `[skill: NEW - {name}]` ledger tags) against three criteria:

  1. **Reusability** — the pattern applies to 2+ future builds, not a one-off.
  2. **Complexity** — the pattern is non-obvious (simple conventions belong in CLAUDE.md, not a skill).
  3. **Project-specific** — the pattern is specific to this project, not generic best practice.

  **Propose the candidate when at least 2 of the 3 criteria are clearly met.** A candidate meeting all three is a strong recommendation; one meeting exactly two is proposed for human review. A candidate meeting ≤1 criterion is dropped — note which criteria were missing so the decision is auditable.
  ```

  Replace with (appends a new paragraph after the existing gate — the gate itself is unchanged):

  ```
  Evaluate each gap candidate (from Step 3, or seeded by a caller — e.g. wrap-up's `[skill: NEW - {name}]` ledger tags) against three criteria:

  1. **Reusability** — the pattern applies to 2+ future builds, not a one-off.
  2. **Complexity** — the pattern is non-obvious (simple conventions belong in CLAUDE.md, not a skill).
  3. **Project-specific** — the pattern is specific to this project, not generic best practice.

  **Propose the candidate when at least 2 of the 3 criteria are clearly met.** A candidate meeting all three is a strong recommendation; one meeting exactly two is proposed for human review. A candidate meeting ≤1 criterion is dropped — note which criteria were missing so the decision is auditable.

  **Fold-into-existing-skill branch (ordering, explicit).** This gate runs first, unchanged, exactly as above — a candidate that fails it (≤1 criterion met) is dropped outright, full stop; the domain-fit check below never becomes a second path around the gate, and a signal-4-admitted candidate's reusability/complexity/project-specificity criteria must still be judged independently, never assumed satisfied by the fact that signal 4 (Step 3's single-module-reuse signal) admitted it. Only for a candidate that already clears the ≥2-of-3 gate: check whether an existing skill's domain — read that skill's **full body**, not just its frontmatter `description`; a superficial keyword match against a broad or catch-all description is not sufficient evidence of genuine fit — already reasonably covers this territory.
  - **If yes**, propose a `kind: "patch"` to that skill instead of a new file (Finding Shape's `patch` fields: `section`/`oldString`/`newString`).
  - **If no** existing skill's domain fits, propose `kind: "new-skill"` as before.

  **Per-consumer domain-fit scope.** The domain-fit check's comparison scope differs by which of the three consumers (see the table at the top of this file) is running it: `/claude-tweaks:wrap-up` Step 7 already has a bounded read set (7.2's top-cap ∪ seeds) to check the candidate against — reuse it, no extra reads needed. Standalone `/claude-tweaks:harness-health` and `/claude-tweaks:init` Phase 3/6 have no equivalent pre-bounded skill list for this check — for those two, scan the full skill library's frontmatter `description` fields (a cheap scan, not a full-body read for every skill), then read the full body only of any skill whose description plausibly matches before deciding fit.
  ```

- [ ] **Step 3: Verify and commit**

  ```bash
  grep -n "Fold-into-existing-skill branch" skills/_shared/harness-health-analysis.md
  npm test
  git add skills/_shared/harness-health-analysis.md
  git commit -m "Add fold-into-existing-skill branch to harness-health-analysis Step 4 gate

refs #54"
  ```

---

### Task 4: Cross-consumer stale-reference sweep + final acceptance-criteria verification

**Files:**
- Read-only check: `skills/wrap-up/skill-curation.md`, `skills/harness-health/SKILL.md`, `skills/init/SKILL.md`

**Interfaces:**
- Consumes: the edited state of `harness-health-analysis.md` from Tasks 2-3, and `skill-curation.md`/`wrap-up/SKILL.md` from Task 1.
- Produces: nothing further downstream — this is the plan's final verification task.

- [ ] **Step 1: Grep all three consumers for a stale two-outcome-gate paraphrase**

  ```bash
  grep -n "propose.*new-skill.*or.*drop\|two.outcome\|only two outcomes" skills/wrap-up/skill-curation.md skills/harness-health/SKILL.md skills/init/SKILL.md
  ```

  Expected: no matches (confirmed during plan-authoring — neither `harness-health/SKILL.md` nor `init/SKILL.md` restate Step 3/4's shape inline; both just say "apply the full procedure in `_shared/harness-health-analysis.md`"). If a match is found, read the surrounding paragraph and update it to reflect the `kind: "patch"` fold-in outcome from Task 3 — do not skip this even though the pre-check found nothing, since Tasks 1-3's edits are new since that pre-check.

- [ ] **Step 2: Full acceptance-criteria pass**

  Re-read record #54's Acceptance Criteria section (materialized at `.claude-tweaks/pipelines/2026-07-25T065327-spec-54-55-56-57-58/spec-54/work/54-spec.md`) and confirm each checkbox against the actual edited files:
  - [ ] Null-result summary line — `skill-curation.md` 7.6 item 5 (Task 1).
  - [ ] Step 3's fourth signal requires actual 2+ call sites, no softer clause — Task 2.
  - [ ] Step 4 documents gate-then-domain-fit ordering explicitly, `kind: "patch"` output — Task 3.
  - [ ] All three consumers re-read, scope difference documented in the shared file itself — Task 3's "Per-consumer domain-fit scope" paragraph + this task's Step 1 sweep.
  - [ ] `wrap-up/SKILL.md` Anti-Patterns row added — Task 1 Step 5.
  - [ ] `npm test` passes unmodified — run once more here as the final gate.

  ```bash
  npm test
  ```

  Expected: PASS. If any checkbox above is unmet, return to the relevant task and fix before considering record #54 built.

- [ ] **Step 3: Final commit (only if Step 1 found and fixed a stale reference)**

  ```bash
  git add -A
  git commit -m "Sweep harness-health-analysis consumers for stale two-outcome references

refs #54"
  ```

  Skip this step entirely if Step 1 found nothing to fix (the common case, per the pre-check above) — do not create an empty commit.
