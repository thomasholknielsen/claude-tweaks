---
record: 294
origin: human
risk: medium
size: medium
ceremony: standard
grants: []
fingerprint: 2026-08-09-batch-upstream-feedback-confirmation:batch-upstream-feedback-u-filing-into-one-multiselect-decisi
surface: backend
---
# 294: Batch upstream-feedback (U#) filing into one multiSelect decision, collapse /feedback's double-ask

Surface: backend

## Overview

Filing a learning upstream to `thomasholknielsen/claude-tweaks` via `/claude-tweaks:feedback`
requires an explicit human confirmation per item, correctly — `_shared/auto-mode-contract.md`
lists upstream filing as never silenced by `auto`, the same category as work-record creation.
Sibling record #290 already collapses `wrap-up/review-console.md`'s `Q#`/`M#` per-item prompts
(plus ledger Phase 2 and ops-ack) into fewer calls via a 4-per-call bundling mechanism, but it
explicitly carves `U#` (Upstream feedback) rows out of its own scope — Upstream feedback filing is
never eligible for the ceiling-based narrowing #290's mechanism is built around
(`_shared/auto-mode-contract.md`'s not-silenced table: "**Not** exempt under `unattended-tier`"),
and a maintainer reviewing several `U#` items still pays one `AskUserQuestion` round-trip per item
even after #290 ships.

Two friction sources remain, both scoped to this leaf. First, `/claude-tweaks:feedback` invoked
bare in queue mode (Step 0) batches *which* local `upstream-candidate` records to forward, but then
loops Steps 1-8 per selected item — N candidates, N confirmations. Second, the wrap-up path
double-asks: `review-console.md`'s per-`U#` Apply/Skip/Edit prompt is followed by invoking
`/claude-tweaks:feedback`, whose own Component-Skill Contract states "Being inside a pipeline never
relaxes Steps 6 and 7" — so its Step 7 confirm gate fires again on the same content, in the same
session. This leaf replaces both with one or more `multiSelect` `AskUserQuestion` calls per batch
(chunked at 4 items per call — `AskUserQuestion`'s own per-question option cap — all items
pre-checked, full scrubbed drafts rendered as text above the call) and a narrowly-scoped
`--pre-confirmed` flag that lets `/claude-tweaks:feedback` skip its own redundant Step 7 re-ask when
invoked by the one caller whose own batch call already served as that confirmation — while always
rerunning Step 6 (scrub) as a drift check, falling back to a normal Step 7 confirm for that single
item if drift is found.

**Complexity:** Medium
**Estimated tasks:** 8

## Non-Goals

- Batching `wrap-up/review-console.md`'s `Q#` (Queue writes) or `M#` (Memory updates) rows — those
  stay strictly per-item, per #290's own unchanged scope, and per their own different risk profile
  (work-record queue ownership; cross-project, always-loaded memory blast radius).
- Any change to `_shared/auto-mode-contract.md`'s "what `auto` does NOT silence" table itself — the
  underlying policy (explicit human confirmation required for upstream filing, never silenced by
  `auto`) is unchanged. Only the confirmation *mechanism* changes: fewer calls instead of N, and a
  named carve-out for the wrap-up path's redundant second ask.
- Reducing how many candidates reach the batch gate in the first place (tighter dedup, fewer
  false-positive health-sweep findings) — complementary, separate work, not pursued here.
- The `bookkeepingPermissions`/autonomy-ceiling machinery #289 and #290 introduce — this leaf's
  mechanism is orthogonal (a call-count reduction that still always asks), not a narrowing path
  that skips asking entirely, so it does not consume or depend on that machinery.
- Editing `ledger/resolve-gate.md` or `wrap-up/nothing-left-behind.md` — both remain #290's Key
  Files, unaffected by this leaf.
- Building a code-level (non-prose) guard that structurally prevents a future caller other than
  `/claude-tweaks:wrap-up` from passing `--pre-confirmed` — skills are markdown instructions the
  model follows, not executable code; the enforcement here is a named, auditable contract in
  prose, not a runtime check. See Gotchas.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #290 | Batch ledger/queue-write/ops-ack drills into fewer AskUserQuestion calls, gated on the merged ceiling | ready — scope narrowed during this decomposition's overlap analysis to carve `U#` out to this leaf |

## Current State

- `skills/feedback/SKILL.md` — Step 0 (bare/`--queue` invocation) lists open `upstream-candidate`
  issues via `gh issue list --label upstream-candidate --state open`, presents one batch table for
  *which* to forward, then loops Steps 1-8 individually per selected item. Step 7 ("Confirm — HARD
  GATE") is a single-item `AskUserQuestion` ("File it" / "Edit first" / "Don't file"), called once
  per invocation today. The Component-Skill Contract section states "Being inside a pipeline never
  relaxes Steps 6 and 7."
- `skills/wrap-up/review-console.md` — line 412 (as narrowed by #290's own edit, which now scopes
  that sentence to `Q#`/`M#` only) still describes `U#`'s own per-item Apply/Skip/Edit prompt
  unchanged: 3 options (Apply / Skip / Edit, lines 415-417), none marked `(Recommended)`. "On
  approval" step 9 invokes `/claude-tweaks:feedback` with the staged, already-scrubbed body from
  `staged/wrap-up-upstream-{N}.md` on Apply.
- `skills/wrap-up/execution-and-verification.md` — Step 9's description states `/feedback`
  "re-runs its own scrub and confirm gates" when invoked from the console, matching the
  Component-Skill Contract language above.
- `skills/wrap-up/upstream-feedback.md` — the curation-row judge file that stages one proposal per
  D5 learning; already scrubs at staging time (unaffected by this leaf — it produces the
  `staged/wrap-up-upstream-{N}.md` files this leaf's rewritten console section reads).
- `docs/skill-graph.md` line 175 and `docs/plugin-structure.md`'s wrap-up sub-file description
  ("review-console.md (... the per-item `Q#`/`M#`/`U#` sections ...)") both describe the pre-#290,
  pre-this-leaf per-item shape and go stale once either leaf ships.
- `AskUserQuestion`'s own schema caps `options` at 4 per question (2-4 items), regardless of
  `multiSelect` — confirmed from the tool's own parameter schema, not assumed. This is the same
  constraint #290's Overview and Gotchas already name for its own 4-questions-per-call mechanism,
  applying here to `multiSelect`'s options array instead of to a bundle of separate questions.

## Deliverables

- [ ] Create `skills/_shared/upstream-feedback-batch.md` — the shared contract, cited by both call
      sites (no re-explaining its rules inline in either caller). It defines:
      - Render every candidate's full scrubbed draft as literal markdown text above the tool call.
      - **Chunking:** split the batch into groups of at most 4 items (`AskUserQuestion`'s own
        per-question option cap). Issue one `multiSelect: true` `AskUserQuestion` call per chunk,
        sequentially, each with that chunk's items as options (`label`: title, `description`:
        one-line summary plus any dedup flag — literal format `⚠ possible duplicate: #{N}` when
        Step 4's dedup search found a match), all pre-selected. A batch of 6 renders as 2 calls (4,
        then 2); a batch of 4 or fewer renders as exactly 1 call — mirroring #290's own "4, then 2"
        worked-example convention for its own per-call cap.
      - The question text states explicitly that a checked item **will be filed**, not shortlisted,
        and states the escape hatch plainly per CLAUDE.md's `[IL-13]` (the `Other` field is
        otherwise undocumented in the rendered UI): append a fixed sentence to every batch
        question's text, e.g. "To edit an item instead of filing or skipping it as-is, describe the
        change and which item it applies to (by title) in your next message."
      - An unchecked item is logged as declined: for `/feedback`'s own queue mode, post a comment
        on that item's local `upstream-candidate` issue ("Declined via /claude-tweaks:feedback
        batch review, {date}") and leave the issue open — visible context for a future run, never
        silently dropped or hidden. For the wrap-up path, log the decline exactly as today's
        per-item Skip already does (stated reason, or "declined, no reason given").
      - Editing content instead of a flat include/exclude is a free-text message naming the target
        item by the title shown in its rendered draft (the convention the question text's hint
        above points to) — the same free-text-in-next-message channel `review-console.md`'s
        top-level "Approve all / Override specific items" already uses, generalized to name a
        single item rather than a global choice. This is the **only** override mechanism either
        caller needs; `feedback/SKILL.md`'s own Step 7 does not define a separate one — it inherits
        this definition entirely from the shared contract.
- [ ] Rewrite `skills/feedback/SKILL.md` Step 0: gather every open `upstream-candidate` issue via
      `gh issue list --label upstream-candidate --state open --limit 100` (matching the label's
      expected low cardinality — a handful of headless-filed candidates, not the full backlog —
      while still bounding the read per `[IL-67]`; if the count returned equals the limit, state
      this in the summary rather than silently treating it as complete). Run Steps 1-6 (gather from
      the issue's own body, classify, confirm self-reference doesn't apply, dedup search, draft,
      scrub) non-interactively for each, then call the shared batch contract once (chunked per its
      own rule above) instead of looping Steps 1-8 per selected item.
- [ ] Rewrite `skills/feedback/SKILL.md` Step 7 to operate over 1..N items via the shared batch
      contract: a single free-text invocation renders one item (the contract's single-item
      degenerate case — one chunk of one — functionally unchanged from today); `--queue` mode
      renders N, chunked. Add `--pre-confirmed` (boolean, presence-only, same shape as `--dry-run`)
      to the `argument-hint` and Input table: when present, skip Step 7's `AskUserQuestion` for that
      item — but Step 6 (scrub) always reruns first, regardless of the flag, as a drift check
      against the staged file. **If the rerun scrub produces content that differs from the staged,
      already-approved draft** (the file changed since it was staged), `--pre-confirmed` does NOT
      apply for that one item: fall back to Step 7's normal `AskUserQuestion` confirm, showing the
      diff between the approved and rerun-scrubbed content, so the human re-approves the changed
      content specifically rather than either silently filing it or silently discarding the
      approval. This fallback is per-item — it never aborts sibling items in the same batch.
      **`--dry-run` takes precedence over `--pre-confirmed`** when both are passed: render every
      draft and the classified destination/kind, then stop — no `AskUserQuestion` call of any kind,
      matching `--dry-run`'s existing single-item contract.
- [ ] Add a carve-out to `skills/feedback/SKILL.md`'s Component-Skill Contract section naming
      `/claude-tweaks:wrap-up`'s Review Console as the only legitimate source of `--pre-confirmed`
      — not a general condition any pipeline orchestrator may claim. State plainly that this is a
      prose-enforced, auditable contract (named caller, not an ambient signal), not a code-level
      guard — skills are markdown instructions, not executable code; a future second caller passing
      the flag is a review-time scope violation to flag, not something `/feedback` can structurally
      refuse on its own.
- [ ] Rewrite `skills/wrap-up/review-console.md`'s `Upstream feedback` subsection: replace the
      per-item Apply/Skip/Edit `AskUserQuestion` loop with call(s) to the shared batch contract
      (chunked per its own rule). Update "On approval" step 9 to invoke `/claude-tweaks:feedback
      --pre-confirmed` once per checked item, passing that item's own staged file — the loop only
      ever invokes it for items that were in a chunk's checked set, which is what makes the
      boolean flag's safety hold at the call site (stated explicitly as an invariant, not silently
      assumed — see Gotchas). Update the "Hard requirements" per-item rule (the sentence #290
      already narrowed to `Q#`/`M#`) to state that `U#` uses the batch contract instead, with its
      own rationale line.
