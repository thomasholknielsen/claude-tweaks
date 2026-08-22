---
record: 660
origin: human
risk: medium
size: medium
ceremony: standard
grants: [build]
surface: backend
---
# 660: review-auto-apply-ceiling: prose-exempt tier bump — encode the carve-out every run re-invents

Surface: backend

## Current State

`review-auto-apply-ceiling` caps auto-apply at a single severity (`none`/`low`/`medium`), resolved once per run via `skills/_shared/policy-schema.md`'s lever table and enforced uniformly in `skills/review/step3-routing.md` regardless of what kind of file a finding's fix touches. In run `2026-08-16T091924-spec-563-564-565-566`, ceiling `low` was in effect across 4 specs; in all 4, a confirmed medium-severity finding was auto-applied instead of staged, each justified in `decisions.md` with an identical runtime-invented carve-out: "prose-only skill-doc text with no code path, independently verified before applying." Six findings landed this way (4 medium, 2 low); none were reverted; the user approved every merge without contesting the deviation. The ceiling has no dimension for diff class (prose-only doc/skill text vs. code), so every run re-derives the same carve-out ad hoc rather than the pipeline encoding a policy it already, in practice, follows unanimously.

## Deliverables

- A new policy dimension `review-auto-apply-prose-exempt` (default: on) in `skills/_shared/policy-schema.md`'s lever table, alongside the existing `review-auto-apply-ceiling` row.
- `bin/lib/policy-schema.js` updated to resolve the new dimension through the same precedence chain as existing levers (CLI arg > pipeline config > project policy > skill default).
- `skills/review/step3-routing.md`'s auto-apply routing table updated: when `review-auto-apply-prose-exempt` resolves on and a finding's entire fix touches only `skills/**/*.md`, `docs/**/*.md`, or `tests/**`, the finding auto-applies at one severity tier above the resolved `review-auto-apply-ceiling` (e.g. ceiling `low` + a prose-exempt fix at `medium` severity → auto-applied, not staged) instead of the current uniform ceiling.
- The decision-log entry format for a prose-exempt bump names the bump explicitly: `[lever: review-auto-apply-ceiling=low (default); prose-exempt bump applied]`, distinguishing it from an ordinary ceiling-driven auto-apply entry.

## Acceptance Criteria

- [ ] `skills/_shared/policy-schema.md`'s lever table carries a `review-auto-apply-prose-exempt` row (home, consumer, default `on`, one-line semantics) matching the existing row format.
- [ ] `bin/lib/policy-schema.js` resolves `review-auto-apply-prose-exempt` through the same precedence chain (CLI arg > pipeline config > project policy > skill default) as `review-auto-apply-ceiling`, with a corresponding unit test.
- [ ] `skills/review/step3-routing.md`'s routing table auto-applies a finding one severity tier above the resolved ceiling when the finding's fix diff touches only `skills/**/*.md`, `docs/**/*.md`, or `tests/**` and the dimension is on; a fix touching any other path is unaffected and still routes on the plain ceiling.
- [ ] A finding whose fix spans both a prose-only file and a non-exempt path (e.g. a `.md` doc plus a `.js` source file in the same fix) does not receive the bump — the exemption requires the entire fix to stay within the exempt glob set.
- [ ] Setting `review-auto-apply-prose-exempt: off` (project policy or CLI) restores today's plain-ceiling behavior with no bump, covered by a test.
- [ ] The auto-decision-log entry for a bumped auto-apply names the bump per the format above, distinguishable from a plain ceiling-driven entry.
- [ ] Existing `review-auto-apply-ceiling` tests and `step3-routing.md` prose-conformance tests still pass unmodified where they don't touch the new dimension.

## Technical Approach

Follow the existing lever pattern in `bin/lib/policy-schema.js` — add `review-auto-apply-prose-exempt` alongside `review-auto-apply-ceiling` with the same precedence-resolution helper, default `on`. In `step3-routing.md`'s routing table, the severity lookup becomes: resolve `review-auto-apply-ceiling` as today, then when `review-auto-apply-prose-exempt` resolves on AND every changed path in the finding's fix diff matches `skills/**/*.md`, `docs/**/*.md`, or `tests/**`, look up one tier above the resolved ceiling instead of the ceiling itself — capped so the bump never exceeds `medium` auto-apply (a `none` ceiling with the exemption on auto-applies Low only; it never reaches Critical at any ceiling value). Diff-class detection reuses whatever changed-file list the staged-patch proposal (`_shared/staged-patch.md`) already carries — no new diff-parsing needed.

## Gotchas

- Related: #627 (floor→ceiling vocabulary rename) — check for terminology drift between that rename and this change before merging either.
- The one-tier bump must never let a `none`-ceiling run auto-apply at a severity the pipeline hasn't been asked to enable at all — cap the effective post-bump severity, don't add one tier unconditionally to every ceiling value.
- The observed 4-of-4 sample is real but small; the Acceptance Criteria above encode the observed carve-out's exact scope (prose-only fix, one tier) rather than generalizing further (e.g. two-tier bumps, or non-doc paths) without new evidence.

## Original request

review-auto-apply-ceiling: prose-exempt tier bump — encode the carve-out every run re-invents

## Overview

In run 2026-08-16T091924-spec-563-564-565-566, `review-auto-apply-ceiling: low` was overridden in 4 of 4 specs with the identical runtime-invented carve-out — confirmed medium findings auto-applied instead of staged, each justified as "prose-only skill-doc text with no code path, independently verified before applying" and disclosed in `decisions.md`. Six findings (4 medium, 2 low) landed this way; zero were reverted; the user approved the merge without contesting any.

When a lever's stated contract is routed around identically on every occurrence and outcomes vindicate the route-around, the contract — not the behavior — is what's wrong. The per-run deviation notes are doing structurally what a policy dimension should do declaratively.

Related: #627 (floor→ceiling vocabulary rename).

## Suggested shape

Make the ceiling diff-class-aware: a `review-auto-apply-prose-exempt` dimension (default on) under which findings whose entire fix touches only `skills/**/*.md`, `docs/**/*.md`, or `tests/**` auto-apply one severity tier above the configured ceiling, with the tier bump named in the decision-log entry (`[lever: review-auto-apply-ceiling=low (default); prose-exempt bump applied]`). Encodes the judgment the pipeline already exercises, restoring the lever's descriptive truth.

**Origin:** `/claude-tweaks:feedback` session evaluation (Trust calibration lens), run 2026-08-16T091924-spec-563-564-565-566.

**Files:** skills/review/step3-routing.md, skills/_shared/policy-schema.md, bin/lib/policy-schema.js

