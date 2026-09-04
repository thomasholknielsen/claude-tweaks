---
record: 848
origin: capture
risk: low
size: low
ceremony: fast-lane
grants: [build]
---
# 848: Pipeline run directory minted with non-canonical timestamp format, invisible to reconcile

Origin: session observation during /claude-tweaks:wrap-up Phase 4 (pr-first-merge Step 4.2 reconcile) for record #764

Defer-reason: genuinely-larger

## Current State

Record #764's own pipeline run directory was minted as `20260817T173343-spec-764` — no dashes in the date portion — instead of the canonical `2026-08-17T173343-spec-764` format `skills/_shared/pipeline-run-dir.md`'s ISO-timestamp rule requires (`date -u +%Y-%m-%dT%H%M%S`, always with dashes). Every other run directory observed in this repo's own `.claude-tweaks/pipelines/` at the time of discovery (60+ others) follows the correct format; #764's was the only outlier. The practical effect: `bin/hooks.js reconcile`'s scan (whatever glob or date-parse it uses to enumerate run directories) silently skipped this run entirely — it never appeared in the `runs` array of a `reconcile` invocation that otherwise covered every other active/parked run in the repo. The run was renamed to the canonical format by hand as a one-off fix during #764's own wrap-up; the root cause of how the non-canonical name was minted in the first place was not identified — it happened before the session's context was compacted, so the exact mint site (`flow/claim-targets.md` Step 2.8, `flow/manifesto.md`, or a hand-created fallback) is unknown.

## Deliverables

- [ ] Determine whether `bin/hooks.js reconcile`'s run-directory enumeration should be hardened to also recognize (and self-heal, or at least surface) a non-canonical timestamp format, rather than silently omitting the run from every `runs` array entry.
- [ ] If reproducible, identify which mint site (`flow/claim-targets.md` Step 2.8, `flow/manifesto.md` Path conventions, or `dispatch/SKILL.md` Step 4) produced the non-canonical stamp for #764's run, and whether a non-UTC `date` call or a stale cached value could produce this format. If not reproducible from any of the three known mint sites, note that in this record and downgrade to just the reconcile-hardening deliverable above.
- [ ] Add or extend a conformance test asserting every mint site actually emits `date -u +%Y-%m-%dT%H%M%S` (dashes present) rather than trusting the prose rule alone.

## Acceptance Criteria

1. A grep or test demonstrates the three mint sites in `skills/_shared/pipeline-run-dir.md`'s citation list all produce dash-containing timestamps.
2. `bin/hooks.js reconcile` either recognizes a non-canonical run-dir name (self-heals or reports it) or a test documents why silent omission is acceptable.
3. `npm test` passes.

_Filed by `capture` via specShapedBody._
