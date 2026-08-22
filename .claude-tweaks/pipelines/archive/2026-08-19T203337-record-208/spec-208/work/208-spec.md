---
record: 208
origin: human
risk: medium
size: medium
ceremony: standard
grants: [build]
surface: infra
---
# 208: Archived pipeline runs get resurrected by later hook writes, so archive/ is not authoritative

Surface: infra

## Current State

- Archiving a pipeline run moves it to `.claude-tweaks/pipelines/archive/{run-id}/`, but nothing in the hook write path checks for an existing archived copy before creating a live directory of the same run-id under `.claude-tweaks/pipelines/`. The writer is `bin/lib/hooks/run-dir-resolve.js`'s `resolve()` — its `newestMatch()` lookup and its `fs.mkdirSync(dir, { recursive: true })` call (~line 157) have no knowledge of `archive/` at all.
- The SessionStart unfinished-run check reads live run dirs via `bin/lib/hooks/context.js`'s `iterRunDirsWithState`/`isUnadoptedMint`, consumed by `bin/lib/hooks/session-start.js`. It has no exclusion for a run-id that already exists under `archive/`, so a resurrected directory (no `status`, or a `lastEvent` with no `status`) reports as an unfinished run.
- Seven run-ids currently exist in both `.claude-tweaks/pipelines/{run-id}/` and `.claude-tweaks/pipelines/archive/{run-id}/`, with neither copy a superset of the other: `2026-07-19T103247-spec-38`, `2026-07-15T090502-spec-18`, `2026-07-15T094113-record-19`, `2026-07-16T215020-record-36`, `2026-07-19T084215-spec-32`, `2026-07-23T080247-review-lens-enhancements`, `2026-07-25T065327-spec-54-55-56-57-58`.
- Worked example — `2026-07-19T103247-spec-38`: the archived copy's last event was a `10:50:08` commit (contents: `config.yml`, `decisions.md`, `events.jsonl`, `work/`); the resurrected active copy's last event was a `10:53:30` pre-compact, with `run-state.json` updated as late as `11:13:07` (contents: `events.jsonl`, `run-state.json` only — no `config.yml`, no `decisions.md`, because it was never a real run dir, just breadcrumbs written into a resurrected shell). `2026-07-15T094113-record-19` splits the opposite way — the archive copy has `work/`, the active copy has the events — so neither location is reliably the complete one across the whole set.
- This matters beyond SessionStart noise: a `close-run` issued against the archived path leaves the resurrected active shell untouched, so closing a run does not actually settle it.

## Deliverables

