---
record: 967
origin: human
risk: medium
size: medium
ceremony: standard
grants: []
fingerprint: headless-shaping-unit:specify-next-headless-selection-form-shared-headless-self-re
surface: backend
---
# 967: specify next: headless selection form + shared headless-self-report extraction

Surface: backend

## Overview

Add a `next` first-argument form to `/claude-tweaks:specify` — the headless-safe unit a scheduled Routine fires. One firing selects exactly one eligible unshaped backlog record, claims it, shapes it headlessly, and exits; zero eligible records is a cheap no-op. This is the shaping-queue sibling of `/claude-tweaks:dispatch`'s `next` form and deliberately copies its architecture: no batch, no drain (throughput = routine cadence × single firings), claims against double-processing, durable self-report on headless failure. With a second consumer now existing, dispatch's headless self-report contract is extracted into `_shared/`.

**Complexity:** Medium
**Estimated tasks:** 6

## Non-Goals

- No batch or drain form — `next` never shapes more than one record per firing.
- No interaction with the comma-list batch grammar (#762 owns that consolidation); `next` and `#N[,#M...]` are disjoint input shapes.
- No framing-check guard and no `shaped:headless` provenance — #968 delivers those; this record lands the selection/claim/no-op/self-report skeleton, with shaping identical to today's `--chained` headless posture.
- No `local-files` headless support — `next` is `work-backend: github-issues` only (see Gotchas).
- No routine template or fleet row (#970).

## Current State

- `plugin/skills/dispatch/SKILL.md` — the `next` form this copies: the Input-table row, the Preflight `work-backend` hard stop, Step 3's priority-then-age ranking (writes `/tmp/dispatch-next-pick.json`, `null` on an empty queue), the "Zero eligible groups" clean no-op, and the Routine Configuration section.
- `plugin/skills/dispatch/headless-self-report.md` — the durable-GitHub-trace contract for headless preflight failures; single consumer today.
- `plugin/skills/specify/SKILL.md` — `## Input` + `### Resolve the input` cases 1–5; the `--chained` flag defines the existing headless posture (no `## Next Actions`, design-intent auto-resolves to `none`, auto-decision-log per `_shared/auto-decision-log.md`).
- `plugin/skills/_shared/record-queue-fetch.md` — the canonical open-work-record fetch + facet parse every queue scan starts from; the eligibility query builds on it.
- `plugin/skills/_shared/issue-claims.md` — the claim contract (GitHub ref-level lock, with the file-blob lock standing in for gh-absent environments); "release" below always means that contract's release operation.
- Tests: `node --test` conformance suites pin skill prose (`tests/batch-ref-argument.test.js`, `tests/tidy-report-rules.test.js` show the pattern).

## Deliverables

- [ ] `plugin/skills/_shared/headless-self-report.md` — extracted from `plugin/skills/dispatch/headless-self-report.md` (expand-contract: create the shared fragment stating the generic contract — durable trace on headless failure, dedup against existing open reports, never softens the stop — then migrate `dispatch/SKILL.md`'s references). Expected end state: `dispatch/headless-self-report.md` is deleted; it survives only if the extraction finds genuinely dispatch-specific parameterization (e.g. group/claim-trail vocabulary), and in that case the PR names what stayed and why.
- [ ] `plugin/skills/specify/SKILL.md` — `next` added to the `argument-hint` and `## Input` (documented as the headless Routine-fired form, mutually exclusive with every other first-argument shape; `phase-N`, `--surface`, `--granularity`, and `--chained` are each rejected with a one-line notice when combined with it); `### Resolve the input` gains a case for the literal `next`, routed to the new mode file.
- [ ] `plugin/skills/specify/next-mode.md` — the full procedure:
  1. **Preflight** — `work-backend` check: `local-files` stops with dispatch's exact posture (headless shaping is github-issues only; no work performed, including when nobody is present to read the message).
  2. **Eligibility query** per `_shared/record-queue-fetch.md`: open records carrying none of `ready`, `needs:definition`, `parked`, `parent-issue`, and holding no live claim per `_shared/issue-claims.md`.
  3. **Selection** — exactly one record by dispatch's ranking, mirrored literally: `priority:high` > `priority:medium` > `priority:low` > unprioritized, oldest `createdAt` first within each band.
  4. **Zero eligible** → report "nothing eligible this firing" and exit cleanly — no self-report, no notification. The firing's own session transcript line is the only trace, deliberately (dispatch's posture); `/claude-tweaks:tidy` and `/claude-tweaks:help` surface queue state independently on their own cadence.
  5. **Claim** — re-read the selected record's live labels immediately before claiming (the fetch snapshot is stale by definition). If the re-read shows it no longer eligible, or the claim write is contested, exit as a clean no-op for this firing — no same-firing re-selection; the next firing picks up (dispatch's no-retry posture).
  6. **Shape** — hand the claimed record to `shaping-mode.md` under the `--chained` headless posture. Shaping mode's own `ready` stamp is what removes the record from future eligibility — no extra state change is needed here.
  7. **Release** the claim (the claims contract's release operation) — on the success path AND on every failure path (try/finally semantics). If the release itself fails, the claims contract's stale-claim TTL is the backstop; do not retry in-firing.
  8. **Failure self-report** — any Preflight failure, and any post-claim shaping-stage failure, files the shared headless self-report (deduplicated) before stopping. A zero-eligible or contested-claim exit is not a failure and files nothing.
- [ ] A conformance test pinning: `next` in specify's `argument-hint`, the mode file's eligibility/ranking/no-op/claims/failure-path prose, and the `_shared/headless-self-report.md` citation in both consumers.

## Acceptance Criteria

1. `plugin/skills/specify/SKILL.md` names `next` in its `argument-hint` and documents it in `## Input` as the headless Routine-fired form with the flag-rejection rule.
2. `plugin/skills/specify/next-mode.md` exists and states: the eligibility predicate (open, not `ready`, not `needs:definition`, not `parked`, not `parent-issue`, unclaimed), priority-then-age single selection, the zero-eligible clean no-op, claim-time live re-read with clean-no-op on contest/ineligibility, release-on-every-path claim handling, the `github-issues`-only Preflight hard stop, and self-report on Preflight and shaping-stage failure.
3. `plugin/skills/_shared/headless-self-report.md` exists; `dispatch/SKILL.md` and `specify/next-mode.md` both cite it; no full restatement of the contract remains in either skill.
4. The new conformance test pins AC 1–3 and fails when a citation is removed (verify once by reverting during development).
5. `npm test` passes.

## Technical Approach

Mirror dispatch's `next` end-to-end rather than inventing new machinery: the Input-row wording, the Preflight hard-stop language for `local-files`, the zero-eligible no-op posture, and the ranking-script pattern (a small node selection writing `/tmp/specify-next-pick.json`, `null` on empty) should read as the same family as `dispatch/SKILL.md` Step 3 — including the same priority-then-age ranking definition, so human-applied `priority:*` labels steer the shaping queue exactly as they steer the build queue. Shaping itself is unchanged — `next-mode.md` hands the selected record to `shaping-mode.md` exactly as a `--chained` invocation does, so no shaping logic is duplicated.

### Key Files

- `plugin/skills/specify/SKILL.md` — argument-hint + Input + input-resolution case for `next`
- `plugin/skills/specify/next-mode.md` — new mode file (the full procedure)
- `plugin/skills/_shared/headless-self-report.md` — new shared fragment (extracted)
- `plugin/skills/dispatch/SKILL.md` — migrate self-report references to the shared fragment
- `plugin/skills/dispatch/headless-self-report.md` — deleted (expected), or slimmed to named dispatch-specific parameterization
- `tests/specify-next-mode.test.js` — new conformance test (name per existing suite conventions)

### Package Dependencies

- none (skill prose + `node --test` built-in)

## Gotchas

- `github-issues`-only is structural, not policy: the claim protocol depends on GitHub's RBAC + atomic content writes. Copy dispatch's Preflight posture verbatim in spirit, including "the absence of a human to hand this off to is not license to do the work in their place."
- The eligibility predicate excluding `needs:definition` is load-bearing: #968's guard stamps that label to route un-shapeable records out of this queue; if `next` selected them, every firing would re-process the same stuck record. `parked` is excluded for the same reason from the other direction — a human deliberately deferred it; unattended shaping must not un-defer it.
- The zero-eligible exit's lack of a durable trace means a silently broken eligibility query looks identical to an empty queue. This is accepted, mirroring dispatch — the independent queue surfaces (`/tidy`, `/help`) are the cross-check; do not add a per-firing heartbeat report.
- A `next` firing with nothing eligible must NOT file a self-report — an empty queue is the steady state, not a failure (dispatch's "Zero eligible groups" rule).
- Open #316 also edits `skills/specify/` files — check for collisions before merging.
- SKILL.md byte ceiling: measure `wc -c` headroom on `specify/SKILL.md` before adding the `next` documentation; if headroom is thin, the Input documentation gets one tight paragraph and the detail lives in `next-mode.md`.

<!-- work-fingerprint: headless-shaping-unit:specify-next-headless-selection-form-shared-headless-self-re -->

