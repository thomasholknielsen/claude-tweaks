---
record: 623
origin: human
risk: medium
size: medium
ceremony: standard
grants: []
fingerprint: 2026-08-16-exhaust-deferral-gate-design:specshapedbody-provenance-footer-params-and-born-shaped-perm
blocked-by: [620, 580]
surface: backend
---
# 623: specShapedBody provenance/footer params and born-shaped permission-matrix rows for wrap-up, reflect, review

Surface: backend

## Overview

Extend the one spec-shaped body composer, `specShapedBody` (`bin/lib/issues/record.js`), so exhaust producers can use it without forking it — an optional provenance header (`Origin:` + `Defer-reason:` lines above `## Current State`), a `footer` parameter (the current "label `wontfix` to suppress future reports" sentence is health-suite-specific and stays their default), and a `needs:definition` variant that renders `## Open Question` in place of Acceptance Criteria — and write the permission-matrix rows that let those producers file spec-shaped, scored, born-`ready` records: rows for `/wrap-up` (leftover routing, ledger routing, residue sweep), `/reflect`, and `/review` in `_shared/work-record.md`, the Born-ready rule paragraph naming the `side-effect:*` classes alongside health skills, and `_shared/autonomy-ceiling.md` noting that auto-filed exhaust is born-shaped. This is Phase 2's contract half of parent #619; #624 (producers) and #625 (capture) do the migration.

**Complexity:** Medium
**Estimated tasks:** 5

## Non-Goals

- Changing any producer's actual body composition — #624 and #625.
- Changing the four health-suite payload builders' output — they keep the default footer and produce byte-identical bodies.
- `ceremony:*` on exhaust records — parity with health skills, which do not stamp it; `/specify` remains ceremony's owner.
- #117 (verified-against commit stamp on health bodies) — a different header line; do not implement it here.
- A runtime validator for the permission matrix. Skills are agent-read prose; the matrix is governance text pinned by conformance tests, and the runtime check on a `ready` record is `refine-mode.md` Step 3.5's structural gate — this is the project's existing model, kept deliberately.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #620 | deferral gate contract: `Defer-reason:` vocabulary (`DEFER_REASONS` in `record.js`) + `recordPayload.deferReason` | must be merged first — re-read `DEFER_REASONS` after it lands and re-verify AC 1's `'tangential'` literal against the final set |
| #580 | housekeeping-auto-merge: derive the default from the autonomy ceiling | in flight (`bot:in-progress`, PR #587) — edits `_shared/autonomy-ceiling.md`, the same file this sub-issue annotates; wait for it, then re-read the trusted row before editing |

## Current State

