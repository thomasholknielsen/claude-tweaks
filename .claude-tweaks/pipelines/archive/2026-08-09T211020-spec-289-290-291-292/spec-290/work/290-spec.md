---
record: 290
origin: human
risk: medium
size: medium
ceremony: standard
grants: []
fingerprint: 2026-08-09-autonomy-unattended-tier-merge:batched-drills
blocked-by: [289]
surface: backend
---
# 290: Batch ledger/queue-write/ops-ack drills into fewer AskUserQuestion calls, gated on the merged ceiling

Surface: backend

## Overview

Three interactive drills — `ledger/resolve-gate.md` Phase 2, `wrap-up/review-console.md`'s
`Q#`/`M#` per-item prompts, and `wrap-up/nothing-left-behind.md`'s ops-acknowledgment loop —
currently issue one `AskUserQuestion` tool call per item (ledger Phase 2 issues *two*, in a
disposition-then-sub-choice chain). All three files carry an explicit, deliberate anti-pattern
against combining items into fewer calls, citing the asymmetric cost of a wrong answer in these
categories. This leaf deliberately reverses that position — on explicit direction that low
developer friction is the priority and the pipeline's other review lenses are the accepted quality
backstop.

**Mechanism, revised from this leaf's first draft.** The original approach bundled up to 4
separate single-select questions into one `AskUserQuestion` call. A concurrent, sibling
decomposition (record #294, "Batch upstream-feedback filing into one multiSelect decision")
independently solved the same underlying problem for a different item category (`U#`) using a
different, lower-friction mechanism: one `multiSelect: true` question per chunk of ≤4 items, each
item as a pre-checked checkbox, with any non-binary action (an edit) pushed to free-text override.
That mechanism requires **zero clicks** to accept a whole chunk's worth of defaults — strictly
less friction than this leaf's original bundled-single-select approach, which forces an explicit
selection on every item regardless of whether the default would have been fine. This leaf now
matches that mechanism wherever the underlying choice is genuinely binary (accept/reject), and
extracts the shared chunking contract both leaves need into a new `_shared` file rather than each
restating it. Where the choice is not binary — ledger Phase 2's Step 2b, a genuine three-way pick
among Fix now / Accept / Drop — a checkbox can't represent "which of three mutually exclusive
buckets," so that one step keeps the original bundled-single-select mechanism.

It also wires the narrowing/auto-file/auto-acknowledge checks in all three files to the merged
`autonomy` ceiling instead of the retired `unattended-tier` boolean.

`review-console.md`'s `U#` (Upstream feedback) rows are out of scope for this leaf — see Non-Goals;
that's #294's own territory, already shipped as a sibling leaf under this decomposition's parent.

**Complexity:** Medium
**Estimated tasks:** 8

## Non-Goals

- Changing what floor-clearing means, which four blocker-reason categories qualify, or any
  disposition outcome available at any step — this leaf changes call *shape and count*, never
  outcome content.
- Batching Upstream feedback (`U#`) rows in `wrap-up/review-console.md` — that's record #294,
  already shipped under this decomposition's parent (#288). Upstream feedback filing is never
  eligible for ceiling-based narrowing regardless (`_shared/auto-mode-contract.md`'s not-silenced
  table lists it as **not** exempt under `unattended-tier`), so it never fit this leaf's
  `bookkeepingPermissions` wiring in the first place.
- Reusing #294's own `skills/_shared/upstream-feedback-batch.md` file directly. That contract is
  scoped to upstream-feedback specifics (dedup-match rendering, the `--pre-confirmed` flag,
  posting decline comments to `upstream-candidate` issues) — none of which apply here. This leaf
  extracts a smaller, genuinely generic chunking contract instead (see Deliverables) that both
  files could in principle cite, though #294 shipped first and isn't retrofitted to use it — that
  would be scope creep on a leaf that's already merged.
- Extending call-batching to any drill outside these three files — Configuration updates' `[adr]`
  per-item three-way prompt, and the global batch-section "Approve all" mechanism, are untouched.
- The core lever-merge code itself (`bookkeepingPermissions`, `clearsFloor`, `renamedKeys`) — that
  ships in #289, which this leaf is blocked by and only consumes.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #289 | Merge unattended-tier into the autonomy ceiling — core lever code | this decomposition |

## Current State

- `skills/ledger/resolve-gate.md` — Phase 2's narrowing step (lines ~40-49) reads
  `unattended-tier: on` and calls `bin/lib/issues/unattended-tier.js`'s `clearsFloor(blockerReason)`;
  items that clear the floor auto-route with an `AUTO {time} — Ledger Phase 2: item #{N}
  auto-routed to backlog...` log line and skip the drill entirely. Items that don't clear (or the
  lever is off) fall through to the per-item drill (lines ~87-112): Step 1 is always a single
  `AskUserQuestion` (`multiSelect: false`, 2 options: "Close out" / "Route to a record") issued
  once per item; if "Route to a record" was chosen, Step 2a asks a second `AskUserQuestion`
  ("Defer" / "Keep"); if "Close out" was chosen, Step 2b asks a second `AskUserQuestion`
  ("Fix now" / "Accept" / "Drop"). The explicit guardrail at line 89: "No step of this drill may
  gain a 4th/'apply to all' option, even though the option cap would allow it — bulk routing is
  user-initiated via `Other` only, never a presented default."
