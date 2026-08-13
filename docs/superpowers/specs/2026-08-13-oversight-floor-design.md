# Oversight Floor: a generalized risk/size gate for human-required checkpoints

**Status:** Design approved by user in brainstorming session, not yet planned
**Origin:** #359 (thomasholknielsen/claude-tweaks) — "Should /claude-tweaks:demo condition on trust tier instead of always requiring a human click?"

## Problem

`/claude-tweaks:demo`'s acceptance gate is unconditional today: every closed record — and every decomposition parent, via the Parent-Gate Procedure — gets a real human verdict click, regardless of how much evidence already exists that the work is fine. This was felt directly: six decomposition parents (#338, #306, #293, #288, #284, #263) each needed a fresh `/demo` click on 2026-08-12, even though every one of their sub-issues had already been through its own build/test/review/wrap-up cycle with real acceptance evidence (merged PRs, green test suites, ledger-logged review findings). The parent-gate click re-asks a question sub-issue acceptance arguably already answered.

The project's own `auto-mode-contract.md` treats acceptance as a never-silenced axis — deliberately, on the principle that "did this solve the actual problem" is a human judgment no artifact set can substitute for. This design does not touch that principle: **the verdict itself stays 100% human, at every tier, always.** What it conditions is a different question — *whether the gate is required to fire at all* for a given record, based on how much is actually at stake.

Separately, the codebase already makes exactly this kind of judgment call in one other place: `bin/lib/issues/grant-gate.js`'s gate 5 hardcodes `facets.risk === 'high'` as the threshold past which a machine-originated grant is denied and a human is required. That check has no policy key, no size dimension, and no name — it is a second, silently-drifting copy of the same underlying question the demo gate is about to make explicit. This design generalizes both into one concept.

## Design

### The oversight floor

Two new policy keys, generic — not prefixed `demo-`, because they govern more than one consumer:

| Key | Default | Meaning |
|---|---|---|
| `risk-floor` | `high` | The `risk:*` tier at or above which a human checkpoint is required. |
| `size-floor` | `high` | The `size:*` tier at or above which a human checkpoint is required. |

Both read the existing three-tier vocabulary (`low` / `medium` / `high`) already shared by `risk:*` and `size:*` labels (`skills/_shared/work-record.md`'s Size/Risk table; `record.js`'s `TIERS` constant, already imported by `backlog.js` and `ranking.js` for unrelated triage/sort purposes — this design does not touch those, see Non-Goals). A record **exceeds the floor** when its risk tier is at/above `risk-floor` OR its size tier is at/above `size-floor`. An unscored record (missing either label) fails closed — treated as exceeding the floor, the same conservative default `trust.js`'s own `riskBand` already applies to unscored records ("absence of a risk score is not evidence of safety").

**Shared predicate.** One new pure function, `exceedsOversightFloor(facets, policy)`, in a new module `bin/lib/issues/oversight-floor.js`. It takes a record's `facets` (the `parseRecordFacets` output — `.risk`, `.size`) and the resolved `{ riskFloor, sizeFloor }` policy values, and returns a boolean plus which dimension (if any) tripped it, for logging. Deliberately named apart from `trust.js`'s existing `riskBand` — that function computes a different, binary (`low`/`elevated`) collapse used only to key trust-class lookups, and reusing its name for a three-tier floor comparison would be confusing.

### Consumer 1: `grant-gate.js` (migrated)

Gate 5's `if (facets.risk === 'high')` check is replaced with `exceedsOversightFloor(facets, { riskFloor: pol.riskFloor, sizeFloor: pol.sizeFloor })`. This is a real behavior change, not a refactor: today grant-gate never looks at `size:*` at all, so a `size:high` record with `risk:medium` currently earns a machine-originated grant it would newly be denied. Scope of impact is narrow — this gate only runs under `autonomy: unattended` **and** the explicit `grant-origination-enabled` opt-in (gates 1a/1b already restrict it to a small, deliberately-opted-in population) — but it needs a CHANGELOG callout on release, not a silent tightening.

### Consumer 2: `/claude-tweaks:demo`'s binary gate (new)

Demo required **iff** `exceedsOversightFloor` is true for the record being closed. No new label states: the gated path is completely unchanged (`demo:pending` → `demo:approved`/`demo:changes-requested`, same brief, same walkthrough). The not-required path is the new behavior: the record closes with **no** `demo:*` label, no brief, no ceremony at all — though it remains demoable later on request, via `/demo`'s existing closing-commit-reconstruction path (Step 1's `#N` lookup already handles a record with no `demo:pending` label).