- [ ] Update `skills/wrap-up/execution-and-verification.md` Step 9's description: the confirm gate
      is satisfied by the console's own batch approval (`--pre-confirmed`) unless drift is
      detected (see the drift-fallback bullet above); only the scrub gate reruns unconditionally.
- [ ] Update `docs/skill-graph.md`'s `/feedback` ↔ `/wrap-up` edges (lines 175, 399) and
      `docs/plugin-structure.md`'s wrap-up sub-file description to reflect the `--pre-confirmed`
      handoff, the new `_shared` file, and that `U#` is no longer per-item.

## Acceptance Criteria

1. A worked `/claude-tweaks:feedback --queue` example with 3 open `upstream-candidate` issues, no
   dedup matches: exactly one `AskUserQuestion` call (`multiSelect: true`, 3 options, all
   pre-checked, question text including the edit-hint sentence) is issued, preceded by all 3
   scrubbed drafts rendered as literal text. Unchecking one and submitting files the other 2 and
   posts a decline comment on the third's local `upstream-candidate` issue, which stays open.
2. A worked `/claude-tweaks:feedback --queue` example with 6 open `upstream-candidate` issues:
   renders as 2 `AskUserQuestion` calls (4 items, then 2 items) — never 1 call with 6 options, and
   never 6 separate calls.
