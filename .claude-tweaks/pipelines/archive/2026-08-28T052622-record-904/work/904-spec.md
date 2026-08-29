---
record: 904
origin: human
risk: medium
size: medium
ceremony: standard
grants: [build]
fingerprint: build-objectives-restructure:auto-decision-log-degrade-trace-contract-skip-entries-for-sk
surface: backend
---
# 904: auto-decision-log: degrade-trace contract — SKIP entries for skipped conditional steps, adopted in /build

Surface: backend

## Overview

A skipped conditional step is currently indistinguishable from a silently-failed one — #778 (a dispatched run skipped the Step 2.8 claim and the pr-first early-PR bootstrap with no trace) and #838 (PR object missing at wrap-up, no push, no degrade log) are the incident class, and `/build` has more conditional steps than any sibling skill. Add a family-wide **degrade-trace rule** to `plugin/skills/_shared/auto-decision-log.md`: any documented conditional action that is skipped or degraded during a run writes one `decisions.md` line — a new `SKIP` entry type, added expand-contract — naming the step, the condition that fired, and the fallback taken. Adopt in `/build` only this pass; sibling skills adopt via their own objective passes.

**Scope boundary against `STAGED`:** `SKIP` covers actions not performed with **no staged artifact** (a skip or a degrade to a lesser fallback). A deferral that produces a staged artifact for the Review Console is already `STAGED`'s territory and stays `STAGED` — the two are disjoint by the presence of a staged artifact, and the rule section must state this disjointness explicitly.

**Complexity:** Medium
**Estimated tasks:** 7

## Non-Goals

