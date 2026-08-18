---
record: 410
origin: human
risk: medium
size: medium
ceremony: standard
grants: []
blocked-by: [409]
surface: backend
---
# 410: PR as run surface: verdict comments, failure tombstones, PR-state reads in help and tidy

Surface: backend

## Overview

Make the draft PR the run's public surface: gate verdicts post as PR comments (review's spec-compliance verdict; the Verification Brief moves home from the issue to the PR, with the issue keeping a one-line pointer); a failed run's settle step comments the failure (attempt number, classification, resume command) on the PR and closes it — a visible tombstone with a resume command instead of an invisible dead worktree; and `/claude-tweaks:help` + `/claude-tweaks:tidy` read run state from PR state first, run dirs second. This is what kills the found-only-by-manual-excavation failure class: opening GitHub and looking at draft PRs answers "what's in flight and what died."

**Complexity:** Medium
**Estimated tasks:** 7

## Non-Goals

- No merge behavior — the merge-path sub-issue.
- No console rendering — the console-on-PR sub-issue.
- Run dirs stay: machine-local scratch (`decisions.md`, `staged/`, events) is unchanged; only their monopoly on truth ends.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| pr-early-lifecycle | PR-early run lifecycle | ready |

## Current State

- `skills/wrap-up/verification-brief.md` — composes and posts the brief as an issue comment today; Routing section owns parent-gate vs direct paths.
- `skills/dispatch/settle-and-merge.md` Steps 4-5 — failure comment composition (attempt counting via `bin/lib/issues/retry.js`, trust-negative-evidence marker) posted to the issue today.
- `skills/review/` — spec-compliance verdict rendered in-session today, persisted only in run-dir state.
- `skills/help/status-scan.md` Stage 4.5 + `skills/tidy/scan-procedures.md` — current PR/run scans; `bin/lib/hooks/session-start.js` prints "unfinished pipeline run(s)" from run dirs alone.
- `run-state.json` carries `pr: {number, url}` after the PR-early sub-issue.

## Deliverables

- [x] Review verdict comment: on review-gate completion (pr-first runs), post one PR comment with the verdict and the top findings by severity (max 5, reusing review's own findings-table shape). One comment per kind per run: a re-run edits the existing marker comment in place, never appends a duplicate — the `<!-- run-comment: {kind} -->` marker is the dedup key.
- [x] The pr-first gate every posting site checks is one condition: `run-state.json` carries a `pr` object. Absent (local-merge run, degraded run) ⇒ today's issue-comment behavior. A present `pr` with a failing `gh` call is a separate, logged, retryable failure — never conflated with "no PR".
- [x] Verification Brief: post to the PR instead of the issue on pr-first runs; the issue gets one pointer comment linking the PR brief (acceptance labeling on the issue is unchanged).
- [x] Failure tombstone: settle's failure path (content unchanged from settle-and-merge.md steps 4-5 — attempt number, classification marker, reason) posts to the PR and closes it, leaving branch and worktree in place; retry reopens the PR (`gh pr reopen`) or recreates it when reopen is impossible (branch force-pushed, PR merged) — a recreated PR reuses the original title/body template, its new number/url is written back via `hooks.js record-pr`, and the record issue's pointer comment is updated to the new PR.
- [x] Trust-marker placement (decided, not open): the failure comment posts to the PR, AND the single line-anchored `<!-- trust-negative-evidence: ... -->` marker line is ALSO posted as a one-line comment on the record issue — `bin/lib/issues/trust.js` reads record comments and is not modified. Stated in settle's procedure text.
- [x] `/help` Stage 4.5: enumerate in-flight runs from open draft PRs, falling back to run dirs when no PR exists; stale-run reporting distinguishes "visible on PR" from "local-only".
- [x] `/tidy`: unsettled-state scan rows read PR state (closed-tombstone vs open-stale draft) rather than only run-dir status. Tombstone detection keys on closed+unmerged AND the `failure`-kind marker comment — a manually-closed draft without the marker reads as "abandoned", not "tombstoned"; "tombstoned" is a derived display state computed at read time, never a new run-state.json status value.
- [x] Session-start "unfinished pipeline run(s)" lines include the run's PR URL when run-state.json carries one.

## Acceptance Criteria

1. A pr-first run reaching wrap-up has ≥2 PR comments (review verdict, brief) verifiable via `gh pr view --comments`, and the record issue carries the pointer comment instead of the full brief.
2. A run failed at the test gate leaves a closed draft PR whose last comment contains the attempt number and resume command; the worktree still exists.
3. `/help`'s dashboard lists that failed run with its PR URL and "tombstoned" state.
4. The trust-negative-evidence marker (`<!-- trust-negative-evidence: ... -->`) still lands somewhere `bin/lib/issues/trust.js` reads — see Gotchas.
5. `npm test` passes.

## Technical Approach

All comment posts are compose-then-write-once, best-effort with logged degradation to today's issue-comment behavior when the PR is missing (a local-only degraded run). The failure path stays inside whichever Task call hits the gate (it has the PR number from run-state.json; `gh pr` needs no main-checkout access).

### Data / API Surface

- PR comment kinds: `verdict` (review), `brief` (wrap-up), `failure` (settle) — each opens with a stable HTML marker (`<!-- run-comment: verdict -->`) so scans and dedup can key on kind.

### Key Files

- `skills/wrap-up/verification-brief.md` — PR-vs-issue routing.
- `skills/dispatch/settle-and-merge.md` — failure-path comment target + close/reopen.
- `skills/review/SKILL.md` (or its step file) — verdict comment.
- `skills/help/status-scan.md`, `skills/tidy/scan-procedures.md`, `bin/lib/hooks/session-start.js` — PR-state reads.

## Gotchas

- `bin/lib/issues/trust.js` grades trust evidence from the **record's** comments — the trust-marker deliverable above posts the marker line to the issue precisely so trust.js stays unmodified; don't drop that half.
- Degradation logs write to the run's decisions.md (the auto-decision log), not events.jsonl.
- New comment-posting paths and PR-state reads get their own tests — in scope here, not deferred.
- A closed-unmerged PR is a tombstone: the reconciler must NOT reap its worktree or archive its run dir (that rule ships in the reconciler; this sub-issue must not contradict it in prose).
- `gh pr reopen` fails if the branch was deleted or the PR was merged — the retry path needs the recreate fallback, not an assumption.
- Comment posts from cwd-pinned Task subagents are fine (`gh` infers repo from remote) — but never chain them into compound Bash commands in worktree sessions.
- The absence of a `by:*` label convention on PRs means scans key on branch naming + run-state join, not labels — keep it that way (labels on PRs are a new convention this design deliberately avoids).
