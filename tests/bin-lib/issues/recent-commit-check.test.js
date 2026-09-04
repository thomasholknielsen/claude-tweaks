'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const {
  findRecentCommitOverlap, deriveKeyTerms, DEFAULT_LOOKBACK_DAYS, DEFAULT_MIN_TERM_MATCHES,
} = require('../../../plugin/bin/lib/issues/recent-commit-check');

// A fake git-log runner: asserts the argv shape, returns a %x1f-delimited
// log formatted exactly like the module's own --format string.
function fakeGitLog(lines, { expectFiles } = {}) {
  return (cmd, args) => {
    assert.strictEqual(cmd, 'git');
    assert.strictEqual(args[0], '-C');
    assert.strictEqual(args[2], 'log');
    assert.ok(args.some((a) => a.startsWith('--since=')));
    assert.ok(args.includes('--no-merges'));
    if (expectFiles) {
      const dashIdx = args.indexOf('--');
      assert.notStrictEqual(dashIdx, -1, 'expected a -- path separator');
      assert.deepStrictEqual(args.slice(dashIdx + 1), expectFiles);
    } else {
      assert.strictEqual(args.includes('--'), false);
    }
    return lines.map((l) => `${l.sha}\x1f${l.subject}\x1f${l.date}`).join('\n') + (lines.length ? '\n' : '');
  };
}

test('deriveKeyTerms lowercases, strips punctuation, drops short words and stopwords', () => {
  const terms = deriveKeyTerms("materialize.js's `--run-dir` anchoring check refuses a genuinely-new write");
  assert.ok(terms.includes('materialize'));
  assert.ok(terms.includes('anchoring'));
  assert.ok(terms.includes('refuses'));
  assert.ok(terms.includes('genuinely-new')); // hyphenated compounds stay intact (more specific, fewer false positives)
  assert.ok(!terms.includes('this'));
  assert.ok(!terms.includes('a')); // too short
});

test('deriveKeyTerms returns [] for empty/non-string input', () => {
  assert.deepStrictEqual(deriveKeyTerms(''), []);
  assert.deepStrictEqual(deriveKeyTerms(undefined), []);
});

test('findRecentCommitOverlap returns null when no terms can be derived', () => {
  const execImpl = () => { throw new Error('must not be called'); };
  assert.strictEqual(findRecentCommitOverlap({ root: '/r', title: 'a to is' }, execImpl), null);
});

test('findRecentCommitOverlap returns null when git throws (no repo, no git)', () => {
  const execImpl = () => { throw new Error('not a git repository'); };
  assert.strictEqual(
    findRecentCommitOverlap({ root: '/r', title: 'materialize run-dir anchoring guard' }, execImpl),
    null,
  );
});

test('findRecentCommitOverlap returns null when no commit subject clears the term threshold', () => {
  const execImpl = fakeGitLog([
    { sha: 'aaa1111', subject: 'unrelated typo fix in readme', date: '2026-08-20T10:00:00Z' },
  ]);
  const result = findRecentCommitOverlap(
    { root: '/r', title: 'materialize run-dir anchoring guard refuses worktree write' },
    execImpl,
  );
  assert.strictEqual(result, null);
});

test('findRecentCommitOverlap (unscoped) requires DEFAULT_MIN_TERM_MATCHES distinct terms in a subject', () => {
  const execImpl = fakeGitLog([
    // only one overlapping term ("anchoring") — below the default threshold of 2
    { sha: 'bbb2222', subject: 'fix anchoring elsewhere', date: '2026-08-20T10:00:00Z' },
  ]);
  const result = findRecentCommitOverlap(
    { root: '/r', title: 'materialize run-dir anchoring guard refuses worktree write' },
    execImpl,
  );
  assert.strictEqual(result, null);
});

