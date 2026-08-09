'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  riskBand, trustRows, MIN_SAMPLES, MIN_VERDICTS, discoverClosingCommits, isClosingCommitReverted,
  resolveOperationalOutcome, DEFAULT_REVERT_WINDOW_DAYS,
} = require('../trust.js');

test('riskBand splits low from everything else', () => {
  assert.equal(riskBand(['risk:low']), 'low');
  assert.equal(riskBand(['risk:medium']), 'elevated');
  assert.equal(riskBand(['risk:high']), 'elevated');
});

test('an unscored record is elevated, never low', () => {
  // Absence of a score is not evidence of safety.
  assert.equal(riskBand([]), 'elevated');
  assert.equal(riskBand(undefined), 'elevated');
});

test('conflicting risk labels resolve to elevated, not low', () => {
  // Conflicting evidence gets the same conservative default as absent evidence.
  assert.equal(riskBand(['risk:low', 'risk:high']), 'elevated');
  assert.equal(riskBand(['risk:high', 'risk:low']), 'elevated');
});

test('rows key on provenance and band together', () => {
  const rows = trustRows([
    { number: 1, labels: ['by:capture', 'risk:low', 'demo:approved'], body: '', state: 'CLOSED' },
    { number: 2, labels: ['by:capture', 'risk:high', 'demo:approved'], body: '', state: 'CLOSED' },
  ]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.key).sort(), ['producer:capture|elevated', 'producer:capture|low']);
});

test('approved and changes-requested are tallied separately', () => {
  const rows = trustRows([
    { number: 1, labels: ['by:capture', 'risk:low', 'demo:approved'], body: '', state: 'CLOSED' },
    { number: 2, labels: ['by:capture', 'risk:low', 'demo:changes-requested'], body: '', state: 'CLOSED' },
  ]);
  assert.equal(rows[0].approved, 1);
  assert.equal(rows[0].changesRequested, 1);
});

test('an undispositioned record counts as unknown, never as success', () => {
  const rows = trustRows([
    { number: 1, labels: ['by:capture', 'risk:low'], body: '', state: 'CLOSED' },
  ]);
  assert.equal(rows[0].undispositioned, 1);
  assert.equal(rows[0].approved, 0);
  assert.equal(rows[0].verdict, 'insufficient-evidence');
});

test('a cell with many records but no verdicts is still insufficient evidence', () => {
  const many = Array.from({ length: MIN_SAMPLES + 10 }, (_, i) => ({
    number: i + 1, labels: ['by:capture', 'risk:low'], body: '', state: 'CLOSED',
  }));
  const rows = trustRows(many);
  assert.equal(rows[0].total, MIN_SAMPLES + 10);
  assert.equal(rows[0].verdict, 'insufficient-evidence');
});

test('a follow-up record counts against the record it names', () => {
  const rows = trustRows([
    { number: 7, labels: ['by:capture', 'risk:low', 'demo:approved'], body: '', state: 'CLOSED' },
    { number: 8, labels: [], body: 'Origin: demo changes-requested from #7', state: 'OPEN' },
  ]);
  const capture = rows.find((r) => r.key === 'producer:capture|low');
  assert.equal(capture.followUps, 1);
});

test('a follow-up record still counts despite trailing punctuation after #N', () => {
  for (const suffix of ['.', ',', ')']) {
    const rows = trustRows([
      { number: 7, labels: ['by:capture', 'risk:low', 'demo:approved'], body: '', state: 'CLOSED' },
      { number: 8, labels: [], body: `Origin: demo changes-requested from #7${suffix}`, state: 'OPEN' },
    ]);
    const capture = rows.find((r) => r.key === 'producer:capture|low');
    assert.equal(capture.followUps, 1, `suffix ${JSON.stringify(suffix)} should still count`);
  }
});

