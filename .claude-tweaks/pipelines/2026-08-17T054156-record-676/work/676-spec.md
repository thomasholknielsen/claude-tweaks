---
record: 676
origin: capture
risk: medium
size: low
ceremony: standard
grants: [build]
surface: backend
---
# 676: Flow resume gate: freshness probe before any safe-to-resume ruling on an interrupted run

Surface: backend

## Current State

A run whose owning session ends mid-pipeline is stamped `status: interrupted` in `run-state.json` (session-end hook), and every resume path — `wrap-up/SKILL.md`'s `resume`, `dispatch/SKILL.md`'s "Resuming a parked run", `flow`'s re-entry with an inherited `PIPELINE_RUN_DIR` — treats that stamp as the signal that the run is safe to re-enter. The stamp is a statement about one past session, not about the run's present: in this repo on 2026-08-16, run 2026-08-16T174412 read `interrupted` while a *different* live session was actively committing to its shared worktree (its spec-622 build), and a resume attempt got as far as announcing entry before fresh commit timestamps — noticed incidentally, not gated — reversed the ruling. No mutations landed (all probes were read-only), but nothing structural prevented them.

## Deliverables

- [ ] The resume/re-entry contract (the shared home is likely `_shared/pipeline-run-dir.md` or a new short `_shared/` fragment cited by wrap-up's `resume`, dispatch's parked-run resume, and flow's inherited-run adoption): before any safe-to-resume ruling on a run whose `run-state.json` is not this session's own, require a freshness probe — (a) last-commit age in the run's recorded worktree (`git -C {worktree} log -1 --format=%ct`, compared against a threshold on the order of minutes) and (b) worktree lock-file pid liveness where a lock exists. Recent activity or a live pid blocks resume with a "run appears actively owned" report instead of proceeding.
- [ ] The `interrupted` stamp's meaning is documented as "the stamping session ended" — explicitly *not* "no session owns this run now" — at the stamp's consumer sites.

## Acceptance Criteria

1. Every resume path names the freshness probe as a hard precondition (grep-verifiable citations from the three call sites to the shared fragment); `npm test` passes with any conformance pins updated.
2. A probe against a worktree with a recent commit (or live lock pid) yields the blocking report — verified during the build against a synthetic recent-commit worktree.

## Technical Approach

One shared fragment stating the probe and threshold, cited from the three resume paths per the state-once convention; the probe itself is two read-only git/ps calls already available at every call site.

## Gotchas

- A session restart re-stamps ownership on `record-worktree` — the probe must not block a run's *own* continuing session (identity check against `CLAUDE_CODE_SESSION_ID` before probing).
- Threshold judgment: shared-machine parallel sessions commit in bursts; too tight a threshold deadlocks legitimate resumes of genuinely dead runs. State the threshold and its rationale in the fragment rather than hardcoding it at call sites.
- The claim blob's TTL (72h) is deliberately untouched — this gates *resume of a run identity*, not claim-breaking, which keeps its own staleness rules.

## Original request

Flow resume gate: freshness probe before any safe-to-resume ruling on an interrupted run

**Related:** none

Context: An interrupted six-spec run (2026-08-16T174412) read as resumable from its `interrupted` run-state stamp while a live sibling session was actively committing to its worktree; the misjudgment was reversed by noticing fresh commit timestamps, not by any gate. No mutations landed — every probe was read-only.

Scope: flow/dispatch resume and claim re-entry paths — require a freshness probe (last-commit age in the target worktree plus worktree-lock pid liveness) as a hard precondition before any safe-to-resume ruling.