test('findRecentCommitOverlap (unscoped) matches when >= 2 terms overlap the commit subject', () => {
  const execImpl = fakeGitLog([
    { sha: 'ccc3333', subject: 'Fix materialize.js run-dir anchoring guard (refs #959)', date: '2026-08-21T06:55:00Z' },
  ]);
  const result = findRecentCommitOverlap(
    { root: '/r', title: 'materialize run-dir anchoring guard refuses worktree write' },
    execImpl,
  );
  assert.notStrictEqual(result, null);
  assert.strictEqual(result.lookbackDays, DEFAULT_LOOKBACK_DAYS);
  assert.strictEqual(result.fileScoped, false);
  assert.strictEqual(result.commits.length, 1);
  assert.strictEqual(result.commits[0].sha, 'ccc3333');
  assert.ok(result.commits[0].matchedTerms.length >= DEFAULT_MIN_TERM_MATCHES);
});

test('findRecentCommitOverlap (file-scoped) matches on a single overlapping term once files narrow the log', () => {
  const execImpl = fakeGitLog(
    [{ sha: 'ddd4444', subject: 'Fix anchoring bug (refs #959)', date: '2026-08-21T06:55:00Z' }],
    { expectFiles: ['bin/materialize.js'] },
  );
  const result = findRecentCommitOverlap(
    { root: '/r', title: 'materialize anchoring regression', files: ['bin/materialize.js'] },
    execImpl,
  );
  assert.notStrictEqual(result, null);
  assert.strictEqual(result.fileScoped, true);
  assert.strictEqual(result.commits[0].sha, 'ddd4444');
});

test('findRecentCommitOverlap sorts strong matches newest-first', () => {
  const execImpl = fakeGitLog([
    { sha: 'older111', subject: 'materialize anchoring guard tweak', date: '2026-08-10T00:00:00Z' },
    { sha: 'newer222', subject: 'materialize anchoring guard rewrite', date: '2026-08-22T00:00:00Z' },
  ]);
  const result = findRecentCommitOverlap(
    { root: '/r', title: 'materialize anchoring guard' },
    execImpl,
  );
  assert.deepStrictEqual(result.commits.map((c) => c.sha), ['newer222', 'older111']);
});

test('findRecentCommitOverlap accepts explicit terms instead of deriving from title', () => {
  const execImpl = fakeGitLog([
    { sha: 'eee5555', subject: 'shadow guard worktree-relative write fix', date: '2026-08-21T00:00:00Z' },
  ]);
  const result = findRecentCommitOverlap(
    { root: '/r', terms: ['shadow', 'guard'] },
    execImpl,
  );
  assert.notStrictEqual(result, null);
  assert.strictEqual(result.commits[0].sha, 'eee5555');
});

test('findRecentCommitOverlap returns null on empty git log output', () => {
  const execImpl = fakeGitLog([]);
  const result = findRecentCommitOverlap(
    { root: '/r', title: 'materialize anchoring guard' },
    execImpl,
  );
  assert.strictEqual(result, null);
});

test('findRecentCommitOverlap ignores non-positive/non-finite lookbackDays and falls back to the default', () => {
  const execImpl = (cmd, args) => {
    assert.ok(args.includes(`--since=${DEFAULT_LOOKBACK_DAYS}.days`));
    return '';
  };
  findRecentCommitOverlap({ root: '/r', title: 'materialize anchoring guard', lookbackDays: -5 }, execImpl);
  findRecentCommitOverlap({ root: '/r', title: 'materialize anchoring guard', lookbackDays: NaN }, execImpl);
});

test('findRecentCommitOverlap defaults execImpl to child_process.execFileSync when not injected (real repo smoke test)', () => {
  // Proves the real default path runs against this checkout's own git log —
  // matches read-commit.test.js's convention for exercising the real seam.
  // Uses an unlikely-to-collide term set so this stays green regardless of
  // recent commit history content.
  const result = findRecentCommitOverlap({
    root: process.cwd(),
    terms: ['zzzzznonexistenttermzzzz', 'yyyyalsofakeyyyy'],
    lookbackDays: 3650,
  });
  assert.strictEqual(result, null);
});
