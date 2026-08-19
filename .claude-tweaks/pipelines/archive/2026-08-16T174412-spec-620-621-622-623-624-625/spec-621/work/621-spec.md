---
record: 621
origin: human
risk: low
size: medium
ceremony: standard
grants: []
fingerprint: 2026-08-16-exhaust-deferral-gate-design:deferral-gate-consumers-review-step-3-reflect-residue-sweep
blocked-by: [620]
surface: backend
---
# 621: deferral gate consumers: review Step 3, reflect, residue sweep, leftover routing cite the gate and stamp Defer-reason on staged proposals

Surface: backend

## Overview

Make every non-ledger exhaust channel run the same deferral gate the ledger does. Review Step 3 routing, reflect (full and hindsight modes, plus reflect's tangential staged-file header), the wrap-up residue sweep, and wrap-up leftover routing each replace their own defer wording with a citation of `_shared/deferral-gate.md` (#620), run its fix-now criteria before anything becomes a record proposal, and stamp a `Defer-reason:` (a keyed line in the staged file's header block; a body line on directly-created records via `recordPayload`'s `deferReason`). Today these channels are where "minor, outside that scope, a few lines each" leaks into the backlog as records (#227, #229, #552–#554); after this sub-issue an item either gets fixed in-branch or carries a reason from the closed vocabulary — `tangential`, `needs-human-decision`, `pre-existing-outside-diff`, `genuinely-larger`, `blocked-external`, `blocked-dependency` (the full definitions live in `_shared/deferral-gate.md`; they are restated here only so this record reads standalone). This is a prose/structure gate on agent-read skills; the eval scenario below is what pins the runtime behavior.

**Complexity:** Medium
**Estimated tasks:** 6

## Non-Goals

- Refusing reason-less proposals at the Review Console, audit-line rendering — #622 (parallel; ships after this one, see its prerequisites).
- Changing the body shape producers compose (spec-shaped / born-ready) — #624, which is blocked by this one and edits the same files afterwards.
- `_shared/ledger-format.md` — already migrated by #620.
- `/capture`'s own interface (`--defer-reason=` arrives with #625), `/feedback`, health skills.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #620 | deferral gate contract: `_shared/deferral-gate.md`, ledger-format citation, structured `clearsFloor` and `recordPayload` deferReason | must be merged first (this sub-issue cites the file and the `deferReason` option) — re-read the merged file's vocabulary list before editing, in case a value was renamed on the way in |

## Current State

- `skills/review/step3-routing.md` — "When 'Fix now' isn't possible" lists **Defer** (new record, `parked`, created directly via `recordPayload` + `gh issue create`/`writeRecord`, "Compose the body with a `Trigger:` line, origin spec, and affected files") and **Capture** (invokes `/claude-tweaks:capture`); its **Deferral gate** is two bullets — `Pre-existing (not introduced by this build), OR requires design discussion that can't be resolved in the current session` and exactly `Has a clear trigger documented for when to revisit`; "If any findings are 'Fix now', make the changes, re-run `/claude-tweaks:test`"; the routing rule at the top of the file: findings "must be explicitly fixed, deferred, or accepted before the review can pass".
- `skills/reflect/full-mode.md` Recommendation rules: **Implement now** / **Defer** (new record, `parked`, created directly) / **Capture** (routes to `/claude-tweaks:capture`) / **Don't capture**. `skills/reflect/hindsight-mode.md` Step 3: **Change now** is the strong default; Defer/Capture "are the same as `full-mode.md`'s".
- `skills/reflect/SKILL.md` Step 3 (~line 136): a **tangential** finding becomes a Queue-writes proposal with a 3-line header `Title:` / `Type:` / `Labels:` prepended above `# Reflect — staged finding {n}`.
- `skills/wrap-up/residue-sweep.md` "## `remedy: record` findings": the CLI's `remedy` field is "a hint for that drill, not a rule the gate is bound to follow" — Phase 1 leaves such items `open` for Phase 2's per-item drill.
- `skills/wrap-up/leftover-routing.md` step 1 composes the body with an `Origin: wrap-up leftover from #{n}` line (+ `Trigger:` when parked); step 2 builds via `recordPayload` (no origin/risk/size/ready) and says "a leftover record starts exactly where a captured idea starts"; step 3 stages `{run-dir}/staged/leftover-{slug}.md` with the `Title:`/`Type:`/`Labels:` header; step 5 defers creation to the Review Console.
- `skills/capture/SKILL.md` already accepts `--needs-definition` / `--no-needs-definition` (argument-hint line 4); it has no `--defer-reason=` flag yet (#625).
- `_shared/deferral-gate.md` (#620): fix-now criteria, bad reasons, the six-value vocabulary with a floor-mapping table, hard gate, re-verification rule, "where the reason lives" (header block, keyed; or first body line).
- `tests/deferral-gate-conformance.test.js` (#620): pins the contract file and the ledger citation.
- `evals/scenarios/*.yaml` — 13 scenarios; validated by `cd evals && npm test`.

## Deliverables

- [ ] `skills/review/step3-routing.md`: replace the two-bullet Deferral gate and the standalone re-run-`/test` sentence with a citation of `_shared/deferral-gate.md` (fix-now criteria run before any Defer/Capture; re-verification per the contract); the **Defer** branch passes `deferReason` to `recordPayload`, chosen by this mapping — a defect in a file the diff does not touch → `pre-existing-outside-diff`; a fix needing a product/design call → `needs-human-decision`; a fix that expands scope past the fix-now criteria → `genuinely-larger`; a fix waiting on unbuilt functionality → `blocked-dependency`; on external state → `blocked-external`; a new capability the finding suggests → `tangential` (Capture, not Defer) — one line of justification in the `AUTO`/`STAGED` log line; the **Capture** branch invokes `/claude-tweaks:capture` with the finding text carrying a `Defer-reason: {value}` line (a pass-through convention on the caller side — capture's own flag arrives with #625; `--needs-definition` already exists and is passed when the finding names an open choice); a finding that fails fix-now with no valid reason stays `open` — in an interactive review it goes to the human drill, in `auto` it becomes an `open` ledger item for wrap-up's Phase 2 drill — and per the file's existing routing rule review cannot pass with it `open`. Cite the contract's bad-reasons list (which now includes "minor / not load-bearing"); do not restate it.
- [ ] `skills/reflect/full-mode.md`: **Defer**/**Capture** rows cite `_shared/deferral-gate.md`; a Defer/Capture recommendation names its `Defer-reason:` in the batch table's Recommended column using the same mapping as review's above (e.g. `Defer — genuinely-larger`, `Capture — tangential`); **Implement now** stays the default; a finding with no valid reason cannot be recommended Defer or Capture. `skills/reflect/hindsight-mode.md`: keep its "same as `full-mode.md`'s" indirection and add one pointer sentence naming the contract.
- [ ] `skills/reflect/SKILL.md` Step 3 tangential header: add `Defer-reason: tangential` to the header block (category-first rule: a tangential finding is by definition not a fix to the current work, so its reason is its category; the other five values apply only to non-tangential findings — no priority ordering needed); the STAGED log line carries `(defer-reason: tangential)`.
- [ ] `skills/wrap-up/residue-sweep.md` `remedy: record` section: cite the contract and enumerate the mapping — a locked worktree a live session holds → `blocked-external`; an open PR outside this run's blast radius → `blocked-external`; a red suite this run cannot fix → `genuinely-larger`; anything else → the item stays `open` for Phase 2's drill, where the human picks the value.
- [ ] `skills/wrap-up/leftover-routing.md`: step 1 runs the fix-now check first (a section that fails fix-now with no valid reason is not a leftover — it becomes an `open` ledger item for Phase 2's drill); the reason for a genuine leftover derives from *why* it cannot finish now, using the same mapping as review's (most leftovers are `genuinely-larger` or `blocked-dependency`); step 3's staged header block gains `Defer-reason: {value}`; retire the sentence "a leftover record starts exactly where a captured idea starts" (#624 rewrites step 2's composition; this sub-issue only removes the false premise and adds the header line); the auto-mode `AUTO` log line carries `(defer-reason: {value})`.
- [ ] `evals/scenarios/wrap-up-fix-now-not-file.yaml`: a wrap-up run whose ledger holds four small in-diff items ("a few lines each") — expected, mechanically checkable: all four `fixed` in-branch, zero staged record proposals in `staged/`, zero `gh issue create` calls. Valid against the harness (`cd evals && npm test`).
- [ ] `tests/deferral-gate-conformance.test.js`: extend with per-consumer assertions — each of the six files above (`step3-routing.md`, `full-mode.md`, `hindsight-mode.md`, `reflect/SKILL.md`, `residue-sweep.md`, `leftover-routing.md`) contains the literal `_shared/deferral-gate.md`; none contains `Has a clear trigger documented for when to revisit` or `starts exactly where a captured idea starts`; `reflect/SKILL.md` and `leftover-routing.md` contain `Defer-reason:` inside their header code blocks; no file outside `_shared/deferral-gate.md` restates the fix-now criteria (`≤5 files` / `no spans across unrelated systems` match only there).

## Acceptance Criteria

1. `node --test tests/deferral-gate-conformance.test.js` passes, and fails when any one of the six consumer edits is reverted (spot-check by reverting `leftover-routing.md` alone).
2. `grep -rn "Has a clear trigger documented for when to revisit" skills/` returns no matches; `grep -rn "starts exactly where a captured idea starts" skills/` returns no matches; `grep -rln "_shared/deferral-gate.md" skills/review/step3-routing.md skills/reflect/full-mode.md skills/reflect/hindsight-mode.md skills/reflect/SKILL.md skills/wrap-up/residue-sweep.md skills/wrap-up/leftover-routing.md` lists all six files.
3. `grep -n "^Defer-reason:" skills/reflect/SKILL.md skills/wrap-up/leftover-routing.md` matches inside each file's staged-header code block (the block that already carries `Title:`/`Type:`/`Labels:`).
4. `grep -rn "≤5 files\|no spans across unrelated systems" skills/ --include=*.md` matches only `_shared/deferral-gate.md`.
5. `cd evals && npm test` passes with the new scenario present; `npm test` passes in full.

## Technical Approach

Cite, don't copy: each consumer gets one sentence pointing at the contract plus the channel-specific mapping (which vocabulary value a given finding kind maps to). The `Defer-reason:` header line is mechanical text in a template — add it inside the same code block the `Title:/Type:/Labels:` header already lives in; #622's reader locates it by key within the header block, so its position among the four lines does not matter, but keep it fourth for readability.

### Data / API Surface

- Staged-file header block, all producers: `Title:` / `Type:` / `Labels:` / `Defer-reason:` (exact key, one of the six values).
- Directly-created records (review Defer, reflect Defer, standalone ledger): `recordPayload({ ..., deferReason })`.
- Capture pass-through (until #625): the idea text carries a `Defer-reason: {value}` line; `--needs-definition` when the finding names an open choice.

### Key Files

- `skills/review/step3-routing.md` — Deferral gate → citation; Defer/Capture branches carry a reason
- `skills/reflect/full-mode.md`, `skills/reflect/hindsight-mode.md` — Defer/Capture rules cite the gate and name a reason
- `skills/reflect/SKILL.md` — tangential staged header line
- `skills/wrap-up/residue-sweep.md` — `remedy: record` mapping to vocabulary
- `skills/wrap-up/leftover-routing.md` — fix-now first, header line, retired sentence
- `evals/scenarios/wrap-up-fix-now-not-file.yaml` — runtime pin
- `tests/deferral-gate-conformance.test.js` — per-consumer assertions

### Package Dependencies

None.

## Gotchas

- `reflect/SKILL.md` is 16.5 KB and `step3-routing.md` 16.4 KB — well under the 40 KB ceiling, but keep additions to a sentence per site plus the mapping list; the goal is fewer words in each consumer, not more.
- File-overlap: `leftover-routing.md` is also named by open record #229 (stale prose lines) and `residue-sweep.md` by #435/#429 (remedy:auto bypasses PR) — different concerns; do not absorb them. If an anchor sentence this record names is already gone at build time (one of them merged first), re-derive the citation point from the current file and say so in the commit message — never re-add the retired sentence to have something to remove.
- #624 edits these same files again (body composition). Keep this sub-issue's edits to the deferral text and header lines so the later diff is clean.
- Conformance greps are case-sensitive and content-anchored (memory: plan-verification greps) — anchor on the retired sentences' exact text, and check for incidental matches inside the new text itself before asserting zero.
- The eval scenario's expected outcomes must be mechanically checkable (`fixed` statuses in the ledger file, `staged/` listing, `gh issue create` count) — never "the agent behaves well".


<!-- work-fingerprint: 2026-08-16-exhaust-deferral-gate-design:deferral-gate-consumers-review-step-3-reflect-residue-sweep -->
