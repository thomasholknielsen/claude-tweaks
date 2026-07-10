# Tidy-GitHub-triage evidence tier + digest — Design

## Problem

`/claude-tweaks:tidy --scope=github` (`skills/tidy/routine-template-github-triage.yml`)
pilots a frequent (every 3h), narrow sweep alongside the weekly full sweep. Its
findings today route through exactly two buckets: auto-apply-safe (unchanged by
this design — stale deletes, cleanly-merged worktree removal) and staged, which
always waits for a human via Step 6's batch gate, regardless of aggressiveness.

When this routine fires unattended (no parent pipeline run, `auto-mode:
default-on`), it falls onto the Standalone-auto path: staged items land in a
throwaway `.claude-tweaks/pipelines/{ts}-tidy-standalone/` run directory,
presented in a "Pending Review" section at the end of that run's own report —
which, because nobody is watching a scheduled routine's transcript, nobody
reliably reads. Compounding this: the run directory itself is never archived
(only `/wrap-up`'s Review Console archives completed *pipeline* runs; a
standalone run never reaches that mechanism), and `PushNotification` isn't
wired up anywhere in `/tidy` at all. `_shared/auto-decision-log.md` even
documents the archival gap directly, calling `/tidy`'s "compact archive
entries older than 30 days" behavior "planned — not yet implemented."

Firing every 3 hours also means the same open finding (an unresolved thread, a
stale PR) would get re-staged and re-notified every cycle without some form of
dedup.

## Solution

### A. A third bucket: `auto-mutate-with-evidence`

Gated by a new project policy flag, `tidy-routine-autonomy: conservative |
evidence-based` (default `conservative` — today's behavior, unchanged; a
project must explicitly opt in). Applies only to routine-fired standalone
runs — an interactive, human-invoked `/tidy` keeps staging these for Step 6
regardless, since a human is already present to answer the prompt.

Qualifying findings carry specific, cite-able evidence — not a heuristic:

- Unresolved review thread + a later commit provably touches the flagged
  file:line → Resolve thread (evidence: the commit SHA)
- Parked backlog issue whose milestone date has passed → Promote (evidence:
  the date)
- Parked backlog issue whose watched path was touched → Promote (evidence:
  the `git log` hit)
- Code-health/harness-health issue whose flagged code is demonstrably
  removed/rewritten since filing → Close, superseded (evidence: the diff)

Explicitly **excluded**, staying staged no matter what — because the
`repo-wide` findings table already calls these judgment calls: stale-PR
close-or-resume, PR-superseded-by-equivalent-work, backlog inbox->4wk
delete-or-promote, and any "still valid" issue assessment. No evidence tier
touches these; they need a read on intent, not a timestamp.

Every auto-mutation logs an `AUTO` line to `decisions.md` citing the literal
evidence used (commit SHA, milestone date, diff reference) — never just a
reason label.

### B. A rolling digest, updated in place

For `backlog-backend: github-issues` projects, GitHub itself is the durable,
already-visible medium for every mutation — no new artifact needed there. For
findings with no GitHub home under this pilot's current scope (in practice,
close to none — this narrows further once a future round extends the evidence
tier to the weekly sweep's more analytical findings), and for `local-files`
backend projects, maintain one rolling digest artifact (a single GitHub issue,
or a committed file under `local-files`) that each firing *updates in place*,
never recreates, with three sections: "Auto-applied," "Auto-mutated with
evidence," and "Still needs your review." The last section also surfaces the
Dispatcher's pending-authorization queue size (see
`2026-07-10-dispatcher-status-lifecycle-design.md`), so a human has one
consolidated place for everything currently awaiting their attention, rather
than checking `/tidy`'s digest and the Dispatcher's queue separately.

`PushNotification` fires only when the digest's "still needs your review"
section is non-empty — never on an all-clear firing, keeping the signal
high-value.

### C. Dedup across firings

Before staging or notifying on a finding, check whether a matching fingerprint
(same PR/issue number + same finding type) is already present in the digest's
"still needs your review" section. If so, bump a "still open as of {timestamp}"
line instead of duplicating. Only a genuinely new finding, or one that
materially changed (e.g. a previously-stale PR just went CI-red), triggers a
fresh notification.

### D. Implement the standalone-run archival that's currently just documented intent

`_shared/auto-decision-log.md` already names the target behavior
("`/tidy` may compact archive entries older than 30 days... planned — not yet
implemented"). Build it for real: fold each closed-out standalone run's
`decisions.md`/`staged/` content into the digest's own history before
archiving the run directory the same way `/wrap-up` already archives completed
*pipeline* runs, so `.claude-tweaks/pipelines/` doesn't accumulate unbounded
`{ts}-tidy-standalone/` directories with no consumer.

## Out of scope (YAGNI)

- **Extending the evidence tier to the weekly full sweep's Steps 2-5.** Those
  findings (spec sizing, cross-spec patterns, design-doc staleness) are almost
  entirely judgment calls even in their own classification tables — nothing
  here proposes auto-mutating them. This pilot stays scoped to `--scope=github`.
- **Bulk authorization tooling.** Covered by
  `2026-07-10-dispatcher-status-lifecycle-design.md` instead — this design is
  about `/tidy`'s own GitHub-hygiene findings (PRs, threads, stale/superseded
  issues), not about authorizing issues for building.

## Key decisions (from conversation)

| Decision | Choice |
|---|---|
| Scope of the evidence tier | `--scope=github`'s findings only, gated behind an explicit opt-in policy flag |
| What counts as "evidence" | A cite-able fact only (commit SHA, date, diff) — never a heuristic guess |
| Judgment-call findings | Always stay staged, unaffected by this design, regardless of aggressiveness |
| Digest medium | GitHub itself for `github-issues` backend mutations; one rolling, in-place-updated artifact for everything else |
| Notification threshold | Only when the digest's "needs review" section is non-empty |
| Dedup key | PR/issue number + finding type, bumped rather than duplicated on repeat firings |
| Archival | Implements the already-documented (but unbuilt) 30-day compaction behavior |

## Testing / verification approach

1. With `tidy-routine-autonomy: evidence-based` set, run `--scope=github`
   against a repo with an unresolved thread whose flagged lines a later commit
   touches — confirm it auto-resolves and logs the commit SHA to
   `decisions.md`, without a batch-approval prompt.
2. Confirm a stale-PR-close finding (explicitly a judgment call in the
   findings table) is still staged even with the flag on.
3. Fire the routine twice in a row against an unchanged repo state — confirm
   the second firing doesn't duplicate a "still needs review" entry, just
   bumps its timestamp, and doesn't fire a second notification.
4. Confirm no `PushNotification` fires on a firing where everything auto-
   resolved cleanly and nothing needs review.
5. Age a standalone run directory past 30 days and confirm it gets folded into
   the digest's history and archived, rather than sitting unarchived
   indefinitely.
