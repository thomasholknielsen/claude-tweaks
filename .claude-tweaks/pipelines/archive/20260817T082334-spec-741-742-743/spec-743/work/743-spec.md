---
record: 743
origin: human
risk: medium
size: medium
ceremony: standard
grants: []
fingerprint: feedback-37ee6bba
surface: backend
---
# 743: backlog refine standalone run dir gets no run-state.json — unclassifiable (status: unknown) to resume/reconcile; route closure via close-run (intersects #594)

Related: #594

Surface: backend

## Current State

`skills/backlog/refine-mode.md` Step 5 prescribes writing `decisions.md` to a standalone run dir but prescribes no terminal-state stamp, so every refine run adds a directory that resume/reconcile paths cannot classify — the SessionStart hook lists standalone-era dirs as `status: unknown`. Measured 2026-08-17: 115 live run dirs vs 143 archived; 37 standalone; 12 without `run-state.json`.

Premises verified at shaping time: `bin/hooks.js close-run` (`bin/hooks.js:112`) writes terminal state via `writeRunState`, which **creates `run-state.json` when absent** (`bin/lib/hooks/context.js:220` — merges `readRunState(runDir) || {}` then atomic-renames), so routing closure through `close-run --run <dir>` needs no new direct write and works on a dir that never had a run-state file. `_shared/pipeline-run-dir.md` (line 14) names wrap-up's creation stamp "the one direct `run-state.json` write at creation time in the whole plugin" — that sentence stays true under close-run routing. `_shared/auto-mode-contract.md` (line 105) contracts `/tidy`'s compaction of standalone run dirs older than 30 days; whether that compaction actually functions remains unverified.

## Deliverables

1. Amend `skills/backlog/refine-mode.md` Step 5 to end every refine run by closing its standalone run dir: `node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" close-run --run <absolute-run-dir>` — always with an explicit `--run` pointing at this run's own directory, never the implicit newest-run fallback.
2. Verification that a close-run-stamped standalone dir is classified as terminal by the SessionStart reconciler and `/tidy`'s orphan scan — no longer `status: unknown`.
3. A `node --test` case covering `close-run` on a run dir with no pre-existing `run-state.json` (creates the file, stamps terminal status) — pinning the premise the prose relies on.
4. Scope boundary vs #594, resolving the recorded overlap: this record covers classification/closure only. The `teardown-run` verb and inline-archival mechanics remain #594's territory. If verifying the 30-day standalone compaction (unverified, above) reveals it broken, file that as its own record rather than absorbing it here.

## Acceptance Criteria

- `refine-mode.md` Step 5 carries the close-run call with an explicit absolute `--run`, sequenced after the `decisions.md` write.
- The single-writer sentence in `_shared/pipeline-run-dir.md` remains accurate with no edit needed (close-run owns the write); if the approach shifts to a direct write instead, that sentence is updated in the same change.
- The new test passes on the current tree and fails if `writeRunState`'s create-when-missing behavior is removed.
- After a refine run completes Step 5, its run dir carries `run-state.json` with a terminal status; `npm test` passes.

## Technical Approach

Prose edit to `refine-mode.md` Step 5 plus a test under `tests/bin-lib/` (alongside the existing hooks suites; new `tests/bin-lib/{x}` directories are auto-discovered by `npm test`). No change to `bin/hooks.js` expected — close-run's existing behavior suffices; the change is routing, not machinery.

## Gotchas

- `close-run` prints a "no recorded wrap-up invocation" warning and appends a `close-without-wrapup` event when the dir has no `events.jsonl` — expected for refine standalone runs. Prefer accepting that one line of noise; a standalone-aware quiet path is a machinery change that drifts toward #594's scope.
- The explicit `--run` is load-bearing: the implicit fallback resolves to the newest non-terminal run, which can be a different session's live run (close-run refuses foreign-owned runs only on the implicit path, and closing one would disarm that session's enforcement).
- Hooks carry the never-break-a-session invariant (`docs/hooks.md`) — read it before touching or testing anything under `bin/lib/hooks/`.

## Original request

backlog refine standalone run dir gets no run-state.json — unclassifiable (status: unknown) to resume/reconcile; route closure via close-run (intersects #594)

**Summary:** refine's Step 5 prescribes writing `decisions.md` to a standalone run dir but prescribes no `run-state.json` stamp, so every refine run adds a directory that resume/reconcile paths cannot classify — observed live: the SessionStart hook lists standalone-era dirs as `status: unknown`.

**Archival correction (2026-08-17 review):** the originally-filed claim "nothing ever reaps — accumulate indefinitely" was wrong. `_shared/auto-mode-contract.md` (Cleanup, ~line 105) already contracts `/tidy`'s standalone-auto path to compact standalone run dirs **older than 30 days** into a monthly rollup. The oldest observed live standalone dir (2026-07-19) was 29 days old at evaluation — under the threshold — so the observed accumulation demonstrates nothing about the reaper. Whether that compaction actually functions is **unverified**; the fix should test it rather than assume either way. The run-state.json half of this record stands on its own.

**Kind:** Gap

**Affected component:** `skills/backlog/refine-mode.md` Step 5; `_shared/pipeline-run-dir.md`'s standalone-auto allowlist (classification half)

**Objective:** Recovery quality

**Measurement:** 1 run dir created this session, 0 archived. Repo state at filing: 109 live run dirs under `.claude-tweaks/pipelines/` vs 140 archived; 34 live `-standalone`, 9 without `run-state.json`; oldest live standalone dir dated 2026-07-19. Re-measured 2026-08-17: 115 live / 143 archived / 37 standalone / 12 without `run-state.json` — same shape, still accumulating within the 30-day window.

**Use case:** A standalone label sweep has no later lifecycle step to close it — Step 5 should leave the run dir in a state `/tidy`'s orphan scan and the SessionStart reconciler can classify as terminal (today they report `status: unknown`).

**Constraints (2026-08-17 review):**
1. **run-state.json single-writer discipline:** `_shared/pipeline-run-dir.md` names wrap-up's creation stamp "the one direct `run-state.json` write at creation time in the whole plugin"; `record-worktree` and `close-run` own every later write. Prefer routing closure through `bin/hooks.js close-run` rather than adding a second direct write; if a direct creation-time write is added anyway, that sentence must be updated in the same change.
2. **Intersects #594** (no `teardown-run` verb — close-run only flips state; teardown is 4-5 hand-assembled commands per run): the inline-archival half of this record may be the same work. Resolve the overlap before building either.

**Definition:** Clear

**Plugin version:** 6.87.0

**Related:** #594

---
Filed via /claude-tweaks:feedback (session evaluation, self-referenced repo — routed to this project's own backlog).
<!-- fingerprint: feedback-37ee6bba -->

