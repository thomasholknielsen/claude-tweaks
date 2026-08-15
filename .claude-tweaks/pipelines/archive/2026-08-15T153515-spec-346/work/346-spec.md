---
record: 346
origin: human
risk: low
size: low
ceremony: fast-lane
grants: []
surface: backend
---
# 346: claude-md-conformance: splitSections() finds zero headings on CRLF input, so checkConformance() silently reports everything conformant

Surface: backend

## Current State

`bin/lib/init/claude-md-conformance.js`'s `splitSections(markdown)` maps each `## Heading` to its
body text by running `/^## (.+)$/` against each line of `markdown.split('\n')`. On LF input this
works; on CRLF input every line still carries a trailing `\r` (e.g. `"## Stack\r"`). `.` does not
match `\r`, so `(.+)` can consume everything up to but not including the trailing `\r`, and `$`
(no `/m`/`/s` flags) requires the match to reach the absolute end of the string — which it can't,
because the `\r` is still there. The regex fails to match on every heading line, `current` never
gets set, and `splitSections` returns an empty `Map`.

`checkConformance({templateSource, projectClaudeMd})` calls `splitSections` on both the extracted
template body and the project's `CLAUDE.md`. With CRLF input to either side, `missing`/`drifted`/
`conformant` all come back empty — there are no sections to compare, so nothing is reported as
missing even when the project has no CLAUDE.md at all. `/claude-tweaks:init` Phase 1u.5 (claude-tweaks
Contract Drift detection) reads that empty result as "conformant with the installed template," and
Phase 1u.6's drift-based early-exit gate can then wrongly take the fast path and skip CLAUDE.md
generation entirely.

CRLF input reaches this path in two ways: a Windows checkout of the plugin's own
`skills/init/claude-md-template.md`, and a project's own `CLAUDE.md` saved by a Windows editor.
`extractTemplateBody` itself already tolerates CRLF — its own line/fence matching uses `.trim()`
throughout — so the break is isolated to `splitSections`'s heading regex.

Verified directly against the current source (`bin/lib/init/claude-md-conformance.js:49-65`): the
per-line regex has no `m`/`s` flag, and there is no line-ending normalization anywhere before the
`markdown.split('\n')` call.

## Deliverables

- Normalize line endings inside `splitSections` before splitting on `'\n'` — e.g.
  `markdown.replace(/\r\n/g, '\n')` at the top of the function — so a trailing `\r` never reaches
  the per-line heading regex, regardless of which caller's string is CRLF.
- No change to `extractTemplateBody`'s own fence-matching logic — it already tolerates CRLF via
  `.trim()`, and the fix belongs at the single point (`splitSections`) where the failure actually
  occurs.

## Acceptance Criteria

- `splitSections` on a markdown string with CRLF line endings returns the same `Map` (same keys,
  same body text) as the LF equivalent of that string.
- `checkConformance({templateSource, projectClaudeMd})` given a CRLF `templateSource` and an empty
  `projectClaudeMd` (`''`) reports `Philosophy`, `Working Approach`, and `claude-tweaks Pipeline`
  as `missing` — not an empty result.
- A new regression test in `bin/lib/init/tests/claude-md-conformance.test.js` exercises
  `splitSections` (or `checkConformance`) against a CRLF fixture and fails on the pre-fix code.
- All existing tests in `bin/lib/init/tests/claude-md-conformance.test.js` continue to pass
  unchanged — LF behavior is not altered.
- `npm test` passes.

## Technical Approach

Add a single normalization line at the top of `splitSections` (`bin/lib/init/claude-md-conformance.js:49`):

```js
function splitSections(markdown) {
  const sections = new Map();
  let current = null;
  let buffer = [];
  for (const line of markdown.replace(/\r\n/g, '\n').split('\n')) {
    ...
```

This fixes both call sites in `checkConformance` (`bin/lib/init/claude-md-conformance.js:114,123`)
without touching `extractTemplateBody` or its callers, since both of `checkConformance`'s
`splitSections` calls pass through the same function.

For the regression test, build a CRLF fixture by taking the existing test fixture(s) already used
in `bin/lib/init/tests/claude-md-conformance.test.js` (e.g. the constant used by the
`'splitSections maps each h2 to its body'` test) and replacing `\n` with `\r\n` before calling
`splitSections`/`checkConformance`, asserting the same section keys/bodies as the LF version.

## Gotchas

- The regex fix must land in `splitSections` itself, not in `checkConformance` or a caller —
  `splitSections` is exported directly (`module.exports`) and may have other callers or future
  callers that need the same tolerance.
- Don't broaden the fix to `.replace(/\r/g, '')` (stripping all lone `\r`) — the repro is
  specifically CRLF (`\r\n`); a bare lone-`\r` (old Mac-style) line ending is a different, unreported
  input shape and out of scope for this record.

## Original request

claude-md-conformance: splitSections() finds zero headings on CRLF input, so checkConformance() silently reports everything conformant

**Summary:** `bin/lib/init/claude-md-conformance.js`'s `splitSections()` silently finds zero headings — and therefore `checkConformance()` reports empty `missing`/`drifted`/`conformant` for everything — when the input has CRLF line endings, which is what a Windows checkout of the plugin's own `claude-md-template.md` (and, separately, a project's own CLAUDE.md saved by a Windows editor) has by default.

**Kind:** Defect

**Affected component:** `bin/lib/init/claude-md-conformance.js` (`splitSections`), consumed by `/claude-tweaks:init` Phase 1u.5 (claude-tweaks Contract Drift detection)

**Repro steps:**
1. On a Windows checkout (or any file with `\r\n` line endings), read `skills/init/claude-md-template.md` with `fs.readFileSync(path, 'utf8')` — the string retains `\r\n`.
2. Call `extractTemplateBody(templateSource)` — this succeeds (its own fence-matching uses `.trim()`, which tolerates the trailing `\r`).
3. Call `splitSections(body)` on the extracted body.
4. Inspect the returned `Map` — it is empty; `[...sections.keys()]` is `[]`.
5. Consequently `checkConformance({templateSource, projectClaudeMd: ''})` (an empty/nonexistent project CLAUDE.md) returns `{missing: [], drifted: [], conformant: []}` instead of listing all three plugin-authored sections (`Philosophy`, `Working Approach`, `claude-tweaks Pipeline`) as `missing`.

**Expected vs. actual:**
Expected: `checkConformance` reports the plugin-authored sections as `missing`/`drifted`/`conformant` regardless of the input's line-ending style.
Actual: with CRLF input, every category comes back empty — Phase 1u.5 reports "Contract: conformant with the installed template" even when the project has no CLAUDE.md at all, so Update Mode's drift-based early-exit gate (Phase 1u.6) can wrongly take the fast path and never surface that CLAUDE.md needs generating.

**Root cause:** `splitSections`'s heading regex is `/^## (.+)$/` applied per-line after `markdown.split('\n')`. With CRLF input, each line still carries a trailing `\r` (e.g. `"## Stack\r"`). JavaScript's `$` anchor (no `/m` or `/s` flags) matches only at the absolute end of the string, not before a trailing `\r`, so `(.+)$` never matches and the whole per-line regex fails silently — `splitSections` just treats every line as ordinary body text with no active heading, producing an empty `Map`.

**Suggested fix:** normalize line endings before splitting, e.g. `markdown.replace(/\r\n/g, '\n').split('\n')` at the top of `splitSections` (and/or wherever `extractTemplateBody`'s output feeds into it), so CRLF and LF input produce identical results.

**Plugin version:** 6.79.0

---
Filed via /claude-tweaks:feedback.

