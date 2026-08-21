---
record: 628
origin: human
risk: low
size: low
ceremony: fast-lane
grants: [build, merge]
surface: backend
---
# 628: unattended-tier alias has no recorded removal condition — add its policy-deprecations.md entry

Surface: backend

## Current State

`bin/lib/policy-schema.js`'s `RENAMED_KEYS` array carries a `unattended-tier` entry (currently
around line 150-155) that migrates the retired key at read time: `'on'` maps to `autonomy`'s
`'unattended'` value, and any other value (including `'off'`) null-migrates, falling through to
`autonomy`'s schema default (`supervised`).

`skills/_shared/policy-deprecations.md` documents a removal condition for every other
`RENAMED_KEYS` entry — `execution.always`, `merge-check`, `review-severity-floor`,
`automerge-max-lines`, `automerge-max-files`, `project.maturity`,
`harness-health.scoped-rule-budget`, `harness-health.always-loaded-budget`, `doc-convention.adr`,
`worktree.always` — each as its own `##` heading following the file's shared predicate. Several of
those entries' `RENAMED_KEYS` comment blocks additionally cite the file by name (e.g. "Removal
condition in skills/_shared/policy-deprecations.md.", present above `execution.always` at line 169
and `merge-check` at line 177). `unattended-tier` has neither: no `##` entry in
`policy-deprecations.md`, and no comment pointing there. `skills/dispatch/deprecated-aliases.md` is
the only other removal-condition home in the repo, but it is explicitly scoped to two
dispatch-specific aliases (`--concurrent`, `dispatch-pick-max-concurrent`) — not the right home for
a general policy key like `unattended-tier`.

CLAUDE.md's "Established codebase" paragraph requires: "A deprecated behavior gets a recorded
removal condition..., not an indefinite compatibility shim." `unattended-tier` currently violates
this.

The rename shipped in commit `6cf63a1d` ("Merge unattended-tier into the autonomy ceiling — core
lever code"), first released as **v6.76.0** (2026-08-11, per `docs/shipped-versions.tsv`), under
parent tracking issue **#288** ("autonomy/unattended-tier merge design doc" decomposition — #288
being the parent, #289-292 its sub-issues).

This repo's own `.claude-tweaks/policy.yml` already carries only `autonomy: unattended` — no stray
`unattended-tier:` line — so the shared predicate's clause (a) (`grep -nF "unattended-tier:"
.claude-tweaks/policy.yml` returns nothing) already holds today. Clause (b) (6 months since the
shipping release, checked at the next minor release) will not hold until roughly 2027-02-11 — this
record only adds the tracking entry, it does not attempt removal.

## Deliverables

1. Add a `## unattended-tier (renamed to autonomy, #288)` entry to
   `skills/_shared/policy-deprecations.md`, following the exact two-part structure every existing
   entry in that file uses: a "Now:" paragraph describing the migrate-at-read behavior, then a
   "Removal condition: the shared predicate above, with `{key}` = `unattended-tier`." closing line
   — naming v6.76.0 as the release that shipped the merge.
2. Add a short comment in `bin/lib/policy-schema.js`, at or near the `unattended-tier` object
   literal in `RENAMED_KEYS`, pointing at the new entry — matching the phrasing sibling entries use
   (e.g. "Removal condition in skills/_shared/policy-deprecations.md.").

## Acceptance Criteria

- `skills/_shared/policy-deprecations.md` contains a `## unattended-tier (renamed to autonomy,
  #288)` heading (placed among the file's other entries, in whatever position reads naturally —
  the file has no enforced ordering), using the file's exact "Now:"/"Removal condition:" structure
  and citing v6.76.0 as the shipping release.
- The "Now:" paragraph correctly states the existing migrate behavior: `'on'` → `'unattended'`;
  any other value (including `'off'`) null-migrates to `autonomy`'s schema default (`supervised`),
  since `'off'` never unlocked anything the default doesn't already match; `auditPolicy` reports
  the stray line under `renamedKeys` with the suggested replacement.
- `bin/lib/policy-schema.js`'s `unattended-tier` `RENAMED_KEYS` entry carries a comment citing
  `skills/_shared/policy-deprecations.md` as the removal-condition home, matching the convention
  used above `execution.always`/`merge-check`/etc.
- No behavior changes: the `migrate`/`replacedBy` logic for `unattended-tier` is untouched — this
  is a documentation/comment-only fix.
- `npm test` passes unchanged.

## Technical Approach

- Model the new entry directly on an existing sibling — e.g. `## review-severity-floor (renamed to
  review-auto-apply-ceiling, #332)` — same two-paragraph shape, same closing "Removal condition:
  the shared predicate above, with `{key}` = `unattended-tier`." sentence.
- In `bin/lib/policy-schema.js`, add the pointer comment near the `unattended-tier` object literal
  in `RENAMED_KEYS` (currently lines 151-155) — either inline directly above the entry, or folded
  into the existing blanket comment above `RENAMED_KEYS` (lines 139-149, which already explains
  `unattended-tier`'s `'off'` null-migrate case) — whichever reads more consistently with how
  sibling entries (`execution.always` around line 171, `merge-check` around line 179) cite their
  own removal-condition home just above their object literal.
- Grep for `key: 'unattended-tier'` before editing rather than trusting the line numbers cited
  here — the file changes independently of this record.

## Gotchas

- Do not conflate this with `skills/dispatch/deprecated-aliases.md` — that file's own opening line
  states it is scoped to the two dispatch-specific aliases; `unattended-tier` is a general policy
  key and belongs in `policy-deprecations.md`.
- The removal condition's clause (b) will not actually be satisfiable until roughly 2027-02-11 —
  this record adds only the tracking entry; it must not delete the `unattended-tier` entry from
  `RENAMED_KEYS` or `policy-deprecations.md`'s shared predicate.
- Confirm v6.76.0 is still the correct shipping release before writing it into the entry — it was
  derived by walking `git log` for the merge commit (`6cf63a1d`), confirming it's an ancestor of
  the `v6.76.0` release commit (`9f4c49b1`) but not of the prior `v6.74.0` release (`ac5c2ac4`), and
  cross-checking the date against `docs/shipped-versions.tsv`; re-derive if this history has been
  rewritten.

## Original request

unattended-tier alias has no recorded removal condition — add its policy-deprecations.md entry

# Reflect — staged finding 3

**Category:** tangential
**Severity:** low
**Reversibility:** high
**Source:** hindsight mode, lens "Convention drift"
**Files:** skills/_shared/policy-deprecations.md, bin/lib/policy-schema.js

## Finding

RENAMED_KEYS carries every alias and retirement, but unattended-tier (replacedBy autonomy, predates #331) appears in neither skills/_shared/policy-deprecations.md nor skills/dispatch/deprecated-aliases.md — every other entry has a recorded removal condition. CLAUDE.md requires a deprecated behavior to carry a recorded removal condition, not an indefinite shim.

## Suggested resolution

Add a `## unattended-tier (renamed to autonomy, #288)` entry to policy-deprecations.md under the shared predicate (name the release that shipped the autonomy merge) and point the RENAMED_KEYS comment at it.

## Decision-log reference

STAGED 13:43:02 — Step 3: tangential idea "unattended-tier missing removal condition" — backlog candidate. Surface at the Queue writes gate.

Filed from pipeline run 2026-08-16T122937-spec-332-602-334 (#332 review hindsight). Surface: backend.

