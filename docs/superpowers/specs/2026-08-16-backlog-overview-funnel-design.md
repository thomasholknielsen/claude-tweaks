# Backlog overview as a funnel decision surface

Design doc. Written 2026-08-16. Absorbs #467 ("Orchestration mode: bucket backlog by
build-readiness, emit parallel-terminal command batches") — this document is the brainstorm
that record asked for, and its spec input. Consumes the `needs:definition` /
`solution:unjustified` label family from #471/#472 without redesigning any of it.

## The problem, observed

A real `/claude-tweaks:backlog overview` bare-mode run on this repo (104 open records,
2026-08-15) produced an output whose single most valuable fact — *build #418 next* —
appeared exactly once, inside a caveat paragraph refuting the tool's own headline
recommendation. To reach it, the reader scrolled past ~15 lines of step-compliance
narration, a 12-column × 10-row trust table (seven rows `insufficient-evidence` with
totals ≤ 7), and three record tables in which six records each appeared two or three
times. The screen ended with **three competing sources of truth**: the mechanical ranker
said #420, the model's caveat said #418, and the menu's "(Recommended)" flag sat on
`refine`.

Two root causes, one per layer:

- **Spec ambivalence.** `overview-mode.md` Step 3 disclaims `/help`'s status role, yet
  Step 1.5 bolts a repo-wide governance table onto every invocation — a status artifact on
  an action surface. Bare mode's "compact summary" is undefined, and observed sessions
  drift to full tables. Most of the noise is *mandated*, so it recurs until the spec
  changes.
- **A silent data/parser mismatch.** `rankNextToBuild` reads dependencies via
  `record.js`'s `parseDependencies`, which matches only canonical line-start
  `Blocked by #N`. The #418/#419/#420 chain carried its ordering in prose, parsed as zero
  blockers on all three, and the ranker confidently mis-ordered them. The model caught it
  by reading bodies — then rendered both the wrong answer and the correction.

## The purpose test

Bare `overview` has one job: **convert backlog state into executed work, fast** — pick the
next action in this session, and farm out everything that can run in parallel elsewhere.
That yields a hard test for every analytical dimension: *does it change which command gets
run in the next sixty seconds?*

