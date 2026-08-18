---
record: 514
origin: human
risk: medium
size: medium
ceremony: standard
grants: []
fingerprint: backlog-overview-funnel-design:backlog-overview-native-blocked-by-resolution-ranking-blocke
blocked-by: [513]
surface: backend
---
# 514: backlog overview: native blocked-by resolution, ranking blockedBy expand-contract, and mode-aware refine repair

Surface: backend

## Overview

Make dependency mis-ranking in `/claude-tweaks:backlog overview` impossible to hit silently. Root cause (observed 2026-08-15 on the #418/#419/#420 chain): this repo runs `work-links: native` — blocked-by links live in GitHub's dependency graph — while `rankNextToBuild` reads only issue bodies via `record.js`'s `parseDependencies`, so wired-up chains ranked as zero-dependency and the tool confidently recommended the chain's *last* record first. Four coordinated pieces: overview fetches native blocked-by sets and attaches them to candidates; `ranking.js` prefers the explicit array over body parsing (expand-contract); a mechanical mismatch check flags prose dependencies that resolved to nothing and suppresses chain drawing; `refine`'s apply step offers a mode-aware repair. Plus the render rule that a detected ranking error *replaces* the headline recommendation instead of caveating it.

**Complexity:** Medium
**Estimated tasks:** 6

## Non-Goals

- No change to `parseDependencies` semantics — its canonical line-start `Blocked by #N` contract has other consumers; prose-guessing would trade a loud gap for quiet wrong parses (parent record, Decision Rationale).
- No chain *rendering* — drawing `#A ─▶ #B ─▶ #C` blocks and transitive-unblocks ranking is the batch-emitter sub-issue; this sub-issue only makes the blocker data correct and the mismatch loud.
- No new locking or claim mechanics.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #513 | backlog overview: funnel header render, consequence-line trust, and lens demotion | open |

Blocked by the funnel-render sub-issue: both rewrite `skills/backlog/overview-mode.md`, and this sub-issue's detection flag renders inside the bare-mode layout that sub-issue defines. **Do not start until #513 merges** — the "open" status above is a hard sequencing requirement, not advisory; #513 must also be read alongside this record before implementing (its layout anchors and narration rule are cited, not restated in full, here).

## Current State

- `bin/lib/issues/ranking.js` — `rankNextToBuild(candidates)`, pure ("Every input this needs … must be precomputed by the caller and attached to each candidate — this function does no I/O"). `computeUnblocksCount` iterates `parseDependencies(c.body)`; header comment documents the tie-break order.
- `bin/lib/issues/record.js` — `parseDependencies(body)` (line-anchored `DEP_RE`), `parseDependencyAssumptions`.
- `skills/backlog/overview-mode.md` Step 3 — assembles candidates `[{id, facets, body, keyFiles, hasPlan}]` (keyFiles extraction, hasPlan glob), calls `rankNextToBuild`, renders "Recommended next" with a tie-break rationale line.
- `skills/backlog/refine-mode.md` — label-refinement mode with an existing human-confirmed Apply step (see also open bugs #460 and #461 against this file — adjacent, do not fix them here, do not regress the Step 4 human-confirm gate #461 describes).
- `bin/lib/issues/capabilities-probe.js` — `probeSchema` checks the GraphQL `blockedBy` field's availability (header comment explains why the count-only `issueDependenciesSummary` sibling is insufficient).
- `.claude-tweaks/policy.yml` — `work-links: native` (this repo); `_shared/work-record-config.md` defines the key; `spec-template.md`'s Facets table maps native vs body-text link representation.

## Deliverables

- [ ] `bin/lib/issues/ranking.js`: `computeUnblocksCount` (and anything else reading blockers) resolves each candidate's blocker list as: `Array.isArray(c.blockedBy)` → use it verbatim; otherwise → `parseDependencies(c.body)` (existing behavior, so every current caller is unaffected). Extract the resolution into a single small helper named exactly `blockersOf(candidate)` — the name is a fixed export contract, not a suggestion: the batch-emitter sub-issue #515 imports it by this name rather than re-deciding precedence. Update the module header comment's input contract.
- [ ] `bin/lib/issues/ranking.js`: new pure `findUnresolvedDependencyProse(candidates)` → array of `{id, mention}` for every candidate whose body matches `/blocked by #\d+/i` **anywhere** (mid-line prose included — deliberately broader than `DEP_RE`) while `blockersOf(c)` resolves empty. `mention` is the full containing line of the first match, trimmed. Exported alongside `rankNextToBuild`. **Accepted limitation, stated here so nobody assumes otherwise:** the check fires only on empty resolved blockers; a *partially* wired record (non-empty `blockedBy` missing some prose-mentioned id) is not flagged — prose mentions have no mechanical ground truth (a `#N` in prose may not be a dependency at all), so partial-coverage checking would guess. Record this sentence in the skill text too.
- [ ] Tests: `blockedBy` preferred over body text when both present and disagree; fallback to `parseDependencies` when `blockedBy` absent; `blockedBy: []` means "explicitly no blockers" (no body fallback — an empty array is an answer, not an absence); `findUnresolvedDependencyProse` positive case (prose, no resolved blockers), negative control (canonical line resolves → not flagged; native array non-empty → not flagged), and case-insensitivity.
- [ ] `skills/backlog/overview-mode.md` Step 3: candidate assembly gains blocker resolution — under `work-links: native`, fetch each candidate's blocked-by set via the GraphQL `blockedBy` field as **one aliased query** (one alias per candidate issue, chunked at 50 aliases per request; buildable candidate sets are small, so one chunk is the norm) and attach `blockedBy: [ids]`. A candidate whose node is missing or errored inside an otherwise-successful batch response gets **nothing attached** for that id only — never coerce a failed node to `[]`, since empty-array means "confirmed no blockers" and that distinction is what the detection below runs on. Under `work-backend: local-files`, attach `facets.blockedBy` as the `blockedBy` array (it is already native-shaped data); under `work-links: body-text`, attach nothing and let the body-text fallback stand. Probe unavailability (`capabilities-probe.js`'s `probeSchema`) or whole-fetch failure degrades to the fallback with a failure-only narration line (per #513's narration rule: status lines render only on failure/degradation — restated here because #513 must be read alongside this record), never a hard stop.
- [ ] `skills/backlog/overview-mode.md` Step 3: after ranking, run `findUnresolvedDependencyProse` over the candidates; on any hit, render a loud flag naming the affected ids (their `mention` lines) and suppress chain-shaped claims about them. State the render outcomes precisely: this sub-issue renders **no** corrected chain (chain drawing is #515) — when detection fires, the flagged candidates get no mechanical recommendation, and the output either (a) cites explicit dependency evidence it holds (native links on other candidates, the flagged records' own prose) as a *corrected* "Recommended next" with the citation inline, or (b) when no such evidence resolves an order, states plainly that ranking is unreliable for the flagged set and points at the refine repair. The headline-replacement rule: whenever a corrected recommendation is rendered under (a), it IS the "Recommended next" and the raw ranker pick demotes to a one-line footnote — never render a recommendation the same output retracts. ("The model otherwise concludes the order is wrong" means exactly case (a): citable dependency evidence contradicting the mechanical order — no citation, no replacement.) Include a worked example in the skill text tracing the #418/#419/#420 failure through the new path, so the rule is verified by scenario, not just by grep.
- [ ] `skills/backlog/refine-mode.md` Apply step: for records flagged by the same detection, offer the mode-aware repair — wire the native blocked-by link (same dependency API `/claude-tweaks:specify`'s Step 4 linking uses) under `work-links: native`; append a canonical line-start `Blocked by #N` line under `body-text` — surfaced through the existing human-confirm gate exactly like its other writes. Adding this new confirmable item *type* is in scope; the gate's mechanics (when it fires, that it blocks until confirmed) are not touched — that is the boundary. Never write both representations for one edge.

## Acceptance Criteria

1. `node --test` on the ranking suite passes with new cases: (a) candidate with `blockedBy: [2]` and a body reading `Blocked by #3` ranks using blocker 2, not 3; (b) no `blockedBy` key → body parsing result unchanged from today (regression pin for existing callers); (c) `blockedBy: []` yields zero blockers even when the body has a canonical line.
2. `findUnresolvedDependencyProse` test: a candidate whose body says "Hard prerequisites, wired as Blocked by links: #418 and #419" with empty resolved blockers is returned; the same body with `blockedBy: [418, 419]` attached is not; a body with a line-start `Blocked by #418` and no `blockedBy` key is not (the fallback resolves it). Negative control included per test-authoring memory.
3. `overview-mode.md` Step 3 contains: the native fetch instruction naming the GraphQL `blockedBy` field and `capabilities-probe.js`, the aliased/chunked batching wording (the batching itself is skill-text behavior, enforced by this text plus review — no runtime test exists for it, stated here so nobody hunts for one), the per-node partial-failure rule, the degradation path, the detection call, the chain-suppression rule, the headline-replacement rule (greppable: `grep -i "corrected" skills/backlog/overview-mode.md` hits), and the #418/#419/#420 worked example.
4. `refine-mode.md`'s Apply step names both repair representations, conditions each on the `work-links` mode, routes through the existing confirm gate, and contains the never-both rule — greppable: `grep -i "blocked.by" skills/backlog/refine-mode.md` hits the repair text.
5. Reverting only the `ranking.js` change and re-running the new tests fails them (verify-test-discrimination check — run it, don't assume).

## Technical Approach

Expand-contract per CLAUDE.md's contract-change discipline: add the optional `blockedBy` input, migrate the overview caller, leave every other `rankNextToBuild` caller (`/help`'s Priority Order) byte-compatible — a later record may migrate `/help` to native fetch; not this one. The purity contract holds: all I/O (GraphQL fetch, probe) happens in the skill's Step 3 assembly, `ranking.js` stays side-effect free.

### Data / API Surface

- `candidates[].blockedBy?: number[]` — optional; ids of records blocking this candidate. Present ⇒ authoritative (even when empty). Absent ⇒ fall back to `parseDependencies(c.body)`.
- `blockersOf(candidate) -> number[]` — the single precedence decision, exported for the batch-emitter sub-issue.
- `findUnresolvedDependencyProse(candidates) -> Array<{id, mention}>` — `mention` is the matched prose snippet (for the rendered flag).

### Key Files

- `bin/lib/issues/ranking.js` — `blockersOf`, `computeUnblocksCount` change, `findUnresolvedDependencyProse`, header-comment update
- `tests/bin-lib/` (ranking's existing suite directory — read the listing first) — new cases
- `skills/backlog/overview-mode.md` — Step 3 assembly, detection, headline rule
- `skills/backlog/refine-mode.md` — Apply-step repair

### Package Dependencies

None.

## Gotchas

- `blockedBy: []` vs absent is load-bearing — an empty native graph answer must NOT fall back to body prose, or the mismatch detection can never distinguish "no deps" from "unfetchable deps". Encode it exactly as specified.
- `capabilities-probe.js`'s header explains why `issueDependenciesSummary` is insufficient (count-only) — use the `blockedBy` field itself.
- Do not touch `refine-mode.md`'s Step 4 human-confirm gate semantics — #461 documents a live risk of subagents sliding past it; the repair rides the existing gate, adds no bypass.
- Do not fix #460/#461 here even though the file is open in the editor — surgical changes only (CLAUDE.md).
- `/help` shares `rankNextToBuild` — run its consumer path in tests as the no-`blockedBy` regression pin (AC 1b) so the expand half provably doesn't break the unmigrated consumer.
- zsh mangles `"$ref:path"` forms in any shell snippets — brace as `"${ref}:path"` (project memory).

See parent record for Decision Rationale.


<!-- work-fingerprint: backlog-overview-funnel-design:backlog-overview-native-blocked-by-resolution-ranking-blocke -->
