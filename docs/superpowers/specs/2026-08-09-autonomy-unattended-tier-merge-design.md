# Autonomy/Unattended-Tier Merge and Batched Interactive Drills

Date: 2026-08-09
Status: design approved, plan pending

## Problem

A `/flow #264` wrap-up run's Review Console batched 22 items into one "Approve all," but three
queue-write proposals (Q1–Q3) each required their own sequential `AskUserQuestion` round-trip,
because record creation is explicitly carved out of the batch-approval path by
`_shared/auto-mode-contract.md`. That per-item drill pattern repeats at `ledger/resolve-gate.md`
Phase 2 and `wrap-up/nothing-left-behind.md`'s ops-acknowledgment step. The friction is real
regardless of autonomy setting — even a fully attended run pays one round-trip per item.

Investigating the natural fix (`unattended-tier: on`, which already exempts queue-writes,
ledger-narrowing, and ops-ack from the click) surfaced a second problem: the project already has
two separately-evolved policy levers answering overlapping versions of "how much do I let the
pipeline decide on its own?" — `autonomy` (`supervised`/`trusted`/`unattended`, evidence-gated,
governs work-record trust: born-ready filing, the initiative budget, grant origination) and
`unattended-tier` (`off`/`on`, category-gated, governs ledger narrowing, queue-write auto-file,
ops-ack). They converge at exactly one point — both let a new backlog record get filed without a
click, via unrelated mechanisms — which is confusing to configure and to reason about, and there
is no init-time question capturing either one; both are currently discoverable only by reading
plugin source.

## Decisions taken

| Question | Decision |
|---|---|
| Keep two levers or merge | Merge `unattended-tier`'s three behaviors into `autonomy`'s existing three tiers |
| Which tier unlocks what | `trusted`: ledger narrowing + queue-write auto-file. `unattended`: adds ops-ack. Ops-ack held back at the top tier deliberately — real-world infra consequences if missed, unlike the other two (internally reversible) |
| Does the ceiling risk leaking born-ready trust | No — born-ready still requires its own independent evidence floor (`trust.js` clean verdict) regardless of ceiling. The ceiling only controls what's *possible*; per-capability floors still gate what *happens* |
| Grant origination (`auto:build` from machinery) | Untouched. Stays behind `unattended` *and* its own separate, undocumented-at-init opt-in that nothing sets by default |
| Migration for existing `unattended-tier: on` projects | No runtime dual-read (would be an unremoved compatibility shim, `[IL-85]`). `migratableKeys` cannot be reused as-is — verified against `bin/lib/policy-schema.js`, it only flags a recognized key sitting in the *wrong file* (CLAUDE.md instead of policy.yml), not a retired key name. `auditPolicy()` gains a small new `renamedKeys` check (same audit-then-offer shape, new table) that flags `unattended-tier` wherever it sits in `policy.yml`; `/claude-tweaks:init --update` offers the one-time rewrite, landing on `autonomy: unattended` (the superset tier) so no existing behavior silently regresses |
| Fix the N-sequential-dialogs friction independent of tier | Yes — but this **is** the anti-pattern the contract currently forbids, not a workaround of it. `wrap-up/review-console.md` explicitly bans combining `Q#`/`M#`/`U#` items into one multi-question `AskUserQuestion` call; `ledger/resolve-gate.md` bans a presented apply-to-all option. Both are deliberately overridden here — low developer friction is the priority, the pipeline's review lenses are the accepted backstop (even though none of them re-examine a filed record/memory file/upstream issue after the fact) — and both files' anti-pattern prose must be rewritten to state the new position, not silently bypassed. Mechanism: bundle up to 4 items' independent single-select questions per `AskUserQuestion` call (the tool's own cap), never collapsing multiple items into one shared choice. Ledger Phase 2's two-step-per-item structure (disposition, then sub-choice — split originally because a flat option list already exceeded the 4-option cap) is preserved; batching happens within each step, not across them |
| New init question | One `AskUserQuestion`, offered in bootstrap and as an update-mode drift check, defaulting to `trusted` as the recommended answer (not the conservative `supervised` system default) — everything `trusted` unlocks is already floor-gated to reversible, low-stakes categories |

