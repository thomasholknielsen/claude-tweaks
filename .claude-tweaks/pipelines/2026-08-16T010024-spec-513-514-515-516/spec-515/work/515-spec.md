---
record: 515
origin: human
risk: medium
size: medium
ceremony: standard
grants: []
fingerprint: backlog-overview-funnel-design:backlog-overview-per-terminal-batch-emitter-with-chain-overl
blocked-by: [513, 514]
surface: backend
---
# 515: backlog overview: per-terminal batch emitter with chain, overlap, and claim integrity

Surface: backend

## Overview

Turn `/claude-tweaks:backlog overview`'s bare-mode hand-off into a per-terminal **batch emitter**: paste-ready fenced command blocks for every agent-executable funnel stage (score → `refine`, shape → `specify` fan-out, dispatch → `flow` chains), with mechanical integrity rules — chains render as chains and run sequentially in one terminal, file-overlapping records never share concurrent batches, claimed/in-flight records are excluded with a stated reason, nothing is dropped silently. Chain heads are ranked by transitive unblocks payout, making "this unblocks two other records" a visible structural signal instead of a buried tie-break. This sub-issue supersedes #467 and answers its three open questions: batch sizing (no artificial terminal cap — ranked blocks, the human takes the top *k*), double-dispatch protection (read existing claims; `dispatch`/`flow` still take claims at execution time), and placement (bare overview IS the emitter — no new mode).

**Complexity:** Medium
**Estimated tasks:** 7

## Non-Goals

- No needs-you lane and no `needs:definition`/`solution:unjustified` handling — the needs-you sub-issue owns the human lane, including excluding `needs:definition` from the shaping batch and annotating `solution:unjustified` rows. This sub-issue emits the agent-lane blocks only.
- No new claim/locking mechanism — the emitter *reads* `bot:in-progress` and existing claim state; it never takes or releases claims.
- No changes to `/claude-tweaks:dispatch` or `/claude-tweaks:flow` — they remain the executors; the emitter only composes their invocations.
- No changes to the funnel header or lens routing (funnel-render sub-issue) or to blocker resolution (dependency-integrity sub-issue) beyond consuming what they landed.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #513 | backlog overview: funnel header render, consequence-line trust, and lens demotion | open |
| #514 | backlog overview: native blocked-by resolution, ranking blockedBy expand-contract, and mode-aware refine repair | open |

Blocked by both: the paste blocks render inside the funnel layout, and chain drawing requires correct `blockersOf` resolution — drawing chains from body-prose guesses is exactly the failure the dependency sub-issue exists to prevent.

## Current State

- `skills/backlog/overview-mode.md` Step 4 — the current hand-off block: `dispatch #N,#M` for granted records and a multi-terminal `specify` block for backlog-stage records (the seed of the two-channel idea, without integrity rules).
- `bin/lib/issues/ranking.js` — post-dependency-sub-issue: `rankNextToBuild`, `blockersOf(candidate)` (single blocker-precedence helper), `findUnresolvedDependencyProse`; `computeUnblocksCount` is **direct-only** (counts candidates directly blocked by each id, not transitive).
- `bin/lib/issues/grouping.js` — `groupByFileOverlap(items)` (transitive file-overlap groups; shared with `/help`'s conflict detection and `/specify`'s implicit-dependency detection).
- `skills/dispatch/SKILL.md` / `_shared/issue-claims.md` — how claims are expressed (`bot:in-progress`, claim records); the emitter reads these, never writes.
- Menu contract: `SKILL.md`-level interaction style — `AskUserQuestion` for Next Actions.

## Deliverables

