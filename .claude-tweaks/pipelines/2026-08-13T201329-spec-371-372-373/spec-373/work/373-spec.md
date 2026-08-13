---
record: 373
origin: human
risk: medium
size: medium
ceremony: standard
grants: []
fingerprint: skill-invocation-ledger:teardown-gate-deny-worktree-removal-on-non-terminal-runs-war
blocked-by: [371]
surface: infra
---
# 373: Teardown gate: deny worktree removal on non-terminal runs, warn on wrap-up-less close-run

Surface: infra

## Overview

Add the prevention layer: a block-tier PreToolUse gate denying teardown of a worktree still assigned to a non-terminal pipeline run, plus a warn inside `close-run` when a run is closed without wrap-up ever having been invoked. This is `[IL-116]` made structural — that incident's worktree was removed by calling `ExitWorktree` directly, skipping `cleanup-procedures.md` Section C's ordered sequence and permanently deleting the run's gitignored state; today nothing intercepts that call. The gate makes the documented cleanup sequence the only path that reaches teardown while a run is open; the `close-run` warn covers the shortcut the gate deliberately cannot (see Gotchas for why prevention there would false-positive).

**Complexity:** Medium
**Estimated tasks:** 7

## Non-Goals

- No gating of `git push`/merge — `/dispatch`'s auto-merge gate calls `close-run` before merging by documented design; gating merge would collide with that legitimate path.
- No SessionEnd gating — a SessionEnd hook cannot deny (the session is already ending); that window is covered by #372's next-SessionStart scan.
- No hard requirement of a wrap-up `skill_invoked` event on `clean` runs — see the measured-boundary addendum below: subagent Skill calls ARE parent-visible (measured), but user-typed slash-command wrap-ups leave no event at all (also measured), so a hard requirement would still block correct behavior. The warn tier covers it.
- No change to `worktree.always` or any existing gate's behavior.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #371 | Skill-invocation ledger: log Skill-tool calls to the run events.jsonl | complete (landed this run) |

Blocked by #371: the `close-run` warn reads its `skill_invoked` events. The landed shape (verified): `{"skill": "<verbatim>", "ts": "<ISO-8601>", "type": "skill_invoked"}` — key order varies, unowned-run lines carry `"attribution": "fallback"`; match on fields.

## Current State

- Gate host: `bin/lib/hooks/pre-tool-use.js` — the `worktree.always` gate; exports `GATE_COVERAGE`, pinned to `skills/_shared/policy-schema.md`'s coverage block by `tests/hooks-gate-coverage.test.js`. Deny is expressed via `hookSpecificOutput.permissionDecision: 'deny'` in stdout JSON, exit always 0 (see the module's own header comment for why exit 2 doesn't work).
- Matchers: `hooks/hooks.json` PreToolUse currently matches Bash (git/cp/mv/... filtered), Edit, Write, NotebookEdit. Neither `ExitWorktree` nor `Bash(git worktree *)` is matched — a direct teardown reaches no hook today.
- Run resolution is **forward-scoped only**: `context.js`'s `resolveRun` maps session/cwd → newest non-terminal run. No path→run reverse lookup exists anywhere yet — this unit adds one (Deliverables).
- Recorded assignment shape: `record-worktree` writes `run-state.json.worktree` as `path.resolve(worktreeArg)` — always absolute.
- Ownership convention precedent: `pre-tool-use.js`'s `wd-foreign-session` warn appends its event to **`ctx.runDir` (the enforcement-target run), not `ctx.ownedRun`** — CLAUDE.md's "writes use ownedRun" rule governs breadcrumb/state writes, and this warn-event class is the documented exception; follow the same precedent here.
- `close-run`: a `bin/hooks.js` verb (~lines 85-118) — patches `run-state.json` to `clean`, clears the worktree assignment, and emits **plain stdout text**; it never writes to `events.jsonl` today and has no hook-JSON output contract.
- Teardown-side data loss this protects: `cleanup-procedures.md` Section C step 3.5's Transitional guard (gitignored `config.yml`/`decisions.md`/`events.jsonl`/`staged/` copies) — skipped whenever teardown bypasses the sequence.
- Tests: `tests/hooks-gate-coverage.test.js` (coverage pin), `tests/hooks-dispatcher.test.js` (garbage-stdin invariant).

## Deliverables