3. A worked wrap-up example with 4 staged `U#` items: the console renders one `multiSelect` call
   (4 options, all pre-checked) instead of 4 separate Apply/Skip/Edit calls. Approving all 4 invokes
   `/claude-tweaks:feedback --pre-confirmed` 4 times (once per item); none of those 4 invocations
   issues its own `AskUserQuestion` — confirmed by tracing the rewritten Step 7 text for the
   `--pre-confirmed` branch, assuming no drift is detected.
4. A worked example where one of those 4 items' staged file was edited after being staged but
   before the console's "On approval" step ran: that item's `/feedback --pre-confirmed` invocation
   detects the mismatch in its Step 6 rerun and falls back to a normal `AskUserQuestion` confirm
   showing the diff — the other 3 items file without any additional prompt.
5. Step 6 (scrub) runs on every `--pre-confirmed` invocation regardless of the flag — confirmed by
   the rewritten Step 7 text showing the flag gates only the `AskUserQuestion` call (absent drift),
   never the scrub step above it.
6. `/feedback`'s Component-Skill Contract section, after the edit, names
   `/claude-tweaks:wrap-up`'s Review Console specifically as the only legitimate source of
   `--pre-confirmed`, and states in the same paragraph that this is a prose contract, not a
   code-enforced one. Grepping the rewritten section for the literal string `--pre-confirmed`
   returns this paragraph, not a bare mention elsewhere with no such qualification.
