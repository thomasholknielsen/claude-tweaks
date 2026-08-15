# Tidy Report Redesign + Reconcile-Backed Auto-Apply — Design

**Source record:** #506 (born-ready capture, 2026-08-15 session)
**Status:** approved in-session; phases below map to `/claude-tweaks:specify` work units

## Problem

A standalone-auto `/tidy` run's final report buries action. Observed failures (2026-08-15 run,
PR #504's parent session): an improvised box-drawing table whose cells truncate mid-word at
terminal width; staged findings with no stated resolution path (stale claims were reported with
no way to release them); attention-required findings (acceptance gaps, cross-spec patterns)
mislabeled as FYI; bare issue numbers forcing a `gh issue view` round-trip per row; the merge
approval asked *before* the report rendered; and `decisions.md` content replayed into chat and
then restated in the final table.

Root cause, format side: `step-6-auto.md`'s standalone bookend is one clause ("Present staged
items in a Pending Review section") with no template, while the interactive twin has a full
literal template and a hard gate. The highest-visibility surface of an auto run is the
least-specified part of the skill.

Root cause, routing side: several staged items were mechanical, not judgment calls — but the
machinery that could prove it (reconcile's claim/PR joins, `worktree-reap.js`'s lock-owner
liveness predicates) is not what tidy's routing rows consult. Audit findings that shaped this
design:

