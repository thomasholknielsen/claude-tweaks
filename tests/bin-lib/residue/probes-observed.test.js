const { test } = require('node:test');
const assert = require('node:assert');
const { probeSuite } = require('../../../plugin/bin/lib/residue/probes/suite');
const { probeRelease } = require('../../../plugin/bin/lib/residue/probes/release');

const SCOPE = { ran: true, reason: null, base: 'a1b2c3d', headBranch: 'worktree-feat', branches: [], worktrees: [] };

test('a failing suite is reported as blast-radius residue', () => {
  const { findings, ran } = probeSuite({ scope: SCOPE, run: () => ({ code: 1, stdout: '# fail 1\nnot ok 3 - heading unique' }) });
  assert.strictEqual(ran, true);
  assert.strictEqual(findings[0].kind, 'suite');
  assert.strictEqual(findings[0].scope, 'blast-radius', 'a red suite at close time is this run\'s own concern regardless of who caused it');
});

test('a passing suite produces no findings', () => {
  assert.deepStrictEqual(probeSuite({ scope: SCOPE, run: () => ({ code: 0, stdout: '# pass 8' }) }).findings, []);
});

test('an unrunnable suite does not run, rather than reporting green', () => {
  const r = probeSuite({ scope: SCOPE, run: () => null });
  assert.strictEqual(r.ran, false);
  assert.deepStrictEqual(r.findings, []);
  assert.match(r.reason, /could not run/);
});

test('a timed-out suite does not run, rather than reporting green', () => {
  const r = probeSuite({ scope: SCOPE, run: () => ({ code: null, stdout: '', timedOut: true }) });
  assert.strictEqual(r.ran, false);
  assert.match(r.reason, /timed out/);
});

test('the release probe is inert outside claude-tweaks', () => {
  const r = probeRelease({ scope: SCOPE, manifest: { name: 'some-other-plugin', version: '1.0.0' }, run: () => null });
  assert.strictEqual(r.ran, false);
  assert.match(r.reason, /not applicable/);
});

test('a version missing from the changelog is reported', () => {
  const run = (argv) => (argv.join(' ').includes('CHANGELOG.md') ? '# Changelog\n\n## v6.64.0 — old\n' : '6.64.0\t2026-08-08\trelease\n');
  const { findings } = probeRelease({ scope: SCOPE, manifest: { name: 'claude-tweaks', version: '6.68.1' }, run });
  assert.ok(findings.some((f) => f.evidence.includes('CHANGELOG.md')), 'the missing changelog entry must be named');
});

test('a version missing from the shipped record is reported', () => {
  const run = (argv) => (argv.join(' ').includes('CHANGELOG.md') ? '# Changelog\n\n## v6.68.1 — new\n' : '6.64.0\t2026-08-08\trelease\n');
  const { findings } = probeRelease({ scope: SCOPE, manifest: { name: 'claude-tweaks', version: '6.68.1' }, run });
  assert.ok(findings.some((f) => f.evidence.includes('shipped-versions.tsv')), 'the missing shipped line must be named');
});

test('a complete release triple produces no findings', () => {
  const run = (argv) => (argv.join(' ').includes('CHANGELOG.md') ? '# Changelog\n\n## v6.68.1 — new\n' : '6.68.1\t2026-08-08\trelease\n');
  const { findings } = probeRelease({ scope: SCOPE, manifest: { name: 'claude-tweaks', version: '6.68.1' }, run });
  assert.deepStrictEqual(findings, []);
});
