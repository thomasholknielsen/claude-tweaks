# Run Resume Freshness Probe — Shared

A hard precondition before any of the three resume paths below rules a run safe to re-enter.
Read by `wrap-up/SKILL.md`'s `resume` command, `dispatch/SKILL.md`'s "Resuming a parked run"
section, and `flow/steps-and-gates.md`'s "Adopting an inherited run directory" case 1.

## What `status: interrupted` means — and does not mean

`run-state.json`'s `status: interrupted` stamp (`bin/lib/hooks/session-end.js`) is a statement
about **one past session**: the session that owned this run ended (crashed, closed, or timed
out) while the run was still non-`clean`. It is explicitly **not** a statement that no session
owns this run *now* — a different session can be actively committing to the same worktree at the
exact moment a resume path reads the stamp and rules it safe. On 2026-08-16, run
2026-08-16T174412 read `interrupted` while a live sibling session was actively committing to its
shared worktree; the misjudgment was caught only by an incidental glance at fresh commit
timestamps, not by any gate (#676).

**This stamp never fires on a normal Task-tool subagent turn end** — only on a real `SessionEnd`
(`bin/lib/hooks/session-end.js`; a `SubagentStop` never touches `run-state.json`). This is why
`/claude-tweaks:dispatch`'s two-call handoff (`build,test` then `review,polish,wrap-up` against
the same `PIPELINE_RUN_DIR`, likely under two different `CLAUDE_CODE_SESSION_ID`s) never trips
this probe: between the two calls the top-level dispatching session never ends, so `status` stays
`active` throughout, and the probe below short-circuits to safe on its very first status check.

## The probe

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" check-resume-freshness --run "{run-dir}"
```

Read-only — never writes `run-state.json`. Reads `run-state.json`'s `status`, `sessionId`, and
`worktree` fields and checks, in order:

1. **Own session** — `sessionId` already matches this call's own `CLAUDE_CODE_SESSION_ID`. Safe
   unconditionally (a session restart re-stamps ownership via `record-worktree`; this probe must
   never block a run's own continuing session from itself).
2. **Not `interrupted`** — any other status (`active`, `clean`, missing) is out of scope for this
   probe; safe.
3. **No recorded worktree, or the recorded worktree no longer exists on disk** — nothing to
   probe; safe.
4. **Worktree lock-file pid liveness** — `bin/lib/hooks/worktree-reap.js`'s `isWorktreeLocked`.
   A live pid holding the worktree lock blocks — "run appears actively owned".
5. **Last-commit age** — `git -C {worktree} log -1 --format=%ct`, compared against a 10-minute
   threshold ("on the order of minutes" — long enough that one working session's normal commit
   cadence doesn't read as a stranger, short enough that a genuinely dead run isn't gated for an
   unreasonable stretch; see `bin/lib/hooks/resume-freshness.js`'s own header comment for the
   full rationale). A commit inside the threshold blocks.
6. Otherwise: safe (`stale`) — the run is genuinely quiet.

An unresolvable git call at step 5 (while status is genuinely `interrupted`) fails **closed** —
blocked, not safe-by-default.

## Branching on the result

The command writes exactly one line to stdout, and always exits `0`:

- Safe: `claude-tweaks: resume freshness OK for {run-id} ({verdict})` — proceed with the resume
  exactly as before this probe existed.
- Blocked: `claude-tweaks: resume freshness BLOCKED for {run-id} — run appears actively owned
  ({reason})` — **do not proceed.** Report the line verbatim instead of the resume's normal
  outcome, and stop; do not fall through to conversation-based work.

**On a safe verdict that came from a genuinely `interrupted` state** (i.e. `verdict` is
`'locked'`/`'recent-commit'`/`'indeterminate'` never returned, and the run *was* `interrupted`
before this check — every safe verdict other than `not-interrupted`/`own-session` implies this):
immediately reclaim ownership so the stale stamp does not linger and a later re-entry within the
same session is not re-probed for no reason:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" record-worktree --run "{run-dir}" "{worktree-path}"
```

This is the same idempotent restamp `build/worktree-setup.md` already documents for "a different
session later continues this pipeline" — it flips `status` back to `active` under the current
session's identity, which is also what makes the "Own session" fast path above correct for any
further probing inside the same now-resumed run.

## What this does not gate

- **The claim blob's TTL** (`_shared/issue-claims.md`, 72h) is untouched — it governs re-claiming
  a *record* against a competing dispatcher, a different concern with its own staleness rules,
  not resuming a *run*.
- **A run whose status is not `interrupted`** — including a dispatch-parked `pending-review` run
  before its orchestrating session has ended. Nothing needs gating there; see the "does not fire
  on a normal Task-tool subagent turn end" note above.
