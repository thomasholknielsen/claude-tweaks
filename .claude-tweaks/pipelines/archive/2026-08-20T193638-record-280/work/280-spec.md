---
record: 280
origin: human
risk: medium
size: medium
ceremony: standard
grants: [build]
fingerprint: wrapup-cabc876d
surface: infra
---
# 280: pipeline-run-dir resolution: no fallback for a worktree-local run dir when harness isolation blocks main-checkout anchoring

Surface: infra

## Current State

`_shared/pipeline-run-dir.md`'s Resolution order (steps 1-5) and its Anchoring section
assume a run directory always lives under the **main checkout's** `.claude-tweaks/pipelines/`
— `RUN_ROOT` is resolved via `git rev-parse --git-common-dir` and every path is built from
there. `record-worktree` already supports an explicit `--run <dir>` argument (parity with
`close-run`, `bin/hooks.js:52-82`) precisely so callers can pin the target run rather than
relying on `resolveRunDir`'s "newest non-terminal run" fallback — `skills/build/worktree-setup.md:69`
already instructs passing it.

Neither mechanism has a path for a run directory that lives **inside a worktree** instead of
the main checkout. This is normally impossible by construction (anchoring is enforced), but it
happened live during flow run `2026-08-09T140101-spec-262`: harness-level sandboxing blocked
*all* main-checkout writes for that session (not a git-level restriction — the harness itself),
so the run directory was created worktree-locally as the only available option. When the
`record-worktree --run "$RUN_DIR"` call for that run then ran, standard `$RUN_DIR` resolution
(anchored to `$RUN_ROOT` = main checkout per the Bash snippet in `pipeline-run-dir.md`) could not
find the worktree-local directory, so the call had nothing valid to pass. It fell through to
`resolveRunDir`'s fallback, which found and stamped an unrelated, stale main-checkout run
(`2026-08-09T054437-dispatch-standalone`) — flipping that foreign run's `worktree`/`sessionId`/
`status` and making E1 enforcement briefly treat an unrelated run as owning the worktree. This
was caught and repaired live (`close-run` on the latched run, verified complete beforehand) —
see `docs/incident-log.md`'s existing IL-96 entry for the general "fallback that guesses also
writes" class this instance belongs to.

An earlier draft of this finding claimed `record-worktree` had no way to name its intended run
at all — that premise was checked against the live code and found false (the `--run` flag
already ships and is already documented as the required call form). The real, narrower gap is
resolution's lack of a worktree-local fallback for this one harness-isolation edge case.

## Deliverables

- Add a resolution step to `_shared/pipeline-run-dir.md`'s Resolution order (or an explicit
  documented fallback in the Anchoring section) covering: main-checkout anchoring failed
  because the write was refused, not merely absent — look for a run directory under the
  *current* checkout's own `.claude-tweaks/pipelines/` before falling through further.
- Decide how to distinguish "harness blocked the main-checkout write" from "no run exists yet"
  reliably enough to gate the fallback on — the two must not be conflated (an ordinary run with
  no worktree-local dir at all should never spuriously match a stale artifact).
- Mirror the change in `bin/lib/hooks/context.js`'s `resolveRunDir`/`resolveRun` if the fallback
  needs to be visible to the hook-side resolution path too (that file explicitly documents it
  answers "a different question with different rules" than the skill-side algorithm — confirm
  whether this gap applies there as well before changing it).
- Add or extend a test in `tests/hooks-*.test.js` (or the equivalent `pipeline-run-dir`
  resolution coverage) exercising: main-checkout write blocked → worktree-local run dir created
  → `record-worktree --run` resolves it correctly without touching an unrelated run.

## Acceptance Criteria

- [ ] A session whose harness blocks main-checkout writes for the whole session can still
      have its `record-worktree --run "$RUN_DIR"` call resolve its own worktree-local run dir,
      without falling through to `resolveRunDir`'s stale-run fallback.
- [ ] The new fallback path does not fire for an ordinary main-checkout-anchored run — it is
      scoped to the harness-isolation case only.
- [ ] `_shared/pipeline-run-dir.md`'s Resolution order and Anchoring sections describe the new
      step accurately; every consumer citing the Resolution order by step number is checked for
      staleness.
- [ ] Test coverage exercises the worktree-local fallback explicitly.

## Technical Approach

- Extend `_shared/pipeline-run-dir.md`'s Resolution order with an explicit new step (or a
  documented fallback in its Anchoring section) covering the "write refused, not merely absent"
  case, then sweep every skill/doc that cites the Resolution order by step number for staleness.
- The gating signal is the hard part: it must distinguish "harness blocked the main-checkout
  write" from "no run exists yet" without an unconditional worktree-local scan, which would risk
  shadowing a legitimate main-checkout run whenever a stray worktree-local directory happens to
  exist for unrelated reasons.
- Read `bin/lib/hooks/context.js`'s `resolveRunDir`/`resolveRun` and its own documentation of
  answering "a different question with different rules" before deciding whether the same
  fallback needs mirroring there — this is an open question, not a given, per the Deliverables.
- Add or extend a `tests/hooks-*.test.js` case (or the equivalent `pipeline-run-dir` resolution
  suite) that exercises: main-checkout write blocked → worktree-local run dir created →
  `record-worktree --run` resolves the worktree-local run and does not touch an unrelated,
  stale main-checkout run.

## Gotchas

