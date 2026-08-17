---
record: 857
origin: human
risk: low
size: medium
ceremony: standard
grants: []
fingerprint: transcript-judge-extraction:reflect-s-standalone-singleton-reads-the-transcript-via-the
blocked-by: [856]
surface: backend
---
# 857: Reflect's standalone singleton reads the transcript via the shared transcript-judge harness

Surface: backend

## Overview

Upgrade `/reflect`'s existing standalone Frontier singleton (record #221, `skills/reflect/SKILL.md` Step 2) from artifact-bundle-only to artifact-bundle **plus** transcript, by consuming the `_shared/transcript-judge.md` contract that prerequisite #856 creates. No new dispatch anywhere: the one Task agent standalone reflect already pays for gains the resolved transcript path, the slicing guidance, and (when a `reflect`-keyed watermark exists) the offset clause. The component-invoked path — every `/wrap-up`-driven reflect — is untouched. Degradation binds to the shared self-assessment path, which for reflect must be the existing inline lens procedure (AC 6 pins that equivalence), so a transcript-resolution failure can never make reflect worse than it is now.

**Complexity:** Medium
**Estimated tasks:** 4-6

## Non-Goals

- No dispatch for component-invoked reflect — #221's "component-invoked ⇒ no dispatch, standalone ⇒ dispatch" rule stands (parent #855's Decision Rationale).
- No change to the lens set or the finding shape — sibling #858 owns `Evidence:`/`Cost this session:` lines; this sub-issue changes what the judge **reads**, not what it returns.
- No events.jsonl changes — #500 (Friction lens blind spot for ad-hoc sessions) stays its own record; this sub-issue only makes the harness available for #500's transcript-fallback candidate to reuse.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #856 | Extract `skills/_shared/transcript-judge.md` and namespace the evaluation watermark per consumer | blocked-by link on this record |

Related: #500 — companion; its candidate fix 1 (transcript fallback for the Friction lens) should consume `_shared/transcript-judge.md`'s resolution mechanics rather than reinventing them.

## Current State

