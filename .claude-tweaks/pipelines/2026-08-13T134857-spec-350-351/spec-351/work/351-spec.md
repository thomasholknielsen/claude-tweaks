---
record: 351
origin: human
risk: medium
size: medium
ceremony: standard
grants: [build]
fingerprint: autonomy-console-headless-wrapup:ledger-route-remainder-routed-to-backlog-report-and-review-f
surface: backend
---
# 351: Ledger route-remainder, routed-to-backlog report, and review-floor ceiling default

Surface: backend

## Overview

Implement the remaining consumers of the ceiling-aware stance: the ledger resolve gate's `ledgerRouteRemainder` branch (at `unattended`, floor-missing items auto-route to backlog records instead of demanding a human), the wrap-up report's "Routed to backlog" section, the `review-severity-floor` ceiling-conditional default at its read site, the pending-review prose caveat in dispatch, and the cross-referencing comments on #288 and #298. Closes the last blocking drill on `unattended`'s headless path.

**Complexity:** Medium
**Estimated tasks:** 6

## Non-Goals

- No console mechanics (console sub-issue) and no contract-stance edits (contract sub-issue).
- `Fix anyway`/`Accept`/`Drop` are never auto-chosen at any tier — this sub-issue only widens *routing*.
- `opsAckAutoAcknowledge` and `wrap-up/nothing-left-behind.md`'s acknowledgment drill are unchanged (verify consistency only — update a sentence there only if it restates the ledger drill's old per-item claim).
- #298 is commented, not closed: lower tiers keep its documented accepted-risk status; only its `unattended`-tier stall is resolved here.
- No leaf-level changes to `_shared/leftover-routing` dispositions: leftover routing keeps whatever `leftover-default` policy already decides; routing here concerns ledger drill items only.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #348 | Autonomy capabilities: consoleAutoResolve and ledgerRouteRemainder behind the unattended ceiling | must land first — `bookkeepingPermissions(ceiling).ledgerRouteRemainder` does not exist in code until #348 lands; this sub-issue's Technical Approach depends on it directly |
| #349 | Contract rewrite: never-silenced rows learn the autonomy ceiling | must land first — the ledger row's tiered stance is defined there |
| #221 | Frontier self-improvement singletons: wrap-up, reflect, feedback, init | bot:in-progress on wrap-up sub-files — rebase over its landed changes before editing `summary-template.md` |

## Current State

- `skills/ledger/resolve-gate.md` — Phase 2: `ledgerNarrowing` (`trusted`+) auto-selects `Route to a record → Keep (backlog)` only for items whose Phase 1 blocker reason clears the four-category floor (`clearsFloor` in `bin/lib/issues/autonomy.js`); everything else drills per-item. Read the Phase 2 text in full before editing.
- `skills/wrap-up/summary-template.md` — renders the record of what the console decided; no routed-items section today.
- `skills/review/step3-routing.md` (**not** `skills/review/SKILL.md`, which never mentions this lever) — `review-severity-floor` is read at line ~49/~73 (default `low`), with the per-severity auto-apply table at lines ~77-85. `skills/_shared/policy-schema.md` carries the schema row. After #348 lands, `_shared/autonomy-ceiling.md` documents the `unattended` default of `medium`; this sub-issue wires the read site.
- `skills/dispatch/SKILL.md` (~line 232) — "an unanswered Review Console `AskUserQuestion` during a headless firing is not an error, it is the expected resting state…" — true only at `supervised`/`trusted` once this family lands.
- #298 — documents the headless ledger-gate stall on dispatch's failure-path teardown; its "Fix directions" predate the lever merge.
- #288 — the parent whose family deliberately kept `M#`/`U#` per-item; this family reverses that on explicit direction.

## Deliverables

