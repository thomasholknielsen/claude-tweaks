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
- Provenance is **read, not stamped**. *(Revised before Phase 1B — see 1.1.)* The original text
  said "a `by:*` label stamped at file time," which describes only the machine-producer case. A
  side-effect record records provenance as an `Origin: {context}` body line and a human-filed one
  by absence; both are deliberate, and neither ever grows a label.
- The trust table is **derived on demand** from closed records, and **nothing is cached**.
  *(Revised at Phase 2.)* The original text called for a disposable cache under
  `.claude-tweaks/`; Phase 2 shipped without one, on the same reasoning that dissolved the
  backfill step below — a computation that already reads the full history window has nothing for
  a cache to save it.
- Survival signal comes from a sweep over recently-closed records, folded into
  `/claude-tweaks:tidy`'s existing `--scope=github` rolling digest. **Phase 3, not Phase 2** — see
  the Phase 2 section.

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

Trust is attributed to `(provenance, risk-band)`, where provenance is 1.1's resolved
`kind:source` pair and **not** the `by:*` label alone — keying on the label would give every
side-effect and human-filed record the same empty key. Roughly 12–16 cells at ~10 samples per
cell per month. Thin, so the controller uses a conservative prior and requires a minimum sample
count before a cell may move off `supervised` behavior.

Provenance was chosen over change-shape (needs a new classifier, and mispredicting is exactly the
harmful case), over ceremony × facets (learns whether `ceremony-check` is calibrated — a proxy, not
the thing), and over a single global level (converges fastest but lets trust earned on 40 clean doc
sweeps authorize the first logic change).

### Bootstrap: backfill the prior — dissolved

*(Revised before Phase 2. Kept so the concern is not re-raised as a gap.)* The worry was real:
starting every cell at zero puts human cost at maximum on day one — exactly when the practice gets
abandoned, which is what already happened to `demo:pending`. The original answer was a seeding
step over the records closed in the last 30 days.

No seeding step exists, and none is needed. Because the table derives on demand from closed
records rather than accumulating incrementally, every computation already reads the full history
window: the first run is as populated as the hundredth. The storage decision dissolved the
problem rather than a migration solving it — see Phase 2's own bullet.

## Phase 1 — Instrument the light lane

Pure telemetry. No behavior changes, nothing is trusted yet. Everything downstream reads this.

### 1.1 Provenance is already recorded — build a reader, not a writer

*Revised before Phase 1B. The original text called for adding `by:{source}` at every
record-creation site, on the premise that `_shared/work-record.md` specified the labels but
nothing emitted them. That premise was wrong.*

Provenance is fully implemented and deliberate. `bin/lib/issues/record.js` defines
`ORIGINS = ['code-health', 'harness-health', 'journey-health', 'docs-health', 'capture',
'dispatch']`, and `recordPayload({origin})` emits `by:{origin}`. All four health skills stamp it
through their `issue-payload.js` modules; `/capture` and `/dispatch` stamp their own.

`_shared/work-record.md`'s Origin axis defines **three** states, not one:

| State | How it is recorded | Examples |
|---|---|---|
| Machine producer | `by:*` label (the six in `ORIGINS`) | health sweeps, `/capture`, `/dispatch` |
| Side-effect of another skill | `Origin: {context}` **body line**, deliberately no label | `Origin: wrap-up leftover from #42`, `Origin: ledger resolve gate`, `Origin: demo changes-requested from #17`, `Origin: /init skill scoring (Phase 4)` |
| Human-filed | neither — **absence is the signal** | a record opened directly on GitHub |

Only `by:capture` exists as a label in this repo because the health sweeps have not filed here,
not because emission is missing.

**Consequence:** Phase 1B writes no new labels and changes no filing site. It adds a
**provenance resolver** (`bin/lib/issues/provenance.js`) that maps a record (labels + body) to one
of the three states, so the trust table has a key. Changing the taxonomy would mean overriding a
documented decision for no gain, since all three states are already distinguishable.

