# Criteria: Review Quality

Shared, criteria-only fragment — the "what is worth flagging in a code review and how to label it" knowledge. No workflow, no routing, no Next Actions. Consumed by `/claude-tweaks:review` (the reactive quality gate) and by `/claude-tweaks:code-health`'s review-quality judgment lens (Phase 2 subagents). One source of truth so a reactive review and a proactive sweep apply the same calibration, severity scale, and categories.

## Severity scale

`critical` / `high` / `medium` / `low` / `info`

- **critical** — security vulnerability, data-loss risk, or correctness defect that hard-fails. Always actionable; always interrupts.
- **high** — broken behavior, missing validation, an error path that leaves the system in a bad state.
- **medium** — a real gap worth closing now (a convention violation that compounds, a moderate-effort fix).
- **low** — minor or trivial; most are quick fixes. Never blocks.
- **info** — observation only; not an actionable finding. Drop a security/coverage "info" rather than filing it.

## Category enum

Every finding carries exactly one category from this enum:

`Architecture` · `Security` · `Convention` · `Performance` · `Error handling` · `Test quality` · `Coverage` · `UX` · `Docs`

A finding routed to `/claude-tweaks:capture` (see `_shared/work-record.md`) carries no category label — `/capture` guesses only `bug`/`feature`/`task` Type from the title/body text; the review-quality category above is not persisted past the routing decision.

## Per-lens severity floors (calibration)

Over-flagging is the most common review failure. Each lens has an expected ceiling:

| Lens | Category | Expected ceiling | Notes |
|------|----------|------------------|-------|
| Convention | Convention | medium | Only flag when divergence compounds (e.g., a third logging pattern); single-instance style differences are not findings. |
| Security | Security | critical / high | Always actionable. No "info" findings — drop a non-actionable security observation. |
| Error handling | Error handling | high | Critical only when an uncaught error leaves the system in a broken state. |
| Performance | Performance | high | Critical only when a measured regression exists (real query, real benchmark); never speculative. |
| Architecture | Architecture | high | Critical only when a layering violation will break a near-term feature; otherwise medium. Includes shallow-module detection — for module-level depth criteria see `_shared/criteria-architecture-depth.md`. |
| Test quality | Test quality | medium | Tests are not production code; flag only when a missing test would have caught a real bug. |
| Coverage | Coverage | low / informational | Never blocks. |
| UX (QA data) | UX | high | Judgment-heavy synthesis. |
| Doc freshness | Docs | low / informational | Never blocks. |

## Calibration — what to flag and what to drop

This block is the filter every reviewer applies. It must be reproduced **byte-identical** wherever it is inlined into a dispatched agent prompt (the cross-lens reproduction logic depends on every agent applying the same filter — do not paraphrase):

```
Only flag issues where:
- the user will hit a bug, broken state, or unsafe behavior
- the code will fail under realistic load, edge cases, or future maintenance
- a project convention is violated in a way that compounds (not isolated stylistic choices)

Do NOT flag:
- alternate naming you'd prefer ("`fetchUser` would read better as `getUser`")
- formatting, whitespace, or import ordering quibbles
- "could be DRYer" without a concrete second caller that proves the duplication is real
- hypothetical edge cases the spec didn't require ("what if the input is a 4GB string?")
- missing comments on self-explanatory code

When in doubt: would a calibrated senior engineer block a PR on this finding alone? If no, drop it.
```

## Confidence and reversibility

The confidence / reversibility floor and severity ceiling vocabulary that governs whether a finding may be auto-resolved is **not** redefined here — it lives in `_shared/auto-mode-contract.md` ("Reversibility / confidence floors; severity ceiling"). Read it there. In short: a finding may be auto-resolved only when reversibility:high AND confidence:high AND severity ≤ the configured ceiling; everything else is staged or kept-prompt.
