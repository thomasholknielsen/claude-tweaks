---
record: 371
origin: human
risk: medium
size: medium
ceremony: standard
grants: []
fingerprint: skill-invocation-ledger:skill-invocation-ledger-log-skill-tool-calls-to-the-run-even
surface: infra
---
# 371: Skill-invocation ledger: log Skill-tool calls to the run events.jsonl

Surface: infra

## Overview

Add a skill-invocation ledger: a new hook path that records every Skill-tool call as a typed event in the active pipeline run's `events.jsonl`. Today the plugin's audit trail (run-state.json, events.jsonl) is driven entirely by git operations and explicit `record-worktree`/`close-run` calls — nothing records whether a lifecycle skill was actually *invoked* versus an agent manually replicating its documented intent (#364's failure mode: a full flow run shipped its PR while `run-state.json` stayed `"active"` because wrap-up was never actually entered). This unit makes "the procedure was entered" a fact the runtime itself recorded, consumable by the run-integrity detection (#372) and teardown-gate (#373) units that build on it.

**Complexity:** Medium
**Estimated tasks:** 6

## Non-Goals

- No filtering/allowlist of which skills get logged — every Skill invocation is logged; filtering to "expected pipeline skills" is the *reader's* job (#372). An allowlist in hook code is the restated-list-goes-stale failure `[IL-93]` exists for. Growth is bounded: the log is per-run, run dirs are archived at close, and a run's Skill invocations number in the dozens — no rotation mechanism is needed or wanted.
- No pre/post event pair and no completion semantics — one event meaning exactly "the procedure was entered." PostToolUse fires when the tool call returns, before the skill's instructions execute; do not imply bracketing.
- No detection, no gating, no reconciliation — those are #372 and #373.
- No fix for #208 (archived-run resurrection by hook writes) — this writer inherits the existing write path's behavior; it must not create run directories, only append to an existing run's `events.jsonl`.

## Prerequisites

None — this is the foundation unit; #372 and #373 block on it.

## Current State

- Hook registration: `hooks/hooks.json` — every event routes `node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" <event>`; PostToolUse currently matches only `Bash` (git-command-filtered) and `Write`. No `Skill` matcher exists anywhere. The new entry is one more matcher object appended to the existing `PostToolUse` array — `{"matcher": "Skill", "hooks": [{"type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/bin/hooks.js\" post-tool-use"}]}` — a literal tool-name match like `Edit`/`Write`, not a pattern-filtered entry like the Bash rows.
- Dispatcher: `bin/hooks.js` — one module per event under `bin/lib/hooks/`; `post-tool-use.js` handles Write (deferred-subproject capture) and git commit/push (closing-keyword check).
- Run resolution + event writes: `bin/lib/hooks/context.js` — two resolutions by design (CLAUDE.md Hooks section): enforcement-style `resolveRun` reads regardless of owner; **writes use the ownership-scoped `ctx.ownedRun` path plus the module's existing event-append helper** — that pair, not `resolveRun`, is what this module consumes (the helper owns the `attribution: "fallback"` tagging for unowned runs). Reuse it; do not write a parallel appender (read the module's exports first — duplicate logic usually already exists nearby).
- Event log: `.claude-tweaks/pipelines/{run-id}/events.jsonl` — append-only typed events (JSON object per line), already written by pre/post-tool-use modules.
- Tests: `tests/hooks-dispatcher.test.js` — the garbage-stdin invariant every hook module must pass (any stdin, exit 0); `tests/` uses `node --test`.

## Deliverables

