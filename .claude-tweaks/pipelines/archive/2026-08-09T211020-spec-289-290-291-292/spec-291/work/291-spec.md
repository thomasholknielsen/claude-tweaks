---
record: 291
origin: human
risk: low
size: medium
ceremony: standard
grants: []
fingerprint: 2026-08-09-autonomy-unattended-tier-merge:doc-sweep
blocked-by: [289, 290]
surface: backend
---
# 291: Update autonomy/unattended-tier documentation and lever citations across the plugin

Surface: backend

## Overview

After the core lever merge and the batched-drill rewrite ship (two sibling leaves this one is
blocked by), every reference doc and cross-file citation that still describes `unattended-tier` as
a standalone lever, or describes the old per-item-only interaction pattern, is stale. This leaf
sweeps every remaining citation — the `_shared` contract files, the Manifesto's lever tables, the
`/help` reference docs, `/flow`'s levers-computed sentence, four `wrap-up` citation files, and the
eval fixtures — so the documented lever model matches what actually ships. This is a pure
prose/consistency leaf: no runtime behavior changes here, only what the plugin's own docs say
about behavior two sibling leaves already implement.

**Complexity:** Medium
**Estimated tasks:** 6

## Non-Goals

- Any code change — `bin/lib/issues/autonomy.js`, `bin/lib/policy-schema.js`,
  `bin/lib/issues/unattended-tier.js` are entirely out of scope; those ship in the blocking leaf.
- Any change to `ledger/resolve-gate.md`, `wrap-up/review-console.md`, or
  `wrap-up/nothing-left-behind.md` — those ship in the sibling batched-drills leaf. This leaf only
  touches files that *cite* the lever's existence, not files that *implement* its behavior.
- Introducing a general prose-consistency check or linter for lever citations. This is a one-time
  sweep of the citations that exist today, not new tooling.
- Splitting this leaf further by package (`_shared` vs. `flow`/`help`/`wrap-up`). Deliberately kept
  as one leaf — see Gotchas for why.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #289 | Merge unattended-tier into the autonomy ceiling — core lever code | this decomposition |
| #290 | Batch ledger/queue-write/ops-ack drills into fewer AskUserQuestion calls, gated on the merged ceiling | this decomposition |

This leaf is blocked by both, not just #289: AC1's repo-wide grep (below) only returns clean if
`ledger/resolve-gate.md`, `wrap-up/review-console.md`, and `wrap-up/nothing-left-behind.md` — all
#290's own Key Files, not this leaf's — have already had their `unattended-tier` citations removed.
Build order, not grep-scope narrowing, is what makes AC1 correct; see Acceptance Criteria.

## Current State

- `skills/_shared/unattended-tier.md` — the full lever contract today (What it authorizes, Floor
  rule, Restricted-disposition rule, Logging, Notification, Error handling). Referenced from 6
  files by its own header's own count claim (`flow/manifesto.md`, `flow/SKILL.md` Step 3,
  `ledger/resolve-gate.md` Phase 2/3, `wrap-up/review-console.md`, `wrap-up/nothing-left-behind.md`,
  `wrap-up/leftover-routing.md`) — that count was measured stale during this decomposition's
  landscape scan; a fresh `grep -rl "unattended-tier"` across `skills/`, `bin/`, and `evals/`
  returned 21 files.
- `skills/_shared/autonomy-ceiling.md` — the `autonomy` lever's contract today (What it authorizes,
  Ceiling not level, Precedence, Floor rule, Why born-authorized is gated separately, Logging). No
  section describes ledger-narrowing, queue-write auto-file, or ops-ack — those are exclusively
  `unattended-tier.md`'s content today.
- `skills/_shared/auto-mode-contract.md` — the Bookend Architecture section lists `unattended-tier`
  as lever #9 in the canonical Manifesto numbering; the "What auto silences"/"does NOT silence"
  tables cite `unattended-tier` by name in the ledger/queue-write/ops-ack rows; the "Adding a new
  policy lever" checklist uses `unattended-tier`'s own addition as its worked example throughout.
- `skills/_shared/policy-schema.md` — the "Auto-mode levers" table (8 rows) includes
  `unattended-tier`; the "Project facts" section's `autonomy` row does not yet describe the three
  bookkeeping capabilities the blocking leaf adds.
