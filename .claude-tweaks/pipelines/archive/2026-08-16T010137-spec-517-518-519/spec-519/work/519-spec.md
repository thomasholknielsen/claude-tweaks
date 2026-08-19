---
record: 519
origin: human
risk: medium
size: low
ceremony: standard
grants: []
fingerprint: tidy-report-auto-routing:tidy-routing-flips-moderate-default-and-the-missing-routing
blocked-by: [517, 518]
surface: backend
---
# 519: Tidy routing flips, moderate default, and the missing-routing-rule principle

<!-- work-fingerprint: tidy-report-auto-routing:tidy-routing-flips-moderate-default-and-the-missing-routing -->
Surface: backend

## Overview

Consume the new reconcile checks from tidy's decision surface and finish the auto-apply expansion: rework `step-6-auto.md`'s Step 6 routing table so issue-closed claim release, locked-worktree resolution, and abandoned-branch archival are reported as reconcile-converged rather than staged or hand-waved; move the shipped `tidy-aggressiveness` default from `conservative` to `moderate`; land the design principle — *a recurring staged item is a missing routing rule* — in `step-6-auto.md`'s preamble; and amend `SKILL.md`'s branch-delete anti-pattern row so the skill no longer contradicts the cherry-verified deletion machinery.

**Complexity:** Medium
**Estimated tasks:** 6

## Non-Goals

- No reconcile code changes — the checks this consumes are the prerequisite sub-issue's deliverables.
- No report-template changes — the sibling template sub-issue owns both step-6 files' presentation and lands first (this record is dependency-blocked on it).
- The `conservative` tier is not removed — it remains a documented policy opt-down.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #517 | Reconcile: issue-closed claim release, branch archival, and archive-tag aging | not started |
| #518 | Tidy report template: Applied/Approve/Yours/Clean across both surfaces | not started |

**Freeze point:** the routing rows and Applied-section references below are written against #517/#518's *specified* shapes. Before drafting any prose, re-read #517's landed module headers (check names, `result.branches` shape) and #518's landed template (section names) — the landed artifacts, not this record's assumptions, are authoritative; reconcile any drift then.

## Current State

