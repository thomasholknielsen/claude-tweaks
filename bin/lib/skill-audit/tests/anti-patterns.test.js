'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const {
  extractAntiPatternRows,
  bodyOutsideSection,
  rowIdentifiers,
  compareTables,
} = require('../anti-patterns.js');

const SAMPLE = [
  '# Some skill',
  '',
  '## Anti-Patterns',
  '',
  '| Pattern | Why It Fails |',
  '|---------|-------------|',
  '| Skipping the test gate | `TEST_PASSED=true` is the contract `/review` reads |',
  '| Bulk-resolving items | Each needs a per-item decision |',
  '',
  '## Relationship to Other Skills',
  '',
  '| Skill | Relationship |',
].join('\n');

test('extracts rows, skipping the header and rule rows', () => {
  const rows = extractAntiPatternRows(SAMPLE);
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[0].pattern, 'Skipping the test gate');
  assert.strictEqual(rows[1].why, 'Each needs a per-item decision');
});

test('stops at the next ## heading', () => {
  const rows = extractAntiPatternRows(SAMPLE);
  assert.ok(rows.every((r) => !r.pattern.startsWith('Skill')));
});

test('runs to end of file when no heading follows', () => {
  const noTail = SAMPLE.split('\n## Relationship')[0];
  assert.strictEqual(extractAntiPatternRows(noTail).length, 2);
});

test('returns empty for a file with no Anti-Patterns section', () => {
  assert.deepStrictEqual(extractAntiPatternRows('# Nothing here\n\ntext'), []);
});

test('bodyOutsideSection removes the section', () => {
  const body = bodyOutsideSection(SAMPLE);
  assert.ok(!body.includes('Skipping the test gate'));
  assert.ok(body.includes('## Relationship to Other Skills'));
});

test('splitCells handles an escaped pipe inside a cell', () => {
  const md = [
    '## Anti-Patterns',
    '| Pattern | Why It Fails |',
    '|---|---|',
    '| Using `a \\| b` syntax | Breaks the table |',
  ].join('\n');
  const rows = extractAntiPatternRows(md);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].pattern, 'Using `a | b` syntax');
  assert.strictEqual(rows[0].why, 'Breaks the table');
});

test('rowIdentifiers picks up backticked anchors from both cells', () => {
  const rows = extractAntiPatternRows(SAMPLE);
  const ids = rowIdentifiers(rows[0]);
  assert.ok(ids.has('TEST_PASSED=true'));
  assert.ok(ids.has('/review'));
});

// ── The guard itself. Each of these must FAIL on the damage it describes, or it
// is not a check (IL-78). Every case below is the "damaged" direction.

test('compareTables reports a clean compression as lossless', () => {
  const before = extractAntiPatternRows(SAMPLE);
  const compressed = SAMPLE.replace(
    '| Skipping the test gate | `TEST_PASSED=true` is the contract `/review` reads |',
    '| Skipping the test gate | `TEST_PASSED=true` is what `/review` reads |',
  );
  const result = compareTables(before, extractAntiPatternRows(compressed));
  assert.strictEqual(result.evicted, 0);
  assert.deepStrictEqual(result.lostIdentifiers, []);
});

test('compareTables CATCHES an evicted row', () => {
  const before = extractAntiPatternRows(SAMPLE);
  const gutted = SAMPLE.replace(
    '| Bulk-resolving items | Each needs a per-item decision |\n',
    '',
  );
  const result = compareTables(before, extractAntiPatternRows(gutted));
  assert.strictEqual(result.countBefore, 2);
  assert.strictEqual(result.countAfter, 1);
  assert.strictEqual(result.evicted, 1, 'an evicted row must be reported');
});

test('compareTables CATCHES a dropped identifier inside a surviving row', () => {
  const before = extractAntiPatternRows(SAMPLE);
  // The row survives and still reads plausibly — but no longer names the
  // contract it governs. This is the failure a per-row reviewer waves through.
  const vague = SAMPLE.replace(
    '| Skipping the test gate | `TEST_PASSED=true` is the contract `/review` reads |',
    '| Skipping the test gate | The gate exists for a reason |',
  );
  const result = compareTables(before, extractAntiPatternRows(vague));
  assert.strictEqual(result.evicted, 0, 'row count is unchanged — count alone would pass');
  const lost = result.lostIdentifiers.map((l) => l.identifier).sort();
  assert.deepStrictEqual(lost, ['/review', 'TEST_PASSED=true']);
});

