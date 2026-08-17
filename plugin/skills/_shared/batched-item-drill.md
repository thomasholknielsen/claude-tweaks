# Batched Item Drill — Chunking Contract

A small, generic contract for reducing N per-item `AskUserQuestion` calls to `ceil(N/4)` calls,
used by `_shared/ledger-format.md`'s Resolve Gate section, `wrap-up/review-console.md` (the Override drill for its `Q#`/`M#`
sections — Approve all resolves those sections to their own default directly, with no call into
this contract at all; see that file's Hard requirements), and `wrap-up/nothing-left-behind.md`'s
ops-acknowledgment step. Deliberately generic: it defines the chunking/encoding/override
mechanism only — no caller-specific outcome names, defaults, or disposition vocabulary live here.

Distinct from `skills/_shared/upstream-feedback-batch.md` (if present) — that contract, when it
exists, carries upstream-feedback-specific rules (dedup-match rendering, decline-comment posting)
that don't belong in a generic contract.

## Two mechanisms, chosen by shape

- **multiSelect chunking** — for a genuinely **binary** per-item choice. One checkbox per item
  encodes the choice directly in checked/unchecked state. Chunk size is bounded by
  `AskUserQuestion`'s 4-*options*-per-question cap.
- **Bundled single-select chunking** — for a per-item choice that is **three-or-more-way** and
  cannot be checkbox-encoded (a checkbox represents "in or out of one set," not "which of three
  sets"). Up to 4 separate, distinct single-select questions in one call. Chunk size is bounded by
  `AskUserQuestion`'s 4-*questions*-per-call cap — a different cap than multiSelect's, even though
  both happen to be 4.

Verify both caps against the tool's own current schema at build time before relying on either —
they are two distinct limits that happen to share a number, not one constraint.

## Chunking

Split the remaining items into groups of at most 4. Issue one `AskUserQuestion` call per chunk,
sequentially. A batch of 6 renders as 2 calls (4, then 2); 4 or fewer renders as exactly 1.

## Binary encoding (multiSelect mechanism)

For a two-way per-item choice, one checkbox option per item represents it — checked means the
*first* named outcome, unchecked means the *second*. Each caller states which of its own two
outcomes maps to checked in its own citing text; this file does not hard-code outcome names.

## Pre-check default is a per-caller choice

Whether to pre-check every item to a recommended outcome is not fixed by this contract:

- A caller with a genuine "most items are fine as-is" case pre-checks every item to the
  recommended outcome — accepting a whole chunk costs zero clicks.
- A caller with no such default (every remaining item is inherently ambiguous — that's often why
  it survived an earlier auto-routing pass) leaves every item unchecked, requiring the user to
  actively check the ones they want the checked-outcome for.

Both still gain the one-call-per-chunk reduction; only the pre-check default differs.

## Free-text override hint

Every batch question's text must restate that describing an edit by item name in the next message
is the escape hatch (`Other` is otherwise undocumented in the rendered UI — CLAUDE.md's `[IL-13]`).

## What stays forbidden

A presented "apply to all" option *within a single item's own choice* is still forbidden under
either mechanism — the checkbox state (or, for bundled single-select, each item's own distinct
question) *is* the per-item choice, never a shared bulk toggle answered once for the whole chunk.