test('a follow-up reference to #71 counts against #71, not #7', () => {
  const rows = trustRows([
    { number: 7, labels: ['by:capture', 'risk:low', 'demo:approved'], body: '', state: 'CLOSED' },
    { number: 71, labels: ['by:docs-health', 'risk:low', 'demo:approved'], body: '', state: 'CLOSED' },
    { number: 8, labels: [], body: 'Origin: demo changes-requested from #71', state: 'OPEN' },
  ]);
  const capture = rows.find((r) => r.key === 'producer:capture|low');
  const docsHealth = rows.find((r) => r.key === 'producer:docs-health|low');
  assert.equal(capture.followUps, 0);
  assert.equal(docsHealth.followUps, 1);
});

test('only corrective Origin markers count as follow-ups', () => {
  // The Follow-ups column means "this work generated corrective work". Of the
  // three `... from #N` markers emitted today, only changes-requested is that.
  const cases = [
    ['demo changes-requested', 1],
    ['demo scope-fork', 0],
    ['wrap-up leftover', 0],
  ];
  for (const [context, expected] of cases) {
    const rows = trustRows([
      { number: 7, labels: ['by:capture', 'risk:low', 'demo:approved'], body: '', state: 'CLOSED' },
      { number: 8, labels: [], body: `Origin: ${context} from #7`, state: 'OPEN' },
    ]);
    const capture = rows.find((r) => r.key === 'producer:capture|low');
    assert.equal(capture.followUps, expected, `"${context}" should contribute ${expected}`);
  }
});

test('a scope-fork alone leaves a cell clean; a changes-requested does not', () => {
  // The verdict consequence of the rule above: one miscounted scope-fork is
  // enough to force a whole cell from 'clean' to 'mixed'.
  const closed = Array.from({ length: MIN_SAMPLES }, (_, i) => ({
    number: i + 1, labels: ['by:capture', 'risk:low', 'demo:approved'], body: '', state: 'CLOSED',
  }));
  const scopeFork = trustRows([
    ...closed,
    { number: 100, labels: [], body: 'Origin: demo scope-fork from #1', state: 'OPEN' },
  ]);
  assert.equal(scopeFork[0].verdict, 'clean');

  const changesRequested = trustRows([
    ...closed,
    { number: 100, labels: [], body: 'Origin: demo changes-requested from #1', state: 'OPEN' },
  ]);
  assert.equal(changesRequested[0].verdict, 'mixed');
});

test('an unrecognized "from #N" context still counts as a follow-up', () => {
  // Denylist, not allowlist: undercounting follow-ups flips a cell from
  // 'mixed' to 'clean', so an unknown marker is treated as corrective.
  const rows = trustRows([
    { number: 7, labels: ['by:capture', 'risk:low', 'demo:approved'], body: '', state: 'CLOSED' },
    { number: 8, labels: [], body: 'Origin: some future corrective flow from #7', state: 'OPEN' },
  ]);
  assert.equal(rows.find((r) => r.key === 'producer:capture|low').followUps, 1);
});

test('the unstructured cell is ungradable at any sample count', () => {
  // A bucket defined by "these records could not be classified" has no
  // coherent class to earn trust for. Well past MIN_SAMPLES, fully
  // dispositioned, and clean on every negative signal — still ungradable.
  const overlong = 'Origin: ' + 'x'.repeat(80);
  const many = Array.from({ length: MIN_SAMPLES + 4 }, (_, i) => ({
    number: i + 1, labels: ['risk:low', 'demo:approved'], body: overlong, state: 'CLOSED',
  }));
  const rows = trustRows(many);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].provenance, 'unstructured:unstructured');
  assert.equal(rows[0].total, MIN_SAMPLES + 4);
  assert.equal(rows[0].approved, MIN_SAMPLES + 4);
  assert.equal(rows[0].changesRequested, 0);
  assert.equal(rows[0].followUps, 0);
  assert.equal(rows[0].notPlanned, 0);
  assert.equal(rows[0].verdict, 'insufficient-evidence');
});

