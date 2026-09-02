# Dispatch Step 3 — Cross-PR Root-Cause Overlap Report

Referenced by `skills/dispatch/SKILL.md` Step 3, cited immediately after the Oversized-group
report (refs #1579). Catches two *different* records that independently diagnose and fix the
same root cause before either merges — the #1410/#1402 case this report exists to surface: both
records touched `plugin/bin/lib/hooks/context.js`'s `resolveRun` fallback branches, #1402 built
first but its PR never merged, and #1410 was later authorized and dispatched with no way to know
#1402's unmerged branch already carried the identical fix — its own build necessarily
re-implemented it from scratch. Nothing detected the duplication before dispatch authorized and
ran #1410's build; it only surfaced because a review call happened to cross-reference the two PRs
by hand at the operator's explicit request.

## The report

Read `dispatch-crosspr-overlap.json` (`queue-pull-script.md`'s output, `{candidate, pr, files}[]`
— `grouping.js`'s `detectCrossPRFileOverlap`). Non-empty: render one line per entry before the
rest of Step 3:

`#{candidate} overlaps open PR #{pr} on {files.join(', ')} — possible duplicate root-cause fix;
consider serializing (wait for #{pr} to merge, or close one as a duplicate) before dispatching
#{candidate}.`

This is a **warning only, never a gate** — every selection form (bare, `next`, `#N`,
`#N,#M,...`) still proceeds with the named/ranked candidate exactly as it would without this
report; nothing here excludes a candidate from `dispatch-groups.json` or blocks a claim.

It is deliberately distinct from PR #1572/#1224's own-linked-PR exclusion (a candidate whose
*own* linked PR is open — a re-dispatch guard) — this instead catches two *different* records
independently fixing the same root cause, where the open PR belongs to a record other than the
one about to be dispatched.

**Fallback for "unclear" (AC2):** a `gh pr list` failure, an unresolvable file, or a PR the
signal can't confidently attribute all degrade to simply omitting that PR (or the whole report)
from consideration — fail-open, never a stop, same posture as the native-dependency-query
fallback above SKILL.md's Step 3.

Same drain+zero-eligible exception as the Blocked-exclusion report (`SKILL.md` Step 3); omit
when empty.
