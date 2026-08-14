# Craft-context consumers (#385) — execution plan

For agentic workers: executed inline under `/claude-tweaks:flow` (run dir `2026-08-14T104804-spec-383-384-385-387/spec-385`). Prerequisite #383 landed on this branch.

Facts verified: `polish-execution.md` has one composition site (the Skill-tool invocation bullet + its decision-log/staging mechanics); `standalone-followup.md`'s two code-modifying gates are Step 4's apply gate ("For each accepted item…") and Step 5 Option 1 ("Fix flagged issues"), with "Explore alternatives" a no-outcome `live` delegation; `docs/getting-started.md` line 118 carries the stale "Seven active modes" phrase, design section paragraphs at lines 82–86.

## Task 1 — `skills/flow/polish-execution.md`
One new bullet after the invocation bullet: assemble craft context per `_shared/design-craft.md` at runtime, inline the result into what the executing agent receives; motion-scoped Emil skills ride along exactly when the materialized header's `Design-intent:` includes `delightful`, no `Design-intent:` → motion add-on skipped, ambient baseline still applies. Exactly one line containing "design-craft". Everything else byte-unchanged.

## Task 2 — `skills/visual-review/standalone-followup.md`
Two single-line paragraphs: one in Step 4's apply-gate section after "For each accepted item…", one in Step 5 Option 1 after its apply-gate step — each citing `_shared/design-craft.md`, distinguishing dispatch (inline into prompt) vs in-session (assemble into own working context), the second noting "Explore alternatives" gets nothing. Exactly two lines containing "design-craft". Option structure, re-verify gate, read-only default byte-unchanged.

## Task 3 — `docs/getting-started.md`
Replace "Seven active modes:" with count-free "Modes include:"; add a **Craft layer:** paragraph after the Polish-phase paragraph (decisions vs principles in one breath, pointer to the contract, optional install + graceful degradation). No contiguous authority-rule phrase, no literal mode count.

## Verification
AC1 grep -c per file (1 and 2); AC2 grep for "Seven active modes" empty + no other literal mode count; AC3 diff-stat = 3 files; AC4/AC5 diff shows only the inserted paragraphs.