test('an identically-shaped classified cell does grade — the pin is the kind, not the shape', () => {
  // Control for the test above: same counts, same signals, real provenance.
  // Without this, "insufficient-evidence" could be coming from anything.
  const many = Array.from({ length: MIN_SAMPLES + 4 }, (_, i) => ({
    number: i + 1, labels: ['by:capture', 'risk:low', 'demo:approved'], body: '', state: 'CLOSED',
  }));
  assert.equal(trustRows(many)[0].verdict, 'clean');
});

test('the empty-origin cell is ungradable too — same kind, same pin', () => {
  const many = Array.from({ length: MIN_SAMPLES + 4 }, (_, i) => ({
    number: i + 1, labels: ['risk:low', 'demo:approved'], body: 'Origin: .', state: 'CLOSED',
  }));
  const rows = trustRows(many);
  assert.equal(rows[0].provenance, 'unstructured:empty-origin');
  assert.equal(rows[0].verdict, 'insufficient-evidence');
});

test('NOT_PLANNED is tallied as its own negative-ish signal', () => {
  const rows = trustRows([
    { number: 1, labels: ['by:capture', 'risk:low'], body: '', state: 'CLOSED', stateReason: 'NOT_PLANNED' },
  ]);
  assert.equal(rows[0].notPlanned, 1);
});

test('open records are excluded — trust is about outcomes', () => {
  const rows = trustRows([
    { number: 1, labels: ['by:capture', 'risk:low'], body: '', state: 'OPEN' },
  ]);
  assert.equal(rows.length, 0);
});

test('parent-linked leaves do not count toward a cell reaching MIN_SAMPLES', () => {
  // Seven un-dispositioned leaves plus one approved parent must not grade a cell
  // `clean` — the leaves were never judged, and total is what makes 8 mean 8.
  const leaves = Array.from({ length: 7 }, (_, i) => ({
    number: i + 1, state: 'CLOSED', labels: [], body: '', hasParent: true,
  }));
  const parent = { number: 99, state: 'CLOSED', labels: ['demo:approved'], body: '' };
  const rows = trustRows([...leaves, parent]);
  assert.equal(rows.every((r) => r.total < MIN_SAMPLES), true);
  assert.equal(rows.every((r) => r.verdict === 'insufficient-evidence'), true);
});

test('rows are returned in a stable order', () => {
  const input = [
    { number: 1, labels: ['by:docs-health', 'risk:low'], body: '', state: 'CLOSED' },
    { number: 2, labels: ['by:capture', 'risk:low'], body: '', state: 'CLOSED' },
  ];
  assert.deepEqual(trustRows(input).map((r) => r.key), trustRows(input.reverse()).map((r) => r.key));
});

test('one verdict cannot grade a class of forty', () => {
  // The shipped rule was `dispositioned >= 1`. Measured against this repo, that
  // let a single approval grade a 40-record cell 'clean' — 1 known, 39 unknown.
  // Harmless while the table only rendered; a live grant once a governor reads it.
  const records = Array.from({ length: 40 }, (_, i) => ({
    number: i + 1, labels: ['by:capture', 'risk:low'], body: '', state: 'CLOSED',
  }));
  records[0].labels = ['by:capture', 'risk:low', 'demo:approved'];
  const row = trustRows(records)[0];
  assert.equal(row.total, 40);
  assert.equal(row.dispositioned, 1);
  assert.equal(row.verdict, 'insufficient-evidence');
});

test('the verdict floor is MIN_VERDICTS, and it is a floor on verdicts not records', () => {
  const build = (approvals) => {
    const records = Array.from({ length: 40 }, (_, i) => ({
      number: i + 1, labels: ['by:capture', 'risk:low'], body: '', state: 'CLOSED',
    }));
    for (let i = 0; i < approvals; i += 1) {
      records[i].labels = ['by:capture', 'risk:low', 'demo:approved'];
    }
    return trustRows(records)[0];
  };
  assert.equal(build(MIN_VERDICTS - 1).verdict, 'insufficient-evidence');
  assert.equal(build(MIN_VERDICTS).verdict, 'clean');
});

