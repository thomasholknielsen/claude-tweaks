---
record: 343
origin: human
risk: low
size: low
ceremony: fast-lane
grants: [build, merge]
surface: backend
---
# 343: Fix execution-and-verification.md's circular gate on reading verification-brief.md

Surface: backend

## Current State

`skills/wrap-up/execution-and-verification.md`'s "Acceptance labeling" bullet decides whether to
open `verification-brief.md` with this **Gate the read** condition:

> when this run is record mode *and* (the record has a resolvable parent, *or* the record's plan
> kind is `app-route`/`rendered-page`), read `verification-brief.md` in this skill's directory

The second disjunct is circular: the record's **plan kind** is not known at gate-check time — it is
authored *inside* `verification-brief.md` itself, at that file's own Step 2 ("Author the observation
plan"). A caller cannot read the plan kind before opening the file that produces it, so as written
the gate can only ever resolve true via the first disjunct (a resolvable parent) — every
`cli`/`flow`/`diff` leaf record with **no** parent never reaches acceptance labeling at all, even
though `verification-brief.md`'s own header states the opposite: its **Routing** section ("## Routing
— read this before anything else, whatever invoked this file") says "Every call site lands here
first," and its Steps 1-4 are the documented path for every non-parent record regardless of plan
kind.

This defect predates the `#323` family — the earlier wording ("or the record is testable") had the
same circular shape — so `#325`'s vocabulary sweep re-keyed the phrase without being able to fix the
underlying logic, since fixing it wasn't that sweep's scope.

Confirmed by reading both files directly: `execution-and-verification.md`'s Gate-the-read bullet
(the "Acceptance labeling" list item) quotes the condition verbatim as diagnosed above, and
`verification-brief.md`'s Step 2 ("Author the observation plan") is indeed where plan kind gets
assigned — strictly after the point where the gate in the other file needs to have already decided
whether to read this file at all.

## Deliverables

- Rewrite the **Gate the read** condition in `skills/wrap-up/execution-and-verification.md`'s
  "Acceptance labeling" bullet so it no longer depends on a value (`plan kind` /
  `app-route`/`rendered-page`) that is only known after the gated file has already run.
- The record's own suggested direction (non-binding — evaluate and adjust as the codebase warrants):
  gate the read on **record mode alone**, and let `verification-brief.md`'s own **Routing** section
  (already documented as "Every call site lands here first") decide the rest — including the
  parent-vs-non-parent split and the `app-route`/`rendered-page` safety-net branch, both of which
  `verification-brief.md` already resolves internally (Parent-Gate Procedure; Step 2.5).
- Whatever the final condition, it must not reference any value that `verification-brief.md` itself
  computes downstream of being opened.

## Acceptance Criteria

- The rewritten Gate-the-read condition contains no reference to plan kind, or to any other value
  first produced inside `verification-brief.md`.
- Every record-mode leaf class reaches acceptance labeling correctly:
  - A record with a resolvable parent routes into `verification-brief.md` (which then internally
    sends it to its Parent-Gate Procedure).
  - A record with no resolvable parent — `cli`, `flow`, `diff`, or `app-route`/`rendered-page` plan
    kind alike — also routes into `verification-brief.md`, which then internally applies Step 2.5's
    visual-review safety net only for the `app-route`/`rendered-page` case, exactly as its own
    Routing section already documents.
  - Conversation-based work (no work record) still skips the read entirely, per the existing
    exception on the same bullet.
- No other call site's behavior regresses: `review-console.md`'s auto-merge short-circuit and
  `dispatch/settle-and-merge.md`'s group gate both inherit the record-mode determination from this
  same bullet and must keep working unchanged.
- `npm test` passes (any prose-conformance test pinning this bullet's wording is updated to match,
  not exempted).

## Technical Approach

Read `skills/wrap-up/execution-and-verification.md`'s "Acceptance labeling" bullet and
`skills/wrap-up/verification-brief.md`'s Routing section, Parent-Gate Procedure, and Step 2.5 in
full before editing, to confirm the replacement condition doesn't silently drop a case the current
(broken) wording accidentally still covered via its first disjunct. Grep the repo for any other
prose or test that paraphrases or pins the current "Gate the read" wording
(`grep -rl "Gate the read\|resolvable parent.*plan kind\|plan kind.*app-route" skills/ tests/`) and
update those in the same change — a partial fix that leaves a stale paraphrase elsewhere reintroduces
the same contradiction this record reports.

## Gotchas

- The fix must not turn the gate into "always read `verification-brief.md` in record mode" without
  checking whether that changes behavior for a case the current first-disjunct-only logic was
  *accidentally* excluding on purpose elsewhere (i.e., verify there's no third caller relying on the
  narrower, broken gate as an implicit filter) — the Acceptance Criteria above name the specific
  regression checks to run.
- `verification-brief.md`'s Step 2.5 safety net is gated on plan kind `app-route`/`rendered-page`
  internally, so simplifying the outer gate to "record mode alone" does not lose that distinction —
  it only moves the decision to the file that was always supposed to own it.

## Original request

Fix execution-and-verification.md's circular gate on reading verification-brief.md

`skills/wrap-up/execution-and-verification.md`'s "Gate the read" condition for acceptance labeling reads "…when this run is record mode *and* (the record has a resolvable parent, *or* the record's plan kind is `app-route`/`rendered-page`), read `verification-brief.md`" — but the plan kind is authored *inside* the gated file (its Step 2, "Author the observation plan"), so the gate is circular, and as written it excludes every `cli`/`flow`/`diff` leaf from acceptance labeling. That contradicts `verification-brief.md`'s own Routing header ("Every call site lands here first"; the no-parent path runs Steps 1-4 for every record, whatever its kind).

The defect predates the #323 family — the pre-observation-plan wording ("or the record is testable") had the same circular shape — so #325's sweep re-keyed the vocabulary without being able to fix the logic.

Suggested direction (not binding): gate the read on record mode alone, and let `verification-brief.md`'s own Routing decide everything else; verify every leaf class (URL-surface, cli, flow, diff, family parent) reaches acceptance labeling.

Origin: reflect from #325's whole-branch review (flow run 2026-08-11T210247-spec-324-325).

**Related:** #323, #324, #325
