# Research as a verification phase — design

**Date:** 2026-08-07
**Status:** Design approved, pending decomposition via `/claude-tweaks:specify`

## Problem

`/claude-tweaks:challenge` emits a Brainstorming Brief whose schema tags every surfaced
assumption `verified/unverified` (`skills/challenge/SKILL.md:233-235`). **Nothing populates that
tag from evidence.** No step exists between `/challenge` tagging an assumption and
`/superpowers:brainstorming` consuming it, so the value reflects what the lens agents felt, not
what was checked.

The same gap appears from the other direction: `/claude-tweaks:research` is web-only
(`SKILL.md:3`) and documents its own unwiring as deliberate — "none of these invoke /research
from a numbered Workflow step" (`SKILL.md:19-22`). Grounding in *this* codebase has no skill at
all; it is two prose bullets inside superpowers' brainstorming (`brainstorming/SKILL.md:97-99`),
produced in-context, never written down, and lost on compaction.

This repo has been paying for that gap in rules rather than structure. A cluster of incident-log
entries describe one failure — *the design asserted something about existing code that was never
read*: `[IL-24]` (design-doc claims about unchanged code), `[IL-64]` (consumer call topology
assumed, not verified), `[IL-38]` (plan-embedded patterns never checked against the target file),
`[IL-03]` (content deleted because "it lives in Step N", which it didn't), `[IL-81]` (a figure
corroborated by the command that produced it). Each was patched with a rule. Rules cost context
on every dispatched agent and depend on the model recalling them at the right moment.

## Non-goals

- Replacing today's web research. Bare `/claude-tweaks:research <topic>` is unchanged.
- Making grounding a HARD-GATE. It is valuable, not safety-critical.
- Adding a new skill. Extending `/research` keeps `tests/skill-conventions.test.js:82`'s
  `untouched.length === 22` assertion intact; a new skill would trip a hard-coded cardinality
  (`[IL-40]`).
- Persisting verified claims as durable artifacts. See "Artifact lifecycle" for why.

## Design

### Grammar and placement

A leading positional mode, following `assess-agent-autonomy`'s existing precedent
(`SKILL.md:4`, `<grant-check|merge-check|failure-check|ceremony-check>`) rather than overloading
`--mode=`, which already means depth tier:

```
/claude-tweaks:research <topic>                  → web survey, unchanged
/claude-tweaks:research verify [brief-path|#N]   → new
```

Verification is a different job, not a fifth depth tier.

Lifecycle position: between `/claude-tweaks:challenge` and `/superpowers:brainstorming` — the
step that populates a field `/challenge` already emits and brainstorming already reads.

**Input resolution.** Given a brief path (or a record with one), read `### Key Assumptions
Surfaced` and `### Open Questions for Brainstorming`. Given neither — the case where `/challenge`
was skipped as "clear and well-scoped" (`challenge/SKILL.md`, "When to Skip") — generate a
candidate set from the topic directly. Grounding must stay reachable on the fast lane; "the
problem is clear" is exactly when overconfidence lives.

### The consequence filter

For each candidate question: **if the answer surprised me, would the design change?** If both
branches lead to the same design, drop it and log the drop.

This is the entire cost-control mechanism. No budget knob, no per-source authorization. A topic
where nothing diverges correctly costs nothing. Output is a divergence-ranked list, which is also
the dispatch order below.

### Two question shapes

Only one shape is falsifiable, and the filter governs both unchanged:

| Shape | Example | Routes to | Returns |
|---|---|---|---|
| Falsifiable | "is X true?" | registry (below) | verdict |
| Unfalsifiable | "what are the approaches to X, and how do they fail?" | `web`, `history` | landscape |

On new ground, "would a surprising answer change the design?" is almost always yes, because there
are no priors — so the filter automatically authorizes more work exactly where knowledge is
thinnest, and near-zero where the work is on rails. It self-calibrates; no green-field mode.

Cost on new ground is bounded by the **existing depth tiers**
(`--mode=quick|standard|deep|ultradeep`), scoped to unfalsifiable questions only. The tiers were
the wrong primitive for *selecting* research and the right one for *bounding survey breadth*.

