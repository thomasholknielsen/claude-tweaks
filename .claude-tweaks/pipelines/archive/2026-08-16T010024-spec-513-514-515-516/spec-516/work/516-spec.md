---
record: 516
origin: human
risk: low
size: low
ceremony: standard
grants: []
fingerprint: backlog-overview-funnel-design:backlog-overview-needs-you-lane-with-interactive-launchers-d
blocked-by: [515]
surface: backend
---
# 516: backlog overview: needs-you lane with interactive launchers (dormant-safe)

Surface: backend

## Overview

Add the funnel's second lane to `/claude-tweaks:backlog overview` bare mode: a **Needs you** section for human-owed records — `needs:definition` (hard-gated: cannot reach ready; remedy is a brainstorm with the human) and `solution:unjustified` (non-gating: remedy is a one-line evidence-or-accept-risk judgment). These are the only records the batch emitter cannot schedule, which makes them the funnel's structural bottleneck. The section renders last before the menu (a terminal's most prominent position), gives every record an **interactive launcher command** — `/claude-tweaks:specify #N` (whose `needs:definition` redirect bounces into the brainstorm) and `/claude-tweaks:challenge #N` (the framing/evidence pass ending at the human's one-line call) — and is the menu's default-recommended option whenever non-empty: paste blocks send agents to work; this session's recommended move is the work only the human can do. Ships **dormant-safe**: the label family (#471/#472) has not landed — a missing facet yields a zero count and the section simply doesn't render.

**Complexity:** Low
**Estimated tasks:** 4

## Non-Goals

- No implementation of `needs:definition`/`solution:unjustified` themselves — labels, producers, facet parsing, specify's redirect gate, and `/backlog attention` are #471's decomposition. This sub-issue only *consumes* `facets.needsDefinition` (and the `solution:unjustified` facet) when present.
- No deep per-record surface — `/backlog attention` (planned in #471's decomposition) remains the discovery surface for a long human-owed queue; overview names the top 2–3 and points there beyond that.
- No hard dependency links to #471/#472 — deliberately unlinked (parent record, Decision Rationale); this must build and pass green before those records land.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #515 | backlog overview: per-terminal batch emitter with chain, overlap, and claim integrity | open |

Blocked by the funnel-render sub-issue (via the batch-emitter chain): the lane renders inside the funnel layout, its branch line extends the funnel header, and the shaping-batch exclusion edits the emitter's Shape block.

## Current State

- `skills/backlog/overview-mode.md` — post-earlier-sub-issues: funnel header (pipeline-order stages), annotation lines, Step 4 batch emitter with Shape/Dispatch blocks, Next Actions menu with the recommendation-must-match rule.
- `bin/lib/issues/record.js` — `parseRecordFacets`; `facets.framing` is the existing presence-only boolean pattern; `facets.needsDefinition` is #472's planned twin (identical parse shape). Neither `needs:definition` nor `solution:unjustified` exists on this repo yet.
- `bin/lib/issues/backlog.js` — `funnelBuckets` (funnel-render sub-issue).
- #471 (parent, open): defines both labels' remedies, the specify redirect, `/backlog attention`, and the `framing:baked` → `solution:unjustified` rename.

## Deliverables

- [ ] `bin/lib/issues/backlog.js`: `funnelBuckets` gains a `needsYou` **overlay** — not a ninth stage. Every record keeps exactly one primary stage bucket per #513's precedence rules (stage counts and the sum-to-total invariant are untouched — this genuinely is expand-only: keys unchanged AND populations unchanged); `needsYou` is an additional list of `{id, kind}` for records whose facets carry `needsDefinition` (key name pinned by #472) or `solutionUnjustified` — the latter is the *expected* post-#471-rename key, read on that name now with a discoverable reconciliation marker (a code comment and a test name both citing #471) so the rename cannot land without tripping over this consumer; if #471 ships a different key, this half stays dormant and the marker is the tripwire (accepted rework risk, recorded). A record carrying both facets yields one entry with `kind: 'definition'` — the hard gate dominates. Exclusion of `needs:definition` records happens at *render* (the Shape paste block, below), never in the bucket data. Tests: dormant regression pin (no needs-facets → `needsYou` empty, every bucket deep-equal to pre-change output), definition-overlay case, unjustified-overlay case (fixture stamps the expected key), both-facets precedence case.
- [ ] `skills/backlog/overview-mode.md`: funnel header gains the branch line `└─ needs you: N` (rendered only when N > 0), fed from `needsYou`.
- [ ] `skills/backlog/overview-mode.md`: the `── Needs you ──` section — rendered last before Next Actions, only when non-empty; one line per record with an interactive launcher: `needs:definition` → `/claude-tweaks:specify #N` with a `#`-comment naming the label, waiting-age, and what deciding it releases; `solution:unjustified` → `/claude-tweaks:challenge #N` with a `#`-comment naming the one-line call. Ordering and its inputs, stated precisely: `needsYou` stays `{id, kind}`; the render joins each id back to the faceted record set for `facets.priority` (the existing `priority:*` convention) and `createdAt` (already in the overview fetch), and reads releases-count from #515's `transitiveUnblocksCount` (pinned helper name) — sort by releases desc, then priority, then age; this join is render-level skill text by design (duplicating rank inputs into the bucket tuple would create a second copy of facet data to drift). At most 3 rows named; beyond that, one pointer line to `/claude-tweaks:backlog attention` (advisory until that mode ships — phrase as "when available" with the count still shown). The interim-launcher caveat in the text cites #471 by number, so the caveat's removal is discoverable from #471's own landing.
- [ ] `skills/backlog/overview-mode.md`: batch-emitter integration — the Shape block excludes `needs:definition` records with this verbatim comment format, satisfying the emitter's no-silent-caps rule: `# #N excluded — needs:definition: yours to decide (see Needs you below)`; `solution:unjustified` records appearing in any batch carry the annotation `# ⚠ solution:unjustified — one-line evidence call pending`. Next Actions: when `needsYou` is non-empty, the menu's `(Recommended)` option is doing the top Needs-you item in this session — a purely textual per-invocation rule (recomputed from the current ordering every run; no session state, no stored binding), composed with #515's recommendation-must-match MUST: the `Next:` line and the recommended menu option both point at that same top item.

## Acceptance Criteria

1. `funnelBuckets` tests pass, including the dormant regression pin: on a fixture with no needs-facets, output deep-equals the pre-change function's output for every bucket.
2. A `needs:definition` fixture record appears in `needsYou` **and** keeps its primary stage bucket (overlay semantics — stage sums unchanged); a fixture stamping the expected `solutionUnjustified` key appears in `needsYou` with `kind: 'unjustified'`; a fixture carrying both facets yields exactly one `needsYou` entry with `kind: 'definition'`; the test names for the unjustified cases cite #471 (the reconciliation marker).
3. `overview-mode.md` contains: the conditional branch-line rule (render only when N > 0), the section-placement rule (last before Next Actions), both launcher command mappings in fully-qualified form, the ≤3-rows-then-attention-pointer rule, and the ordering rule (released, priority, age).
4. The Shape-block exclusion and the `solution:unjustified` batch annotation are stated in the emitter text, each with its `#`-comment format.
5. The Next Actions text states that a non-empty `needsYou` makes the top Needs-you item the `(Recommended)` menu option.
6. Reverting only the `funnelBuckets` change fails its new tests (verify-test-discrimination — run the revert check).

## Technical Approach

Pure-data extension of `funnelBuckets` plus skill-text rendering — no new modules. The launcher mapping finalizes with #471's companion (gate/redirect) sub-issue; until the redirect ships, `/claude-tweaks:specify #N` on a `needs:definition` record still lands in shaping mode (acceptable interim: the human is present either way), so nothing here breaks pre-#471 — state this in the skill text as the interim behavior rather than hiding it.

### Data / API Surface

- `funnelBuckets(records)` return value gains `needsYou: [{id, kind: 'definition'|'unjustified'}]` as an overlay list; existing bucket keys **and** their populations unchanged (true expand-only — a record in `needsYou` still occupies its one primary stage bucket, so exclusivity and sum-to-total invariants hold exactly as #513's tests pin them). One entry per record; `definition` wins when both facets are present.

### Key Files

- `bin/lib/issues/backlog.js` — `funnelBuckets` extension
- `tests/bin-lib/` (backlog.js's suite directory — read the listing first) — new cases
- `skills/backlog/overview-mode.md` — branch line, Needs-you section, emitter integration, menu rule

### Package Dependencies

None.

## Gotchas

- **`facets.framing` is not `solution:unjustified`.** #471 renames `framing:baked` → `solution:unjustified` with changed (non-gating, evidence-search) semantics. Do not wire `facets.framing` as an interim source — a `framing:baked` record today has not been through the new remedy definition, and wiring it would make the lane fire with the wrong remedy text. Read the facet key #471's decomposition actually ships; until it exists, the `unjustified` half of the lane is simply dormant too.
- Dormant-safety is the whole point of the unlinked dependency: every deliverable must behave as a no-op (no section, no branch line, unchanged buckets) on a repo without the labels. The regression pin in AC 1 is the enforcement — don't weaken it to a smoke test.
- Presence-only facet parsing: match `facets.framing`'s exact absent/false convention in `record.js` when reading the new keys — don't invent a third convention (same rule #472 sets for its own parser).
- The interim-launcher honesty note (Technical Approach) belongs in the skill text — silently documenting the post-#471 behavior as if it were current violates the fail-loud rule.
- Age computation for ordering: records already carry `createdAt` from the overview fetch; no new fetch fields needed.

See parent record for Decision Rationale.


<!-- work-fingerprint: backlog-overview-funnel-design:backlog-overview-needs-you-lane-with-interactive-launchers-d -->