## Design

### Unified tier model

Three strictly-nested tiers — each a superset of the one before, so there are no combinatorial
cases to reason about:

| Tier | Unlocks (cumulative) |
|---|---|
| `supervised` (default, unchanged) | Nothing — today's fully-interactive behavior |
| `trusted` | + born-ready filing for evidenced record classes (unchanged) + in-run initiative budget (unchanged) + **ledger Phase 2 narrowing** (new) + **queue-write auto-file** (new) |
| `unattended` | + everything `trusted` unlocks + **ops-ack auto-acknowledge** (new) + machine-originated `auto:build`, still behind its own separate opt-in (unchanged) |

The floor rule that already gates ledger-narrowing/queue-write (`clearsFloor()`'s four blocker-reason
categories — external state, product decision, not-yet-built dependency, scope expansion) is
unchanged; it moves from being gated by the boolean `unattended-tier` to being gated by
`autonomy >= trusted`. Anything that doesn't clear the floor still asks, regardless of tier.

**Correction found during landscape scan:** the three new capabilities do not belong on
`permittedGrants` (`bin/lib/issues/autonomy.js`). That function requires a per-class trust `row`
and denies immediately without one (`DENY('no trust row for this class...')`) — it answers "what
can *this record class* do," not "what does the ceiling allow in general." Ledger-narrowing,
queue-write auto-file, and ops-ack have no trust-class dimension at all; forcing them through
`permittedGrants` would require every caller to fabricate a trust row just to reach a ceiling-only
check. They get their own small function instead — `bookkeepingPermissions(ceiling)` — returning
`{ ledgerNarrowing, queueWriteAutoFile, opsAckAutoAcknowledge }` from `atLeast(tier, 'trusted')` /
`atLeast(tier, 'unattended')` directly, no trust row involved. `permittedGrants` itself is
untouched by this design — consistent with #267's own stated non-goal on the same function.

### Batched interactive drills — deliberate reversal, not an extension

**This is a considered reversal of an existing, explicit anti-pattern, not a gap-fill.**
`wrap-up/review-console.md` currently states outright that `Q#`/`M#`/`U#` items are "never
combined into a single multi-question `AskUserQuestion` call... that would functionally
reintroduce bulk approval by letting the user answer several at once without individually
attending to each." `ledger/resolve-gate.md` carries the matching guardrail: "No step of this
drill may gain a 4th/'apply to all' option... bulk routing is user-initiated via `Other` only,
never a presented default." Both were written deliberately, citing the asymmetric cost of a
wrong answer in these categories (a wrongly-filed record, a corrupted cross-project memory file,
a published-to-a-public-repo upstream issue, a silently-dropped ledger item). This design
overrides that position on the explicit judgment that low developer friction is the priority here,
and that the pipeline's review lenses (`/review`, `/reflect`, red-team) are the accepted quality
backstop — even though, honestly, none of those lenses actually re-examine a filed record, a
written memory file, or a published issue after the fact; the safety net for these four
categories becomes "the user chose speed," not "something downstream catches a bad call." Both
files' anti-pattern prose must be rewritten to state the new position, not just silently
bypassed — an anti-pattern is an argument, not a switch to flip.