- [ ] `resolve-gate.md` Phase 2: when the resolved ceiling grants `ledgerRouteRemainder` (`unattended` only — `queueWriteAutoFile`'s own `trusted`+ gate is a separate mechanism for a separate capability, not an earlier unlock of this branch), items missing the floor also auto-route to `Route to a record → Keep (backlog)` (same restricted-disposition rule as `ledgerNarrowing` — never `Fix anyway`/`Accept`/`Drop`/`Defer → parked`); floor behavior at `trusted` unchanged; ambiguous states still fail closed to asking at tiers where asking is possible. Each routing logs an `AUTO` line extending `ledgerNarrowing`'s existing format (`resolve-gate.md`'s current line: `AUTO {time} — Ledger Phase 2: item #{N} auto-routed to backlog (blocker: {category}). Reversibility: high.`) with two new fields the report needs: `AUTO {time} — Ledger Phase 2: item #{N} auto-routed to backlog as {ref} (blocker: {category}) — "{one-line description}". Reversibility: high.` — `{ref}` is the newly created record's number, `{description}` is a short paraphrase of the ledger item's own content. This exact format is what `summary-template.md`'s new section (below) parses; changing field order or punctuation on one side without the other breaks the report.
- [ ] `summary-template.md`: a "Routed to backlog" section rendered in every mode whenever routing occurred — one row per item, parsed from the `AUTO` line format above: new record ref, one-line description, short blocker reason. Absent entirely when nothing was routed.
- [ ] `skills/review/step3-routing.md` (not `review/SKILL.md` — see Current State): the `review-severity-floor` resolution note gains the ceiling-conditional default (default is `medium` when the resolved ceiling is `unattended` and no explicit value was set), citing `_shared/autonomy-ceiling.md` rather than restating the rationale.
- [ ] `dispatch/SKILL.md` ~line 232: resting-state sentence scoped to `supervised`/`trusted`, one clause pointing at the ceiling contract for the `unattended` behavior.
- [ ] Comment on #298 (refs): the `unattended` tier now resolves the stall via `ledgerRouteRemainder`; lower tiers keep the documented accepted risk.
- [ ] Comment on #288 (refs): record that this family reverses its `M#`/`U#` carve-out on explicit direction, linking the new parent record.
- [ ] `docs/skill-graph.md`: verify whether the ledger-drill→backlog-record creation path (this is the first place `ledgerRouteRemainder` triggers automated record creation from the resolve gate) constitutes a new edge distinct from `queueWriteAutoFile`'s existing one, or reuses it; update only if a genuinely new edge appears, and state the verify outcome either way in the build's commit notes rather than leaving it implicit.
- [ ] `wrap-up/nothing-left-behind.md`: read its ops-acknowledgment drill prose; edit the one sentence there only if it currently restates the ledger drill's old per-item claim (per Non-Goals above) — state in the build's commit notes whether an edit was needed.

## Acceptance Criteria

1. `grep -in "ledgerrouteremainder" skills/ledger/resolve-gate.md` matches Phase 2's new branch, and that branch's text names the restricted disposition (`Route to a record`/`Keep (backlog)`), excludes `Fix anyway`, and contains the exact `AUTO` line template from the Deliverables item above.
2. `grep -in "routed to backlog" skills/wrap-up/summary-template.md` matches the new section, whose row shape includes a record ref column and a blocker-reason column, sourced from the same `AUTO` line template.
3. `grep -in "unattended" skills/review/step3-routing.md` matches the floor-default note, and the note cites `autonomy-ceiling.md`; `grep -in "review-severity-floor" skills/review/SKILL.md` returns zero matches (confirms the note landed at the correct read site, not the file with no mechanism).
4. `grep -in "expected resting state" skills/dispatch/SKILL.md` — the surrounding sentence names the tier condition (`supervised`/`trusted`) or has been rewritten to an equivalent that does.
5. `gh issue view 298 --json comments` and `gh issue view 288 --json comments` each show the new cross-referencing comment.
6. The skill-graph verify outcome and the nothing-left-behind.md verify outcome are both stated in the build's commit notes (present either way — "no edge needed" and "no edit needed" are valid outcomes, silence is not).
7. `npm test` passes.

## Technical Approach

Consumer-side prose wiring: resolve the ceiling once via the standard precedence chain, read `bookkeepingPermissions(ceiling).ledgerRouteRemainder` at the resolve gate, and thread routed-item facts (record ref, item description, blocker reason) into the report via the run's existing decision-log entries — the report reads `decisions.md`, so each routing's `AUTO` line must carry the record ref and short description the report row needs.

### Key Files

- `skills/ledger/resolve-gate.md` — Phase 2 route-remainder branch, AUTO line format
- `skills/wrap-up/summary-template.md` — Routed-to-backlog section
- `skills/review/step3-routing.md` — floor default note (not `SKILL.md`)
- `skills/dispatch/SKILL.md` — resting-state caveat
- `docs/skill-graph.md` — verify-only
- `skills/wrap-up/nothing-left-behind.md` — verify-only, conditional edit

## Gotchas

- The route-remainder `AUTO` log line is the report's data source — write the line format first (ref + description + blocker reason), or the report section has nothing structured to render.
- `queueWriteAutoFile` (`trusted`+) is what files the routed records without a click; at `supervised` this whole branch is locked, so no wording may imply routing happens below `unattended`.
- "Nothing stays unresolved" holds at `unattended` only — the resolve gate's fail-closed-to-asking rule is still correct wherever a human can answer; don't delete it, scope it.
- Use "refs #288" / "refs #298" in commit messages and comments — never closing keywords; #298 stays open deliberately.
- `dispatch/SKILL.md` and `flow/SKILL.md` both restate parts of the gate's firing condition — the restatement sweep in the contract sub-issue classifies those hits; here, touch only the resting-state sentence and verify the classification covered the rest.
- Read `docs/skill-authoring.md` before editing any `skills/**/*.md`.


<!-- work-fingerprint: autonomy-console-headless-wrapup:ledger-route-remainder-routed-to-backlog-report-and-review-f -->