- `skills/reflect/SKILL.md` (17,865 B) Step 2's standalone `[Use: Frontier]` singleton assembles an artifact bundle — Step 1's gathered context (changed files, git log, existing spec/review/ledger context) plus the resolved mode's lens file inlined in full — and dispatches one Task agent, resolved via `resolve-profile.js frontier`; the transcript is never part of the bundle.
- The dispatch rule (SKILL.md's Component-Skill Contract section): `$PIPELINE_RUN_DIR` set or `--source` present ⇒ inline lens pass, no dispatch; neither ⇒ the one singleton dispatch.
- After #856 lands: `_shared/transcript-judge.md` owns transcript resolution, slicing guidance, degradation, and the consumer-keyed watermark protocol; `bin/lib/transcript-judge/watermark.js` accepts `{ consumer }`. The signatures cited below are #856's stated surface — **at pickup, re-verify them against the merged `_shared/transcript-judge.md` and `bin/lib/transcript-judge/watermark.js` before implementing**, and reconcile this record if they diverged.

## Deliverables

- [ ] Step 2's standalone dispatch prompt gains, per `_shared/transcript-judge.md` and cited from it rather than restated: the resolved transcript path, the slicing guidance, and — when `readWatermark(path, { consumer: 'reflect' })` returns non-null — `formatOffsetClause(...)`'s output verbatim. The artifact bundle stays; the prompt carries both.
- [ ] Watermark write, with its timing stated exactly: capture `bytesAtDispatch` before dispatch and the judge's return status at return time; the write itself executes **after Step 3 routing completes**, gated on that captured status being `DONE`/`DONE_WITH_CONCERNS`. No write on `NEEDS_CONTEXT`/`BLOCKED`, none on the inline path, and none after a terminal dispatch failure (degradation resolves to the inline path, which never writes). Payload: the `reflect`-keyed watermark with `bytesAtDispatch` and `filedRecords` holding one short summary per insight that Step 3 resolved to a **durable routed outcome** (a filed/queued record or staged proposal — no-action insights excluded). The summary string is the one-line summary Step 3's routing already produces per insight; if no such per-insight summary exists in the skill text at pickup, producing it is part of this deliverable. Empty array when nothing qualified — the offset clause renders "none".
- [ ] Degradation binding: a transcript-resolution failure or terminal dispatch failure resolves to the existing inline lens procedure, named in the skill text as the shared contract's self-assessment path (with its `(self-assessment)` header tags and the `record-failure` clause on terminal dispatch errors).
- [ ] The component-invoked path's text is unchanged in behavior: no dispatch, no transcript read, no watermark. The cross-session coverage limit (judged work may predate this session under `pr-first` background convergence) is stated **immediately after the transcript-path prompt item added to Step 2's dispatch prompt**, citing the shared contract's scope statement.
- [ ] Conformance test pinning: Step 2 cites `_shared/transcript-judge.md` with consumer key `reflect`; the component-invoked branch contains no transcript/watermark instruction.
- [ ] `docs/skill-graph.md` gains the reflect→transcript-judge edge.

## Acceptance Criteria

1. `node --test tests/` passes in full.
2. The new conformance assertions have each been demonstrated to fail against the pre-change text (prove-red per the `skill-prose-conformance-tests` discipline).
3. A case-insensitive grep of `skills/reflect/SKILL.md` for transcript-resolution mechanics (slug derivation, mtime fallback) finds each mechanic's mention only on a line that carries the literal citation `_shared/transcript-judge.md` — the pinned citation phrase, not term co-occurrence.
4. `wc -c skills/reflect/SKILL.md` stays under 40,960 B after the additions (17,865 B today — ample, but the ceiling check is the discipline).
5. The watermark consumer key is the literal `reflect` at every read/write site in the skill text — never derived, never shared with feedback's default.
6. Degradation equivalence: the degradation binding names the same lens files and the same Step 3 routing as the component-invoked inline procedure — a conformance assertion checks both paths reference identical lens-procedure text, so "fallback = today's behavior" is pinned, not asserted.

## Technical Approach

The dispatch structure does not change — same singleton, same resolver call, same output template routing into Step 3. The additions are prompt items (transcript path, slicing, conditional offset clause) plus a post-Step-3 watermark write, both defined by citation to `_shared/transcript-judge.md` with reflect's consumer parameters: rubric = the resolved mode's lens file (already inlined today), model profile = `frontier` (already resolved today), watermark consumer = `reflect`.

### Data / API Surface

- No new module API. Consumes `readWatermark`/`writeWatermark`/`formatOffsetClause` from `bin/lib/transcript-judge/watermark.js` with `{ consumer: 'reflect' }`.

### Key Files

- `skills/reflect/SKILL.md` — Step 2 dispatch additions, post-Step-3 watermark write, degradation naming, cross-session caveat.
- `docs/skill-graph.md` — new edge.
- `tests/` — new conformance assertions: extend the reflect prose-pin suite if one exists; if none pins reflect SKILL.md text today, create `tests/reflect-transcript-judge-prose.test.js` (sibling #858 extends the same file).

### Package Dependencies

- none.

## Gotchas

- The watermark consumer key must be `reflect`, not the module default — the default (`feedback`) would silently share feedback's store and make one skill's evaluation skip spans the other never judged; this is the exact failure #856's namespacing exists to prevent.
- `filedRecords` for reflect records routed-insight **summaries**, not issue numbers — the offset clause renders them as "these records already exist: …"; keep each summary to one short clause so the clause stays readable.
- Capture `bytesAtDispatch` **before** dispatch — the judge's own tool calls append to the transcript while it runs (the shared contract states this; do not re-stat after return).
- The `--source wrap-up` flag is set on every wrap-up-invoked reflect, standalone wrap-up included — the component-invoked branch is the common path, so a regression there has a larger blast radius than one in the standalone dispatch; the conformance pin on the untouched branch is not optional.
- Transcript evidence complements the artifact bundle and `events.jsonl` — never replaces them (#500's events-based Friction evidence stays authoritative for cross-session friction; parent #855's Decision Rationale coverage-limit entry).

## Decision Rationale

See parent #855's Decision Rationale — this sub-issue implements the "existing dispatch reads the transcript" and "no component-invoked dispatch" decisions recorded there.


<!-- work-fingerprint: transcript-judge-extraction:reflect-s-standalone-singleton-reads-the-transcript-via-the -->

