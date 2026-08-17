---
record: 790
origin: capture
risk: medium
size: medium
ceremony: standard
grants: []
surface: backend
---
# 790: flow: per-spec run-dir writes recur to worktree-relative shadow copy instead of $RUN_ROOT

Surface: backend

## Current State

Second confirmed occurrence (2026-08-15, 2026-08-17) of `/claude-tweaks:flow` per-spec pipeline writes (`decisions.md`, `staged/`, `run-state.json`) landing in a worktree-relative shadow copy of `.claude-tweaks/pipelines/{run-dir}/` instead of the `$RUN_ROOT`-anchored main-checkout copy — despite `_shared/pipeline-run-dir.md`'s own Anchoring-section warning and a documented prior incident (`[IL-127]`). The first occurrence permanently lost an entire run's audit trail on worktree removal; the second was caught and reconciled at teardown. Shipped code and git history are unaffected both times — this is a process-audit-trail integrity bug, not data loss in shipped work.

Two existing guards partially cover this failure shape but don't close it:

- `bin/lib/hooks/run-dir-resolve.js`'s `resolve()` already rejects an inherited `PIPELINE_RUN_DIR` env var that resolves outside the main checkout (`shadow-env` reason) — but that's the *adoption* path, not the *creation* path.
- `bin/lib/hooks/pre-tool-use.js`'s `checkPipelineShadowGuard` already denies an Edit/Write/NotebookEdit or Bash write/mkdir whose literal command text would create a new pipeline run directory inside a linked worktree — but it only sees paths visible in the Bash command string. A relative `--run`/`--run-dir` CLI argument that a Node script resolves internally via `fs` calls is invisible to this text-pattern guard.

The actual gap: `bin/hooks.js`'s `resolveRunArg` (shared by `record-worktree`, `close-run`, `release-claim`, `resume-freshness`) validates an explicit `--run <path>` only via `fs.statSync(candidate).isDirectory()` — true for a worktree-relative directory just as readily as an anchored one — with no `path.isAbsolute()` or anchoring check. `bin/wrap-up-engine.js`'s `--run-dir` parsing (`plan`/`record`/`render`) has no validation at all; `plan` calls `fs.mkdirSync(args.runDir, { recursive: true })` directly on whatever string it received. Both accept a bare relative value and silently write there. `bin/lib/log-decision/append.js`'s `resolveTarget` already anchors via `mainCheckoutRoot` and is not affected.

## Deliverables

1. **Runtime guard:** in `bin/hooks.js`'s `resolveRunArg` and `bin/wrap-up-engine.js`'s `--run-dir` parsing (`plan`, `record`, `render`), reject a `--run`/`--run-dir` value that is not an absolute path anchored under the main checkout root — reuse `bin/lib/hooks/worktree-detect.js`'s `mainCheckoutRoot()` + `isAnchoredUnderRoot()`, the same helpers `run-dir-resolve.js` already uses for the adoption-side check. Fail loud (non-zero exit, message naming the offending path and pointing at `resolve-run-dir`) rather than silently writing to the shadow location.
2. **Static lint/test:** a `node --test` suite scanning skill prose (`flow/steps-and-gates.md`, `flow/materialize.md`, `wrap-up/SKILL.md`, and any other citing skill step per `_shared/pipeline-run-dir.md`'s Resolution order) for a bare relative `.claude-tweaks/pipelines/` literal passed to `--run`/`--run-dir` — a call site missing a `"$RUN_ROOT/..."` (or equivalent absolute) prefix — before it ships. Follow the existing pinning convention (`pipeline-run-dir-adoption-anchoring.test.js`).

## Acceptance Criteria

- `resolveRunArg` (hooks.js) rejects a relative or unanchored `--run <path>` with a clear stderr/stdout message; existing valid absolute-anchored callers (record-worktree, close-run, release-claim, resume-freshness) are unaffected.
- `wrap-up-engine.js`'s `plan`/`record`/`render` verbs reject a relative or unanchored `--run-dir <path>` the same way, before any `fs.mkdirSync`/read/write happens.
- New unit tests cover: absolute+anchored (accept), relative (reject), absolute-but-resolving-inside-a-linked-worktree (reject).
- New prose-conformance test fails on a deliberately reintroduced bare-relative `--run`/`--run-dir` literal in a skill `.md` file, and passes against the current shipped prose.
- `npm test` passes in full.

## Technical Approach

- Add a small shared helper (or extend `resolveRunArg`) that calls `wtDetect.mainCheckoutRoot(cwd)` then `wtDetect.isAnchoredUnderRoot(path.resolve(candidate), mainRoot)`, mirroring `run-dir-resolve.js`'s existing `resolve()` logic for the `PIPELINE_RUN_DIR` env var — same failure-message shape, so both the adoption path and the explicit-flag path fail the same recognizable way.
- `wrap-up-engine.js`'s `parseArgs` currently just stores `argv[i+1]` for `--run-dir`; validate immediately after parsing, before `plan`'s `fs.mkdirSync` or `record`/`render`'s reads.
- The prose-conformance test greps for the literal pattern class, not a runtime behavior — see the `skill-prose-conformance-tests` skill for byte-pinning conventions if the check needs an executable snippet rather than a plain grep.

## Gotchas

- `bin/lib/log-decision/append.js`'s `resolveTarget` already anchors via `mainCheckoutRoot` — do not re-validate there; scope the fix to `hooks.js` and `wrap-up-engine.js` only.
- `resolveRunArg`'s existing `isRealDir` check must stay (an absolute-but-nonexistent path is still invalid) — add the anchoring check alongside it, not instead of it.
- The 2026-08-17 occurrence was caught and reconciled at teardown rather than losing data — confirm the fix doesn't regress that reconciliation path's own error handling in `wrap-up/cleanup-procedures.md` Section C step 3.5's transitional guard.
- Fix direction was a human decision, not a default: the filed record named two undecided directions ((a) runtime guard, (b) lint/test) with no stated preference; the human chose both, as defense-in-depth — a runtime guard stops actual data loss even from a dynamically-constructed path, and the lint/test catches the mistake earlier, before it ever reaches a live run.

## Original request

flow: per-spec run-dir writes recur to worktree-relative shadow copy instead of $RUN_ROOT

**Related:** none

Context: Second confirmed occurrence (2026-08-15, 2026-08-17) of /claude-tweaks:flow per-spec pipeline writes (decisions.md, staged/, run-state.json) landing in a worktree-relative shadow copy of .claude-tweaks/pipelines/{run-dir}/ instead of the $RUN_ROOT-anchored main-checkout copy — despite pipeline-run-dir.md's own Anchoring-section warning and a documented prior incident. First occurrence permanently lost an entire run's audit trail on worktree removal; second was caught and reconciled at teardown. Shipped code/git history unaffected both times — this is a process-audit-trail integrity bug, not data loss in shipped work.

Scope: Needs a structural fix, not another reminder — two viable directions with no stated preference: (a) a pre-write assertion/guard validating the resolved $RUN_ROOT is absolute before any pipeline-run-dir write, or (b) a lint/test catching a bare-relative .claude-tweaks/pipelines/ path (or a hooks.js/wrap-up-engine.js call missing an absolute --run/--run-dir argument) before it ships.
