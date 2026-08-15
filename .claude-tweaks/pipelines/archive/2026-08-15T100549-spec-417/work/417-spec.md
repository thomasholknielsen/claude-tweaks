---
record: 417
origin: human
risk: medium
size: medium
ceremony: standard
grants: [build]
fingerprint: plugin-payload-boundary:relocate-colocated-bin-lib-tests-to-the-dev-side-tests-tree
blocked-by: [390, 392]
surface: backend
---
# 417: Relocate colocated bin/lib tests to the dev-side tests tree

Surface: backend

## Current State

Every `bin/lib/{module}/tests/` directory (14 at filing — count structurally, not by this number) together holds ~25.6k lines — over half of `bin/` — and ships with every install today. When the payload moves into `plugin/` (#418), `bin/` must go production-only or the tests ship again. `package.json`'s `test` script is currently a set of explicit per-module globs — the exact shape whose silent-miss failure mode IL-84 records. Two in-flight records touch these files: #392 deletes skill-audit test files, #390 edits a fixture path string in `bin/lib/docs-health/tests/scope.test.js`.

## Deliverables

- `git mv` every `bin/lib/{module}/tests/` directory (fixtures included) to `tests/bin-lib/{module}/`, preserving file names.
- Rewrite each moved file's `require` paths **by resolving each target's new location — never by one fixed depth formula.** Three known classes:
  1. requires of the module under test or other `bin/lib` source → point back into `bin/lib/…` at the new depth;
  2. **cross-module test-helper requires** — files requiring `../../health-core/tests/skill-md-house-checks` or `.../seed-durable-state` (present in code-health, docs-health, harness-health, journey-health, and skill-audit test files) — those helper targets **also move**, so these become sibling-relative paths within `tests/bin-lib/health-core/`;
  3. `docs-health/tests/derive-doc-id.test.js` requires the top-level CLI (`bin/docs-health.js`), a third shape.
- `package.json` test script: replace the per-module globs with **one recursive glob covering `tests/bin-lib/`** — a future module's tests are then auto-covered, closing the IL-84 recurrence instead of re-instantiating it. Root `tests/`, `tools/upstream-drift/tests` globs unchanged; `perf/` untouched.
- Update `docs/plugin-structure.md`'s per-suite test invocations (the literal `node --test bin/lib/{module}/tests/*.test.js` lines and the `npm test` composition) — CLAUDE.md names that doc the authority for per-suite invocations; it goes stale the moment this lands.
- Capture **per-module** test counts before and after (not only an aggregate — an aggregate match can mask a drop-and-gain), posted in the PR description and as a comment on this issue.

## Acceptance Criteria

- `npm test` passes; parity is `node --test`'s own `# tests N` summary line per module directory, captured to a file (never piped/tailed — output-truncation lesson), identical per module pre/post. Both captures shown.
- No `bin/lib/*/tests/` directory remains (`find bin/lib -type d -name tests` returns nothing, output shown).
- The recursive glob demonstrably matches every relocated directory (list the matched dirs, compare to the moved set).
- Require integrity: for every string-literal `require` in a moved file, `require.resolve` from the file's new location succeeds — run as a one-off script with output shown, not a grep approximation.

## Technical Approach

One `git mv` per module, then the per-class require rewrite above, then per-module count parity. Pickup condition: #390 and #392 **closed and merged to main** ("settle" means merged, not merely closed) — the native `Blocked by` links carry this mechanically where tooling enforces them; a manual pickup verifies both states first rather than trusting the link to gate.

## Gotchas

- IL-84 is the central hazard and the recursive glob is the structural fix; the per-module count parity is the proof it worked.
- Fixture directories move with their tests; fixtures referenced by relative path from test files are covered by the require-integrity check only when required — plain `fs.readFileSync` fixture paths need the same resolve check by hand.
- `tests/bin-lib/` namespacing avoids collisions with existing top-level suites; confirm no module name collides anyway when creating the directories.
- Do not run the full suite concurrently with another session's dispatch builds — a 137/SIGKILL or cross-suite failure is contention, not signal.

<!-- work-fingerprint: plugin-payload-boundary:relocate-colocated-bin-lib-tests-to-the-dev-side-tests-tree -->
