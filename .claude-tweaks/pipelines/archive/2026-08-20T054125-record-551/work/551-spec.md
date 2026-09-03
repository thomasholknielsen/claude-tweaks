---
record: 551
origin: human
risk: low
size: low
ceremony: standard
grants: [build]
surface: backend
---
# 551: Decide: reconcile-check-authoring project skill vs a plugin-structure authoring subsection

Surface: backend

## Current State

`bin/lib/reconcile/` is a 7-check dispatcher family (`mirror-ff.js`, `red-tip.js`, `reap-merged.js`, `release-merged.js`, `archive-merged.js`, `archive-branches.js`, `prune-remote.js`, plus `console-execute.js`/`classify.js`/`pr-state.js` as shared infrastructure) orchestrated by `index.js`. Adding one new check touches roughly nine sites: `bin/lib/reconcile/{check,index}.js` (the check itself plus its registration in `ALL_CHECKS` and the dispatch call), `bin/hooks.js`'s `reconcile-threw` fallback (a hand-maintained duplicate of the result shape that fails silently — omitted keys there don't throw, they just silently under-report — if the throw path is ever exercised), `bin/lib/hooks/session-start.js`'s summary rendering, and three shape-asserting test files (`tests/reconcile.test.js`, `tests/console-execute.test.js`/`tests/console-execution.test.js`, plus the check's own `tests/bin-lib/reconcile/{check}.test.js`).

`docs/plugin-structure.md` line ~24 already documents this family, but only as an inventory — it lists what each existing check file does and `index.js`'s dispatch order. It contains no procedural "how do I add a new check" content: no mention of the registration sites above, no mention of the `reconcile-threw` fallback's hand-maintained-shape hazard.

Issue #551 (origin: a deliberately-not-auto-created wrap-up proposal, refs #517) frames this as a binary: author a project-local skill (`.claude/skills/reconcile-check-authoring/`) documenting the procedure, **or** reject that in favor of adding a subsection to `docs/plugin-structure.md`'s existing inventory entry — with the counter-argument left explicitly unsettled pending reviewer judgment.

Investigation for this shaping pass found a closer precedent than either option: `bin/hooks.js` + `bin/lib/hooks/` is the same shape of problem — one dispatcher, N registered modules, a multi-site registration procedure for adding a new one. That problem was already solved in this repo, and not by either of #551's two options: it has its own dedicated `docs/hooks.md` (the full contract, procedural — not folded into `plugin-structure.md`'s inventory line for the same directory) plus a one-line pointer subsection in `CLAUDE.md` ("### Hooks") directing anyone touching `bin/hooks.js`/`bin/lib/hooks/`/`hooks/hooks.json` to read it first. `docs/skill-authoring.md` and `docs/releasing.md` follow the identical pattern for their own multi-step procedures, each with its own `CLAUDE.md` pointer subsection.

Project-local skills under `.claude/skills/` (`gh-api-module-pattern`, `skill-prose-conformance-tests`, `transcript-payload-verification`, `upstream-drift`, `work-record-facet-rename`) are a different shape: narrow patterns surfaced via the Skill tool's fuzzy trigger-description matching, for work an agent might start without knowing the convention exists (e.g. "writing a `bin/lib/` module that shells to `gh`"). Adding a reconcile check is not that — it's a small, identifiable, deliberate task with a known file set, exactly the shape `docs/hooks.md`'s explicit-citation model already covers.

## Deliverables

