// tests/wrap-up-engine-journey-crlf.test.js
//
// #1787: parseJourneyFilesList (bin/wrap-up-engine.js) split journey
// frontmatter on `\n` only. A journey file with CRLF (`\r\n`) line endings
// left each `- path` line carrying a trailing `\r` that the item regex
// (`/^\s*-\s+(.+)$/`, no `m` flag, `.` excludes `\r`) could never consume —
// the very first `- path` line failed to match, the parse loop broke
// immediately, and the whole `files:` list silently resolved to `[]`. Net
// effect: a CRLF-encoded journey dropped out of `/claude-tweaks:wrap-up`
// Phase 2's Journeys-row candidate-overlap scan even when its own `files:`
// frontmatter named a file the diff actually touched.
//
// These are CLI-level (subprocess) tests, not unit tests against
// `parseJourneyFilesList` directly: that function (and `buildJourneyFrontmatter`)
// live in bin/wrap-up-engine.js, which runs its CLI unconditionally at load
// time (no `require.main` guard) rather than exporting anything importable —
// the same reason tests/wrap-up-engine-run-dir-anchoring.test.js already
// drives this file via `plan` subprocess invocations instead of a direct
// require.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { gitRepo, fixtureGit } = require('./helpers/git-fixtures');

const ENGINE_JS = path.join(__dirname, '..', 'plugin', 'bin', 'wrap-up-engine.js');

function runPlan(args, cwd) {
  try {
    const stdout = execFileSync('node', [ENGINE_JS, 'plan', ...args], { cwd, timeout: 15000 });
    return { code: 0, stdout: stdout.toString('utf8'), stderr: '' };
  } catch (e) {
    return {
      code: typeof e.status === 'number' ? e.status : 1,
      stdout: e.stdout ? e.stdout.toString('utf8') : '',
      stderr: e.stderr ? e.stderr.toString('utf8') : '',
    };
  }
}

// Writes the journey file with the exact requested line-ending style and
// commits it alongside the named changed file, returning the pre-change
// base sha `plan --base` should diff against.
function setupJourneyFixture(main, { journeyEol }) {
  const base = fixtureGit(['-C', main, 'rev-parse', 'HEAD']).toString('utf8').trim();

  fs.mkdirSync(path.join(main, 'docs', 'journeys'), { recursive: true });
  fs.mkdirSync(path.join(main, 'src'), { recursive: true });

  const lines = [
    '---',
    'files:',
    '  - src/changed.js',
    '---',
    '# A journey',
    '',
  ];
  const content = lines.join(journeyEol === 'crlf' ? '\r\n' : '\n');
  fs.writeFileSync(path.join(main, 'docs', 'journeys', 'my-journey.md'), content);
  fs.writeFileSync(path.join(main, 'src', 'changed.js'), 'module.exports = 1;\n');

  fixtureGit(['-C', main, 'add', '-A']);
  fixtureGit(['-C', main, 'commit', '-q', '-m', 'add CRLF journey + changed file']);

  return base;
}

test('#1787 a CRLF-encoded journey file still contributes its files: list to the Journeys candidate scan', () => {
  const main = gitRepo();
  const base = setupJourneyFixture(main, { journeyEol: 'crlf' });
  const runDir = path.join(main, '.claude-tweaks', 'pipelines', 'test-run-crlf');

  const out = runPlan(['--run-dir', runDir, '--base', base], main);
  assert.strictEqual(out.code, 0, `plan exited ${out.code}: ${out.stderr}`);

  const worklist = JSON.parse(out.stdout);
  const journeysRow = worklist.rows.find((r) => r.id === 'journeys');
  assert.ok(journeysRow, 'worklist must carry a journeys row');
  assert.deepStrictEqual(
    journeysRow.scope.candidates,
    ['docs/journeys/my-journey.md'],
    'the CRLF journey must be recognized as overlapping the changed file its own files: list names',
  );
});

test('an LF-encoded journey file continues to parse identically (no regression)', () => {
  const main = gitRepo();
  const base = setupJourneyFixture(main, { journeyEol: 'lf' });
  const runDir = path.join(main, '.claude-tweaks', 'pipelines', 'test-run-lf');

  const out = runPlan(['--run-dir', runDir, '--base', base], main);
  assert.strictEqual(out.code, 0, `plan exited ${out.code}: ${out.stderr}`);

  const worklist = JSON.parse(out.stdout);
  const journeysRow = worklist.rows.find((r) => r.id === 'journeys');
  assert.ok(journeysRow, 'worklist must carry a journeys row');
  assert.deepStrictEqual(
    journeysRow.scope.candidates,
    ['docs/journeys/my-journey.md'],
    'an ordinary LF journey must still be recognized as overlapping',
  );
});