**Absence is a finding.** On new ground `history` and `telemetry` return nothing, and "no
precedent exists" must be stated explicitly. Silently absent, a green-field survey is
indistinguishable from a failed lookup — and silence cannot be detected by keyword search
(`[IL-15]`).

### Source registry

Entries are keyed by **what a source can falsify**, not by which tool it uses. Three entries
below all mechanically run `grep`; they are separate because they answer different question types.

| Source | Falsifies | Confidence |
|---|---|---|
| `runtime` | "this command/API still works", "this returns that shape" | highest — execution, not reading |
| `codebase` | what this repo's code does | high — `file:line` + sha |
| `repo-prose` | what our docs/CLAUDE.md claim the code does | high — a mismatch is itself a finding |
| `tests` | "is this guaranteed, or merely currently true?" | high |
| `history` | "this approach is fine" (`docs/incident-log.md`, closed records, `git log`) | high |
| `telemetry` | "this happens rarely", "users hit X" | high for frequency |
| `deps` | a library's behavior at the pinned version | high from source, medium from docs |
| `web` | prior art, known bugs, state of the art | medium — needs the existing citation audit |
| `human` | intent; whether a constraint is real | authoritative — **terminator, see below** |

Notes on individual entries:

- **`runtime`** answers what no amount of reading can. `[IL-35]` is exactly this failure. The
  technique already exists in this repo: `docs-health/judge-procedure.md:46` mandates executing
  every literal command block, with bounded output (`cmd > /tmp/f 2>&1; echo "exit=$?"`, inspect
  `tail -20`).
- **`tests`** is distinct from `codebase`: a test says the behavior is *maintained*, not merely
  present. Designing on incidental vs. guarded behavior is a different risk.
- **`telemetry`** reads `.claude-tweaks/pipelines/*/events.jsonl`, `decisions.md`, and
  health-sweep caches. It is the only source that answers frequency questions; code and docs
  structurally cannot.
- **`deps`** degrades in this project specifically: `node_modules` reads are structurally denied,
  so it falls back to context7 and public docs, and its confidence drops to medium accordingly.
  The dependency's own issue tracker belongs here, not in `web` — it is authoritative about the
  dependency, not about the field.
- **`human`** functions as a **terminator**: routing here means *stop researching, ask*. It
  prevents burning agents on questions only the user can answer.

Rejected: `sibling-repos`. Cross-repo access is inconsistent enough that it would ship
half-working, and `[IL-85]` forbids adding a path without stating when it goes.

**Routing.** A question routes to *every* source that could falsify it. Multiple sources per
question is the default, not the exception.

**Dispatch.** Form B parallel Task agents under `_shared/subagent-output-contract.md`, one per
question×source pair, Template A inlined verbatim, model tier per work. Read-only by
construction, so no git access and no shared-index race (`[IL-51]` does not apply).

**Confidence is per-source, not per-report.** This is the constraint that stops a grep-verified
fact from lending its credibility to a blog post sitting in the same list. Web claims and
`file:line` claims are not the same kind of evidence and must not render identically.

### Write-back and artifact lifecycle

**Schema change.** The brief's `verified/unverified` is binary, and the highest-value
outcome — an assumption that turns out *false* — has nowhere to go; `unverified` hides it. A third
value, `falsified`, is required. This is a producer/consumer pair: the same change-set must update
`/challenge`'s schema and every reader of it, or the new state silently no-ops (`[IL-02]`).

Each verdict carries provenance and **the sha it was checked against**, so staleness is visible
rather than assumed.

**Where things land:**

| Output | Destination | Durability |
|---|---|---|
| Falsifiable verdicts | brief's `### Key Assumptions Surfaced` | committed, `docs/plans/` |
| Survey landscape (full) | `.claude-tweaks/research/{date}-{slug}/report.md` | gitignored, reproducible |
| Survey finding (distilled) + report path | brief | committed |
| Falsified claim about *our own repo* | `gh` issue via existing `work-backend` | durable by construction |

`.gitignore` is unchanged, and no new storage path is introduced. Verified claims are deliberately
**not** persisted as standalone artifacts: they have a short half-life, and a committed file of
sha-stamped assertions manufactures exactly the staleness debt `docs-health`'s `check-freshness`
exists to sweep.