**Mechanism — batch calls, never batch choices.** `AskUserQuestion` caps at 4 options per
question and 4 questions per call. "Batch everything" means bundling up to 4 items' independent
single-select questions into one tool call (each retaining its own question/header/options —
nothing shared or collapsed), issuing additional calls when a drill has more than 4 pending items.
This is exactly the feature the existing anti-pattern names and forbids ("a single multi-question
`AskUserQuestion` call") — the reversal is using it, not inventing a new one.

- **Queue-writes, memory updates, upstream feedback** (`wrap-up/review-console.md`) — each is
  already a flat, single-step, 3-option (Apply/Skip/Edit) per-item choice. Bundle up to 4 `Q#`/
  `M#`/`U#` questions per call (each section still calls separately from the others — a `Q#` and
  an `M#` never share a call, since they resolve to different write destinations and different
  staged-file shapes). `ceil(N/4)` calls instead of `N`.
- **Ledger Phase 2** (`ledger/resolve-gate.md`) — cannot flatten into one question per item; its
  full disposition space (close-out ∪ route-to-record, each with its own sub-choice) is why it was
  split into two sequential steps in the first place — a flat 6-option list already exceeded the
  tool's cap once. The two-level structure is preserved; batching happens *within* each level:
  bundle up to 4 items' Step 1 questions in one call, then bundle Step 2a/2b follow-ups (grouped
  by which Step 1 answer each item got) up to 4 per call. Still a real reduction — `2·ceil(N/4)`
  calls in the worst case instead of up to `2N` — without collapsing the disposition space itself.

**Composes with the ceiling merge, doesn't depend on it.** The ceiling/floor mechanism
(`bookkeepingPermissions`, above) and call-batching are independent axes. At `supervised`, every
item still renders — just batched into `ceil(N/4)` calls instead of `N`. At `trusted`+,
floor-clearing items skip the dialog entirely first (auto-resolved, logged — zero calls for those),
and whatever remains is batched the same way. Call-batching applies uniformly at every tier,
including `supervised` — it is a mechanical fix to round-trip count, not a trust-gated capability.

### Init question

New bootstrap step, offered in fresh `/claude-tweaks:init` and surfaced by `--update` for existing
projects as a drift-check offer:

- **Trusted (Recommended)** — Skip asking about reversible bookkeeping (ledger residue routed to
  backlog, queue-write proposals filed) and let record types that build a track record skip spec
  review. Everything stays logged and reversible.
- **Supervised** — Ask about every decision, exactly like today.
- **Unattended** — Also skip acknowledging post-merge infrastructure follow-ups at wrap-up.

Writes `autonomy: trusted` (or `unattended`) to `.claude-tweaks/policy.yml`; omits the key
entirely for `supervised`, matching the existing "omitting a lever means default" convention.
Grant-origination is not part of this question — it stays a separate, deliberate, hand-edited
opt-in per `_shared/autonomy-ceiling.md`'s existing stated intent.

## Migration

`unattended-tier` is currently cited in 21 files (`bin/`, `skills/`, `evals/`); `autonomy` in 11
(measured via `grep -rl`, not estimated). No runtime fallback is added. Once this ships, code
reads `autonomy` only.

`migratableKeys` (`bin/lib/policy-schema.js`) is the existing precedent for "flag a stray key,
offer a rewrite," but it does not fit this case as-is: it only detects a *recognized* key sitting
in CLAUDE.md instead of `policy.yml` (`schemaByKey.has(key)` must be true), and once
`unattended-tier` is dropped from `POLICY_KEYS` it stops being recognized at all — it would fall
into the generic `unrecognizedKeys` bucket with no guided remedy, indistinguishable from an
unrelated typo.

Instead, `auditPolicy()` gains a small, purpose-built `renamedKeys` table —
`{ 'unattended-tier': { replacedBy: 'autonomy', migrate: (value) => value === 'on' ? 'unattended' : null } }`
— checked against `policyEntries` directly (not `claudeMdEntries`). A stray `unattended-tier: on`
surfaces as a `renamedKeys` entry the same way a `migratableKeys` entry does today: batch-tabled at
`/claude-tweaks:init --update`'s Config Home Drift step, with the exact diff shown before asking.
If `autonomy` is already set explicitly (e.g. `trusted`) alongside `unattended-tier: on`, the offer
shows both values rather than silently overwriting — same handling as `migratableKeys`'
`alsoInPolicy: true` differing-values case — since `unattended-tier: on` behaviorally implied
`unattended`-level automation for its three capabilities regardless of what `autonomy` separately
said, and only the user can decide whether to reconcile upward or leave `autonomy` where it is.

## Files touched

**New**

```
skills/init/bootstrap/step-18-autonomy-level.md
```

**Modified**

