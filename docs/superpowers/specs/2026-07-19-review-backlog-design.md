# review-backlog — Design

## Problem

There is no skill that helps a human understand what's actually *in* the open work-record
backlog and get a sense of priority across it. `/claude-tweaks:triage` looks like the natural
place to reach for this, but it isn't: it only ever operates on the `ready`-labeled worklist and
only ever asks one binary question per record (grant or flag back) — it has no concept of
surveying content. When the `ready` queue is empty (the common case for a backlog that hasn't
been through `/specify` yet), triage has nothing to say beyond "shape your backlog first."

Confirmed by pulling this repo's own 12 open `by:capture` records (#20–#33): reading all 12
bodies side by side surfaced real structure — four records (#21–#24) cross-referencing each
other in prose ("the feedback-loop metrics record above") with zero formal linkage, a cluster of
correctness bugs with concrete evidence, a cluster of mechanical duplication cleanup, and two
self-flagged "ambitious" features. None of that was visible from any existing skill:
`/claude-tweaks:help` gives aggregate counts only (not per-record content); `/claude-tweaks:tidy`
is a hygiene/problem-finding sweep (stale, duplicate, unshaped), not content synthesis;
`/claude-tweaks:challenge` debiases one record/topic at a time; `priority:*` labels exist in the
taxonomy but are optional, human-applied-only, and consumed solely by `/dispatch next`'s
tie-breaking — nothing helps a human decide what to set them to.

Separately, an earlier design (`2026-07-08-backlog-github-issues-design.md`, pre-dating the
seven-axis taxonomy rewrite) actually intended priority to be "set/updated during `/tidy` triage
with a pre-filled suggestion" — that mechanism never survived into the current taxonomy. This
design revives that dropped intent under a purpose-built skill rather than folding it back into
`/tidy` or `/triage`.

## Goals

- Give a human a synthesized understanding of backlog content — narrative + thematic clusters —
  not just counts.
- Support three real prioritization workflows observed in practice: critical-first, risk/value
  ranked, and low-effort cleanup batches.
- Support generating parallel hand-off command blocks for a chosen batch of records.
- Scale to a backlog of thousands of open issues without requiring a full-body LLM read of
  everything on every run.
- Suggest — with explicit human batch-confirmation, never silently — `priority:*` labels and
  `**Related:**` cross-references that prose reveals but formal linkage misses.
- Support both `work-backend` drivers, including `github-issues` projects that have accumulated
  `unsynced: true` local fallback records.

## Non-goals

- Renaming `/claude-tweaks:review` → `review-code` for naming symmetry. Deferred — see "Out of
  scope" below.
- First-class simultaneous dual-driver support (a project deliberately keeping some records in
  GitHub and some in local files as steady state). Deferred — see "Out of scope" below.
- Writing `risk:*`/`effort:*` labels or shaping record bodies. Stays `/claude-tweaks:specify`'s
  exclusive job, same boundary `/triage` already respects for shaping.
- Suggesting or writing `Blocked by #N` (the formally-parsed hard-dependency mechanism). Only the
  soft, informational `**Related:**` field is in scope — a wrong hard-dependency suggestion has
  real downstream consequences (it would affect `/dispatch`'s queue selection); a wrong soft
  cross-reference doesn't.
- Persisted cross-run rotation/cursor state for the unscored-judgment lane. A simpler bounded
  single-pass-per-invocation model was chosen instead (see Decision log).
- Actually syncing `unsynced: true` local records to GitHub. Stays `/claude-tweaks:tidy`'s job
  (its existing Shape 3) — this skill surfaces them, it doesn't mutate them.
- Proactively suggesting `priority:*` for records that already carry `risk:*`/`effort:*` but lack
  `priority:*` (a scored-but-unprioritized record). See "Scoring-state split" below — only records
  Lane B actually reads get an active suggestion in v1; scored-but-unprioritized records just
  render as "unprioritized" in ranked views.

## Solution

### A. New skill: `/claude-tweaks:review-backlog`

A standalone Utility-category skill (alongside `/help`, `/tidy`, `/triage`, `/dispatch`) —
deliberate, on-demand, human-invoked. No fixed lifecycle position: like `/help` and `/tidy`, it
reads across every open record regardless of stage, so it isn't slotted into the
capture→specify→build chain.

**Naming.** `review-backlog` was chosen over `orient`/`backlog`/`survey`/`digest` for
directness. A companion rename of the existing `/claude-tweaks:review` → `review-code` for
symmetry was proposed and explicitly deferred (measured blast radius: `claude-tweaks:review` is
referenced in 46 files under `skills/` — 149 occurrences there alone — plus 3 in README.md and 20
across historical design docs, not counting unqualified `/review` prose mentions that would need
their own bare-word sweep). Nothing about shipping `review-backlog` requires the existing name to
change — `/claude-tweaks:review` remains unambiguous on its own.

### B. Architecture: two-lane pipeline

**Scoring-state split.** Every open record (all stages, both drivers) is fetched cheaply
(metadata only — `number,title,labels,updatedAt`, no bodies) and split by whether it carries
*both* `risk:*` and `effort:*` (the two labels `/specify`'s shaping and the health skills'
born-ready filing always stamp together):

- **Scored** — has both `risk:*` and `effort:*`. Eligible for Lane A. `priority:*` may or may not
  be present; its absence just means "unprioritized" for ranking purposes.
- **Unscored** — missing one or both. Eligible for Lane B. This is the actual content-legible
  blind spot — almost entirely `backlog`-stage records that never went through `/specify`.

**Lane A — mechanical (unlimited scale).** Pure label filter/sort over the scored bucket, no
body fetch, no LLM call. Scales to thousands of records the same way `/dispatch next`'s
`priority:*` → `risk:*` tie-break already does, because it *is* that same logic reused.

**Lane B — LLM judgment (bounded).** Only the unscored bucket's bodies are fetched, capped at
`--budget N` (default 40 — large enough for a genuinely useful multi-record synthesis, small
enough to keep one LLM pass coherent; same order of magnitude as the 12-issue read that motivated
this design, with headroom). Selection order when the unscored count exceeds the budget: oldest
`createdAt` first, surfacing the longest-neglected records first — matching `/tidy`'s existing
staleness bias. One synthesis pass over the fetched bodies produces: narrative + thematic
clusters, a per-record `priority:*` suggestion, and detected `**Related:**` cross-references. If
the unscored pool exceeds the budget, the report says so explicitly (e.g. "62 unscored records,
40 read this pass, 22 remaining — re-run to continue") — no silent truncation.

Named modes (`critical`/`risk-value`/`cleanup`, below) never invoke Lane B — they're pure Lane A
filters, so they stay cheap and safe to run repeatedly even on a very large backlog. Lane B only
fires on bare invocation.

### C. Command surface & modes

```
/claude-tweaks:review-backlog [mode] [--budget N]
```

- **Bare (no mode)** — full survey: Lane A renders all three mechanical views across the scored
  bucket, Lane B runs its bounded pass on the unscored bucket, then two sequential batch-confirms
  (priority suggestions, then `**Related:**` suggestions) render in order.
- **`critical`** — Lane A only, filtered to `risk:high` (cross-referenced with `priority:high`
  when set). Unscored records are excluded but their count is noted ("12 unscored records not
  risk-assessed yet — run bare mode for a judgment pass").
- **`risk-value`** — Lane A only, full ranked list sorted by `priority:*` band then `risk:*`
  band (reusing `/dispatch next`'s exact tie-break). Unscored records appear as a trailing "not
  yet scored" group rather than being dropped.
- **`cleanup`** — Lane A only, filtered to `effort:low`, grouped for a batch sweep.
- **`--budget N`** — only meaningful for bare mode; a no-op on the three named modes since they
  never touch Lane B.

### D. Preflight & driver support

Read `work-backend`. Unlike `/triage` (which hard-gates to `github-issues` only, because grants
are GitHub-RBAC-enforced), review-backlog supports **both drivers fully** — `priority:*` and the
`**Related:**` body line are meaningful label/frontmatter writes under either driver, not tied to
GitHub's audit trail.

- **`work-backend: github-issues`** — run the Detection Ladder (`_shared/github-pr-scan.md`
  checks 1-3) as a hard gate, same stance as `/triage` (there's no meaningful degraded mode when
  the whole fetch depends on `gh`). Additionally pull
  `queryRecords('specs', { unsynced: true })` (the same call `/tidy`'s Shape 3 already makes) and
  merge those records into the same facets-based dataset, tagged with a provenance marker so
  output can flag them distinctly (e.g. "⚠ not yet synced to GitHub"). They participate in
  whichever lane their scoring state puts them in, identically to GitHub-backed records.
- **`work-backend: local-files`** — skip the Detection Ladder entirely; fetch via
  `queryRecords('specs', {})` directly.

### E. Output & interaction

**Report format** — bare mode renders the Lane B narrative + clusters as prose (the same shape as
the manual 12-issue read that motivated this design), followed by mode-appropriate tables. Named
modes skip the narrative (nothing to synthesize) and render a table directly.

**Two sequential batch-confirms** when Lane B ran, each its own `AskUserQuestion` call per this
repo's one-decision-per-call convention:
1. Priority suggestions — exact `/triage` Step 3 pattern ("Apply the recommended priority to all,
   or override specific records?").
2. `**Related:**` suggestions — same pattern, separate call.

**Hand-off blocks** — offered contextually in Next Actions when a run produces a natural batch,
stage-aware:
- `ready` + granted records → a `/claude-tweaks:dispatch #N,#M,...` explicit-list line (mirrors
  `/triage`'s own Next Actions).
- `backlog`-stage records the user wants to parallelize shaping on → a multi-terminal
  `/claude-tweaks:specify #N` block, one command per terminal column (mirrors
  `help/reference-card.md`'s existing "Parallel specs" example format).

Never forced — only rendered when a mode's output has an actionable batch and the user asks for
it (or it's offered as a Next Actions option).

### F. Taxonomy / permission-matrix updates

`_shared/work-record.md`'s permission matrix gains a new actor row:

| Actor | Adds | Removes | Never |
|---|---|---|---|
| **`/review-backlog`** (survey, human-confirmed) | `priority:*` (human-confirmed via batch-apply), updates the `**Related:**` body line (human-confirmed) | nothing | `auto:*`, `bot:*`, `ready`, `risk:*`/`effort:*`, body-shaping |

`/specify`'s existing sentence ("no skill in this pipeline, including `/specify`, ever adds
[priority]") needs a small amendment naming `review-backlog` as the sole exception, gated on
human batch-confirmation — the same "human-applied only" invariant holds; one named actor changes.

Bidirectional Relationship-to-Other-Skills entries needed in: `/capture` (consumes/enriches its
`**Related:**` field), `/tidy` (unsynced-record reconciliation hand-off — review-backlog surfaces,
tidy fixes), `/help` (could surface an "N unscored records" nudge, mirroring how it already
surfaces `/triage`'s pending-authorization count), `/dispatch` (consumes `priority:*` for
tie-breaking), `/specify` (the shaping hand-off target for both backlog records and the
never-in-scope risk/effort/body work).

## Out of scope (YAGNI)

- **`review` → `review-code` rename.** Real, measured blast radius (46 files / 149 occurrences in
  `skills/` alone) and exactly the failure shape this repo's own CLAUDE.md has repeated scar
  tissue about — terminology migrations that miss occurrences until a whole-branch review catches
  them. Not required for `review-backlog` to read clearly on its own. If symmetry still matters
  later, it deserves its own dedicated design/plan/whole-branch-review, not a bundle here.
- **First-class dual-driver support.** Redefining `work-backend`'s semantics to allow a project to
  deliberately run both drivers as steady state (not just the existing `unsynced` fallback) would
  touch the canonical taxonomy contract and every consuming skill — `/triage`, `/tidy`, `/help`,
  `/dispatch`, `/specify`, `/capture` — not just this one. Out of scope for a single-skill design;
  the fold-in of `unsynced: true` records (section D) covers the actual reported need.
- **Persisted cross-run rotation** (a `review-backlog` cursor on the existing `health-state`
  branch, becoming a fifth consumer of `createDurableState`). Technically feasible with modest new
  code, but a simpler bounded-single-pass-with-honest-overflow-reporting model was chosen instead
  for v1. Revisit if `--budget`'s default proves too small in practice on a very large backlog.
- **`Blocked by #N` suggestion.** Only the soft `**Related:**` field is touched in v1; seeing this
  reliably distinguish "related" from "blocks" would need higher-confidence judgment than a first
  version should risk, given the downstream consequence of a wrong hard-dependency label.

## Decision log (from conversation)

| Decision | Rationale |
|---|---|
| Skill name: `review-backlog` | Direct, discoverable; no collision with existing terms (`survey` is already `/flow`'s end-of-run-analysis term; `digest` is already claimed by an open `/tidy` feature request; `brief` is already `/challenge`'s artifact) |
| `review` → `review-code` rename deferred | Measured 46-file/149-occurrence blast radius; not required for clarity; this repo has repeated history of exactly this migration shape going wrong |
| New standalone skill, not a `/tidy` or `/help` mode | `/tidy` is hygiene/problem-finding; `/help` is cheap/mechanical (Fast-tier, no deep judgment). Content synthesis needs real LLM judgment and a different mental model from both |
| Scope: all open records, every stage | A full-repo sense of priority was requested, not just unshaped backlog — `ready`/`authorized`/`building` records benefit from the same lenses |
| Read + suggest + apply (not report-only) | Revives the originally-intended-but-dropped "pre-filled priority suggestion" mechanism from the pre-taxonomy-rewrite design; reuses `/triage`'s already-proven batch-confirm pattern |
| Include `**Related:**` detection in v1 | The single most concrete, evidence-backed gap found in the real 12-issue pull (#21–#24 cross-referenced each other in prose with zero formal linkage) |
| Two-lane architecture (mechanical + bounded LLM) | The three named working modes map cleanly onto existing `risk:*`/`effort:*`/`priority:*` labels once scored — no LLM needed there; LLM judgment is unavoidable only for unscored records |
| Bounded single pass, no persisted rotation | Simplicity chosen over `health-state`-durable-storage integration; explicit overflow reporting instead (no silent caps) |
| Scope limited to `**Related:**` (soft), not `Blocked by #N` (hard) | A wrong hard-dependency suggestion has real downstream consequences (`/dispatch`'s queue selection); a wrong soft cross-reference doesn't |
| Fold in `unsynced` local records, don't fix them | Matches `/tidy`'s existing ownership of the sync action (Shape 3) — review-backlog surfaces, doesn't mutate outside its own taxonomy lane |
| First-class dual-driver support deferred | Would require redefining `work-backend`'s semantics plugin-wide, not just for this skill |

## Testing / verification approach

Pure, deterministic logic gets `node --test` unit tests, following this repo's existing split
between testable helpers and prose-level judgment:

- A new `bin/lib/issues/review-backlog.js` module: `splitScoredUnscored(records)`,
  `filterCritical(records)`, `rankRiskValue(records)` (reusing the same band logic as
  `/dispatch next`'s `bandOf`), `filterCleanup(records)`, `selectBudgetSlice(unscored, budget)`
  (oldest-`createdAt`-first), `mergeUnsyncedRecords(githubRecords, unsyncedRecords)`. All pure,
  all testable without network calls, mirroring `bin/lib/issues/tier.js`/`record.js`/`grouping.js`.
- The Lane B synthesis pass itself (narrative, clustering, priority/relationship suggestions) is
  prose-level LLM judgment, not unit-testable — validated via the shaped spec's acceptance
  criteria plus human review of real output during the build, same as every other LLM-judge skill
  in this repo (code-health, harness-health, journey-health, docs-health).
- Preflight reuses `_shared/github-pr-scan.md`'s already-tested Detection Ladder — no new
  preflight logic to test.