| Dimension | Verdict | Action it drives |
|---|---|---|
| Buildability (ready + granted + unblocked) | pass | the dispatch paste block |
| Dependency order / chains | pass | batch composition and sequence |
| File overlap (keyFiles) | pass — promoted from hidden tie-break to load-bearing | which records may run concurrently |
| Live claims (`bot:in-progress`, sibling sessions) | pass — currently absent from overview | exclusion from batches (#467's double-dispatch protection) |
| Priority / criticality | pass | ordering within stages |
| Shaping state (backlog-stage) | pass | the specify fan-out block |
| Unscored count | pass, one line | one command: `backlog refine` |
| Human-owed labels (`needs:definition`, `solution:unjustified`) | pass — the second lane, see below | interactive launcher commands |
| Trust table | fail as evidence; pass only as its *consequence* | one constraint line on the dispatch block |
| Age, cleanup, parked | weak — `/tidy` owns the remedy | count + pointer |

Two principles fall out and govern every render decision below:

1. **Report consequences, not evidence.** Trust renders as the constraint it imposes
   ("merges below stay PR-gated"), never as the 12-column table. Evidence stays one
   command away (grant-mode and a lens render the shared contract unchanged).
2. **Every reported line carries a paste-ready command.** No population is ever rendered
   as information only. The channel split is *unattended vs interactive* commands — never
   command vs prose.

## The funnel model

Every open record sits at exactly one **distance from dispatchable**, and every distance
has exactly one canonical verb. Bare mode renders that funnel in claude-tweaks process
order — capture → score → shape → grant → dispatch — which in a terminal puts the most
actionable stage at the bottom, next to the prompt. Reading order = process order =
urgency order.

The funnel has **two lanes**:

- **Agent lane** — populations whose verb an agent can execute unattended (`refine`,
  `specify`, `flow`). These become per-terminal paste blocks.
- **Human lane** — records carrying `needs:definition` (hard-gated: cannot reach ready;
  remedy is a brainstorm with the human) or `solution:unjustified` (non-gating; remedy is
  a one-line evidence-or-accept-risk judgment). These are the only work the batch emitter
  cannot schedule, which makes them the funnel's structural bottleneck: every undecided
  record starves future shaping and building regardless of how many terminals are
  running. They get **interactive launcher** commands — a fresh terminal the human
  drives — not a prose list.

The division of labor this produces is deliberate: the paste blocks send agents to work;
the current session's recommended move is the work only the human can do.

## The report contract (bare mode)

Target shape. Record ids are the observed session's where they exist (#418 chain, #81,
#117, #276); the Needs-you rows and per-stage counts are illustrative — the label family
has not shipped yet and the session's populations don't decompose cleanly into these
stages:

```
Backlog — 104 open

  captured ▶ scored ▶ shaped ▶ granted ▶ dispatchable ▶ in flight
     94        6        3        2          4             0
                └─ needs you: 2

  trust: clean, except human:human|low (mixed) → merges below stay PR-gated
  parked 12 · not-planned 16 → /tidy owns these

── Score the rest ──
  /claude-tweaks:backlog refine   # 94 records missing priority; also stamps
                                  # machine-readable Blocked-by on #418/#419/#420

── Shape next (priority-ordered, no file overlap — one per terminal) ──
  /claude-tweaks:specify #81    # high — node -e extractor for issue-body reads
  /claude-tweaks:specify #117   # medium — stamp health-sweep verification commit

── Dispatch now (dep-ordered; chain = one terminal, sequential) ──
  # Terminal 1 — chain: #418 ─▶ #419 ─▶ #420  (head unblocks 2)
  /claude-tweaks:flow #418
  # Terminal 2 — independent
  /claude-tweaks:flow #276

── Needs you (2) — interactive: open a terminal each, you drive ──
  /claude-tweaks:specify #47x     # needs:definition — redirects into the brainstorm; unblocks 2
  /claude-tweaks:challenge #4xx   # solution:unjustified — evidence search, then your one-line call

❯ 1. Define #47x here, now (Recommended)
  2. /claude-tweaks:backlog refine
  3. Open a lens (trust / risk-value / cleanup / attention)
```

Contract rules, each independently checkable:

- **The funnel header is populations and verbs only** — one line per stage, counts, no
  record ids. It replaces the trust table, all three lens tables, and the summary counts.
- **At most two annotation lines** below the header — trust consequence and
  parked/not-planned pointer — each rendered only when non-zero/non-clean. A clean repo's
  header is five lines total.
- **Every record appears exactly once**, in the paste block of its funnel stage. The
  Critical/Risk-Value/Cleanup projections never render in bare mode; they survive as
  explicit lenses.
- **Paste blocks are honest about parallelism**: a chain is one terminal run sequentially;
  independent records are separate terminals; file-overlapping or claimed records are
  excluded with a one-line `#`-comment stating why. No silent caps: nothing is dropped
  without a rendered count.
- **"Needs you" renders last before the menu** — the most prominent terminal position —
  with one interactive launcher per record: `/claude-tweaks:specify #N` for
  `needs:definition` (the #471 brainstorm redirect *is* the launcher),
  `/claude-tweaks:challenge #N` for `solution:unjustified`. This mapping finalizes with
  #471's companion (gate/redirect) sub-issue; until then the same commands work via
  today's behavior, just without the hard gate.
- **The menu (AskUserQuestion) carries only this-session moves** — do the top Needs-you
  item here, run refine here, open a lens. It is convenience, never the only path to any
  action, and never a delivery channel for other-terminal command lists.
- **The recommendation is singular and final.** If the model detects the mechanical
  ranking is wrong (see Dependency integrity below), the corrected pick *replaces* the
  headline; the ranker's raw pick demotes to a one-line footnote. Never render a
  recommendation the same output retracts.
- **Process narration is failure-only.** Interstitial status lines render only when a
  check fails or degrades (truncation hit, fetch fallback, trust fetch skipped) — never to
  announce that a step ran.

## Ranking: unblocking is a first-class signal

- Within **dispatchable**: chain heads first, ranked by transitive unblocks count, then
  priority, then size. A chain head outranks a same-priority standalone record because it
  pays out more than itself. Chains render inline (`#418 ─▶ #419 ─▶ #420`) with the head's
  payout annotated.
- Within **shaping**: priority, then unblocks, then age.
- Within **needs-you**: what deciding it releases (records blocked behind the
  definition), then priority, then age — a stale definition blocking two features is the
  loudest line in the report.

## Dependency integrity (hard prerequisite)

Chains are the centerpiece visual, so the prose/parser mismatch that mis-ordered
#418/#419/#420 must become impossible to hit silently. Three coordinated pieces, none of
which change `parseDependencies` semantics (its canonical-line contract has other
consumers and guessing from prose would trade a loud gap for quiet wrong parses):

1. **Detection in overview.** After ranking, a cheap mechanical check: any candidate whose
   body matches `/blocked by #\d/i` while parsing to zero blockers flags the whole
   dispatchable block — loudly, with the affected ids and a `refine` pointer — and
   suppresses chain rendering for those records rather than rendering a wrong chain.
2. **Repair in refine.** `refine` mode's apply step gains stamping of canonical line-start
   `Blocked by #N` lines derived from prose dependencies (surfaced for confirmation like
   its other label writes, per its existing gates).
3. **Headline replacement.** When detection fires (or the model otherwise concludes the
   mechanical order is wrong), the corrected order is the recommendation — per the report
   contract above.

## Batch integrity rules

- **Claims / live sessions:** records carrying `bot:in-progress` or a live sibling-session
  claim are excluded from every batch, rendered as the `in flight` count with a one-line
  reason per exclusion. This is #467's double-dispatch protection, answered with the
  existing claim mechanisms (`_shared/issue-claims.md`, dispatch's claim labels) — no new
  locking is introduced; the emitter *reads* claims, `dispatch`/`flow` still *take* them
  at execution time as today.
- **File overlap:** keyFiles-overlapping records never share concurrent batches; the later
  one is excluded with a comment naming the conflict, or serialized into the same
  terminal.
- **`needs:definition`:** excluded from shaping batches — `specify` would bounce it to a
  brainstorm needing the human, wasting a terminal. It appears only in the Needs-you lane.
- **`solution:unjustified`:** included in batches but annotated
  (`# ⚠ solution:unjustified — one-line evidence call pending`). Exclusion would
  over-enforce what #471 deliberately made non-gating.
- **Batch sizing:** no artificial terminal cap. Blocks are emitted in ranked order,
  grouped by chain/independence; the human takes the top *k* they have terminals for.
  This answers #467's "batch sizing" question by declining to invent a knob.

## What demotes, and what is untouched

- **Lenses:** `critical`, `risk-value`, `cleanup` keep their current lens renders; a new
  `trust` lens renders the full shared trust table. Bare mode renders none of them.
  Global risk-value ranking survives only as intra-stage ordering — a whole-backlog
  ranking over 104 records was analysis theater when the actionable populations are this
  small.
- **`overview-mode.md` Step 1.5** is revised: bare mode computes trust but renders only
  the consequence line; the full render moves to the `trust` lens. The step's "runs once
  per invocation" data fetch stays (the consequence line needs it).
- **Untouched:** `_shared/trust-table.md`'s render contract and its other consumers
  (`grant-mode`, `refine-mode`, `help/status-scan`, the PR-scan contracts) — the grant
  gate keeps its full evidence view. `/backlog attention` remains the deep surface for a
  long human-owed queue (#471's decision stands); overview shows the top 2–3 and points
  there beyond that. `ranking.js`/`record.js` parsing semantics unchanged.

## Record wiring

- **#467** — absorbed. Its three open questions are answered above (sizing: no knob;
  double-dispatch: read existing claims; placement: bare overview *is* the emitter — no
  new mode). Close it into this design's decomposition when `/claude-tweaks:specify`
  materializes the work units.
- **#472 / #471** — consumed, soft dependency. The Needs-you lane reads
  `facets.needsDefinition` (#472) and the `solution:unjustified` rename (#471 companion).
  Until those land, the lane is dormant: a missing label yields a zero count and the
  section simply doesn't render. Nothing here blocks on them; nothing here re-implements
  them.

## Phase 1: Funnel render and lens demotion

Rewrite `overview-mode.md`'s bare mode: funnel header, annotation lines, single-appearance
rule, failure-only narration, lens demotion (including the new `trust` lens and the
Step 1.5 revision). No batch emission yet — stages end in counts plus their single-command
pointers (`refine`, lens names). This phase alone removes most of the observed noise.

## Phase 2: Dependency integrity

The detection check in overview, the canonical `Blocked by #N` stamping in refine's apply
step, and the headline-replacement rule. Independent of Phase 1's render but required
before Phase 3 may draw chains.

## Phase 3: Batch emitter

The per-terminal paste blocks with all integrity rules (chains, overlap, claims,
annotations), unblocks-first ranking, and the menu contract. Depends on Phases 1–2.
Closes #467.

## Phase 4: Needs-you lane

The human-lane section, its interactive launchers, its ordering, and the funnel-header
branch line. Ships dormant-safe against #472/#471 as described above.