test('sample floor and verdict floor are both required', () => {
  // MIN_VERDICTS verdicts in a cell too small to be a class yet: still ungraded.
  const records = Array.from({ length: MIN_VERDICTS }, (_, i) => ({
    number: i + 1, labels: ['by:capture', 'risk:low', 'demo:approved'], body: '', state: 'CLOSED',
  }));
  const row = trustRows(records)[0];
  assert.ok(row.total < MIN_SAMPLES, 'fixture must sit below the sample floor');
  assert.equal(row.dispositioned, MIN_VERDICTS);
  assert.equal(row.verdict, 'insufficient-evidence');
});

test('a declined record is not a quality failure and never blocks a verdict', () => {
  // NOT_PLANNED means the record was declined — no work product exists to judge.
  // Counting it as a negative made two of this repo's four real cells
  // permanently ungradable, since the table has no time window to age it out.
  const records = Array.from({ length: MIN_SAMPLES }, (_, i) => ({
    number: i + 1, labels: ['by:capture', 'risk:low', 'demo:approved'], body: '', state: 'CLOSED',
  }));
  records.push({
    number: 99, labels: ['by:capture', 'risk:low'], body: '',
    state: 'CLOSED', stateReason: 'NOT_PLANNED',
  });
  const row = trustRows(records)[0];
  assert.equal(row.notPlanned, 1, 'still counted and still rendered');
  assert.equal(row.verdict, 'clean', 'but not a verdict input');
});

test('changes-requested and follow-ups remain verdict inputs', () => {
  // Control for the test above: removing notPlanned from the clean test must not
  // remove the two signals that ARE about work quality.
  const base = () => Array.from({ length: MIN_SAMPLES }, (_, i) => ({
    number: i + 1, labels: ['by:capture', 'risk:low', 'demo:approved'], body: '', state: 'CLOSED',
  }));

  const rejected = base();
  rejected[0].labels = ['by:capture', 'risk:low', 'demo:changes-requested'];
  assert.equal(trustRows(rejected)[0].verdict, 'mixed');

  const followedUp = [...base(), { number: 100, labels: [], body: 'Origin: demo changes-requested from #1', state: 'OPEN' }];
  assert.equal(trustRows(followedUp)[0].verdict, 'mixed');
});

test('coverage is reported and is dispositioned over total', () => {
  const records = Array.from({ length: 10 }, (_, i) => ({
    number: i + 1, labels: ['by:capture', 'risk:low'], body: '', state: 'CLOSED',
  }));
  for (let i = 0; i < 5; i += 1) records[i].labels = ['by:capture', 'risk:low', 'demo:approved'];
  const row = trustRows(records)[0];
  assert.equal(row.dispositioned, 5);
  assert.equal(row.coverage, 0.5);
});

test('an unstructured cell stays ungradable however many verdicts it collects', () => {
  // Task 2 denies this kind independently; this asserts the pin still holds
  // after the floor change, so the two defenses stay genuinely independent.
  const overlong = 'Origin: ' + 'x'.repeat(80);
  const records = Array.from({ length: MIN_SAMPLES + MIN_VERDICTS }, (_, i) => ({
    number: i + 1, labels: ['risk:low', 'demo:approved'], body: overlong, state: 'CLOSED',
  }));
  const row = trustRows(records)[0];
  assert.equal(row.provenance, 'unstructured:unstructured');
  assert.ok(row.dispositioned >= MIN_VERDICTS);
  assert.equal(row.verdict, 'insufficient-evidence');
});

const MS_PER_DAY_FIXTURE = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-08-09T00:00:00Z');

function closedDaysAgo(days) {
  return new Date(NOW - days * MS_PER_DAY_FIXTURE).toISOString();
}

