# Run-State Ownership Design — Actor-True Identity for Pipeline Verbs

Origin record: #965 — "Parallel isolated-worktree dispatch: session identity collision lets sibling agents stomp each other's run-state."

## Problem

During a 10-record parallel dispatch (2026-08-19/20), a mistyped `hooks.js close-run --help` overwrote an unrelated sibling's run-state (`2026-08-19T210228-spec-315`, PR #944) to `worktree: null, status: clean` — disarming that run's worktree-isolation enforcement — three separate times, from three different non-owning sibling worktrees. Each stomp was caught by the offending agent's own vigilance, not by any structural guard.

## Root cause — confirmed

Both suspected mechanisms are real, and they compose:

1. **`CLAUDE_CODE_SESSION_ID` is shared across all subagents of a session.** Measured 2026-08-20 during this design: two concurrently-dispatched subagents and the dispatching session all reported the identical id. Subagents are tool calls inside one session; the harness gives them the parent's id by design. Session id identifies the *session*, never the *actor* — any ownership check that treats its equality as sufficient treats N parallel siblings as one actor.
2. **Unknown flags silently fall through to the implicit fallback.** `resolveRunArg` (`plugin/bin/hooks.js`) looks only for `--run`; `--help` (or any typo) is ignored and the verb proceeds on `resolveRunDir`'s "newest non-terminal run" scan. No verb in the dispatcher rejects unknown flags.

The composition: the fallback picked a sibling's run, and `closeRunState`'s foreign-owner refusal (`close-run-state.js`) compared session ids — equal, because shared — so the sibling's run read as "mine" and the write landed.

## Exposure map (audited at v6.103.0, repo tip e9298a14)

