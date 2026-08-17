const { test } = require('node:test');
const assert = require('node:assert');
const { probeForge } = require('../../../plugin/bin/lib/residue/probes/forge');

function stubRunner(responses) {
  return (argv) => (Object.prototype.hasOwnProperty.call(responses, argv.join(' ')) ? responses[argv.join(' ')] : null);
}

const SCOPE = { ran: true, reason: null, base: 'a1b2c3d', headBranch: 'worktree-feat', branches: [], worktrees: [] };
const PR_LIST = 'gh pr list --state open --json number,title,headRefName --limit 100';
const PRS = JSON.stringify([
  { number: 182, title: 'Read Key Files', headRefName: 'worktree-fix-154' },
  { number: 198, title: 'Reaping', headRefName: 'worktree-feat' },
]);

test('an open PR for this work is reported', () => {
  const { findings } = probeForge({ scope: SCOPE, run: stubRunner({ [PR_LIST]: PRS }) });
  assert.ok(findings.some((f) => f.subject === 'PR #198'), 'the PR for HEAD branch is this work');
});

test('an open PR for another lane is reported but not auto-remediable', () => {
  const { findings } = probeForge({ scope: SCOPE, run: stubRunner({ [PR_LIST]: PRS }) });
  const other = findings.find((f) => f.subject === 'PR #182');
  assert.strictEqual(other.remedy, 'record', 'residue must not act on another lane PR');
  assert.strictEqual(other.scope, 'observed');
});

test('the PR list call caps at 100, matching this repo\'s other gh pr list call sites', () => {
  // gh's implicit default is 30 and truncates silently (`_shared/github-pr-scan.md`).
  let capturedArgv = null;
  const run = (argv) => {
    capturedArgv = argv;
    return PRS;
  };
  probeForge({ scope: SCOPE, run });
  assert.deepStrictEqual(capturedArgv, ['gh', 'pr', 'list', '--state', 'open', '--json', 'number,title,headRefName', '--limit', '100']);
});

test('a missing gh does not run, rather than reporting a clean forge', () => {
  const r = probeForge({ scope: SCOPE, run: stubRunner({}) });
  assert.strictEqual(r.ran, false);
  assert.deepStrictEqual(r.findings, []);
  assert.match(r.reason, /gh/);
});

test('unparseable gh output does not run, rather than throwing', () => {
  const r = probeForge({ scope: SCOPE, run: stubRunner({ [PR_LIST]: 'not json' }) });
  assert.strictEqual(r.ran, false);
  assert.match(r.reason, /could not parse/);
});