**The resolver emits four `kind` values, not three.** Alongside `producer` / `side-effect` /
`human`, it emits `unstructured` for an `Origin:` line it cannot reduce to a class — text still
over its length cap after normalization (`source: 'unstructured'`), or text that normalizes to
nothing (`source: 'empty-origin'`). That fourth value is a classifier artifact, not a taxonomy
state: `_shared/work-record.md`'s Origin axis still defines exactly three. **A later phase
switching over three kinds drops `unstructured` on the floor**, and it is not a rare bucket —
every unrecognized `Origin:` shape lands there. `trust.js` pins any `unstructured` cell's verdict
to `insufficient-evidence` at every sample count for exactly this reason: a bucket defined by
"could not be classified" has no coherent class to grant autonomy to. Any consumer must handle
the fourth value explicitly and must never grade it.

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

*(Revised — the original read "Every closed record carries a provenance label and an explicit
acceptance disposition," which 1.1's own revision made unreachable fifty lines above. Phase 1B
writes no labels and changes no filing site, so a side-effect record never grows one and a
human-filed record's provenance **is** the absence of one. The criterion was never met and by
design cannot be; on this repo most closed records resolve to `human:human` precisely that way.)*

Every closed record **resolves** to a provenance state — including by absence, which is a real
resolution and not a gap — and reaches an explicit acceptance disposition. No trust is computed
and no behavior changes.

The acceptance half is the only half that requires work: it is 1.3's job, and it is the half that
is genuinely unmet today. Provenance needs a reader, not a backfill.

## Phase 2 — The memory

- Trust table `(provenance × risk band)` derived on demand from closed records, **with no cache**.
  *(Revised at Phase 2.)* The original text called for a disposable cache under `.claude-tweaks/`;
  what shipped writes nothing durable at all — each render is one `gh issue list --state all` call
  piped straight through `bin/lib/issues/trust.js`. Bullet 3 below already reasons from this
  no-cache decision. Nothing regenerates, because nothing was generated.
- ~~Survival sweep folded into `/claude-tweaks:tidy --scope=github`'s existing rolling digest.~~
  **Moved to Phase 3.** Phase 2's plan puts git-derived survival signals (revert detection,
  path-overlap follow-ups) out of scope: every signal it does ship comes from the one `gh` call
  above, and a git walk is a later slice. If it turns out to be needed it is a Phase 3 input, not
  a Phase 2 gap.
- Backfill is **not a separate feature**. *(Revised before Phase 2.)* Because the architecture
  derives the table on demand from closed records rather than accumulating it incrementally,
  every computation already reads the full history window. There is nothing to seed — the first
  run is as populated as the hundredth. The bootstrap problem the original design worried about
  is dissolved by the storage decision, not solved by a migration step.
- `autonomy: supervised` ships here. Trust is computed and **displayed** — in `/claude-tweaks:help`'s
  dashboard and `/claude-tweaks:backlog overview` — and never acted on. The operator watches the
  table be right before anything reads it.

## Phase 3 — The governor

- The `autonomy` ceiling lever, resolved through `_shared/auto-mode-contract.md`'s existing
  precedence order (CLI arg > `config.yml` > project policy > skill default). Shipped as
  `bin/lib/issues/autonomy.js`'s `resolveCeiling`, with `_shared/autonomy-ceiling.md` as the
  contract every consumer cites rather than restates.
- **A verdict floor, added at Phase 3 and not in the original design.** Phase 2's rule graded a
  cell on `total >= MIN_SAMPLES` plus a *single* disposition, which is sound for a display and
  unsound the moment a machine reads it: measured on this repo, one `demo:approved` on a
  40-record cell produced `verdict: 'clean'`. Phase 3 floors on `dispositioned >= MIN_VERDICTS`
  (5) instead, and drops `notPlanned` from the clean test — a declined record has no work
  product to judge, and with no time window in the table it was pinning two of the four real
  cells to `mixed` permanently. This is open question 1, answered.
- Amend `_shared/work-record.md`'s permission matrix: born-`ready` for agent-filed residue at
  `trusted`; born-authorized at `unattended`, gated on both class trust and ceiling. *(Revised at
  Phase 3.)* The two turned out to differ in kind rather than degree — `ready` asserts shape and
  leaves the human gate standing, while `auto:build` **is** the authorization and originating one
  from machinery contradicts a standing invariant that has a live eval asserting it. So
  born-authorized ships **defined but shut**, behind a second explicit opt-in that nothing sets;
  reaching the top tier is not by itself an amendment of that invariant.
- Amend the auto-mode contract's never-reversible list to cover the grant. Record creation already
  has this carve-out shape via `unattended-tier`, which is the precedent to follow.
