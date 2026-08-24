# Record #1270: hook-event-simulating tests leak ambient PIPELINE_RUN_DIR

## For agentic workers

Executed directly under `/claude-tweaks:build #1270` (fast-lane ceremony). Not routed through
`/superpowers:subagent-driven-development` — single-file investigative fix, no parallelizable
task decomposition.

## Context

`#1130` (commit `fd74a6d2`, 2026-08-22) already fixed the root-cause pattern — an ambient
`PIPELINE_RUN_DIR` (present in every `/flow`-dispatched shell) forwarding into a
`bin/hooks.js`-spawning test's child process via `{ ...process.env, ...env }` — in
`hooks-dispatcher.test.js`, `reconcile.test.js`, `hooks-spec-status.test.js`, and
`archive-run-verb.test.js`. `#1270` was filed against a `decisions.md` entry attributing failures
in `hooks-dispatcher.test.js`/`pr-state.test.js` to this same leak; by the time this build ran,
that fix was already merged into `hooks-dispatcher.test.js`.

## Investigation

1. **`pr-state.test.js`** does not spawn `bin/hooks.js` at all — it shells to `gh` via a wrapper
   script installed on `PATH` (`installGhWrapper`), and `gh` has no notion of `PIPELINE_RUN_DIR`.
   No fix needed; its naming in the original `decisions.md` entry was a misattribution (two
   distinct failure symptoms from the same test run, not two instances of the same bug).
2. **Audited every `tests/**/*.test.js` spawn of `bin/hooks.js`** (`execFileSync`/`spawnSync` with
   `node`/`process.execPath` + a `HOOKS`/`HOOKS_JS` path) for env control:
   - Already guarded (from `#1130` or since): `hooks-dispatcher.test.js`, `reconcile.test.js`,
     `hooks-spec-status.test.js`, `archive-run-verb.test.js`, `teardown-gate.test.js`,
     `skill-invocation.test.js`, `run-integrity.test.js`, `hooks-resolve-run-dir-cli.test.js`
     (every call site passes `env` explicitly, no default fallback).
   - Gap found, no default `env` control at all: `hooks-worktree-local-fallback-disclosure.test.js`
     (`runHooks`), `hooks-run-arg-anchoring.test.js` (`runRecordWorktree`),
     `curation-judge-stagepath.test.js` (`sweep`, spawns `sweep-shadow`).
   - Not exploitable *today* (every actual test call already passes `--run`/`runDir` explicitly,
     and `resolveRunArg`'s explicit-`--run` branch never reads `env` at all — confirmed via
     `plugin/bin/hooks.js`'s `resolveRunArg`, lines ~78-93), but inconsistent with the
     established defense-in-depth convention and a silent trap for a future test addition that
     omits `--run`. Fixed anyway, matching `#1130`'s posture.
   - `reconcile-background.test.js`/`reconcile-summary.test.js` spawn `bin/hooks.js
     reconcile-background`/`reconcile-summary`/`reconcile` with no env control either, but those
     verbs resolve their scan root from `cwd` (`mainCheckoutRoot(cwd) || cwd`) and never read
     `PIPELINE_RUN_DIR` at all (confirmed in `plugin/bin/hooks.js`'s `reconcile*` handlers) — no
     fix needed.
   - The actual `events.jsonl`-writing code path (`resolveRun` in
     `plugin/bin/lib/hooks/context.js`, which checks `env.PIPELINE_RUN_DIR` before any cwd scan)
     is reachable only via `bin/hooks.js`'s `EVENTS` dispatch (`pre-tool-use`, `post-tool-use`,
     `session-start`, `session-end`, `pre-compact`, `subagent-stop`) — every other test file
     matching those event-name strings does so via in-process module calls (`ctx.resolveRun(...)`,
     `pre.run(...)`), never a child-process spawn, so they carry no leak risk regardless of env
     handling.

## Changes

- `tests/hooks-worktree-local-fallback-disclosure.test.js` — `runHooks()`: add
  `env: { ...process.env, PIPELINE_RUN_DIR: '' }`.
- `tests/hooks-run-arg-anchoring.test.js` — `runRecordWorktree()`: same guard.
- `tests/curation-judge-stagepath.test.js` — `sweep()`: same guard (replacing the prior
  `env: process.env`).
- `tests/hooks-dispatcher.test.js` — new regression test `#1270: a gate-denial event never lands
  in an ambient PIPELINE_RUN_DIR the call site never passed`, alongside the existing `#1130`
  `record-pr` regression test. Sets `process.env.PIPELINE_RUN_DIR` on the test runner itself
  (the exact shape a `/flow`-dispatched shell's ambient env takes), triggers a real gate-denial
  through `runHook(['pre-tool-use'], ...)`, and asserts the event lands only in the correctly
  cwd-resolved run dir, never in the decoy pointed to by the ambient value — this is the
  `events.jsonl`-specific proof the Acceptance Criteria names (the pre-existing `#1130` test
  covers `record-pr`'s `run-state.json` field, not `events.jsonl`).

## Verification

- Confirmed the new regression test goes red when the `#1130` guard is reverted (temporarily,
  then restored) — `node --test tests/hooks-dispatcher.test.js` failed exactly that test (plus
  the pre-existing `#1130` one), 42/44 passing, 2 failing as expected.
- `node --test tests/hooks-dispatcher.test.js` — 44/44 pass with the guard restored.
- `node --test tests/hooks-worktree-local-fallback-disclosure.test.js
  tests/hooks-run-arg-anchoring.test.js tests/curation-judge-stagepath.test.js` — 45/45 pass.
- `node --test tests/bin-lib/reconcile/pr-state.test.js` — 18/18 pass (confirms no
  regression from leaving this file untouched).
