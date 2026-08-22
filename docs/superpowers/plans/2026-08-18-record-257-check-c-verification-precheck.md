# For agentic workers

Recommended: `/superpowers:subagent-driven-development`. (This plan is executed directly by `/claude-tweaks:build`, which controls execution strategy — this header is boilerplate from `writing-plans` and is ignored per `/build`'s Spec Step 3.)

# Plan: build — pre-dispatch verification pass over each task's own stated acceptance command (#257)

## Overview

`/build`'s Common Step 1.5 (Plan Audit) runs two structural checks (Check A: file existence, Check B: scope-keyword sweep) but neither executes any command the plan itself declares. Add a third check — Check C — that pre-runs each task's own stated Step 2 `Run:`/`Expected: FAIL` verification command once, read-only, before dispatch, and hard-stops when a command already exhibits a passing signature despite declaring an expected failure. This is a documentation-only change: `skills/build/plan-audit.md` gains a new `## Check C` section, and `skills/build/SKILL.md`'s Common Step 1.5 stub is updated to name it.

## Task 1: Add Check C to `plugin/skills/build/plan-audit.md`

### Files
- Modify: `plugin/skills/build/plan-audit.md`

- [ ] **Step 1: Write the failing check**
  Run: `grep -c "Check C" plugin/skills/build/plan-audit.md`
  Expected: `0` (the section does not exist yet)
- [ ] **Step 2: Run test to verify it fails**
  Run: `grep -c "Check C" plugin/skills/build/plan-audit.md`
  Expected: FAIL — command outputs `0`, not a positive match count
- [ ] **Step 3: Implement**
  Add a `## Check C — Verification-command pre-check` section after `## Check B`, documenting: the extraction rule (each `### Task N` block's Step 2 `Run:`/`Expected:` pair, citing superpowers `writing-plans`'s Task Structure section rather than restating it); the once-only, read-only, pre-dispatch execution rule (before Common Step 2 hands off to any execution strategy); the passing-signature-only flagging rule (exit 0 / success marker despite `Expected: FAIL`, with an erroring or cleanly-failing command explicitly stated as *not* a finding); the unconditional-stop on-finding behavior (same shape as Check A — no auto-mode policy table, no `AskUserQuestion` branch); and that Check C shares Check A/B's existing skip gate, introducing no new one.
- [ ] **Step 4: Run test to verify it passes**
  Run: `grep -c "Check C" plugin/skills/build/plan-audit.md`
  Expected: PASS — command outputs a positive match count

## Task 2: Name Check C in `plugin/skills/build/SKILL.md`'s Common Step 1.5 stub

### Files
- Modify: `plugin/skills/build/SKILL.md`

- [ ] **Step 1: Write the failing check**
  Run: `grep -c "Check C" plugin/skills/build/SKILL.md`
  Expected: `0`
- [ ] **Step 2: Run test to verify it fails**
  Run: `grep -c "Check C" plugin/skills/build/SKILL.md`
  Expected: FAIL — command outputs `0`
- [ ] **Step 3: Implement**
  Update the Common Step 1.5 stub's two-check list to a three-check list (add the Check C bullet, one line, matching the existing Check A/Check B bullet style) and update the closing "For the full procedure" cross-reference line to also name Check C's verification-command pre-check.
- [ ] **Step 4: Run test to verify it passes**
  Run: `grep -c "Check C" plugin/skills/build/SKILL.md`
  Expected: PASS — command outputs a positive match count

## Task 3: Confirm both files updated together

### Files
- Modify: none (verification only)

- [ ] **Step 1: Write the failing check**
  Run: `grep -l "Check C" plugin/skills/build/plan-audit.md plugin/skills/build/SKILL.md | wc -l`
  Expected: `0` (before Tasks 1-2 land)
- [ ] **Step 2: Run test to verify it fails**
  Run: `grep -l "Check C" plugin/skills/build/plan-audit.md plugin/skills/build/SKILL.md | wc -l`
  Expected: FAIL — outputs `0`, not `2`
- [ ] **Step 3: Implement**
  No implementation — this task is the Acceptance Criteria #6 cross-check that both Task 1 and Task 2 landed.
- [ ] **Step 4: Run test to verify it passes**
  Run: `grep -l "Check C" plugin/skills/build/plan-audit.md plugin/skills/build/SKILL.md | wc -l`
  Expected: PASS — outputs `2`

## Acceptance Criteria (from spec)

1. `plugin/skills/build/plan-audit.md` contains a `## Check C` section documenting the extraction rule, the once-only pre-dispatch execution rule, and the passing-signature-only flagging rule.
2. That section states in plain prose that a command erroring or cleanly failing pre-dispatch is not a finding — only an already-passing result is.
3. `plugin/skills/build/SKILL.md`'s Common Step 1.5 stub names "Check C".
4. The section documents Check C's on-finding behavior as an unconditional stop, with no auto-mode policy table or `AskUserQuestion` branch.
5. The section states that Check C shares Check A/B's existing skip condition.
6. `grep -l "Check C" plugin/skills/build/plan-audit.md plugin/skills/build/SKILL.md` returns both file paths.
