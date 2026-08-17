---
record: 690
origin: capture
risk: low
size: low
ceremony: standard
grants: []
surface: backend
---
# 690: flow: multi-spec phase-progress banner stops firing partway through a long run

Surface: backend

## Current State

- `flow/SKILL.md`'s step loop (~line 169) narrates `## Flow: Running {step} ({N}/{total})` from model text. In one 6-hour 5-spec run the banner fired 7 times through the first 2 specs, then never again — the last spec's test/review/wrap-up and the merge/teardown produced no progress surface (25,747 chars of assistant-visible text for the whole session).
- Multi-spec state lives in `manifest.yml` (`flow/multi-spec.md`, `specs[].status: pending|running|complete|failed|not-run`), written per spec — but nothing couples the banner to those writes, and no per-spec completion summary exists at wrap-up exit.
- **Related:** #646 (Next Actions rendering), #642 (console audit surface at unattended).

## Deliverables

1. Couple the banner to the mechanical status write: the `manifest.yml` status transition (`running` per phase, `complete`/`failed`) goes through one command that also prints the banner line — e.g. `bin/hooks.js spec-status --run <parent-dir> --spec <n> --status <s> --phase <p>` (or a `bin/lib/flow/manifest.js` helper) that writes the manifest and echoes `## Flow: Running {phase} ({i}/{total}) — spec #{n}`; `flow/SKILL.md` and `flow/multi-spec.md` cite the command instead of narrating the banner.
2. Per-spec completion summary: at each per-spec `/wrap-up` exit under `MULTISPEC_REVIEW_DEFER=1`, one line — `spec #{n}: {status} — {merged|pr|deferred} ({elapsed})` — emitted by the same command on the `complete`/`failed` transition.
3. Single-spec runs keep the banner (no manifest): state whether the command's `--single` form prints only, or `flow/SKILL.md` keeps narration for the single-spec case.

## Acceptance Criteria

- Test: the helper writes the manifest status and prints the banner text in one call; a phase transition without the banner isn't possible through it.
- `grep -n "Flow: Running" skills/flow/SKILL.md skills/flow/multi-spec.md` cites the command (not a bare narration instruction) for the multi-spec path.
- The wrap-up-exit summary line is documented in `flow/multi-spec.md` and produced by the helper's `complete`/`failed` transition.
- `npm test` green.

## Technical Approach

Small Node helper. `multi-spec.md` currently reads the manifest via `yq` in prose — pick one write path (reuse a yaml lib already in `bin/lib` if present, otherwise a line-level status rewrite guarded by a test).

## Gotchas

- Coupling to a model-issued command still depends on the model issuing it — the gain is that the status write is already mandatory bookkeeping (the console reads it), so the banner rides a step that can't be skipped without breaking the console. Don't claim more than that.
- Keep the banner terse: at compaction/resume time it's the only progress surface.

## Original request

flow: multi-spec phase-progress banner stops firing partway through a long run

**Related:** none

Context: The "## Flow: Running {phase} (n/5) -- spec #{N}" banner fired 7 times across the first 2 of 5 specs in one 6-hour run, then stopped entirely -- the last spec's test/review/wrap-up and the whole merge/teardown ran with no progress surface at all (only 25,747 chars of assistant-visible text across the whole session).

Scope: Drive the phase banner off the mechanical `manifest.yml` status write rather than model narration, so it can't silently lapse across a compaction or resume; add a one-line spec-completion summary at each per-spec wrap-up exit.

## Build note

Judgment calls made during build: the wrap-up-exit outcome is always the literal word `deferred` (structural to the shared-worktree architecture, which only finishes the branch once at run end); no `--single` CLI form added since single-spec has no manifest to couple to (SKILL.md keeps free-text narration for that case instead, documented inline).
