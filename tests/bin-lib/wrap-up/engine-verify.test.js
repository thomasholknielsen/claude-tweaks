'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync: realExecFileSync } = require('node:child_process');
const { renderVerifyTable, runVerify, registerCheck } = require('../../../plugin/bin/lib/wrap-up/engine-verify');
const { gitRepo } = require('../../helpers/git-fixtures');

function makeTmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('renderVerifyTable renders pass/fail bare and skip/unknown with folded detail', () => {
  const md = renderVerifyTable([
    { check: 'plans-ledger', result: 'pass', detail: '' },
    { check: 'worktree-removed', result: 'fail', detail: 'worktree still listed' },
    { check: 'memory-updates', result: 'skip', detail: 'nothing recorded' },
    { check: 'acceptance-labeling', result: 'unknown', detail: 'gh absent' },
  ]);
  assert.match(md, /\| plans-ledger \| pass \|/);
  assert.match(md, /\| worktree-removed \| fail \| worktree still listed \|/);
  assert.match(md, /\| memory-updates \| skip \(nothing recorded\) \|/);
  assert.match(md, /\| acceptance-labeling \| unknown \(gh absent\) \|/);
});

// Task 1's original version of this test asserted `rows` deepStrictEqual []
// on the premise that CHECKS was still empty at that point in the plan.
// Task 2 permanently registers real checks at module load (and Tasks 3-6
// register more), so "zero registered checks" is no longer a reachable state
// for this module in any test run — the assertion is rewritten to the
// structural invariant that survives every future check registration: one
// row per registered check, each with a valid result, and exitCode derived
// consistently from whether any row failed.
test('runVerify returns one row per registered check, each with a valid result', () => {
  const result = runVerify({ runDir: '/tmp/does-not-matter', base: 'main', deps: { git: () => '', gh: () => '' } });
  assert.ok(Array.isArray(result.rows));
  // At least the four checks Task 2 registers: plans-ledger, design-caches,
  // run-dir-archived, worktree-removed.
  assert.ok(result.rows.length >= 4);
  for (const row of result.rows) {
    assert.strictEqual(typeof row.check, 'string');
    assert.ok(['pass', 'fail', 'skip', 'unknown'].includes(row.result));
  }
  const expectedExit = result.rows.some((r) => r.result === 'fail') ? 3 : 0;
  assert.strictEqual(result.exitCode, expectedExit);
});

// The test above re-derives its expected exitCode from the same rows array
// runVerify just returned, so it can't distinguish a bug in the exitCode
// derivation from correct behavior. This test pins the literal value: force
// one check to fail and assert exitCode === 3 as a hardcoded constant, proving
// the derivation actually produces 3 for a real fail case.
test('runVerify sets exitCode 3 when any check fails (forced-fail probe)', () => {
  registerCheck('__test-exitcode-probe__', () => ({ result: 'fail', detail: 'forced' }));
  const runDir = makeTmpDir('verify-exitcode-probe-');
  const result = runVerify({ runDir, base: 'main', deps: { git: () => '', gh: () => '' } });
  assert.strictEqual(result.exitCode, 3);
});

test('plans-ledger check passes when no matching plan/ledger files remain', () => {
  const runDir = makeTmpDir('verify-plans-ledger-clean-');
  const result = runVerify({ runDir, base: 'main', deps: { git: () => '', gh: () => '' } });
  const row = result.rows.find((r) => r.check === 'plans-ledger');
  assert.strictEqual(row.result, 'pass');
});

test('plans-ledger check fails when a matching plan file still exists', () => {
  // A run-dir basename of 'spec-900' -- the plan file's slug must match it.
  const runDir = makeTmpDir('verify-plans-ledger-dirty-');
  const plansDir = path.join(process.cwd(), 'docs', 'superpowers', 'plans');
  fs.mkdirSync(plansDir, { recursive: true });
  const stray = path.join(plansDir, `2099-01-01-spec-900-leftover.md`);
  fs.writeFileSync(stray, '# stray');
  try {
    const result = runVerify({
      runDir: path.join(path.dirname(runDir), 'spec-900'),
      base: 'main', deps: { git: () => '', gh: () => '' },
    });
    const row = result.rows.find((r) => r.check === 'plans-ledger');
    assert.strictEqual(row.result, 'fail');
    assert.match(row.detail, /spec-900/);
  } finally {
    fs.rmSync(stray, { force: true });
  }
});

