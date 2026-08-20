---
record: 539
origin: human
risk: low
size: low
ceremony: fast-lane
grants: [build]
surface: backend
---
# 539: feedback: Step 4 dedup search sends pre-scrub draft text to GitHub's public search API — scrub or sanitize the fingerprint basis first

Surface: backend

## Current State

`/feedback`'s Step 4 (dedup) derives a fingerprint basis (`{ component, summary }`) from the
affected component plus the core symptom, and sends it as search keywords to:

```bash
gh issue list --repo thomasholknielsen/claude-tweaks --search '<keywords>' --state all --limit 10 --json number,title,state,url
```

(`skills/feedback/SKILL.md` Step 4). This runs before Step 6's scrub gate, which is the step that
removes credentials, absolute paths outside the plugin, code excerpts from the reporting project,
and the reporting project's name (Step 6, "HARD GATE"). This ordering predates record #509's
session-evaluation gather, which substantially raises both the volume and the specificity of
transcript-derived content flowing into the drafted item — and therefore into the pre-scrub
fingerprint basis used for the Step 4 search. Today, nothing stops draft-derived text that may name
private files, paths, or infrastructure from being sent to GitHub's public search API before the
scrub gate has had a chance to run.

Step 0's batch loop (line ~89 of `skills/feedback/SKILL.md`) also cross-references "Step 4's dedup
fingerprint basis stays the same way" — this description needs to stay accurate once Step 4 itself
changes.

## Deliverables

- Restructure Step 4 so no draft-derived, potentially-private text leaves the machine before
  Step 6's scrub criteria have been applied to it. Either:
  - (a) derive the `--search` keywords from the affected-component name only — never from the
    free-text symptom/summary — since a component name (a skill, contract, or CLI name) is
    inherently public vocabulary already; or
  - (b) run a lightweight scrub pass over the fingerprint basis (component + summary) ahead of
    Step 4, reusing Step 6's existing removal criteria rather than duplicating scrub logic.
- Update `skills/feedback/SKILL.md`'s Step 4 section, and Step 0's batch-loop cross-reference to
  "Step 4's dedup fingerprint basis," to describe the corrected ordering/derivation.
- Leave Step 4's other behavior unchanged: the same `gh issue list --search` call shape, the same
  interactive three-way ask (file anyway / comment on existing / cancel), and the same batch-mode
  dedup-flag behavior inside Step 0's loop.
- Leave the Step 8 fingerprint marker computation (`fingerprintFromBasis('feedback', basis)` in
  `bin/lib/health-core/fingerprint.js`) untouched — it consumes the same `{ component, summary }`
  basis for a different purpose (stable dedup-on-refile detection, not privacy) and must keep
  seeing the full, unscrubbed basis.

## Acceptance Criteria

- [ ] No text that has not passed Step 6's scrub criteria (credentials, absolute paths outside the
      plugin, code excerpts, private project names) can appear in the `--search` argument sent to
      `gh issue list` in Step 4.
- [ ] Step 4's dedup search still functions as a duplicate-detection mechanism — plausible matches
      are still surfaced to the user (interactive) or flagged on the drafted item (batch mode).
- [ ] `skills/feedback/SKILL.md` Step 4, and its Step 0 batch-loop cross-reference, are updated to
      document the new ordering or keyword-derivation rule.
- [ ] The Step 8 fingerprint marker (`fingerprintFromBasis`) still receives the full, unmodified
      `{ component, summary }` basis — this fix touches only the Step 4 search call, not the
      fingerprint computed later.
- [ ] Any existing test coverage for Step 4 / dedup / the fingerprint basis under `tests/` still
      passes; add coverage if the change introduces a discretely testable function.

## Technical Approach

Prefer option (a) — deriving the dedup search from the component name only — as the simpler fix:
it needs no new scrub logic to write or maintain, and a component name (a skill, contract, or CLI
name named in this project's own public docs) carries no privacy risk on its own. Verify the
current call shape with `grep -n "gh issue list --search" skills/feedback/SKILL.md`, then confirm
the search keywords no longer include the free-text `summary` half of the fingerprint basis while
`{ component, summary }` as a whole is still passed through unchanged to Step 8's
`fingerprintFromBasis` call. If component-name-only search proves too weak in practice to catch
real duplicates (the search matches too broadly or misses true positives), fall back to option (b):
dispatch a lightweight scrub of just the fingerprint basis, reusing Step 6's removal-criteria list,
ahead of Step 4 — not a second, separately-maintained scrub implementation.

## Gotchas

- The fingerprint basis (`{ component, summary }`) feeds two different downstream consumers: the
  Step 4 search query (this record's target) and the Step 8 fingerprint marker via
  `fingerprintFromBasis('feedback', basis)` (out of scope). A fix that scrubs or narrows the basis
  itself, rather than just what Step 4 sends onward, would silently break Step 8's
  dedup-on-refile detection — narrow the fix to Step 4's own `--search` call.
- Step 0's batch loop (line ~89) independently describes "Step 4's dedup fingerprint basis" —
  check that this cross-reference is still accurate after the fix; don't edit Step 4's own section
  and leave the batch-loop description stale.
- This finding was originally rated tangential/low severity/high reversibility by the `/reflect`
  lens pair that surfaced it, and routed to a backlog record by the ledger's resolve gate at
  `autonomy ceiling: unattended`. Keep the fix scoped to the ordering/derivation issue — not a
  broader Step 4 rewrite.

## Original request

feedback: Step 4 dedup search sends pre-scrub draft text to GitHub's public search API — scrub or sanitize the fingerprint basis first

# Reflect — staged finding 3

**Category:** tangential
**Severity:** low
**Reversibility:** high
**Source:** review lens (error-handling/security pair), routed via the ledger's resolve gate
**Files:** skills/feedback/SKILL.md

## Finding

`/feedback`'s Step 4 dedup runs a `gh issue list --search '<keywords>'` against the public repo using component + core-symptom text derived from the draft — before Step 6's scrub has run. This ordering predates record #509, but the new session-evaluation gather substantially raises the odds that transcript-derived content (possibly naming private files or infrastructure) reaches that pre-scrub search query.

## Suggested resolution

Either move a lightweight scrub of the fingerprint basis ahead of Step 4, or derive the dedup keywords from the affected component name only (never symptom free-text) so nothing draft-derived leaves the machine before the scrub gate.

## Decision-log reference

Routed to a backlog record by the ledger resolve gate (autonomy ceiling: unattended, remainder auto-routes to Keep-backlog).