test('DEFAULT_REVERT_WINDOW_DAYS is 14', () => {
  assert.equal(DEFAULT_REVERT_WINDOW_DAYS, 14);
});

test('resolveOperationalOutcome is unknown for a currently-open record', () => {
  const record = { number: 1, state: 'OPEN', closedAt: closedDaysAgo(30) };
  assert.deepEqual(resolveOperationalOutcome(record, [], NOW, 14), { known: false });
});

test('resolveOperationalOutcome is unknown with no closedAt at all', () => {
  const record = { number: 1, state: 'CLOSED' };
  assert.deepEqual(resolveOperationalOutcome(record, [], NOW, 14), { known: false });
});

test('resolveOperationalOutcome counts a merge past the window with a discoverable, unreverted closing commit', () => {
  const record = { number: 1, state: 'CLOSED', closedAt: closedDaysAgo(15) };
  const gitLog = [{ sha: 'sha-1', message: 'refs #1' }];
  assert.deepEqual(
    resolveOperationalOutcome(record, gitLog, NOW, 14),
    { known: true, grade: 'good', source: 'operational' },
  );
});

test('the window boundary is inclusive at exactly the configured number of days', () => {
  const record = { number: 1, state: 'CLOSED', closedAt: closedDaysAgo(14) };
  const gitLog = [{ sha: 'sha-1', message: 'refs #1' }];
  assert.equal(resolveOperationalOutcome(record, gitLog, NOW, 14).known, true);
});

test('one day short of the window boundary does not count', () => {
  const record = { number: 1, state: 'CLOSED', closedAt: closedDaysAgo(13) };
  const gitLog = [{ sha: 'sha-1', message: 'refs #1' }];
  assert.equal(resolveOperationalOutcome(record, gitLog, NOW, 14).known, false);
});

test('resolveOperationalOutcome is unknown with no discoverable closing commit', () => {
  const record = { number: 1, state: 'CLOSED', closedAt: closedDaysAgo(30) };
  assert.deepEqual(resolveOperationalOutcome(record, [], NOW, 14), { known: false });
});

