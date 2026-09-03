---
record: 447
origin: capture
risk: low
size: medium
ceremony: standard
grants: [build]
surface: infra
---
# 447: dispatch Step 5: EnterWorktree fails for cwd-pinned dispatching sessions

Surface: infra

## Current State

`/claude-tweaks:dispatch` Step 5 dispatches Task-tool subagents to build/review a group's changes inside its worktree. Step 5's entry mechanism assumes `EnterWorktree` can create or switch into that worktree from the dispatching session's own context.

When `/claude-tweaks:dispatch` itself is running as a parallel Agent-tool subagent (not a top-level session), the subagent's cwd is pinned by the harness. `EnterWorktree` refuses both the create and switch forms in that shape, because it cannot repin a cwd it doesn't control — leaving Step 5 with no way to get a Task-dispatched build/review child into the group's worktree.

This was confirmed independently by 3 separate dispatch firings on 2026-08-14. Each self-settled correctly via the skill's existing failure path (claim released, `auto:build`/`auto:merge` preserved, no unsafe state left behind) — so the failure mode is safe today, but undocumented, and two sibling firings (#392, #397) each independently reinvented the same workaround: falling back to an explicit per-command `cd` into the worktree instead of relying on `EnterWorktree`.

## Deliverables

- In `dispatch/SKILL.md` Step 5 (and `sequential-execution.md` where the same entry logic is described), detect the `EnterWorktree`-refusal shape described above — a cwd-pinned dispatching session (itself a Task/Agent-tool subagent) attempting to create or switch into a group's worktree.
- On detection, fall back to the explicit per-command `cd` pattern already independently reinvented by #392 and #397, applied per command issued to the dispatched build/review child, rather than relying on a one-time `EnterWorktree` call.
- Document this environment shape and its fallback explicitly in both files, so future dispatch firings under this shape follow the documented path instead of rediscovering it.

## Acceptance Criteria

- `dispatch/SKILL.md` Step 5 names the cwd-pinned-subagent failure shape and states the per-command `cd` fallback as the documented behavior, not an implicit workaround.
- `sequential-execution.md` reflects the same fallback wherever it describes worktree entry for a dispatched child.
- The documented fallback preserves the existing safe self-settling behavior (claim released, `auto:build`/`auto:merge` preserved, no unsafe state left) confirmed by the three 2026-08-14 firings — it must not regress that path.
- No change alters `EnterWorktree` behavior for a top-level (non-subagent) dispatching session — the fallback applies only when the cwd-pinned shape is detected.

## Technical Approach

Detect the shape by checking whether the dispatching session's own cwd is harness-pinned (the same signal `EnterWorktree`'s own refusal already surfaces) before attempting create/switch. On refusal, switch Step 5's entry instructions for the dispatched Task child from a single `EnterWorktree` call to prefixing each issued command with an explicit `cd {worktree-path} &&` (or the per-command `cd` form #392/#397 used), so the child never depends on a shared shell cwd that the dispatching session cannot set.

## Gotchas

- The fallback must not silently mask a genuine `EnterWorktree` failure unrelated to cwd-pinning (e.g. a missing worktree) — detection should key specifically on the cwd-pinned-subagent shape, not swallow all `EnterWorktree` errors into the same fallback.
- Related records #391, #395, #396 touch adjacent dispatch/worktree behavior — check for overlap before landing this change to avoid two records editing the same Step 5 section independently.

## Original request

dispatch Step 5: EnterWorktree fails for cwd-pinned dispatching sessions

**Related:** #391, #395, #396

Context: Running /claude-tweaks:dispatch as a parallel Agent-tool subagent (not a top-level session) makes EnterWorktree refuse both the create and switch forms, since the subagent's own cwd is pinned by the harness — Step 5 has no way to get a Task-dispatched build/review child into the group's worktree. Confirmed independently by 3 separate dispatch firings on 2026-08-14, each self-settling correctly via the skill's own failure path (claim released, auto:build/auto:merge preserved, no unsafe state left behind).

Scope: Document or structurally support this environment shape in dispatch/SKILL.md and sequential-execution.md — detect the EnterWorktree failure and fall back to an explicit per-command `cd` into the worktree (the workaround two sibling firings, #392 and #397, each independently reinvented) rather than leaving every firing to rediscover it.

