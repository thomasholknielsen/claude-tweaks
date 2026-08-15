---
record: 415
origin: human
risk: low
size: medium
ceremony: standard
grants: []
blocked-by: [411, 413, 414]
surface: backend
---
# 415: Retirement sweep: delete pending-review-durability, vocabulary sweep, diagram and docs updates

Surface: backend

## Overview

The closing sweep of the pr-first family: delete `_shared/pending-review-durability.md` (durability is structural once runs are born public — the parking procedure, scope guard, failed-run push rules, and stale-PR residual all became dead weight), update every caller and cross-reference, sweep the prose for retired vocabulary, and bring diagrams and docs current. This is the sub-issue that makes the family's deletions real: the two-thread split, the close-run-before-merge dance, headless-parked-forever, and the durability procedure must be findable nowhere except history and the incident log.

**Complexity:** Medium
**Estimated tasks:** 7

## Non-Goals

- No behavior changes — every functional conversion shipped in earlier sub-issues; this is residue removal and documentation truth.
- No deletion of local-merge fallback sections — they are permanent, not residue.
- Memory-file corrections (session-scoped hazard memories about retired procedures) are out of scope for the repo — they're corrected as encountered.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| merge-path | Merge-path conversion | ready |
| console-execution | Console execution | ready |
| sweep-backstop | Sweep backstop | ready |

"Ready" here is shaping vocabulary, not shipped-status — the Blocked-by edges enforce build order, and this sub-issue's first task still re-verifies each prerequisite actually shipped (record closed, deliverable files present: `_shared/pr-first-merge.md` exists, `bin/lib/reconcile/` exists) before deleting anything.

## Current State

- `skills/_shared/pending-review-durability.md` — the file to delete; its caller table names `wrap-up/review-console.md`, `flow/multispec-review-console.md`, and `dispatch/settle-and-merge.md` (the last already converted by the merge-path sub-issue).
- `docs/skill-graph.md` — every cross-skill edge, including durability's.
- `skills/help/SKILL.md` workflow diagrams + README lifecycle diagram — must stay in sync per CLAUDE.md.
- `docs/incident-log.md`, `CLAUDE.md` — where the migration's cost and the new model's rules land.
- Retired vocabulary after earlier sub-issues: "ready-to-merge" (transient outcome), "Dispatching-session merge execution", "pending-review durability", the Items-4/7/8 merge-owed cleanup phrasing, "close-run before merging".

## Deliverables

- [ ] Delete `skills/_shared/pending-review-durability.md` and its sibling procedure file `skills/flow/pending-review-durability-console.md`; convert the remaining callers (`wrap-up/review-console.md`, `flow/multispec-review-console.md`) — under pr-first their consoles already ride the PR. Backstop: if the merge-path conversion left any durability reference in `dispatch/settle-and-merge.md`, convert it here; the vocabulary sweep's grep is the check. The local-merge path keeps a one-paragraph inline note at each caller's former invocation point stating parked local runs stay session-resident. That one paragraph is sufficient, argued: the durability procedure's population was dispatch-originated runs only (its scope guard requires `CLAIM_RUN_ID`), dispatch requires a forge, and pr-first makes every forge run born-public — so the local-merge path has no durability consumer left to protect, and nothing functional is lost.
- [ ] Negative vocabulary sweep: for each retired token above, `grep -ri` across `skills/ docs/ bin/ README.md CLAUDE.md` (find+xargs with a control grep — recursive grep honors .gitignore and silently skips run dirs), with tombstone-scope stated: matches allowed only in `docs/incident-log.md`, `docs/superpowers/` archives, and local-merge fallback sections — which carry a literal greppable marker (`<!-- local-merge-fallback -->`) so the scope check is mechanical, not judgment. Seed-list completeness is itself the first sweep task: cross-check the token list against each shipped sub-issue's record/PR for retired terms before sweeping. Mid-sentence tokens (the Items-4/7/8 phrasing living inside still-valid sentences) are reworded, never just deleted.
- [ ] `docs/skill-graph.md`: remove durability edges; verify the family's new `_shared` files have their edges (grep for `integration-model` and `pr-first-merge` — the earlier sub-issues own adding them, this one verifies and fills any gap found).
- [ ] `/help` workflow diagram + README artifact-lifecycle diagram updated to the pr-first shapes (born-public runs, PR console, reconciler) — the two must stay in sync.
- [ ] CLAUDE.md: Hooks/Working sections updated for the reconciler and pr-first model (short rule + why, per the conciseness convention); incident-log entry recording what the migration cost and what it deleted.
- [ ] `docs/plugin-structure.md` updated for `bin/lib/reconcile/` and removed/added `_shared` files.

## Acceptance Criteria

1. `test ! -f skills/_shared/pending-review-durability.md` and the callers' conversion grep shows zero references outside the allowed tombstone scope.
2. Each retired-vocabulary grep returns matches only inside the allowed scope, with the control grep (a token known to exist) proving the search tooling saw the tree.
3. `docs/skill-graph.md` contains no edge naming the deleted files (grep), greps confirm `integration-model` and `pr-first-merge` edges are present, and `npm test`'s graph/reference conformance suites pass (name the specific suite in the plan's verification step).
4. The `/help` diagram and README diagram both name the reconciler and the PR console (manual diff of the two confirms sync).
5. `npm test` passes.

## Technical Approach

Sweep discipline per this project's established rules: derive the file list by grepping every retired token, not just headline words (leaf files get silently missed); state tombstone scope in the greps themselves; use find+xargs (not recursive grep) so gitignored state dirs are still searched, with a positive-control grep proving coverage.

### Key Files

- `skills/_shared/pending-review-durability.md` — deleted.
- `skills/flow/pending-review-durability-console.md` — deleted (the sibling procedure file the multispec console cites).
- `skills/wrap-up/review-console.md`, `skills/flow/multispec-review-console.md` — caller conversion.
- `skills/_shared/pr-first-merge.md` — created by the merge-path sub-issue; exists by the time this runs (prerequisite verification above).
- `docs/skill-graph.md`, `skills/help/SKILL.md`, `README.md`, `CLAUDE.md`, `docs/incident-log.md`, `docs/plugin-structure.md`.

## Gotchas

- Delete + tombstone acceptance criteria are structurally self-defeating unless the grep excludes the tombstone scope — the ACs above already scope their greps; keep that shape when writing the plan's verification commands.
- `docs/superpowers/` archives are historical record — never swept; they're inside the allowed scope.
- CLAUDE.md has a 150-line budget and the rule+why convention — resist narrative.
- The stale memories about push-from-worktree/close-run hazards describe the *retired* model — if encountered during this work, correct them; do not re-encode them as current rules in CLAUDE.md.
- Concurrent records touch the same prose surfaces — #383 (design-craft sections of CLAUDE.md-adjacent files) and #276 (README/routine docs) — surgical edits only, no adjacent reformatting; the specific conflict risk is CLAUDE.md's Hooks section and README's lifecycle diagram.

<!-- work-fingerprint: pr-first-integration-model:retirement-sweep-delete-pending-review-durability-vocabulary -->