- `skills/tidy/step-6-auto.md` — the routing table has **no rows named for claim release or locked worktrees today**: claim behavior lives in prose ("claim releases are never autonomous in /tidy") and in the "Unsettled run" row's text ("releasing drops a claim another session may still hold; … this sweep only ever surfaces, never … decides or executes"), which is `Auto (no-op, always surfaced)` at every tier; the "Delete" row for cleanly-merged worktrees/branches is already `Auto-apply` at every tier — only the *unmerged/abandoned* case has no auto path. The default-read line says "(default `conservative`)" and the table's tier-column header reads "`conservative` (default) | `moderate` | `aggressive`". The preamble carries no design-principle statement.
- `skills/_shared/policy-schema.md` — `tidy-aggressiveness` schema entry with `conservative` default; `moderate`'s semantics are already defined by the routing table's own middle column (the tier pre-exists; only the default moves).
- `bin/resolve-policy.js` (and any schema/tests under `bin/`/`tests/` that encode the `tidy-aggressiveness` default) — must be checked for a code-level `conservative` default; the prose flip alone would silently disagree with the resolver.
- `skills/flow/manifesto.md` — an example `config.yml` block shows `tidy-aggressiveness: conservative` (illustrative, but stale the moment the default moves).
- `skills/tidy/SKILL.md` — Anti-Patterns row: "Escalating `git branch -d` to `-D` when delete refuses … Never destructive-delete autonomously either way."
- Tidy's trigger wiring into reconcile already exists (#408): the scan procedures run `reconcile()` at tidy's own trigger points, and its result object (`result.claims` / `result.worktrees` / and, after #517, `result.branches`) is the data the report's Applied section renders — no new call path is invented here.
- `docs/skill-graph.md` — the single home for cross-skill edges; tidy's edges live there.

## Deliverables

- [ ] Routing-table rework — three changes, named precisely: (1) **add** a row for issue-closed claim release: reconcile-converged, reported in Applied, never staged; (2) **amend** the "Unsettled run" row's text so its "never releases" language defers to the reconcile check for the issue-closed case (its surface-only stance survives for claims on still-open issues); (3) **add** a row for abandoned-branch archival (cherry-verified delete / archive-tag path) and locked-worktree resolution via `worktree-reap.js`'s liveness predicates: reconcile-converged, with a live-owner lock reported as a one-line skip. The `local-merge` caveat is stated **once in the table's preamble** (under that model everything still stages, unchanged) and each affected row references it — never restated per row (the `[IL-93]` drift rule).
- [ ] The claim-release row (or the preamble note it cites) states the exemption honestly: releasing a claim IS an outward GitHub write (claims-blob write, `bot:in-progress` removal), permitted because it is reconcile's background-convergence write — shipped behavior for merged-PR evidence since before this change — and outside the skill-side auto-mode contract; the tidy row only reports the result.
- [ ] Default flip, all encodings: `step-6-auto.md`'s default-read line AND the table header cell (`moderate` (default)), `policy-schema.md`'s schema default, any `bin/`/`tests/` code-level default found by a repo-wide grep for the current default value, and `flow/manifesto.md`'s example block. `conservative` documented as the opt-down.
- [ ] Principle paragraph in `step-6-auto.md`'s preamble, stated once repo-wide: a recurring staged item is a missing routing rule; the approval bucket should be empty in steady state; the durable exception is outward-facing GitHub writes the auto-mode contract forbids at every tier (which is precisely why the claim-release exemption above must ride on reconcile, not on a tidy tier).
- [ ] `SKILL.md` anti-pattern row amended: `-D` on proven `git cherry` patch-equivalence, executed by the reconcile check, is not destructive-delete; the genuinely-unmerged case is covered by the archive-tag path. Both carve-outs are `pr-first`-only (the checks don't run under `local-merge` — say so in the row); manual `-D` without that evidence remains forbidden on both models.
- [ ] `docs/skill-graph.md`: add the tidy→reconcile consumption edge (tidy triggers convergence and reports its results).
- [ ] Release-note obligation recorded: the release that ships this must announce the default change (expand-contract discipline for a distributed behavior change) — carry the note into the wrap-up/release step, do not bury it.

## Acceptance Criteria

1. A case-insensitive grep for `conservative` across `skills/tidy/step-6-auto.md` finds it only where it names the opt-down tier or a tier column — never as the stated default; both the default-read line and the table header name `moderate` as default.
2. A repo-wide grep (`skills/`, `docs/`, `bin/`, `tests/`) for the `tidy-aggressiveness` default finds `moderate` in every encoding (prose, schema, resolver code, manifesto example) — with a negative control confirming the grep matches the pre-change state first.
3. The principle's key phrase ("recurring staged item") appears exactly once across `skills/` and `docs/`.
4. `SKILL.md`'s amended anti-pattern row names cherry/patch-equivalence as the carve-out condition, marks both carve-outs `pr-first`-only, and keeps the prohibition for the no-evidence case.
5. The added/amended routing rows name the landed reconcile check names (per the freeze point) and reference the preamble's single `local-merge` caveat.

## Technical Approach

Prose-plus-default-encodings pass. The routing rows must not restate reconcile's decision logic (evidence conditions, thresholds) — rows point at the checks; the module headers are the single source of truth for their own behavior. The principle paragraph is deliberately placed in `step-6-auto.md` (tidy-specific routing guidance), not in the auto-mode contract or CLAUDE.md — no restatement anywhere else.

### Key Files

- `skills/tidy/step-6-auto.md` — routing rows, default line + header cell, principle paragraph, local-merge preamble note
- `skills/tidy/SKILL.md` — anti-pattern row
- `skills/_shared/policy-schema.md` — schema default
- `bin/resolve-policy.js` / `tests/` — code-level default, if the grep finds one
- `skills/flow/manifesto.md` — example config block
- `docs/skill-graph.md` — tidy→reconcile edge

### Package Dependencies

None.

## Gotchas

- The shipped-default change reaches every consuming repo — the release-note obligation is a deliverable, not a nicety; a silently flipped default is exactly the expand-contract violation CLAUDE.md forbids.
- Do not let the principle read as "everything must eventually auto-apply" — the durable exception (contract-forbidden outward writes) is part of the principle's statement, not a footnote.
- Open records #334 (backlog) and #113 (parked) also name `step-6-auto.md` in their Key Files — dormant, but check for freshly landed changes before editing.
- The sibling template sub-issue rewrites other sections of the same two tidy files and lands first (dependency edge) — merge from the integration branch (`main` here; resolve via `_shared/integration-branch.md`'s ladder, never hardcode) before starting.
- Describe routing-row sets by reference, never by literal count (CLAUDE.md's cardinality rule) — counts drift.