- `bin/lib/issues/record.js` `specShapedBody({ header, currentState, deliverables, acceptanceCriteria, filedBy })`: throws on any empty section; renders `header`, `## Current State`, `## Deliverables`, `## Acceptance Criteria`, then the fixed footer `_Filed by \`{filedBy}\`. Close to resolve; label \`wontfix\` to suppress future reports of this finding._`. Callers: `bin/lib/{code,docs,harness,journey}-health/issue-payload.js`. Tests: `tests/bin-lib/issues/record.test.js`, `tests/health-filing-parity.test.js` (asserts the default footer verbatim). After #620: `DEFER_REASONS` exported from this same file; `recordPayload` skips inserting `Defer-reason:` when the body already carries a matching line.
- `skills/_shared/work-record.md` Permission matrix: rows for Human, Health skills (`by:{self}`, `risk:*`, `size:*`, `ready` born-ready, Type), `/capture` (`by:capture`, Type, `needs:definition`; `ready` only at trusted+/clean — #575 is changing this branch), `/feedback`, `/specify`, `/backlog refine`, `/backlog grant`, `/backlog overview`, `/dispatch`, `/tidy`, Executors, `/wrap-up` (Adds `demo:pending`; Removes `bot:in-progress`; Never `auto:*`, `ready`, `demo:approved`, `demo:changes-requested`), `/demo`; the preamble sentence "Extending it to another residue producer (`/wrap-up` leftovers, `/reflect` routing, `/demo` follow-ups — the `side-effect:*` classes) means editing that actor's own row, deliberately"; "## Spec-shaped body" (three sections present + non-empty, none of the three placeholder markers `_shared/work-record.md`'s Spec-shaped body section names (the to-be-determined tag, the to-do tag, the unresolved-ambiguity HTML comment)); "## Born-ready rule" ("Health-skill records … file with `ready` already applied … `/capture` is the only actor this covers; every other agent path keeps the `Never` column its own matrix row states"). Rows already encode conditions inline in their cells (e.g. `/capture`'s "`ready` **only** under …").
- `skills/_shared/autonomy-ceiling.md`: the trusted row's `queueWriteAutoFile` capability text; the AUTO log-line example for born-ready capture.
- `bin/lib/issues/provenance.js`: an `Origin:` body line resolves to `kind: 'side-effect'`, source = the line's text — the trust ledger's `side-effect:*` classes.

## Deliverables

- [ ] `specShapedBody` gains three optional parameters, all defaulting to today's behavior: `provenance` — `{ origin?: string, deferReason?: DEFER_REASONS[number] }`, rendered as `Origin: {origin}` and `Defer-reason: {deferReason}` lines (each only when supplied) between `header` and `## Current State`, `deferReason` validated via `oneOf` against `DEFER_REASONS`; `footer` — a string replacing the default footer sentence, or `null` to omit it; `openQuestion` — a non-empty string that renders `## Open Question` **in place of** `## Acceptance Criteria` (mutually exclusive with `acceptanceCriteria`: passing both, or neither, throws) — the composer's `needs:definition` variant, so a needs-you record is still composed by the one composer without a placeholder AC that would trip the placeholder-marker gate. `header` remains the slot for any producer-specific leading lines (e.g. `Trigger: {condition}` for a `parked` leftover) and renders first. Health-suite callers pass none of the three and produce byte-identical output. Exhaust producers pass a footer of the form `_Filed by \`{producer}\` via specShapedBody._` — the machine-visible provenance marker the matrix rows below key on.
- [ ] `tests/bin-lib/issues/record.test.js`: variants (origin only, deferReason only, both, custom footer, `null` footer, `openQuestion` in place of AC, both-AC-and-openQuestion throws, neither throws, unknown deferReason throws); a "health parity" case asserting the no-argument call equals the pre-change string exactly. `tests/health-filing-parity.test.js` unchanged and green.
- [ ] `skills/_shared/work-record.md`: the existing **`/wrap-up`** row is rewritten as one row covering all its filing paths (leftover routing, ledger Phase 2/3 routing, residue-sweep records, plus the existing `demo:pending` / claim-release cells), with conditions written **inside the cells**, in the file's own style: Adds — `risk:*`, `size:*`, `ready` (born-ready — **only** on a body composed via `specShapedBody` carrying a valid `Defer-reason:` and a `via specShapedBody` footer; a `Trigger:` leftover carries `parked` instead of `ready`), Type (content-judged as today: `task`/`bug`/`feature`), `needs:definition` (**instead of** `ready`/scoring, on the composer's `openQuestion` variant), `demo:pending`; Removes — `bot:in-progress` (claim release); Never — `auto:*`, `bot:*` (other than the release), `priority:*`, `demo:approved`, `demo:changes-requested`, and `ready` on any body not composed by `specShapedBody` or alongside `parked`/`needs:definition`. New rows **`/reflect`** (tangential routing, Defer) and **`/review`** (Step 3 Defer/Capture) with the same Adds/Never cell text as `/wrap-up`'s born-ready clause (spelled out in each row, not "same as above"), minus the `demo:pending`/claim cells. The preamble sentence is rewritten to say these rows now exist. "## Born-ready rule": add a paragraph — records composed via `specShapedBody` by `/wrap-up`, `/reflect`, `/review` (the `side-effect:*` trust classes) are born-ready by construction exactly as health-skill records are; the sentence "`/capture` is the only actor this covers" is retired; the two landing states (born-ready, or `needs:definition` via `openQuestion`) are stated once here.
- [ ] `skills/_shared/autonomy-ceiling.md`: `queueWriteAutoFile`'s capability text notes that an auto-filed exhaust proposal is spec-shaped and born-ready by construction, so `refine-mode.md` Step 3.5's spec-shape gate never flags it back (the #575 failure mode, prevented here by construction rather than by chaining `/specify`).
- [ ] `tests/deferral-gate-conformance.test.js` (this file, definitively): `work-record.md` contains rows whose first cell names `/wrap-up`, `/reflect`, `/review` and whose Adds cell contains `ready` and `specShapedBody`; it no longer contains "`/capture` is the only actor this covers"; the Born-ready rule names `side-effect`; `autonomy-ceiling.md` mentions `specShapedBody` in the `queueWriteAutoFile` text.

## Acceptance Criteria

1. `node -e "const {specShapedBody}=require('./bin/lib/issues/record.js'); const a=specShapedBody({header:'H',currentState:'c',deliverables:'d',acceptanceCriteria:'a',filedBy:'x'}); const b=specShapedBody({header:'Trigger: after #42 lands',currentState:'c',deliverables:'d',acceptanceCriteria:'a',filedBy:'x',provenance:{origin:'wrap-up leftover from #42',deferReason:'tangential'},footer:'_Filed by \`wrap-up leftover routing\` via specShapedBody._'}); const c=specShapedBody({header:'',currentState:'c',deliverables:'d',openQuestion:'which store?',filedBy:'x',footer:null}); console.log(a.includes('wontfix'), b.startsWith('Trigger: after #42 lands'), b.includes('Origin: wrap-up leftover from #42'), b.includes('Defer-reason: tangential'), b.includes('via specShapedBody'), c.includes('## Open Question'), c.includes('## Acceptance Criteria'))"` prints `true true true true true true false`.
2. `node --test tests/bin-lib/issues/record.test.js tests/health-filing-parity.test.js` passes; the four health builders' parity assertions are unchanged.
3. `grep -c "is the only actor this covers" skills/_shared/work-record.md` prints `0`; `grep -n "^| \*\*\`/reflect\`\*\*\|^| \*\*\`/review\`\*\*" skills/_shared/work-record.md` shows both new rows; `grep -c "^| \*\*\`/wrap-up\`\*\*" skills/_shared/work-record.md` prints `1`.
4. `npm test` passes in full.

## Technical Approach

Additive parameters with defaults equal to today's behavior — the health builders are the regression oracle. Provenance lines render between `header` and `## Current State` so `provenance.js`'s `Origin:` line-anchored parse and `refine-mode.md` Step 3.5's structural check both keep working. `openQuestion` is the composer's honest "I cannot write AC" path — no placeholder text, no throw-dodging. The matrix edit is one row per actor, conditions inside the cells (the file's existing convention), so a future editor reading only the cell sees the exception.

### Data / API Surface

- `specShapedBody({ header, currentState, deliverables, acceptanceCriteria?, openQuestion?, filedBy, provenance?: { origin?, deferReason? }, footer?: string | null })` — exactly one of `acceptanceCriteria`/`openQuestion`.
- Body layout: `{header}\n\n[Origin: …]\n\n[Defer-reason: …]\n\n## Current State …\n\n## Deliverables …\n\n(## Acceptance Criteria | ## Open Question) …\n\n{footer}` — each optional line followed by a blank line; omitted lines leave no blank.

### Key Files

- `bin/lib/issues/record.js` — `specShapedBody` parameters
- `tests/bin-lib/issues/record.test.js` — variants + parity case
- `skills/_shared/work-record.md` — matrix rows, Born-ready rule, preamble sentence
- `skills/_shared/autonomy-ceiling.md` — `queueWriteAutoFile` note
- `tests/deferral-gate-conformance.test.js` — matrix assertions

### Package Dependencies

None.

## Gotchas

- `work-record.md` is 30.5 KB — the rows and one paragraph must be tight; do not restate the spec-shaped check or the vocabulary (cite `_shared/deferral-gate.md`).
- One `/wrap-up` row, not two — "every row is exhaustive for its actor" means exhaustive across all that actor's filing paths, with the sub-flow conditions in the cell text.
- Open record #117 wants a "verified-against commit" line on health bodies through this same composer — orthogonal; leave room (the provenance block is not the only possible header extension point) but do not implement it.
- The default footer text is asserted verbatim by `tests/health-filing-parity.test.js` — keep it byte-identical.
- The composer must never emit any of the three placeholder markers `_shared/work-record.md`'s Spec-shaped body section names (the to-be-determined tag, the to-do tag, the unresolved-ambiguity HTML comment) in any line it renders — those are `refine-mode.md` Step 3.5's placeholder markers.
- The `via specShapedBody` footer is prose-governed provenance, not a cryptographic proof — the project's model is agent-read skills + conformance tests + the Step 3.5 structural gate; say so once in the Born-ready paragraph rather than implying enforcement that does not exist.


<!-- work-fingerprint: 2026-08-16-exhaust-deferral-gate-design:specshapedbody-provenance-footer-params-and-born-shaped-perm -->
