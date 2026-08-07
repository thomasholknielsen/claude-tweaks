# Earned Autonomy Tier — Design

**Date:** 2026-08-07
**Status:** Design approved, plans pending
**Scope:** Four phases. This document specifies Phase 1 in full and Phases 2–4 at architecture level. Each phase gets its own implementation plan.

## Problem

Two symptoms, reported together:

1. Many small tasks and gaps remain after `/claude-tweaks:wrap-up` completes.
2. Built work often needs evaluation — an actual demo — to know whether it solved the real problem, and that evaluation is not happening.

## Measured state

All figures verified against this repo on 2026-08-07. The queue moves continuously — `#141` closed
mid-authoring — so treat these as a dated snapshot, not invariants.

| Measurement | Value |
|---|---|
| Records created in the last 30 days | 153 (112 already closed, 41 still open) |
| Total open records | 41 |
| Open records carrying `auto:build` | 9 — an exact match for the `ready` set |
| Records that ever carried `demo:pending` | 11 — all closed, **none since 2026-07-23** |
| Records ever resolved through `/claude-tweaks:demo` | **0** |
| `demo:approved` / `demo:changes-requested` labels in the repo | **do not exist** |
| Recently-closed records carrying a `## Verification Brief` comment | 0 of 10 sampled (`#119`–`#144`) |
| `by:*` provenance labels in existence | 1 — `by:capture` (27 uses) |
| `ceremony:*` coverage | 6 `fast-lane`, 22 `standard`, out of ~190 records |
| `bin/lib/issues/metrics.js` | does not exist — `#22` was closed `COMPLETED` by an empty `Fixes #22` commit (`1d5e7e2`) and still carries `demo:pending` |

A minority of the open records are the deliberate `Impeccable`/`upstream-drift`/`design-wrapper`
feature series. The majority are byproduct — findings the agent surfaced while doing something else
and filed rather than fixed (`#114` stale doc citations across seven paths, `#116` polish deferred
from `#78`, `#136` an over-long CLAUDE.md bullet, `#148` a vocabulary sweep). The split is
approximate and shifts daily; what matters is the direction, not the ratio.

## Diagnosis

### The residue engine

`_shared/auto-mode-contract.md` places *"code modifications outside the skill's documented scope"*
in **What `auto` does NOT silence**, while `_shared/unattended-tier.md` carves record **creation**
out of the never-reversible list. The result is an asymmetry: for an agent that spots a small
adjacent gap, filing is free and fixing requires a human. The system is structurally biased toward
producing records.

### The ceremony chokepoint

`_shared/work-record.md`'s permission matrix forbids `/wrap-up`, `/capture`, and `/reflect` from
applying `ready` or `auto:*`. Only the four health skills may file born-ready. So a byproduct record
lands in `backlog` and, to become dispatchable, must pass `/specify` (→ `ready`) and then
`/backlog refine` (→ `auto:build`), whose write mode explicitly forbids *"granting on a headless
path"*. Nobody runs a full `/specify` ceremony on "one CLAUDE.md bullet is 214 words."

### Two lanes, one instrumented — the root cause

`/wrap-up`'s acceptance labeling (Step 10, `wrap-up/verification-brief.md`) is gated on **record
mode**: a materialized run header must exist. Records such as `#144`, `#139`, `#132`, and `#130`
carry only a `bug` label, were created and closed the same day, and were fixed ad hoc in a session
then closed by a `Fixes #N` commit. They never materialized a header, so Step 10 never ran.

```
HEAVY LANE  (~10 records)   capture → specify → refine → dispatch → flow → wrap-up → demo
                                                                              ↑ instrumented

LIGHT LANE  (~140 records)  issue filed → fixed ad hoc in session → "Fixes #N" commit → closed
                                                                              ↑ no signal at all
```

The residue problem and the acceptance problem share this root cause. The ceremony pipeline is too
heavy for the work that dominates, so that work routes around it — and routing around it emits no
outcome signal. **A trust system reading only the heavy lane would learn from a small fraction of
the work.**

### The heavy lane leaks too

`#141` closed at 2026-08-07T06:04Z, during the authoring of this document. It carried `auto:build`
and `auto:merge`, went through the full heavy lane, and closed with **no `demo:pending` and no
Verification Brief** — despite `_shared/work-record.md` stating that an `auto:merge`'d record still
gets `demo:pending` on its now-closed issue, *"enabling retrospective"* sign-off.

So the acceptance disposition is dropped on at least two distinct paths: light-lane keyword closes
(no record mode) and heavy-lane auto-merge closes (record mode, but the label never lands). Phase 1
must cover both, and Phase 1's plan should begin by determining whether the auto-merge case is a
missing call site or a live defect in an existing one — they need different fixes.

