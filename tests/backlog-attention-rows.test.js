'use strict';
// Pins record #1489's widening of backlog/attention-mode.md (needs:* +
// bot:blocked via the session-scoped record-queue-fetch snapshot, the
// three-launcher render collapse, the breaker banner + tidy row), the new
// refine-record.md #N/--reset-breaker resolver, SKILL.md's routing update,
// and the carried work-record-permission-matrix.md row edit (Task 2 review).
// Each assertion is a literal-string pin, not a structural re-derivation —
// per skill-prose-conformance-tests, every `doesNotMatch` string below was
// spot-checked to have actually existed in the pre-#1489 file (base commit
// 7ce21b0d5) so a revert of the fix would turn these tests red.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SKILL_DIR = path.join(__dirname, '..', 'plugin', 'skills', 'backlog');
const SHARED_DIR = path.join(__dirname, '..', 'plugin', 'skills', '_shared');

function read(...segments) {
  return fs.readFileSync(path.join(...segments), 'utf8');
}

test('attention-mode.md: needs:*/bot:blocked come from the session-scoped snapshot, not a --label fetch', () => {
  const source = read(SKILL_DIR, 'attention-mode.md');
  assert.match(
    source,
    /_shared\/record-queue-fetch\.md.{0,40}Session-scoped record snapshot/s,
    'expected a citation of record-queue-fetch.md\'s Session-scoped record snapshot section',
  );
  assert.doesNotMatch(
    source,
    /gh issue list --state open --label needs:definition/,
    'the pre-#1489 dedicated needs:definition --label fetch must be gone — needs:* now comes from the snapshot',
  );
});

test('attention-mode.md: solution:unjustified and ready+shaped:headless direct fetches survive byte-level', () => {
  const source = read(SKILL_DIR, 'attention-mode.md');
  assert.ok(
    source.includes(
      'gh issue list --state open --label solution:unjustified --json number,title,createdAt,labels --limit 200 > "$ST_BACKLOG_ATTENTION_SOLUTION_UNJUSTIFIED"',
    ),
    'the solution:unjustified single-label fetch line must survive byte-for-byte',
  );
  assert.ok(
    source.includes(
      'gh issue list --state open --label ready --label shaped:headless --json number,title,createdAt,labels --limit 200 > "$ST_BACKLOG_ATTENTION_SHAPED_HEADLESS"',
    ),
    'the ready+shaped:headless two-label fetch line must survive byte-for-byte',
  );
});

test('attention-mode.md: render collapses to the three launchers (specify/challenge/refine)', () => {
  const source = read(SKILL_DIR, 'attention-mode.md');

  // needs:decision rows quote the captured **Proposed:** line.
  assert.match(source, /\*\*Proposed:\*\*/, 'expected a **Proposed:** reference for needs:decision rows');

  // The refine #{n} catch-all is stated as the permanent default for any
  // future needs:* marker.
  assert.match(
    source,
    /`refine #\{n\}` catch-all is the \*\*permanent default\*\*/,
    'expected the refine catch-all to be stated as the permanent default',
  );

  // bot:blocked gets its own row with the refine launcher.
  assert.ok(
    source.includes(
      '| #{n} | bot:blocked | {createdAt, relative} | run /claude-tweaks:backlog refine #{n} to re-authorize after the failure |',
    ),
    'expected the bot:blocked row with its refine re-authorize launcher',
  );

  // Amendment: solution:unjustified's launcher is /claude-tweaks:challenge,
  // never the refine launcher (the pre-#1489 text used refine here).
  assert.ok(
    source.includes(
      '| #{n} | solution:unjustified | {createdAt, relative} | run /claude-tweaks:challenge #{n} for the evidence-or-accept-risk verdict on the flag |',
    ),
    'expected the solution:unjustified row to launch /claude-tweaks:challenge, not refine',
  );
  assert.doesNotMatch(
    source,
    /solution:unjustified \| \{createdAt, relative\} \| run \/claude-tweaks:backlog refine #\{n\} to grant despite the flag/,
    'the pre-#1489 refine-launcher wording for solution:unjustified must be gone',
  );
});

test('attention-mode.md: breaker banner (fail-open + launcher) and tidy row (anchored glob + launcher)', () => {
  const source = read(SKILL_DIR, 'attention-mode.md');

  assert.match(
    source,
    /read failure or the degraded shape omits the banner entirely, never renders a false-positive/,
    'expected the fail-open omission sentence for the breaker banner',
  );
  assert.ok(
    source.includes('run /claude-tweaks:backlog refine --reset-breaker'),
    'expected the --reset-breaker launcher on the breaker banner line',
  );

  assert.match(
    source,
    /\[IL-127\]|Anchoring section/,
    'expected the tidy row\'s glob resolution to cite IL-127 / the Anchoring section',
  );
  assert.ok(
    source.includes('run **/claude-tweaks:tidy** (the run'),
    'expected the softened bare-tidy launcher (no --approve, which does not exist yet) on the tidy row',
  );
  assert.doesNotMatch(
    source,
    /--approve/,
    'A4: /claude-tweaks:tidy --approve does not exist yet -- no --approve string may remain in attention-mode.md',
  );
});

test('attention-mode.md: AC5 empty-state widening and the dedupe Anti-Patterns row', () => {
  const source = read(SKILL_DIR, 'attention-mode.md');

  assert.ok(
    source.includes(
      'Nothing needs attention — no open record carries a\nneeds:* marker, solution:unjustified, an ungranted shaped:headless spec, or bot:blocked.',
    ),
    'expected the widened empty-state string naming needs:*/solution:unjustified/shaped:headless/bot:blocked',
  );

  assert.ok(
    source.includes(
      '| A separate row per matched type for a record carrying two or more of the classifications | Dedupe by issue number and render one row with a concatenated Type/Recommended action, however many types matched |',
    ),
    'expected the dedupe Anti-Patterns row to survive byte-for-byte',
  );
});