- [ ] **Task 0 — empirical premise check (blocking; every later task's fixtures depend on its output).** Capture real Skill PostToolUse payloads via a throwaway hook writing raw stdin to a file, covering: (a) a plugin-qualified invocation (`/claude-tweaks:version`), (b) a bare/unqualified invocation if the harness permits one, (c) a failed-but-permitted call (a nonexistent skill name), and (d) a Skill call made *inside a Task-dispatched subagent*, to settle empirically whether subagent Skill calls fire parent-session hooks. Pin: the `tool_input` field carrying the skill name, its qualification format across (a)/(b), the error-signaling field on (c) (e.g. `tool_response.is_error`), and the (d) answer. Record all four answers in the module's header comment. The (d) answer does not change this unit's design either way — the ledger's guarantee is top-level invocations, #364's actual failure mode — but the sibling units' prose must state whichever boundary was measured, not the assumed one.
- [ ] `hooks/hooks.json`: the PostToolUse `Skill` matcher entry (shape above).
- [ ] `bin/lib/hooks/skill-invocation.js`: new module exporting the handler; `post-tool-use.js` routes `tool_name === 'Skill'` payloads to it.
- [ ] Event append: on a resolved owned run — or an unowned run via the fallback path — append `{"type": "skill_invoked", "skill": "<name verbatim as the harness reports it>", "ts": "<ISO-8601, generated by this module at append time>"}` to that run's `events.jsonl` via context.js's existing append helper. Store the skill name **verbatim, no normalization**: pipeline skills are always invoked fully-qualified (`/claude-tweaks:{skill}` is mandatory in actionable instruction text, per CLAUDE.md's cross-reference rule), so consumers (#372, #373) match the qualified form; Task 0's (a)/(b) capture confirms the reported format before any consumer logic is written.
- [ ] Skip-paths, each exiting 0 with no write: no resolvable run (load-bearing for the standalone-wrap-up ordering hole — wrap-up's own event fires before it creates its run dir; a dropped event is correct there, not a bug — see the invariant in Gotchas); run owned by another session; `tool_response` indicating a failed call (per Task 0's pinned error field); missing, empty, or non-string skill field in `tool_input`.
- [ ] Tests (`tests/skill-invocation.test.js` + invariant extension in `tests/hooks-dispatcher.test.js`): owned-run append; **unowned-run append asserting the line lands tagged `attribution: "fallback"`**; no-run drop; foreign-owner drop; failed-call drop; missing/empty/non-string skill-field drop; garbage stdin.

## Acceptance Criteria

1. A synthetic Skill PostToolUse payload (shape pinned by Task 0) with cwd inside a repo holding one active owned run appends exactly one line to that run's `events.jsonl`; the parsed line has `type === 'skill_invoked'`, the verbatim skill name, and an ISO-8601 `ts`.
2. The same payload against an active run with no recorded owner appends one line whose attribution tagging matches the append helper's `attribution: "fallback"` convention.
3. The same payload with no resolvable run exits 0 and creates no file and no directory — asserted both with an existing-but-unmatched `.claude-tweaks/pipelines/` directory (listing byte-identical before/after) and with the directory entirely absent (still absent after).
4. The same payload against a run owned by a different session id exits 0 and appends nothing to that run.
5. A payload whose `tool_response` carries the Task-0-pinned failure signal, and payloads whose skill field is missing, empty-string, or non-string, each exit 0 with no write.
6. `echo 'not json' | node bin/hooks.js post-tool-use` exits 0 (extends the existing invariant test's module list).
7. Full `npm test` passes; no existing PostToolUse behavior (closing-keyword check, deferred-subproject capture) changes — their tests still pass untouched.

## Technical Approach

New module, wired through the existing PostToolUse dispatch rather than a new dispatcher verb — one dispatcher, one module per concern, matching the established pattern. PostToolUse (not PreToolUse) is deliberate: a denied call never reaches PostToolUse, and a failed-but-permitted call is excluded via Task 0's pinned error field — so no false "procedure entered" events from either failure class. Task 0's captures are also what verify the firing-time claim (the payload arrives after the tool call returns, before the skill's instructions run) rather than taking it on faith.

### Data / API Surface

Event line (append-only, one JSON object per line in `events.jsonl`):

```json
{"type": "skill_invoked", "skill": "claude-tweaks:wrap-up", "ts": "2026-08-13T18:00:00.000Z"}
```

This block is the **cross-spec contract**: #372's verdict rule and #373's close-run warn both match `type === 'skill_invoked' && skill === 'claude-tweaks:wrap-up'` against exactly this shape. `skill` is verbatim as the harness reports it (Task 0 pins the format); `ts` is generated by this module at append time — no payload timestamp is assumed to exist. No `args` field — argument payloads can be large and add nothing the consumers read.

### Key Files

- `hooks/hooks.json` — new PostToolUse `Skill` matcher entry
- `bin/lib/hooks/skill-invocation.js` — new module (handler + exported helpers for tests)
- `bin/lib/hooks/post-tool-use.js` — route `tool_name === 'Skill'` to the new module
- `bin/lib/hooks/context.js` — consumed, not modified (unless the append helper genuinely needs a parameter it lacks — prefer consuming as-is)
- `tests/hooks-dispatcher.test.js` — invariant extension
- `tests/skill-invocation.test.js` — new unit suite

### Package Dependencies

None — Node built-ins only, matching every other hook module.

## Gotchas

- **Never break a session:** every path — malformed stdin, missing fields, unwritable run dir — exits 0. A deny/exit-2 has no meaning here anyway (PostToolUse), but the invariant is absolute.
- The Skill payload schema is **undocumented** — Task 0 is not optional polish; building against a guessed field name ships a hook that silently logs nothing (the `[IL-71]`-class premise failure, and exactly the silent-fallback-masks-bugs trap: test with real captured payloads, not only synthetic fixtures).
- **The invariant the dropped-event cases rest on** (stated here because #372 depends on it): a run whose dir was created by the invoked skill itself (standalone wrap-up, `createdBy: "wrap-up-standalone"`) carries no worktree assignment, and #372's fail-open on "no derivable branch" keeps such runs permanently out of `shipped-unclosed` scope — so a dropped wrap-up event can only ever cause a *missed* detection, never a false accusation. If #372's fail-open rules change, this invariant must be re-checked.
- Hook processes get the harness's environment, not the Bash tool's — run resolution comes from the hook payload's cwd, same as every existing module.
- Append to existing runs only; never `mkdir` a run dir (that is #208's resurrection bug — do not widen it).
- Subagent dispatch prompts for this work must say "refs #N", never closing keywords.

<!-- work-fingerprint: skill-invocation-ledger:skill-invocation-ledger-log-skill-tool-calls-to-the-run-even -->