### Thesis

Do not push more work into the heavy lane. Accept that the light lane is the main lane and make it
emit the same signal.

## Architecture

### Record-as-ledger

The record is the store.

- `/claude-tweaks:demo` writes a verdict label (`demo:approved` / `demo:changes-requested`) plus one
  structured evidence block as a record comment.
- Provenance is a `by:*` label stamped at file time.
- The trust table is **derived on demand** from closed records and cached disposably under
  `.claude-tweaks/`.
- Survival signal comes from a sweep over recently-closed records, folded into
  `/claude-tweaks:tidy`'s existing `--scope=github` rolling digest.

**Rejected — outcome branch.** An append-only `outcomes.jsonl` on a `health-state`-style branch
gives richer schema and cheap reads, but creates a second source of truth about a record and
inherits cross-session write contention. Parallel worktree sessions are the norm in this repo, and
an append-only file on a shared branch is precisely the colliding shape.

**Rejected — run-dir native.** Run dirs already carry `decisions.md` and `events.jsonl`, so this
adds no state. But run dirs are per-*run* and get archived, while the survival signal must inspect a
record 7–14 days after close. Attribution breaks exactly where the signal matters.

### Policy sets the ceiling; evidence sets the level

A static policy lever and earned trust pull against each other unless the lever caps rather than
sets:

> `autonomy: supervised | trusted | unattended` caps what earned trust is *allowed* to unlock.
> Evidence moves the level; policy caps it. A class that has proven itself still cannot exceed the
> configured ceiling, and lowering the ceiling revokes immediately without destroying history.

| Ceiling | Unlocks — only for classes that have earned it |
|---|---|
| `supervised` | Current behavior. Trust is recorded and displayed but never acted on. |
| `trusted` | Born-`ready` for agent-filed residue (skips `/specify`); in-run initiative budget so trivia is fixed rather than filed; batched grant console. |
| `unattended` | Born-authorized (`ready + auto:build`, `+ auto:merge` where the class allows); finalization drain runs headless on cadence; verdict required only for unproven classes and `merge-sensitive-paths`. |

This replaces scattered per-lever tuning with one dial that means something. It does not remove the
existing levers — it constrains them.

### Trust unit: provenance × risk band

Trust is attributed to `(by:{source}, risk-band)` — roughly 12–16 cells at ~10 samples per cell per
month. Thin, so the controller uses a conservative prior and requires a minimum sample count before
a cell may move off `supervised` behavior.

Provenance was chosen over change-shape (needs a new classifier, and mispredicting is exactly the
harmful case), over ceremony × facets (learns whether `ceremony-check` is calibrated — a proxy, not
the thing), and over a single global level (converges fastest but lets trust earned on 40 clean doc
sweeps authorize the first logic change).

### Bootstrap: backfill the prior

Starting every cell at zero puts human cost at maximum on day one — exactly when the practice gets
abandoned, which is what already happened to `demo:pending`. Instead, seed priors from the 109
records closed in the last 30 days: provenance inferred heuristically from record bodies and
authorship, survival computed directly (reverted? follow-up record filed against the same paths?
tests broken after?). `supervised` mode then has something real to show on its first run.

## Phase 1 — Instrument the light lane

Pure telemetry. No behavior changes, nothing is trusted yet. Everything downstream reads this.

### 1.1 Provenance stamping

Add `by:{source}` at every record-creation site — `/capture`, `/wrap-up` leftover routing,
`/reflect` tangential-idea routing, `/review` findings, and the four health skills (whose
`by:{self}` is already specified in `_shared/work-record.md` but emits no label in practice).
Bootstrap the labels through the existing `_shared/label-bootstrap.md` check-then-create loop.

### 1.2 Attribution — derived from git, not breadcrumbed

*Revised during planning. The original design proposed extending
`bin/lib/hooks/post-tool-use.js`'s closing-keyword check to emit an outcome breadcrumb. Planning
found this both unnecessary and hazardous, and it is dropped.*

Unnecessary: **the closing commit is already the durable record.** Every light-lane close leaves a
`Fixes #N` / `closes #N` commit in git history, so `git log --grep` recovers the full
record → commit → touched-paths mapping after the fact. A breadcrumb would duplicate data git
already holds.

Hazardous: the check the breadcrumb would feed needs to know whether a record *currently* carries a
disposition, which is a network read. Hooks must stay fast and local, so the check cannot live
there — and a breadcrumb with no local consumer is pure cost. Writing one would also mean inventing
a durable store for commits that resolve no run dir, which is exactly the cross-session collision
shape `[IL-96]` warns about.

