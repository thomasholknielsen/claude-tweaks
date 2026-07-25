# Maturity-Aware Build & Specify Discipline — Design

**Goal:** claude-tweaks already detects and confirms a project's maturity classification
(greenfield / pre-launch / early-production / established) at `/init`, but nothing downstream
acts on it — it's baked once into CLAUDE.md's Philosophy prose and never consulted again. Make it
a durable, machine-readable project fact that `/build` and `/specify` actually read and branch on
at the two points where the research shows greenfield and brownfield work should genuinely
diverge: how a build task changes existing behavior, and how a design doc gets decomposed when it
proposes replacing something that already ships.

**Architecture:** `maturity` moves from CLAUDE.md prose into `.claude-tweaks/policy.yml` as a
durable, updatable value (mirroring `worktree.always`'s existing precedent), written once `/init`
Phase 3's classification is confirmed and re-checked by Update Mode's existing contract-drift
mechanism. `/build`'s Common Step 2 and `/specify`'s Step 2 each read it and fold one
maturity-scaled instruction into behavior they already have — extending the existing
`effort:`-derived dispatch-instruction pattern rather than inventing new detection machinery.

**Tech Stack:** Markdown skill-file changes only, across `skills/init/phase-3-classification.md`,
`skills/init/update-mode.md`, `skills/build/SKILL.md`, and `skills/specify/SKILL.md`. One new
config key in `.claude-tweaks/policy.yml`. No new code, no new shared `_shared/` module.

## Motivation

Two research reports conducted 2026-07-25
(`.claude-tweaks/research/2026-07-25-greenfield-vs-brownfield-development-approaches` and its
AI-tooling deep-dive) found that discovery-before-generation, characterization-tests-first change
discipline, and strangler-fig-over-rewrite delivery are the concrete practices that should differ
between projects with and without existing, relied-upon production behavior. Separately, exploring
this plugin's own `/init` skill surfaced that it already computes exactly the classification
needed (Phase 2h detection, Phase 3 confirmation) — but the result is only ever translated into
Philosophy-section prose, never stored as a value any other skill can read. `/build` and `/specify`
run identically regardless of a project's maturity today, even though the plugin's own generated
CLAUDE.md already claims they should behave differently.

## Non-Goals

- **Not a new `_shared/` module.** Early drafts considered extracting the maturity-gating logic
  into a shared file (mirroring `_shared/decision-records.md`'s ADR gate). Rejected: the logic
  collapsed to "read one value, branch on it" once mechanism-hunting stopped and the design was
  re-grounded — genuinely too small to warrant a dedicated file; the two consuming skills each
  hold their own few-line version inline.
- **Not new detection heuristics for "is this file pre-existing" or "is this a rewrite."** An
  earlier draft proposed dedicated lexical/git-history heuristics (a new `/build` Common Step 1.8,
  a new `/specify` Step 2.5e). Rejected in favor of extending steps that already do this work:
  `/build`'s existing `effort:`-derived dispatch instruction, `/specify`'s existing Step 1
  Landscape scan and Step 2 decomposition heuristics.
- **Not path-scoped maturity.** A monorepo can genuinely have mixed maturity across packages, and
  a path-scoped override (`.claude/rules/`-style) was considered and would resolve that cleanly
  using data `/build`/`/specify` already have (`Files:` sections, Step 1's file scan). Deliberately
  deferred — single repo-wide value only, for this design.
- **Not an audit-log entry when the new heuristics fire.** Both the `/build` instruction injection
  and `/specify`'s decomposition change were considered for a `decisions.md` log line, consistent
  with this plugin's no-silent-automation rule. Deferred — the existing `effort:`-derived
  instruction this design extends isn't logged either, so this doesn't introduce a new
  inconsistency; closing that gap for both together is a natural follow-up, not required for this
  design to land correctly.
- **Not a verification tie-in.** Confirming a flagged task actually produced a characterization
  test (e.g. via Architecture Alignment Check) was considered and explicitly declined — this
  design trusts the injected instruction the same way TDD discipline itself isn't independently
  audited beyond "tests pass."
- **Not touching `init/claude-md-template.md`'s Universal principles.** An earlier draft
  misdiagnosed a contradiction between "Assume zero cost/time" and the Established Philosophy
  block's migration-safety guidance. On inspection, there is no contradiction: "assume zero
  cost/time" is a correction against effort-rationing in general (an anthropomorphic bias, not a
  maturity-conditional judgment call) — applied to an established project it reinforces migration
  rigor (don't skip the rollback plan because it's extra work), it never argued for skipping it.
  No change needed to this file.
- **Not extending maturity-awareness to `/challenge`, `/review`, or `/deepen`.** Catching
  rewrite-framing earlier (at `/challenge`, before a design doc even exists) and verifying the
  characterization-test/strangler-fig behavior downstream (at `/review`) are both real, adjacent
  ideas — explicitly parked as backlog candidates rather than folded in here, matching this
  plugin's own "notice something outside scope, capture it, don't scope-creep" discipline (`/build`
  Common Step 4).

## Architecture

### The `maturity` config key

`.claude-tweaks/policy.yml` gains one new key:

```yaml
maturity: established   # greenfield | pre-launch | early-production | established
```

Written by `/init` immediately once Phase 3's Project Classification gate confirms the value
(auto-confirmed at high confidence, or human-confirmed via the interactive gate) — no deferred
"write as the very last action" handling, unlike `worktree.always`. That deferral exists
specifically because turning worktree enforcement on mid-run would lock out the very `/init`
invocation enforcing it; writing `maturity` carries no equivalent self-lock risk, so it's written
directly when Phase 3 completes.

Whatever gets written has already passed Phase 3's confirmation gate — there's no persisted
"low-confidence, unconfirmed" state to worry about; the existing gate already guarantees the
stored value is trustworthy.

`update-mode.md`'s existing contract-drift table (Phase 1u.5) gains one new row: a full
reconnaissance pass (not the early-exit fast path) re-runs Phase 2h detection and compares the
result to the stored `policy.yml` value. A mismatch is recorded as a Contract Drift entry and
offered through the same batch-approval Drift Report mechanism every other row already uses —
this is the "gets updated once a project matures" mechanism.

**Rollout / missing-value handling:** projects that ran `/init` before this change has no
`maturity` key in `policy.yml` yet. Both `/build` and `/specify` treat a missing key as
**fail-open** — equivalent to `greenfield`/`pre-launch`, i.e. neither new behavior fires. This is
a deliberate choice: existing projects get this discipline only after their next `/init update`,
with no silent behavior change on old configs in the meantime.

### `/build` Common Step 2 — maturity-scaled dispatch instruction

Common Step 2 already reads the materialized header's `effort:` field and folds a model-tier
override into its `/superpowers:subagent-driven-development` invocation instruction. Extend the
same instruction with one maturity-scaled sentence, read once per build from `policy.yml`:

| Maturity | Added instruction |
|---|---|
| greenfield / pre-launch (or missing) | None |
| early-production | "For any task modifying pre-existing behavior, write a quick smoke test capturing current behavior before changing it." |
| established | "For any task modifying pre-existing behavior, write a full characterization test covering edge cases before changing it — published or external consumers may depend on them." |

"Pre-existing behavior" is judged by the implementer subagent itself, per-task, using the same
judgment it already applies deciding what to test under normal TDD — no new mechanical
file-existence or lexical-verb detection is introduced to make this call for it. This applies in
record, spec, and design mode alike (Common Step 2 is shared across all three).

### `/specify` Step 2 — maturity-scaled decomposition heuristic

Step 2's Decomposition Heuristics currently lists five priority-ordered split boundaries (data
layer, API/business logic, UI, infrastructure, cross-cutting). Add one conditional heuristic,
checked first: read `maturity` from `policy.yml`; when early-production or established, and Step
1's Landscape scan (already run) shows the design doc's Deliverables describe replacing or
rewriting a subsystem that already exists in the codebase with usage elsewhere (not something the
same design doc is itself introducing fresh), decompose along a strangler-fig boundary instead of
the standard five:

| Maturity | Decomposition shape |
|---|---|
| greenfield / pre-launch (or missing) | Standard five heuristics, unchanged |
| early-production, rewrite-signal matched | Two leaves: implement-behind-a-flag, then remove-the-old-path |
| established, rewrite-signal matched | Three leaves: parallel-implementation, cutover, decommission — sequenced so the old path keeps working until cutover is verified |

The "rewrite-signal matched" check is a text-level signal (Deliverables/Overview containing
"replace," "rewrite," "rebuild," "migrate off," or "delete and rebuild," describing a named target
the Landscape scan confirms already exists with outside references) — not a new subsystem, just a
read of data Step 1 already gathers.

## Testing

Prose/skill-file logic — no unit tests apply. Verification is a hand-trace of concrete scenarios
against the literal written procedure text:

1. Established project (`maturity: established` in `policy.yml`), a leaf record fixing a bug in an
   existing, two-year-old `getOrders()` function → Common Step 2's dispatch instruction includes
   the full-characterization-test sentence. A greenfield project with the same leaf → no addition.
2. Early-production project, design doc "Replace the legacy invoicing module with an event-driven
   design," target module confirmed by Landscape scan to have outside callers → Step 2 decomposes
   into two leaves (flag-behind, remove-old-path) instead of the standard data/API/UI split.