1. `docs/reconcile-checks.md` — the dedicated contract doc, same depth/shape as `docs/hooks.md`: what `bin/lib/reconcile/index.js` does (dispatch order and why it's significant, referencing the existing ordering comment), and the full "adding a new check" procedure covering every registration site enumerated in Current State above, explicitly calling out the `reconcile-threw` fallback's hand-maintained-shape hazard as its own bullet (mirroring how `docs/hooks.md`'s own prose calls out its analogous hazards, e.g. the `GATE_COVERAGE` staleness note).
2. A `### Reconcile` pointer subsection in `CLAUDE.md`, immediately after the existing `### Hooks` subsection, one line in the same citation style: "Adding a new `bin/lib/reconcile/` convergence check touches multiple registration sites — the full procedure is in `docs/reconcile-checks.md`. Read it before touching `bin/lib/reconcile/` or `bin/hooks.js`'s `reconcile` command." — **conditional on headroom**: `CLAUDE.md` is at 141/150 lines at shaping time (see Gotchas) — re-measure `wc -l CLAUDE.md` before adding; if the budget doesn't allow a net addition, trim wording on the new line (or, as a last resort, on an existing subsection) to fit rather than skipping the pointer or silently blowing the ceiling.
3. `docs/plugin-structure.md`'s existing `bin/lib/reconcile/` inventory line is left as-is — it already does its one job (what exists) correctly and shouldn't grow a procedural subsection; that's the whole point of the split.
4. Do **not** create a project-local skill under `.claude/skills/reconcile-check-authoring/` — see Current State for why that shape doesn't fit this problem.

## Acceptance Criteria

- `docs/reconcile-checks.md` exists and documents, at minimum: the check list and dispatch order (index.js), and every one of the ~9 registration sites named in Current State, including the `reconcile-threw` fallback hazard.
- `CLAUDE.md` gains a `### Reconcile` pointer subsection citing the new doc, styled identically to the existing `### Hooks` subsection — unless the line budget genuinely can't absorb it even after trimming, in which case the record documents that constraint explicitly rather than silently dropping the pointer.
- `docs/plugin-structure.md`'s reconcile inventory entry is unchanged (byte-identical) — confirms no content duplication crept back in.
- No new file under `.claude/skills/`.
- `npm test` passes (doc-only change, but the CLAUDE.md line-budget and skill-graph conformance tests are pinned prose — verify nothing else references the now-superseded "unsettled" framing from #517/#551).
- Issue #551 and #517's cross-reference to the deleted staged proposal are both resolved by this record closing #551 with a decision rationale in the closing comment (skip re-deriving the deleted `staged/wrap-up-skill-new-reconcile-check-authoring.md` file — it no longer exists on disk; this record's Current State supersedes it).

## Technical Approach

Write `docs/reconcile-checks.md` first, using `docs/hooks.md`'s structure as a direct template (one intro paragraph naming the dispatcher + module directory, then a bulleted list of contract points, then a "Referenced by" line if other skills end up citing it). Derive the registration-site list from `bin/lib/reconcile/archive-branches.js`'s own recent addition (#517, the 7th check) as the concrete worked example — grep its own registration footprint (`index.js`, `bin/hooks.js`, `session-start.js`, its 2-3 test files) to verify the doc's procedure against a real precedent rather than describing it in the abstract. Add the `CLAUDE.md` subsection last, after confirming line-count headroom.

## Gotchas

- `CLAUDE.md` was measured at 141/150 lines during shaping (2026-08-17) — re-measure at build time; a sibling record may have consumed remaining headroom in the interim.
- This record's Deliverables/Acceptance Criteria resolve #551's own "Decide:" framing with a specific answer (dedicated doc + CLAUDE.md pointer, not a skill, not a plain plugin-structure.md subsection) backed by concrete same-repo precedent (`docs/hooks.md`, `docs/skill-authoring.md`, `docs/releasing.md` all resolve the identical dispatcher/N-registered-handler documentation question the same way). Framing-check verdict: `open` — this is a evidenced trade-off against the two originally proposed options, not an unexamined single-implementation assumption. If a reviewer disagrees with the precedent-matching reasoning, that's a legitimate reason to override this record's approach before building it.
- The original staged proposal file referenced in #551's body (`staged/wrap-up-skill-new-reconcile-check-authoring.md` under the archived `2026-08-16T010137-spec-517-518-519` run dir) no longer exists on disk — #551's own issue body is the complete, sufficient ground truth; don't block on trying to recover it.

## Original request

Decide: reconcile-check-authoring project skill vs a plugin-structure authoring subsection

Origin: wrap-up batch curation, Skills row (run 2026-08-16T010137-spec-517-518-519 — staged proposal deliberately NOT auto-created; its own text demands a reviewer settle a counter-argument first)

Proposal: a project-local skill `.claude/skills/reconcile-check-authoring/` documenting the procedure for adding a `bin/lib/reconcile/` convergence check. Evidence for: #517's archive-branches was the 7th check to repeat the same procedure, and one check requires ~9 registration sites (`bin/lib/reconcile/{check,index}.js`, `bin/hooks.js`'s reconcile-threw fallback — a hand-maintained duplicate of the result shape whose omission fails silently on the throw path only — `bin/lib/hooks/session-start.js`'s summary, plus 3 shape-asserting test files).

Counter-argument (unsettled): `docs/plugin-structure.md` already enumerates the reconcile modules; if a skill scoped to the authoring procedure still overlaps it, the correct alternative is a subsection on that docs entry instead, and the skill candidate should be rejected.

Full staged proposal preserved at the archived run dir's `staged/wrap-up-skill-new-reconcile-check-authoring.md`. Refs #517.

