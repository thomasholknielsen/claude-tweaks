---
record: 349
origin: human
risk: medium
size: medium
ceremony: standard
grants: []
blocked-by: [348]
surface: backend
---
# 349: Contract rewrite: never-silenced rows learn the autonomy ceiling

Surface: backend

## Overview

Rewrite the auto-mode contract's "What `auto` does NOT silence" rows — and every restatement of them — to the new ceiling-aware stance: memory writes, work-record creation, and upstream filing are covered by the Review Console's batch "Approve all" at `supervised`/`trusted`, and auto-resolved under `consoleAutoResolve` at `unattended`; the ledger resolve Phase 2 row learns `ledgerRouteRemainder`. This records two deliberate reversals in prose (never silent bypasses): the #288 family's `M#`/`U#` per-item carve-out, and [IL-114]'s unchecked-by-default posture for upstream filing under "Approve all" (the unchecked default survives only inside the Override drill — stated in the rewritten rows so the console sub-issue can cite it).

**Complexity:** Medium
**Estimated tasks:** 5

## Non-Goals

- No mechanics changes in `wrap-up/review-console.md`, `console-template.md`, `execution-and-verification.md`, `batched-item-drill.md`, `upstream-feedback-batch.md` — the console sub-issue owns those files; this sub-issue defines the stance they implement.
- No changes to `ledger/resolve-gate.md`, `review/SKILL.md`, `dispatch/SKILL.md` — the ledger/sweep sub-issue.
- The rows that stay never-silenced are not weakened: HARD-GATEs (test failures, spec compliance, structural coupling, plan validation), `BLOCKED`/`STOP` conditions, merge-conflict resolution, and human-only `auto:*` granting per `_shared/work-record.md` all keep their current force.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #348 | Autonomy capabilities: consoleAutoResolve and ledgerRouteRemainder behind the unattended ceiling | must land first — the rewritten rows name these capabilities. `ledgerNarrowing` is a pre-existing capability (already shipped, `trusted`+, unaffected by #348); only `consoleAutoResolve` and `ledgerRouteRemainder` are new. |

## Current State

- `skills/_shared/auto-mode-contract.md` — "What `auto` does NOT silence" table (~line 179); the memory-writes row (~line 188) ends "**Not** exempt under any `autonomy` tier"; section 6 lists the HARD-GATE exemption; a "changing the contract" checklist (~lines 216–228) names every file to touch — follow it.
- `skills/_shared/auto-mode-card.md` — the compact never-silenced list (~lines 25–32), including "Memory file writes … — never exempt".
- `skills/wrap-up/memory-curation.md` — Step 1 states "Memory writes are never auto-resolved regardless of mode" and a same-turn-write prohibition tied to per-item approval.
- CLAUDE.md's "Auto-Mode Contract + Bookend Architecture" section parenthetically restates the not-silenced list ("ledger resolve Phase 2, work-record creation — …, governance gates") with the `autonomy` ceiling's bookkeeping carve-out.
- `skills/_shared/autonomy-ceiling.md` — after the capabilities sub-issue: both new capabilities documented; this sub-issue only cross-cites, never restates.

## Deliverables

- [ ] `auto-mode-contract.md`: memory-write, work-record-creation, and upstream-filing rows rewritten to the tiered stance, each naming `consoleAutoResolve` and citing `_shared/autonomy-ceiling.md`; the ledger resolve Phase 2 row updated to name `ledgerNarrowing` (`trusted`+, pre-existing) and `ledgerRouteRemainder` (`unattended`, new via #348); the reversal of #288's carve-out and of [IL-114]'s Approve-all posture stated in the rewritten prose, citing #288/[IL-114]/#347 (this family's parent) by number. State the new default explicitly, not just what it replaces: under "Approve all" at every tier, `M#`/`Q#`/`U#` all apply/file by default (the checked state); the previously-unchecked `U#` default survives only inside the Override drill's own per-item chunking, never as the Approve-all default.
- [ ] `auto-mode-card.md`: the compact list updated to match — same stance, one line per row, no independent wording that can drift (cite the contract file).
- [ ] `wrap-up/memory-curation.md` Step 1: "never auto-resolved regardless of mode" replaced with the tiered stance; the same-turn-write prohibition retargeted to "before the console's batch decision (or auto-resolution) for this run" rather than per-item approval. Write-procedure mechanics stay out (console sub-issue).
- [ ] CLAUDE.md: the Auto-Mode Contract paragraph's not-silenced parenthetical updated (short — rule plus why, per the CLAUDE.md-conciseness convention).
- [ ] Restatement sweep with visible output: `grep -rin "never silence\|not silence\|never exempt\|not exempt\|never auto-resolved\|per-item approval\|per-item human" skills/ docs/ CLAUDE.md` — classify every hit as (a) updated here, (b) owned by a sibling sub-issue (name it), or (c) already consistent. Include the classification list in the build's ledger/commit notes. [IL-93]: five files restated a gate list and all five went stale.

## Acceptance Criteria

1. `grep -n "Not exempt under any" skills/_shared/auto-mode-contract.md` returns zero matches.
2. `grep -in "consoleautoresolve" skills/_shared/auto-mode-contract.md` matches in all three rewritten rows' text, and `grep -in "ledgerrouteremainder" skills/_shared/auto-mode-contract.md` matches the ledger row.
3. `grep -in "never exempt" skills/_shared/auto-mode-card.md` returns zero matches; the card's memory/queue/upstream lines reference the contract's tiered stance.
4. `grep -in "never auto-resolved" skills/wrap-up/memory-curation.md` returns zero matches.
5. The sweep classification list exists in the run's ledger or commit message with every hit dispositioned (a/b/c per the deliverable above).
6. `npm test` passes. No test currently pins this contract's prose verbatim (`grep -rln "auto-mode-contract\|auto-mode-card" bin/ tests/` matches no test file as of this record's authoring — re-verify at build time in case that changed); if one is found, fix the pin in the same commit as the prose it pins, never by weakening the test.
7. HARD-GATE rows unchanged: `grep -in "HARD-GATE" skills/_shared/auto-mode-contract.md` still matches section 6's exemption list.

## Technical Approach

Pure contract-prose work following `auto-mode-contract.md`'s own "changing the contract" checklist. Each rewritten row keeps the table's existing column shape (what / why). State the stance once in the contract; the card, memory-curation, and CLAUDE.md cite it.

### Key Files

- `skills/_shared/auto-mode-contract.md` — never-silenced table rewrite
- `skills/_shared/auto-mode-card.md` — compact list alignment
- `skills/wrap-up/memory-curation.md` — Step 1 stance
- `CLAUDE.md` — Auto-Mode paragraph parenthetical

## Gotchas

- Follow the contract's own change checklist (~lines 216–228) — it names consumer files this sub-issue must at least verify, beyond the four above.
- State the tiered stance **once** (contract file); everywhere else cites it. The restatement sweep exists because copies drift, not to create more copies.
- `memory-curation.md` also warns that "a different table's approval … is likewise not this gate" — that sentence is owned here (stance), while the console's Hard-requirements twin of it is owned by the console sub-issue; don't let the two end up asserting different things (cross-check at build end).
- Commit references to #288/#298/[IL-114] use "refs #N", never closing keywords — subagents echo closing language from context otherwise.
- Read `docs/skill-authoring.md` before editing any `skills/**/*.md`.


<!-- work-fingerprint: autonomy-console-headless-wrapup:contract-rewrite-never-silenced-rows-learn-the-autonomy-ceil -->