- `skills/flow/manifesto.md` — per `_shared/auto-mode-contract.md`'s own "Adding a new policy
  lever" checklist, a lever needs an entry in every one of: the suppression-rules table, the
  canonical numbering line, the illustrative Policy Levers example table, the Suppressed/
  Valid-overrides footer, the Override Semantics table, the Recommendation Defaults table, and the
  `config.yml` schema example.
- `skills/help/reference-card.md`, `skills/help/context-flow.md` — both independently enumerate the
  full lever list (flagged by the same checklist as the two files a whole-branch review, not a
  task-level one, previously caught missing).
- `skills/flow/SKILL.md` — Step 3's "levers-computed" sentence names every lever including
  `unattended-tier`.
- `skills/wrap-up/leftover-routing.md`, `skills/wrap-up/memory-curation.md`,
  `skills/wrap-up/upstream-feedback.md`, `skills/wrap-up/SKILL.md` — each cites `unattended-tier`
  in describing what it is and isn't exempt from (memory/upstream explicitly state "Not exempt
  under unattended-tier" — that exemption boundary is unchanged by the merge, only the lever name
  referenced needs updating to `autonomy`).
- `evals/fixtures/{code-health-repo,complexity-repo,init-baseline,minimal-node-repo}/CLAUDE.md` —
  fixture CLAUDE.md files used by the evals harness; grep for `unattended-tier` mentions before
  editing. For each match, find the fixture's own eval scenario file (`evals/scenarios/*.yaml`
  referencing that fixture's directory name) and check whether its assertions parse or match
  against the flagged excerpt specifically — if yes, the mention is functional and must be updated
  in place (not deleted) so the scenario keeps testing real content; if no scenario references that
  excerpt, it's incidental example prose and can be updated or removed freely.
- `docs/plugin-structure.md` line 55 — the wrap-up sub-file description names
  `nothing-left-behind.md`'s "ops acknowledgment with its `unattended-tier` branch" and
  `review-console.md`'s "the per-item `Q#`/`M#`/`U#` sections," both now stale once #290 (and the
  sibling leaf #294, already shipped) land. Found by cross-checking #294's own Key Files, which
  independently identified this file for its own narrower edit — confirming it belongs in this
  leaf's scope too, not just #294's.

## Deliverables

- [ ] `skills/_shared/autonomy-ceiling.md`: absorb `unattended-tier.md`'s "What it authorizes"
      table (as three rows describing `ledgerNarrowing`/`queueWriteAutoFile`/
      `opsAckAutoAcknowledge`, cross-referencing which tier unlocks each), its Floor rule section
      (the four blocker-reason categories, `clearsFloor`'s new home in `autonomy.js`), and its
      Logging section's example lines (updated to read `autonomy` instead of `unattended-tier` as
      the policy-source name).
- [ ] `skills/_shared/unattended-tier.md`: replace the full contract with a one-paragraph stub:
      states the lever was merged into `autonomy` (linking to `autonomy-ceiling.md`), and that the
      `unattended-tier` policy key is retired (auto-detected via `renamedKeys` at
      `/claude-tweaks:init --update`). Date the stub with **this leaf's own commit date** (`git log
      -1 --format=%cd --date=short` at the moment this leaf's changes are committed) — not #289's
      commit date or any other sibling leaf's, since this stub is the one artifact whose own
      history directly answers "when did this doc change," and picking a different leaf's date
      would be citing a fact this leaf's own commit doesn't carry.
- [ ] `skills/_shared/auto-mode-contract.md`: remove `unattended-tier` from the Bookend
      Architecture's computed-levers list (8 auto-mode levers → 7). Update every "does NOT
      silence" table row currently citing `unattended-tier` (ledger resolve gate Phase 2,
      work-record creation, ops-acknowledgment) to cite `autonomy`'s `trusted`/`unattended` tiers
      instead. Reword the "Adding a new policy lever" checklist's worked example to be
      **lever-agnostic** rather than substituting a different specific lever as the new example —
      generalize the phrasing (e.g. "as a new lever's addition did" rather than naming
      `unattended-tier` specifically) so it survives the next lever's own churn instead of needing
      another rewrite the next time any lever is added or retired.
- [ ] `docs/plugin-structure.md` line 55: update the wrap-up sub-file description to drop
      "with its `unattended-tier` branch" (ops-ack now reads the merged ceiling, described
      elsewhere, not restated here) and drop "the per-item `Q#`/`M#`/`U#` sections" (no longer
      accurate once #290 and #294 both land) — reword to describe the current shape without
      restating mechanics owned by those two leaves' own documentation.