7. A dedup match found for one candidate in a batch renders as the literal string
   `⚠ possible duplicate: #{N}` in that item's own drafted text and `multiSelect` option
   description — never as a separate `AskUserQuestion` call.
8. `--dry-run --pre-confirmed` passed together to `/claude-tweaks:feedback --queue` with 2
   candidates renders both scrubbed drafts and states each one's classified destination/kind, then
   stops — no `AskUserQuestion` call of any kind is issued, confirming `--dry-run` wins the
   precedence stated in Deliverables.
9. `docs/skill-graph.md` and `docs/plugin-structure.md`, after the edit, no longer describe `U#` as
   per-item alongside `Q#`/`M#` — grepping both files for the combined pre-edit phrasing (`` `Q#`/`M#`/`U#` ``,
   backtick-delimited exactly as it appears pre-edit) returns zero matches.
10. `tests/multi-agent-coordination.test.js` still passes unmodified — its assertions target
    `review-console.md`'s `Low-confidence findings`/`Contested findings` subsections, an unrelated
    part of the file this leaf does not touch.

## Technical Approach

The shared contract file is the single point both call sites cite, per CLAUDE.md's cross-reference
rule that every relationship between skills is stated once. `/feedback`'s Step 7 becomes the
contract's sole implementation for the direct-invocation path (1..N items, same file, chunked); the
console adopts the contract for its own `U#` decision without needing its own copy of the rendering,
chunking, or override rules.

`--pre-confirmed` is deliberately narrow: it is checked by name in `/feedback`'s Component-Skill
Contract prose, not inferred from `$PIPELINE_RUN_DIR` or any other ambient signal — a pipeline
context alone must not imply pre-confirmation, only an explicit flag from the one named caller does.
Its safety is a two-part contract: the flag itself (checked by name at the callee), and the caller's
own invariant of only ever passing it for an item that was actually in a chunk's checked set
(enforced by `review-console.md`'s loop structure, not re-verified independently by `/feedback` —
see Gotchas for why a stronger, code-level guarantee is out of scope).

