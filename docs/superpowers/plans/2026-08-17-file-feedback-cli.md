# Plan: `bin/file-feedback.js` — argv-safe feedback filing with read-back verification (#681)

## Problem

`skills/feedback/SKILL.md` Step 8 files upstream feedback via a shell recipe that
interpolates a model-authored title into a `gh issue create --title '<title>'` string —
a title containing backticks gets command-substituted by `/bin/sh` before `gh` ever
sees it (3 of 8 titles corrupted, live-measured). Step 4 documents `createFingerprint`
as if it were a string-in/marker-out function; it is actually a factory returning
`{ fingerprint, normalizeDescription }`, so calling it directly on a string basis
produces `[object Object]` (8 of 8 bodies published this way). There is no read-back
after filing, so corruption reaches the public repo silently.

## Reference patterns (read, don't re-derive)

- `.claude/skills/gh-api-module-pattern/SKILL.md` — injectable runner, `-f`/`-F` rules,
  per-write fail-safe batching, CLI `deps` contract, exit-code contract.
- `bin/lib/issues/link.js` + `bin/link-records.js` — the two-file (module + CLI wrapper)
  shape this plan replicates: `defaultRunner`, `errorText`, per-item try/catch into
  `{ok, failed}`, `run(argv, deps)` with every side effect behind `deps`, `require.main`
  guard setting `process.exitCode` (never `process.exit`).
- `bin/lib/health-core/fingerprint.js` — `fingerprintFromBasis(prefix, basis)` is the
  primitive to call directly (not the `createFingerprint` factory, which exists for a
  different shape: mapping named fields off a findings object).

## Task 1 — `bin/lib/feedback/file-feedback.js` (module)

Exports:

- `defaultRunner(args)` — `execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] })`.
- `computeFingerprint(draft)` — `draft.fingerprintBasis` is `{ component, summary }`;
  basis array is `[component, normalizeText(summary)]` (reuse `normalizeText` from
  `bin/lib/health-core/fingerprint.js` — do not re-implement); returns
  `fingerprintFromBasis('feedback', basis)`. Throws if `fingerprintBasis` is missing
  either field — a caller bug, not a runtime condition to paper over.
