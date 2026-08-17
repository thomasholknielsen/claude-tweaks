# Criteria: Observability

Shared, criteria-only fragment — what to flag when judging observability on critical paths. No workflow, no Next Actions. Consumed by `/claude-tweaks:code-health`'s observability judgment lens.

## What to flag

- Critical code paths (auth, payment, data mutations, queue consumers) with no structured log on failure — a silent error that leaves no trace in any log.
- Log statements that include secrets, API keys, tokens, passwords, or PII (names, emails, IDs). These are security defects masquerading as observability.
- Expensive operations (DB queries, external API calls) that have no timing instrumentation and no way to attribute latency to them in production.
- Business events (order placed, user created, payment processed) emitted with no correlation ID or trace context, making distributed debugging impossible.
- Catch blocks that swallow the error: `catch (e) {}` or `catch (e) { return null; }` with no log.

## What NOT to flag

- Absence of logging on a path that is already traced by the framework or platform (e.g., HTTP middleware that already logs every request).
- Missing metrics on paths the team has explicitly instrumented elsewhere (confirm before flagging).
- "Insufficient logging" without a concrete failure scenario where the absence would prevent diagnosis.
- Log statements that are clearly debug-only and behind a log-level gate.

## Severity calibration

- **high** — a secret or PII is logged (security defect), or a critical business event is entirely untraceable when it fails.
- **medium** — a slow path has no timing; degraded performance would be invisible.
- **low** — a non-critical path lacks a debug log.