- Trust-driven batched grant console in `/claude-tweaks:backlog refine`. *(Revised at Phase 3.)*
  No new console was built — `refine` Step 3 already has one, with a `grant-check` pass and a
  single batch confirm. Trust rides in as an advisory `Trust` column beside the existing
  recommendation and never drives it: the class's history is not evidence about this record's
  shape. The ceiling's only behavioral effect inside that skill is which records arrive
  born-`ready` at all.
- Survival sweep, **if** the Phase 2 signals prove too thin to grant on. *(Revised at Phase 3 —
  still deferred.)* They cannot be shown too thin yet: no cell has any dispositioned evidence at
  all, so there is nothing to judge the question against.
- Handle the resolver's fourth `kind`. `unstructured` is not a taxonomy state and must never be
  graded (see 1.1) — a consumer switching over three kinds silently drops it. *(Revised at Phase
  3.)* Shipped as an **allowlist** of the three gradable kinds, not a denylist naming
  `unstructured`. A denylist inverts this hazard rather than fixing it — it granted to any kind it
  had not been taught, including a case-variant `'PRODUCER'` and an empty string, both verified
  reachable before the allowlist landed.

First phase that changes behavior — though on this repo it changes none yet, because every cell
still reads `insufficient-evidence`. The mechanism ships ahead of the evidence deliberately: the
ceiling has to exist before anything can exceed it.

## Phase 4 — Actuator and throughput

*Reordered and rescoped at Phase 4, against measurement. The original three bullets assumed the
acceptance evidence would exist by now. It does not, and the reason is not the one this document
predicted — see "Measured at Phase 4" below. The drain moved from a throughput nicety to the
sensor fix itself, the routing bullet is deferred, and the phase splits across two releases.*

### Measured at Phase 4

Against this repo at `main` = `012e27d5`, plugin v6.57.0 — and, unlike the Phase 3 investigation,
the **installed** build is also 6.57.0, so nothing here is explained by a stale producer.

| Measurement | Value |
|---|---|
| Closed records / provenance classes | 129 / 10 |
| `demo:approved` + `demo:changes-requested` across every class | **0** |
| Coverage in every cell | **0%** — every verdict `insufficient-evidence` |
| `demo:pending` ever applied | 11, all on `#13`–`#49`; highest closed record is `#164` |
| Records closed after v6.50.0 landed (09:15:47Z) carrying any `demo:*` | **0 of 14** — nine of them heavy-lane `auto:build` |
| Verification Brief comments on `#148`, `#153`, `#151`, `#150` | 0 |

**The nine heavy-lane records did not close the way this document assumed.** `gh api .../timeline`
reports `commit: null` with `stateReason: COMPLETED` — a direct API close, neither a commit-keyword
close nor a merge close. They also still carry `auto:build`, so wrap-up cleanup Section E's grant
removal never ran for them either. `_shared/issue-claims.md`'s Close-via-merge section states the
agent never runs `gh issue close` and that direct closes surface only for wontfix/duplicate, run by
the user. So these closed **outside the documented mechanism entirely** — a third path, alongside
the light-lane keyword close and the heavy-lane auto-merge this document already named.

### Two gaps, not one

**Gap A — a live defect.** Acceptance labeling is `/wrap-up` Step 10 (`verification-brief.md`,
`execution-and-verification.md`), and **both auto-merge short-circuits bypass Step 10**:
`wrap-up/review-console.md`'s single-record fast-lane short-circuit and
`dispatch/settle-and-merge.md`'s group Auto-merge gate. Each closes with a completeness claim —
*"Nothing this console would have shown is discarded"* and *"nothing wrap-up found is dropped"* —
and both are **true about console content and silent about Step 10's acceptance labeling**, which
is neither console content nor one of `cleanup-procedures.md`'s eight cleanup items. The console's
own completeness rule covers "every cleanup action that would otherwise run in Step 10," which
acceptance labeling also is not. The label falls through the gap between three individually-true
statements — the `[IL-02]` / `[IL-93]` shape, where prose stays true while going incomplete.

This is `#141`, still live. It is **not** what produced the nine records above; they never
auto-merged. Fixing it is necessary and not sufficient.

