---
record: 513
origin: human
risk: low
size: medium
ceremony: standard
grants: []
fingerprint: backlog-overview-funnel-design:backlog-overview-funnel-header-render-consequence-line-trust
surface: backend
---
# 513: backlog overview: funnel header render, consequence-line trust, and lens demotion

Surface: backend

## Overview

Rewrite `/claude-tweaks:backlog overview`'s bare mode into a funnel decision surface: an ASCII funnel header (populations + verbs only, pipeline order, most actionable stage last), at most two annotation lines (trust consequence, parked/not-planned pointer), single-appearance of every record, failure-only process narration, and demotion of the `critical`/`risk-value`/`cleanup` tables plus the full trust table to explicit lenses. This is Phase 1 of the funnel redesign (see parent record's Decision Rationale): it removes most of the observed noise on its own, before the batch emitter and needs-you lane land in later sub-issues.

**Complexity:** Medium
**Estimated tasks:** 5

## Non-Goals

- No paste-ready command batches yet — stages end in counts plus their single-command pointer (`/claude-tweaks:backlog refine`, lens names). The per-terminal emitter with chain/overlap/claim integrity is the batch-emitter sub-issue.
- No needs-you lane — that sub-issue adds the human-lane section and the funnel's `needs you` branch line.
- No changes to dependency resolution or `ranking.js` — that's the dependency-integrity sub-issue.
- No changes to `_shared/trust-table.md`'s Render contract or any other consumer of it (`grant-mode.md`, `refine-mode.md`, `help/status-scan.md`, the PR-scan contracts) — only *where overview renders it* moves.

## Prerequisites

None — this is the foundational sub-issue of the decomposition.

## Current State

- `skills/backlog/overview-mode.md` — Step 1.5 renders the full trust table every invocation ("runs once per invocation, independent of which lens"); Step 2 routes lenses and defines bare mode as "render all three views above as a compact summary" (undefined — observed sessions drift to three full tables); Step 3 renders a "Recommended next" callout; Step 4 is the hand-off block.
- `skills/backlog/SKILL.md` — mode/lens routing and argument-hint for the backlog skill.
- `skills/_shared/trust-table.md` — the shared Fetch/Render contract; its framing note references overview's Step 1.5.
- `bin/lib/issues/backlog.js` — `filterCritical`, `rankRiskValue`, `filterCleanup`, `splitScoredUnscored` (existing lens computations, all pure); `mergeUnsyncedRecords`.
- `bin/lib/issues/record.js` — `parseRecordFacets` (stage, grants, priority, risk/size facets).
- Tests: `tests/bin-lib/` — per-module suites as flat sibling directories (see CLAUDE.md Structure); `node --test` built-in runner, no external deps.

## Deliverables

- [ ] `bin/lib/issues/backlog.js`: new pure `funnelBuckets(records)` returning `{ captured, scored, shaped, granted, dispatchable, inFlight, parked, notPlanned }` — mutually exclusive buckets over the faceted record set (all eight bucket definitions, precedence order, and precedence rationale in Data / API Surface below). Input is the **post-merge** faceted set (github + unsynced, i.e. what `mergeUnsyncedRecords` produced — unsynced records participate in totals). Follows the module's existing purity contract (no I/O).
- [ ] Unit tests for `funnelBuckets` in the module's existing test location: exclusivity (every open record in exactly one bucket), sum-to-total, each of the eight buckets' defining facet combination, empty-input behavior, and one fixture per adjacent-precedence pair (at minimum: `bot:in-progress`+`parked` → `inFlight`; `bot:in-progress`+ready+grant → `inFlight`; ready+grant+non-empty `blockedBy` → `granted` not `dispatchable`) so the chosen precedence is pinned, not incidental. These tests are also the facet-shape contract: they exercise the real `parseRecordFacets` key names, so a `record.js` rename fails here loudly.
- [ ] `skills/backlog/overview-mode.md` Step 2 bare mode rewritten: render the funnel header from `funnelBuckets` output — one line per stage in pipeline order `captured ▶ scored ▶ shaped ▶ granted ▶ dispatchable ▶ in flight`, counts beneath, each stage's verb/pointer beneath that per this fixed table (fully-qualified per CLAUDE.md's cross-reference rule):

  | Stage | Verb / pointer |
  |---|---|
  | captured | `/claude-tweaks:backlog refine` (score them) |
  | scored | `/claude-tweaks:specify #N` (shape them) |
  | shaped | `/claude-tweaks:backlog grant` (or dispatch here with the human gate) |
  | granted | *(no pointer — waiting on blockers; the blocker itself appears in the dispatch hand-off)* |
  | dispatchable | `/claude-tweaks:dispatch` / `/claude-tweaks:flow #N` |
  | in flight | *(no pointer — informational; claims honored)* |

  The header ends at `in flight` deliberately even though it is not the most actionable stage: the header is the process axis read left-to-right; the terminal-tail actionability principle is satisfied by the report's *body* ending in the hand-off and Next sections, not by the header's last column. Then at most **two annotation lines total**: one trust-consequence line (all non-clean cells collapsed into that single line, semicolon-separated — the per-cell phrasing never multiplies lines) when any applicable verdict ≠ clean, and one `parked N · not-planned M → /tidy owns these` line when non-zero. Bare mode renders **no** Critical/Risk-Value/Cleanup tables and no record ids in the header.
