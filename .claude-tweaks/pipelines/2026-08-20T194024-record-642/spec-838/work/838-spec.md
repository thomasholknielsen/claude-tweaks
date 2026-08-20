---
record: 838
origin: human
risk: medium
size: medium
ceremony: standard
grants: [build, merge]
surface: backend
---
# 838: PR-early run lifecycle: pr object missing at wrap-up, no push, no degrade log

Surface: backend

## Current State

Run `2026-08-17T164729-record-81`'s build phase (`pr-first`, `github-issues` backend) left `run-state.json` with no `pr` object at wrap-up time — the branch was never pushed and no draft PR was opened, with no degrade-warning log line in `decisions.md` either. It's unclear whether `build/worktree-setup.md` Step 6 (which is responsible for the initial push/PR-open) actually ran for this record, and whether `pr-early-run-lifecycle.md`'s Step 2 push-failure logging can silently swallow a failure — possibly a transient GitHub GraphQL 503 outage, since the same 503s appeared independently later in this same session's wrap-up `gh` calls and cleared on retry.

## Deliverables

- [ ] Investigate whether `build/worktree-setup.md` Step 6 actually executed for record #81's run, using whatever logs/artifacts survive from that run directory.
- [ ] Investigate whether `pr-early-run-lifecycle.md`'s Step 2 push-failure logging path can silently swallow a failure — specifically, confirm or rule out a transient GitHub GraphQL 503 as the cause, and check whether that path degrades without writing a `decisions.md` warning line.
- [ ] Based on findings, either fix the silent-swallow gap (add a degrade-warning log line, retry-on-503, or both) or document why no fix is needed (e.g., the run predates a since-shipped fix).

## Acceptance Criteria

- A `pr-first` build whose initial push/PR-open step fails (transient or otherwise) always writes a degrade-warning line to `decisions.md`, so a missing `pr` object at wrap-up time is diagnosable from the run's own artifacts rather than requiring manual investigation.
- `npm test` passes; any fix is covered by a test simulating a push/PR-open failure.

## Technical Approach

Start from record #81's own run directory (`.claude-tweaks/pipelines/2026-08-17T164729-record-81/`, if still present) and its `decisions.md`/`run-state.json` to establish what did and didn't run. Cross-reference `build/worktree-setup.md` Step 6 and `pr-early-run-lifecycle.md` Step 2's push-failure handling against that evidence. If a GraphQL 503 is implicated, check whether the push/PR-open call already retries transient GitHub errors elsewhere in this pipeline (e.g. the pattern this same session's wrap-up `gh` calls used, which cleared on retry) and whether that retry logic is missing from this specific call site.

### Key Files

- `plugin/skills/build/worktree-setup.md` — Step 6 (push/draft-PR-open)
- `plugin/skills/_shared/pr-early-run-lifecycle.md` — Step 2 (push-failure logging)
- the surviving artifacts of run `2026-08-17T164729-record-81`, if retained

## Gotchas

- Related to #81 (the run this defect was observed in) and #661 — check both for overlapping scope or a prior partial investigation before starting fresh.
- The GraphQL 503 theory is unconfirmed — this is an investigation task first; the fix shape depends on what the investigation finds, not a predetermined mechanism.

## Original request

PR-early run lifecycle: pr object missing at wrap-up, no push, no degrade log

**Related:** #81, #661

Context: Run 2026-08-17T164729-record-81's build phase (pr-first, github-issues backend) left run-state.json with no `pr` object at wrap-up time — the branch was never pushed and no draft PR was opened, with no degrade-warning log line in decisions.md either.

Scope: Investigate whether build/worktree-setup.md Step 6 actually ran for this record, and whether pr-early-run-lifecycle.md's Step 2 push-failure logging can silently swallow a failure (possibly a transient GitHub GraphQL 503 outage — the same 503s appeared independently later in this same session's wrap-up `gh` calls, then cleared on retry).