- This is the same failure class as IL-96 ("a wrong guess that writes state makes itself
  permanent, and the write is what keeps it winning") — any fallback that can guess wrong and
  then write (e.g. stamping a run's `worktree`/`sessionId`/`status`) needs to fail closed, not
  fail open, when it can't reliably tell "blocked" apart from "absent."
- The originating incident happened live in flow run `2026-08-09T140101-spec-262` and was caught
  and repaired at the time (`close-run` on the latched run, verified complete first); `IL-96` in
  `docs/incident-log.md` documents the general class.
- `bin/lib/hooks/context.js` is explicitly documented as answering a different resolution
  question than the skill-side algorithm — don't assume the two need identical fallback logic;
  confirm before mirroring the change there.
- Every consumer citing `pipeline-run-dir.md`'s Resolution order by step number needs re-checking
  once a new step is inserted, per the Acceptance Criteria — a numeric cross-reference sweep, not
  just an update to the cited file itself.

## Original request

pipeline-run-dir resolution: no fallback for a worktree-local run dir when harness isolation blocks main-checkout anchoring

## Current State

`_shared/pipeline-run-dir.md`'s Resolution order (steps 1-5) and its Anchoring section
assume a run directory always lives under the **main checkout's** `.claude-tweaks/pipelines/`
— `RUN_ROOT` is resolved via `git rev-parse --git-common-dir` and every path is built from
there. `record-worktree` already supports an explicit `--run <dir>` argument (parity with
`close-run`, `bin/hooks.js:52-82`) precisely so callers can pin the target run rather than
relying on `resolveRunDir`'s "newest non-terminal run" fallback — `skills/build/worktree-setup.md:69`
already instructs passing it.

Neither mechanism has a path for a run directory that lives **inside a worktree** instead of
the main checkout. This is normally impossible by construction (anchoring is enforced), but it
happened live during flow run `2026-08-09T140101-spec-262`: harness-level sandboxing blocked
*all* main-checkout writes for that session (not a git-level restriction — the harness itself),
so the run directory was created worktree-locally as the only available option. When the
`record-worktree --run "$RUN_DIR"` call for that run then ran, standard `$RUN_DIR` resolution
(anchored to `$RUN_ROOT` = main checkout per the Bash snippet in `pipeline-run-dir.md`) could not
find the worktree-local directory, so the call had nothing valid to pass. It fell through to
`resolveRunDir`'s fallback, which found and stamped an unrelated, stale main-checkout run
(`2026-08-09T054437-dispatch-standalone`) — flipping that foreign run's `worktree`/`sessionId`/
`status` and making E1 enforcement briefly treat an unrelated run as owning the worktree. This
was caught and repaired live (`close-run` on the latched run, verified complete beforehand) —
see `docs/incident-log.md`'s existing IL-96 entry for the general "fallback that guesses also
writes" class this instance belongs to.

An earlier draft of this finding claimed `record-worktree` had no way to name its intended run
at all — that premise was checked against the live code and found false (the `--run` flag
already ships and is already documented as the required call form). The real, narrower gap is
resolution's lack of a worktree-local fallback for this one harness-isolation edge case.

## Deliverables

- Add a resolution step to `_shared/pipeline-run-dir.md`'s Resolution order (or an explicit
  documented fallback in the Anchoring section) covering: main-checkout anchoring failed
  because the write was refused, not merely absent — look for a run directory under the
  *current* checkout's own `.claude-tweaks/pipelines/` before falling through further.
- Decide how to distinguish "harness blocked the main-checkout write" from "no run exists yet"
  reliably enough to gate the fallback on — the two must not be conflated (an ordinary run with
  no worktree-local dir at all should never spuriously match a stale artifact).
- Mirror the change in `bin/lib/hooks/context.js`'s `resolveRunDir`/`resolveRun` if the fallback
  needs to be visible to the hook-side resolution path too (that file explicitly documents it
  answers "a different question with different rules" than the skill-side algorithm — confirm
  whether this gap applies there as well before changing it).
- Add or extend a test in `tests/hooks-*.test.js` (or the equivalent `pipeline-run-dir`
  resolution coverage) exercising: main-checkout write blocked → worktree-local run dir created
  → `record-worktree --run` resolves it correctly without touching an unrelated run.

## Acceptance Criteria

- [ ] A session whose harness blocks main-checkout writes for the whole session can still
      have its `record-worktree --run "$RUN_DIR"` call resolve its own worktree-local run dir,
      without falling through to `resolveRunDir`'s stale-run fallback.
- [ ] The new fallback path does not fire for an ordinary main-checkout-anchored run — it is
      scoped to the harness-isolation case only.
- [ ] `_shared/pipeline-run-dir.md`'s Resolution order and Anchoring sections describe the new
      step accurately; every consumer citing the Resolution order by step number is checked for
      staleness.
- [ ] Test coverage exercises the worktree-local fallback explicitly.

**Origin:** wrap-up finding from #262 (flow run `2026-08-09T140101-spec-262`), ledger item 2.
Originally staged as a `/claude-tweaks:feedback` upstream candidate; the feedback skill's own
self-reference check correctly stopped that filing (this repo IS claude-tweaks), and the
premise was corrected before filing here — see `_shared/learning-routing.md`'s self-reference
collapse (D5 → re-run classifier from rule 4) and IL-71 (verify a fix's premise against live
files before filing or implementing it).

---
Filed via /claude-tweaks:wrap-up (side-effect record, ledger item 2).
<!-- work-fingerprint: wrapup-cabc876d -->

