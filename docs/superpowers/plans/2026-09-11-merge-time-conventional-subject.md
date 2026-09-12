# Merge-time Conventional Subject and the `breaking` Label — Implementation Plan (#2251)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every merge site in the plugin (two `gh pr merge` sites, four `git merge --no-ff` sites) sources its merge subject and body from one Conventional-Commits composer, and a presence-only `breaking` label drives the `!` suffix and `BREAKING CHANGE:` footer.

**Architecture:** A pure composer module `plugin/bin/lib/release/subject.js` (`composeSubject`) owns the grammar. A thin CLI `plugin/bin/compose-subject.js` (logic in `plugin/bin/lib/compose-subject.js`, `run(argv, deps)` seam) reads a record's facets/body via `gh issue view` and prints the composed `{title, body}` as JSON or as `eval`-able shell assignments, which is how skill prose reaches the composer. The Compatibility facet (`breaking`) is added to the shared facet shape and both drivers so the composer reads Type and breaking through the same accessor everything else uses. The prose merge sites switch to the composer; pr-first switches `--merge` → `--squash`.

**Tech Stack:** Node 18+ (zero runtime deps), `node --test`, markdown skill prose under `plugin/skills/`.

**Spec:** `.claude-tweaks/pipelines/2026-09-11T204239-spec-2251-2252-2253-2254-2255-2256-2258/spec-2251/work/2251-spec.md` (materialized copy of #2251)

## Global Constraints

- Tests live under `tests/` (npm test globs `tests` and `tools/upstream-drift/tests` only; nothing under `plugin/` is a test and everything under `plugin/` ships). The spec's `plugin/bin/lib/release/subject.test.js` path is therefore realized as `tests/bin-lib/release/subject.test.js` — same content, repo-convention location.
- `plugin/skills/_shared/pr-first-merge.md` is 30,404 bytes before this plan. AC 6: after the edit it must be ≤ 30,904 bytes (net-small; +500 max) — pinned mechanically by `tests/merge-subject-composer-conformance.test.js` (Task 5). The **binding** constraint is tighter: the `merge` composed bundle (`pr-first-merge.md` + `pr-early-run-lifecycle.md`, read at `wrap-up/auto-merge-short-circuit.md:156` and `wrap-up/review-console.md:123`) measures 60,365 bytes against a 60,416-byte ceiling (`context-cost.js`'s `COMPOSED_STEP_EXCEPTIONS.merge = 59 * 1024`), so `pr-first-merge.md` may grow by at most 51 bytes — Task 4 is written to make it net-negative, and `tests/bin-lib/skill-audit/context-cost.test.js` is the gate.
- `plugin/skills/dispatch/settle-and-merge.md` is 40,139 bytes against the 40,960-byte per-file ceiling (`plugin/bin/lib/skill-audit/context-cost.js`'s `CEILING_BYTES = 40 * 1024`); its edit must stay net-neutral (≤ +100 bytes). Measure with `wc -c` after editing.
- Subject budget: 72 characters total (`{prefix}: {title} (#{n})`), `!` counted, `(#{n})` never truncated, `…` (U+2026) marks a cut.
- Type mapping: `feature` → `feat`, `bug` → `fix`, `task` → `chore`. Any other type throws.
- `breaking: true` with an empty migration note throws — never a footer with no content.
- `[auto-merge]` / `[fast-lane]` / `[manifesto-authorized]` / `[auto-finish]` tags are still consumed by `plugin/skills/_shared/github-pr-scan.md:331` (`contains(...)` on the whole commit message), so the composer carries `[{tag}]` as a body paragraph — never dropped.
- Commit message style: `{Verb} {what} — {detail}`, no conventional-commit prefixes in THIS repo's own commits. Every commit ends with the trailer `Claude-Session: https://claude.ai/code/session_018rz67jb18j1RLSqhjEdYWH`.
- Working directory: every command runs from the worktree `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-release-skill`. Never `cd` to the main checkout.
- Scope: touch only what a task names. A pre-existing bug noticed in passing is reported, not fixed.

---

### Task 1: The composer — `plugin/bin/lib/release/subject.js`

**Files:**
- Create: `plugin/bin/lib/release/subject.js`
- Test: `tests/bin-lib/release/subject.test.js`

**Interfaces:**
- Produces: `composeSubject({ type, title, number, breaking = false, summary, migrationNote, fixes, tag }) → { title: string, body: string }`; also exports `TYPE_PREFIX` (`{ feature: 'feat', bug: 'fix', task: 'chore' }`) and `SUBJECT_BUDGET` (`72`).
  - `type`: normalized facet value `'feature' | 'bug' | 'task'` — anything else throws `Error(/type must be one of/)`.
  - `number`: positive integer (throws otherwise). `fixes`: optional array of positive integers; defaults to `[number]`. Body carries one `Fixes #{n}` line per entry.
  - `tag`: optional string; when set the body carries a `[{tag}]` paragraph (keeps `github-pr-scan.md`'s metric working).
  - Body paragraph order: `{summary}` (omitted when empty) → `[{tag}]` (omitted when no tag) → `Fixes #…` lines → `BREAKING CHANGE: {migrationNote}` (only when `breaking`). The footer is always last (AC 2).

- [ ] **Step 1: Write the failing tests**

Create `tests/bin-lib/release/subject.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { composeSubject, TYPE_PREFIX, SUBJECT_BUDGET } = require('../../../plugin/bin/lib/release/subject.js');

test('type mapping: feature→feat, bug→fix, task→chore', () => {
  assert.equal(TYPE_PREFIX.feature, 'feat');
  assert.equal(TYPE_PREFIX.bug, 'fix');
  assert.equal(TYPE_PREFIX.task, 'chore');
  assert.equal(composeSubject({ type: 'feature', title: 'Add X', number: 42, summary: 'Adds X.' }).title, 'feat: Add X (#42)');
  assert.equal(composeSubject({ type: 'bug', title: 'Fix Y', number: 7, summary: 'Fixes Y.' }).title, 'fix: Fix Y (#7)');
  assert.equal(composeSubject({ type: 'task', title: 'Tidy Z', number: 9, summary: 'Tidies Z.' }).title, 'chore: Tidy Z (#9)');
});

test('body: summary, optional tag paragraph, then one Fixes line per record', () => {
  const { body } = composeSubject({ type: 'feature', title: 'Add X', number: 42, summary: 'Adds X.', tag: 'auto-merge', fixes: [42, 43] });
  assert.equal(body, 'Adds X.\n\n[auto-merge]\n\nFixes #42\nFixes #43');
  const noTag = composeSubject({ type: 'feature', title: 'Add X', number: 42, summary: 'Adds X.' });
  assert.equal(noTag.body, 'Adds X.\n\nFixes #42');
  const noSummary = composeSubject({ type: 'task', title: 'T', number: 1 });
  assert.equal(noSummary.body, 'Fixes #1');
});

test('breaking: ! suffix on the prefix and a trailing BREAKING CHANGE footer', () => {
  const out = composeSubject({ type: 'feature', title: 'Drop legacy flag', number: 5, breaking: true, summary: 'Removes it.', migrationNote: 'Pass --new instead of --legacy.' });
  assert.equal(out.title, 'feat!: Drop legacy flag (#5)');
  assert.ok(out.body.endsWith('\n\nBREAKING CHANGE: Pass --new instead of --legacy.'), out.body);
  assert.equal(out.body, 'Removes it.\n\nFixes #5\n\nBREAKING CHANGE: Pass --new instead of --legacy.');
});

test('throws on breaking without a migration note, and on an unresolvable type', () => {
  assert.throws(() => composeSubject({ type: 'feature', title: 'T', number: 5, breaking: true, migrationNote: '' }), /migrationNote/);
  assert.throws(() => composeSubject({ type: 'feature', title: 'T', number: 5, breaking: true, migrationNote: '   ' }), /migrationNote/);
  assert.throws(() => composeSubject({ type: 'feature', title: 'T', number: 5, breaking: true }), /migrationNote/);
  assert.throws(() => composeSubject({ type: 'type:feature', title: 'T', number: 5 }), /type must be one of/);
  assert.throws(() => composeSubject({ type: undefined, title: 'T', number: 5 }), /type must be one of/);
  assert.throws(() => composeSubject({ type: 'feature', title: 'T', number: 0 }), /number/);
  assert.throws(() => composeSubject({ type: 'feature', title: '', number: 5 }), /title/);
});

test('truncation: word-boundary cut, … marker, (#N) suffix intact, total ≤ 72', () => {
  const title = 'word '.repeat(30).trim(); // 149 chars, all word boundaries
  const { title: subject } = composeSubject({ type: 'feature', title, number: 2251 });
  assert.ok(subject.length <= SUBJECT_BUDGET, `${subject.length} > 72: ${subject}`);
  assert.ok(subject.endsWith(' (#2251)'), subject);
  assert.match(subject, /^feat: (word )*word… \(#2251\)$/);
});

test('truncation: a title that fits is never touched, and 72 exactly is allowed', () => {
  const short = composeSubject({ type: 'bug', title: 'Short title', number: 1 }).title;
  assert.equal(short, 'fix: Short title (#1)');
  // "feat: " (6) + title (58) + " (#1)" (5) = 69 → untouched
  const t58 = 'a'.repeat(58);
  assert.equal(composeSubject({ type: 'feature', title: t58, number: 1 }).title, `feat: ${t58} (#1)`);
  // Exactly 72: "feat: " (6) + 61 + " (#1)" (5) = 72 → untouched
  const t61 = ('word '.repeat(13)).slice(0, 61);
  const exact = composeSubject({ type: 'feature', title: t61, number: 1 }).title;
  assert.equal(exact.length, 72);
  assert.ok(!exact.includes('…'));
});

test('truncation: the ! suffix is counted inside the budget before the cut', () => {
  // With "feat: " (6) + 61 + " (#1)" (5) = 72 it fits; "feat!: " (7) pushes it to 73 → truncated.
  const t61 = ('word '.repeat(13)).slice(0, 61);
  const plain = composeSubject({ type: 'feature', title: t61, number: 1 }).title;
  const brk = composeSubject({ type: 'feature', title: t61, number: 1, breaking: true, migrationNote: 'n' }).title;
  assert.ok(!plain.includes('…'));
  assert.ok(brk.includes('…'), brk);
  assert.ok(brk.startsWith('feat!: '));
  assert.ok(brk.length <= SUBJECT_BUDGET);
  assert.ok(brk.endsWith(' (#1)'));
});

test('truncation: a single over-long word is hard-cut rather than reduced to the bare prefix', () => {
  const { title } = composeSubject({ type: 'task', title: 'x'.repeat(100), number: 12 });
  assert.ok(title.length <= SUBJECT_BUDGET);
  assert.match(title, /^chore: x+… \(#12\)$/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/bin-lib/release/subject.test.js`
Expected: FAIL — `Cannot find module '../../../plugin/bin/lib/release/subject.js'`

- [ ] **Step 3: Write the composer**

Create `plugin/bin/lib/release/subject.js`:

```js
// bin/lib/release/subject.js — the ONE merge-subject/body composer every merge
// site calls (#2251): pr-first `gh pr merge --squash -t/-b` and the four
// local-merge `git merge --no-ff -m` sites (settle-and-merge.md,
// auto-merge-short-circuit.md, local-merge-auto-finish.md, worktree-merge.md)
// all reach it through bin/compose-subject.js. Conventional Commits grammar
// (https://www.conventionalcommits.org/): `{type}[!]: {title} (#{n})` subject,
// optional summary paragraph, optional `[{tag}]` paragraph (kept because
// _shared/github-pr-scan.md's auto-merged-this-week metric matches the tag
// anywhere in the message), `Fixes #n` footer lines, and a trailing
// `BREAKING CHANGE: {note}` footer when `breaking` is set. release-please and
// the local release engine both parse exactly this shape back out, which is
// why there is one writer and no per-site variation. Pure function, zero deps.
'use strict';

const TYPE_PREFIX = { feature: 'feat', bug: 'fix', task: 'chore' };
const SUBJECT_BUDGET = 72;
const ELLIPSIS = '…';

function usage(message) {
  return new Error(`composeSubject: ${message}`);
}

// Truncate `{prefix}: {title}` so that head + suffix fits SUBJECT_BUDGET —
// last word boundary inside the budget, trailing punctuation trimmed, `…`
// appended. The suffix is appended by the caller after this and is never cut.
function truncateHead(head, prefix, suffixLength) {
  if (head.length + suffixLength <= SUBJECT_BUDGET) return head;
  const budget = SUBJECT_BUDGET - suffixLength - ELLIPSIS.length;
  let cut = head.slice(0, budget);
  const lastSpace = cut.lastIndexOf(' ');
  // `${prefix}: ` puts the first space at index prefix.length + 1; only cut
  // at a space *after* that, so a single over-long first word is hard-cut
  // rather than collapsing the subject to the bare prefix.
  if (lastSpace > prefix.length + 1) cut = cut.slice(0, lastSpace);
  return cut.replace(/[\s.,;:—-]+$/u, '') + ELLIPSIS;
}

// { type, title, number, breaking?, summary?, migrationNote?, fixes?, tag? } -> { title, body }
function composeSubject({ type, title, number, breaking = false, summary, migrationNote, fixes, tag } = {}) {
  const prefixBase = TYPE_PREFIX[type];
  if (!prefixBase) throw usage(`type must be one of ${Object.keys(TYPE_PREFIX).join('|')}, got ${JSON.stringify(type)}`);
  if (!Number.isInteger(number) || number <= 0) throw usage(`number must be a positive integer, got ${JSON.stringify(number)}`);
  const cleanTitle = typeof title === 'string' ? title.trim() : '';
  if (!cleanTitle) throw usage('title must be a non-empty string');
  const note = typeof migrationNote === 'string' ? migrationNote.trim() : '';
  if (breaking && !note) throw usage(`breaking is true for #${number} but migrationNote is empty — the record needs a non-empty "## Breaking Change" section`);

  const prefix = breaking ? `${prefixBase}!` : prefixBase;
  const suffix = ` (#${number})`;
  const head = truncateHead(`${prefix}: ${cleanTitle}`, prefix, suffix.length);

  const fixList = Array.isArray(fixes) && fixes.length ? fixes : [number];
  for (const n of fixList) {
    if (!Number.isInteger(n) || n <= 0) throw usage(`fixes entries must be positive integers, got ${JSON.stringify(n)}`);
  }
  const paragraphs = [];
  const cleanSummary = typeof summary === 'string' ? summary.trim() : '';
  if (cleanSummary) paragraphs.push(cleanSummary);
  if (typeof tag === 'string' && tag.trim()) paragraphs.push(`[${tag.trim()}]`);
  paragraphs.push(fixList.map((n) => `Fixes #${n}`).join('\n'));
  if (breaking) paragraphs.push(`BREAKING CHANGE: ${note}`);

  return { title: head + suffix, body: paragraphs.join('\n\n') };
}

module.exports = { composeSubject, TYPE_PREFIX, SUBJECT_BUDGET };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/bin-lib/release/subject.test.js`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/release/subject.js tests/bin-lib/release/subject.test.js
git commit -m "Add merge-subject composer bin/lib/release/subject.js — Conventional Commits grammar, ! + BREAKING CHANGE on breaking, 72-char word-boundary truncation, refs #2251

Claude-Session: https://claude.ai/code/session_018rz67jb18j1RLSqhjEdYWH"
```

---

### Task 2: The Compatibility facet — `breaking` label, shared facet key, both drivers, taxonomy row

**Files:**
- Modify: `plugin/bin/lib/issues/facet-shape.js` (add `breaking: false` after `solutionUnjustified`)
- Modify: `plugin/bin/lib/issues/record.js` (`LABELS.BREAKING`; `parseRecordFacets` branch)
- Modify: `plugin/bin/lib/issues/local-store.js` (parse `breaking: true|false` frontmatter line; serialize `breaking: true` when set)
- Modify: `plugin/skills/_shared/label-bootstrap.md` (one `LABELS_JSON` row)
- Modify: `plugin/skills/_shared/work-record.md` (one Compatibility row in the Label taxonomy table, after the `Justification (1)` row)
- Test: `tests/bin-lib/issues/record.test.js`, `tests/bin-lib/issues/local-store.test.js`, `tests/bin-lib/issues/backlog.test.js`, `tests/bin-lib/issues/labels.test.js`

**Interfaces:**
- Produces: `LABELS.BREAKING === 'breaking'`; `parseRecordFacets(labels).breaking` is `true` when the `breaking` label is present, `false` otherwise (never `undefined`); `readRecord(path).facets.breaking` mirrors it from a `breaking: true` frontmatter line; `writeRecord` emits `breaking: true` only when set.
- Consumed by Task 3's CLI.

- [ ] **Step 1: Write the failing tests**

Append to `tests/bin-lib/issues/record.test.js`:

```js
test('parseRecordFacets: breaking label sets facets.breaking to true (presence-only Compatibility axis, #2251)', () => {
  assert.strictEqual(parseRecordFacets(['breaking']).breaking, true);
  assert.strictEqual(parseRecordFacets([{ name: 'breaking' }]).breaking, true);
});

test('parseRecordFacets: facets.breaking defaults to false, never undefined', () => {
  assert.strictEqual(parseRecordFacets([]).breaking, false);
  assert.strictEqual(parseRecordFacets(['ready', 'type:feature']).breaking, false);
});

test('LABELS.BREAKING is exported and matches the canonical bootstrap row', () => {
  assert.strictEqual(LABELS.BREAKING, 'breaking');
});
```

(`LABELS` is already imported at the top of that file — check with `grep -n "LABELS" tests/bin-lib/issues/record.test.js | head -3`; if it isn't, add it to the existing `require('../../../plugin/bin/lib/issues/record')` destructure.)

Then update the two full-shape pins in the same file — the `assert.deepStrictEqual(parseRecordFacets(['by:capture', 'parked']), {…})` at ~line 222 and `assert.deepStrictEqual(parseRecordFacets([]), {…})` at ~line 248 — by inserting `breaking: false,` immediately after `solutionUnjustified: false,` in each object literal. Do the same in `tests/bin-lib/issues/backlog.test.js` at the object literal near line 245 (find every pin with `grep -rn "solutionUnjustified: false" tests/` and add `breaking: false,` after it in each).

Append to `tests/bin-lib/issues/local-store.test.js`, directly after the `writeRecord writes solution-unjustified: true …` test (~line 379):

```js
// breaking mirrors solutionUnjustified's presence-only convention (#2251): written
// only when true, read as false when the line is absent.
test('writeRecord writes breaking: true, readRecord reads it back, and a false value writes no line', (t) => {
  const dir = tmp(t);
  const withFlag = path.join(dir, '1-brk.md');
  writeRecord(withFlag, { title: 'A', body: 'b', facets: baseFacets({ breaking: true }) });
  const rawWith = fs.readFileSync(withFlag, 'utf8');
  assert.ok(/^breaking: true$/m.test(rawWith));
  assert.strictEqual(readRecord(withFlag).facets.breaking, true);

  const withoutFlag = path.join(dir, '2-nobrk.md');
  writeRecord(withoutFlag, { title: 'B', body: 'b', facets: baseFacets() });
  assert.ok(!/^breaking:/m.test(fs.readFileSync(withoutFlag, 'utf8')));
  assert.strictEqual(readRecord(withoutFlag).facets.breaking, false);
});
```

Append to `tests/bin-lib/issues/labels.test.js` (after the `parent-issue is exported …` test; it uses that file's existing `canonicalLabelsFromBootstrapDoc` helper):

```js
test('breaking is bootstrappable with a description within the cap and exported as LABELS.BREAKING (#2251)', () => {
  const row = canonicalLabelsFromBootstrapDoc().find(([name]) => name === 'breaking');
  assert.ok(row, 'label-bootstrap.md must carry breaking in LABELS_JSON');
  const [, description] = row;
  const payload = ensureLabelPayload('breaking', description);
  assert.strictEqual(payload.name, 'breaking');
  assert.ok(payload.description.length <= 100);
  assert.strictEqual(LABELS.BREAKING, 'breaking');
});
```

- [ ] **Step 2: Run a probe to verify the facet is missing today**

Run: `node -e 'const { parseRecordFacets } = require("./plugin/bin/lib/issues/record"); const v = parseRecordFacets(["breaking"]).breaking; if (v !== true) { console.error("breaking facet missing: " + JSON.stringify(v)); process.exit(1); }'`
Expected: FAIL — exit 1 with `breaking facet missing: undefined`.

Then run the suites you just edited: `node --test tests/bin-lib/issues/record.test.js tests/bin-lib/issues/local-store.test.js tests/bin-lib/issues/labels.test.js tests/bin-lib/issues/backlog.test.js tests/bin-lib/issues/facet-shape.test.js`
Expected: the new `breaking` tests and the updated full-shape pins fail (`undefined !== true` / `undefined !== false`, no bootstrap row).

- [ ] **Step 3: Implement**

`plugin/bin/lib/issues/facet-shape.js` — in `sharedFacetDefaults()`, insert after `solutionUnjustified: false,`:

```js
    breaking: false,
```

and extend the header comment's list of shared keys with `breaking` (the Compatibility axis, presence-only, #2251).

`plugin/bin/lib/issues/record.js` — in the `LABELS` object, insert after `NEEDS_DEFINITION: 'needs:definition',`:

```js
  // Compatibility axis (#2251) — presence-only, like SOLUTION_UNJUSTIFIED. Read by
  // bin/lib/release/subject.js's merge-subject composer (! suffix + BREAKING CHANGE footer).
  BREAKING: 'breaking',
```

and in `parseRecordFacets`, insert after the `NEEDS_DEFINITION` branch:

```js
    if (name === LABELS.BREAKING) {
      facets.breaking = true;
      continue;
    }
```

`plugin/bin/lib/issues/local-store.js` — in `parseFrontmatterLines`, insert after the `needs-definition:` line:

```js
    if ((m = /^breaking:\s*(true|false)$/.exec(line))) { facets.breaking = m[1] === 'true'; continue; }
```

and in the frontmatter serializer (the function containing `if (facets.solutionUnjustified) lines.push('solution-unjustified: true');`, ~line 209), insert directly after that line:

```js
  if (facets.breaking) lines.push('breaking: true');
```

Also extend that file's header comment list of shared keys (line ~7) with `breaking`.

`plugin/skills/_shared/label-bootstrap.md` — in the `LABELS_JSON` fence, insert after the `["solution:unjustified", …]` row:

```
  ["breaking",          "Compatibility: a contract change — merge subject gets ! and a BREAKING CHANGE: footer"],
```

`plugin/skills/_shared/work-record.md` — in the Label taxonomy table, insert after the `| Justification (1) | \`solution:unjustified\` | … |` row:

```
| Compatibility (1) | `breaking` | Presence-only, like `solution:unjustified`: the record's Acceptance Criteria name a contract change (CLAUDE.md's expand-contract discipline). Stamped by `/specify` shaping mode from that AC language, or by hand — never inferred from a diff; absent means "not breaking". Read by `bin/lib/release/subject.js`'s merge-subject composer (`!` suffix + `BREAKING CHANGE:` footer sourced from the record's `## Breaking Change` section) |
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/bin-lib/issues/record.test.js tests/bin-lib/issues/local-store.test.js tests/bin-lib/issues/labels.test.js tests/bin-lib/issues/backlog.test.js tests/bin-lib/issues/facet-shape.test.js`
Expected: PASS. Then sweep for any other full-shape pin you missed: `grep -rln "solutionUnjustified: false" tests/ | xargs node --test` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/issues/facet-shape.js plugin/bin/lib/issues/record.js plugin/bin/lib/issues/local-store.js plugin/skills/_shared/label-bootstrap.md plugin/skills/_shared/work-record.md tests/bin-lib/issues/record.test.js tests/bin-lib/issues/local-store.test.js tests/bin-lib/issues/backlog.test.js tests/bin-lib/issues/labels.test.js
git commit -m "Add the breaking Compatibility facet — LABELS.BREAKING, shared facet key, both drivers, taxonomy + bootstrap rows, refs #2251

Claude-Session: https://claude.ai/code/session_018rz67jb18j1RLSqhjEdYWH"
```

---

### Task 3: The CLI — `bin/compose-subject.js`

**Files:**
- Create: `plugin/bin/compose-subject.js` (thin wrapper: `require.main` guard, `process.exitCode = run(...)`)
- Create: `plugin/bin/lib/compose-subject.js` (`run(argv, deps)`, record → composer-input extraction — a single-file lib module beside `repo-resolve.js`/`blast-radius-cli.js`, the same shape as those)
- Test: `tests/bin-lib/compose-subject.test.js`
- Modify: `docs/plugin-structure.md` (add `compose-subject` to the `plugin/bin/` standalone-CLI list on line ~18, add a `plugin/bin/lib/compose-subject.js →` file row next to the `plugin/bin/lib/issues/native-dependencies.js →` row, and add a command-reference line next to the `claim-targets.js` line)

**Interfaces:**
- Consumes: `composeSubject` (Task 1), `parseRecordFacets` + `LABELS` (Task 2), `parseRepo`/`ghAvailable`/`remoteUrl` from `plugin/bin/lib/repo-resolve.js`.
- Produces: `node bin/compose-subject.js <n>[,<m>...] [<k>...] [--repo owner/name] [--tag <tag>] [--shell] [--help]`.
  - Positional numbers: one or more, each comma-joined or space-separated (`2251,2252 2253` == `2251 2252 2253`). Subject record = the lowest number; `fixes` = every number ascending.
  - Reads each record with `gh issue view {n} --repo {owner}/{repo} --json number,title,body,labels,issueType`.
  - Type: native `issueType.name` (lowercased) when present and one of `bug|feature|task`, else the `type:*` label — the same precedence `plugin/bin/lib/record-graph/encode.js`'s `typeOf` uses.
  - `breaking`: `true` when ANY record in the list has `parseRecordFacets(labels).breaking`; `migrationNote` = the `## Breaking Change` section body of every breaking record, joined by a blank line.
  - `summary`: first sentence of the subject record's `## Overview` section (text up to and including the first `.`, `!` or `?` followed by whitespace/end; the whole first paragraph when no sentence terminator; empty when there is no `## Overview`).
  - Output (stdout): JSON `{"title":…,"body":…}` + newline by default; with `--shell`, two lines `SUBJECT_TITLE='…'` and `SUBJECT_BODY='…'` single-quoted with `'` → `'\''`, for `eval "$(…)"` in skill prose.
  - Exit codes (Split-1/2 vocabulary, same as `bin/resolve-blockers.js`): `0` composed; `1` malformed invocation OR the record is not composable (`composeSubject` threw — no resolvable type, `breaking` without a `## Breaking Change` section) with the message on stderr; `2` `gh` absent or owner/repo unresolvable; `3` a `gh issue view` call failed.

- [ ] **Step 1: Write the failing tests**

Create `tests/bin-lib/compose-subject.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { run, parseArgs, shellQuote, extractSection, firstSentence } = require('../../plugin/bin/lib/compose-subject.js');

const RECORDS = {
  2251: { number: 2251, title: 'Merge-time conventional subject', body: 'Surface: infra\n\n## Overview\n\nMakes the merge subject conventional. Second sentence.\n\n## Deliverables\n\n- x\n', labels: [{ name: 'type:feature' }, { name: 'ready' }], issueType: null },
  2252: { number: 2252, title: 'Reconcile under squash', body: '## Overview\n\nSquash-aware reconcile.\n', labels: [{ name: 'type:task' }], issueType: null },
  2260: { number: 2260, title: 'Drop the legacy flag', body: '## Overview\n\nRemoves --legacy.\n\n## Breaking Change\n\nPass --new instead of --legacy.\n\n## Gotchas\n\n- none\n', labels: [{ name: 'type:feature' }, { name: 'breaking' }], issueType: null },
  2261: { number: 2261, title: 'Native-typed', body: '## Overview\n\nNative.\n', labels: [{ name: 'type:task' }], issueType: { name: 'Bug' } },
  2262: { number: 2262, title: "It's quoted", body: '## Overview\n\nHas a quote.\n', labels: [{ name: 'type:bug' }], issueType: null },
  2263: { number: 2263, title: 'No type', body: '## Overview\n\nNo type label.\n', labels: [{ name: 'ready' }], issueType: null },
  2264: { number: 2264, title: 'Breaking, no section', body: '## Overview\n\nOops.\n', labels: [{ name: 'type:feature' }, { name: 'breaking' }], issueType: null },
};

function fakeDeps({ records = RECORDS, ghAvailable = () => true, remoteUrl = () => 'git@github.com:acme/repo.git', failView = false } = {}) {
  const out = { stdout: '', stderr: '', calls: [] };
  const deps = {
    ghAvailable,
    remoteUrl,
    runner: (args) => {
      out.calls.push(args);
      if (failView) throw new Error('boom: gh exploded');
      assert.equal(args[0], 'issue'); assert.equal(args[1], 'view');
      const n = Number(args[2]);
      if (!records[n]) throw new Error('unexpected ' + args.join(' '));
      return JSON.stringify(records[n]);
    },
    stdout: (s) => { out.stdout += s; },
    stderr: (s) => { out.stderr += s; },
  };
  return { deps, out };
}

test('parseArgs: comma-joined and space-separated numbers, --tag, --shell, --repo', () => {
  const o = parseArgs(['2251,2252', '2253', '--tag', 'auto-merge', '--shell', '--repo', 'a/b']);
  assert.deepEqual(o.numbers, [2251, 2252, 2253]);
  assert.equal(o.tag, 'auto-merge'); assert.equal(o.shell, true); assert.equal(o.repo, 'a/b');
  assert.ok(parseArgs([]).error);
  assert.ok(parseArgs(['0']).error);
  assert.ok(parseArgs(['2251', '--bogus']).error);
  assert.ok(parseArgs(['2251', '--tag']).error);
  assert.equal(parseArgs(['--help']).help, true);
});

test('single record: conventional subject from type label, summary from Overview first sentence, one Fixes line', () => {
  const { deps, out } = fakeDeps();
  const code = run(['2251'], deps);
  assert.equal(code, 0, out.stderr);
  const parsed = JSON.parse(out.stdout);
  assert.equal(parsed.title, 'feat: Merge-time conventional subject (#2251)');
  assert.equal(parsed.body, 'Makes the merge subject conventional.\n\nFixes #2251');
  assert.deepEqual(out.calls[0].slice(0, 3), ['issue', 'view', '2251']);
  assert.ok(out.calls[0].includes('--repo') && out.calls[0].includes('acme/repo'));
  assert.ok(out.calls[0].includes('number,title,body,labels,issueType'));
});

test('bundle: subject from the lowest number, one Fixes line per record ascending, tag paragraph', () => {
  const { deps, out } = fakeDeps();
  assert.equal(run(['2252,2251', '--tag', 'auto-merge'], deps), 0, out.stderr);
  const parsed = JSON.parse(out.stdout);
  assert.equal(parsed.title, 'feat: Merge-time conventional subject (#2251)');
  assert.equal(parsed.body, 'Makes the merge subject conventional.\n\n[auto-merge]\n\nFixes #2251\nFixes #2252');
});

test('breaking record: ! suffix and BREAKING CHANGE footer from its ## Breaking Change section', () => {
  const { deps, out } = fakeDeps();
  assert.equal(run(['2260'], deps), 0, out.stderr);
  const parsed = JSON.parse(out.stdout);
  assert.equal(parsed.title, 'feat!: Drop the legacy flag (#2260)');
  assert.ok(parsed.body.endsWith('\n\nBREAKING CHANGE: Pass --new instead of --legacy.'), parsed.body);
});

test('native issueType wins over a type:* label', () => {
  const { deps, out } = fakeDeps();
  assert.equal(run(['2261'], deps), 0, out.stderr);
  assert.equal(JSON.parse(out.stdout).title, 'fix: Native-typed (#2261)');
});

test('--shell prints eval-able single-quoted assignments with embedded quotes escaped', () => {
  const { deps, out } = fakeDeps();
  assert.equal(run(['2262', '--shell'], deps), 0, out.stderr);
  const lines = out.stdout.trimEnd().split('\n');
  assert.equal(lines[0], "SUBJECT_TITLE='fix: It'\\''s quoted (#2262)'");
  assert.ok(lines[1].startsWith("SUBJECT_BODY='Has a quote."));
  assert.equal(shellQuote("a'b"), "'a'\\''b'");
});

test('exit 1: record with no resolvable type, or breaking without a ## Breaking Change section', () => {
  let r = fakeDeps();
  assert.equal(run(['2263'], r.deps), 1);
  assert.match(r.out.stderr, /type must be one of/);
  r = fakeDeps();
  assert.equal(run(['2264'], r.deps), 1);
  assert.match(r.out.stderr, /migrationNote|Breaking Change/);
});

test('exit 2: gh absent, or owner/repo unresolvable without --repo', () => {
  let r = fakeDeps({ ghAvailable: () => false });
  assert.equal(run(['2251'], r.deps), 2);
  r = fakeDeps({ remoteUrl: () => { throw new Error('not a git repo'); } });
  assert.equal(run(['2251'], r.deps), 2);
  r = fakeDeps({ remoteUrl: () => { throw new Error('not a git repo'); } });
  assert.equal(run(['2251', '--repo', 'acme/repo'], r.deps), 0, r.out.stderr);
});

test('exit 3: a gh issue view call fails', () => {
  const r = fakeDeps({ failView: true });
  assert.equal(run(['2251'], r.deps), 3);
  assert.match(r.out.stderr, /boom/);
});

test('helpers: extractSection and firstSentence', () => {
  const body = '## Overview\n\nOne. Two.\n\n## Breaking Change\n\nNote line 1.\nNote line 2.\n\n## Gotchas\n\n- g\n';
  assert.equal(extractSection(body, 'Breaking Change'), 'Note line 1.\nNote line 2.');
  assert.equal(extractSection(body, 'Missing'), '');
  assert.equal(firstSentence('One. Two.'), 'One.');
  assert.equal(firstSentence('No terminator here\n\nSecond para.'), 'No terminator here');
  assert.equal(firstSentence('Is this it? Yes. More.'), 'Is this it?');
  assert.equal(firstSentence('Line one\ncontinues here. Then more.'), 'Line one continues here.');
  assert.equal(firstSentence(''), '');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/bin-lib/compose-subject.test.js`
Expected: FAIL — `Cannot find module '../../../plugin/bin/lib/compose-subject.js'`

- [ ] **Step 3: Write the module and the wrapper**

Create `plugin/bin/lib/compose-subject.js`:

```js
// bin/lib/compose-subject.js — run(argv, deps) behind
// bin/compose-subject.js (#2251): reads one or more records via `gh issue
// view`, derives the composer's inputs (Type via native issueType then type:*
// label — the same precedence bin/lib/record-graph/encode.js's typeOf uses;
// `breaking` via parseRecordFacets; summary = ## Overview's first sentence;
// migrationNote = the ## Breaking Change section), and prints
// bin/lib/release/subject.js's composeSubject() output. Skill prose reaches
// the composer only through this CLI — the pure module has no shell surface.
//
// Usage: compose-subject.js <n>[,<m>...] [<k>...] [--repo owner/name] [--tag <tag>] [--shell] [--help]
// Numbers may be comma-joined and/or space-separated; the subject record is
// the lowest number, and the body carries one `Fixes #n` line per number.
// Output: JSON {"title","body"} by default; `--shell` prints SUBJECT_TITLE='…'
// and SUBJECT_BODY='…' (single-quoted, ' escaped as '\'') for `eval "$(…)"`.
// Exit codes (Split-1/2, mirroring bin/resolve-blockers.js): 0 composed; 1
// malformed invocation OR a record that cannot be composed (no resolvable
// Type, `breaking` label with no ## Breaking Change section — the composer's
// own usage error, message on stderr); 2 `gh` absent or owner/repo
// unresolvable (no --repo and no readable origin remote); 3 a `gh issue view`
// call itself failed. Every side effect goes through deps so tests never
// touch gh or git (gh-api-module-pattern's CLI wrapper contract).
'use strict';

const { execFileSync } = require('child_process');
const { composeSubject, TYPE_PREFIX } = require('./release/subject');
const { parseRecordFacets } = require('./issues/record');
const { parseRepo, ghAvailable, remoteUrl } = require('./repo-resolve');

const USAGE = 'usage: compose-subject.js <n>[,<m>...] [<k>...] [--repo owner/name] [--tag <tag>] [--shell] [--help]\n';
const GH_TIMEOUT_MS = 5000;
const RECOGNIZED_TYPES = Object.keys(TYPE_PREFIX);

const isPos = (n) => Number.isInteger(n) && n > 0;

function parseArgs(argv) {
  const opts = { numbers: [], repo: null, tag: null, shell: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') { opts.help = true; return opts; }
    if (a === '--shell') { opts.shell = true; continue; }
    if (a === '--repo' || a === '--tag') {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) return { error: `missing value for ${a}` };
      if (a === '--repo') opts.repo = v; else opts.tag = v;
      i++;
      continue;
    }
    if (a.startsWith('--')) return { error: `unknown argument: ${a}` };
    for (const part of a.split(',')) {
      const n = Number(part);
      if (part.trim() === '' || !isPos(n)) return { error: `malformed record number: ${JSON.stringify(part)}` };
      opts.numbers.push(n);
    }
  }
  if (opts.numbers.length === 0) return { error: 'missing <n> argument' };
  opts.numbers = [...new Set(opts.numbers)].sort((a, b) => a - b);
  return opts;
}

// Single-quote a value for POSIX sh: close, escaped quote, reopen.
function shellQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

// body, heading text -> that `## {heading}` section's trimmed body ('' when absent).
function extractSection(body, heading) {
  if (typeof body !== 'string') return '';
  const re = new RegExp(`^## ${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[ \\t]*\\r?\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm');
  const m = re.exec(body);
  return m ? m[1].trim() : '';
}

// text -> its first sentence: the first paragraph (newlines collapsed to spaces), cut at
// the first `.`/`!`/`?` that is followed by whitespace or end of text; the whole paragraph
// when it has no such terminator.
function firstSentence(text) {
  const t = typeof text === 'string' ? text.trim() : '';
  if (!t) return '';
  const firstPara = t.split(/\n\s*\n/)[0].replace(/\s*\n\s*/g, ' ').trim();
  const m = /^[\s\S]*?[.!?](?=\s|$)/.exec(firstPara);
  return m ? m[0].trim() : firstPara;
}

function typeOf(record) {
  const native = record.issueType;
  if (native && typeof native === 'object' && typeof native.name === 'string') {
    const name = native.name.toLowerCase();
    if (RECOGNIZED_TYPES.includes(name)) return name;
  }
  const names = (Array.isArray(record.labels) ? record.labels : []).map((l) => (typeof l === 'string' ? l : l && l.name)).filter(Boolean);
  for (const t of RECOGNIZED_TYPES) if (names.includes(`type:${t}`)) return t;
  return null;
}

const realDeps = {
  ghAvailable,
  remoteUrl,
  runner: (args) => execFileSync('gh', args, { encoding: 'utf8', timeout: GH_TIMEOUT_MS }),
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s),
};

// argv -> exit code.
function run(argv, deps = realDeps) {
  const opts = parseArgs(argv);
  if (opts.error) { deps.stderr(opts.error + '\n' + USAGE); return 1; }
  if (opts.help) { deps.stdout(USAGE); return 0; }
  if (!deps.ghAvailable()) { deps.stderr('compose-subject.js: `gh` is required\n'); return 2; }

  let remote = null;
  if (!opts.repo) { try { remote = deps.remoteUrl(); } catch { remote = null; } }
  const repoSpec = opts.repo ? parseRepo(`github.com/${opts.repo}`) : parseRepo(remote);
  if (!repoSpec) { deps.stderr('compose-subject.js: could not resolve owner/repo — pass --repo owner/name\n'); return 2; }
  const slug = `${repoSpec.owner}/${repoSpec.repo}`;

  const records = [];
  for (const n of opts.numbers) {
    let raw;
    try {
      raw = deps.runner(['issue', 'view', String(n), '--repo', slug, '--json', 'number,title,body,labels,issueType']);
    } catch (err) {
      deps.stderr(`compose-subject.js: gh issue view ${n} failed: ${err && err.message ? err.message : String(err)}\n`);
      return 3;
    }
    let record;
    try { record = JSON.parse(raw); } catch {
      deps.stderr(`compose-subject.js: gh issue view ${n} returned unparseable JSON\n`);
      return 3;
    }
    records.push(record);
  }

  const subjectRecord = records[0];
  const breakingRecords = records.filter((r) => parseRecordFacets(r.labels).breaking);
  const migrationNote = breakingRecords.map((r) => extractSection(r.body, 'Breaking Change')).filter(Boolean).join('\n\n');

  let composed;
  try {
    composed = composeSubject({
      type: typeOf(subjectRecord),
      title: subjectRecord.title,
      number: subjectRecord.number,
      breaking: breakingRecords.length > 0,
      summary: firstSentence(extractSection(subjectRecord.body, 'Overview')),
      migrationNote,
      fixes: opts.numbers,
      tag: opts.tag,
    });
  } catch (err) {
    deps.stderr(`compose-subject.js: ${err && err.message ? err.message : String(err)}\n`);
    return 1;
  }

  if (opts.shell) {
    deps.stdout(`SUBJECT_TITLE=${shellQuote(composed.title)}\nSUBJECT_BODY=${shellQuote(composed.body)}\n`);
  } else {
    deps.stdout(`${JSON.stringify(composed)}\n`);
  }
  return 0;
}

module.exports = { run, parseArgs, shellQuote, extractSection, firstSentence, typeOf, USAGE, realDeps };
```

Create `plugin/bin/compose-subject.js`:

```js
#!/usr/bin/env node
// bin/compose-subject.js — thin wrapper over bin/lib/compose-subject.js
// (#2251): the one shell command every merge site calls to get a Conventional-Commits
// merge subject + body for a record (or a bundle). See that module's header for usage,
// output forms, and the exit-code contract.
'use strict';
const { run, realDeps } = require('./lib/compose-subject');

if (require.main === module) process.exitCode = run(process.argv.slice(2), realDeps);
```

`docs/plugin-structure.md`:
- Line ~18 (`plugin/bin/ → … standalone CLIs listed in the command reference below (release, residue, …, plan-audit)`): insert `compose-subject, ` immediately before `claim-targets, ` in that parenthesized list.
- Next to the `plugin/bin/lib/issues/native-dependencies.js → …` row (line ~47), add a new row:
  `plugin/bin/lib/compose-subject.js → run(argv, deps) for plugin/bin/compose-subject.js (#2251): reads record(s) via gh issue view, derives Type (native issueType, then type:* label), breaking (parseRecordFacets), summary (## Overview first sentence) and migrationNote (## Breaking Change), and prints plugin/bin/lib/release/subject.js's composeSubject() output as JSON or --shell assignments. Consumed by plugin/bin/compose-subject.js; every merge site in _shared/pr-first-merge.md, _shared/local-merge-auto-finish.md, wrap-up/auto-merge-short-circuit.md, dispatch/settle-and-merge.md and flow/worktree-merge.md calls the CLI`
- In the command reference, next to the `node plugin/bin/claim-targets.js …` line (line ~142), add:
  ``node plugin/bin/compose-subject.js <n>[,<m>...] [<k>...] [--repo owner/name] [--tag <tag>] [--shell]   # Compose-subject CLI — Conventional-Commits merge subject/body for a record or bundle (subject from the lowest number, one Fixes line per number, [tag] body paragraph, ! + BREAKING CHANGE on the breaking label); JSON or eval-able --shell output; exit 0 composed, 1 malformed invocation or uncomposable record, 2 gh absent/repo unresolvable, 3 gh issue view failed``

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/bin-lib/compose-subject.test.js tests/bin-lib/exit-code-conformance.test.js`
Expected: PASS (the second suite walks every `plugin/bin/**/*.js` `require.main` guard and must stay green with the new wrapper).

Then a live read-only smoke test against this repo: `node plugin/bin/compose-subject.js 2251 --tag auto-merge`
Expected: exit 0 and a JSON line whose `title` starts with `feat: Merge-time conventional subject` and ends with `(#2251)`.

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/compose-subject.js plugin/bin/lib/compose-subject.js tests/bin-lib/compose-subject.test.js docs/plugin-structure.md
git commit -m "Add bin/compose-subject.js — the shell surface merge sites use to reach the subject composer, refs #2251

Claude-Session: https://claude.ai/code/session_018rz67jb18j1RLSqhjEdYWH"
```

---

### Task 4: pr-first merge sites — `--squash` and the composer (net-small edit)

**Files:**
- Modify: `plugin/skills/_shared/pr-first-merge.md:276-278` and `:310-312` (the two `gh pr merge` fences under Step 3), plus the one explanatory sentence right after the first fence.

**Interfaces:**
- Consumes: `bin/compose-subject.js --shell` (Task 3) — exports `SUBJECT_TITLE` / `SUBJECT_BODY`.

- [ ] **Step 1: Record the baseline byte count**

Run: `wc -c plugin/skills/_shared/pr-first-merge.md`
Expected: `30404`. The ceiling after this task is 30,904.

- [ ] **Step 2: Edit the first `gh pr merge` fence (line ~276)**

Replace exactly:

```bash
gh pr merge {pr-number} --repo {owner}/{repo} --auto --merge \
  -t "[{tag}] {one-line summary}" \
  -b "$(printf 'Fixes #%s\n' {issue-list})"
```

with:

```bash
eval "$(node "${CLAUDE_PLUGIN_ROOT}/bin/compose-subject.js" {issue-list} --tag {tag} --shell)"
gh pr merge {pr-number} --repo {owner}/{repo} --auto --squash \
  -t "$SUBJECT_TITLE" -b "$SUBJECT_BODY"
```

Then edit the paragraph that follows the fence — it must get **shorter** (see the composed-ceiling constraint in Global Constraints). Replace exactly:

```
`{issue-list}` is one `Fixes #{n}` per record — the manifest's `complete` specs only for a
bundle (#2015; rest release via their own `never-started:`/`abandoned:` reason). Same set the
PR body's own `Fixes` lines already carry
(`_shared/pr-early-run-lifecycle.md`'s pre-merge refresh), restated here because the
merge commit's own message is what GitHub scans for closing keywords on a non-default
integration branch, where the PR body's keywords don't fire (GitHub only auto-closes from a
merge commit's message, or a PR body merged into the *default* branch — an explicit merge
commit message is what makes closing work on any integration branch).
```

with:

```
`{issue-list}` is the record number(s) — the manifest's `complete` specs only for a bundle
(#2015; rest release via their own `never-started:`/`abandoned:` reason). The composer
(`bin/compose-subject.js` → `bin/lib/release/subject.js`) writes a Conventional-Commits subject
(`feat`/`fix`/`chore` from Type, `!` + `BREAKING CHANGE:` footer from the `breaking` label) and
one `Fixes #{n}` body line per record — the PR body's own set, restated in the merge commit
because GitHub only auto-closes from a merge commit's message on a non-default integration
branch. `--squash` keeps the integration branch to one conventional commit per PR
(release-please walks every reachable commit, not first-parent).
```

If the "Replace exactly" block above does not match byte-for-byte (line wrapping drifted), locate the paragraph by its first words (`` `{issue-list}` is one `Fixes #{n}` per record ``) and its last words (`closing work on any integration branch).`) and replace that whole span.

- [ ] **Step 3: Edit the second `gh pr merge` fence (line ~310, inside the `merge-verification: off` degrade bullet)**

Replace exactly:

```bash
     gh pr merge {pr-number} --repo {owner}/{repo} --merge \
       -t "[{tag}] {one-line summary}" \
       -b "$(printf 'Fixes #%s\n' {issue-list})"
```

with:

```bash
     gh pr merge {pr-number} --repo {owner}/{repo} --squash \
       -t "$SUBJECT_TITLE" -b "$SUBJECT_BODY"
```

(`$SUBJECT_TITLE`/`$SUBJECT_BODY` are the values the `eval` line above already exported; a caller landing here in a fresh shell re-runs that one `eval` line first.)

- [ ] **Step 4: Verify the byte budget and that no stale form remains**

Run: `wc -c plugin/skills/_shared/pr-first-merge.md`
Expected: a number ≤ 30404 (the file must not grow at all — the `merge` composed bundle it belongs to has only 51 bytes of headroom, see Global Constraints). If over, shorten the Step 2 paragraph (drop the release-please parenthetical first) until it fits.

Run: `node --test tests/bin-lib/skill-audit/context-cost.test.js`
Expected: PASS (the composed-bytes gate for the `merge` step still holds).

Then update the one prose mention of the old flag so it reads against the current one: at line ~165, replace `` `gh pr merge --auto --merge` **merges immediately** `` with `` `gh pr merge --auto --squash` **merges immediately** `` (the captured behavior is about `--auto`, not the merge strategy). Leave line ~258's verbatim capture log (`gh pr merge {n} --auto --merge -t … -b …`) untouched — it records a past observation.

Run: `grep -n -E "one-line summary|printf 'Fixes|\{pr-number\}[^\n]*--merge \\\\$" plugin/skills/_shared/pr-first-merge.md`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add plugin/skills/_shared/pr-first-merge.md
git commit -m "Switch pr-first merge to --squash with the composed conventional subject — both gh pr merge sites, refs #2251

Claude-Session: https://claude.ai/code/session_018rz67jb18j1RLSqhjEdYWH"
```

---

### Task 5: The four local-merge sites and the mechanical conformance test

**Files:**
- Modify: `plugin/skills/_shared/local-merge-auto-finish.md:114-116`
- Modify: `plugin/skills/wrap-up/auto-merge-short-circuit.md:218-220`
- Modify: `plugin/skills/dispatch/settle-and-merge.md:330-333` and the sentence at `:344` (net-neutral — file is at 40,139 of 40,960 bytes)
- Modify: `plugin/skills/flow/worktree-merge.md:63-66`
- Test: `tests/merge-subject-composer-conformance.test.js` (new)

**Interfaces:**
- Consumes: `bin/compose-subject.js --shell` (Task 3).

- [ ] **Step 1: Write the failing conformance test**

Create `tests/merge-subject-composer-conformance.test.js`:

```js
// tests/merge-subject-composer-conformance.test.js — pins #2251's merge-site contract:
// every merge site sources its subject/body from bin/compose-subject.js (AC 5), the two
// pr-first sites squash (AC 1), and pr-first-merge.md stays net-small (AC 6). Frozen
// pre-change excerpts prove each pattern can go red (skill-prose-conformance-tests, IL-105).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const PR_FIRST = 'plugin/skills/_shared/pr-first-merge.md';
const LOCAL_SITES = [
  'plugin/skills/_shared/local-merge-auto-finish.md',
  'plugin/skills/wrap-up/auto-merge-short-circuit.md',
  'plugin/skills/dispatch/settle-and-merge.md',
  'plugin/skills/flow/worktree-merge.md',
];

// AC 6: 30,404 bytes before #2251; net-small means at most +500.
const PR_FIRST_BYTE_CEILING = 30904;

// Frozen pre-change excerpts (byte-for-byte from the pre-#2251 files).
const PRE_PR_FIRST_SITE = `gh pr merge {pr-number} --repo {owner}/{repo} --auto --merge \\
  -t "[{tag}] {one-line summary}" \\
  -b "$(printf 'Fixes #%s\\n' {issue-list})"`;
const PRE_LOCAL_SITE = `git merge --no-ff {branch} -m "[auto-merge] {one-line summary}

Fixes #{issue}
Fixes #{second-issue}"`;
const PRE_WORKTREE_MERGE_SITE = `   git merge --no-ff {branch} -m "Merge {branch} — specs {list}

   Fixes #{issue}
   Fixes #{second-issue}"`;

const COMPOSER_CALL = /eval "\$\(node "\$\{CLAUDE_PLUGIN_ROOT\}\/bin\/compose-subject\.js" [^\n]*--shell\)"/;
const LOCAL_MERGE_FORM = /git merge --no-ff \{[a-z-]+\} -m "\$SUBJECT_TITLE\n\n\$SUBJECT_BODY"/;
const STALE_LOCAL_FORM = /git merge --no-ff \{[a-z-]+\} -m "(\[|Merge \{branch\})/;
const STALE_PR_FIRST_FORM = /gh pr merge \{pr-number\}[^\n]*--merge \\/;

test('pr-first-merge.md: both gh pr merge sites squash and take the composer output', () => {
  const text = read(PR_FIRST);
  const squashSites = text.match(/gh pr merge \{pr-number\} --repo \{owner\}\/\{repo\} (--auto )?--squash \\\n\s+-t "\$SUBJECT_TITLE" -b "\$SUBJECT_BODY"/g) || [];
  assert.equal(squashSites.length, 2, 'expected exactly two squash merge sites');
  assert.match(text, COMPOSER_CALL);
  assert.doesNotMatch(text, STALE_PR_FIRST_FORM);
  assert.doesNotMatch(text, /-t "\[\{tag\}\] \{one-line summary\}"/);
  // go-red proof
  assert.match(PRE_PR_FIRST_SITE, STALE_PR_FIRST_FORM);
  assert.doesNotMatch(PRE_PR_FIRST_SITE, COMPOSER_CALL);
});

test('pr-first-merge.md stays net-small (AC 6 byte ceiling)', () => {
  const bytes = fs.statSync(path.join(ROOT, PR_FIRST)).size;
  assert.ok(bytes <= PR_FIRST_BYTE_CEILING, `${PR_FIRST} is ${bytes} bytes, over the ${PR_FIRST_BYTE_CEILING}-byte ceiling (#2251 AC 6)`);
});

for (const rel of LOCAL_SITES) {
  test(`${path.basename(rel)}: the --no-ff merge sources -m from the composer`, () => {
    const text = read(rel);
    assert.match(text, COMPOSER_CALL, 'composer eval line present');
    assert.match(text, LOCAL_MERGE_FORM, 'merge takes $SUBJECT_TITLE / $SUBJECT_BODY');
    assert.doesNotMatch(text, STALE_LOCAL_FORM, 'no free-form -m subject remains');
  });
}

test('go-red proof: the frozen pre-change local-merge forms match the stale pattern and not the new one', () => {
  for (const pre of [PRE_LOCAL_SITE, PRE_WORKTREE_MERGE_SITE]) {
    assert.match(pre, STALE_LOCAL_FORM);
    assert.doesNotMatch(pre, LOCAL_MERGE_FORM);
    assert.doesNotMatch(pre, COMPOSER_CALL);
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/merge-subject-composer-conformance.test.js`
Expected: FAIL on every local-site test (the composer line is absent, the stale form matches) — the two pr-first tests PASS already because Task 4 landed.

- [ ] **Step 3: Edit `plugin/skills/_shared/local-merge-auto-finish.md` (line ~114)**

Replace exactly:

```bash
   git merge --no-ff {feature-branch} -m "[auto-finish] {one-line summary}

   Fixes #{issue}"
```

with:

```bash
   eval "$(node "${CLAUDE_PLUGIN_ROOT}/bin/compose-subject.js" {issue} --tag auto-finish --shell)"
   git merge --no-ff {feature-branch} -m "$SUBJECT_TITLE

$SUBJECT_BODY"
```

Then in the paragraph right after it, replace `guarantees a real merge commit exists to carry the \`Fixes #{issue}\` closing keyword` with `guarantees a real merge commit exists to carry the composer's \`Fixes #{issue}\` closing keyword (\`bin/compose-subject.js\` — Conventional-Commits subject, \`[auto-finish]\` body tag)`.

- [ ] **Step 4: Edit `plugin/skills/wrap-up/auto-merge-short-circuit.md` (line ~218)**

Replace exactly:

```
git merge --no-ff {branch} -m "[{tag}] {one-line summary}

Fixes #{issue}"
```

with:

```
eval "$(node "${CLAUDE_PLUGIN_ROOT}/bin/compose-subject.js" {issue} --tag {tag} --shell)"
git merge --no-ff {branch} -m "$SUBJECT_TITLE

$SUBJECT_BODY"
```

(These lines sit inside the existing ```` ```bash ```` fence after the `fi` of the branch guard — keep the guard lines untouched.)

- [ ] **Step 5: Edit `plugin/skills/dispatch/settle-and-merge.md` (line ~330), net-neutral**

Replace exactly:

```
git merge --no-ff {branch} -m "[auto-merge] {one-line summary}

Fixes #{issue}
Fixes #{second-issue}"
```

with:

```
eval "$(node "${CLAUDE_PLUGIN_ROOT}/bin/compose-subject.js" {issue} {second-issue} --tag auto-merge --shell)"
git merge --no-ff {branch} -m "$SUBJECT_TITLE

$SUBJECT_BODY"
```

Then at line ~344 replace exactly `One \`Fixes #{issue}\` line per record in the group. The explicit \`--no-ff\`` with `The composer emits one \`Fixes #{issue}\` line per record passed. The explicit \`--no-ff\``.

To keep the file net-neutral (it is at 40,139 bytes against a 40,960 ceiling), shorten the sentence at line ~344 further if needed: after editing, run `wc -c plugin/skills/dispatch/settle-and-merge.md` — Expected: ≤ 40300. If it is over, trim wording in that same sentence (never elsewhere) until it fits.

- [ ] **Step 6: Edit `plugin/skills/flow/worktree-merge.md` (line ~63)**

Replace exactly:

```bash
   git merge --no-ff {branch} -m "Merge {branch} — specs {list}

   Fixes #{issue}
   Fixes #{second-issue}"
```

with:

```bash
   eval "$(node "${CLAUDE_PLUGIN_ROOT}/bin/compose-subject.js" {issue} {second-issue} --shell)"
   git merge --no-ff {branch} -m "$SUBJECT_TITLE

$SUBJECT_BODY"
```

The sentence before the fence ("the merge commit message must carry the closing keywords — one line per issue …") stays; the composer emits them. The "Otherwise a plain `git merge {branch}` is fine." sentence after the fence stays — a non-record-derived branch has no record to compose from.

- [ ] **Step 7: Run the conformance test and the byte checks**

Run: `node --test tests/merge-subject-composer-conformance.test.js`
Expected: PASS (7 tests).

Run: `wc -c plugin/skills/dispatch/settle-and-merge.md plugin/skills/_shared/pr-first-merge.md`
Expected: settle-and-merge.md ≤ 40300; pr-first-merge.md ≤ 30904.

Run: `node --test tests/bin-lib/skill-audit/context-cost.test.js`
Expected: PASS (per-file ceiling not breached; the `merge` composed step keeps its existing 59 KB exception).

- [ ] **Step 8: Commit**

```bash
git add plugin/skills/_shared/local-merge-auto-finish.md plugin/skills/wrap-up/auto-merge-short-circuit.md plugin/skills/dispatch/settle-and-merge.md plugin/skills/flow/worktree-merge.md tests/merge-subject-composer-conformance.test.js
git commit -m "Source the four local-merge -m subjects from bin/compose-subject.js and pin every merge site with a conformance test, refs #2251

Claude-Session: https://claude.ai/code/session_018rz67jb18j1RLSqhjEdYWH"
```

---

### Task 6: `/specify` shaping mode stamps `breaking` from contract-change acceptance criteria

**Files:**
- Modify: `plugin/skills/specify/shaping-mode-stamping.md` — the "Stamp scoring and stage labels" bullet list, the Compose-then-write-once assembly order and `gh issue edit` call, the local-files `facets` sentence, and the Read-back verification list.

**Interfaces:**
- Consumes: `LABELS.BREAKING` / `facets.breaking` (Task 2); the `## Breaking Change` section the composer reads (Task 3).

- [ ] **Step 1: Add the stamping rule**

In the "Stamp scoring and stage labels" bullet list, insert a new bullet directly after the `**Type absent**` bullet:

```
- **Compatibility** — stamp `breaking` when the now-shaped Acceptance Criteria name a contract
  change: a removed or renamed public flag, CLI verb, exported function, hook payload field,
  skill frontmatter key, work-record schema field, or `_shared/*.md` convention that existing
  consumers rely on (the same expand-contract signal CLAUDE.md's Philosophy already requires a
  spec to state explicitly — "add the new, migrate every consumer, remove the old"). This is a
  read of the AC *language*, never an inference from a diff, and the headless `next` posture
  applies the identical rule with no extra judgment call. When stamping it, the composed body
  must carry a `## Breaking Change` section (placement in the assembly order below) stating, in
  one short paragraph, what a consumer must change — `bin/compose-subject.js` reads that section
  verbatim as the merge commit's `BREAKING CHANGE:` footer and refuses to compose a
  `breaking`-labelled record that has none. Absent label means "not breaking" — a missed contract
  change is the design's accepted risk, not something to guess at. Bootstrap `breaking` per
  `_shared/label-bootstrap.md` before the first write, as with any new label. Never stamp it on
  a record whose ACs only *add* surface.
```

- [ ] **Step 2: Add the section to the assembly order**

In the "Compose-then-write-once" assembly fence, insert between `## Gotchas\n...` and `## Original request`:

```
## Breaking Change        ← only when `breaking` is stamped
...
```

- [ ] **Step 3: Add the label to the write call and the local-files sentence**

In the `gh issue edit {n} \` fence, insert a line `  --add-label breaking \` directly after `  --add-label "ceremony:{tier}" \`. Then in the "Omit `--add-label "risk:{tier}"` …" paragraph, add one sentence after the `--add-label "solution:unjustified"` rule: `` `--add-label breaking` follows the same conditional rule — present only when the Compatibility bullet above stamped it; there is no removal case (a record that stops being breaking is re-shaped, and the label is cleared by hand). ``

In the `work-backend: local-files` paragraph, after `facets.solutionUnjustified` … `matching sharedFacetDefaults()'s own default)`, add: `` and `facets.breaking` (written `true` only when the Compatibility bullet stamped it, `false` otherwise). ``

- [ ] **Step 4: Add the read-back assertion**

In "Read-back verification", add a bullet after the `solution:unjustified` bullet:

```
- When the Compatibility bullet stamped `breaking`, the label is present in the re-fetched labels
  (`facets.breaking === true` under local-files) **and** the re-fetched body carries a non-empty
  `## Breaking Change` section — a `breaking` record with no section fails
  `bin/compose-subject.js` at merge time, so catch it here.
```

- [ ] **Step 5: Verify prose tests still pass and the byte size is sane**

Run: `wc -c plugin/skills/specify/shaping-mode-stamping.md` — Expected: ≤ 27500 (was 24,902).
Run: `grep -rln "shaping-mode-stamping" tests | xargs node --test` — Expected: PASS.
Run: `node --test tests/bin-lib/skill-audit/context-cost.test.js` — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add plugin/skills/specify/shaping-mode-stamping.md
git commit -m "Stamp breaking in /specify shaping mode when acceptance criteria name a contract change — with the ## Breaking Change section the composer reads, refs #2251

Claude-Session: https://claude.ai/code/session_018rz67jb18j1RLSqhjEdYWH"
```

---

## Verification (whole plan)

Run: `npm test > /tmp/x.txt 2>&1; tail -12 /tmp/x.txt` — Expected: `# fail 0`.

Spec acceptance mapping:
- AC 1 (one squash commit, `feat: {title} (#N)`) — Task 1 tests + Task 4/5 conformance (squash sites).
- AC 2 (`!` + trailing `BREAKING CHANGE:`) — Task 1 `breaking` test, Task 3 breaking-record test.
- AC 3 (truncation, suffix intact, `!` inside budget) — Task 1 truncation tests.
- AC 4 (facet round-trip, `false` never `undefined`) — Task 2 tests.
- AC 5 (four sites source from the composer, zero stale matches) — Task 5 conformance `STALE_LOCAL_FORM`.
- AC 6 (pr-first-merge.md ≤ +500 bytes, mechanical) — Task 5 byte-ceiling test.
- AC 7 (throws on empty note / bad type) — Task 1 throw tests.
