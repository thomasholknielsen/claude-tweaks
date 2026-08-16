---
record: 624
origin: human
risk: medium
size: high
ceremony: standard
grants: []
fingerprint: 2026-08-16-exhaust-deferral-gate-design:exhaust-producers-file-spec-shaped-born-ready-leftover-routi
blocked-by: [621, 623]
surface: backend
---
# 624: exhaust producers file spec-shaped born-ready: leftover routing, ledger Keep/Defer, reflect tangential, residue sweep, review Defer/Capture

Surface: backend

## Overview

Migrate the pipeline's exhaust producers onto the spec-shaped composer: wrap-up leftover routing, the ledger resolve gate's `Keep`/`Defer`/`Acknowledge` branches, reflect's tangential routing and Defer, the residue sweep's `remedy: record` items, and review Step 3's Defer/Capture branches compose their record proposals via `specShapedBody` (#623 — with the `Origin:` + `Defer-reason:` provenance header and the `via specShapedBody` footer), stamp `risk:*`/`size:*` and `ready` through `recordPayload`, and — when the producer cannot honestly write Acceptance Criteria — use the composer's `openQuestion` variant and file `needs:definition` with no `ready`. After this sub-issue an exhaust record lands in exactly two states, born-ready or needs-you, never as a prose stub. The producers hold the diff, the ledger entry, and the finding at the moment they file; this makes them write it down in the shape `/flow` can build from — and a Task 0 checks that claim against real records before any editing.

**Complexity:** High
**Estimated tasks:** 8

## Non-Goals