- [ ] `bin/lib/issues/ranking.js`: new pure `buildChains(candidates)` — using `blockersOf` (the exact helper #514 exports under that name; both new helpers call it, so blocker precedence and in-set scoping are decided in exactly one place, never re-implemented) — partition the candidate set into dependency components (each linearized topologically, head-first) and independent singletons. Return shape, single authoritative form used everywhere in this record including AC 1–2: `{ chains: number[][], independents: number[], cycles: {ids: number[]}[] }` — `cycles` always present (empty array when none); a cyclic component lands in `cycles`, never in `chains`, never an infinite loop or a silently broken chain.
- [ ] `bin/lib/issues/ranking.js`: new pure `transitiveUnblocksCount(candidates)` — Map<id, count> of how many other candidates in the set are transitively blocked behind each id (the chain-head payout). Must terminate on cyclic input via a visited set — same cycle-safety guarantee as `buildChains`, tested on the same cycle fixture. Direct-only `computeUnblocksCount` stays for `rankNextToBuild`'s existing tie-break (unchanged callers). In-set scoping (out-of-set blockers contribute nothing) is deliberate and worth this stated rationale: the payout answers "of the records you can currently act on, how many are behind this one" — an out-of-set blocker can't be dispatched from this report anyway. Accepted limitation, recorded.
- [ ] Tests for both helpers: linear chain (`A←B←C`: A's transitive count 2, chain ordered `[A,B,C]`), diamond (two records blocked by one head — one component, linearized without duplicating any record), cycle fixture asserting **both** helpers terminate and `buildChains` returns the component under `cycles`, singleton passthrough, and out-of-set blockers contributing nothing.
- [ ] `skills/backlog/overview-mode.md` Step 4 rewritten as the batch emitter. Input precondition, stated in the text: the candidate set is `funnelBuckets`' `dispatchable` ∪ `granted` (#513's buildable subset — already filtered; `needs:definition` records structurally can't be in it since they never reach `ready`, and the Shape block's own human-owed filtering is #516's). Ordering: **one combined ranking** over dependency components and independents alike — sort key `transitiveUnblocksCount` of the component head (an independent is its own head; usually 0) desc, then priority, then size, ties by id — no separate chains-first-then-independents grouping. Render rules: one fenced block per funnel stage that has members — `── Score the rest ──` (a `#`-comment line carrying the unscored count, then a single `/claude-tweaks:backlog refine` line — the count is comment-only; `refine` has no count flag), `── Shape next ──` (one `/claude-tweaks:specify #N` line per record, priority-ordered, one per terminal, `#`-comment with priority + one-line hook), `── Dispatch now ──` (per component: `# Terminal {k} — chain: #A ─▶ #B ─▶ #C (head unblocks {n})` header then **one** command carrying the whole chain in dependency order via `/claude-tweaks:flow`'s existing multi-ref form — `/claude-tweaks:flow #A,#B,#C` — which runs them as a sequential pipeline; that answers chain cardinality: one command per chain, all members listed, never head-only; independents as separate terminals with plain `/claude-tweaks:flow #N`). All commands fully qualified (`/claude-tweaks:` form).
- [ ] Batch integrity rules in the same Step 4 text: (a) records `groupByFileOverlap` groups together never appear in different concurrent terminal blocks — deciding criterion: members of the same *dependency component* are already serialized in one terminal by construction; a file-overlap group spanning **different** components/independents serializes them into one terminal when they are few (≤3 combined), otherwise excludes the lower-ranked with a `#`-comment naming the conflict; (b) `bot:in-progress`/claimed records are excluded from every block, one `#`-comment reason each, and counted in the funnel's `in flight` stage — the claim snapshot is read-only and may go stale between render and paste; that staleness is accepted risk, resolved downstream by `dispatch`/`flow`'s own claim-taking at execution time (state this in the text so the scan is never read as a completeness guarantee); (c) no silent caps — anything excluded or truncated is named with a count; (d) no artificial terminal cap — blocks emit in ranked order, the human takes the top *k*; (e) records flagged by `findUnresolvedDependencyProse` render as plain independents — no `─▶` arrows, own terminal, with a `#`-comment naming the suppressed chain and the refine repair pointer — never silently dropped (dropping would violate rule (c)).
- [ ] Two-channel contract stated in Step 4 + Next Actions: paste blocks carry agent-executable/unattended commands only; the `AskUserQuestion` menu carries this-session moves only (run refine here, open a lens, dispatch the top chain here) and is never the delivery channel for other-terminal command lists. The report body ends with a single `Next:` line — this record owns its definition: one sentence naming the top-ranked action, always exactly one, with this fallback ladder when `dispatchable` is empty: the top action of the highest-precedence non-empty stage (grant → specify → refine), ties broken by id, and a literal `Next: backlog is empty` terminal case. The menu's `(Recommended)` option MUST match that `Next:` line — one source of truth, stated as a MUST.
- [ ] Supersession bookkeeping: this sub-issue's landing closes #467 (already closed at decomposition time with a pointer; verify the closure comment references this record and the parent).

## Acceptance Criteria

1. `node --test` passes on new helper tests, including: `buildChains` on the fixture modeling the observed failure (three records, chain wired `418←419←420` via `blockedBy`) returns one chain ordered `[418, 419, 420]` and `transitiveUnblocksCount` gives 418 → 2.
2. Cycle fixture (`A blocks B, B blocks A`) — `buildChains` returns the component under `cycles` (per the single authoritative shape) and **both** helpers terminate; `transitiveUnblocksCount` returns finite counts for the cyclic ids.
3. `overview-mode.md` Step 4 contains all five integrity rules (a)–(e) above, greppable individually (overlap serialization with its deciding criterion, claim exclusion with the staleness note, no-silent-caps, no-terminal-cap, flagged-record plain-independent rendering), plus the `Next:` line definition with its fallback ladder.
4. Step 4's dispatch-block template shows the chain header format with `─▶` and the head's unblocks payout, chains emit as one multi-ref `/claude-tweaks:flow #A,#B,#C` command listing every member in dependency order, and every emitted command line in every block template uses the fully-qualified `/claude-tweaks:` form.
5. The two-channel contract appears once, states the menu-recommendation-must-match rule as a MUST, and explicitly forbids terminal-command lists inside `AskUserQuestion` options.
6. Reverting only the new helpers fails their tests (verify-test-discrimination — run the revert check).

## Technical Approach

All graph logic is pure and lives in `ranking.js` beside its existing siblings, reusing `blockersOf` so precedence is decided exactly once. The skill text consumes helper outputs and owns only rendering. Chain topological order: repeatedly emit candidates whose in-set blockers are all already emitted; anything never emitted is the cycle group.

### Data / API Surface

- `buildChains(candidates) -> { chains: number[][], independents: number[], cycles: {ids: number[]}[] }` — the same shape Deliverables states (one authoritative form; `cycles` always present, `[]` when none); a "chain" is any acyclic connected dependency component with ≥2 members, linearized topologically (ties by priority then id for determinism). Precondition: `candidates` is the buildable subset (`funnelBuckets` `dispatchable` ∪ `granted`), already carrying whatever `blockedBy` #514's assembly attached.
- `transitiveUnblocksCount(candidates) -> Map<id, number>` — in-set transitive closure only; visited-set termination on cycles.
- Consumed from #514, pinned by name: `blockersOf(candidate) -> number[]` (explicit `blockedBy` array preferred, `parseDependencies(c.body)` fallback). Do not start this sub-issue until #514 merges; if #514 ships a different contract, this record's helper specs are stale and must be re-checked first.

### Key Files

- `bin/lib/issues/ranking.js` — `buildChains`, `transitiveUnblocksCount`
- `tests/bin-lib/` (ranking's suite directory — read the listing first) — new cases
- `skills/backlog/overview-mode.md` — Step 4 rewrite + Next Actions channel contract

### Package Dependencies

None.

## Gotchas

- Determinism matters for testability and for stable re-renders: break all ordering ties by id after priority. No `Date.now()`/randomness in helpers.
- A dependency component isn't always a path — the diamond case must linearize without duplicating a record across "chains". One component = one terminal block.
- `groupByFileOverlap` groups are transitive — two records with disjoint files can share a group via a third; treat group membership, not pairwise overlap, as the conflict signal (same semantics `/help` and `/specify` already rely on).
- The claim-exclusion comment must name *why* (`# #472 skipped — bot:in-progress`), not just omit the record — silent omission reads as "covered everything" (no-silent-caps is the design's own rule; violating it in the emitter would be self-refuting).
- Do not let the emitter instruct taking claims "to be safe" — double-dispatch protection here is read-only by decision (parent record, Decision Rationale); `dispatch`/`flow` own claim-taking.

See parent record for Decision Rationale.


<!-- work-fingerprint: backlog-overview-funnel-design:backlog-overview-per-terminal-batch-emitter-with-chain-overl -->