**Parent aggregation rule.** A decomposition parent is evaluated on **risk only**, taking the max `risk:*` tier across its sub-issues — size is deliberately excluded from parent-level evaluation, and the parent's own `size:*` label (if any) is never read for this purpose. Reasoning: a decomposition parent is, by construction, an aggregation of multiple sub-issues, which makes it read as large almost by definition — tested against the six parents that motivated this design, an OR-based floor that counted parent size would very likely have still gated all six (#284's 2-sub-issue console merge and #263's 1-sub-issue advisory addition both plausibly carry `size:high` at the parent level despite being exactly the low-stakes cases this design exists to un-gate), defeating the friction reduction this design is for. Risk does not have this degeneracy — a parent's aggregate risk is a real, independent judgment about whether any of its parts touched something dangerous (worktree safety, auth, policy levers), not an artifact of sub-issue count. Size stays fully in play for leaf/standalone records and for `grant-gate.js`, where it is never rolled up from a parent and remains a meaningful, non-degenerate signal.

### No `demo:exempt` stamp — backstops recompute live

The two existing backstop sweeps that catch closed-with-no-disposition records — `acceptance-gap` and `parent-gate` (`_shared/github-pr-scan.md`'s scopes under `work-backend: github-issues`; `step-1-records.md` Shapes 8 and 7 under `local-files`) — gain a pre-filter, not a new label to track: before either scope treats a closed, undisposed record as a gap candidate, check `exceedsOversightFloor` against the record's **current** labels and the **current** policy floors. Below floor → not a gap, skip; the existing `needsBackstop`/`parentGateState` predicates never see it. Above floor, or unscored → proceed exactly as today.

This costs nothing extra to fetch: both scopes already pull `labels` on every record they scan for other reasons (`needsBackstop`'s hasParent check; `parentGateState`'s sub-issue enumeration already fetches per-sub-issue state). Risk/size are just more labels on a response already in hand.

Recomputing live (instead of freezing an exemption decision at close time) is a deliberate choice, not an oversight: if a project later tightens `risk-floor` from `high` to `medium`, the backstop sweep naturally starts surfacing previously-exempt medium-risk records again on its next run — a way to catch a backlog up to a newly-raised bar, for free. A frozen stamp would have needed a separate mechanism to find records worth re-reviewing after a policy tightening; recompute-at-scan-time gives that for free, at the cost of needing to read `policy.yml`'s history (not a label) to reconstruct why a specific old record was never demoed.

### `/init` walkthrough

`/init` (and its `--update` drift check) gains a consolidated policy-configuration walkthrough covering every `policy-schema.md` lever as one batch table with recommended values pre-filled, not a narrow question about just these two keys — the pattern already established for other multi-item decisions (`_shared/batched-item-drill.md`'s `multiSelect` batching). `risk-floor` / `size-floor` are two rows in that table, defaulting to the recommended `high` / `high`, alongside the existing levers (`autonomy`, `worktree.always`, `trust-revert-window-days`, etc.).

## Migration note (for CHANGELOG)

Both new keys take effect immediately on upgrade at their schema default (`high`/`high`) — consistent with how other policy keys already behave (e.g. `autonomy: supervised` applies without configuration). This is a genuine, immediate loosening for `work-backend: github-issues` projects: any record at `risk:medium`/`size:medium` or below newly closes with no demo gate at all, where today every closed record and every decomposition parent always got one. Projects that want to keep today's always-gate behavior set either key to the reserved value `always` (`exceedsOversightFloor` short-circuits to `true` regardless of the record's tier, the same way an unscored record already fails closed) at their next `/init --update` run. `grant-gate.js`'s new size check is a smaller, narrower tightening within the already-opted-in `unattended` + `grant-origination-enabled` population — call out separately.

## Non-Goals

- **Automating the verdict itself.** Every record that meets the floor still gets a real human click, at every autonomy tier. This design conditions whether the gate fires, never what it decides.
- **Review-history / changes-requested evidence as a floor input.** The original framing for #359 also named "no changes-requested history" as a candidate signal, distinct from risk/size. It is explicitly deferred, not silently dropped: risk/size are pre-declared record attributes, while review cleanliness is a build-time fact with no natural home in a pre-declared floor. A record with a rocky review history is expected to already reflect that in its `risk:*` label at spec time; if that turns out not to hold in practice, it's a follow-up, not part of this design.
- **`backlog.js`'s `filterCritical`/`rankRiskValue` and `ranking.js`'s `sizeBandOf`.** These read the same `risk:*`/`size:*` labels but for triage/sort ordering ("show critical items first," "prefer smaller work when priority ties"), not gating. They are unrelated to `exceedsOversightFloor` and untouched by this design.
- **Per-consumer floor divergence.** `grant-gate.js` and `/demo` share one floor value each (not two independently-tunable ones) by default — nobody has asked for them to diverge, and the shared-predicate structure makes an additive per-site override cheap to add later if that changes.

## Open questions for planning

- Whether `bin/resolve-policy.js`'s existing single-value read pattern needs a two-value batch call (mirroring `capture/SKILL.md`'s existing `--values autonomy trust-revert-window-days` pattern) for the two new keys together.
- Whether this decomposes into multiple sub-issues at `/specify` time (predicate + grant-gate migration; demo binary gate + parent aggregation; backstop pre-filter; `/init` consolidated walkthrough are four largely independent units) or ships as one build — a decomposition call, not a design one.
