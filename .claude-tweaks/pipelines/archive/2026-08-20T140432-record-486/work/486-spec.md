# #486: Sweep stale bin/lib/{module}/tests references left by #417

Surface: backend

## Current State

`#417` relocated `bin/lib/{module}/tests` to `tests/bin-lib/{module}`, rewriting only live `require`/`path.join`/`path.resolve` calls (verified via `require.resolve`). A pickup-time re-grep with this record's corrected pattern, `grep -rEn 'bin/lib/[^/]*/tests' --include='*' .` (excluding `.git/`), found **195 total hits** across the tree. Excluding the historical/archival paths this record already scopes out — `.claude-tweaks/pipelines/**`, `CHANGELOG.md`, `docs/incident-log.md`, `docs/plans/*.md` — leaves **58 files**. That exclusion list is re-confirmed accurate as of this shaping pass; no new records outside it have appeared.

Per-file inspection of all 58 files found **6 files whose matches are correct as written and must not be touched** — a naive blanket find/replace across all 58 would corrupt three of them:

- `docs/donts.md:116` — the `[IL-84]` Don't rule deliberately illustrates `bin/lib/{name}/tests/` as the anti-pattern example (already correctly rewritten in commit `cf480fd7`); the sentence needs that old path present to make its point ("a `bin/lib/{name}/tests/` directory ships to end users... and won't be picked up by the test script either way").
- `tests/skill-conventions.test.js:106` — a provenance comment stating a test "Relocated from `bin/lib/skill-audit/tests/relationship-rows.test.js` when relationship-rows.js was deleted as consumerless (#392)" — describing where that test lived at the time of an earlier, unrelated relocation (#392) that predates #417. Historically accurate as written; rewriting the path would misstate history.
- `tests/bin-lib/issues/grouping.test.js:336,339,341` — a verbatim quote of record #154's own filed issue body (`'- \`bin/lib/issues/tests/\` or \`tests/\` (add — fixture-based coverage)'`), used as realistic fixture data for `extractKeyFiles`'s parsing test. Not a reference to this repo's own layout — it's quoting what #154 literally said.
- `tests/bin-lib/code-health/candidates-dead-code.test.js:633,639` — `isGlobDiscoveredTestFile` generic path-*shape* matching tests ("matches this repo's own `*.test.js`/`*.spec.js` naming convention, **at any depth**"); the old-shaped path is example input proving the matcher works at any nesting depth, not a claim that the directory exists.
- `tests/bin-lib/issues/initiative-budget.test.js:131` — same pattern: `permittedInitiative`'s deny-on-test-file check, exercised against a list of example test-shaped paths including `bin/lib/issues/tests/trust.test.js`.
- `tests/bin-lib/issues/blast-radius.test.js:7,134` — same pattern: `classifyDiffFiles`'s `isTest` classification, exercised against example diff-file entries (one labeled "#18-shaped fixture").

`tests/bin-lib/issues/grouping.test.js` needs a **line-level**, not file-level, decision: its line 1 header comment (`// bin/lib/issues/tests/grouping.test.js`) IS a genuine stale self-reference and gets fixed; its lines 336/339/341 fixture quote does not.

That leaves **53 files** genuinely carrying stale `bin/lib/{module}/tests` references (up from the issue's original "~50" estimate — the increase is `work/320-spec.md`, found only at this pickup-time re-grep, not named in the original filing). Of those 53, three need a comment **rewrite**, not a literal path swap, because the surrounding prose describes the old layout as a structural fact rather than just naming a path:

- `bin/lib/code-health/candidates-test-hygiene.js` (two spots: the file-header Coverage block at line 22, and Heuristic 3's docstring at line 165) — both describe this repo's own test layout as `tests/` + `bin/lib/{name}/tests/`, and cite that shape as the reason `pairedByDirectory` (Heuristic 3) exists. That no longer holds for this repo: 0 of 118 source files across the 14 relocated modules would newly go unpaired if Heuristic 3's directory-convention match were removed for this repo's own layout (Heuristics 1/2 — import-based and filename-based — already cover them). The heuristic function itself stays correct and useful for any *other* repo that does use a sibling `tests/` directory; only the prose claiming *this* repo still has that shape is wrong.
- `bin/lib/code-health/candidates-dead-code.js:114` — describes `package.json`'s `test` script as multiple enumerated globs, "everywhere (`tests/*.test.js`, `bin/lib/*/tests/*.test.js`, ...)". The actual script (`package.json:7`) is a single recursive `find tests tools/upstream-drift/tests -name '*.test.js'` — not an enumerated glob list, and not one that includes `bin/lib/*/tests/*.test.js` at all. A literal path swap alone would leave the "enumerated globs" framing wrong too.
- `skills/code-health/SKILL.md:191` — the `areaId` derivation worked example anchors on `bin/lib/code-health/tests/foo.test.js#bar`, a nested directory that no longer exists under `bin/lib/code-health/`. Needs a real replacement anchor demonstrating the same invariant (a finding whose anchor file's directory differs from its enclosing recursively-swept slice's own directory) — not a mechanical path substitution, since the example must point at something that actually exists.

## Deliverables

1. Mechanical find/replace of `bin/lib/{module}/tests` (and its `{name}`/`{x}`/wildcard-placeholder spellings) → `tests/bin-lib/{module}` across the 53 in-scope files' matched lines — comment headers, cross-reference comments, and doc-comment prose only.
2. Rewrite (not swap) the two `bin/lib/code-health/candidates-test-hygiene.js` comments (Coverage block + Heuristic 3 docstring) to state plainly that this repo's own layout no longer has the `bin/lib/{name}/tests/` sibling-directory shape, while preserving the heuristic's still-valid generic description for other repos.
3. Rewrite `bin/lib/code-health/candidates-dead-code.js:114`'s comment to accurately describe `package.json`'s actual `test` script (single recursive `find`, not enumerated globs).
4. Replace `skills/code-health/SKILL.md:191`'s worked-example anchor with a real, currently-existing path that still demonstrates `areaId = path.dirname(anchor)` diverging from the enclosing slice id.
5. Leave the 6 files/line-ranges named in Current State completely untouched.

## Acceptance Criteria

- Re-running `grep -rEn 'bin/lib/[^/]*/tests' --include='*' .` (excluding `.git/`), then excluding `.claude-tweaks/pipelines/**`, `CHANGELOG.md`, `docs/incident-log.md`, `docs/plans/*.md`, and the 6 excluded files/line-ranges from Current State, returns **zero** remaining hits.
- The 6 excluded files/line-ranges (`docs/donts.md:116`, `tests/skill-conventions.test.js:106`, `tests/bin-lib/issues/grouping.test.js:336,339,341`, `tests/bin-lib/code-health/candidates-dead-code.test.js:633,639`, `tests/bin-lib/issues/initiative-budget.test.js:131`, `tests/bin-lib/issues/blast-radius.test.js:7,134`) are byte-identical before and after the sweep.
- `npm test` passes — every change in this record is a comment/doc-comment/prose edit; no test assertion, fixture literal, or runtime code path is touched.
- `bin/lib/code-health/candidates-test-hygiene.js`'s Coverage block and Heuristic 3 docstring no longer claim this repo's own layout has a `bin/lib/{name}/tests/` sibling directory, and still correctly describe the heuristic's generic applicability.
- `bin/lib/code-health/candidates-dead-code.js:114` accurately names `package.json`'s actual `test` script shape (recursive `find`, not an enumerated glob list).
- `skills/code-health/SKILL.md`'s `areaId` worked example anchors on a path that actually exists in the repo at the time the fix lands, and still correctly demonstrates the `areaId`-vs-slice-id distinction the surrounding rule states.

## Technical Approach

- Re-derive the 53-file scope at pickup time via the grep command above — do not trust this record's file list verbatim; a sibling session may land more matches (or fix some of these) between this shaping pass and pickup.
- For each remaining hit, replace the literal old path with its `tests/bin-lib/{module}` equivalent, *after* reading the surrounding sentence — a match inside a Don't-rule anti-pattern illustration, a historical provenance note, or literal quoted/fixture content is not a stale reference and must be left alone (see the 6-file exclusion list).
- Apply the three prose rewrites (not swaps) called out in Deliverables 2-4 individually — each requires reading the surrounding paragraph, not a search-and-replace.
- For the `SKILL.md` anchor, find a real, currently-existing example (e.g. a source file inside `bin/lib/code-health/` whose enclosing directory sits below the slice root the generalist rotation would sweep) before writing it in.

## Gotchas

- The "safe find/replace, zero functional risk" framing in the original request is true for the ~53-file bulk of this work but not uniformly true across all 58 grep hits — 6 files carry matches that must be preserved verbatim, and 3 files need a prose rewrite rather than a literal swap. Treating this as a single mechanical sed pass across every hit would silently corrupt the Don't rule, the provenance comment, and the #154 fixture quote.
- `tests/bin-lib/issues/grouping.test.js` needs a line-level decision, not a file-level one — its header (line 1) is stale and gets fixed; its fixture quote (lines 336-341) does not.
- `work/320-spec.md` is a currently tracked, non-archival file (materialized build-time specs for records #320/#422/#714 — confirmed via `git log`, not gitignored) — it is in scope even though the original issue text didn't name it, because it postdates the issue's own grep.
- Framing verdict: `open` — this is evidence-grounded maintenance work (a repeatable grep, a cited measured-impact figure, a prior whole-branch review) with no untested technology or design choice to trade off, not a baked solution.

## Original request

Sweep stale bin/lib/{module}/tests references left by #417

**Related:** #417

Context: #417 relocated bin/lib/{module}/tests to tests/bin-lib/{module}, rewriting only live require/path.join/path.resolve calls (verified via require.resolve). A repo grep afterward found 100+ stale bin/lib/{module}/tests references left behind in prose comments.

Scope: Mechanical comment-only fixes across ~50 files (test-file header comments, cross-reference comments, bin/lib source doc-comments) — safe find/replace, zero functional risk. Plus one item needing judgment: skills/code-health/SKILL.md's areaId derivation example anchors on bin/lib/code-health/tests/, a nested directory that no longer exists — needs a real replacement anchor, not a path swap.

**Amended after #417's final whole-branch review** (the review independently confirmed the relocation itself is correct — 261/261 path targets verified byte-identical pre/post move — but flagged gaps in this record's own sweep instructions):

- Re-grep instruction corrected: use `bin/lib/[^/]*/tests` (not `bin/lib/[a-z-]*/tests`, which cannot match a literal `*` or `{name}`/`{module}`/`{x}` placeholder forms) — the original pattern would have missed exactly the kind of wildcard/placeholder references that turned out to be the highest-value hits (`CLAUDE.md` and `docs/donts.md`'s IL-84 guidance, already fixed directly in commit `cf480fd7` rather than through this record, since they were live and load-bearing enough to fix immediately).
- Also in scope now: `evals/scenarios/backlog-grant-local-files-preflight-stop.yaml:16` and `evals/scenarios/backlog-refine-permission-matrix-compliance.yaml:40`, both carrying stale `bin/lib/issues/tests/grant-gate.test.js` references.
- `bin/lib/code-health/candidates-test-hygiene.js:22` and `:165` — Heuristic 3 (`pairedByDirectory`) cites the now-nonexistent `bin/lib/{name}/tests/*.test.js` <-> `bin/lib/{name}/*.js` shape in its own comment. Measured impact: 0 of 118 source files across the 14 relocated modules become newly unpaired (Heuristics 1/2 cover all of them), so this is comment-only today, but the redundant detection path it describes no longer exists and the comment should say so.
- Skip `.claude-tweaks/pipelines/**`, `CHANGELOG.md`, `docs/incident-log.md`, `docs/plans/*.md` (historical records) — re-confirm this exclusion list is still accurate at pickup time, since more may have landed since filing.

