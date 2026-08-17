---
record: 714
origin: capture
risk: medium
size: medium
ceremony: standard
grants: [build]
---
# 714: consoleAutoResolve must still render the consolidated console — rows stamped AUTO-RESOLVED, zero clicks

Origin: session evaluation of the #620-#625 /flow run (via /claude-tweaks:feedback; self-reference routed the findings to local records)

Defer-reason: genuinely-larger

## Current State

At `autonomy: unattended`, `consoleAutoResolve` collapsed a six-spec consolidated Review Console into ten AUTO log lines in `decisions.md`; the user-facing turn rendered a per-spec status table and prose, but none of the console’s own D#/M#/Q#/U# rows, no reversibility column, no "Refused rows: none" line — while `multispec-review-console.md`’s Hard requirements say every per-spec entry MUST present and silent dropping is forbidden. `_shared/autonomy-ceiling.md` describes `consoleAutoResolve` only in click terms, leaving "render nothing" as a defensible reading. Related: #716 (terminal Next Actions ambiguity) and #717 (archival skipped on this same path) share the root cause — behavior attached to the On-approval branch or suppressed wholesale at `unattended`.

## Deliverables

- [ ] `wrap-up/review-console.md` + `flow/multispec-review-console.md`: the auto-resolution short-circuit renders the FULL console tables with each row pre-stamped `AUTO-RESOLVED`, then proceeds — rendering decoupled from stopping
- [ ] `_shared/autonomy-ceiling.md`: `consoleAutoResolve` defined as zero-click, never zero-render

## Acceptance Criteria

1. `grep -n "AUTO-RESOLVED" skills/wrap-up/review-console.md skills/flow/multispec-review-console.md` matches both short-circuit sections.
2. An `unattended` run’s terminal output contains the console’s section tables (verify on the next live unattended run; the summary-template renders them).

_Filed by `capture` via specShapedBody._