### Key Files

- `skills/_shared/upstream-feedback-batch.md` — new; the shared render + chunked-`multiSelect` +
  drift-fallback contract
- `skills/feedback/SKILL.md` — Step 0 (gather-all-then-batch, `--limit 100`), Step 7 (1..N via
  shared contract, `--pre-confirmed` + drift fallback + `--dry-run` precedence), Input table,
  Component-Skill Contract carve-out
- `skills/wrap-up/review-console.md` — `Upstream feedback` subsection, "On approval" step 9, "Hard
  requirements" per-item rule
- `skills/wrap-up/execution-and-verification.md` — Step 9 description
- `docs/skill-graph.md`, `docs/plugin-structure.md` — cross-reference updates

### Package Dependencies

- None — this is a skill-prose change (markdown instructions the model follows), not application
  code; no new runtime dependency is introduced.

## Gotchas

- `AskUserQuestion`'s `multiSelect: true` does not support the tool's `preview` field (single-select
  only per the tool's own description) — the full scrubbed draft must already be rendered as literal
  text immediately above the call for the decision to be informed; the option `description` alone is
  too short to carry a filing decision.
- `AskUserQuestion` caps `options` at 4 per question regardless of `multiSelect` — this is not the
  same constraint #290 names (its own is 4 *questions* per call, for single-select items bundled as
  separate questions); this leaf's constraint is 4 *options* within one `multiSelect` question. Do
  not conflate the two when implementing the chunking logic — verify against the tool's own current
  schema at build time, not against this record's restatement of it.
- `--pre-confirmed` is the exact hazard CLAUDE.md's `[IL-114]` names: "an approval never implies a
  differently-scoped write is authorized... state a dedicated per-decision approval." The batch
  question's wording must make "checked" unambiguously mean "authorize filing now" (not "shortlist
  for later confirmation") so the console's own `multiSelect` call genuinely **is** the dedicated
  per-decision approval `[IL-114]` asks for, not an inferred one. The pre-checked default (all
  items checked, unchecking is the active step) was a deliberate, explicit tradeoff made during this
  leaf's own design conversation — weighing per-item attention against friction — not an oversight;
  do not "fix" it to default-unchecked without a fresh design conversation.
- `--pre-confirmed`'s safety depends on an invariant stated in Deliverables, not re-verified by
  `/feedback` itself: the console only ever passes the flag for an item that was actually in a
  chunk's checked set. Because skills are markdown instructions rather than executable code, nothing
  structurally prevents a future caller from violating this — the mitigation is a named, explicit
  contract clause plus review-time vigilance (CLAUDE.md's own convention for every other
  prose-enforced HARD-GATE in this plugin), not a runtime check. Don't attempt to retrofit one as
  part of this leaf — that's a larger, separate change to how the plugin enforces contracts at all.
- Don't widen `--pre-confirmed`'s legitimacy beyond the Review Console when editing
  `feedback/SKILL.md` — a future second caller passing it is a scope violation to flag in review,
  never a precedent to extend the carve-out to.
- `docs/plugin-structure.md`'s wrap-up description was already narrowed by #290 to separate
  `Q#`/`M#` from a to-be-defined `U#` treatment — re-read that file's *current* state (post-#290)
  before editing, not the pre-#290 version quoted in older commits, per `[IL-93]`.
- CLAUDE.md's cross-reference rule ("every relationship between skills is stated once") means the
  shared contract file's rendering, chunking, override, and drift-fallback rules must not be
  re-explained inline in either `feedback/SKILL.md` or `review-console.md` — both cite it.
- Per CLAUDE.md's `[IL-13]`, the free-text override/edit path rides the `AskUserQuestion` tool's
  otherwise-undocumented `Other` field — the rendered question text must restate the hint (see the
  Deliverables bullet's literal sentence) or the escape hatch is invisible to the person answering.


<!-- work-fingerprint: 2026-08-09-batch-upstream-feedback-confirmation:batch-upstream-feedback-u-filing-into-one-multiselect-decisi -->