test('design-caches check skips when no *-audit.json/*-recommendations.json/*-declined.json remain', () => {
  const runDir = makeTmpDir('verify-design-caches-clean-');
  const result = runVerify({ runDir, base: 'main', deps: { git: () => '', gh: () => '' } });
  const row = result.rows.find((r) => r.check === 'design-caches');
  assert.strictEqual(row.result, 'pass');
});

test('run-dir-archived check fails when original path still exists', () => {
  const pipelinesDir = path.join(process.cwd(), '.claude-tweaks', 'pipelines');
  const runId = 'test-verify-archived-fail-900';
  const originalPath = path.join(pipelinesDir, runId);
  fs.mkdirSync(originalPath, { recursive: true });
  try {
    const result = runVerify({ runDir: originalPath, base: 'main', deps: { git: () => '', gh: () => '' } });
    const row = result.rows.find((r) => r.check === 'run-dir-archived');
    assert.strictEqual(row.result, 'fail');
  } finally {
    fs.rmSync(originalPath, { recursive: true, force: true });
  }
});

test('run-dir-archived check passes when original gone and archive exists with no work/ dir', () => {
  const runId = 'test-verify-archived-pass-900';
  const archivePath = path.join(process.cwd(), '.claude-tweaks', 'pipelines', 'archive', runId);
  fs.mkdirSync(archivePath, { recursive: true });
  try {
    const result = runVerify({
      runDir: path.join(process.cwd(), '.claude-tweaks', 'pipelines', runId),
      base: 'main', deps: { git: () => '', gh: () => '' },
    });
    const row = result.rows.find((r) => r.check === 'run-dir-archived');
    assert.strictEqual(row.result, 'pass');
  } finally {
    fs.rmSync(archivePath, { recursive: true, force: true });
  }
});

test('worktree-removed check fails when a matching worktree is still listed', () => {
  const fakeGit = (args) => {
    if (args[0] === 'worktree') {
      return 'worktree /repo/.claude/worktrees/flow-spec-900\nbranch refs/heads/worktree-flow-spec-900\n\n';
    }
    return '';
  };
  const result = runVerify({ runDir: '/tmp/2026-01-01T000000-spec-900', base: 'main', deps: { git: fakeGit, gh: () => '' } });
  const row = result.rows.find((r) => r.check === 'worktree-removed');
  assert.strictEqual(row.result, 'fail');
});

test('worktree-removed check passes when no matching worktree is listed', () => {
  const fakeGit = (args) => (args[0] === 'worktree' ? '' : '');
  const result = runVerify({ runDir: '/tmp/2026-01-01T000000-spec-900', base: 'main', deps: { git: fakeGit, gh: () => '' } });
  const row = result.rows.find((r) => r.check === 'worktree-removed');
  assert.strictEqual(row.result, 'pass');
});

function writeSpecFile(runDir, specId, record) {
  const workDir = path.join(runDir, 'work');
  fs.mkdirSync(workDir, { recursive: true });
  fs.writeFileSync(path.join(workDir, `${specId}-spec.md`), `---\nrecord: ${record}\n---\n# ${specId}: title\n`);
}

test('carrier-commit check passes when a Fixes #{n} commit exists in range for every resolved issue', () => {
  const runDir = makeTmpDir('verify-carrier-pass-');
  writeSpecFile(runDir, '900', 900);
  const fakeGit = (args) => {
    if (args[0] === 'log' && args.some((a) => a.includes('Fixes #900'))) return 'abc1234 Fix wrap-up verify verb\n';
    return '';
  };
  const result = runVerify({ runDir, base: 'main', deps: { git: fakeGit, gh: () => '' } });
  const row = result.rows.find((r) => r.check === 'carrier-commit');
  assert.strictEqual(row.result, 'pass');
});

test('carrier-commit check fails when no matching commit exists for a resolved issue', () => {
  const runDir = makeTmpDir('verify-carrier-fail-');
  writeSpecFile(runDir, '900', 900);
  const fakeGit = () => '';
  const result = runVerify({ runDir, base: 'main', deps: { git: fakeGit, gh: () => '' } });
  const row = result.rows.find((r) => r.check === 'carrier-commit');
  assert.strictEqual(row.result, 'fail');
  assert.match(row.detail, /900/);
});

test('carrier-commit check skips when no resolved issues found (conversation-based work)', () => {
  const runDir = makeTmpDir('verify-carrier-skip-');
  const result = runVerify({ runDir, base: 'main', deps: { git: () => '', gh: () => '' } });
  const row = result.rows.find((r) => r.check === 'carrier-commit');
  assert.strictEqual(row.result, 'skip');
});

