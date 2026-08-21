'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync: realExecFileSync } = require('node:child_process');
const { renderVerifyTable, runVerify, registerCheck } = require('../../../plugin/bin/lib/wrap-up/engine-verify');
const { gitRepo } = require('../../helpers/git-fixtures');

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

test('runVerify with zero registered checks returns exitCode 0 and empty rows', () => {
  const result = runVerify({ runDir: '/tmp/does-not-matter', base: 'main', deps: {} });
  assert.strictEqual(result.exitCode, 0);
  assert.deepStrictEqual(result.rows, []);
});

test('runVerify short-circuits to an all-unknown row set when runDir is null, never invoking check fns', () => {
  // Throwaway check scoped to this one test — name chosen so it can't collide
  // with a real check name Tasks 2-6 register ('plans-ledger', etc). Its fn
  // throws if called, proving the null-runDir guard short-circuits before
  // reaching any registered check function. This registration is cumulative
  // within this process for the remainder of the file's test run (module-
  // level CHECKS array), so any later row-count assertion in this file must
  // account for this one extra row.
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
test('wrap-up-engine.js verify exits 0 with zero registered checks', () => {
  const cliPath = path.join(__dirname, '../../../plugin/bin/wrap-up-engine.js');
  const repo = gitRepo();
  const runDir = fs.mkdtempSync(path.join(repo, 'verify-rundir-'));
  const out = realExecFileSync('node', [cliPath, 'verify', '--run-dir', runDir, '--base', 'main'], {
    encoding: 'utf8', cwd: repo,
  });
  assert.match(out, /\| Check \| Result \| Detail \|/);
});