test('attention-mode.md: A5 shaped:headless launcher points at the sweep\'s Grant lane, not refine #{n}', () => {
  const source = read(SKILL_DIR, 'attention-mode.md');

  assert.ok(
    source.includes(
      '| #{n} | shaped:headless (no grant) | {createdAt, relative} | run /claude-tweaks:backlog refine to grant via the sweep\'s Grant lane (spec was headlessly shaped — no human has reviewed it) |',
    ),
    'expected the shaped:headless row to point at bare refine\'s Grant lane, not refine #{n}',
  );
  assert.doesNotMatch(
    source,
    /shaped:headless \(no grant\)[^|]*\|[^|]*\|[^|]*\| run \/claude-tweaks:backlog refine #\{n\} to grant/,
    'the pre-#1489 refine #{n}-to-grant wording for shaped:headless must be gone from the table row',
  );
});

test('refine-record.md exists and carries the #N resolver + --reset-breaker + shim-with-removal-condition contract', () => {
  const filePath = path.join(SKILL_DIR, 'refine-record.md');
  assert.ok(fs.existsSync(filePath), 'refine-record.md must exist');
  const source = read(filePath);

  assert.match(
    source,
    /Decision-comment template|<!-- needs-decision:/,
    'expected a citation of work-record.md\'s Decision-comment template / marker',
  );
  assert.match(
    source,
    /merge-lane-reset\.md/,
    'expected a citation of merge-lane-reset.md for --reset-breaker',
  );
  assert.doesNotMatch(
    source,
    /Reset it\?/,
    'refine-record.md must not duplicate merge-lane-reset.md\'s own question text',
  );
  assert.match(
    source,
    /backlog-refine-human-only/,
    'expected the backlog-refine-human-only compatibility shim to be documented',
  );
  assert.match(
    source,
    /removal condition/i,
    'expected the shim to carry a stated removal condition',
  );
});

test('refine-mode.md does not route to refine-record.md; SKILL.md does', () => {
  const refineModeSource = read(SKILL_DIR, 'refine-mode.md');
  const skillSource = read(SKILL_DIR, 'SKILL.md');

  assert.doesNotMatch(
    refineModeSource,
    /refine-record\.md/,
    'refine-mode.md\'s whole-queue sweep must never mention refine-record.md — routing lives in SKILL.md',
  );
  assert.match(
    skillSource,
    /refine-record\.md/,
    'SKILL.md must route the #N[,#M...] and --reset-breaker forms to refine-record.md',
  );
});

test('backlog SKILL.md: argument-hint carries #N[,#M...] and --reset-breaker; no stale dispatch-next backtick reference', () => {
  const source = read(SKILL_DIR, 'SKILL.md');
  const hintLine = source.split('\n').find((l) => l.startsWith('argument-hint:'));
  assert.ok(hintLine, 'expected an argument-hint frontmatter line');
  assert.ok(hintLine.includes('#N[,#M...]'), 'argument-hint must include #N[,#M...]');
  assert.ok(hintLine.includes('--reset-breaker'), 'argument-hint must include --reset-breaker');

  assert.doesNotMatch(
    source,
    /`\/claude-tweaks:dispatch next`/,
    'no backtick-quoted `/claude-tweaks:dispatch next` reference should remain (row-7 carry pin)',
  );
});

test('work-record-permission-matrix.md: /backlog refine row Adds parked and Removes needs:decision', () => {
  const source = read(SHARED_DIR, 'work-record-permission-matrix.md');
  const line = source.split('\n').find((l) => l.startsWith('| **`/backlog refine`**'));
  assert.ok(line, 'expected the /backlog refine matrix row');

  // Split the markdown table row into its data cells (Actor, Adds, Removes,
  // Never) so the `parked`/`needs:decision` pins are checked against the
  // specific column they belong in, not merely "somewhere on the line" —
  // discriminates against the pre-edit row, where neither string appeared in
  // its respective column.
  const cells = line.split('|').map((c) => c.trim()).filter((c) => c.length > 0);
  assert.strictEqual(cells.length, 4, `expected 4 data cells (Actor/Adds/Removes/Never), got ${cells.length}`);
  const [, adds, removes] = cells;

  assert.match(adds, /`parked`/, 'expected `parked` in the Adds column');
  assert.match(
    adds,
    /the `#N` park choice via `refine-record\.md`, human-confirmed/,
    'expected the parked-Adds rationale clause',
  );

  assert.match(removes, /`needs:decision`/, 'expected `needs:decision` in the Removes column');
  assert.match(
    removes,
    /the `#N` batch-apply, gated on zero unresolved `needs-decision:\*` comments per `_shared\/work-record\.md`'s resolution rule/,
    'expected the needs:decision-Removes rationale clause',
  );

  // Discriminate: `parked` must land in Adds, not Removes (Removes carries no
  // `parked` clause at all — this row's pre-edit Removes was just `ready`
  // (flag back), `bot:blocked` (re-grant strip)). `needs:decision` itself
  // already legitimately appears in Adds pre-edit (a distinct, older clause
  // about grant-check refusal) — so the discriminator for the carried edit
  // is the Removes-specific rationale clause itself, which only this edit
  // could have introduced and which must not also appear in Adds.
  assert.doesNotMatch(removes, /`parked`/, '`parked` belongs in Adds, not Removes');
  assert.doesNotMatch(
    adds,
    /the `#N` batch-apply, gated on zero unresolved `needs-decision:\*` comments/,
    'the Removes-specific needs:decision rationale must not also appear in Adds',
  );
});
