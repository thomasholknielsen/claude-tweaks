# Backlog Overview Menu Grant-Rung and Empty-Backlog Options Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the two gaps in `skills/backlog/SKILL.md`'s "After `overview`" Next Actions menu — no dedicated option exists for the fallback ladder's grant rung, and no explicit path exists for the true `backlog is empty` terminal case (both currently fall through with no matching menu option, defeating the `(Recommended)`-MUST rule).

**Architecture:** Pure prose edit to one file, one block (`## Next Actions`, the `**After `overview`:**` paragraph, lines 74-82 as of commit `d2aa1c04`). Add a new Option 5 ("Grant the top ready record") between the existing Option 4 (Shape) and the named-lens option (renumbered 5→6), following the exact `label`/`description`/omission-condition shape every sibling option already uses. Extend the existing single-option collapse sentence (line 82) to also name the zero-option case, with its own terminal message. Remove the now-resolved "(Known gap: ...)" parenthetical from line 74. No code changes — `skills/backlog/overview-mode.md`'s actual ladder computation is unaffected; this is a menu-rendering fix only, per the spec's own Deliverables item 4.

**Tech Stack:** Markdown (skill-instruction prose only — no code, no tests to write; this is LLM-rendered menu content, not code under `bin/`, per the spec's own Acceptance Criteria).

**Spec:** `.claude-tweaks/pipelines/2026-08-16T091924-spec-563-564-565-566/spec-565/work/565-spec.md`

## Global Constraints

- `skills/backlog/overview-mode.md` must not change — this is a menu-enumeration fix only (spec Deliverables item 4).
- Before editing, grep `tests/` for any test pinning the overview Next Actions option list/count or fixtures referencing "After overview"/"Next Actions" — if one exists, update it to match; if none exists, no new test is required (spec Acceptance Criteria).

---

### Task 1: Add the grant-rung option, the zero-option terminal case, and remove the resolved gap note

**Files:**
- Modify: `skills/backlog/SKILL.md` (the `**After `overview`:**` block, `## Next Actions` section)

**Interfaces:** None — prose only, no functions/exports.

- [ ] **Step 0: Check for a pinning test**

Run: `grep -rn "After overview\|Next Actions" tests/ 2>/dev/null | grep -i backlog`
If this returns a match asserting a fixed option count/list for the overview Next Actions block, read that test and update it in the same commit as Step 1-4 below. If it returns nothing, proceed — no test exists to update.

- [ ] **Step 1: Remove the resolved "(Known gap: ...)" parenthetical**

In `skills/backlog/SKILL.md`, find the sentence starting `**After `overview`:** The menu's `(Recommended)` label is never a static tag...` (currently ~line 74). It contains this parenthetical, verbatim:

```
(Known gap: at the fallback ladder's grant rung and the `backlog is empty` terminal case, no dedicated menu option exists yet — tracked as a follow-up record; the options below don't change until that lands.)
```

Remove this entire parenthetical sentence (including its surrounding space) from the paragraph — the sentence immediately before it ends "...then fallback ladder)." and the sentence immediately after starts "Call `AskUserQuestion`:" — after removal these two should read directly adjacent with one space between them: "...then fallback ladder). Call `AskUserQuestion`:".

- [ ] **Step 2: Insert the grant-rung option**

Immediately after the existing Option 4 line (`Option 4 — `label`: `"Shape the top priority record"`, ...`) and before the existing Option 5 (named-lens) line, insert a new option:

```
- Option 5 — `label`: `"Grant the top ready record"`, `description`: `"/claude-tweaks:backlog grant — mechanically sweep the top-ranked ready-but-ungranted record's gate chain (headless; no per-record confirmation)"` — omit when the fallback ladder's grant rung isn't what the report's `Next:` line names
```

- [ ] **Step 3: Renumber the trailing named-lens option**

The existing option immediately after (currently numbered "Option 5 (only after a named-lens run)") becomes "Option 6 (only after a named-lens run)" — renumber only, no other text changes:

```
- Option 6 (only after a named-lens run) — `label`: `"Try the {other-lens} lens"`, `description`: `"/claude-tweaks:backlog overview {other-mode} — {one-line description of that mode}"`, naming exactly one of the named lenses not yet run this session.
```

- [ ] **Step 4: Extend the collapse rule to the zero-option case**

Find the paragraph immediately after the option list, starting "If situational filtering leaves only one option..." (currently ~line 82, ending "...The same rule applies to the `refine` block above."). Replace it in full with a version that also names the true empty-backlog terminal:

```
If situational filtering leaves only one option (a bare run with no needs-you, whose Dispatch block contains no executable entry, that surfaced nothing needing refinement, nothing to grant, and is this session's first lens run leaves Option 4 alone), state or execute it directly instead of calling `AskUserQuestion` — per this project's own convention, a lone option isn't a decision. The same rule applies to the `refine` block above. When situational filtering leaves **zero** options — no needs-you, no executable Dispatch entry, nothing to grant, nothing to shape, nothing to refine, and no named-lens run to offer — this is the true `Next: backlog is empty` terminal case: skip `AskUserQuestion` entirely and state the terminal message directly: `Backlog is empty — nothing to build, grant, shape, or refine.`
```

- [ ] **Step 5: Verify the edit reads correctly end-to-end**

Read the full `**After `overview`:**` block back after editing. Confirm: (a) the "(Known gap: ...)" text no longer appears anywhere in the file (`grep -c "Known gap" skills/backlog/SKILL.md` returns `0`), (b) the option list now reads Option 1 → 2 → 3 → 4 → 5 (grant) → 6 (named-lens) with no gaps or duplicate numbers, (c) the zero-option terminal message is present and reads naturally alongside the existing one-option sentence.

- [ ] **Step 6: Run the full suite to confirm no regressions**

Run: `npm test 2>&1 | tail -15`
Expected: all tests pass (this is a prose-only change to a skill file — no test should reference the removed "(Known gap: ...)" text or depend on the old option numbering, since Step 0 already checked for and would have updated any such pin).

- [ ] **Step 7: Commit**

```bash
git add skills/backlog/SKILL.md
git commit -m "Add grant-rung and empty-backlog Next Actions options to backlog overview menu — refs #565"
```