- `skills/wrap-up/review-console.md` — line 412 (already narrowed by #294's own edit to scope this
  sentence to `Q#`/`M#` only): "prompt each per-item row individually — one small
  `AskUserQuestion` call per `Q#`/`M#` item, issued separately." Each item's question has 3
  options: Apply / Skip / Edit, none marked `(Recommended)`. Queue writes create a record on
  Apply; Memory updates write a memory file.
- `skills/wrap-up/nothing-left-behind.md` — ops-acknowledgment step, same one-`AskUserQuestion`-
  per-item shape as the others (exact line numbers to confirm at build time against the live file).
- `AskUserQuestion`'s own schema caps `options` at 4 per question (2-4 items) and caps the
  `questions` array at 4 entries per call — both confirmed from the tool's own parameter schema,
  the same fact #294's Current State independently confirmed for its own purpose. A binary
  (accept/reject) per-item decision maps to one checkbox option in a `multiSelect: true` question,
  so the binding chunk size for the multiSelect mechanism is 4 items per call (the options cap) —
  not 4 items across bundled questions (the questions-per-call cap), which only applies where this
  leaf still uses the original bundled-single-select mechanism (ledger Step 2b).
- `docs/plugin-structure.md` line 55 describes `nothing-left-behind.md`'s "ops acknowledgment with
  its `unattended-tier` branch" and describes `review-console.md`'s "per-item `Q#`/`M#`/`U#`
  sections" — both go stale once this leaf and #294 ship. Routed to the sibling documentation-sweep
  leaf (#291), not fixed here — this leaf's Key Files are the three drill files plus the new shared
  chunking contract, not the module-map document describing them.

## Deliverables

- [ ] Create `skills/_shared/batched-item-drill.md` — a small, generic shared contract (distinct
      from #294's upstream-specific one) cited by all three files below wherever they use the
      multiSelect mechanism. Defines:
      - **Chunking:** split remaining items into groups of at most 4 (`AskUserQuestion`'s own
        per-question option cap). Issue one `multiSelect: true` `AskUserQuestion` call per chunk,
        sequentially. A batch of 6 renders as 2 calls (4, then 2); 4 or fewer renders as exactly 1.
      - **Binary encoding:** for a genuinely two-way per-item choice, one checkbox option per item
        represents it — checked means the *first* named outcome, unchecked means the *second*.
        Each caller states which of its own two outcomes maps to checked in its own citing text
        (this file does not hard-code outcome names, since callers differ).
      - **No forced default vs. a recommended default** is a per-caller choice, not fixed by this
        contract: a caller with a genuine "most items are fine as-is" case (queue-writes, memory
        updates, ops-ack) pre-checks every item to the recommended outcome; a caller with no such
        default (ledger, where every remaining item is inherently ambiguous — that's why it wasn't
        auto-routed) leaves every item unchecked, requiring the user to actively check the ones
        they want the checked-outcome for. Both still gain the one-call-per-chunk reduction; only
        the pre-check default differs.
      - The free-text override hint: every batch question's text must restate that describing an
        edit by item name in the next message is the escape hatch (CLAUDE.md's `[IL-13]` — the
        `Other` field is otherwise undocumented in the rendered UI), mirroring #294's own
        established wording pattern for consistency across the plugin's batching UX.
- [ ] `ledger/resolve-gate.md`: change the narrowing check from `unattended-tier: on` to
      `bookkeepingPermissions(ceiling).ledgerNarrowing === true` (import from `autonomy.js`, not
      `unattended-tier.js`; resolve `ceiling` per `_shared/autonomy-ceiling.md`'s existing
      precedence ladder, mirroring the citation pattern the old `(see _shared/unattended-tier.md)`
      line used). Rewrite Step 1 (Close out / Route to a record — genuinely binary) as one
      `multiSelect` call per chunk of ≤4 remaining items via the new shared contract: checked =
      Route to a record, unchecked = Close out (no pre-check — ledger's remaining items are
      inherently ambiguous, per the shared contract's no-default case). After Step 1 resolves,
      rewrite Step 2a (Defer / Keep — also genuinely binary) the same way, chunked over the
      "Route"-answering subset: checked = Keep, unchecked = Defer, no pre-check. **Step 2b (Fix
      now / Accept / Drop — three-way, cannot checkbox-encode) keeps the original mechanism**:
      bundle up to 4 items' separate single-select questions into one `AskUserQuestion` call,
      chunked over the "Close out"-answering subset. Rewrite the "No step of this drill may gain a
      4th option" guardrail paragraph to state the new position for both mechanisms: multiSelect
      chunking is now permitted for Steps 1/2a specifically because the checkbox state *is* the
      per-item choice (never a shared bulk toggle); bundled single-select chunking is now permitted
      for Step 2b because each item still gets its own distinct question with its own three
      options, never a shared choice. A *presented apply-to-all option within a single item's own
      choice* is still forbidden in both cases — that distinction is what survives the reversal.
- [ ] `wrap-up/review-console.md`: change queue-write auto-file's narrowing check from
      `unattended-tier: on` to `bookkeepingPermissions(ceiling).queueWriteAutoFile === true`
      (same ceiling-resolution citation as above). Rewrite the `Q#`/`M#` per-item prompts via the
      new shared contract: one `multiSelect` call per chunk of ≤4 items *within the same section*
      (a `Q#` and an `M#` never share a call — different destinations, different staged-file
      shapes, per the existing "never batched across sections" rule, which this leaf keeps), all
      items pre-checked to "Apply" (the recommended default — most staged proposals are fine
      as-drafted), unchecking means Skip. Editing content is the free-text override path, naming
      the target item by its rendered title — mirroring #294's own established convention for
      `U#`, so the whole console reads as one consistent interaction pattern rather than three
      different ones. Rewrite line 412's "issued separately... never batched" sentence and line
      423's anti-pattern paragraph to state the new position for `Q#`/`M#`, citing the shared
      contract, leaving `U#`'s own wording exactly as #294 already left it.
- [ ] `wrap-up/nothing-left-behind.md`: change the ops-ack narrowing check from `unattended-tier:
      on` to `bookkeepingPermissions(ceiling).opsAckAutoAcknowledge === true`. Rewrite the
      per-item loop via the new shared contract: one `multiSelect` call per chunk of ≤4 items, all
      pre-checked to "Acknowledge" (the recommended default), unchecking means defer that item to
      a follow-up.
- [ ] All three files: the `AUTO {time} — ...` log lines that fire for floor-clearing items under
      `trusted`+ (which skip the interactive drill entirely, unrelated to this leaf's UI change)
      keep their exact current shape — verified against the live text, none of the three actually
      names "unattended-tier" inside the log-line string itself, so there is no log-line text to
      rename; only the *check that decides whether to emit one* changes, per the Deliverables above.

## Acceptance Criteria

1. A worked ledger-Phase-2 example with 6 remaining items (after narrowing): Step 1 renders as 2
   `multiSelect` calls (4 items, then 2 items), no item pre-checked. Checking none and submitting
   both chunks routes all 6 to "Close out."
2. The same worked example, with 3 of the 6 checked (Route) in Step 1: Step 2a then renders as 1
   `multiSelect` call over those 3 (no pre-check); Step 2b renders as 1 bundled-single-select call
   (up to 4 separate questions) over the 3 that stayed "Close out." Total across both steps: 2
   (Step 1) + 1 (Step 2a) + 1 (Step 2b) = 4 calls, versus up to 12 under the pre-this-leaf
   per-item mechanism.
3. A worked queue-write example with 5 `Q#` items and 2 `M#` items: `Q#` renders as 2 `multiSelect`
   calls (4, then 1), all items pre-checked to Apply; `M#` renders as 1 `multiSelect` call (2
   items, pre-checked) — never combined with the `Q#` calls.
4. A worked ops-ack example with 5 items: renders as 2 `multiSelect` calls (4, then 1), all
   pre-checked to Acknowledge.
5. `bookkeepingPermissions('trusted').ledgerNarrowing === true` and `.queueWriteAutoFile === true`
   at the point `resolve-gate.md`/`review-console.md` read it — confirmed by re-reading #289's
   shipped shape at build time, not re-derived here.
6. `wrap-up/nothing-left-behind.md`'s narrowing check reads `bookkeepingPermissions(ceiling)
   .opsAckAutoAcknowledge`, gated at `unattended`, not `trusted` — confirming ops-ack stays at the
   higher tier per #289's design.
7. Every rewritten anti-pattern paragraph in all three files states plainly that this is a
   deliberate reversal (not a silent removal), names both mechanisms in use (multiSelect chunking
   for binary choices; bundled single-select chunking for Step 2b's three-way choice) and what's
   still forbidden (a presented apply-to-all option within a single item's own choice; sharing a
   call across `review-console.md` sections).
8. Grep for the literal string `unattended-tier` across the three drill files (not
   `skills/_shared/batched-item-drill.md`, which never mentions the lever by name) after the edit
   returns zero matches outside a historical/rationale mention explaining what changed.
9. `review-console.md`'s `U#` section (already rewritten by #294) is untouched by this leaf's own
   edits — confirmed by diffing this leaf's changes against #294's shipped diff and verifying no
   hunk overlaps.
10. `skills/_shared/batched-item-drill.md` never names a specific outcome pair (e.g. "Apply/Skip")
    — it defines the chunking/encoding/override mechanism generically; each of the three drill
    files' own citing text supplies its own outcome names, confirmed by reading the shared file in
    isolation and finding no drill-specific vocabulary in it.

## Technical Approach

Two mechanisms coexist in this leaf, chosen by whether the underlying per-item choice is binary:

- **multiSelect chunking** (ledger Step 1, Step 2a; `Q#`/`M#`; ops-ack): one checkbox per item
  encodes a two-way choice directly in checked/unchecked state. Chunk size is bounded by
  `AskUserQuestion`'s 4-*options*-per-question cap. This is strictly lower friction than bundled
  single-select for the common case, since a chunk with no exceptions needs zero per-item clicks —
  confirmed as the right direction by an independent, concurrent decomposition (#294) reaching the
  same mechanism for a different item category.
- **Bundled single-select chunking** (ledger Step 2b only): up to 4 separate, distinct
  single-select questions in one call. Chunk size is bounded by `AskUserQuestion`'s 4-*questions*-
  per-call cap — a different cap than multiSelect's, and the reason the two mechanisms' chunk-size
  arithmetic looks identical (4) while measuring different tool limits. This mechanism survives
  only where a per-item choice is genuinely three-or-more-way and can't be checkbox-encoded — a
  checkbox represents "in or out of one set," not "which of three sets."

Ledger's Step 1 → Step 2a/2b sequencing is unchanged from this leaf's original design: Step 2's
grouping (which items go to 2a vs. 2b) isn't known until Step 1's responses return, so Step 1 must
fully resolve (across however many multiSelect calls it took) before Step 2 begins.

### Key Files

- `skills/_shared/batched-item-drill.md` — new; the generic chunking/encoding/override contract
- `skills/ledger/resolve-gate.md` — narrowing check; Step 1/2a as multiSelect; Step 2b stays
  bundled-single-select; guardrail rewrite
- `skills/wrap-up/review-console.md` — narrowing check; `Q#`/`M#` as multiSelect; anti-pattern
  rewrite (the `U#` section is #294's Key File, not this leaf's)
- `skills/wrap-up/nothing-left-behind.md` — narrowing check; per-item loop as multiSelect

### Package Dependencies

- None new. Consumes `bookkeepingPermissions` from #289 (`bin/lib/issues/autonomy.js`).

## Gotchas

- `AskUserQuestion`'s two caps are distinct and must not be conflated: 4 *options* per question
  (binds multiSelect chunk size) vs. 4 *questions* per call (binds bundled-single-select chunk
  size for Step 2b). Both happen to be 4, which makes it easy to write "chunk at 4" once and apply
  it to both mechanisms as if it were one constraint — it isn't; verify against the tool's own
  current schema at build time for each mechanism separately, the same caution #294's own Gotchas
  section states for its own multiSelect chunking.
- Pre-checking is a per-caller policy choice, not a shared-contract default: `Q#`/`M#`/ops-ack
  pre-check to the recommended outcome (there's a sensible default — most staged proposals are
  fine); ledger's Step 1/2a do not pre-check anything (there's no sensible default — every
  remaining item is inherently ambiguous, which is why it survived Phase 1's floor-clearing in the
  first place). Don't "make ledger consistent" with the other three by pre-checking it — that
  would silently reintroduce a presented default the guardrail rewrite explicitly still forbids
  for genuinely ambiguous items.
- Ledger Step 1's multiSelect groups are fixed once formed (by position in the remaining-items
  list) — do NOT re-batch by answer content after responses come back; that's Step 2's job, on a
  fresh grouping, not Step 1's.
- `review-console.md`'s existing rule that a `Q#` and an `M#` never share a call must survive this
  change unchanged — chunking is *within* a section, never across sections. `U#` is #294's
  territory entirely — do not touch that subsection when rewriting lines 412/423.
- The blocking leaf's (#289) `bookkeepingPermissions` returns `false` for all three flags on an
  unrecognized ceiling value — these three files' narrowing checks inherit that fail-closed
  behavior automatically by calling the function; don't re-implement a separate unrecognized-value
  guard in skill prose.
- `skills/_shared/batched-item-drill.md` and #294's `skills/_shared/upstream-feedback-batch.md` are
  deliberately separate files, not one shared with the other — the latter carries
  upstream-feedback-specific rules (dedup-match rendering, `--pre-confirmed`, decline-comment
  posting) that don't belong in a generic contract, and retrofitting #294 to depend on this leaf's
  file is out of scope (see Non-Goals).


<!-- work-fingerprint: 2026-08-09-autonomy-unattended-tier-merge:batched-drills -->