- [ ] `skills/_shared/policy-schema.md`: remove the `unattended-tier` row from the "Auto-mode
      levers" table (8 rows → 7). Expand the "Project facts" section's `autonomy` row Meaning
      column to describe the three bookkeeping capabilities `trusted`/`unattended` now unlock,
      consolidating what was previously two separate table entries (one per lever) into the single
      `autonomy` entry — don't leave two descriptions of one lever to drift independently.
- [ ] `skills/flow/manifesto.md`: remove `unattended-tier`'s standalone entry from every table the
      checklist above names (suppression-rules, canonical numbering, Policy Levers example,
      Suppressed/Valid-overrides footer, Override Semantics, Recommendation Defaults, `config.yml`
      schema example) — 8-lever numbering becomes 7-lever.
- [ ] `skills/help/reference-card.md`, `skills/help/context-flow.md`: update their independent
      lever enumerations to drop `unattended-tier` and reflect `autonomy`'s expanded scope.
- [ ] `skills/flow/SKILL.md` Step 3: drop `unattended-tier` from the levers-computed sentence.
- [ ] `skills/wrap-up/leftover-routing.md`, `skills/wrap-up/memory-curation.md`,
      `skills/wrap-up/upstream-feedback.md`, `skills/wrap-up/SKILL.md`: update each citation from
      `unattended-tier` to `autonomy` — the exemption boundaries themselves (memory and upstream
      feedback remain "Not exempt" regardless of tier) are unchanged, only the lever name cited.
- [ ] `evals/fixtures/*/CLAUDE.md`: update any literal `unattended-tier` mention found by grep to
      reflect the merged lever, or remove it if it was only incidental example prose with no
      functional role in the fixture.

## Acceptance Criteria

