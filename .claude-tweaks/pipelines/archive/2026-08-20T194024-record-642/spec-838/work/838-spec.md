---
record: 838
origin: human
risk: low
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

## Investigation findings (this build)

- The archived run directory `.claude-tweaks/pipelines/archive/2026-08-17T164729-record-81/` still exists (git-tracked), but only carries the committed `spec-{N}/work/{N}-spec.md` files (per `.gitignore`'s un-ignore rules for `work/`) — `decisions.md`, `run-state.json`, and `manifest.yml` were never committed (gitignored by design) and are gone from this archived copy, so the specific failure signature for that historical run (transient 503 vs. Step 6 never running vs. an agent skipping the log instruction) cannot be forensically recovered from repo history alone.
- `build/worktree-setup.md` Step 6 (which calls `pr-early-run-lifecycle.md`) was added in commit `806f46af` (2026-08-14T15:40:26+02:00) — well before record #81's run (2026-08-17T16:47:29+02:00). `pr-early-run-lifecycle.md`'s Step 2 push-failure logging text existed at that same commit and was unchanged through the run. So this is not a "run predates a since-shipped fix" case — the logging instruction already existed and, per the evidence, was not followed (or the failure occurred at a point this run's decisions.md never captured).
- Since `decisions.md`/`run-state.json` writes for a prose-driven step depend on an executing agent actually following the instruction (no code enforces it), the durable fix is to (a) reduce the odds a transient failure is ever silently swallowed by making the degrade-warning log line explicitly mandatory rather than a soft "log to decisions.md" aside, and (b) reduce the odds a transient 5xx/503 reaches the failure path at all via one bounded, fast retry (15s) — distinct from `_shared/github-rate-limit.md`'s 45-90s rate-limit-specific backoff, since a 503 outage is a different signature that self-heals faster and isn't covered by that file's recognition taxonomy.

Defer-reason: n/a — evidence for the historical run is unrecoverable, but the systemic gap (prose-only logging that can be silently skipped) is real and fixed in this build regardless of which exact failure mode occurred for record #81.
