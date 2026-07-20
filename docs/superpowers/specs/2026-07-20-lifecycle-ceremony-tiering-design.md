# Lifecycle Ceremony Tiering — Design

**Goal:** Close the gap left by `ceremony-profile: fast-lane` — it only trims ceremony *after*
a record is already spec-shaped and running through `/claude-tweaks:flow` (Build's plan-audit/
architecture-alignment, Reflect's depth, Wrap-up's doc-scans and skill-curation breadth). The
heaviest remaining fixed-cost step for a trivial record — `/claude-tweaks:specify`'s Step 5
Multi-Persona Red-Team (three persona dispatches per leaf, regardless of size) — sits entirely
upstream of where `ceremony-check` runs today, so today's tiering can't touch it. `/review`'s
own fixed-cost wrapper steps (spec-compliance re-check, cross-spec-promise check, hindsight) are
in the same position: real per-record overhead independent of diff size, currently untiered.

**Architecture:** Relocate `assess-agent-autonomy`'s `ceremony-check` mode from `/flow`'s
materialize step to `/specify`'s record-creation step (Step 3), running it in the same per-record
pass that already stamps `risk:*`/`effort:*` labels. Promote `ceremony:` from a materialize-only
header field to an explicit, always-present GitHub label. Give `/specify`'s Step 5 and `/review`
their own tier-aware behavior. Surface the tier as a non-binding advisory column in
`/review-backlog`'s existing synthesis pass.

**Tech Stack:** Markdown skill-file changes (prose procedure, no new dependencies); small pure-
function extensions to `bin/lib/issues/tier.js` (ceremony-label parsing) and
`bin/lib/issues/review-backlog.js` (advisory column), tested via `node --test`.

## Motivation

`docs/superpowers/specs/2026-07-15-fast-lane-pipeline-profile-design.md` shipped and is live
(`materialize.md`, `wrap-up/SKILL.md`, `reflect/light-mode.md` all reference it as running
behavior). It correctly identified that a small, clean change shouldn't pay full retrospective
ceremony — but it drew its boundary at `/flow` materialize time, which is *after* `/specify` has
already spent its own fixed cost per record: Step 5's three-persona red-team dispatch, regardless
of how trivial the leaf is.

This surfaced concretely while running `/claude-tweaks:review-backlog` — its synthesis pass reads
full record bodies and suggests `priority:*`, but has no way to signal "this cluster is all quick
wins" the way it already signals priority, because no tier judgment exists that early in the
lifecycle.