- `bin/lib/reconcile/release-merged.js` already releases claims autonomously — but only on
  `PR state == MERGED` evidence. It deliberately skips `no-pr` and `pr-closed-unmerged`, which
  are exactly the shapes tidy staged (#354/#367/#399: live claims on closed issues).
- `bin/lib/hooks/worktree-reap.js` already parses lock reasons
  (`locked claude session <name> (pid N …)`), checks owner liveness, fails closed on
  unparseable reasons, and applies a modification grace period. Tidy's "locked, manual review"
  staging never consulted it.
- The auto-mode contract forbids *skill-side* autonomous API writes at every tier. Background
  convergence (`bin/lib/reconcile/`) already writes claim releases and label removals
  autonomously by design. Placing the new mechanical cases in reconcile therefore requires no
  contract amendment: tidy triggers the reconciler (trigger wiring shipped with #408) and
  reports what converged.

## Design principle (lands in `step-6-auto.md`'s preamble, stated once)

A recurring staged item is a missing routing rule. The approval bucket should be empty in
steady state — it exists for genuinely novel findings the rules have not classified yet, and
each appearance is a to-do for the skill author, not the user. The durable exception:
outward-facing GitHub writes the auto-mode contract forbids at every tier legitimately stay as
approvals forever.

## Phase 1 — Reconcile extensions

All changes live in `bin/lib/reconcile/` and are `pr-first`-only, like the module itself.
`local-merge` projects keep today's staging behavior for every case below — state this caveat
in `step-6-auto.md` where the routing rows change (Phase 3).

### 1a. Issue-closed claim release (`release-merged.js`)

Extend the pure `decideRelease` decision table with a second evidence path: when the claim's
issue is `CLOSED` (any close reason — a closed issue cannot legitimately be in progress, so a
live claim on it is residue by definition), release even when the PR join yields `no-pr` or
`pr-closed-unmerged`. Existing guards unchanged: only `live`/`stale` claim states act;
`gh-absent`/`network-failure`/unknown issue state all skip (fail closed). Release reason
string: `issue-closed: reconciled from #N`.

### 1b. Branch archival check (new module, `archive-branches.js`)

Scope guard: plugin-owned branch namespaces only (`build/*`, `worktree-*`, `demo/*`), and only
branches with no attached worktree. Per branch, in order:

1. `git cherry {integration-branch} {branch}` shows every commit patch-equivalent upstream →
   plain `git branch -D` (merged in substance; covers the squash merges that ancestry checks
   and `git branch -d` both miss).
2. Genuinely unmerged AND tip commit older than 14 days AND the branch's PR join shows
   `pr-closed-unmerged` or `no-pr` → create lightweight local tag `archive/{branch-name}` at
   the tip, then delete the branch. The tag is the reversibility conversion that lets this
   auto-apply: recoverable and *findable*, unlike reflog-only recovery.
3. Anything younger or with an open PR: untouched — someone may be working.

Tag aging, same module: delete `archive/*` tags whose tagged commit date exceeds 90 days
(matches git's default reflog window — the tag's marginal value drops to zero as the reflog
copy expires). Hardcoded 90; no policy lever until someone needs one.

### 1c. Locked worktrees — consumption, not construction

No new mechanism. Tidy's scan/report consumes `worktree-reap.js`'s existing predicates:
live owner pid → one report line `in use by session {name} (pid {n}) — skipped`; dead owner →
reap's existing path already handles it; unparseable lock reason → stays staged (fail closed,
matching reap's own posture). `worktree-reap.js` itself is untouched.

### Tests

`tests/bin-lib/reconcile/` suites for the extended decision table and the new archive module —
pure-function decision tests plus the revert-the-fix discrimination check (revert the
implementation change and confirm the new tests actually fail).

## Phase 2 — Report template (both tidy surfaces)

One literal template replaces both `step-6-auto.md`'s standalone bookend and
`step-6-interactive.md`'s report, so the two modes cannot drift. Wrap-up's Review Console is
out of scope (candidate follow-up record). Four sections:

```markdown
## Tidy — complete ({tier} tier)

**Applied automatically** — audit: {run-dir}/decisions.md
- {one line per action or converged reconcile result}

**Approve ({N})**            ← omitted entirely when empty
1. {item — why it needs approval — what approving does}

**Yours ({N})** — run in another terminal:
{finding, with record titles never bare numbers}:
    /claude-tweaks:{skill} #{n}    ← exact copy-pasteable command per item

**Clean:** {comma list of scans with nothing to report}
```

Rules baked into the template block, binding on both surfaces:

- No box-drawing tables anywhere in the report — grouped lists survive any terminal width.
- Every actionable line carries either a paste-ready command (Yours) or lands in Approve;
  information-only rows for actionable findings are forbidden.
- Record titles always accompany issue numbers — never a bare `#N` list.
- Report-before-question hard gate: the interactive surface already has it; the auto bookend
  gets the identical gate (the full report must be rendered in the same response, above any
  `AskUserQuestion`).
- In interactive mode the Approve section holds all pending actions and the existing
  Apply-all/Override question covers it unchanged.
- `## Next Actions` options are drawn from the Yours items, not a fixed navigation menu.
- `decisions.md` is referenced by path exactly once, never replayed into chat.

## Phase 3 — Routing table, shipped default, docs

- `step-6-auto.md` routing rows for claims, locked worktrees, and merged/archivable branches
  flip from Stage to "converged by reconcile — report the result; stage only reconcile's skips
  (and everything, under `local-merge`)."
- Shipped `tidy-aggressiveness` default: `conservative` → `moderate` (`step-6-auto.md` +
  `_shared/policy-schema.md`'s default). `conservative` remains a policy opt-down. This is a
  distributed behavior change: the release notes for the shipping version MUST announce it,
  per the expand-contract discipline for shipped contracts.
- The design principle above lands in `step-6-auto.md`'s preamble, once — no restatement in
  CLAUDE.md or the contract files.
- `tidy/SKILL.md`'s anti-pattern row "Escalating `git branch -d` to `-D` … never
  destructive-delete autonomously either way" is amended to carve out Phase 1b's
  cherry-verified case: `-D` on proven patch-equivalence is not destructive, and the archive
  tag covers the genuinely-unmerged case. Without this the skill contradicts the machinery.
- `docs/skill-graph.md`: add/update the tidy↔reconcile edge if the consumption in Phase 1c
  constitutes a new relationship.

## Out of scope

- Wrap-up Review Console restructuring (follow-up candidate).
- Any `local-merge` counterpart to the reconcile checks.
- Policy levers for the 14-day branch age or 90-day tag aging thresholds.
- Harness-level transcript noise (agent progress lines, backgrounding artifacts) — not
  addressable from skill prose.