**Gap B — practice, not code.** The dominant close path emits no disposition, and v6.50.0's answer
to that was deliberately *detection plus human-run remediation*, not automatic labeling:
`/claude-tweaks:tidy --scope=github`'s `acceptance-gap` scope finds closed records carrying no
`demo:*` (findings `info`, always staged, never auto-applied), and `/claude-tweaks:demo #N`
reconstructs a brief from the closing commit. That path is **close-mechanism-agnostic** — it
already catches the manual closes. It has simply never been run.

No code change fixes Gap B. What fixes it is making the remediation cheap enough to actually
happen — **which is this phase's finalization drain.** The drain and the sensor fix are the same
work. That is the substantive correction to this document's original Phase 4.

### Scope, in two releases

**Release 1 — the sensor.**

- **4A. Close the auto-merge labeling gap.** Both short-circuits apply `demo:pending` and post the
  Verification Brief before merging, while the record is still open. Correct both completeness
  claims — the prose is what made the gap invisible, so leaving it intact reproduces the defect at
  the next widening.
- **4B. Stop the flow, then decide about the stock.** *(Rewritten mid-Phase-4. The first draft of
  this bullet said the drain was "obviously" a `/claude-tweaks:demo` mode. That was asserted
  without reading `/demo`, and `/demo` says the opposite — see "Why the drain does not exist as
  designed" below. `[IL-24]`, caught before the plan was written but after the claim was in this
  document.)*

  Split Gap B's population, because the two halves need opposite treatments:

  - **Flow** — records closing *from now on*. 4A plugs the auto-merge leak. The manual and
    keyword closes that actually dominate need a disposition path of their own, since no
    `/wrap-up` step runs for them at all.
  - **Stock** — the 129 already-closed records carrying no disposition. A human verdict on a
    record closed weeks ago, reconstructed from its closing commit, is mostly theater: it
    produces a `clean` label that the trust table then reads as real evidence. Draining the
    stock by approving it is the batch-rubber-stamp risk in its purest form. The honest options
    are to mark the stock explicitly unassessable and start the evidence window from now, or to
    leave it undispositioned and let `MIN_VERDICTS` be reached by new work only. Either way it
    is a **one-time decision about the prior**, not a throughput feature — the same shape as the
    backfill question Phase 2 dissolved, returning in a different place.

#### Why the drain does not exist as designed