Separately, `/claude-tweaks:review`'s own step list has the identical shape problem `ceremony-
check` was built to fix in the first place: Step 1 (spec-compliance re-check), Step 1.6
(cross-spec-promise check), and Step 4 (hindsight) all cost roughly the same whether the diff is
2 lines or 200. Step 3 — the actual code-quality read of the diff, the part that catches real bugs
— is naturally proportional to diff size already and doesn't need shrinking. This design draws
the same line for Review that the original design drew for Wrap-up's Reflect: keep the
bug-catching substance at full strength, trim the fixed-cost wrapper around it.

## Non-Goals

- **Not a change to Test.** `/claude-tweaks:test` stays completely untiered — it's already cheap
  and scoped (arguments, `affected`, pipeline-context reuse of `VERIFICATION_PASSED`), and its
  cost tracks the codebase's test suite, not the record's size. Shrinking it buys little and
  risks missing a regression.
- **Not a change to auto-merge eligibility, blast-radius, or `merge-check`.** `ceremony-profile`
  and `auto:merge` remain independent axes, exactly as the original design established.
- **Not making `/review-backlog` authoritative.** Its new `Suggested tier` column is advisory only
  for not-yet-`/specify`'d records; `/specify`'s `ceremony-check` remains the sole authoritative
  computation. For already-scored records the column is simply a mechanical display of the real
  label — no judgment call of its own.
- **Not retroactive, no migration required.** Existing open records (created before this ships)
  simply carry no `ceremony:*` label; materialize's fallback (see Architecture) computes it fresh
  the first time such a record reaches `/flow`, identically to how `ceremony-check` behaves today.
- **Not touching Step 2.5d (Diagram Suggestion).** Checked directly — it already self-gates on
  content ("skip emission entirely if no signal matches — trivial records and refactors should not
  trigger the hook"). Already proportionate; no change needed.
- **Not extending `/review-backlog`'s bounded synthesis scope.** The `--budget N` cap and the
  existing body-fetch-only-for-`selected` discipline are unchanged; the advisory tier guess rides
  along in the same LLM pass that already reads those bodies for priority suggestions.
- **Not a rollout flag.** `ceremony-check` runs unconditionally at `/specify`'s record-creation
  step from the moment this ships, for every leaf/record — no pre-filtering to "borderline"
  records, the same principle the original design and `grant-check`/`merge-check` already
  establish.

## Architecture

### Relocating `ceremony-check` into `/specify`

**Called from:** `/specify`'s Step 3 (Create the Records) — both shaping mode's single-record
path and decomposition mode's per-leaf loop — immediately alongside the existing `risk:*`/
`effort:*` label computation, using the same in-memory-composed body (Current State/Deliverables/
Acceptance Criteria) that Step 3 is about to write. No separate fetch — the body already exists in
memory at this point, more directly available than materialize's current re-fetch-then-judge path.

**Never runs on parent records** (decomposition mode) — mirrors the existing rule that parents
never get `risk:*`/`effort:*` scoring either, since parents are summary records never built
directly.

`/flow` materialize.md's own `ceremony-check` invocation (`materialize.md` line ~77) becomes a
**fallback only**: read the `ceremony:*` label if present; invoke `ceremony-check` (as today) only
when the record carries no `ceremony:*` label at all — i.e., it reached `/flow` without ever going
through this specify-time step (a legacy hand-authored spec file, or a record created before this
design shipped). This fallback computes the value fresh for this run's own materialized header
only — it does not write a label back onto the issue. Materialize has no existing label-write
capability today, and introducing one here would blur the single-owner convention this codebase
otherwise keeps (`/specify` is the one place that stamps `ceremony:*`, exactly as it's the one
place that stamps `risk:*`/`effort:*`). The fallback case is rare and self-limiting in practice —
every record created after this design ships already carries the label from `/specify`.

### Promoting `ceremony:` to an explicit, always-present label

The original design's header field used an omit-when-standard convention (mirroring `risk:`/
`effort:`'s omit-when-*unscored*). That convention doesn't survive the move: once the judgment
happens upstream of materialize, "label absent" becomes ambiguous — *judged standard* and *never
judged* are different states requiring different handling (trust vs. compute-and-backfill), and
omission collapses them into one.

Resolution: `ceremony:` becomes a real GitHub label, **always explicit** —
`ceremony:fast-lane` or `ceremony:standard`, never omitted, mirroring how `risk:*`/`effort:*`
are always explicit once a record is scored. `bin/lib/issues/tier.js` gains a small
`extractCeremony(labels)` reader (same shape as the existing `extractRiskEffort`). Bootstrap both
label values per `_shared/label-bootstrap.md`'s canonical check-then-create snippet.

The materialized pinned header field follows the same always-explicit convention as the label it
now mirrors (`ceremony: fast-lane` or `ceremony: standard`, never omitted) — one convention for
one concept, rather than an explicit label paired with an omit-on-default header field.

This also fixes a latent edge case in the original design: previously, a record missing the
`ceremony:` header field for any reason silently defaulted to `standard` forever (per the original
Error Handling section). Under the always-explicit-label convention, "label absent" now
unambiguously triggers a real computation (materialize's fallback) rather than a silent,
permanent downgrade.

The Manifesto's bundle-fold logic (`flow/manifesto.md`'s "Ceremony profile computation" section)
is **unchanged mechanically** — it still folds every record's `ceremony` value with a logical AND,
still sources from the record's materialized header, still lets a human override via the `10=
value` mechanism. Only *how* materialize populates that header field changes (read-a-label
instead of always-compute).

### `/specify` Step 5: persona count by tier

Step 5 (Multi-Persona Red-Team) currently dispatches all three personas (Implementer/Maintainer/
Skeptical Reviewer) per leaf unconditionally. For a leaf just labeled `ceremony:fast-lane`,
dispatch **one** persona only — Skeptical Reviewer, the lens most likely to catch a wrong-fix risk
— cutting dispatch cost to roughly a third while keeping a genuine ambiguity check rather than
dropping the step outright. `ceremony:standard` leaves are unaffected (all three personas, as
today).

### `/review`'s new light mode

Mirrors `reflect`'s existing full/light split. New mode, selected the same way `wrap-up` already
selects Reflect's mode — read `config.yml`'s `ceremony-profile` (when a pipeline run directory
exists; standalone reviews outside `/flow` always run full mode, matching Reflect's own
standalone-defaults-to-full rule):

| Step | Full (default) | Light (`ceremony-profile: fast-lane`) |
|---|---|---|
| Step 1 (Spec compliance) | Always runs | Skipped |
| Step 1.5 (Test gate) | Always runs | **Unchanged — always runs** |
| Step 1.6 (Cross-spec promise check) | Always runs | Skipped |
| Step 2 (Change analysis) | Always runs | Runs (needed to scope Step 3) |
| Step 3 (Code review of the diff) | Always runs | **Unchanged — always runs at full strength** |
| Step 4 (Hindsight) | Always runs | Skipped |
| Step 5 (Simplification) | Runs | **Unchanged — always runs** |
| Step 7 (Summary) | Always runs | Always runs, notes light mode |

Checked directly against `skills/review/SKILL.md`: Step 5 already scopes to `git diff
--name-only` only — unlike Wrap-up's skill-curation (which searches the *wider* skill library
beyond the diff, hence its top-5→top-2 breadth cap), Review's Step 5 has no "look beyond the
diff" behavior to cap in the first place. It's already proportional to diff size, exactly like
Step 3. No change needed there — dropped from the tiered set.

Step 3 is the actual bug-catching substance and is deliberately never touched — this design draws
the same line the original one drew for Reflect (keep the safety-relevant judgment, trim the
fixed-cost wrapper). A Review finding at any severity still triggers the existing escape hatch
(downgrade `ceremony-profile` to `standard` for the rest of the run) — unchanged.

### `/review-backlog`'s advisory `Suggested tier` column

For **already-scored** records (Step 1's fetch already pulls `labels`), this is a free mechanical
display — extend the existing facet-parsing call to also surface `extractCeremony`, same as Risk/
Effort columns already work in the `risk-value` view. No LLM involvement, no extra cost.

For **not-yet-`/specify`'d** records, Step 3's bounded bare-mode synthesis pass (which already
reads full bodies for the `--budget`-limited `selected` set to suggest `priority:*`) gains a
non-binding `Suggested tier` guess in the same LLM pass — purely to help a human eyeball a batch
("this cluster looks like five quick wins") before deciding what to send to `/specify` next.
Rendered as an added column in the existing Step 4 batch table; **not** gated behind its own
`AskUserQuestion` — it's informational only, riding along with the priority suggestion the human
is already confirming, and is never itself written as a label (only `/specify`'s real
`ceremony-check` writes `ceremony:*`). Render the two sources distinguishably in the table — the
real label plainly (`fast-lane`/`standard`), the LLM guess suffixed (`quick? (guess)`/`full?
(guess)`) — so a human scanning the batch never mistakes an unscored guess for `/specify`'s
authoritative verdict.

## Testing

- `extractCeremony` (label parsing) — ordinary pure-function test, same shape as
  `extractRiskEffort`'s existing coverage in `bin/lib/issues/tier.js`'s test suite.
- Materialize's fallback branch (label-absent → invoke `ceremony-check` → backfill) — testable as
  a pure branch once the mechanical read/write shape is extracted, mirroring the existing header-
  composition tests.
- `/review-backlog`'s mechanical display column — extend the existing `review-backlog.js` test
  fixtures with a `ceremony:*`-labeled record and assert it surfaces in the rendered view.
- Step 5's persona-count-by-tier and Review's step-skip-by-tier logic are LLM judgment, not
  unit-testable in the traditional sense — calibrated via the worked examples above and in
  `assess-agent-autonomy`'s existing calibration section, the same role those examples already
  play for the shipped modes.
- The not-yet-scored advisory tier guess in `/review-backlog` is LLM judgment over free text
  (same class as its existing priority suggestions) — not unit-testable beyond confirming the
  column renders when present.

## Error Handling

Same conservative-on-ambiguity principle as the original design: if `ceremony-check` cannot render
a clear verdict at `/specify` time, the result is `ceremony:standard` (written explicitly, not
omitted). If materialize's fallback also cannot render a clear verdict, same outcome. Ambiguity
never resolves toward less ceremony, in either direction — upfront (specify's persona count,
review's step selection) or retrospective (build/wrap-up, unchanged from the original design).

## Amendment to the fast-lane-pipeline-profile design

`docs/superpowers/specs/2026-07-15-fast-lane-pipeline-profile-design.md`'s "Per-record storage:
`ceremony:` materialized-header field" section describes computation happening exclusively at
`/flow` materialize time, with an omit-when-standard convention. Both are superseded by this
design: computation moves primarily to `/specify`'s Step 3 (materialize retains only a fallback
role for records that bypass `/specify`), and the field becomes an always-explicit label rather
than an omit-on-default header field. The Manifesto's bundle-fold-AND logic, the escape hatch, and
every Build/Wrap-up consumer table in that design are unaffected and still apply as written.

`skills/assess-agent-autonomy/SKILL.md`'s `ceremony-check` mode section needs its "Called from"
line updated from `/flow`'s materialization step to `/specify`'s Step 3, with `/flow` materialize
noted as the fallback path. The mode's Step 1 (Gather)/Step 2 (Judge)/Step 3 (Render) procedure
itself is unchanged — only the call site and input source move.

## Known Touch Points (not exhaustive — writing-plans owns the file-by-file breakdown)

- **New:** `bin/lib/issues/tier.js`'s `extractCeremony` reader; `skills/review/light-mode.md`
  (mirroring `reflect/light-mode.md`'s existing shape).
- **Modified:** `skills/specify/SKILL.md` (Step 3 — ceremony-check call + label write, both
  shaping-mode and decomposition-mode paths; Step 5 — persona-count-by-tier),
  `skills/flow/materialize.md` (line ~77 — label-read-with-fallback instead of always-compute;
  drop the omit-when-standard note), `skills/flow/manifesto.md` (per-spec preview table's
  "Ceremony" row — wording only, from "omitted means standard" to "always present"; the
  bundle-fold-AND logic itself is unchanged), `skills/assess-agent-autonomy/SKILL.md`
  (`ceremony-check` mode's "Called from" line), `skills/review/SKILL.md` (new ceremony-aware
  step-skip subsection gating Steps 1/1.6/4 — not a new `$ARGUMENTS` mode; the existing Review
  Modes table (`code`/`full`/`visual`/`journey`/`discover`) is a separate, orthogonal axis and
  is untouched), `skills/review-backlog/SKILL.md` +
  `bin/lib/issues/review-backlog.js` (Suggested tier column, Step 2/3/4), `_shared/label-
  bootstrap.md`-pattern label registration for `ceremony:fast-lane`/`ceremony:standard`.
- **Amended:** `docs/superpowers/specs/2026-07-15-fast-lane-pipeline-profile-design.md` (see
  Amendment section above) — do not edit the shipped doc's own text; a forward reference from
  that doc to this one is sufficient, matching how the original design itself amended
  `assess-agent-autonomy`'s design doc via a reference rather than an edit.
- **Documentation:** check `README.md` / `skills/help/reference-card.md` for any place `/review`'s
  mode table or `/specify`'s Step 5 procedure is mirrored, and update if so.
