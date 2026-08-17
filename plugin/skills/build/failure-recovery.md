# Superpowers Failure Handling — recovery procedures for execution-skill failures

Referenced from Common Step 2 of `/claude-tweaks:build`. Loaded only when an execution skill (or `/superpowers:writing-plans` in Step 3) fails.

## Recovery table

| Failure | Recovery |
|---------|----------|
| **Not installed** (command not found) | Stop. Tell the user: "Superpowers plugin is required. Install: `/plugin install superpowers@claude-plugins-official`" |
| **Timeout or partial output** | Re-run the specific step that failed. If `/superpowers:writing-plans` timed out, re-invoke it with the same context. If `subagent-driven-development` or `executing-plans` timed out mid-task, check which tasks completed (scan git log) and resume from the next incomplete task. |
| **Malformed plan** (`/superpowers:writing-plans` produced output that the execution skill can't parse) | Re-run `/superpowers:writing-plans` with the same context. If it fails again, fall back to manual planning: break the spec into 3-5 implementation tasks, present them to the user, and implement each task directly without the Superpowers execution chain. |
| **Subagent failures** (individual tasks fail within `subagent-driven-development`) | Let the skill's built-in retry handle it first. If the task fails repeatedly, implement that task directly in the main thread and continue. |
| **Batch rejection** (user rejects a batch in `executing-plans`) | Review the feedback, adjust the failing tasks, and re-run the rejected batch. If the user rejects the same batch twice, implement those tasks directly in the main thread. |
| **Anything else** (a failure matching none of the rows above — an unrecognized tool/API error, a dropped connection mid-task, or any other shape) | Don't guess and don't blindly redo the task from scratch. First verify actual state directly (`git diff`, `git log`) — a subagent can fail after applying an edit but before committing or reporting, so work may already be present and correct. If a partial edit is present and correct, dispatch a recovery pass to verify-and-commit against the original task brief rather than re-running it fresh. If nothing usable is present, fall back to implementing that task directly in the main thread, same as the Subagent failures row. |

## Behavioral bugs (distinct from execution-skill failures)

The table above covers *execution-skill* failures (the Superpowers chain itself breaking). A **behavioral bug** — code that runs but produces the wrong result, a failing test that reflects a real defect — is different. See `_shared/reproduce-first-discipline.md` for the canonical reproduce-first procedure (build a deterministic pass/fail signal before touching code, fix the confirmed cause, escalate rather than guess if it can't be reproduced; once green, walk the causal-depth chain per the discipline's step 3).

## Project-Specific Context

The implementer subagents will pick up project conventions from CLAUDE.md, `.claude/rules/`, and loaded skills. Ensure your CLAUDE.md documents:
- Import conventions (shared types packages, etc.)
- Error handling patterns
- Logging conventions
- Validation approach
- Naming conventions