**Consequence:** Phase 1 requires no hook change at all. Attribution is derived by the Phase 1.3
sweep from git history.

### 1.3 Acceptance disposition on every closing path

Two paths currently drop it:

- **Light-lane keyword close** — `/wrap-up` never ran in record mode, so Step 10 never fired.
- **Heavy-lane auto-merge close** — record mode did run, but the label never landed (`#141`).

Every closed record must reach an explicit disposition on either path: `demo:pending` with a brief
composed from the commit and diff, or an explicit "no acceptance needed" classification. Silence
stops being a valid outcome.

### 1.4 Non-UI verification path (`#135`)

`wrap-up/verification-brief.md` Step 2 classifies documentation, configuration, and harness skill
files as having **no interactive verification surface** — which is nearly this entire repo. Without
a manual-verification path the sensor is blind by default on its own project. `#135` records this
gap; it is a Phase 1 dependency, not a separate nicety.

### 1.5 The missing labels are a symptom, not a defect

*Revised during planning.* `demo:approved` and `demo:changes-requested` are already defined in
`_shared/label-bootstrap.md`'s canonical taxonomy, and `/claude-tweaks:demo` Step 3 already
bootstraps both via the check-then-create loop before its first swap. Their absence from this repo
is therefore **evidence that `/demo` has never run**, not a gap to fix. No work is required here;
the row remains only so the measured-state finding is not mistaken for a defect later.

### Phase 1 exit criteria

Every closed record carries a provenance label and an explicit acceptance disposition. No trust is
computed and no behavior changes.

## Phase 2 — The memory

- Trust table `(provenance × risk band)` derived on demand from closed records; cached disposably
  under `.claude-tweaks/`, regenerable, never authoritative.
- Survival sweep folded into `/claude-tweaks:tidy --scope=github`'s existing rolling digest.
- Backfill priors from the 109 recently-closed records.
- `autonomy: supervised` ships here. Trust is computed and **displayed** — in `/claude-tweaks:help`'s
  dashboard and `/claude-tweaks:backlog overview` — and never acted on. The operator watches the
  table be right before anything reads it.

## Phase 3 — The governor

- The `autonomy` ceiling lever, resolved through `_shared/auto-mode-contract.md`'s existing
  precedence order (CLI arg > `config.yml` > project policy > skill default).
- Amend `_shared/work-record.md`'s permission matrix: born-`ready` for agent-filed residue at
  `trusted`; born-authorized at `unattended`, gated on both class trust and ceiling.
- Amend the auto-mode contract's never-reversible list to cover the grant. Record creation already
  has this carve-out shape via `unattended-tier`, which is the precedent to follow.
- Trust-driven batched grant console in `/claude-tweaks:backlog refine`.

First phase that changes behavior.

## Phase 4 — Actuator and throughput

- **In-run initiative budget.** N fixes per run, capped lines and files, same-subsystem only, each
  logged to `decisions.md` and surfaced at the Review Console. Amends the contract's *"code
  modifications outside the skill's documented scope"* row.
- **Finalization drain.** The piece that makes "a session finalized efficiently" true.
  `/claude-tweaks:dispatch` documents *why no drain mode* — a session babysitting N pipeline runs
  accumulates context until it rots. Any drain here must respect that reasoning rather than
  contradict it.
- **Verdict-only-where-it-matters routing** in `/claude-tweaks:demo`: human verdict required only
  for classes that have not earned trust, records touching `merge-sensitive-paths`, or
  inconclusive self-verification.

### Known risk

The initiative budget is the only piece with no precedent in this codebase, and it pollutes a run's
diff — `/claude-tweaks:review` gets handed changes it was not asked to review. Mitigation: write
initiative fixes to a **separate commit with its own trailer** so the diff stays separable and
review scope stays legible.

## Non-goals

- Replacing the existing policy levers. The `autonomy` ceiling constrains them; it does not absorb
  them.
- Automating merge-conflict resolution, HARD-GATEs, or anything on the auto-mode contract's
  never-reversible list beyond the single grant carve-out in Phase 3.
- A general-purpose risk service. `/claude-tweaks:assess-agent-autonomy` remains scoped to its four
  documented call sites.

## Open questions

1. Minimum sample count before a trust cell may move off `supervised` behavior — needs a decision,
   defaulting conservative.
2. Whether the survival window is 7 or 14 days, and whether a follow-up record against the same
   paths is a strong enough negative signal on its own.
3. Whether the finalization drain is a `/claude-tweaks:wrap-up` mode or a new skill.
