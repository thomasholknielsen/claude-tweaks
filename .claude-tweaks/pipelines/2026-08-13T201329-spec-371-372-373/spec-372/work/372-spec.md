---
record: 372
origin: human
risk: low
size: medium
ceremony: standard
grants: []
fingerprint: skill-invocation-ledger:run-integrity-detection-flag-shipped-but-never-closed-pipeli
blocked-by: [371]
surface: infra
---
# 372: Run-integrity detection: flag shipped-but-never-closed pipeline runs at SessionStart

Surface: infra

## Overview

Add run-integrity detection: distinguish a pipeline run that is genuinely in progress from one whose work already shipped while its bookkeeping stayed open (#364's observed symptom — PR merged, worktree still registered, `run-state.json` stuck at `"active"`, discovered only by manual inspection). A new `checkRunIntegrity(runDir)` cross-references the run's recorded state and event log against git ground truth, and the existing SessionStart unfinished-runs scan surfaces the verdict — no new command, no new UI surface, so there is no second place for this reporting to drift.

**Complexity:** Medium
**Estimated tasks:** 6

## Non-Goals

- No mid-chain stage-skip detection ("review was skipped between build and wrap-up") — that requires modeling each run's *expected* stage chain (configured stages, conditional polish, review-effort variation), a speculative contract with no incident behind it. Two states only; the third returns when a real incident motivates it.
- No auto-repair/reconciliation — detection surfaces the drift; a human or the next `/claude-tweaks:wrap-up` invocation resolves it. Auto-closing would treat the symptom (dirty bookkeeping) rather than the cause (a bypassed procedure).
- No standalone doctor command.
- Not a dispatch-state sweep — stale `bot:in-progress` labels, unreviewed PRs, and live claims are #314's territory (a /tidy-shaped sweep over tracker state); this unit reads only pipeline run dirs and git. Related #314.
- **Known coverage boundaries, by design (not bugs to fix here):** (a) runs that never provisioned a worktree — including every run using the `.claude-tweaks/pipelines/` `worktree.always` exemption, and standalone runs `createdBy: "wrap-up-standalone"` — have no derivable branch and stay permanently `in-progress`-classified; per CLAUDE.md `[IL-96]` such runs are a legitimate population, and this blind spot is also the invariant #371's dropped-event correctness rests on. (b) Runs predating #371's ledger can never contain a `skill_invoked` event even though wrap-up may genuinely have run — the pre-ledger precondition in the verdict rule below excludes them rather than misdiagnosing them. (c) A wrap-up that was *entered* but crashed before closing reads as `in-progress` forever — the check is presence-only; pairing it with a completion signal is future work if an incident motivates it. (d) No fetch is performed — the check runs against local refs only (SessionStart must be fast and offline-safe), so detection can lag until the local integration ref advances.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #371 | Skill-invocation ledger: log Skill-tool calls to the run events.jsonl | ready |

Blocked by #371: the verdict rule reads its `skill_invoked` events. The event shape this unit matches against is pinned in #371's **Data / API Surface** section (`{"type": "skill_invoked", "skill": "claude-tweaks:wrap-up", "ts": ...}`) — re-verify that literal shape against #371's landed implementation before writing the read-side match, not against this record's copy.

## Current State

- SessionStart scan: `bin/lib/hooks/session-start.js` — already enumerates non-terminal runs under `.claude-tweaks/pipelines/` and emits the "unfinished pipeline run(s) detected" additionalContext block, today with `status: unknown`-grade detail only. Also fires `worktree-reap.js` — see Gotchas for the required ordering.
- Run state: `.claude-tweaks/pipelines/{run-id}/run-state.json` — `status: active | interrupted | clean`, owning session id, and a `worktree` field that is a **resolved absolute path string only** (`record-worktree` writes `path.resolve(worktreeArg)` — there is no stored branch name anywhere in run-state.json). The branch must be *derived* from that path at check time. `events.jsonl` — typed events including (after #371) `skill_invoked`.
- Branch-derivation precedent: `bin/lib/hooks/worktree-reap.js` and `sibling-sessions.js` both derive branches by parsing `git worktree list --porcelain` and matching on path — follow that pattern (or `git -C <path> branch --show-current` when the worktree still exists).
- Ground-truth precedent: the `[IL-45]` content-identity check — merge-detection by ancestry/content, not merge-commit grepping.
- Git plumbing available to hooks: `bin/lib/hooks/git-exec.js` / `git-command.js` — reuse these for any git calls; do not shell out ad hoc.
- Integration-branch resolution: `skills/_shared/integration-branch.md`'s ladder, which has a per-consumer fallback table with **no row yet for this module** — the SessionStart worktree reaper's existing row (rank 3 and rank 5's GitHub-default half only; current-branch half excluded) is the closest hook-side precedent.
- Tests: `node --test tests/`; hook-module suites live in `tests/hooks-*.test.js`.

## Deliverables

- [ ] `bin/lib/hooks/run-integrity.js` exporting `checkRunIntegrity(runDir)` returning `{ state: 'in-progress' | 'shipped-unclosed', evidence: {...} }` where `evidence` names what was checked (derived branch, merge evidence kind, wrap-up event presence) so the SessionStart message can cite it.
- [ ] Branch derivation: from `run-state.json`'s recorded worktree **path**, via `git worktree list --porcelain` matched on path (the `worktree-reap.js` pattern) or `git -C <path> branch --show-current`. No path recorded, worktree gone, or detached HEAD → no derivable branch → fail-open.
- [ ] Merged-evidence check, in precedence order: (1) ancestry — `git merge-base --is-ancestor <branch> <integration>`; (2) when ancestry is false, patch-equivalence for squash-merge repos — `git cherry <integration> <branch>` reporting no unapplied (`+`) commits. **Branch deletion alone is never merged-evidence** — a branch is also deleted when a PR is closed unmerged, and a false `shipped-unclosed` is exactly what fail-open exists to prevent; a deleted branch with no other signal → `in-progress`. Integration branch resolved per `skills/_shared/integration-branch.md`; local refs only, no fetch.
- [ ] Verdict rule — `shipped-unclosed` requires ALL of: status `active` or `interrupted` (the non-terminal set, spelled out); merged-evidence per the precedence above; `events.jsonl` contains **at least one `skill_invoked` event of any kind** (the pre-ledger precondition: a log the ledger never wrote to proves nothing) **and none for `claude-tweaks:wrap-up`**. Anything less is `in-progress`.
- [ ] `session-start.js` integration: **only `shipped-unclosed` runs get new message text** — the line says the work appears shipped and names both remediations (`/claude-tweaks:wrap-up` to close out properly, or `node .../bin/hooks.js close-run --run <dir>` for bookkeeping-only closure). A genuinely in-progress run's line stays byte-identical to today's output.
- [ ] Fail-open (each independently forcing `in-progress`, exit 0, no throw): missing/corrupt `run-state.json`; `run-state.json` valid JSON but failing the field contract — `status` not in the three-value enum, or `worktree` present but not a non-empty string (`[IL-123]`: validate fields, not `typeof === 'object'`); no derivable branch; any git command failure; missing `events.jsonl`.
- [ ] Consumer row: add this module's row to `skills/_shared/integration-branch.md`'s per-consumer fallback table (reusing the SessionStart-reaper row's rank restriction), per the stated-once rule — do not leave the new consumer implicit.
- [ ] Tests: `tests/run-integrity.test.js` — both states, ancestry and cherry evidence paths, deleted-branch-is-not-evidence, pre-ledger precondition, each fail-open input, and the SessionStart message rendering.

## Acceptance Criteria

1. Fixture run (status `active`, worktree path whose derived branch is truly-merged into the fixture repo's integration branch, `events.jsonl` containing a non-wrap-up `skill_invoked` event and no wrap-up one) → `state: 'shipped-unclosed'`; the SessionStart block for it contains both remediation strings.
2. Same fixture with a squash-merged branch (ancestry false, `git cherry` reporting all commits applied) → `'shipped-unclosed'` via the patch-equivalence path.
3. Same fixture with the branch unmerged → `'in-progress'`; with the branch deleted and no other signal → `'in-progress'`.
4. Same fixture, merged, but with a `{"type":"skill_invoked","skill":"claude-tweaks:wrap-up",...}` event present → `'in-progress'` (wrap-up ran; close-run lag is not drift worth alarming on). Same fixture, merged, but `events.jsonl` containing zero `skill_invoked` events of any kind → `'in-progress'` (pre-ledger run).
5. Each of: absent `run-state.json`; valid-JSON-wrong-shape (`{}`, an array, `status` outside the enum, empty-string `worktree`); no derivable branch (path gone, detached HEAD); git failure (nonexistent repo) → `'in-progress'`, no throw, exit 0.
6. Full `npm test` passes; SessionStart's existing output for a genuinely in-progress run is byte-identical to before this change.

## Technical Approach

Pure read-side module: no writes to run state, no event appends, no git mutations. `session-start.js` calls it per enumerated run and folds the verdict into the existing message — one caller, one surface.

### Data / API Surface

```js
// bin/lib/hooks/run-integrity.js
function checkRunIntegrity(runDir) → {
  state: 'in-progress' | 'shipped-unclosed',
  evidence: {
    branch: string|null,            // derived from the recorded worktree path, not a stored field
    merged: 'ancestor'|'cherry'|false|null,
    ledgerActive: boolean|null,     // ≥1 skill_invoked event of any kind
    wrapupInvoked: boolean|null
  }
}
```

`null` evidence fields mean "could not determine" — every `null` forces `in-progress` (fail-open is per-field, not just per-call).

### Key Files

- `bin/lib/hooks/run-integrity.js` — new module
- `bin/lib/hooks/session-start.js` — call site + message extension
- `bin/lib/hooks/git-exec.js` — consumed, not modified
- `skills/_shared/integration-branch.md` — new consumer row
- `tests/run-integrity.test.js` — new suite (fixture repos via `node --test` tmpdir setup, matching existing hook-test patterns)

### Package Dependencies

None — Node built-ins plus the in-repo git helpers.

## Gotchas

- **Ordering against the reaper:** `session-start.js` also fires `worktree-reap.js`, which can remove exactly the worktree this check derives its branch from. Run `checkRunIntegrity` (and capture its evidence) **before** any reap mutation in the same SessionStart pass; a run reaped first degrades to fail-open and the detection is silently lost for that session.
- Never hardcode `main` — this repo itself is the counterexample habitat (integration-branch ladder exists precisely because of it).
- Fixture SHAs/branches must match real shapes (`[IL-122]`) — full-length hex where a SHA is asserted, real `skill_invoked` lines, so tests fail for the right reason. For the squash path, build the fixture with an actual `git merge --squash` so `git cherry`'s patch-id logic is exercised for real.
- SessionStart hooks emit additionalContext (inform tier) — never a blocking posture; a wrong verdict must at worst produce one misleading advisory line, which is why fail-open resolves to `in-progress`.
- A branch can be merged yet the run legitimately still open (wrap-up running right now, mid-close) — that is why a present wrap-up event forces `in-progress`; the detector flags only the combination that means the procedure was bypassed.
- Subagent dispatch prompts for this work must say "refs #N", never closing keywords.

## Measured boundaries carried forward from #371's landed implementation (build-time addendum)

- Landed event shape (verified): `{"skill": "<verbatim>", "ts": "<ISO-8601>", "type": "skill_invoked"}` — key order differs from this record's illustration (appendEvent spreads `ts`/`type` last); unowned-run lines additionally carry `"attribution": "fallback"`. Match on fields, never on line shape.
- Subagent Skill calls ARE visible to parent-session hooks (measured, tagged `agent_id`/`agent_type` in the payload — the event line itself carries no agent fields). Prose saying visibility is "unconfirmed" is stale.
- User-typed slash commands produce NO Skill tool call and therefore no event (measured headless; interactive uses the same expansion path) — a human-typed `/claude-tweaks:wrap-up` leaves no event. This makes the verdict rule's wrap-up-event precondition conservative in exactly the fail-open direction: absence of a wrap-up event can mean "human typed it", which the conjunctive rule tolerates because a merged branch + open status + active ledger is still the bypass signature. State this boundary in the module header.

<!-- work-fingerprint: skill-invocation-ledger:run-integrity-detection-flag-shipped-but-never-closed-pipeli -->
