---
record: 244
origin: human
risk: low
size: medium
ceremony: standard
grants: [build]
surface: backend
---
# 244: Reduce CLAUDE.md Don'ts bullet count — rule-expiry sweep + duplicate-tag merges

Surface: backend

## Current State

CLAUDE.md's `## Don'ts` section was already extracted to `docs/donts.md` behind a short pointer by #278 (closed 2026-08-15) — that closed record resolved this one's originally-stated trigger. CLAUDE.md now sits at 18,071 B, well under `tests/claude-md-budget.test.js`'s current `BUDGET_BYTES` of 24,576 B (that threshold was itself recalibrated by the same extraction commit, `893d2b02`). The scope below survives the extraction unchanged: it targets `docs/donts.md`'s own bullet count and IL-tag duplication within it, not CLAUDE.md's byte budget directly — that part of the original premise is moot.

`docs/donts.md` currently carries 161 bullets covering 131 distinct `[IL-nn]` tags (re-measured at shaping time — the record's original 139-bullet/116-tag counts are stale; the section has grown since filing). Six tags carry more than one bullet each: IL-07, IL-20, IL-33, IL-95, IL-105 (three bullets — not the two the record originally listed, also stale), and IL-113.

## Deliverables

- Invoke `/claude-tweaks:harness-health`'s rule-expiry check against `docs/donts.md`'s rule set and act on its proposals that carry positive evidence the hazard can no longer occur (e.g. a rule about a procedure `bin/release.js` or another shipped mechanism now executes mechanically).
- Re-measure the six same-tag bullet pairs above (IL-07, IL-20, IL-33, IL-95, IL-105, IL-113) at build time — counts may have shifted again — then merge each into one bullet per incident where the two halves describe one rule, preserving the `[IL-nn]` tag and the rule+clause shape (`docs/donts.md`'s own convention).
- After the rule-expiry and merge passes land, re-measure `docs/donts.md`'s size and CLAUDE.md's, and decide whether to lower `tests/claude-md-budget.test.js`'s `BUDGET_BYTES` further from its current 24,576 B — this is a secondary action, since CLAUDE.md already sits roughly 6.5 KB under budget post-extraction and the test's own comment already documents "lowering encouraged, raising needs a decision."

## Acceptance Criteria

- `docs/donts.md` contains at most one bullet per `[IL-nn]` tag identifier: `grep -oE '\[IL-[0-9]+\]' docs/donts.md | sort | uniq -c | awk '$1>1'` returns nothing.
- Every rule removed via the rule-expiry sweep has its positive evidence (the specific mechanism/commit that makes the hazard impossible) cited in the commit message — staleness alone is not sufficient grounds for removal.
- `npm test` passes, including `tests/claude-md-budget.test.js` at whatever `BUDGET_BYTES` value this record lands on.
- CLAUDE.md's pointer sentence in its `## Don'ts` section still accurately describes `docs/donts.md`'s content after the edits (bullet count/description, if either is stated there, stays in sync).

## Technical Approach

- Read `docs/donts.md` and `docs/incident-log.md` together, per tag, to judge both rule-expiry candidates and merge candidates.
- For each duplicate-tag pair, combine both bullets' rule text into a single bullet respecting the "rule plus one clause of why" shape `docs/donts.md`'s own header mandates.
- If `BUDGET_BYTES` is lowered, update it and its rationale comment together in the same commit, per the test file's existing comment convention.

## Gotchas

- The record's originally-filed counts (139 bullets, 116 tags, IL-105 as a 2-bullet pair) are stale against the current 161 bullets / 131 tags / IL-105 at 3 bullets — re-count at build time rather than trusting the numbers in `## Original request` below.
- #278 already solved this record's originally-stated trigger (CLAUDE.md over its ~22 KB aspiration) via extraction, not bullet reduction. Don't re-do that work — this record's remaining value is `docs/donts.md` content quality (fewer, more current rules), not CLAUDE.md budget relief, which is no longer under pressure.

## Original request

Reduce CLAUDE.md Don'ts bullet count — rule-expiry sweep + duplicate-tag merges

## Problem

#233 recompressed `## Don'ts` per-rule and landed CLAUDE.md at 51,809 B against the record's ~22 KB aspiration. The gap is structural, not prose: the section holds 139 bullets carrying 116 immutable `[IL-nn]` tags, and at the mandated rule+clause shape (~200 B/rule with identifiers and the protected "instead do X" half) the section floors near ~28 KB. Tighter prose cannot close the gap — only fewer bullets can.

## Scope

- Run `/claude-tweaks:harness-health`'s rule-expiry check and act on its proposals (positive evidence the hazard can no longer occur — e.g. rules about procedures the new `bin/release.js` now executes mechanically).
- Evaluate merging same-tag bullet pairs (IL-07, IL-20, IL-33, IL-95, IL-105, IL-113 each have two bullets) — one bullet per incident where the two halves are one rule.
- Lower `tests/claude-md-budget.test.js`'s BUDGET_BYTES to the new landing (lowering is encouraged by that test's own comment; raising needs a decision).

## Trigger

Next `/claude-tweaks:harness-health` run, or whenever CLAUDE.md's budget test starts binding.

Origin: flow run 2026-08-08T231620-spec-234-233, spec 233 review console. Related: #233.

