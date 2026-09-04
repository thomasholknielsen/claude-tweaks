---
record: 229
origin: human
risk: low
size: low
ceremony: standard
grants: [build]
surface: backend
---
# 229: Restore the residue probes' header rationale comments, and three stale prose lines

Surface: backend

## Current State

Four small items surfaced from 6.69.0's ledger that were not routed into #225/#226/#227 (re-verified against the live repo at shaping time, 2026-08-17):

1. **Header rationale comments missing on three of the four named files.** `bin/lib/residue/probes/branches.js`, `bin/lib/residue/probes/worktrees.js`, and `bin/lib/residue/probes/forge.js` each start straight at `'use strict';` with no top-of-file rationale comment — confirmed by direct read. `branches.js` specifically lacks the exclusion-logic warning that predicted `[IL-111]` ("an exclusion that silently stops matching produces no error, just a catastrophic recommendation" — grep for "exclusion" in the file returns nothing). The fourth named file, `bin/lib/issues/claims.js`, is a partial correction to the original report: it already carries a substantial top-of-file header (module purpose, the claims-registry blob-store contract, a pointer to `_shared/issue-claims.md`) — it does *not* "start straight at `'use strict';`". What's actually missing from it is narrower: no mention anywhere in the file of "ADR-0004" or the "why an unprovable claim must not be released" safety argument the original report describes (confirmed via grep — zero hits).
2. `skills/wrap-up/unblocked-records.md` line 3 still reads `record: {n}` comes "from the materialized header" — confirmed unchanged; the file only ever consumes the passed-in `${CLOSED_NUM}` (line 8), never a materialized header field.
3. `skills/wrap-up/leftover-routing.md` — the `Origin:` provenance line is gated on this run's materialized header existing (`provenance: { origin: 'wrap-up leftover from #{n}' (when this run's materialized header exists — {n} = its record: field), ... }`), confirmed present at **line 19** (the original report cited line 20 — off by one, the file has drifted slightly since filing). `Outstanding` now generates partly from Step 4's routed leftovers, so a standalone `/wrap-up #N` run files leftover records with no `Origin:` line while the record number sits in Step 1's determination instead.
4. **Open question, still untested.** `skills/_shared/scratch-worktree.md` §6 ("Tearing down") documents that the `SessionStart` reaper (`bin/lib/hooks/worktree-reap.js`) only collects abandoned worktrees in the native `.claude/worktrees/` domain, never the `.worktrees/`-domain (git-fallback) path — confirmed present. But it does not say whether the `ExitWorktree` **tool call itself** succeeds on a `.worktrees/`-domain worktree, or only on ones `EnterWorktree` created. This narrower question is still open and untested.

The plan whose task briefs originally worded items 1's comments (6.69.0's SDD workspace) has since been deleted in the repo's ongoing execution-plan cleanup (most recently commit `bb1ae052`, "delete 49 execution plans whose tracking issues/PRs are all closed or merged") — the exact original wording is not recoverable verbatim; see Gotchas.

## Deliverables

- [ ] Add a top-of-file rationale comment to `bin/lib/residue/probes/branches.js`, restoring (or reconstructing, per the Gotchas note below) the exclusion-logic warning that predicted `[IL-111]`.
- [ ] Add top-of-file rationale comments to `bin/lib/residue/probes/worktrees.js` and `bin/lib/residue/probes/forge.js` explaining what each probe does and why (matching the sibling convention already present in `bin/lib/residue/probes/suite.js`, `release.js`, `pipeline-runs.js`).
- [ ] Extend `bin/lib/issues/claims.js`'s existing header (or add an inline comment at the relevant function) with the domain rule for why an unprovable claim must not be released, citing ADR-0004.
- [ ] Fix `skills/wrap-up/unblocked-records.md` line 3 to describe the record actually coming from `${CLOSED_NUM}`, not "the materialized header."
- [ ] Fix `skills/wrap-up/leftover-routing.md`'s `Origin:`-line gating so a standalone `/wrap-up #N` run (no materialized header) still emits a provenance line using the record number Step 1 already determined.
- [ ] Resolve the open `ExitWorktree` domain question empirically — test whether `ExitWorktree` succeeds against a `.worktrees/`-domain (git-fallback) worktree — and update `skills/_shared/scratch-worktree.md` §6 with the confirmed answer.

## Acceptance Criteria