- [ ] **Task 0 — empirical premise check (blocking: the gate's target-resolution logic and AC1/AC2/AC5's fixtures all depend on its output).** Capture a real `ExitWorktree` PreToolUse payload (throwaway hook, raw stdin to file) and pin: whether it carries an explicit worktree path, and what cwd the hook process sees. Per #371's premise-check learning, enumerate the initiator paths that exist for this tool (model-initiated ExitWorktree; note whether a headless `claude -p` run can trigger it at all). Fallback design if no explicit path: resolve the target as the payload's cwd's containing worktree (`git rev-parse --git-dir` walk, or `git worktree list --porcelain` match). If neither yields a target path → **fail-open allow** (added to the fail-open set below).
- [ ] `hooks/hooks.json`: PreToolUse matcher `"ExitWorktree"`, and a `Bash(git worktree *)` filtered entry in the existing Bash matcher block, both routing to the existing `pre-tool-use` dispatcher verb.
- [ ] Path→run reverse lookup: a new exported helper (in `context.js`, alongside `resolveRun`) that enumerates `$RUN_ROOT/.claude-tweaks/pipelines/*/run-state.json` (depth 1, `archive/` excluded) and returns the first run whose `worktree` field matches the canonicalized target path. Canonicalization: resolve the target relative to the Bash call's cwd (`path.resolve`), then `fs.realpath` both sides where the paths exist — recorded assignments are already absolute, but `git worktree remove <relative>` and symlinked paths must still match.
- [ ] Gate logic in `pre-tool-use.js`: teardown target resolved (per Task 0), reverse-looked-up run has status `active` or `interrupted` → deny, message naming the run dir and pointing at `cleanup-procedures.md` Section C. `git worktree` subcommands other than `remove` (`list`, `add`, `prune`, `lock`, ...) are untouched; `remove` parsing covers plain and `--force` forms.
- [ ] Ownership handling per the E1 convention: same-session or unowned run → deny; provably foreign-owned run → warn (non-blocking systemMessage + a `wd-foreign-teardown` event appended to **the target run's own `runDir`, matching the `wd-foreign-session` precedent**); missing identity on either side → deny.
- [ ] Fail-open set, each → allow: target path unresolvable at all (Task 0 fallback exhausted); target matches no recorded assignment; recorded path no longer exists on disk; missing/corrupt run-state; a `git worktree` command whose arguments cannot be confidently parsed resolves per the existing gate's posture for unparseable commands (#174's territory — do not invent a new posture, and do not widen the compound-command surface #174 complains about).
- [ ] `close-run` warn in `bin/hooks.js`: when the run's `events.jsonl` has no `skill_invoked` event for `claude-tweaks:wrap-up`, still close, but (1) append a `{"type": "close-without-wrapup", "ts": ...}` event to the run's `events.jsonl` **before** patching run-state, and (2) print a plain-text warning line to stdout — `close-run` is a CLI verb with a plain-text output convention, not a hook with a `systemMessage` JSON contract; callers (wrap-up, dispatch) surface stdout as-is, no new parsing.
- [ ] Coverage documentation: extend `GATE_COVERAGE` and add the sibling coverage block in `skills/_shared/policy-schema.md` (stated once there, per the `[IL-93]` rule — no restating in CLAUDE.md or elsewhere); `tests/hooks-gate-coverage.test.js` pins the new block.
- [ ] Tests: the deny/allow matrix in Acceptance Criteria, plus garbage-stdin invariance for the extended paths.

## Acceptance Criteria

1. A PreToolUse `ExitWorktree` payload (shape per Task 0) whose resolved target is recorded in a run with status `active` → stdout JSON has `permissionDecision: 'deny'`, exit 0, and the message contains both the run dir path and the string `cleanup-procedures.md`.
2. After `close-run` on that run (assignment cleared, status `clean`), the identical payload → allow.
3. A `Bash` payload of `git worktree remove <that path>` → same deny as criterion 1; the same command with a cwd-relative path resolving to the same worktree → same deny; `git worktree list` and `git worktree prune` payloads → allow, untouched.
4. Target path unresolvable, target matching no recorded assignment, or a recorded assignment whose path no longer exists on disk → allow.
5. A non-terminal run owned by a different session id → allow with a warn systemMessage and a `wd-foreign-teardown` event appended to that run's `events.jsonl`; a run with no recorded owner where the acting session also reports no id → deny.
6. `close-run` on a run whose `events.jsonl` lacks a wrap-up `skill_invoked` → run still transitions to `clean`, stdout contains a warning line, and the **last line** of `events.jsonl` is the `close-without-wrapup` event (close-run itself appends no further events); with the wrap-up event present → no warning line, no extra event.
7. `tests/hooks-gate-coverage.test.js` fails if the new coverage block and `GATE_COVERAGE` drift; full `npm test` passes.

## Technical Approach

Extends the existing gate module rather than adding a second PreToolUse module — one gate host, one coverage export, matching how `worktree.always` already lives there. The gate is deliberately keyed on *recorded assignment + non-terminal status*, nothing else: `close-run` is the sanctioned exit, and the asymmetry (deny before close, warn-only on a wrap-up-less close) is the design's honest acknowledgment that some wrap-up paths are invisible to the ledger (see the measured-boundary addendum).

### Data / API Surface

New typed events in `events.jsonl`:

```json
{"type": "wd-foreign-teardown", "path": "...", "ts": "..."}
{"type": "close-without-wrapup", "ts": "..."}
```

New reverse-lookup export (name illustrative, final name at build time):

```js
// bin/lib/hooks/context.js
function findRunByWorktreePath(runRoot, targetPath) → { runDir, state } | null
```

Deny payload shape: identical to the existing `worktree.always` deny (`hookSpecificOutput.permissionDecision: 'deny'` + `permissionDecisionReason`).

### Key Files

- `bin/lib/hooks/pre-tool-use.js` — gate logic + `GATE_COVERAGE` extension
- `bin/lib/hooks/context.js` — path→run reverse-lookup export
- `hooks/hooks.json` — two new matcher entries
- `bin/hooks.js` — `close-run` warn + event append
- `skills/_shared/policy-schema.md` — sibling coverage block
- `tests/hooks-gate-coverage.test.js` — pin extension
- `tests/hooks-dispatcher.test.js` — invariant extension

### Package Dependencies

None.

## Gotchas

- **Why the warn is not a deny:** requiring a wrap-up ledger event to close/tear down would break `/dispatch`'s documented close-run-before-merge path AND (measured, #371 finding (e)) any human-typed `/claude-tweaks:wrap-up`, which leaves no event at all. Do not "strengthen" this during implementation; the asymmetry is the design.
- Every path exits 0 — deny is stdout JSON only; the module's own header comment explains why exit 2 is wrong. New paths must pass the garbage-stdin invariant.
- `#174` documents the existing gate misparsing compound Bash commands ("too complex to verify" refusals) — the `git worktree remove` argument parsing added here must not extend that surface; an unconfidently-parsed command resolves per the existing gate's posture, not a new one.
- File-overlap coordination: `#366` (oversight-floor policy keys) also edits `skills/_shared/policy-schema.md`. RESOLVED for this run: #366 landed on main before this branch's catch-up merge, so its edits are already in the base — the new coverage block lands on top of them.
- The `[IL-45]` content-identity check lives in teardown *procedures*, not this gate — the gate never inspects HEAD identity; it checks bookkeeping state only. Keep that separation.
- Subagent dispatch prompts for this work must say "refs #N", never closing keywords.

## Measured boundaries carried forward from #371's landed implementation (build-time addendum)

- Landed event shape (verified): `{"skill": "<verbatim>", "ts": "<ISO-8601>", "type": "skill_invoked"}` (+ `"attribution": "fallback"` on unowned runs). Match on fields.
- Subagent Skill calls ARE visible to parent-session hooks (measured — payload tagged `agent_id`/`agent_type`): dispatch's Task-subagent wrap-ups DO register in the ledger. The original "Skill-hook visibility unconfirmed" rationale is stale; the warn-not-deny asymmetry still stands on two measured grounds: dispatch's sanctioned close-before-merge path, and (e) below.
- (e) User-typed slash commands produce NO Skill tool call and no event (measured headless; interactive uses the same expansion path) — a human-typed wrap-up is invisible to the ledger, so the close-run warn WILL fire on that correct behavior. This is an accepted warn-tier false positive; the warn text should be phrased so a human who just ran wrap-up manually reads it as informational, not accusatory.

<!-- work-fingerprint: skill-invocation-ledger:teardown-gate-deny-worktree-removal-on-non-terminal-runs-war -->
