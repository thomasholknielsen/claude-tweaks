# Criteria: Resilience / Fault-Tolerance

Shared, criteria-only fragment — what to flag when judging resilience. No workflow, no Next Actions. Consumed by `/claude-tweaks:code-health`'s resilience judgment lens. One source of truth so every sweep applies identical calibration. Confidence floor: `high` — flag only a concrete failure path with a real trigger, not an abstract "could fail" concern.

## What to flag

- I/O calls (database queries, file reads, queue consumers) with no timeout configured and no fallback path.
- Network calls (HTTP clients, RPC stubs, external APIs) with no retry policy and no circuit-breaker or backoff.
- Unhandled rejection paths on async operations that, if they threw, would leave shared state corrupt or the process in an undefined state.
- Missing graceful-shutdown handling for long-running services: a process that drops in-flight work on SIGTERM without draining queues or releasing locks.
- Health-check or readiness-probe implementations that always return `200` regardless of real dependency health.

## What NOT to flag

- Retry logic absent from pure computation (no I/O) — retrying a deterministic function has no value.
- Missing timeout on an operation that is already wrapped by the caller's context-cancellation or deadline.
- "Could fail" in the abstract without a concrete path through the code where it does fail.
- Defensive code that duplicates an existing safety net in the framework (e.g., re-adding a timeout that the HTTP client framework already enforces).

## Severity calibration

- **high** — a failure in this path leaves shared persistent state corrupt (partial write, double-spend, orphaned lock), causes silent data loss, or silently drops messages that will not be replayed.
- **medium** — a failure causes a request timeout or a degraded user experience but the system recovers without data loss.
- **low** — a missing timeout that slows a non-critical background job.