- [ ] Pick and implement the invariant: archived run-ids are never written to again — `resolve()` in `bin/lib/hooks/run-dir-resolve.js` checks for `archive/{run-id}` before creating or reusing a live `{run-id}` directory. (Simpler than reconciling two copies on every archive, and matches what "archive" implies.)
- [ ] Update the SessionStart unfinished-run check (`bin/lib/hooks/context.js`'s run-dir iteration, consumed by `bin/lib/hooks/session-start.js`) to skip any run-id that already exists under `archive/`, regardless of that resurrected copy's `run-state.json` contents.
- [ ] Reconcile the seven existing split run-ids listed in Current State: for each, merge the two copies into the one under `archive/` (union the files each side is missing — e.g. `2026-07-19T103247-spec-38` needs the active copy's later `events.jsonl`/`run-state.json` folded in; `2026-07-15T094113-record-19` needs the archive copy's `work/` folded in), then remove the resurrected active-side directory.

## Acceptance Criteria

1. After archiving a run, a subsequent hook write for that run-id does not create a directory under `.claude-tweaks/pipelines/` — only `archive/{run-id}/` exists afterward.
2. A `node --test` case drives the actual failure end-to-end: archive a run, fire a hook event naming it, assert no active directory reappears under `.claude-tweaks/pipelines/`. Verify the test discriminates — revert the `resolve()` guard and confirm the test fails before considering the fix done (a test that passes against both the fixed and unfixed code is exactly how this shipped the first time).
3. The SessionStart unfinished-run check reports zero findings for any of the seven run-ids named in Current State, and for any other archived run-id, regardless of that run-id's active-side `run-state.json` contents.
4. Failure direction is explicit and tested: if `archive/` cannot be read (e.g. permission error), both the writer guard and the SessionStart check fall back to today's behavior — the writer still creates the directory, and the SessionStart check still reports the run — rather than silently suppressing a genuinely unfinished run.
5. All seven listed run-ids exist in exactly one location (`archive/{run-id}/`) after reconciliation, each containing the union of files present in either pre-reconciliation copy, and `.claude-tweaks/pipelines/{run-id}/` (active side) no longer exists for any of them.

## Technical Approach

Recommended invariant (per Deliverable 1): archived is terminal. `resolve()` in `bin/lib/hooks/run-dir-resolve.js` already computes the candidate directory name before its `newestMatch()` lookup and its `fs.mkdirSync` calls; add a check for `{pipelinesRoot}/archive/{run-id}` immediately before the mkdir at ~line 157 and short-circuit (a `fail()`-style result, or route the caller to the archived copy directly) rather than resolving the two-copy case at read time on every SessionStart. This keeps the fix at the single writer chokepoint instead of the several dispersed readers (`context.js`, `session-start.js`, `close-run`, and any CLI verb that resolves `$PIPELINE_RUN_DIR`).

For the SessionStart check specifically, filter `iterRunDirsWithState`'s candidate list (or its consumer in `session-start.js`) against the same `archive/{run-id}` existence check, applied before the `isUnadoptedMint`/`status` inspection — an archived run-id should never reach that inspection at all, since its active-side `run-state.json` contents (if any exist) are exactly the untrustworthy resurrected data described in Current State.

### Key Files

- `bin/lib/hooks/run-dir-resolve.js` — the writer; add the archive-existence guard ahead of the `fs.mkdirSync` calls (~lines 146, 157).
- `bin/lib/hooks/context.js` — `iterRunDirsWithState`/`isUnadoptedMint`; add the archive-existence filter to the candidate iteration.
- `bin/lib/hooks/session-start.js` — consumer of `context.js`'s iteration; verify the filtered list flows through without a second, redundant check.
- `docs/hooks.md` — run-dir resolution/ownership contract; note the archived-is-terminal invariant here once implemented, since this file is the canonical reference for the hooks contract.
- `.claude-tweaks/pipelines/{run-id}/` and `.claude-tweaks/pipelines/archive/{run-id}/` for the seven listed run-ids — the reconciliation targets.

## Gotchas

- The nag is currently quiet: a prior worktree/branch cleanup pass moved all 22 active runs to `status: clean`, so the SessionStart check has nothing to report right now. That is not evidence the resurrection bug is fixed — the writer-side gap is untouched, and the next hook write against any of the seven run-ids (or a fresh archive/resurrect cycle on any run) will reproduce it.
- `close-run` issued against an archived path currently leaves a resurrected active-side directory untouched — confirm the writer-side fix (Deliverable 1) also closes this specific gap, not just the SessionStart-nag symptom.
- Reconciliation (Deliverable 3) is a manual/scripted merge of two directory trees per run-id, not a bulk delete in either direction — the worked example shows the two copies split in *opposite* directions across different run-ids (one has the later events, the other has `work/`), so a single "prefer archive" or "prefer active" rule loses data for at least one of the seven.

## Original request

Archived pipeline runs get resurrected by later hook writes, so archive/ is not authoritative

Surface: bin

## Current State

Archiving a pipeline run moves it to `.claude-tweaks/pipelines/archive/{run-id}/`, but nothing stops the hooks from re-creating a directory of the same name under `.claude-tweaks/pipelines/` afterwards. Seven of this repo's run dirs currently exist in **both** places, and neither copy is a superset of the other.

Worked example — `2026-07-19T103247-spec-38`:

| | last event | contents |
|---|---|---|
| `archive/…` | `10:50:08` commit | `config.yml`, `decisions.md`, `events.jsonl`, `work/` |
| active `…` | `10:53:30` pre-compact | `events.jsonl`, `run-state.json` (updated `11:13:07`) |

So the run was archived around 10:50 and hooks kept appending to a resurrected directory for another 23 minutes. The active copy has no `config.yml` and no `decisions.md` because it was never a real run dir — it is breadcrumbs written into a shell.

The other six with the same split: `2026-07-15T090502-spec-18`, `2026-07-15T094113-record-19`, `2026-07-16T215020-record-36`, `2026-07-19T084215-spec-32`, `2026-07-23T080247-review-lens-enhancements`, `2026-07-25T065327-spec-54-55-56-57-58`.

## Why it matters

1. **`archive/` is not authoritative.** A reader who goes to the archived copy for a run's history gets a truncated event log, with the tail sitting in a directory that looks like a live run. `2026-07-15T094113-record-19` splits the other way — the archive has `work/` and the active copy has the events — so neither location is reliably the complete one.

2. **It produces the SessionStart nag directly.** Resurrected dirs have no `status` (or a `lastEvent` with no status), so the unfinished-run check reports them. This session opened with exactly that message naming two runs, both long finished. Noise that recurs every session trains people to ignore a check that exists to catch real interrupted runs.

3. It also means a `close-run` on the archived path leaves the active shell untouched, so closing a run does not actually settle it.

## Deliverables

- [ ] Decide the intended invariant: either archived run-ids are never written to again (the writer checks `archive/{id}` before creating `{id}`), or archival is not terminal and the two copies must be reconciled on archive. The first is simpler and matches what "archive" implies.
- [ ] Make the SessionStart unfinished-run check ignore a run-id that already exists under `archive/`, so a resurrection cannot produce the nag even if one happens.
- [ ] Reconcile the seven existing split runs — merge each pair into the archived copy — or decide explicitly that historical residue is left as-is and only new runs are protected.

## Acceptance Criteria

1. After archiving a run, a subsequent hook write for that run-id does not create a directory under `.claude-tweaks/pipelines/`.
2. A test drives the actual failure: archive a run, fire a hook event naming it, assert no active directory reappears. Verify the test discriminates by reverting the fix and confirming it fails — a test that passes against both implementations is how this shipped.
3. The SessionStart check is silent for archived run-ids regardless of their `run-state.json` contents.
4. Failure direction stated: if `archive/` cannot be read, the check should behave as it does today (report the run) rather than silently suppressing a genuinely unfinished one.

## Notes

Found during a worktree/branch cleanup pass, not by a health sweep. All 22 active runs were moved to `clean` during that pass, so the nag is currently quiet — but the resurrection mechanism is untouched and will re-create the condition.

