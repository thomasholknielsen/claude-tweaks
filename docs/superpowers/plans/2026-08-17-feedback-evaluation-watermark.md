# Plan: session-evaluation watermark — avoid re-judging the whole transcript on a second bare `/feedback` (#679)

## Problem

`skills/feedback/session-evaluation.md` dispatches one transcript-judge subagent with
no memory of a prior evaluation of the same transcript. A second bare `/feedback` in
the same (possibly long-running) session re-reads the whole file from byte zero.
Measured: a 6.49 MB transcript re-judged in full for a ~585 KB (9%) delta; the first
judge cost ~130K subagent tokens / 83 tool uses / 632s. The delta scoping that made a
second run affordable was hand-written prose in the dispatch prompt, not contract.

## Reference (read before writing anything)

- `skills/feedback/session-evaluation.md` — 111 lines, 4 `##` sections: Transcript
  resolution, The judge dispatch (with its 4-item "Prompt contents, in this order"
  list and output template), Degradation: self-assessment, After the judge returns.
- `skills/feedback/SKILL.md` — the Input table (`$ARGUMENTS` flags:
  `--kind=`/`--dry-run`/`--queue`/`--pre-confirmed`) needs a new `--full` row.
- `bin/lib/feedback/file-feedback.js` (already exists, from #681, same run) — the
  sibling module `watermark.js` goes in the same directory
  (`bin/lib/feedback/watermark.js`), same conventions (injectable `fs`/`writeFile` deps
  for testability, no `process.exit`, exported pure functions).
- `.gitignore` (this repo's own root file) and
  `skills/init/bootstrap/step-04-gitignore-suggestions.md` (the suggested-block
  template every consuming project's `/init` proposes) — both need the new ignore
  pattern, kept byte-identical between the two per that file's own stated convention
  ("This repo's own root `.gitignore` uses the identical … pattern — mirror it
  verbatim").
- `docs/plugin-structure.md` — CLI/module reference list, needs one new line for
  `bin/lib/feedback/watermark.js` (module only, no CLI wrapper — this is a
  skill-internal helper, not a user-facing subcommand; follow whatever format that doc
  uses for a module-only entry — check the existing `bin/lib/issues/` family line for
  the module-without-CLI format).

## Task 1 — `bin/lib/feedback/watermark.js` (module) + tests

Exports (pure functions, `fs` injected as a default param so tests never touch real
disk):

- `watermarkPath(transcriptPath, { fs = require('fs') } = {})` — derive
  `.claude-tweaks/feedback/watermarks/{transcript-basename}.json` from the transcript's
  basename (strip directory + `.jsonl` extension, keep the session-id form — the
  record's own recommended path shape). Pure string derivation, no fs access needed
  for this function itself; keep the `fs` param only if genuinely needed, drop it
  otherwise — don't add an unused parameter.
- `readWatermark(transcriptPath, deps)` — `deps.readFile(watermarkPath(...))`,
  `JSON.parse`; returns `null` on ENOENT (no prior evaluation) or a parse failure
  (treat a corrupt watermark file as "no watermark," never a throw — this is the
  degrade-open path AC5 requires). Returned shape: `{ transcriptPath, bytesAtDispatch,
  evaluatedAt, filedRecords, dismissedFingerprints }`.
- `writeWatermark(transcriptPath, data, deps)` — `deps.mkdirSync` the watermark
  directory (`{ recursive: true }`), then `deps.writeFile` the JSON. Throws on a real
  write failure — the CALLER (session-evaluation.md's prose, Task 2) is responsible for
  catching this and degrading open per AC5, not this function swallowing it silently;
  a module that swallows its own write failures makes the caller's degrade-open
  behavior untestable and undocumented at the wrong layer.
- `byteOffsetToLine(filePath, byteOffset, deps)` — read the file up to `byteOffset`
  bytes (`deps.readFile` with a length-limited read, or read the whole file and slice —
  simplicity over micro-optimization here, transcripts are read fully by the judge
  anyway) and count newlines; return the 1-indexed line number. This is the "byte
  offset → line number" conversion the record's Technical Approach names as "computed
  once by the module," not duplicated in skill prose.
- `formatOffsetClause({ bytesAtDispatch, line, filedRecords })` — returns the literal
  contract-text string Task 2's prose item 5 embeds verbatim into the dispatch prompt:
  something like `` `Evaluate from byte offset ${bytesAtDispatch} (line ${line}); these
  records already exist: ${filedRecords.join(', ') || 'none'}; omit findings they
  cover.` `` — match this exactly to whatever wording Task 2 writes into
  `session-evaluation.md`'s new prompt-item text (coordinate: Task 2 should quote this
  function's actual output, not invent separate wording — if you're doing Task 1 before
  Task 2 exists, pick clear wording and note it plainly in your report so Task 2 can
  cite it verbatim).

Tests in `tests/bin-lib/feedback/watermark.test.js` (new file, sibling to
`file-feedback.test.js`): read-missing (no file → `null`, no throw), write, read-back
round-trip, corrupt/malformed JSON → `null` not a throw, `--full` reset semantics (Task
2's CLI-level concern, but the module-level primitive this exercises is simply
`writeWatermark` overwriting an existing file — cover that), byte→line conversion
against a small fixture string with known newline positions (test at least: offset 0,
offset mid-line, offset exactly on a newline, offset past EOF).

## Task 2 — `session-evaluation.md` + `SKILL.md` prose

**`session-evaluation.md`**:

- **Transcript resolution section** — no change to the resolution logic itself; add one
  sentence noting the resolved path is also the watermark lookup key (Gotchas: "key on
  path, not session id — a worktree switch changes the transcript directory slug
  mid-session," project memory `session-transcript-slug-tracks-cwd`).
- **The judge dispatch, "Prompt contents, in this order"** — this list currently has 4
  items (objectives rubric, output template, transcript path, slicing guidance). Add a
  5th: when `bin/lib/feedback/watermark.js`'s `readWatermark` returns non-null for the
  resolved transcript path, append `formatOffsetClause(...)`'s literal output as prompt
  item 5. When no watermark exists (first invocation) or `--full` was passed, item 5 is
  omitted entirely — no offset clause, no empty placeholder.
- **After the judge returns** — add: on a `DONE`/`DONE_WITH_CONCERNS` return (not
  `NEEDS_CONTEXT`/`BLOCKED`, and not the self-assessment degradation path — see below),
  call `writeWatermark` with `{ transcriptPath, bytesAtDispatch: <the value captured
  BEFORE dispatch, per Task 1's function contract — the judge's own tool calls append to
  the transcript while it runs, so re-stat-ing after return would race>, evaluatedAt:
  <now>, filedRecords: <the record numbers this run actually filed, from Step 8>,
  dismissedFingerprints: <fingerprints of findings the human declined at Step 7, if
  tracked — if nothing in this skill currently tracks declined-finding fingerprints,
  say so in your report rather than inventing a source for them; an empty array is a
  legitimate value>}`. On a write failure: degrade open per AC5 — the evaluation result
  itself is unaffected, report the write failure in Step 0's output (a one-line note,
  not a blocking error), never abort or retry the evaluation because the watermark
  write failed.
- **Degradation: self-assessment** — the self-assessment path (no transcript resolved
  at all) never reads or writes a watermark — there is no transcript path to key on.
  State this explicitly (one sentence) rather than leaving it to be inferred.

**`SKILL.md`** — add a `--full` row to the Input table, next to the existing flags:
presence-only, meaningful only for bare/`--queue` invocation (the session-evaluation
gather) — ignore any existing watermark for the resolved transcript, dispatch the full
un-scoped judge (no offset clause), then overwrite the watermark with the fresh result
exactly as a first-ever evaluation would. State plainly it's a no-op combined with
free-text-only invocation (no session evaluation runs in that mode at all — Step 0's
"free-text invocation runs neither gather" rule already established this for `--queue`;
`--full` follows the identical shape).

## Task 3 — `.gitignore` (both copies) + `docs/plugin-structure.md`

**This repo's own root `.gitignore`** and
**`skills/init/bootstrap/step-04-gitignore-suggestions.md`'s suggested block** — add,
in both places, byte-identically:

```
.claude-tweaks/feedback/
```

A single blanket line is correct here (unlike the `pipelines/` per-level pattern) —
nothing under `.claude-tweaks/feedback/` is ever meant to be committed (watermark
JSON is pure local cache, no `work/`-style audit-trail exception applies). Confirm this
by checking the existing pattern for `.claude-tweaks/code-health/` etc. (already a flat
blanket line, no per-level unignoring) — `watermark.js`'s output directory follows the
same shape, not the `pipelines/` shape. Add one sentence to
`step-04-gitignore-suggestions.md`'s explanatory prose (the paragraph after the
fenced block) naming the new line among the "deliberately not blanket-ignored" list's
siblings — it belongs in the same explanatory sentence as `code-health/` etc., not a
new paragraph.

**`docs/plugin-structure.md`** — there is currently no `bin/lib/feedback/` family-level
line (only the `node bin/file-feedback.js ...` CLI-subcommand line, which mentions
`bin/lib/feedback/file-feedback.js` parenthetically). Add a new family-level line
matching the established `bin/lib/{name}/ → ...` style used by every other family
(grep `^bin/lib/issues/` or `^bin/lib/reconcile/` for the exact format to copy — module
name, one-line purpose, what it's consumed by), naming both `file-feedback.js` and the
new `watermark.js` (path derivation, read/write, byte→line conversion; consumed by
`skills/feedback/session-evaluation.md`). Place it alphabetically among the other
`bin/lib/{name}/` lines in that section.

## Task 4 — conformance + integration verification

Conformance tests (grep-based, matching this repo's established style — see
`tests/pr-first-merge.test.js`) pinning:

1. `session-evaluation.md`'s "Prompt contents, in this order" list has a 5th item
   describing the watermark offset clause, conditional on a watermark existing.
2. `session-evaluation.md` states the write happens with `bytesAtDispatch` captured
   before dispatch, and the write-failure degrade-open behavior.
3. `SKILL.md`'s Input table has a `--full` row.
4. `.gitignore` and `step-04-gitignore-suggestions.md`'s fenced block both contain
   `.claude-tweaks/feedback/` (assert byte-identical presence in both, the way this
   repo already pins the `pipelines/` block's mirroring elsewhere if such a test
   exists — check for one to follow its pattern, e.g. grep `tests/` for a test
   comparing `.gitignore` against the bootstrap template).

Full `npm test` at the end — must be 100% green.

## Acceptance mapping (materialized spec's 6 ACs)

1. Task 2 (no watermark → no offset clause; write happens after, with byte size at
   dispatch time and filed records) — verify with a Task 1 unit test plus Task 2's
   prose, since AC1 spans both a runtime behavior (module) and a documented contract
   (prose) — this record has no live judge dispatch to test against in `npm test`, so
   Task 1's unit tests are the executable half of this AC and Task 4's conformance
   tests are the documented-contract half.
2. Task 2 (offset clause + filed-record list embedded when a watermark exists).
3. Task 2 (`--full` bypass + overwrite) + Task 1's reset-semantics test.
4. Task 2 (keyed on transcript path, not session id) + project memory citation.
5. Task 2 (write-failure degrade-open, reported not silent) + Task 1's write-failure
   contract (throws to the caller, caller catches).
6. Task 1's tests (read-missing/write/read-back/`--full`-reset/byte→line) + `npm test`.

## Non-goals

- No change to the judge dispatch's model resolution, the Frontier-singleton cap, or
  the re-dispatch-once-on-format-violation rule — orthogonal to watermarking.
- No change to `dismissedFingerprints` tracking elsewhere in the skill if it doesn't
  already exist — Task 2 should report honestly whether Step 7's declined-finding
  fingerprints are already tracked anywhere reachable, rather than building new
  tracking infrastructure this record didn't ask for. An empty array is acceptable if
  nothing feeds it yet; note this as a real limitation in the final report, not a
  silently invented data source.
- No retroactive watermark for transcripts evaluated before this record ships — the
  first bare `/feedback` after this lands is, correctly, a "no watermark" run for any
  given transcript.