- [ ] `skills/backlog/overview-mode.md` Step 1.5 revised: the trust fetch/computation still runs once per invocation, but bare mode renders only the single collapsed consequence line described above (e.g. `trust: clean, except human:human|low (mixed) → merges below stay PR-gated`) — nothing at all when no cell verdict requires it. The verdict vocabulary is read verbatim from `bin/lib/issues/trust.js`'s row verdicts as `_shared/trust-table.md` defines them — nothing new is invented here: the consequence line renders for cells whose verdict is neither `clean` nor `insufficient-evidence`; `insufficient-evidence` cells render nothing in bare mode (their table is one lens away). A new `trust` lens renders the full table per `_shared/trust-table.md`'s Render section verbatim (uncapped, unchanged contract). Update `_shared/trust-table.md`'s framing-note pointer to overview if it names Step 1.5's render placement.
- [ ] `skills/backlog/overview-mode.md` Step 3: the candidate assembly's buildable subset is redefined as `funnelBuckets` output (`dispatchable` ∪ `granted`) so the header's counts and the recommendation's population can never drift apart — one predicate, owned by `funnelBuckets`.
- [ ] `skills/backlog/overview-mode.md`: failure-only narration rule — interstitial status lines render only when a check fails or degrades (truncation hit, fetch fallback, trust fetch skipped), never to announce a step ran. `skills/backlog/SKILL.md`: lens list / argument-hint gains `trust`.

## Acceptance Criteria

1. `funnelBuckets` test: for a fixture set covering all eight bucket-defining facet combinations exactly as Data / API Surface defines them (including `granted` = ready + grant + non-empty in-set `blockedBy`, and `dispatchable` = ready + grant with `blockedBy` absent or empty), every record lands in exactly one bucket and bucket sizes sum to the input length; the adjacent-precedence-pair fixtures from Deliverables assert their intended winners. `node --test` passes.
2. `grep -c "Risk-Value\|filterCritical\|filterCleanup"` style check, concretely: `overview-mode.md`'s bare-mode section contains the literal funnel-stage sequence `captured ▶ scored ▶ shaped ▶ granted ▶ dispatchable ▶ in flight` and states that bare mode renders no lens tables; the three lens renders remain reachable under their lens headings.
3. `overview-mode.md` contains a `trust` lens that cites `_shared/trust-table.md`'s Render section, and Step 1.5's bare-mode text contains the collapsed single-line consequence rule (including render-nothing-when-clean and the `insufficient-evidence`-renders-nothing case). `git diff` on `skills/_shared/trust-table.md` shows no hunk beyond the framing-note pointer (the shared contract is otherwise byte-identical to before this sub-issue).
3b. `overview-mode.md` Step 3's buildable-subset wording names `funnelBuckets` (`dispatchable` ∪ `granted`) as its population source — no independently restated predicate remains.
4. `overview-mode.md` contains the failure-only narration rule; no step in the rewritten bare-mode path instructs announcing a passed check.
5. `skills/backlog/SKILL.md`'s lens/argument surface lists `trust`. Every stage line in the funnel-header template names a fully-qualified `/claude-tweaks:` command or an explicit lens invocation.

## Technical Approach