| File | Change |
|---|---|
| `bin/lib/issues/autonomy.js` | New function `bookkeepingPermissions(ceiling)`, added to `module.exports` — `ledgerNarrowing`/`queueWriteAutoFile` at `trusted`+, `opsAckAutoAcknowledge` at `unattended`+. Calls the module's existing internal `atLeast()` helper (stays unexported — only used within this file). `permittedGrants` itself is untouched |
| `bin/lib/issues/unattended-tier.js` | `clearsFloor()` moves into `autonomy.js` unchanged; file retired |
| `bin/lib/policy-schema.js` | drop `unattended-tier` from `POLICY_KEYS`; add a `RENAMED_KEYS` table and a `renamedKeys` field on `auditPolicy()`'s return, checked against `policyEntries` |
| `_shared/autonomy-ceiling.md` | absorbs `_shared/unattended-tier.md`'s content (What it authorizes, Floor rule, Logging) |
| `_shared/unattended-tier.md` | becomes a stub pointing to the merged file |
| `_shared/auto-mode-contract.md` | Bookend Architecture's lever list, "What auto silences"/"does NOT silence" tables, and the "Adding a new policy lever" checklist's worked example (currently `unattended-tier`) all update to reflect the merge |
| `_shared/policy-schema.md` | "Auto-mode levers" table drops `unattended-tier` (8→7 rows); `autonomy`'s row (Project facts section) expands its Meaning column |
| `flow/manifesto.md` | lever numbering, suppression-rules table, Policy Levers example, Override Semantics table, Recommendation Defaults table, `config.yml` schema example — all drop the standalone `unattended-tier` entry |
| `help/reference-card.md`, `help/context-flow.md` | independent lever enumerations updated |
| `ledger/resolve-gate.md` | Phase 2 narrowing reads `autonomy >= trusted` instead of `unattended-tier`; Step 1 and Step 2a/2b each batch up to 4 items per `AskUserQuestion` call (two-step structure preserved, not flattened); the "no apply-to-all" guardrail prose rewritten to state the new position |
| `wrap-up/review-console.md` | queue-write auto-file reads `autonomy >= trusted`; `Q#`, `M#`, and `U#` drills each batch up to 4 items per call (sections never share a call); the "never combined into a single multi-question call" anti-pattern prose rewritten |
| `wrap-up/nothing-left-behind.md` | ops-ack reads `autonomy >= unattended`; per-item loop batches up to 4 items per call |
| `wrap-up/leftover-routing.md`, `wrap-up/memory-curation.md`, `wrap-up/upstream-feedback.md`, `wrap-up/SKILL.md` | update `unattended-tier` citations to point at the merged lever |
| `skills/flow/SKILL.md` | levers-computed sentence drops the standalone `unattended-tier` name |
| `bin/lib/issues/tests/unattended-tier.test.js` | floor-matching cases move to `bin/lib/issues/tests/autonomy.test.js` unchanged |
| `tests/policy-schema.test.js` | drop the retired lever from `POLICY_KEYS` expectations; add a case asserting `renamedKeys` catches a stray `unattended-tier` in `policy.yml` |
| `skills/init/update-mode.md` | Config Home Drift step reads `renamedKeys` alongside `migratableKeys`, batch-tables the offered rewrite the same way |
| `evals/fixtures/*/CLAUDE.md` | any fixture referencing `unattended-tier` updated |

## Error handling

| Condition | Behavior |
|---|---|
| Floor check ambiguous or unrecognized reason | Fails closed — ask, exactly as if the ceiling were `supervised` (unchanged from today) |
| Record creation fails during auto-file | Proposal stays staged, failure logged, renders as a normal queue-write at the (now call-batched) console — unchanged from today |
| Project has both `autonomy` and a stray `unattended-tier` set | Only `autonomy` is read; the stray key is inert until `--update` rewrites it, surfaced via `auditPolicy()`'s new `renamedKeys` |
| Unrecognized `autonomy` value | Skipped, resolution continues to the next precedence source — unchanged existing behavior |

## Testing