- Sibling-skill adoption (per-skill follow-up records)
- The `log-decision` CLI itself (#596/#637 own that mechanism)
- Fixing #778's or #838's individual incidents (this closes the *class* going forward, not the instances)
- No dedupe/idempotency machinery: SKIP lines are per-attempt appends (see Technical Approach)

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #596 | auto-decision-log.md: run-dir appends are refused from a worktree session — add log-decision, fix the prose | **Hard block — lands first.** SKIP lines are written from worktree build sessions; the adoption text cites #596's sanctioned write mechanism directly (no interim-workaround citation ships) |
| #897 | build: extract plan-authoring checks and Common Step 2 dispatch detail into lazy-loaded sub-files | **Hard block — lands first.** Conditional-step text locations (and any step renumbering) settle after the extraction; re-derive locations from the post-#897 file at plan time |

## Current State

- `plugin/skills/_shared/auto-decision-log.md` — the canonical entry schema; the entry-status vocabulary is a **closed set** (verify the exact current token set in that file before widening — do not conflate it with `_shared/ledger-format.md`'s separate closed `reason-not-auto` qualifier set). Consumers that enumerate or parse the vocabulary include `wrap-up/review-console.md`, `flow/multispec-review-console.md`, `research/verify-mode.md` (#554 notes a grammar copy there), and tests — verify the full consumer list by grepping the current token set, fixtures included.
- `/build`'s documented conditional steps — identified by name (numbers are today's, pre-#897; re-derive at plan time): the frontend-surface gate (Common Step 1.7), Manual Steps probing (2.5), the alignment check's skip conditions (4.5), the operational-checklist trigger (5.5), the `docs/REGISTRY.md` gate (6.5), the pr-first draft-PR bootstrap (Spec Step 1; no-op under `local-merge`), and the phase-exit push (Common Step 7). This list is every `/build` step whose text carries a documented skip/no-op condition as of 2026-08-18 — the plan re-greps `/build`'s skill files for skip-condition phrasing ("Skip this step", "skip entirely", "no-op under") to confirm exhaustiveness at implementation time.
- Handoff surface for standalone runs: `/build` Common Step 7 renders `handoff-template.md` (already covers verification status, blocked items, manual steps) — the inline-skip listing extends this existing template; nothing new is invented.
- Precedent for log-only-when-something-happened: `_shared/worktree-setup.md`'s post-creation catch-up logs only when the merge advanced the branch; a no-op writes nothing.
- Known-adjacent: #816 (`appendEntry()` concurrent-write race), #761 (node-script append path — background only; not a shipped citation).

## Deliverables

- [ ] A degrade-trace rule section in `auto-decision-log.md`: when it applies (a documented conditional action skipped or degraded), the `SKIP` entry grammar (below), the `STAGED` disjointness rule (Overview), the no-op rule (a step that runs normally writes nothing — never log "ran fine"), the no-run-dir carrier (standalone runs list skips in the handoff instead), and a self-adoption obligation: any *new* documented conditional action added to any skill after this rule lands must adopt the rule at introduction — the enumerated `/build` list below is the initial adoption, not the rule's boundary
- [ ] `SKIP` added to the entry-status vocabulary expand-contract: every consumer enumerating the vocabulary — skills, fixtures, tests — accepts it in the same change
- [ ] `/build` adoption: each conditional step named in Current State gains a one-line SKIP-write instruction on its skip/degrade path; for the alignment check (today's 4.5), the adoption text states explicitly which branch counts as skipped (its documented skip conditions firing) vs a normal partial run
- [ ] `handoff-template.md` gains the inline-skip listing for no-run-dir runs, with a rendered example
- [ ] Test updates pinning the widened vocabulary

## Acceptance Criteria

1. A `/build` run that skips the frontend-surface gate (non-frontend surface) and the `docs/REGISTRY.md` gate (file absent) produces exactly one `SKIP` line each in `decisions.md`; a run where every step executes produces zero `SKIP` lines. Verified by a scripted scenario walkthrough at review time — skill steps are prose contracts followed by the model, so `npm test` cannot check this; the walkthrough (dry-run transcript against the skill text) is the named verification mechanism
2. A repo-wide sweep for the status-vocabulary enumeration (including fixtures) finds no consumer that rejects or omits `SKIP`
3. Standalone `/build` (no run dir): the handoff renders the skips inline per the template's example and no `decisions.md` write is attempted
4. The pr-first bootstrap skip (#778's class) is cited as a worked example in the rule's own text
5. The rule section states the `STAGED` disjointness rule and the new-step self-adoption obligation verbatim
6. `npm test` green (vocabulary pins and template fixtures — the prose-contract half of AC 1 is the walkthrough's job)

## Technical Approach

Contract text first (`auto-decision-log.md`), consumers second (vocabulary enumeration sites), adoption third (`/build` step edits + `handoff-template.md`). Entry grammar mirrors the existing `AUTO {time} — …` line shape, with an outcome-kind token distinguishing a full skip from a degrade:

`SKIP {time} — {skill} {step-name} ({skipped|degraded}): {condition that fired} → {fallback taken}.`

One line per documented conditional action per run attempt, naming the condition that actually fired (a step with several independent skip conditions logs the firing one, not all of them). Lines are append-only audit: a resumed or retried attempt that re-evaluates the same condition appends its own line — no dedupe. Writes route through #596's sanctioned append mechanism (a hard prerequisite, so no interim-workaround citation ships in adoption text). Anchor adoption edits and the AC by step *name*; re-derive numbers from the post-#897 text at plan time.

### Key Files

- `plugin/skills/_shared/auto-decision-log.md` — rule section + vocabulary widening
- `plugin/skills/build/SKILL.md` — conditional steps' skip paths (post-#897 locations, re-derived at plan time)
- `plugin/skills/build/handoff-template.md` — inline-skip listing for no-run-dir runs
- `plugin/skills/wrap-up/review-console.md`, `plugin/skills/flow/multispec-review-console.md`, `plugin/skills/research/verify-mode.md` — vocabulary-enumeration sites (verify the full consumer list by grepping the current token set)
- `tests/` — vocabulary pins and fixtures

## Gotchas

- The status vocabulary is a closed set checked by table — verify the exact current token set before adding `SKIP`; the ledger's `reason-not-auto` qualifiers are a *different* closed set (`_shared/ledger-format.md`) and stay untouched
- `STAGED` already owns deferral-with-artifact semantics (`_shared/auto-mode-contract.md`'s staged-patch flow) — the disjointness rule exists precisely so an implementer never has to guess which status a deferred action takes
- `decisions.md` appends are refused from worktree sessions (#596, hard prerequisite) — never raw shell appends; a bare relative run-dir path from a worktree silently shadows the main-checkout copy (`[IL-127]`) — cite `_shared/pipeline-run-dir.md` resolution
- `appendEntry()` has a concurrent-write race (#816) — the rule's write frequency is one line per skipped step per attempt, not per-iteration logging; don't design toward high-frequency concurrent appends
- Log only when something was skipped or degraded — a clean pass writes nothing (mirrors `worktree-setup.md`'s catch-up logging convention)
- Expand-contract discipline: add `SKIP` and migrate every consumer in the same change; sweep fixtures repo-wide before asserting no consumer depends on the old closed set

## Decision Rationale

See #896 (parent) — the family-wide contract adopted in `/build` first beat /build-local prose because the contract text is written once either way, and a local version would be rewritten during the lift; `/build` is the first adopter because it has the most conditional steps and the incident evidence (#778/#838) is /build-shaped.


<!-- work-fingerprint: build-objectives-restructure:auto-decision-log-degrade-trace-contract-skip-entries-for-sk -->