- `embedFingerprint(body, fingerprint)` — Step 5's draft template still renders a
  `<!-- fingerprint: <marker> -->` placeholder line as part of the human-readable
  preview (Step 5 is out of scope — see Task 3's Gotchas), so the incoming draft body
  already contains *some* fingerprint comment, possibly the literal bug text
  (`[object Object]`) if drafted before this fix. This function is the sole source of
  truth for what actually gets filed: if `body` contains a `<!-- fingerprint: ... -->`
  line (any content), replace that line with `<!-- fingerprint: {fingerprint} -->`;
  otherwise append it. Never trust the incoming placeholder's value.
- `findDuplicate({ repo, marker, runner })` — `runner(['issue', 'list', '--repo', repo,
  '--search', marker, '--state', 'all', '--json', 'number,title'])`, JSON.parse, return
  the first match object or `null`. One call per draft (dedup is cheap and per-item
  fail-safe matters more than batching here — unlike `link.js`'s databaseId resolution,
  there's no shared batch call to make).
- `fileDraft({ repo, title, body, labels, runner, bodyFile })` — writes `body` to
  `bodyFile` (caller supplies the path — keeps this function testable without touching
  the real filesystem's tmp dir), then `runner(['issue', 'create', '--repo', repo,
  '--title', title, '--body-file', bodyFile, ...labelArgs])` where `labelArgs` is
  `labels.flatMap(l => ['--label', l])`. Title goes through the runner's argv array —
  never string-interpolated. Parses the created issue URL/number from stdout (`gh issue
  create` prints the URL; extract the trailing number via `/\/issues\/(\d+)/`).
- `readBack({ repo, number, runner })` — `runner(['issue', 'view', String(number),
  '--repo', repo, '--json', 'title,body'])`, JSON.parse, return `{ title, body }`.
- `verifyReadBack({ draft, fingerprint, readBack })` — compares `readBack.title ===
  draft.title` and `readBack.body.includes(`<!-- fingerprint: ${fingerprint} -->`)`;
  returns `{ ok: true }` or `{ ok: false, reason: '<what mismatched>' }`.
- `fileOne({ repo, draft, runner, bodyFile })` — orchestrates one draft end-to-end:
  compute fingerprint → embed → dedup search (marker = the fingerprint HTML comment
  text, e.g. `<!-- fingerprint: feedback-abc12345 -->` — `gh issue list --search` matches
  substrings in body) → if dedup hit, return `{ status: 'dedup-hit', number: hit.number
  }` → else `fileDraft` → `readBack` → `verifyReadBack` → return `{ status: 'filed',
  number }` or `{ status: 'filing-failure', number, reason }`. Every step from dedup
  onward is try/caught into `{ status: 'filing-failure', reason: errorText(err) }` — one
  draft's `gh` failure never aborts the batch (same posture as `link.js`'s per-edge
  try/catch).

Module never calls `process.exit`, never reads `argv`, never touches real `gh` unless
the caller's `runner` does.

## Task 2 — `bin/file-feedback.js` (CLI wrapper)

Modeled directly on `bin/link-records.js`'s shape:

```
node bin/file-feedback.js --drafts <path.json> [--repo owner/name] [--dry-run] [--help]
```

- `--drafts <path>` (required unless `--help`) — JSON file: array of
  `{ title, body, labels: [...], fingerprintBasis: { component, summary } }`.
- `--repo` — defaults to resolving `origin`'s remote URL (same `parseRepo` regex as
  `link-records.js` — import or duplicate the one-line regex; do not add a new
  cross-file dependency for a 1-line helper. Duplicate it with a comment citing
  `link-records.js` as the source of truth, same as this repo's existing tolerance for
  small intentional duplication over premature coupling).
- `--dry-run` — computes every fingerprint + runs every dedup search (dedup itself is
  read-only, safe under dry-run), but skips `fileDraft`/`readBack` entirely; reports
  what *would* happen. Zero `create` calls reach the runner.
- Real `deps`: `{ runner: file-feedback.defaultRunner, ghAvailable, readDraftsFile:
  (p) => JSON.parse(fs.readFileSync(p, 'utf8')), tmpFile: () =>
  require('os').tmpdir() + '/feedback-body-' + Date.now() + Math.random() + '.md',
  writeFile: fs.writeFileSync, stdout, stderr }`. Every side effect behind `deps`,
  exactly like `link-records.js`.
- Per-draft result table printed to stdout: `filed #{n}` / `dedup-hit #{n}` /
  `filing-failure: {reason}` — one line per draft, in input order.
- Exit codes: **0** every draft filed or dedup-hit cleanly; **1** any draft returned
  `filing-failure` (other drafts still get processed — this is a summary exit code, not
  a stop-on-first-failure); **2** malformed invocation (missing `--drafts`, unreadable
  drafts file, malformed draft entry — missing `title`/`body`/`fingerprintBasis`), or
  `gh` unavailable (message names the fallback: manual filing per the existing Step 8
  shell recipe, or `_shared/github-write-transport.md`'s MCP path in a `gh`-absent cloud
  sandbox — this CLI does not implement an MCP branch itself, per the Gotchas note below).
- `--help` short-circuits before any availability probe, same as `link-records.js`.

## Task 3 — `skills/feedback/SKILL.md` Steps 4, 7 (dry-run branch), 8

**Step 7** — the existing `--dry-run` branch already stops before Step 8 runs at all
("stop here — nothing filed"), so the skill's own flow never reaches the CLI under
dry-run. Add one clause noting the CLI also accepts its own `--dry-run` flag (Task 2),
independent of this gate — useful for exercising `bin/file-feedback.js` directly
(manual testing, a future automated caller) without going through Step 6/7's
human-gated flow. This is a one-sentence addition, not a restructure of Step 7's
existing stop-here semantics.

**Step 4** — replace the `createFingerprint`/`normalizeText` sentence with: derive
`fingerprintBasis: { component, summary }` (the affected component plus the core
symptom, same inputs as today) and pass it through in the drafts file — the CLI computes
the marker via `fingerprintFromBasis('feedback', basis)`, never call
`createFingerprint` directly here. Name it as the CLI's job, not a step the model
performs by hand.

**Step 8** — replace the `BODY_FILE`/`gh issue create --title '<title>'` shell recipe
entirely:

1. Write the drafts file via the **Write tool** (never `echo` — zsh mangles `\n`,
   per project convention already stated elsewhere in this file) to a run-scoped path
   (`{run-dir}/staged/feedback-drafts.json` when a run directory exists, a scratch path
   otherwise).
2. Invoke `node "${CLAUDE_PLUGIN_ROOT}/bin/file-feedback.js" --drafts <path>` (no
   `--dry-run` here — Step 7's own dry-run branch already stopped before Step 8 is
   ever reached; the CLI flag is a separate, direct-invocation-only affordance, see
   the Step 7 note above).
3. Report its per-draft result table verbatim — this **is** Step 9's per-item report
   source now, not a paraphrase.
4. On any `filing-failure` row, follow the existing "do not silently drop the payload"
   rule: the CLI's own stderr/table already states the `gh` error and which draft failed;
   this step adds only the existing staged-fallback behavior (`staged/upstream-unfiled-{N}.md`)
   for whichever drafts have `status: filing-failure`.
5. `--pre-confirmed`'s cleanup-on-success (delete `staged/wrap-up-upstream-{N}.md`) keeps
   its existing trigger — condition on the CLI table's `status: filed` /
   `status: dedup-hit` rows, not on `gh issue create`'s own exit code directly.

**Gotchas to carry into the doc edit** (from the materialized spec, don't relitigate):
`gh` has no `--title-file` — argv is the only safe channel for the title, body still goes
via `--body-file`. Step 8's label rule is unchanged (never apply `by:*`/`type:*`/`risk:*`/
`ready`/`size:*` to upstream issues; `needs:definition` is the one named exception) — the
CLI only ever receives the labels the drafts file names, it does not compute label
policy itself. This CLI files against another repo — it never bootstraps labels there;
Step 8's existing confirm-labels check (`gh label list`) stays in the skill, upstream of
building the drafts file, unchanged.

## Task 4 — Tests + docs

`tests/bin-lib/feedback/file-feedback.test.js` (module + CLI in one file, per the
`link.test.js` precedent):

- Backtick / `$(...)` / single-quote title round-trips verbatim through the fake
  runner's argv (assert the exact array element, never a joined string).
- `computeFingerprint` matches `/^feedback-[0-9a-f]{8}$/`; a normalize-only change to
  `summary` casing/whitespace produces the same fingerprint (mirrors `normalizeText`'s
  contract).
- A drafted body's fingerprint line never renders `[object Object]` — feed
  `embedFingerprint` a body that already contains the literal pre-fix placeholder
  (`<!-- fingerprint: [object Object] -->`, reproducing what Step 5's template would
  have rendered under the old bug) and assert the composed body's fingerprint line is
  fully replaced with the correctly computed `feedback-{hash}` marker, never a leftover
  or a merge of both.
- `readBack` mismatch (title differs, or fingerprint comment absent from the read-back
  body) → `verifyReadBack` returns `{ ok: false, ... }`; `fileOne` surfaces
  `status: 'filing-failure'`; the CLI's overall exit code is 1 while a sibling clean
  draft in the same run still reports `status: 'filed'`.
- Dedup hit (fake runner's `issue list` returns a match) → `fileOne` returns
  `status: 'dedup-hit'`; fake runner records zero `issue create` calls for that draft.
- `--dry-run` → fake runner records zero `create` calls across every draft; stdout
  still reports fingerprints and dedup results per draft.
- Malformed invocation (`--drafts` missing, unreadable file, a draft entry missing
  `fingerprintBasis`) → exit 2, no runner calls at all.
- `gh` unavailable (`deps.ghAvailable` returns false) → exit 2, stderr names the
  fallback (manual filing / `_shared/github-write-transport.md`'s MCP path), zero
  runner calls.

`docs/plugin-structure.md` — add one CLI reference line under the existing `bin/link-records.js`
line, same format: usage synopsis, one-line behavior summary, exit-code contract,
pointer to `bin/lib/feedback/file-feedback.js` and its test file.

## Acceptance mapping (materialized spec's 6 ACs)

1. Task 1 (`fileDraft` argv construction) + Task 4's backtick round-trip test.
2. Task 1 (`embedFingerprint`/`computeFingerprint`) + Task 4's `[object Object]` test.
3. Task 1 (`verifyReadBack`/`fileOne`) + Task 4's read-back-mismatch test.
4. Task 3 (Step 4/8 rewrite) — grep checks run at review time, not as a repo test (the
   spec's own AC4 grep commands are review-time verification, matching how #678's
   equivalent prose claims were checked — no test file greps skill prose here, tests
   pin the *module's* behavior).
5. `--dry-run` behavior (Task 1 dedup-is-read-only design + Task 2's `--dry-run` flag)
   + Task 4's dry-run test.
6. `npm test` — run at the end of execution, full suite.

## Non-goals

- No change to Step 0's batch loop, Step 5's draft template, Step 6's scrub gate, or
  Step 7's confirm contract beyond the one dry-run-branch pointer named in Task 3 —
  those are unrelated to the filing-transport bug this record fixes.
- No MCP-transport implementation inside `file-feedback.js` itself — `gh issue
  create`/`issue view`/`issue list` do have GitHub MCP equivalents in principle, but
  wiring a second transport is out of scope for this record; the CLI's own `gh`-absent
  exit-2 message names the existing fallback path instead (matching how
  `link-records.js` treats its two gh-only endpoints, which have no MCP equivalent at
  all — this CLI's endpoints do have equivalents, but adding the branch is deliberately
  deferred, not silently dropped: no ledger row needed since it's an explicit Non-Goal,
  not a discovered gap).