Bare mode becomes: fetch (Step 1, unchanged) → trust compute (Step 1.5, render demoted) → `funnelBuckets` → funnel header + annotation lines → Step 3 recommendation (unchanged in this sub-issue) → Step 4 hand-off (unchanged in this sub-issue). Lens invocations (`critical`, `risk-value`, `cleanup`, `trust`) keep their existing full renders and their existing skip-to-Step-4 routing.

### Data / API Surface

`funnelBuckets(records)` — input: the post-merge faceted record array, i.e. `parseRecordFacets` output shape per that function's own implementation in `bin/lib/issues/record.js` (the source of truth for the shape — not any transient artifact). Records **may** additionally carry a `blockedBy: number[]` field (attached upstream; the dependency-integrity sub-issue #514 is what starts populating it — until then the field is simply absent). Output: all eight buckets, mutually exclusive, first match wins in this order:

1. `inFlight` — `facets.bot === 'in-progress'` (or the equivalent in-progress facet `parseRecordFacets` exposes).
2. `parked` — `facets.stage === 'parked'`.
3. `notPlanned` — the not-planned facet (however `parseRecordFacets` exposes the `not-planned` label; read the implementation, don't invent a key).
4. `granted` — `facets.stage === 'ready'` && (`facets.grants.build` || `facets.grants.merge`) && `blockedBy` is a non-empty array whose ids are within the open input set (granted, but waiting on a blocker).
5. `dispatchable` — `facets.stage === 'ready'` && (`facets.grants.build` || `facets.grants.merge`) — reached only when rule 4 didn't match, i.e. no unresolved in-set blockers (including the `blockedBy`-absent case: before #514 lands, every granted record resolves here, and `granted` is empty by construction — that dormancy is intended, not a bug).
6. `shaped` — `facets.stage === 'ready'` (without grants).
7. `scored` — not `ready`, but has any of `facets.priority`/`facets.risk`/`facets.size`.
8. `captured` — everything else (open, unscored, unshaped).

**Precedence rationale** (pinned by the adjacent-pair fixtures in Deliverables): bot-state outranks stage labels because live work reflects current reality — a record simultaneously `bot:in-progress` and `parked`/`ready` is in a near-contradictory state, and the funnel resolves it toward what is actually happening right now; `granted` is checked before `dispatchable` so a blocked grant can never render as go-now.

The implementer MUST read `parseRecordFacets` in `bin/lib/issues/record.js` first and use its actual key names/shapes for grants, bot-state, and not-planned — the names above describe intent, and `record.js` is the source of truth (CLAUDE.md: read before you write). The new tests double as the facet-shape contract (see Deliverables).

### Key Files

- `bin/lib/issues/backlog.js` — add `funnelBuckets`
- `tests/bin-lib/` (the module's existing suite directory for `backlog.js` — read the directory listing before assuming a filename) — new tests
- `skills/backlog/overview-mode.md` — Step 1.5 and Step 2 rewrite, `trust` lens, narration rule
- `skills/backlog/SKILL.md` — lens surface
- `skills/_shared/trust-table.md` — framing-note pointer only

### Package Dependencies

None — `node --test` built-in runner; pure functions only.

## Gotchas

- `_shared/trust-table.md`'s "never cap or truncate the row count" rule stays absolute *where the table renders* (the `trust` lens, grant-mode) — this sub-issue moves the render, it must not weaken the contract.
- The one existing consumer relationship to check: `docs/skill-graph.md` states every inter-skill edge once — adding the `trust` lens is intra-skill, but if any edge names overview's trust render, update it there and nowhere else.
- Test count varies run-to-run under machine load on this repo — re-run only the affected file in isolation before concluding breakage (CLAUDE.md Commands note).
- Skill-text instructions that pass a skill name to the Skill tool must use the fully-qualified `/claude-tweaks:{skill}` form (CLAUDE.md cross-reference rule); bare short forms are for descriptive prose only.
- Terminal rendering premise: output is read from the tail — do not "fix" the funnel back to conclusion-first ordering; bottom placement is deliberate.
- The funnel header replaces the summary counts too — resist re-adding a prose counts paragraph above it; the header *is* the counts.

See parent record for Decision Rationale.


<!-- work-fingerprint: backlog-overview-funnel-design:backlog-overview-funnel-header-render-consequence-line-trust -->