Instead they ride the existing lifecycle. `specify/decomposition-mode.md:23` already absorbs brief
assumptions into leaf Gotchas; Step 7 (`decomposition-mode.md:274`) `git rm`s the brief. Evidence
graduates into the record and the brief dies as designed — **provided `record-creation.md`'s
absorption procedure is updated to carry the new provenance fields.** Without that consumer half,
the fields evaporate silently at spec time.

### Auto-mode behavior

The `human` source is a stop by construction, colliding with "skills MUST NOT invent new mid-flow
stops in `auto`." It resolves the contract's way — **stage, don't stop**:

- A question routed to `human` logs `STAGED` to `decisions.md`.
- The design proceeds, carrying that assumption explicitly as `unverified`.
- It surfaces at the Wrap-Up Review Console.
- It does **not** become a new HARD-GATE.

Survey depth resolves through the existing precedence chain (CLI arg > pipeline config > project
policy > skill default), already implemented by `/research`'s Mode Picker (`SKILL.md:44`). No new
machinery.

Every filter drop and every verdict writes one `decisions.md` line. Dropped questions especially:
a silently-skipped question is indistinguishable from one never asked.

## Cross-references to update

| File | Change |
|---|---|
| `skills/research/SKILL.md:19-22` | "none of these invoke /research from a numbered Workflow step" becomes false once `/challenge` wires it — `[IL-93]` |
| `docs/skill-graph.md:51, 79, 264, 310` | research↔challenge upgrades from advisory to wired; specify↔research edge corrected to describe actual behavior |
| `skills/challenge/SKILL.md` | brief schema (third value), self-review rules, Next Actions |
| `skills/specify/record-creation.md` | absorption procedure carries provenance fields |
| `README.md`, `/help`, `CLAUDE.md` | skill inventory and workflow diagrams |

## Testing

`tests/research/` already exists (`cross-refs.test.js`, `skill-md.test.js`).

**Testable by `node --test`:**

- The three-value vocabulary and write-back shape, asserted against a **frozen fixture brief** —
  not live content (`[IL-80]`: a test reading production content you intend to change is a
  scheduled failure timed to the migration).
- Cross-reference integrity across the files above.
- That the stale no-workflow-invocation sentence is gone.

**Not testable this way:** whether the consequence filter judges well. That is `evals/` territory.
Stated here as a known gap rather than papered over with a unit test that would pass on any input
(`[IL-78]`).

## Decisions and rationale

| Decision | Rationale | Alternatives rejected |
|---|---|---|
| Extend `/research` rather than add a skill | Provenance machinery (`sources.json`), depth tiers, and a Component-Skill Contract naming challenge/specify already live there. Also fixes the "research means web research" narrowing. | New skill between challenge and brainstorming (trips the 22-count assertion, splits the word "research" across two skills); fold into `/challenge` (inherits skippability, gives `/challenge` a second job) |
| Consequence filter as the selector `[ADR-candidate]` | Governs cost structurally instead of via a budget knob, and self-calibrates on green ground | Source-axis selection (a dimension that is almost always "all of them" carries no information); depth-tier-only (bounds breadth, cannot decide relevance) |
| Sources as a registry, not a dimension | Adding a source never changes the phase; multiple-per-question becomes the default case | Four fixed axes — they were not disjoint (`upstream-drift` already spans two) and taxonomized *where you look* rather than *what you don't know* |
| No durable verified-claim artifact `[ADR-candidate]` | Sha-stamped assertions rot; a committed file of them becomes staleness debt for `docs-health` to sweep | Committing `.claude-tweaks/research/`; a new `docs/research/` tree |
| `human` stages rather than stops in auto | `_shared/auto-mode-contract.md` forbids new mid-flow stops; grounding is valuable, not safety-critical | New HARD-GATE |

## Open questions

- Whether `repo-prose` falsification should file issues **per finding** or bundle per run. The
  health sweeps bundle; high-volume per-finding filing would be noisy. Leaning bundle, deferred to
  decomposition.
- Whether `verify` should be reachable from `/flow` at all, or only from the pre-design path.
  `/flow` consumes ready leaf records, which are post-design by construction — so grounding may
  already be too late there.