test('reference-repairs check skips when engine-state.json has no applied references findings', () => {
  const runDir = makeTmpDir('verify-refrepair-skip-');
  fs.writeFileSync(path.join(runDir, 'engine-state.json'), JSON.stringify({ version: 1, results: {} }));
  const result = runVerify({ runDir, base: 'main', deps: { git: () => '', gh: () => '' } });
  const row = result.rows.find((r) => r.check === 'reference-repairs');
  assert.strictEqual(row.result, 'skip');
});

test('reference-repairs check fails when Initiative-Fix commit diff touches a file not in the applied set', () => {
  const runDir = makeTmpDir('verify-refrepair-fail-');
  fs.writeFileSync(path.join(runDir, 'engine-state.json'), JSON.stringify({
    version: 1,
    results: { references: { findings: [{ action: 'applied', kind: 'broken-link', summary: 'fix', targetPath: 'docs/a.md' }] } },
  }));
  const fakeGit = (args) => {
    if (args[0] === 'log' && args.includes('--grep=Initiative-Fix:')) return 'def5678 Initiative-Fix: repair refs\n';
    if (args[0] === 'diff-tree' && args.includes('--name-only')) return 'docs/a.md\ndocs/b.md\n';
    return '';
  };
  const result = runVerify({ runDir, base: 'main', deps: { git: fakeGit, gh: () => '' } });
  const row = result.rows.find((r) => r.check === 'reference-repairs');
  assert.strictEqual(row.result, 'fail');
  assert.match(row.detail, /docs\/b\.md/);
});

test('runVerify short-circuits to an all-unknown row set when runDir is null, never invoking check fns', () => {
  // Throwaway check scoped to this one test — name chosen so it can't collide
  // with a real check name Tasks 2-6 register ('plans-ledger', etc). Its fn
  // throws if called, proving the null-runDir guard short-circuits before
  // reaching any registered check function. This registration is cumulative
  // within this process for the remainder of the file's test run (module-
  // level CHECKS array), so this test is placed LAST among the tests that
  // call runVerify directly with a non-null runDir in this file — anything
  // after it would otherwise hit this permanently-throwing probe.
  registerCheck('__test-null-guard-probe__', () => {
    throw new Error('check fn must not be called when runDir is null');
  });

  const result = runVerify({ runDir: null, base: 'main', deps: {} });
  assert.strictEqual(result.exitCode, 0);
  const probeRow = result.rows.find((r) => r.check === '__test-null-guard-probe__');
  assert.deepStrictEqual(probeRow, {
    check: '__test-null-guard-probe__',
    result: 'unknown',
    detail: 'run dir not found at original or archive path',
  });
});

// #790/[IL-127]: wrap-up-engine.js's main() rejects any --run-dir that doesn't
// resolve under the main checkout (bin/lib/hooks/worktree-detect.js's
// isAnchoredUnderRoot) for EVERY verb, including this new `verify` one — a
// bare os.tmpdir() path like /tmp/anything never anchors, so this test uses a
// real git-fixture repo (same builder as tests/wrap-up-engine-run-dir-anchoring.test.js)
// as both cwd and the --run-dir's ancestor, matching engine-cli.test.js's
// makeRunDir() convention, so the CLI actually reaches runVerifyVerb rather
// than failing the anchoring gate first.
//
// This test spawns a fresh subprocess, so it is immune to the null-guard
// probe registered above (module state does not cross process boundaries).
// It only asserts the CLI's plumbing (table header renders); it does not
// assert exitCode 0, because real checks run here against a synthetic,
// non-pipeline run dir — e.g. 'run-dir-archived' legitimately fails (the
// fixture dir isn't under .claude-tweaks/pipelines/), which is exitCode 3 by
// design, not a bug. realExecFileSync throws on a non-zero exit, so the
// invocation is wrapped to recover stdout from the thrown error either way.
test('wrap-up-engine.js verify prints a check table for a real, anchored run dir', () => {
  const cliPath = path.join(__dirname, '../../../plugin/bin/wrap-up-engine.js');
  const repo = gitRepo();
  const runDir = fs.mkdtempSync(path.join(repo, 'verify-rundir-'));
  let out;
  try {
    out = realExecFileSync('node', [cliPath, 'verify', '--run-dir', runDir, '--base', 'main'], {
      encoding: 'utf8', cwd: repo,
    });
  } catch (err) {
    out = err.stdout;
  }
  assert.match(out, /\| Check \| Result \| Detail \|/);
});