| Site | Exposure |
| --- | --- |
| `close-run` → `closeRunState` | Foreign refusal keys solely on sessionId inequality — defeated by shared ids. The incident path. |
| `record-worktree` (`hooks.js`) | **No ownership guard at all** — implicit resolution overwrites whatever run the fallback finds, clobbering `worktree`, `status`, and `sessionId`. |
| `record-pr`, `spec-status` | Same class as `record-worktree`: implicit fallback, no ownership check on the write. |
| `teardown-run` | Delegates to `closeRunState` — inherits its defeated guard. |
| `resolveRun` session-scoped resolution (`context.js`, #62) | `owner === me` matches a sibling's run and returns it as `attribution: 'session'` — confidently wrong under shared ids. |
| `pre-tool-use.js` E-checks (teardown foreign-warn path; `wd-foreign-session` commit path) | Same session-id-as-actor equivalence; fails toward deny/warn rather than corruption, but misclassifies siblings as the run's own session. |
| Claims (`claim-engine.js`) | **Not exposed.** Ownership is `runId`-keyed (unique per run dir); `sessionId` is display metadata only. |
| Reconcile (`bin/lib/reconcile`) | **Not exposed / by design.** Janitorial: reads and writes runs regardless of session ownership (the sanctioned exception documented at `context.js`'s `resolveRun` header). Release is runId + terminal-state based. |

## Decisions (made with the user during brainstorming)

1. **Implicit (no `--run`) resolution for mutating verbs: unambiguous-only.** Act only when provably safe; otherwise refuse with paste-ready `--run` commands. (Chosen over hard-requiring `--run`, which breaks the one-session-one-run interactive case, and over keeping the fallback with only a write-time guard, which leaves a stomp window for binding-less runs.)
2. **Scope: the whole ownership model**, sliced into agent-sized sub-issues at decomposition — corruption-path fixes ship first, enforcement-layer fixes follow. No parked second record.
3. **Identity mechanism: composite `sessionId ∧ worktree-binding`.** No run-state schema change; no per-run token (readable by any sibling, so ceremony without a boundary); not cwd-only (loses the two-different-sessions-in-one-checkout distinction the E-checks rely on).

## Phase 1 — `classifyOwnership`: the shared predicate

New export in `plugin/bin/lib/hooks/context.js`:

`classifyOwnership({ sessionId, cwd }, runState) -> 'mine' | 'foreign' | 'indeterminate'`

- **`foreign`** — session ids present on both sides and different (today's rule, kept), **or** session ids equal-or-missing while `runState.worktree` is recorded and `cwd` resolves inside a *different* live worktree of the same repo. The second arm is the new sibling detection. Path comparison canonicalizes via realpath exactly as `findRunByWorktreePath` does; a recorded worktree that no longer exists on disk cannot prove foreignness (fail open to `indeterminate`).
- **`mine`** — session ids compatible **and** `cwd` resolves inside the recorded worktree; or the run has no binding and the caller sits in the main checkout of the same repo with matching session ids.
- **`indeterminate`** — no binding and no contradicting evidence. Preserves the deliberate asymmetry documented at `resolveRun`: an unowned run may still be ours; a provably-foreign run never is.

Unit-test matrix: shared-session sibling (the incident shape), distinct sessions same checkout, missing session id on either side, no-binding runs, recorded-worktree-deleted fail-open, relative/symlinked cwd canonicalization.

## Phase 2 — Mutating verbs: unknown-flag rejection + unambiguous-only fallback + write-time guard

All via the shared `resolveRunArg` seam so the five mutating verbs (`close-run`, `record-worktree`, `record-pr`, `spec-status`, `teardown-run`) change together:

- **Unknown-flag rejection.** Each verb declares its known flags; any other `--*` argument prints that verb's usage line and acts on nothing (exit without any state read or write). `close-run --help` becomes a usage printout. This alone would have stopped the literal incident all three times.
- **Implicit resolution order** (no `--run` given): (1) `PIPELINE_RUN_DIR` env, unchanged; (2) cwd-binding reverse lookup — the non-terminal run whose recorded worktree contains the caller's cwd is the caller's own run, unambiguous even with N siblings live (reuses `findRunByWorktreePath`); (3) after excluding candidates whose `classifyOwnership` is `foreign` (provably not the caller's), exactly one non-terminal candidate remains → act on it (preserves the casual single-run interactive case; a foreign-classified run can never be selected implicitly, so its presence doesn't block acting on the one run that may be yours); (4) otherwise refuse and list every candidate as a paste-ready `node "$PLUGIN_ROOT/bin/hooks.js" <verb> --run "<dir>"` line (report-line convention: every refusal carries a runnable command).
- **Write-time guard.** `closeRunState`'s `foreignOwner` predicate upgrades from raw sessionId comparison to `classifyOwnership`; `record-worktree`, `record-pr`, and `spec-status` — which today have no ownership check — refuse an implicit write on a `foreign` verdict with the same refusal shape. Explicit `--run` keeps today's override semantics everywhere (a foreign close prints the advisory and proceeds): the sanctioned console-execution/janitorial exception depends on it, as does post-merge settlement invoked from outside a reaped worktree.
- **Named regression test:** three same-session callers, each cwd'd in its own worktree, invoke `close-run --help` and bare `close-run` against a repo holding a fourth sibling's active run — that run's `run-state.json` must end byte-identical. Verify the test discriminates by reverting the fix.

`record-worktree` ordering note: it is the verb that *creates* the binding, so at call time the target run has none — implicit resolution for it can only ever succeed via `PIPELINE_RUN_DIR` or the single-non-foreign-candidate rule; with siblings live it refuses, which is exactly the already-documented "always pass `--run`" discipline made structural.

## Phase 3 — Enforcement layer: E-checks and resolveRun attribution

- `pre-tool-use.js`'s two inline `owner !== caller` session comparisons (the teardown foreign-warn path and the `wd-foreign-session` commit path) replace their predicate with `classifyOwnership`, feeding it the hook payload's `session_id` and cwd. Where ids match but the caller's cwd is a different worktree than the run's binding, the caller now takes the foreign branch (warn/allow + event) instead of the same-session branch (deny) — a sibling agent is no longer misclassified as the run's own session.
- `resolveRun`'s session-scoped path no longer returns `attribution: 'session'` for a run whose binding points at a different live worktree than the caller's cwd — it skips it as a sibling's. Single-session behavior must be byte-identical (pin with tests over the existing resolution fixtures).
- The hook-payload `session_id` and env `CLAUDE_CODE_SESSION_ID` are the same identity and share the same limitation; both call sites get the same treatment.

## Phase 4 — Documentation and contract notes

- `docs/hooks.md` gains an "Ownership" section: the composite identity contract, the three verdicts, the explicit-`--run` override semantics, and the measured harness fact — *`CLAUDE_CODE_SESSION_ID` is shared across all subagents of a session (measured 2026-08-20, #965); it identifies the session, never the agent; no ownership decision may treat its equality as sufficient.*
- `docs/incident-log.md` gains the spec-315 stomp entry (what build it bit, how it was caught, what it cost), and the corresponding one-clause rule lands in `docs/donts.md` per that file's format.
- `_shared/pipeline-run-dir.md` / skill prose referencing the "always pass `--run`" discipline cite the new structural guarantee rather than restating it.

## Explicitly unchanged

Claims and reconcile (audited not-exposed, above); run-state schema; `PIPELINE_RUN_DIR` contract; console execution's sanctioned foreign-run writes; the `resolveRun` header's documented asymmetry (its *rationale* is preserved — only the sibling case is reclassified).

## Testing strategy

`tests/bin-lib/` suites colocated per module: the Phase 1 predicate matrix; per-verb unknown-flag rejection; the implicit-resolution matrix (0/1/N candidates × binding states × caller locations); the Phase 2 named regression; Phase 3 pinning of single-session-identical behavior. Every new test verified by reverting the fix it pins. Conformance suites that pin prose (`hooks-gate-coverage` and kin) re-run in full before merge.