`/claude-tweaks:demo` refuses batching deliberately and says so in five places: the H1 paragraph
("resolves one item per invocation — it never discovers or lists what's outstanding"), When to Use,
the Not-for line, `## Input` ("Never sweeps the backlog"), and an explicit Anti-Pattern row
("Sweeping the `demo:pending` backlog from within this skill — Discovery is `/claude-tweaks:help`'s
job"). Its Component-Skill Contract additionally makes it **standalone-only**: *"it is never invoked
by a parent skill in the workflow."*

So both available shapes are closed by design, not by oversight — a `/demo` sweep mode contradicts
the Anti-Pattern, and an orchestrator looping `/demo` per record contradicts the standalone-only
contract. Discovery already exists twice (`/help` Stage 4.7, `/tidy --scope=github`'s
`acceptance-gap`); resolution is deliberately one-at-a-time and human.

**That invariant is correct, and this document's own Known-risk section is why.** The acceptance
verdict is the single signal the entire trust system reads. A drain that makes approving forty
records one keystroke manufactures exactly the evidence that must not exist: `clean` verdicts
earned by clicking, which then authorize real autonomy. The bottleneck is not navigation, and
making navigation cheap would not fix it.

**Consequence:** "finalization drain" as a batch-approval mechanism is **withdrawn**, not deferred.
What survives of the original bullet is the throughput concern it was reaching for — which 4A
(stop the leak) and the flow/stock split above address without ever batching a verdict.

**Release 2 — the actuator.**

- **4C. In-run initiative budget.** N fixes per run, capped lines and files, same-subsystem only,
  each logged to `decisions.md` and surfaced at the Review Console. Amends the contract's *"code
  modifications outside the skill's documented scope"* row. Unaffected by the measurement above: it
  is gated on the **ceiling**, a human-set dial, not on trust evidence, so it works on day one.

**Deferred — verdict-only-where-it-matters routing** in `/claude-tweaks:demo` (human verdict
required only for unproven classes, `merge-sensitive-paths`, or inconclusive self-verification).
It is inert by construction: no class has earned trust, and none can until `/demo` runs — the very
gate the routing exists to relax. Phase 3 shipped its ceiling ahead of the evidence on an ordering
argument (the ceiling must exist before anything can exceed it); this bullet has no such argument,
and shipping a second relaxation on top of an empty table compounds Phase 3's inertness rather than
correcting it. **Trigger, stated rather than left open:** revisit when any cell first reaches
`MIN_VERDICTS` — the same shape open question 2 was deferred with at Phase 3.

### Known risk

The initiative budget is the only piece with no precedent in this codebase, and it pollutes a run's
diff — `/claude-tweaks:review` gets handed changes it was not asked to review. Mitigation: write
initiative fixes to a **separate commit with its own trailer** so the diff stays separable and
review scope stays legible.

A second risk, new at Phase 4 and specific to the drain: a batch disposition path is a batch
**rubber-stamp** path. The acceptance verdict is the one signal the whole trust system reads, and a
drain that makes approving forty records one keystroke produces evidence that means nothing —
`clean` verdicts earned by a human clicking through, which then authorize real autonomy. Whatever
4B's batching looks like, approving must stay per-record work; only the *navigation* between
records is what the drain is allowed to make cheap.

## Non-goals

- Replacing the existing policy levers. The `autonomy` ceiling constrains them; it does not absorb
  them.
- Automating merge-conflict resolution, HARD-GATEs, or anything on the auto-mode contract's
  never-reversible list beyond the single grant carve-out in Phase 3.
- A general-purpose risk service. `/claude-tweaks:assess-agent-autonomy` remains scoped to its four
  documented call sites.

## Open questions

1. ~~Minimum sample count before a trust cell may move off `supervised` behavior.~~ **Answered at
   Phase 3.** Two floors, not one: `MIN_SAMPLES` (8) on the cell's size, and `MIN_VERDICTS` (5) on
   the acceptance verdicts inside it. The second is the one that matters — the original single
   floor counted *records*, which let one approval grade a 40-record class. Five is the smallest
   run that is not an anecdote and, at roughly ten closed records per class per month, is
   reachable in weeks; an unreachable floor would make the table decorative, which is the failure
   mode that already killed `demo:pending`.
2. Whether the survival window is 7 or 14 days, and whether a follow-up record against the same
   paths is a strong enough negative signal on its own. **Reframed at Phase 3.** The table has no
   window at all, which makes `changesRequested` and `followUps` permanent: a class that earns one
   rejection is `mixed` from then on, with no path back. That is the conservative direction and
   currently costs nothing — both counts are zero everywhere — so it ships as a **recorded
   limitation with a stated trigger** rather than an open choice: revisit when any cell first
   reads `mixed`, which is when the limitation stops being theoretical. See
   `_shared/trust-table.md`'s "Known limitation: no time window".
3. ~~Whether the finalization drain is a `/claude-tweaks:wrap-up` mode or a new skill.~~
   **Dissolved at Phase 4 — the question had no correct answer because its subject should not
   exist.** Both branches presuppose a batch-approval mechanism. `/claude-tweaks:demo` forbids
   batching in five separate places and is declared standalone-only, so a `/demo` mode and an
   orchestrator looping `/demo` are both closed by design; and the invariant is right, because
   batching the one signal the trust system reads is how you manufacture worthless `clean`
   verdicts. See "Why the drain does not exist as designed" in Phase 4. The throughput concern
   the question was reaching for is real and is addressed by 4A plus the flow/stock split,
   neither of which batches a verdict.

   *Process note: this question survived three phases because each phase restated it rather than
   testing it. Reading `/demo` — which any phase could have done — closes it in one pass. The
   analogue of `[IL-24]` for open questions: an unexamined question accumulates the same false
   authority as an unverified claim.*
4. **New at Phase 3.** Whether machinery may ever originate a grant. `unattended` is defined and
   its grant path is shut behind an opt-in nothing sets, because opening it means amending
   `_shared/work-record.md`'s invariant that `auto:*` labels come only from an interactive human
   session — an invariant with an eval asserting it, written after a real run treated a low-risk
   `ready` record as license to run a full build-to-close lifecycle. That is a deliberate decision
   for a human to make, not a step in a plan, and until it is made the top tier's incremental
   value over `trusted` is zero.