test('resolveOperationalOutcome is not-countable (unknown) when the closing commit was reverted', () => {
  const sha = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const record = { number: 1, state: 'CLOSED', closedAt: closedDaysAgo(30) };
  const gitLog = [
    { sha, message: 'refs #1' },
    { sha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', message: `This reverts commit ${sha}.` },
  ];
  assert.deepEqual(resolveOperationalOutcome(record, gitLog, NOW, 14), { known: false });
});

test('resolveOperationalOutcome respects a widened window passed in explicitly', () => {
  const record = { number: 1, state: 'CLOSED', closedAt: closedDaysAgo(15) };
  const gitLog = [{ sha: 'sha-1', message: 'refs #1' }];
  assert.equal(resolveOperationalOutcome(record, gitLog, NOW, 21).known, false, '15 days is short of a 21-day window');
});

test('discoverClosingCommits finds a commit via a word-bounded refs/closes/fixes scan', () => {
  const gitLog = [
    { sha: 'aaaa1111111111111111111111111111111111', message: 'Fix the thing\n\nrefs #42' },
    { sha: 'bbbb2222222222222222222222222222222222', message: 'unrelated commit' },
  ];
  assert.deepEqual(discoverClosingCommits({ number: 42 }, gitLog), ['aaaa1111111111111111111111111111111111']);
});

test('discoverClosingCommits recognizes closes and fixes, not just refs', () => {
  assert.deepEqual(discoverClosingCommits({ number: 7 }, [{ sha: 'sha-a', message: 'closes #7' }]), ['sha-a']);
  assert.deepEqual(discoverClosingCommits({ number: 7 }, [{ sha: 'sha-b', message: 'Fixes #7' }]), ['sha-b']);
});

test('discoverClosingCommits is word-bounded — #427 never matches record #42', () => {
  assert.deepEqual(discoverClosingCommits({ number: 42 }, [{ sha: 'sha-x', message: 'refs #427' }]), []);
});

test('discoverClosingCommits returns every commit that references the record, not just the first', () => {
  const gitLog = [
    { sha: 'sha-1', message: 'refs #9' },
    { sha: 'sha-2', message: 'unrelated' },
    { sha: 'sha-3', message: 'closes #9' },
  ];
  assert.deepEqual(discoverClosingCommits({ number: 9 }, gitLog), ['sha-1', 'sha-3']);
});

test('discoverClosingCommits returns [] when nothing references the record', () => {
  assert.deepEqual(discoverClosingCommits({ number: 1 }, [{ sha: 'sha-1', message: 'refs #999' }]), []);
});

test('discoverClosingCommits returns [] for an empty or missing git log', () => {
  assert.deepEqual(discoverClosingCommits({ number: 1 }, []), []);
  assert.deepEqual(discoverClosingCommits({ number: 1 }, undefined), []);
});

test('discoverClosingCommits prefers a caller-supplied timeline SHA over the git-log scan (route 1 over route 2)', () => {
  const gitLog = [{ sha: 'from-log', message: 'refs #5' }];
  const record = { number: 5, closingCommitShas: ['from-timeline'] };
  assert.deepEqual(discoverClosingCommits(record, gitLog), ['from-timeline']);
});

test('discoverClosingCommits ignores a closingCommitShas array of falsy/empty entries and falls through to route 2', () => {
  const gitLog = [{ sha: 'from-log', message: 'refs #5' }];
  const record = { number: 5, closingCommitShas: [null, ''] };
  assert.deepEqual(discoverClosingCommits(record, gitLog), ['from-log']);
});

test('isClosingCommitReverted detects a trailer naming the closing commit', () => {
  const sha = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const gitLog = [
    { sha, message: 'refs #1' },
    { sha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', message: `Revert "Fix the thing"\n\nThis reverts commit ${sha}.` },
  ];
  assert.equal(isClosingCommitReverted([sha], 1, gitLog), true);
});

test('isClosingCommitReverted falls back to a Revert-subject commit referencing the same record number', () => {
  // Squash/rebase rewrote the SHA, so the trailer no longer names anything in
  // this log — the subject-based fallback is what catches this (IL-45).
  const gitLog = [{ sha: 'revert-sha', message: 'Revert "Fix the thing"\n\nrefs #1' }];
  assert.equal(isClosingCommitReverted(['some-other-sha-not-in-any-trailer'], 1, gitLog), true);
});

test('isClosingCommitReverted is false when nothing reverts the closing commit', () => {
  assert.equal(isClosingCommitReverted(['sha-1'], 1, [{ sha: 'sha-1', message: 'refs #1' }]), false);
});

test('isClosingCommitReverted is all-or-nothing: one reverted commit among several disqualifies all', () => {
  const shaA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const shaB = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  const gitLog = [
    { sha: shaA, message: 'refs #2' },
    { sha: shaB, message: 'refs #2' },
    { sha: 'cccccccccccccccccccccccccccccccccccccccc', message: `This reverts commit ${shaA}.` },
  ];
  assert.equal(isClosingCommitReverted([shaA, shaB], 2, gitLog), true);
});

test('isClosingCommitReverted returns false for an empty closing-commit list', () => {
  assert.equal(isClosingCommitReverted([], 1, [{ sha: 'x', message: 'This reverts commit x.' }]), false);
});

test('a Revert-subject commit for a DIFFERENT record does not revert this one', () => {
  const gitLog = [{ sha: 'revert-sha', message: 'Revert "Something else"\n\nrefs #999' }];
  assert.equal(isClosingCommitReverted(['sha-1'], 1, gitLog), false);
});

test('isClosingCommitReverted returns false for an empty or missing git log', () => {
  assert.equal(isClosingCommitReverted(['sha-1'], 1, []), false);
  assert.equal(isClosingCommitReverted(['sha-1'], 1, undefined), false);
});