- `grep -c "'use strict'" ` immediately followed by a rationale comment (not code) in `branches.js`, `worktrees.js`, and `forge.js` — each file has a non-empty top-of-file comment block before its first `require`.
- `branches.js`'s header names the exclusion-logic hazard in language a future editor would recognize as the `[IL-111]` warning.
- `claims.js` contains the phrase "unprovable" or an equivalent explicit statement of the domain rule, with a citation to ADR-0004.
- `skills/wrap-up/unblocked-records.md` line 3 no longer claims the record number comes from "the materialized header."
- A standalone `/wrap-up #N` run (verified by trace or a targeted test) produces a leftover record with a non-empty `Origin:` line.
- `skills/_shared/scratch-worktree.md` §6 states, based on an actual test run (not inference), whether `ExitWorktree` operates on git-fallback (`.worktrees/`-domain) worktrees.

## Technical Approach

Items 1-3 are comment/prose-only fixes — no behavior change, so no test-suite risk beyond the existing `tests/` prose/skill-conformance suites picking up the edited files. Item 4 needs an actual empirical probe: create (or reuse) a `.worktrees/`-domain worktree via the git-fallback path, attempt `ExitWorktree` against it, and record the observed result before updating the doc — do not guess from reading the tool's implementation alone if its behavior isn't directly inspectable; a live test is the only way to close this out honestly.

## Gotchas

- The original filer's plan/task-brief source for item 1's comment wording has been deleted (the repo's own execution-plan hygiene sweep, most recently `bb1ae052`). The fix is a reconstruction from `[IL-111]`'s incident-log writeup (`docs/incident-log.md`) and the code's actual exclusion-logic behavior, not a verbatim restore — treat "restore" as "recreate the same warning in the implementer's own words, verified against IL-111."
- `claims.js` already has a real header; don't overwrite it — extend it, or place the ADR-0004 rationale near `releasePayload` (line ~45-47) where the release-race comment already lives, whichever reads more naturally in context.
- The `leftover-routing.md` line-19 gate reads `(when this run's materialized header exists — {n} = its record: field)` — the fix needs a fallback source for `{n}` when no materialized header exists (Step 1's own determination, per the original report), not just deleting the gate condition.
- Framing check (assess-agent-autonomy/challenge, run at shaping time): FRAMING verdict `open` — every deliverable above is grounded in a specific, independently re-verified content signal (a grep result, a line-number check, or an explicitly-labeled open question), not an assumed solution.

## Original request

Restore the residue probes' header rationale comments, and three stale prose lines

Four items from 6.69.0's ledger that were not routed into #225/#226/#227 and would otherwise have died with the SDD workspace.

**1. All four residue probe files lost their header rationale comments.** `branches.js`, `worktrees.js`, `forge.js`, `claims.js` each start straight at `'use strict';`. Three consecutive implementers dropped them; by the fourth, "follow the sibling convention" meant following the degraded state.

This is not cosmetic. The comment missing from `branches.js` is the exclusion-logic warning — *"an exclusion that silently stops matching produces no error, just a catastrophic recommendation"* — and that is exactly the hazard that became `[IL-111]`: the remote-prefix derivation silently stopped matching when handed a bare branch name, and the probe reported clean forever. The comment that would have warned the next editor is still absent after the incident it predicted.

`claims.js` and `worktrees.js` lost their own safety arguments (why an unprovable claim must not be released; ADR-0004's domain rule). Restore all four from the plan's task briefs.

**2. `skills/wrap-up/unblocked-records.md` line 3** says `record: {n}` comes "from the materialized header"; the file only ever consumes the passed-in `${CLOSED_NUM}`. Non-load-bearing, but now actively misleading on the standalone path 6.69.0 opened up.

**3. `skills/wrap-up/leftover-routing.md` line 20** gates its `Origin:` provenance line on header presence. `Outstanding` now generates partly from Step 4's routed leftovers, so a standalone `/wrap-up #N` files leftover records with no provenance line while the record number sits in Step 1's determination.

**4. Open question, inferred from prose rather than tested:** whether the native `ExitWorktree` operates on a `.worktrees/`-domain (git-fallback-created) worktree or only on ones `EnterWorktree` made. `_shared/scratch-worktree.md` §6 depends on the answer. Evidence leans "either" (`cleanup-procedures.md` frames the lock by occupancy, not provenance). Only bites a project with no native worktree tool.

