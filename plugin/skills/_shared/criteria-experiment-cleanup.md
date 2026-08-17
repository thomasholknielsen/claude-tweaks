# Criteria: Experiment Cleanup

Shared, criteria-only fragment — what to flag when judging `focus=experiment-cleanup` candidates from `bin/lib/code-health/candidates-experiment-cleanup.js`. No workflow, no Next Actions. Consumed by `/claude-tweaks:code-health`'s experiment-cleanup judgment lens (`skills/code-health/focus-mode.md`'s Criterion pinning table). One source of truth so every sweep applies identical calibration. Confidence floor: `medium`.

## What the generator hands you

Each candidate is `{ flag, sites, signals, evidence }` — `signals` is an array (the detectors are independent; more than one commonly fires on the same flag) and `evidence` names each. This is a starting pointer, not a finding: judge it holistically, the same as any other criterion.

## What to flag

- A flag with a `registry-terminal-state` signal — its registry entry (or a nearby marker) already declares a terminal state (`always-on`, `always-off`, `expired`, `shipped`, `sunset`, `removed`). The scaffolding is decided; only the removal is outstanding.
- A flag with a `dead-branch` signal — one guarded branch is empty (comment-only or blank). The live branch is the winner; the dead one is debris.
- A flag with a `dated-cleanup-comment` signal — the code itself already carries an author's own dated intent to remove it, past due.
- A flag with an `identical-branches` signal (the guard's two branches are token-identical, whitespace/comment-normalized) — **but only after the mandatory blame-check below.**

## Mandatory blame check — `identical-branches`

Before filing anything on an `identical-branches` signal, run `git log -p --follow -- <anchor file>` (or `git blame` around the guard) and confirm the two branches did not become identical as a merge artifact — an upstream refactor landing in one branch while the other kept the pre-refactor text is exactly the shape IL-87 describes, and it produces the identical signal a genuinely decided flag does. If the history shows the branches converged through an unrelated merge rather than a deliberate "ship the winner" edit, drop the finding — it is not experiment debris, it is merge residue that happens to look like it.

## What NOT to flag

- A flag with zero signals — both branches are substantive and no terminal/dated marker exists anywhere nearby. This is a live, undecided experiment; the generator itself never emits it as a candidate (see the module's own exclusion of zero-signal flags), but if one slips through some other path, do not file it.
- A flag whose identifier matched an exclusion pattern (`experiment-flag-exclude`, default `emergency`/`circuit`/`kill`) — the generator already suppresses these before they reach the judge. **Residual risk, stated once here:** a genuine kill-switch whose name does NOT happen to match any configured exclusion pattern will still read as decided if it carries a `dead-branch` or `identical-branches` signal — an operational escape hatch that is rarely exercised looks, structurally, exactly like abandoned scaffolding. When a candidate's surrounding code, comments, or commit history suggest an operational safety valve rather than an experiment (rollback switch, incident mitigation, admin override), treat that as strong evidence against filing even when a signal fired — this is a judgment call the generator cannot make, by design.
- A flag mid-rollout with a percentage/cohort-based gate and no terminal marker — partial rollout is not a decision.

## Severity calibration

- **high** — the decided flag's dead branch (or the whole guard, for a `registry-terminal-state` candidate) still executes on a hot/user-facing path, and removal is safe and mechanical (single call site, no external readers of the flag value).
- **medium** — decided but the removal touches multiple call sites, or the dead branch sits in a rarely-executed path.
- **low** — decided, single occurrence, cosmetic-only scaffolding (a comment, a stale config entry with no behavioral effect).

## What this vertical never does

Findings from this criterion always propose a record for the supervised/granted build pipeline (`/claude-tweaks:specify` → `/claude-tweaks:build`) — never a direct removal, and never a suggestion to flip the flag or touch the flag service. The generator judges from code alone; reading actual rollout state from a flag-service API is a later widening, not this vertical's job.
