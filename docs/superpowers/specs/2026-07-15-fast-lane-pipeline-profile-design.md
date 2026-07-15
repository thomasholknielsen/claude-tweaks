# Fast-Lane Pipeline Profile — Design

**Goal:** Give `risk:low`/`effort:low`-shaped work records a proportionately cheap pipeline
shape — not just a cheap model tier (already correct, via `effort:` → build's Common Step 2
tier override) — by deciding, once, how much retrospective and documentation ceremony a
record's actual content deserves, instead of leaving each wrap-up step to re-derive that
judgment ad hoc.

**Architecture:** A new mode on `/claude-tweaks:assess-agent-autonomy`, `ceremony-check`,
invoked once per record at materialize time (`skills/flow/materialize.md`). Its verdict is
stored as a per-record materialized-header field (`ceremony:`) and folded into a 9th Pipeline
Config Manifesto lever (`ceremony-profile:`, in `config.yml`) that downstream build/wrap-up
steps read instead of re-judging triviality themselves.

**Tech Stack:** Markdown skill-file additions (prose procedure, no new dependencies); small
pure-function extensions to existing `bin/lib/issues/` modules for the mechanical parts (header
field read/write, bundle-fold, doc-scan pre-check), tested via `node --test`.

## Motivation

Two real dispatch firings (#18, #19) — the same two that motivated `assess-agent-autonomy` —
also surfaced a second, independent problem: **the ceremony around a small, clean change costs
the same regardless of how trivial the change is.**

#18 (a 2-file, well-tested `bin/lib/issues/grouping.js` change, zero review findings at any
severity) cost ~342k tokens and ~27 minutes end to end. #19 (a `risk:low`/`effort:medium`
module-retirement migration, ~9 files including a deletion) cost ~358k tokens and ~29 minutes.
Both ran the full pipeline ceremony: full materialize, full architecture-alignment diff, a full
4-lens-plus-tradeoff reflect pass, a top-5 skill-curation scan, all 3 of wrap-up Step 6's
documentation sub-scans, and 8-item cleanup — regardless of how contained the actual change was.

#18's own `decisions.md` shows the seed of a fix already happening ad hoc, without any formal
mechanism telling it to: its wrap-up Reflect step self-described as "full mode, lightweight —
2-file, well-tested change" and scaled itself down informally. This design formalizes that
instinct into a decision made once, visibly, at materialize time — rather than re-derived
per-step, per-run, from scratch.

The effort-to-model-tier wiring (`record.js`'s materialized `effort:` header field →
`build/SKILL.md`'s Common Step 2 tier override) is already correct and unaffected by this
design — a cheaper model was never the gap. The gap is entirely in how much *analytical and
documentation* ceremony wraps around the change, independent of which model tier executed it.

## Non-Goals

- **Not** a change to auto-merge eligibility or blast-radius caps. Fully owned by
  `assess-agent-autonomy`'s `merge-check`; `ceremony-profile` and `auto:merge` are independent
  axes — a record can be `fast-lane` and still fall back to a human-reviewed PR (as #18 itself
  did, purely because its blast-radius count included test lines — the exact defect
  `merge-check` exists to fix, unrelated to this design).
- **Not** a change to dispatch's retry ceiling, claim protocol, or bundle-grouping logic.
- **Not** a rollout flag or staged deployment. `ceremony-check` runs unconditionally for every
  record at materialize time from the moment this ships — no pre-filtering to "borderline"
  records, the same principle `grant-check` already established (a mechanical pre-filter's whole
  job is deciding what's "obviously fine," which is exactly the kind of proxy that missed #18's
  real problem in the first place).
- **Not** a change to Journeys (Build Common Step 6) — already self-gates on persona interaction
  and the `surface:` field; untouched by this design.
- **Not** a blanket loosening of wrap-up Step 6's documentation sub-scans for every record. The
  mechanical pre-check this design adds is gated under `ceremony-profile: fast-lane`
  specifically. Extending it to `standard`-profile records too is a plausible follow-up, not
  covered here.
- **Not** retroactive. A mid-run downgrade (see Escape Hatch) never re-runs an already-skipped
  build-side step — it only changes what's still ahead in the pipeline.

## Architecture

### `ceremony-check` (new `assess-agent-autonomy` mode)

**Called from:** `flow/materialize.md`, once per record, immediately alongside the existing
`risk:`/`effort:` header-field population — unconditionally, every record, every materialize.
No pre-filtering to "borderline" records.

**Input:** the record's full body (Current State / Deliverables / Acceptance Criteria) and its
current `risk:*`/`effort:*` labels — identical input shape to `grant-check`.

**Output:**
```
CEREMONY: fast-lane | standard
RATIONALE: {one paragraph}
```

`risk:`/`effort:` labels are signal, not a gate — the same non-label-bound judgment principle
`grant-check`/`merge-check` already established ("this isn't a one-directional tightening"). A
`risk:medium` record that turns out to be a trivial, self-contained change can still score
`fast-lane`; a `risk:low`/`effort:low` record whose actual content carries real
knowledge-capture value (multiple call sites, a public-surface rename decision) can score
`standard` despite the labels. See Calibration examples below.

**Calibration examples:**

- #18's actual content (2 files, `grouping.js` + its test, TDD, zero review findings, no public
  API surface touched) → `fast-lane`. The motivating case this design exists to formalize.
