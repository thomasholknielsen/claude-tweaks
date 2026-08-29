# Merge-Lane Circuit Breaker Reset Offer

Cited by `refine-mode.md` Step 3 ("Merge-lane circuit breaker reset offer") — the one place
`/claude-tweaks:backlog refine`'s grant sub-stage checks and, when tripped, offers to clear the
global merge-lane circuit breaker (#311). Two other callers read this file too, for different
purposes: `refine-record.md`'s standalone `--reset-breaker` form runs this file's Reset branch
verbatim as its entire procedure (never the offer's read/skip-if-untripped framing above it), and
`attention-mode.md`'s breaker-banner row cites this file's fail-open read posture (a read failure
or the degraded shape omits the banner, never a false-positive tripped state) without ever writing
anything. The grant-sweep continuation clauses below (what changes about this run's own
`auto:merge`/`auto:merge-pending` grants once the question is answered) are scoped to the
`refine-mode.md` Step 3 caller only — the standalone `--reset-breaker` caller has no grant-sweep
of its own: it asks, writes, logs, and exits, nothing more.

Read this file only when the caller actually reaches this point; nothing else in this skill cites
it.

Before the grant-sweep in Step 3 runs, best-effort read the global merge-lane circuit breaker:

```bash
node -e "
  const { readBreakerState } = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/issues/merge-lane-breaker.js');
  console.log(JSON.stringify(readBreakerState(process.cwd())));
"
```

A read failure here (any error, including the fail-closed `tripped: true` degraded shape
`readBreakerState` returns on a genuine fetch failure) degrades to **"can't confirm reset offer,
skip the question"** — silently proceed to the grant-sweep as if untripped. Unlike
`skills/backlog/grant-mode.md`'s Step 0.5, this sub-stage never originates a machine grant, so it
never needs that file's fail-closed rule: worst case here is simply not offering a reset this run,
never a spurious machine grant slipping through.

When the read succeeds and `tripped: true`, surface exactly one `AskUserQuestion` before the
grant-sweep proceeds:

> Global merge-lane circuit breaker is tripped — {trippedAt}, caused by #{trippedBy.record}:
> {trippedBy.reason}. Reset it?
>
> - **Leave tripped (Recommended)**
> - Reset — I've reviewed the cause

- **Leave tripped (default/no answer treated as this)** — proceed to the grant-sweep unchanged;
  every grant row in this run still recommends `auto:build` normally, but any row that would
  otherwise carry `auto:merge-pending` is applied `auto:build`-only for this run (mirrors
  `evaluateGrantGate`'s own `mergeLaneBreakerTripped` behavior for the headless path — `grant`
  unaffected, `autoMerge` forced off, which per #309 is what suppresses `grant-mode.md` Step 4's
  `auto:merge-pending` grant, not a direct `auto:merge` one) until the breaker is reset in a
  future run.
- **Reset** — this is the **only** write path that ever clears a trip. CAS-write
  `merge-lane/breaker.json` via `writeBreakerState`: `{ tripped: false, resetAt: {now}, resetBy:
  {the invoking human — best-effort `gh api user -q .login`, or "unknown" if unavailable} }`. Log
  one `decisions.md` AUTO entry:

  ```
  AUTO {time} — Backlog refine: merge-lane circuit breaker RESET by {resetBy} (was tripped by #{record}: {reason}).
  ```

  Then proceed to the grant-sweep with the breaker now clear.

When the read succeeds and `tripped: false` (the common case), skip this whole file's procedure
silently — no question, no log line — and proceed straight to Step 3's grant-sweep.
