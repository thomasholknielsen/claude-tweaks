---
record: 835
origin: human
risk: low
size: low
ceremony: fast-lane
grants: [build]
surface: backend
---
# 835: feedback: the terminal Next Actions question asks what to do next using options the skill already computed

Surface: backend

## Current State

`/claude-tweaks:feedback`'s closing `## Next Actions` step renders an `AskUserQuestion` asking "what next?" whose Recommended option is a restatement of outstanding work the skill itself had already identified and named in the option's own description — a decision that reads as already made, re-asked as if open. Measured: 32 `AskUserQuestion` calls across one session, 17 of 32 resolved to the pre-marked Recommended option.

## Deliverables

When `/claude-tweaks:feedback`'s closing step can already state definitively what's outstanding and there's an obvious single next step (e.g. resuming an interrupted flow the skill itself named), say so directly as a status line rather than rendering a forced `AskUserQuestion` — reserve the question for a real fork (e.g. "resume X" vs. "do something else instead").

## Acceptance Criteria

- Completing a `/claude-tweaks:feedback` filing run that interrupted another flow states the resume path directly, without an `AskUserQuestion` whose Recommended option merely restates that same information.
- A genuine fork at the closing step (more than one live option) still renders `AskUserQuestion` as today.

## Technical Approach

Locate `/claude-tweaks:feedback`'s closing `## Next Actions` rendering logic and add a check: if there's exactly one live next step and the skill already has full information to state it, render it as plain text per this project's `## Next Actions` convention (fully-qualified command, no `AskUserQuestion`) instead of unconditionally calling `AskUserQuestion`.

### Key Files

- `plugin/skills/feedback/SKILL.md` — closing `## Next Actions` step

## Gotchas

- Don't remove `AskUserQuestion` entirely from this closing step — only skip it when the Recommended option already contains the complete answer and there's no real second option worth offering.

## Original request

feedback: the terminal Next Actions question asks what to do next using options the skill already computed

**Summary:** `/claude-tweaks:feedback`'s closing `## Next Actions` step renders an `AskUserQuestion` asking "what next?" whose Recommended option is simply a restatement of outstanding work the skill itself had already identified and named in the option's own description — a decision that reads as already made, re-asked as if open.

**Kind:** Defect

**Affected component:** `/claude-tweaks:feedback` (`## Next Actions`)

**Objective:** Avoidable interactions

**Measurement:** total AskUserQuestion calls: 32 across the full session; 17 of 32 resolved to the pre-marked Recommended option.

**Repro steps:**
1. Interrupt some other flow mid-way (e.g. a spec review awaiting the user's approval) to run `/claude-tweaks:feedback`.
2. Complete a filing run.
3. Observe the closing `## Next Actions` prompt's Recommended option description already names the exact interrupted work to resume — the same information a plain status line could convey without a forced choice.

**Expected vs. actual:**
Expected: when the skill can already state definitively what's outstanding and there's an obvious single next step, it says so directly and asks only if there's a real fork (e.g. "resume X" vs. "do something else instead").
Actual: a full `AskUserQuestion` stop is rendered regardless, even when its own Recommended option already contains the complete answer.

**Definition:** Clear

**Plugin version:** 6.87.0

---
Filed via /claude-tweaks:feedback.
<!-- fingerprint: feedback-59a49ce8 -->

