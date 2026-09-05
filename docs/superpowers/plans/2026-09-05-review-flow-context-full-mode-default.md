# Review flow-context full-mode default Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/claude-tweaks:review`'s documented "flow invokes review in full mode by default" promise self-enforcing, so a flow executor who omits the literal `full` token still gets full mode whenever `$PIPELINE_RUN_DIR` is set.

**Architecture:** `plugin/skills/review/SKILL.md`'s Input resolution section is a purely token-based numbered list (rules 1-8); rules 1 and 7 both resolve to `Mode: code` with no flow-context awareness. Add one note after the numbered list that promotes rules 1 and 7 to full mode when `$PIPELINE_RUN_DIR` is set and no explicit mode token (`full`/`visual`/`journey:`/`discover`) is present in `$ARGUMENTS`. Then update `plugin/skills/flow/SKILL.md`'s Step 4 prose, which currently asserts the full-mode-by-default behavior with no stated mechanism, to point at this new self-enforcing rule instead of restating the unenforced claim.

**Tech Stack:** Markdown skill files (no code, no build step). Prose-only change.

**Spec:** `.claude-tweaks/pipelines/2026-09-05T143054-record-1570/work/1570-spec.md` (materialized from GitHub issue #1570)

## Global Constraints

- Ceremony: fast-lane (per this run's materialized header) — narrow prose fix, no formal architecture-alignment pass needed.
- Do not alter standalone (no `$PIPELINE_RUN_DIR`) resolution for rules 1/7 — must still resolve to code mode there (AC2).
- An explicit mode token must always win over the new flow-context default (AC3).
- No existing `tests/*.test.js` byte-pins the "Input resolution" or "full mode by default" prose in either file (confirmed via grep before writing this plan) — no test file needs updating alongside the prose change.

---

### Task 1: Add self-enforcing flow-context default to review's Input resolution

**Files:**
- Modify: `plugin/skills/review/SKILL.md` (Input resolution section, after the numbered "Resolve the input" list, before "## Code-Mode Procedure")

**Interfaces:**
- Consumes: nothing (prose-only, no code interfaces)
- Produces: a documented rule any implementer/reader of `review/SKILL.md`'s Input resolution can point to — the exact sentence Task 2 references by name ("the flow-context default note" / "Input resolution's flow-context default").

- [ ] **Step 1: Read the current Input resolution section**

Read `plugin/skills/review/SKILL.md` lines 46-61 (the `## Input` section through the end of the numbered "Resolve the input" list and its closing paragraph) to confirm current line numbers before editing — the file may have shifted slightly since this plan was drafted.

- [ ] **Step 2: Insert the flow-context default note**

Immediately after rule 8 (the Effort token rule) and its closing paragraph ("In visual, journey, and discover modes, delegate entirely to `/claude-tweaks:visual-review`..."), insert a new paragraph:

```markdown
**Flow-context default.** When `$PIPELINE_RUN_DIR` is set (this invocation is running inside `/claude-tweaks:flow`) and none of rules 2/4/5/6's mode tokens (`full`/`visual`/`journey:`/`discover`) appear anywhere in `$ARGUMENTS`, rules 1 and 7's `Mode: code` resolves to **full** mode instead — code review followed by a visual browser review pass (Step 6). This makes the Overview's documented "flow invokes review in full mode by default" promise self-enforcing rather than dependent on the flow executor remembering to type `full`. An explicit mode token in `$ARGUMENTS` (`full`/`visual`/`journey:`/`discover`) always wins over this default. Standalone invocation (no `$PIPELINE_RUN_DIR`) is unaffected — rules 1 and 7 still resolve to code mode there, unchanged.
```

Place it as its own paragraph directly below the existing "In visual, journey, and discover modes, delegate entirely..." paragraph (still inside the `## Input` section, before `## Code-Mode Procedure (Steps 1-7)`).

- [ ] **Step 3: Verify the edit reads correctly against all three Acceptance Criteria**

Re-read the full `## Input` section after the edit. Confirm by inspection:
- AC1: a `$PIPELINE_RUN_DIR`-set invocation with no explicit mode token now reads as full mode per the new paragraph.
- AC2: a standalone invocation (no `$PIPELINE_RUN_DIR`) with no explicit mode token is untouched — the new paragraph's condition requires `$PIPELINE_RUN_DIR` to be set, so it does not fire.
- AC3: an explicit mode token is checked first by rules 1-8 as before; the new paragraph only promotes the two "no explicit token" fallback rules (1, 7), never overriding an explicit token.

There is no automated test to run for this step — this is a documentation/prose file with no test harness of its own (confirmed: no `tests/*.test.js` references "Input resolution" or "full mode" for this file). Verification is the inspection above.

- [ ] **Step 4: Commit**

```bash
git add plugin/skills/review/SKILL.md
git commit -m "review: self-enforce flow-context full-mode default (refs #1570)"
```

---

### Task 2: Point flow's Step 4 prose at the new self-enforcing mechanism

**Files:**
- Modify: `plugin/skills/flow/SKILL.md` (Step 4, the `review` context-passing bullet — currently: "Flow invokes `/claude-tweaks:review` in **full** mode (code + visual review) by default.")

**Interfaces:**
- Consumes: Task 1's new "Flow-context default" paragraph in `review/SKILL.md`'s Input resolution — this task cites it by name rather than restating its content.
- Produces: nothing further downstream — this is the terminal prose fix for Deliverable #2.

- [ ] **Step 1: Locate the exact line**

Read `plugin/skills/flow/SKILL.md`'s Step 4 context-passing list (the bullet beginning "`test` → `review` receives `TEST_PASSED=true` and QA results. Flow invokes `/claude-tweaks:review` in **full** mode (code + visual review) by default. ...").

- [ ] **Step 2: Replace the unenforced claim with the mechanism**

Replace:

```markdown
   - `test` → `review` receives `TEST_PASSED=true` and QA results. Flow invokes `/claude-tweaks:review` in **full** mode (code + visual review) by default. The review skill delegates visual review to `/claude-tweaks:visual-review`, which handles its own browser **and** dev-server resolution:
```

with:

```markdown
   - `test` → `review` receives `TEST_PASSED=true` and QA results. Flow invokes `/claude-tweaks:review` with no explicit mode token — `review/SKILL.md`'s own Input resolution "Flow-context default" note detects `$PIPELINE_RUN_DIR` being set and resolves to **full** mode (code + visual review) on its own; flow itself never needs to pass `full`. The review skill delegates visual review to `/claude-tweaks:visual-review`, which handles its own browser **and** dev-server resolution:
```

Preserve everything else in that bullet (the "Browser + reachable app" / "No browser backend" / "No reachable app" sub-list directly below it) unchanged — only the first sentence of the parent bullet changes.

- [ ] **Step 3: Verify by inspection**

Re-read the edited bullet. Confirm it now names the mechanism (review's own Input-resolution default keyed on `$PIPELINE_RUN_DIR`) instead of asserting the behavior with no stated cause — this closes Deliverable #2's audit gap. No test harness pins this line (confirmed via grep before this plan was written).

- [ ] **Step 4: Commit**

```bash
git add plugin/skills/flow/SKILL.md
git commit -m "flow: name review's self-enforcing full-mode mechanism in Step 4 prose (refs #1570)"
```

---

## Self-Review

**1. Spec coverage:** Deliverable 1 (self-enforcing rule in review's Input resolution) → Task 1. Deliverable 2 (audit + fix flow's Step 4 prose for the same gap) → Task 2. All three Acceptance Criteria are addressed by Task 1's new paragraph and verified by inspection in both tasks' Step 3.

**2. Placeholder scan:** No `TBD`/`TODO`/"implement later"/"add appropriate X" placeholders — both tasks specify exact before/after text.

**3. Type consistency:** N/A — prose-only change, no code types or signatures involved.