- A record labeled `risk:low`/`effort:medium` whose Deliverables describes retiring a module
  with several live callers across packages and a user-facing CLI flag rename (#19's actual
  shape) → plausibly `standard` — the knowledge-capture value of a full reflect pass and a real
  documentation-sync check is high here even though the code-level risk is genuinely low, and
  this isn't the risk:low/effort:low pairing this direction started from in the first place.
- A record whose Deliverables is a pure prose/comment correction with no behavioral surface at
  all → `fast-lane`, regardless of its `risk:`/`effort:` labels.

### Per-record storage: `ceremony:` materialized-header field

Added to `materialize.md`'s pinned header, alongside `risk:`/`effort:`:

```yaml
ceremony: fast-lane   # omitted when standard (mirrors risk:/effort:'s omit-when-unscored convention)
```

| Field | Named reader |
|---|---|
| `ceremony` | `/flow`'s Manifesto (Step 3) bundle-fold into the `ceremony-profile` lever |

### Pipeline-level storage: `ceremony-profile` (9th Manifesto lever)

Computed at Step 3 (`flow/manifesto.md`) alongside the other 8 canonical levers, from the
per-record `ceremony:` header values already materialized:

- **Single-record run:** `ceremony-profile` = that record's `ceremony:` value.
- **Multi-record bundle:** the **AND** across every record's `ceremony:` value — one `standard`
  member sends the whole bundle to `standard`. Mirrors the auto-merge gate's existing "every
  member of the group must carry `auto:merge`" rule (`dispatch/SKILL.md`'s Auto-merge gate).

Rendered as a new **Ceremony** column in the Manifesto's existing per-spec preview table
(alongside Surface | Polish | Stories | QA | Friction note), so the decision is visible in the
`auto`-mode FYI render, never silent. Written to `config.yml` like every other lever —
`ceremony-profile` is never suppressed (every run has at least one record).

### Consumers

