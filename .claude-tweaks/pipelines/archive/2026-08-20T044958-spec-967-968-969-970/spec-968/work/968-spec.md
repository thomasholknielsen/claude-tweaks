---
record: 968
title: "specify next: framing-check guard + shaped:headless provenance"
origin: human
risk: medium
size: medium
ceremony: standard
grants: []
surface: backend
---

Surface: backend

## Overview

Give the headless shaping unit its quality gate and its honesty marker. Before shaping, a `next` firing runs `/claude-tweaks:challenge` `framing-check` on the selected record; a record that isn't mechanically shapeable (solution-baked framing, ambiguity that needs a human conversation) is not shaped — it gets `needs:definition` stamped and is routed to the interactive brainstorming path `/specify` already has for that label. A record that is shaped gets `ready` plus a new `shaped:headless` provenance label, so downstream trust decisions can distinguish a spec no human reviewed. The routing outcome is a success, not a failure — the triage itself is productive output.

**Complexity:** Medium
**Estimated tasks:** 5

## Non-Goals

- No changes to `framing-check` itself — #772 tracks the `## Gotchas`-evidence improvement; this sub-issue consumes the verdict as-is.
- No grant-gate behavior (#969).
- No changes to interactive shaping — a human-driven `/specify #N` (and `--chained`) never stamps `shaped:headless` and runs no extra guard.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #967 | specify next: headless selection form + shared headless-self-report extraction | must land first — this record edits `next-mode.md` |

## Current State

- `plugin/skills/challenge/SKILL.md` — `framing-check`: an inline Skill-tool component mode rendering exactly two lines — `FRAMING: open | solution-baked` then `RATIONALE: {paragraph}` — where the RATIONALE on `solution-baked` names the unvalidated assumptions; ambiguity deliberately resolves to `open`.
- `plugin/skills/specify/SKILL.md` Resolve-the-input case 1 — the `needs:definition` redirect: a record carrying the label never enters shaping; it routes to `/superpowers:brainstorming`. The guard writes this label to hand a record to that existing path.
- `plugin/skills/specify/next-mode.md` — created by #967 (claim → shape skeleton, claim/release defined by `_shared/issue-claims.md`, failure paths filing the shared headless self-report); the guard inserts between claim and shape.
- `plugin/skills/_shared/work-record.md` — the label taxonomy and permission matrix (canonical home for label families); `plugin/skills/_shared/label-bootstrap.md` — canonical label list for bootstrap; `plugin/skills/_shared/github-write-transport.md` — the write path for label edits and comments.
- `plugin/bin/lib/issues/record.js` — `parseRecordFacets(labels)` parses label families into facets; its unit suite lives under `tests/`.
- `plugin/skills/_shared/auto-decision-log.md` — the canonical entry schema for auto-resolutions.

## Deliverables

- [ ] `next-mode.md` guard step between claim and shape: invoke `Skill(claude-tweaks:challenge, framing-check)` against the record's title + body as re-read at claim time (issue body only, no comments — matching framing-check's own Gather scope; staleness between that read and the guard call is accepted). **Verdict parsing:** the verdict is the line matching `^FRAMING: (open|solution-baked)$`; everything after is the RATIONALE. Output with no such line is not a verdict — it is a shaping-stage failure, handled by #967's failure path (release claim + self-report), never coerced to either verdict.
  - `FRAMING: open` → proceed to shape.
  - `FRAMING: solution-baked` → do NOT shape: stamp `needs:definition`, post one comment (transport per `_shared/github-write-transport.md`) naming the verdict, the RATIONALE's assumptions, and the interactive route as a paste-ready command on its own line (`/claude-tweaks:specify #{N}`), release the claim, log the decision, and end the firing as a success.