| Case | Asserts |
|---|---|
| Tier→capability mapping | `supervised` unlocks none of the three new capabilities; `trusted` unlocks ledger-narrowing + queue-write auto-file only; `unattended` additionally unlocks ops-ack |
| Floor-matching (moved, unchanged) | The four blocker-reason categories still classify identically post-move |
| Migration detection | `auditPolicy()` on a `policy.yml` containing `unattended-tier: on` reports it under the new `renamedKeys`, not `unrecognizedKeys` |
| Migration rewrite | `--update`'s offered rewrite maps `unattended-tier: on` → `autonomy: unattended`, never `trusted` |
| Migration with pre-existing `autonomy` | A `policy.yml` with both `unattended-tier: on` and an explicit `autonomy: trusted` surfaces both values for the user to reconcile, never silently overwrites |

Each mapping case is verified by reverting the capability gate and confirming the test fails
(`[IL-105]`) — reading correct is not the same as discriminating.

Call-batching (Step 1/2a/2b bundling in `ledger/resolve-gate.md`; `Q#`/`M#`/`U#` bundling in
`wrap-up/review-console.md`; the ops-ack loop in `wrap-up/nothing-left-behind.md`) is skill-prose
only — no `node --test` coverage exists for `AskUserQuestion` call shape. Verified at Step 6
Self-Review by reading the rewritten drill prose against a worked example with 5+ items (crosses
the 4-per-call boundary) and confirming: each item still gets its own question/header/options, no
two items share a question, and the batch count matches `ceil(N/4)` (or `2·ceil(N/4)` for ledger's
two-step case).

## Out of scope

- Renaming the `autonomy` lever or its tier values (`supervised`/`trusted`/`unattended`) — confirmed
  as the right framing during design.
- Exposing grant-origination's separate opt-in at init — stays a deliberate hand-edit per existing
  documented intent.
- A project-level per-capability override (e.g. `autonomy-overrides: {queue-write-autofile: off}`)
  for users who want `trusted`'s evidence-based unlocks without its bookkeeping unlocks. Not built
  now (YAGNI) — the ceiling/floor split means born-ready can't leak extra automation just because
  the ceiling rose, so the practical need for this escape hatch is unproven. Revisit only if a real
  project hits it.
- Changing `hybrid` mode's own reversibility/confidence/severity floor logic — orthogonal gate,
  unaffected by this merge.

## Risks

| Risk | Mitigation |
|---|---|
| Migration blast radius (21 + 11 files) undercounted like `unattended-tier.md`'s own stale "6 files" claim | This design's counts came from a fresh `grep -rl`, not from re-reading the stale doc; re-verify at plan time immediately before editing, since files may have changed since design |
| A project silently loses `unattended-tier: on` behavior if it never runs `--update` | Accepted, same discovery-only posture as the existing `migratableKeys` precedent (surfaced at `--update`, no proactive SessionStart warning) — `renamedKeys` is new code but not a new UX pattern |
| `autonomy`'s existing "Project facts" table entry and the "Auto-mode levers" table entry describe the same key from two locations in `policy-schema.md` | Consolidate into one entry during the edit, don't leave two descriptions of one lever to drift independently |
| `renamedKeys`' reconciliation offer (both `unattended-tier: on` and an explicit `autonomy` set) adds a second branch to the Config Home Drift step beyond the simple move/remove of `migratableKeys` | Scoped to exactly one entry (`unattended-tier` → `autonomy`) — not a generalized rename framework. Revisit only if a second lever retirement needs the same shape |
| Reversing `wrap-up/review-console.md`'s and `ledger/resolve-gate.md`'s deliberate anti-patterns removes the one property that made a bad answer in these four categories (wrongly-filed record, corrupted memory file, published-to-public-repo issue, dropped ledger item) unlikely — no downstream review lens re-examines any of them after the fact | Accepted deliberately, on explicit user direction, prioritizing low developer friction over that safety property; the reversal is documented as a reversal (not silently bypassed) in both files' rewritten prose, so a future session can find and reconsider it rather than rediscovering the original reasoning from scratch. If it proves wrong in practice, the fix is re-introducing scrutiny for the specific category that broke, not reverting the whole mechanism |