- `/capture`'s shaped-body branch and its `--defer-reason=` flag — #625; this record's Capture routes hand a shaped body to capture using #625's interface once it lands, and the `Defer-reason:` line-in-idea-text pass-through (#621) until then.
- `/feedback`, health skills, `/specify` decomposition — already correct or deliberately excluded.
- The deferral gate itself, the `Defer-reason:` header (#620/#621), the Review Console's refuse row (#622) — the console filing proposals without checking the header (today's behavior) is safe if #622 has not landed; nothing here depends on it.
- `ceremony:*` on exhaust records — parity with health skills; `/specify` stamps it on any later touch.
- Retroactively reshaping records already in the backlog.
- A semantic check that Acceptance Criteria are verifiable rather than filler — accepted limitation (see Gotchas).

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #621 | consumers cite the gate and stamp `Defer-reason:` | must be merged first — same five files, this sub-issue edits them again |
| #623 | `specShapedBody` provenance/footer/openQuestion params + matrix rows | must be merged first — this sub-issue calls the new params and files under the new rows |

## Current State

- `skills/wrap-up/leftover-routing.md` (after #621): step 1 runs the fix-now check, composes prose (`Origin:` line + description [+ `Trigger:`]) with a `Defer-reason:`; step 2 `recordPayload({title, body, type, parked})` — no origin/risk/size/ready; step 3 stages `{run-dir}/staged/leftover-{slug}.md` with the four-line header block; step 5 defers creation to the console (or `queueWriteAutoFile` creates directly). Auto-mode `leftover-default` policy picks `parked` vs `backlog`.
- `skills/_shared/ledger-format.md` Phase 3: `Defer` → stage `ledger-record-{slug}.md` (`parked`, `Trigger:`, `Origin: ledger resolve gate`, affected files); `Keep` → same, backlog; `Acknowledge` → same, `Origin: ledger resolve gate (acknowledged)`, `Type: task`; standalone (no run dir) → create directly. Phase 2's `ledgerNarrowing`/`ledgerRouteRemainder` auto-select `Route to a record → Keep` and "compose the staged-proposal body exactly as Phase 3's `Keep` branch".
- `skills/reflect/SKILL.md` Step 3: a tangential finding stages `# Reflect — staged finding {n}` with `**Category:** tangential` and the four-line header; `skills/reflect/full-mode.md`'s Defer creates a `parked` record directly via `recordPayload` (a `Trigger:` line, origin, context); `hindsight-mode.md`'s Defer/Capture "are the same as `full-mode.md`'s" (one indirection sentence — it composes nothing of its own); `Capture` routes to `/claude-tweaks:capture`.
- `skills/wrap-up/residue-sweep.md`: `remedy: record` findings enter the ledger `open` and route through Phase 2's drill; #621 mapped them to vocabulary values.
- `skills/review/step3-routing.md` (after #621): Defer creates a `parked` record directly ("Compose the body with a `Trigger:` line, origin spec, and affected files") via `recordPayload` with `deferReason`; Capture invokes `/claude-tweaks:capture` with the finding text carrying a `Defer-reason:` line.
- `bin/lib/issues/record.js` (after #623): `specShapedBody({ header, currentState, deliverables, acceptanceCriteria | openQuestion, filedBy, provenance:{origin, deferReason}, footer })`; `recordPayload({ …, risk, size, ready, parked, deferReason })` — `deferReason` there is validation-plus-body-line for callers not using the composer; when the body already carries a matching `Defer-reason:` line it validates and inserts nothing, so passing the same value to both is the documented pattern (they must match; a mismatch throws).
- `_shared/work-record.md` (after #623): `/wrap-up`, `/reflect`, `/review` rows permit `risk:*`/`size:*`/`ready` on `specShapedBody`-composed records carrying the `via specShapedBody` footer, or `needs:definition` on the `openQuestion` variant; Born-ready rule names the `side-effect:*` classes. Scoring criteria: `_shared/work-record.md`'s Scoring axis (blast radius/reversibility → risk; size + file spread → size), the same judgment `/specify` shaping mode applies.
- `refine-mode.md` Step 3.5's spec-shape gate: three sections present and non-empty, none of the three placeholder markers `_shared/work-record.md`'s Spec-shaped body section names (the to-be-determined tag, the to-do tag, the unresolved-ambiguity HTML comment) — the check every born-ready record must pass.
- Census evidence (2026-08-16 overview run): recent exhaust records per producer — ledger residue #549/#548/#499, reflect staged #539/#538/#431, review-console approvals #375/#374, leftovers #551/#550/#280.

## Deliverables

- [ ] **Task 0 — premise check, before any edit:** for each producer, read the three census records above (via `gh issue view N --json body`) and record in the PR body whether Acceptance Criteria could have been written honestly from what the producer held at filing time (the finding, the diff, the ledger evidence). If any producer's sample says "no, not even once", stop and report — the design's born-ready claim for that producer is not established, and its branch should land as `openQuestion`-only until it is.
- [ ] `skills/wrap-up/leftover-routing.md` step 1–2: compose the leftover as `specShapedBody({ header: parked ? 'Trigger: {condition}' : '', currentState: <what exists now — the section's finished part, files touched>, deliverables: <what is left, as checkbox items>, acceptanceCriteria: <how a builder verifies it is done — a test name, a grep, an observable behavior>, filedBy: 'wrap-up leftover routing', provenance: { origin: 'wrap-up leftover from #{n}', deferReason }, footer: '_Filed by \`wrap-up leftover routing\` via specShapedBody._' })`; `recordPayload({ title, body, type, risk, size, ready: !parked, parked, deferReason })` — scoring judged per the Scoring axis from the section's own content. When Acceptance Criteria cannot be honestly written, use `openQuestion: '<the open choice, or "insufficient evidence: {what is missing}">'` instead of `acceptanceCriteria`, and file with `needs:definition` in `Labels:` and no `ready`/scoring — the `openQuestion` text must say which of the two cases it is (open choice vs insufficient evidence), because the human resolving it needs to know. `parked` leftovers (a real `Trigger:`) are spec-shaped and scored but not `ready` (`recordPayload` rejects both). `Defer-reason:` is present in every landing state, including `needs:definition` — it names why the item was not fixed, independent of whether it is decidable.
- [ ] `skills/_shared/ledger-format.md` Phase 3 `Keep`/`Defer`/`Acknowledge` and the standalone direct-create path: same composition — `currentState` = the ledger item's evidence and affected files, `deliverables` = the fix as stated, `acceptanceCriteria` = the ledger item's own verification (test name, grep, behavior); `Acknowledge` items (ops) keep `Type: task`, `Defer-reason: blocked-external`, and reuse the born-ready label shape (`risk:*`, `size:*`, `ready`) — `deliverables` = the human action ("do X in the dashboard"), `acceptanceCriteria` = the observable outcome; there is no separate Manual Steps section (`/build` Step 2.5 triages the deliverable at execution time); an ops action that itself names an open choice takes the `openQuestion` path like any other item — the escape hatch is not withheld from this branch. Phase 2's narrowing/`ledgerRouteRemainder` inherit this by reference ("exactly as Phase 3's `Keep` branch").
- [ ] `skills/reflect/SKILL.md` Step 3 tangential + `full-mode.md` Defer (hindsight inherits by its existing indirection): the staged `# Reflect — staged finding {n}` body is composed via `specShapedBody` (the finding → Current State, the proposed change → Deliverables, the observable outcome → Acceptance Criteria; `header: ''`; `provenance: { origin: 'reflect {mode} from #{n}', deferReason: 'tangential' }` for tangential routing or the router's reason for Defer; footer `_Filed by \`reflect\` via specShapedBody._`); `Capture` hands the shaped body to `/claude-tweaks:capture` (via #625's `--defer-reason=` once it lands; the `Defer-reason:` line in the idea text until then) or, when the insight names an open choice, the `openQuestion` body with `--needs-definition`.
- [ ] `skills/wrap-up/residue-sweep.md`: a `remedy: record` item that Phase 2 routes to a record follows the ledger Phase 3 composition above — one sentence citing it, plus #621's vocabulary mapping.
- [ ] `skills/review/step3-routing.md` Defer/Capture: Defer composes via `specShapedBody` (finding + evidence → Current State; the fix → Deliverables; the review lens's own check → Acceptance Criteria; `provenance: { origin: 'spec #{n} review ({lens})', deferReason }`; footer `_Filed by \`review\` via specShapedBody._`), stamps scoring + `ready` (or `parked` + a `Trigger:` header when the reason is `blocked-dependency`/`blocked-external` with a concrete wake condition), and Capture hands the shaped body to `/claude-tweaks:capture` as above.
- [ ] Every producer above: the `AUTO`/`STAGED` log line names the landing state — `— landing: {born-ready|needs:definition|parked} (defer-reason: {value})`.
- [ ] `tests/deferral-gate-conformance.test.js`: each of the five producer files (`leftover-routing.md`, `ledger-format.md`, `reflect/SKILL.md`, `residue-sweep.md`, `step3-routing.md`) names `specShapedBody` and both landing states (`born-ready`, `needs:definition`); `leftover-routing.md` no longer contains "no `risk`/`size`/`ready`"; `step3-routing.md` and `full-mode.md` no longer contain "Compose the body with a `Trigger:` line, origin spec, and affected files".
- [ ] Post-ship live check recorded in parent #619's close-out comment: the next three `/flow` runs' exhaust records are all `ready` or `needs:definition`; none is a stub.

## Acceptance Criteria

1. Task 0's per-producer sample and verdict appear in the PR body before any skill edit in the same PR.
2. `node --test tests/deferral-gate-conformance.test.js` passes and fails when `leftover-routing.md`'s composition is reverted.
3. `grep -rn "specShapedBody" skills/wrap-up/leftover-routing.md skills/_shared/ledger-format.md skills/reflect/SKILL.md skills/wrap-up/residue-sweep.md skills/review/step3-routing.md` matches in all five files; `grep -rn "Compose the body with a \`Trigger:\` line, origin spec, and affected files" skills/` returns no matches.
4. A dry-run wrap-up (`/claude-tweaks:wrap-up --dry-run`) on a fixture run dir with one leftover section previews a staged file whose body contains `## Current State`, `## Deliverables`, `## Acceptance Criteria`, an `Origin:` line, a `Defer-reason:` line, and a `via specShapedBody` footer, and whose `Labels:` header contains `risk:`, `size:`, and `ready`; the same fixture with an undecidable section previews `## Open Question`, `needs:definition`, and no `ready` — verified by reading the preview output.
5. Every previewed born-ready body passes `refine-mode.md` Step 3.5's structural check (three sections non-empty, none of the three placeholder markers `_shared/work-record.md`'s Spec-shaped body section names (the to-be-determined tag, the to-do tag, the unresolved-ambiguity HTML comment)); `npm test` passes in full.

## Technical Approach

One composer, five call sites, no re-implementation: each producer maps its own evidence onto the three sections and hands the rest to `specShapedBody` + `recordPayload`. Scoring is the same content judgment `/specify` shaping mode makes — cite `_shared/work-record.md`'s Scoring axis, do not restate criteria. `needs:definition` is the composer's `openQuestion` variant, not a third body shape: a producer either writes Acceptance Criteria (born-ready) or names the open choice / missing evidence (needs-you). `parked` (a real `Trigger:` in `header`) is orthogonal: spec-shaped, scored, not `ready`.

### Data / API Surface

- Every staged proposal body: `[Trigger: …]\n\nOrigin: …\n\nDefer-reason: …\n\n## Current State …\n\n## Deliverables …\n\n(## Acceptance Criteria | ## Open Question) …\n\n_Filed by \`{producer}\` via specShapedBody._` (composer output; the four-line header block above the body per the staged-file contract).
- `Labels:` header on staged files: `risk:{tier}, size:{tier}, ready` (born-ready, incl. Acknowledge) | `needs:definition` (needs-you) | `risk:{tier}, size:{tier}, parked` (parked) — plus `type:{t}` under `work-types: labels`.
- Log-line suffix: `— landing: {born-ready|needs:definition|parked} (defer-reason: {value})`.

### Key Files

- `skills/wrap-up/leftover-routing.md` — steps 1–3 composition + labels
- `skills/_shared/ledger-format.md` — Phase 3 branches + standalone path
- `skills/reflect/SKILL.md`, `skills/reflect/full-mode.md` — tangential/Defer/Capture composition (`hindsight-mode.md` unchanged — it inherits)
- `skills/wrap-up/residue-sweep.md` — citation of the ledger composition
- `skills/review/step3-routing.md` — Defer/Capture composition
- `tests/deferral-gate-conformance.test.js` — producer assertions

### Package Dependencies

None.

## Gotchas

- `ledger-format.md` (21.7 KB) and `reflect/SKILL.md` (16.5 KB) have room; `leftover-routing.md` (8.9 KB) too — but keep each producer's composition to one paragraph plus one code block; the composer's contract is documented once in `record.js` and `_shared/work-record.md`.
- The staged-file reader (console step 7 / multispec step 2 / narrowing auto-file) reads `Labels:` as a comma-separated list — emit exactly that shape, and bootstrap `risk:*`/`size:*`/`ready`/`needs:definition` labels per `_shared/label-bootstrap.md` at creation time (the console does this today for `parked`).
- `parked` + `ready` is rejected by `recordPayload` — the `parked` branch passes `ready: false`; `needs:definition` and `ready` never coexist — the `openQuestion` path drops both `ready` and scoring.
- The residue sweep and leftover routing run in `--dry-run` too — the composition must be pure (no writes) so previews stay accurate.
- Accepted limitation: the structural gate cannot tell verifiable Acceptance Criteria from filler; the human grant at `refine` sees the AC, and the trust ledger's `side-effect:*` classes grade outcomes. Task 0 is the up-front check; the live check after ship is the follow-up.
- Memory: subagent dispatch prompts must say "refs #N", never "closes #N" — the composed Current State for a review-Defer record cites its origin spec as `refs #{n}`.
- #575 (in flight) changes `/capture`'s born-ready branch; #625 owns capture's side of the Capture route — until #625 lands, the shaped body travels via #621's pass-through convention.


<!-- work-fingerprint: 2026-08-16-exhaust-deferral-gate-design:exhaust-producers-file-spec-shaped-born-ready-leftover-routi -->