- [ ] `shaped:headless` label registered once: in `_shared/work-record.md`'s taxonomy (meaning: "shaped by the headless specify-next unit; no human reviewed the spec body"; writer: `/specify` `next` mode only; reader: the grant gate and `/backlog attention`) and in `_shared/label-bootstrap.md`'s canonical list; the permission matrix gains the row explicitly rather than widening an existing one.
- [ ] `parseRecordFacets` in `record.js` parses `shaped:headless` into a `shapedHeadless: true` facet (absent otherwise).
- [ ] `next-mode.md` stamping: the shaped record's write applies `ready` and `shaped:headless` in one API call (a single label-edit call adding both — never two calls, so no reader ever observes `ready` without the provenance marker). Every auto-resolved decision (framing verdict, design-intent, label writes) logs per `_shared/auto-decision-log.md`'s schema when a run dir resolves; a Routine firing resolves no pipeline run dir, so the documented fallback applies — decisions are noted in the firing's returned output only, with no alternate log target.
- [ ] Tests: conformance pins for the guard ordering, the verdict-parse contract, the one-call label write, and the label registration; a pin asserting `next-mode.md`'s eligibility predicate still excludes `needs:definition` (re-asserting #967's exclusion co-located with the guard that depends on it); unit coverage for the `parseRecordFacets` addition in the existing `record.js` suite.

## Acceptance Criteria

1. `next-mode.md` states the guard ordering (claim → framing-check → shape-or-route), the anchored verdict-parse contract with unparseable-output-as-failure, and the exact `solution-baked` handling (needs:definition + comment with paste-ready command + claim release + success exit).
2. `_shared/work-record.md` declares `shaped:headless` exactly once with writer and readers named; `_shared/label-bootstrap.md` carries it; no other file restates the definition.
3. `parseRecordFacets` returns `shapedHeadless: true` for a label set containing `shaped:headless` and leaves every existing facet unchanged — the test includes an unrelated third label family in the same set (orthogonal-category rule).
4. A guard-routed record ends with `needs:definition` present and `ready`/`shaped:headless` absent — pinned in prose and test; the `ready` + `shaped:headless` stamp is a single label-edit call — pinned in prose.
5. The conformance suite pins the `needs:definition` exclusion in the eligibility predicate, so a future edit to the selection form cannot silently reopen the reprocessing loop.
6. `npm test` passes; the new `record.js` test fails when the facet parsing is reverted (verify once during development).

## Technical Approach

The guard reuses `/specify`'s existing `needs:definition` semantics — it never invents a new state. The self-terminating property is the design's loop guard: #967's eligibility predicate excludes `needs:definition`, so a routed record leaves the headless queue permanently until a human intervenes — and AC 5 pins that exclusion from this record's own test so the invariant is asserted where it is relied on, not only where it is implemented. `shaped:headless` follows the existing single-writer label discipline (compare `demo:pending` and the `bot:*` families in the permission matrix). Claim and release are `_shared/issue-claims.md` operations defined by #967's skeleton; the guard calls the same contract's release, nothing bespoke.

### Data / API Surface

- Label `shaped:headless` — provenance marker. Writer: `/specify` `next` mode only. Readers: `evaluateGrantGate` (#969) and `/backlog attention`. Never blocks an interactive human grant.
- `parseRecordFacets(labels)` gains `shapedHeadless: boolean`.

### Key Files

- `plugin/skills/specify/next-mode.md` — guard + stamping
- `plugin/skills/_shared/work-record.md` — taxonomy + permission-matrix row
- `plugin/skills/_shared/label-bootstrap.md` — canonical label list entry
- `plugin/bin/lib/issues/record.js` — facet parsing
- `tests/` — record.js unit suite + the specify conformance test from #967

### Package Dependencies

- none

## Gotchas

- `framing-check`'s ambiguity direction is deliberately `open` (anti-manufactured-doubt, stated in `challenge/SKILL.md`'s own anti-patterns) — do not "harden" the guard by re-resolving ambiguity toward `solution-baked`; the guard inherits the mode's calibration as-is. Unparseable output is the one exception, and it resolves to the failure path, not to a verdict.
- #772 (open): framing-check doesn't read `## Gotchas` evidence — a record justified via `/challenge`'s evidence bullets may still be flagged and routed. Acceptable for v1 (the route is human-reversible); do not fix it here — it is #772's scope.
- The permission matrix in `_shared/work-record.md` currently says `/specify` never touches `auto:*`/`bot:*` — the new row must be added alongside that rule without weakening it.
- The routed-record comment must carry the runnable command on its own line (report-lines convention: every actionable line gets a paste-ready command).

<!-- work-fingerprint: headless-shaping-unit:specify-next-framing-check-guard-shaped-headless-provenance -->