test('every shipped skill has a parseable Anti-Patterns table', () => {
  const skillsDir = path.join(__dirname, '..', '..', '..', '..', 'skills');
  const names = fs
    .readdirSync(skillsDir)
    .filter((n) => fs.existsSync(path.join(skillsDir, n, 'SKILL.md')))
    .sort();
  assert.strictEqual(names.length, 33);

  let total = 0;
  for (const name of names) {
    const md = fs.readFileSync(path.join(skillsDir, name, 'SKILL.md'), 'utf8');
    const rows = extractAntiPatternRows(md);
    assert.ok(rows.length > 0, `${name}/SKILL.md has no Anti-Pattern rows`);
    for (const row of rows) {
      assert.ok(row.pattern.length > 0, `${name}:${row.line} has an empty Pattern cell`);
      assert.ok(row.why.length > 0, `${name}:${row.line} has an empty Why cell`);
    }
    total += rows.length;
  }
  // Live corpus measurement. Phase 3 compresses these rows in place, so this
  // number must not move unrecorded — a change here means a row was evicted,
  // which is the one thing the compression is forbidden to do. Moving it is
  // allowed only alongside evidence that the eviction was deliberate:
  //
  //   347 -> 345, merge of the v6.36.0 legacy purge. Two rows removed upstream,
  //   both about retired legacy config: init's "Silently rewriting a legacy
  //   `backlog-backend` flag to `work-backend`" and tidy's "Relabeling a
  //   legacy-taxonomy record instead of flagging it". Verified against the
  //   merge base — both are present at the base and absent from the upstream
  //   side, so they were deleted by the purge, not lost in conflict resolution.
  //
  //   345 -> 347, v6.42.0 (#132). Two rows ADDED to routine/SKILL.md, none
  //   evicted: "Letting a routine's target branch default to the repo's GitHub
  //   default..." and "Editing a `routine-template.yml` without bumping its
  //   `template_version`". Confirmed additive for this corpus: `git diff --
  //   'skills/*/SKILL.md' | grep -E '^-\|'` is empty across the change set, so
  //   no Anti-Pattern row was evicted anywhere. (The change set does delete one
  //   `|` row overall — the `prompt` field row in _shared/routine-template-
  //   schema.md, replaced by an updated one — but that file has no SKILL.md and
  //   this count never saw it.)
  //
  //   345 -> 352, addition of `skills/feedback/SKILL.md` (learning-routing plan,
  //   Task 2). A wholly new skill, not a compression pass — its Anti-Patterns
  //   table contributes 7 rows and nothing elsewhere in the corpus lost a row.
  //
  //   352 -> 351, removal of `skills/feedback/SKILL.md`'s "Dropping a payload
  //   when `gh` fails" row (learning-routing plan, Task 6b, Step 6). The row's
  //   Why-column named a retry queue that never existed — no `bin/feedback.js`,
  //   nothing drains it — so the row was deleted rather than reworded, per the
  //   task brief's explicit instruction. feedback/SKILL.md now contributes 6
  //   rows (was 7); no other row in the corpus was touched.
  //
  //   -> 353, merge of origin/main into the learning-routing branch. The two
  //   preceding entries are the two sides of that merge, both measured against
  //   the same 345 base: upstream added 2 (routine), this branch added 6 net
  //   (feedback's 7 minus its 1 removed). 345 + 2 + 6 = 353. Neither side's own
  //   total is correct after the merge — 347 and 351 each omit the other's
  //   additions — so this number is derived from both, not picked from one.
  //
  //   353 -> 354, acceptance-disposition backstop. One row ADDED to demo/
  //   SKILL.md: "Writing a reconstruction's `### Confirmed` as though someone
  //   watched the work", guarding the new closing-commit brief path. The same
  //   change set rewords demo's "Re-deriving 'how do I test this' from the
  //   diff" row to "...when a brief already exists" — a reword, not an
  //   eviction: `git diff -- 'skills/*/SKILL.md' | grep -E '^-\|'` returns that
  //   one line and its replacement is present in the same table. Net +1.
  //
  //   354 -> 356, supervised trust table (Task 3). Two rows ADDED, none
  //   evicted: help/SKILL.md gains "Deriving a recommendation, grant, or 'next
  //   step' from the Trust Table's verdicts" (guards Stage 4.8's read-only
  //   contract) and backlog/SKILL.md gains "Deriving a grant, priority bump,
  //   or 'next step' from `overview` mode's Trust Table" (guards the same
  //   contract for `/backlog overview`'s new Step 1.5). Verified:
  //   `git diff -- 'skills/*/SKILL.md' | grep -E '^-\|'` is empty; the same
  //   diff's `^\+\|` lines are exactly these two new rows. Net +2.
  //
  //   356 -> 358, retirement of design-wrapper's auto-fit / issue-driven
  //   dispatch tables (#147). Two rows ADDED to design-wrapper/SKILL.md, both
  //   guarding the suggestion-driven model that replaced the keyword tables:
  //   "Deriving a polish command from a finding's `category`, `rule`, or
  //   `description`" and "Dropping an audit finding that has no `suggestion`".
  //   The same change set rewords that table's "Running `polish` when the audit
  //   cache is absent" row to name the new vocabulary — a reword, not an
  //   eviction: its replacement is present in the same table. The other `-|`
  //   lines in this change set are Input/Flags/availability rows, which this
  //   parser does not read. Net +2.
  //
  //   Both change sets above landed concurrently and each moved this number
  //   354 -> 356 independently, adding a DIFFERENT pair of rows. The counter
  //   therefore merged without conflict at the wrong value — same literal from
  //   the same base — while the two comment blocks did conflict. Correct total
  //   is 354 + 2 + 2 = 358, confirmed by running the parser, not by arithmetic
  //   alone.
  assert.strictEqual(total, 358);
});