| Step | Standard behavior | `ceremony-profile: fast-lane` behavior |
|---|---|---|
| Build Common Step 1.5 (Plan Audit) | Skips only when plan has <3 file refs + no `Scope keywords:` | Always treated as satisfying the skip condition |
| Build Common Step 4.5 (Architecture Alignment) | Skips only when plan is <3 tasks / single-file | Always treated as satisfying the skip condition |
| Wrap-up Step 3 (Reflect) | `full` mode: 4 lenses + Tradeoff review | New `light` mode (own `light-mode.md`): Near-misses + Fresh-start lenses only, skips Tradeoff review. Safety-regression routing (`reflect/SKILL.md` Step 3's table) is mode-independent — unchanged |
| Wrap-up Step 6 (Doc/CLAUDE.md/ADR scans) | Always runs all 3 sub-scans | Gains a mechanical pre-check (same shape as Build Common Step 5.5's existing trigger-list pattern): skip all 3 sub-scans when the diff matches none of `docs/REGISTRY.md`'s patterns, adds no new dependency, and touches no schema/config file. Reuses `assess-agent-autonomy`'s `blast-radius.js` (`classifyDiffFiles`) rather than a second classifier |
| Wrap-up Step 7 (Skill Curation) | Independent scan (7.2) reads top-5 domain-relevant skills | Cap reduced to top-2. Never skipped outright — `skill-curation.md`'s "a skill audit that runs only when something was pre-tagged is the failure mode this procedure exists to fix" still holds; only the breadth shrinks |
| Test, Review, Journeys, cleanup, `merge-check`/`failure-check` | — | **Unchanged in all cases.** `ceremony-profile` only ever trims retrospective/documentation ceremony, never correctness verification or merge authorization |

Skipping Architecture Alignment outright means it can never itself catch a plan/spec deviation
for a `fast-lane` record — that's a deliberate bet on `ceremony-check`'s upfront judgment, not an
oversight. The actual safety net is Review and Reflect's safety-regression check, both unchanged
and both evaluated against the real, finished diff rather than a prediction (see Escape Hatch).

### Escape hatch

Two trigger points, both running at full strength regardless of `ceremony-profile`:

- **Review** produces a finding at any severity.
- **Reflect**'s safety-regression routing fires (mode-independent).

Either one, on firing, checks `config.yml`'s current `ceremony-profile`: if `fast-lane`,
downgrade to `standard` in place and log:

```
AUTO {time} — Ceremony profile downgraded fast-lane → standard: {trigger}. Remaining wrap-up steps run at standard depth.
```

No special plumbing is required beyond writing the file — every consumer already reads
`config.yml` fresh at its point of use rather than caching a value (subagents don't inherit
in-memory state; see `_shared/subagent-output-contract.md`'s Input Discipline). Nothing
already-skipped re-runs; only steps still ahead in the pipeline (Step 6, Step 7) observe the new
value.

## Amendment to `assess-agent-autonomy`'s design

`docs/superpowers/specs/2026-07-15-assess-agent-autonomy-design.md`'s own Non-Goals section
states: "**Not** a system-wide risk-assessment service. Scoped to exactly the decision points
`/claude-tweaks:triage` and `/claude-tweaks:dispatch` already own; not reachable from
`/claude-tweaks:review`'s own lenses or any other skill in this pass." `ceremony-check`, invoked
from `flow/materialize.md`, directly falls under "any other skill in this pass." This is a
deliberate, explicit widening rather than an accidental contradiction: that Non-Goal should be
edited to read "reachable from `/claude-tweaks:flow`'s materialization step (`ceremony-check`
only) — see the fast-lane-pipeline-profile design; still not reachable from
`/claude-tweaks:review` or any other skill." "Is this safe to trust autonomously"
(triage/dispatch's question) and "how much ceremony does verified, finished work deserve" (this
design's question) remain conceptually distinct — different consumer, different stakes,
different point in the pipeline — but both are judgment calls over a record's actual content
rather than its labels, which is why they share one skill's infrastructure rather than each
inventing their own.

**Sequencing note:** as of this writing, `assess-agent-autonomy` already has a committed design
doc and an implementation plan, and is being actively built in a separate worktree
(`.claude/worktrees/assess-agent-autonomy-impl`). This design's own implementation should land
`ceremony-check` against whatever that build actually produces (mode conventions, output-contract
helpers, `blast-radius.js`'s real shape) rather than against this doc's description of it —
re-verify at plan/build time, not assumed here.

## Testing

- Header field read/write (`materialize.md`'s composition logic) and the bundle-fold AND —
  ordinary pure-function tests, same shape as every other `bin/lib/issues/tests/*.test.js` file.
- Wrap-up Step 6's mechanical pre-check — tested against `blast-radius.js`'s existing
  `classifyDiffFiles` fixtures, extended with a `docs/REGISTRY.md`-pattern-match dimension.
- `ceremony-check` and reflect's `light` mode are LLM judgment, not unit-testable in the
  traditional sense — calibrated via the worked examples above and in `light-mode.md`, the same
  role `assess-agent-autonomy`'s own calibration examples play for its three existing modes.

## Error Handling

Same conservative-on-ambiguity principle as `assess-agent-autonomy`'s existing three modes: if
`ceremony-check` cannot render a clear verdict, the result is `standard`. If any record in a
bundle is missing the `ceremony:` header field entirely (e.g., a legacy spec-file-alias run that
never went through materialization), that record folds in as `standard`. Ambiguity never
resolves toward less ceremony.

## Known Touch Points (not exhaustive — writing-plans owns the file-by-file breakdown)

- **New:** `ceremony-check` mode within `assess-agent-autonomy`'s skill file (own mode section
  or sub-file, mirroring `grant-check`/`merge-check`/`failure-check`'s existing pattern);
  `skills/reflect/light-mode.md`.
- **Modified:** `skills/flow/materialize.md` (`ceremony:` header field),
  `skills/flow/manifesto.md` (9th lever, Ceremony preview column, bundle-fold logic),
  `skills/wrap-up/SKILL.md` (Step 3 mode selection, Step 6 mechanical pre-check, Step 7 cap
  reduction), `skills/wrap-up/skill-curation.md` (document the top-2 fast-lane carve-out
  alongside the existing "never seed-gated" principle), `skills/reflect/SKILL.md` (mode table
  gains `light`), `skills/build/SKILL.md` (Common Steps 1.5 / 4.5 skip-condition widening).
- **Amended:** `docs/superpowers/specs/2026-07-15-assess-agent-autonomy-design.md` (Non-Goals
  section — see Amendment section above).
- **Documentation:** no skill-count bump (this adds modes to two existing skills, not a new
  skill) — check `README.md` / `skills/help/reference-card.md` for any place reflect's mode
  table or assess-agent-autonomy's mode list is mirrored, and update if so.