3. Established project, design doc proposing a wholly new feature with no existing counterpart →
   rewrite-signal check finds no matching existing target → standard five heuristics apply,
   unchanged.
4. Project with no `maturity` key in `policy.yml` (pre-dates this change) → both new behaviors fail
   open, identical to greenfield — confirms the rollout story doesn't silently change behavior for
   existing projects.
5. Project re-run through `/init update --full` after maturing from `early-production` to
   `established` → Phase 1u.5's new drift row detects the mismatch, offers the patch, `policy.yml`
   gets updated on approval.

## Error Handling

Ambiguity resolves toward *more* scrutiny in `/build` (an implementer subagent uncertain whether a
change touches "pre-existing behavior" should still write the test — the cost of an unnecessary
characterization test is far lower than a missed one), and toward the *standard* heuristics in
`/specify` (an ambiguous rewrite-signal match — e.g. the language is present but Landscape scan
can't confirm outside usage — falls through to the normal five-heuristic decomposition rather than
forcing a strangler-fig shape onto something that may not need it). This is an intentionally
asymmetric failure direction: over-triggering the build-side safety net is cheap; over-triggering
the specify-side restructuring on a false match would produce a needlessly convoluted decomposition
for no real benefit.

A missing or malformed `maturity` value in `policy.yml` (key absent, or a value outside the
four-item enum) is treated identically to the fail-open rollout case — never an error, never
blocks the skill.

## Known Touch Points (not exhaustive — writing-plans owns the file-by-file breakdown)

- **Modified:** `skills/init/phase-3-classification.md` — writes `maturity` to
  `.claude-tweaks/policy.yml` once the classification gate confirms, instead of (in addition to)
  only feeding Phase 5's Philosophy prose.
- **Modified:** `skills/init/update-mode.md` — Phase 1u.5's contract-drift table gains a new
  `maturity` row.
- **Modified:** `skills/build/SKILL.md` — Common Step 2's dispatch-instruction paragraph gains the
  maturity-scaled sentence table above.
- **Modified:** `skills/specify/SKILL.md` — Step 2's Decomposition Heuristics gains the conditional
  strangler-fig heuristic above, checked ahead of the existing five.
- **Possibly modified:** `_shared/auto-mode-contract.md` or `_shared/git-discipline.md` — check
  whether either documents `policy.yml`'s current key list somewhere that would need the new
  `maturity` key added for completeness (writing-plans to confirm during file-by-file breakdown).
