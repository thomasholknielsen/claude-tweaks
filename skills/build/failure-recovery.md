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

## Behavioral bugs (distinct from execution-skill failures)

The table above covers *execution-skill* failures (the Superpowers chain itself breaking). A **behavioral bug** — code that runs but produces the wrong result, a failing test that reflects a real defect — is different. Do not edit-and-pray:

1. **Reproduce first.** Invoke `/superpowers:systematic-debugging`. Build a deterministic, runnable pass/fail signal for the bug (a failing test, a one-line repro) *before* touching production code. Spend disproportionate effort here — with a reliable repro the cause follows; without one, staring at code rarely does.
2. **Fix the confirmed cause**, then re-run the repro to confirm it's gone, and the suite to confirm no regression.
3. **If you cannot reproduce it, stop and escalate.** State what you tried and ask for what would unblock you (environment access, a captured artifact, permission for temporary instrumentation). Escalation is the correct move, not a failure — do not proceed to guess at a fix without a reproduction loop.

## Project-Specific Context

The implementer subagents will pick up project conventions from CLAUDE.md, `.claude/rules/`, and loaded skills. Ensure your CLAUDE.md documents:
- Import conventions (shared types packages, etc.)
- Error handling patterns
- Logging conventions
- Validation approach
- Naming conventions