1. `grep -rli "unattended-tier" skills/ bin/ evals/` (case-insensitive, matching project convention
   for this kind of sweep), run only after #290 has landed (see Prerequisites — build order is
   what makes this return clean, not a narrowed grep scope), returns only
   `skills/_shared/unattended-tier.md` (the retained stub) and any file whose match is a
   **historical mention** — concretely: a sentence in past tense describing what the lever *used
   to* do or *was* renamed from, appearing after the merge is complete (example: "the ledger
   narrowing check previously read `unattended-tier: on`; it now reads the merged `autonomy`
   ceiling") — never a **live instruction** in present/imperative tense telling a reader to check
   or set the old key (example: "if `unattended-tier: on`, ..."). A match failing this test — any
   remaining present-tense or imperative usage — fails this criterion.
2. `skills/_shared/policy-schema.md`'s "Auto-mode levers" table has exactly 7 rows (down from 8),
   and its "Project facts" `autonomy` row's Meaning column mentions `ledgerNarrowing`,
   `queueWriteAutoFile`, and `opsAckAutoAcknowledge` (or equivalent plain-English descriptions of
   the same three capabilities) by name or clear paraphrase.
3. `skills/flow/manifesto.md`'s canonical lever-numbering line lists exactly 7 auto-mode levers
   (verify by reading the live line at build time, not by assuming the count from this record —
   `[IL-40]`: describe cardinality by reference where possible, don't hard-code a number that could
   drift before this leaf builds).
4. `skills/_shared/auto-mode-contract.md`'s "Adding a new policy lever" checklist's worked example
   is reworded to be lever-agnostic (per Deliverables — not substituted with a different specific
   lever name).
5. Every one of the four `wrap-up/*.md` citation files (`leftover-routing.md`,
   `memory-curation.md`, `upstream-feedback.md`, `SKILL.md`) reads `autonomy` where it previously
   read `unattended-tier`, with the specific exemption semantics (memory/upstream still "Not
   exempt") unchanged in meaning.
6. `skills/_shared/autonomy-ceiling.md` documents all three bookkeeping capabilities
   (`ledgerNarrowing`, `queueWriteAutoFile`, `opsAckAutoAcknowledge`) with which tier unlocks each,
   in addition to its existing born-ready/initiative-budget/grant-origination content — nothing
   from the original `unattended-tier.md` contract (Floor rule categories, Logging format,
   Restricted-disposition rule) is lost in the absorption.
7. Every `evals/fixtures/*/CLAUDE.md` file flagged by the Step 1 grep is either updated in place
   (a functional mention, confirmed against its own eval scenario per Current State) or left as
   historical text with a note (an incidental mention) — never silently deleted without that check.
8. `docs/plugin-structure.md` line 55 (or its post-edit equivalent line) no longer contains the
   substrings "unattended-tier" or "`Q#`/`M#`/`U#`" in that sentence.

## Technical Approach

Kept as one leaf rather than split by package (`_shared` contract files vs.
`flow`/`help`/`wrap-up` citation files) deliberately: splitting a single verified-complete citation
sweep into two leaves adds coordination risk (two leaves independently grep-updating overlapping
search patterns, risk of the second leaf's grep double-counting files the first already fixed, or
the split boundary silently missing a file) without reducing it — the citation sweep's own
correctness depends on running one exhaustive grep against the final state, not two partial ones.

The `renamedKeys` migration mechanism (blocking leaf) is orthogonal to this leaf's scope: that's
runtime detection code for a stray key in `policy.yml`; this leaf is prose describing the lever to
a reader. Both need to exist, neither substitutes for the other.

### Key Files

- `skills/_shared/autonomy-ceiling.md` — absorb `unattended-tier.md`'s contract content
- `skills/_shared/unattended-tier.md` — replace with a stub
- `skills/_shared/auto-mode-contract.md` — lever list, silences tables, checklist example
- `skills/_shared/policy-schema.md` — lever table row removal, `autonomy` row expansion
- `skills/flow/manifesto.md` — every table the "Adding a new policy lever" checklist names
- `skills/help/reference-card.md`, `skills/help/context-flow.md` — lever enumerations
- `skills/flow/SKILL.md` — Step 3 levers-computed sentence
- `skills/wrap-up/leftover-routing.md`, `skills/wrap-up/memory-curation.md`,
  `skills/wrap-up/upstream-feedback.md`, `skills/wrap-up/SKILL.md` — citation updates
- `evals/fixtures/*/CLAUDE.md` — fixture citation updates (conditional on grep findings)
- `docs/plugin-structure.md` — line 55's wrap-up sub-file description

### Package Dependencies

- None new.

## Gotchas

- The "8 auto-mode levers" and "7 auto-mode levers" counts stated in this record's own Deliverables
  and Acceptance Criteria are for orientation only — re-verify the live count at build time by
  reading `policy-schema.md`'s actual table before asserting the after-state number in a commit
  message or PR description (`[IL-40]`: don't restate a list's cardinality as a hard-coded literal
  that could have drifted).
- `wrap-up/memory-curation.md` and `wrap-up/upstream-feedback.md`'s "Not exempt under
  unattended-tier" language describes a *permanent* exemption (memory writes and upstream feedback
  filing are never silenced by any autonomy tier) — when updating the lever name, do not
  accidentally imply these become exempt under `autonomy: unattended`. They stay hard-excluded
  from any auto-resolution, same as `auto-mode-contract.md`'s "does NOT silence" table already
  states for both.
- The `evals/fixtures/*/CLAUDE.md` files may reference `unattended-tier` as fixture *content* the
  evals harness's own assertions read against (e.g., a test asserting a specific CLAUDE.md excerpt
  is detected/parsed a certain way) rather than as documentation prose. Check what each fixture's
  own eval scenario actually asserts before editing — an edit that breaks a fixture's role in its
  eval is a different, worse failure than leaving a stale citation.
- Don't conflate this leaf's citation-only scope with the sibling leaves' behavior changes: if a
  build session finds itself wanting to change what a narrowing check *does*, that's scope
  belonging to the batched-drills leaf, not this one — flag it rather than absorbing it here.


<!-- work-fingerprint: 2026-08-09-autonomy-unattended-tier-merge:doc-sweep -->


