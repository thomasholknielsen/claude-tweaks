'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync: realExecFileSync } = require('node:child_process');
const { renderVerifyTable, runVerify, registerCheck, resolvePrNumber } = require('../../../plugin/bin/lib/wrap-up/engine-verify');
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

// AC1/AC2 fixture-level integration tests (record #900, Task 7). These call
// runVerify() with a real run-dir and assert on the literal exitCode, so
// they are placed HERE -- immediately after the structural test above, and
// deliberately BEFORE 'runVerify sets exitCode 3 ... (forced-fail probe)'
// below -- rather than at the file's tail near __test-null-guard-probe__.
// That forced-fail probe permanently registers a check (via the module-level
// CHECKS array, which persists for this file's whole process) that always
// returns 'fail' with no input-dependent guard, so every runVerify() call
// with a non-null runDir anywhere later in this file's execution order would
// unconditionally report exitCode 3 -- these fixtures need a real,
// input-driven exitCode 0 for their "fixing it passes" / "no fail rows"
// assertions, so they must run before that contamination exists. Helper fns
// writeSpecFile/writeExpectations (defined further down this file) are
// ordinary function declarations, hence hoisted, and are callable here.
//
// The brief's own transcribed AC1/AC2 code (task-7-brief.md) writes
// verify-expectations.json without deferring run-dir-archival, using
// originalPath (under .claude-tweaks/pipelines/{runId}) directly as runDir.
// Read against the real, current 'run-dir-archived' check (Task 2, unchanged
// since): that check independently re-derives originalPath from
// path.basename(runDir) and fails whenever it still exists on disk -- which
// it does here, since these fixtures create it and never archive it. Left
// as transcribed, that would make 'run-dir-archived' ALSO fail in both
// fixtures, alongside 'worktree-removed' in AC1 and contradicting AC2's "no
// fail rows" premise. Both fixtures below add `deferred: ['run-dir-archival']`
// to verify-expectations.json (the same real deferred-set mechanism
// 'design-caches'/'worktree-removed' already use, per Task 5) so
// 'run-dir-archived' skips instead of failing -- letting each fixture
// isolate exactly the one check under test, per AC1/AC2's literal wording.
test('AC1: fixture run-dir with one unexecuted approved action exits 3 naming that check; fixing it exits 0', () => {
  const runId = 'test-ac1-fixture-900';
  const originalPath = path.join(process.cwd(), '.claude-tweaks', 'pipelines', runId);
  // Simulate: everything else clean (run-dir-archival deferred to the parent
  // console, so that check doesn't also fail here), but the worktree row was
  // never removed.
  fs.mkdirSync(originalPath, { recursive: true });
  writeExpectations(originalPath, { version: 1, memory: [], upstream: [], deferred: ['run-dir-archival'] });
  try {
    const fakeGitDirty = (args) => {
      if (args[0] === 'worktree') return `worktree /repo/.claude/worktrees/flow-${runId}\nbranch refs/heads/worktree-flow-${runId}\n\n`;
      return '';
    };
    const dirtyResult = runVerify({ runDir: originalPath, base: 'main', deps: { git: fakeGitDirty, gh: () => 'gh version 2.0.0' } });
    assert.strictEqual(dirtyResult.exitCode, 3);
    const failingRows = dirtyResult.rows.filter((r) => r.result === 'fail');
    assert.strictEqual(failingRows.length, 1, `expected exactly one failing check, got: ${failingRows.map((r) => r.check).join(', ')}`);
    assert.strictEqual(failingRows[0].check, 'worktree-removed');

    const fakeGitClean = () => '';
    const cleanResult = runVerify({ runDir: originalPath, base: 'main', deps: { git: fakeGitClean, gh: () => 'gh version 2.0.0' } });
    assert.strictEqual(cleanResult.exitCode, 0);
  } finally {
    fs.rmSync(originalPath, { recursive: true, force: true });
  }
});

test('AC2: gh absent renders acceptance-labeling unknown, exit code reflects only checks that ran', () => {
  const runId = 'test-ac2-fixture-900';
  const originalPath = path.join(process.cwd(), '.claude-tweaks', 'pipelines', runId);
  fs.mkdirSync(originalPath, { recursive: true });
  writeSpecFile(originalPath, '900', 900);
  writeExpectations(originalPath, { version: 1, memory: [], upstream: [], deferred: ['run-dir-archival'] });
  try {
    const throwingGh = () => { throw new Error('command not found: gh'); };
    const cleanGit = (args) => (args[0] === 'log' ? 'abc1234 fix\n' : '');
    const result = runVerify({ runDir: originalPath, base: 'main', deps: { git: cleanGit, gh: throwingGh } });
    const acceptanceRow = result.rows.find((r) => r.check === 'acceptance-labeling');
    assert.strictEqual(acceptanceRow.result, 'unknown');
    assert.match(acceptanceRow.detail, /gh absent/);
    // No 'fail' rows in this fixture -- exitCode reflects only what ran (0), unknown never blocks.
    const failingRows = result.rows.filter((r) => r.result === 'fail');
    assert.deepStrictEqual(failingRows, []);
    assert.strictEqual(result.exitCode, 0);
  } finally {
    fs.rmSync(originalPath, { recursive: true, force: true });
  }
});

// The 'runVerify returns one row per registered check' test further above
// (immediately before the AC1/AC2 fixtures) re-derives its expected exitCode
// from the same rows array runVerify just returned, so it can't distinguish
// a bug in the exitCode derivation from correct behavior. This test pins the
// literal value: force
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

test('acceptance-labeling check renders unknown (gh absent) when gh probe throws', () => {
  const runDir = makeTmpDir('verify-acceptance-ghabsent-');
  writeSpecFile(runDir, '900', 900);
  const throwingGh = () => { throw new Error('gh: command not found'); };
  const result = runVerify({ runDir, base: 'main', deps: { git: () => '', gh: throwingGh } });
  const row = result.rows.find((r) => r.check === 'acceptance-labeling');
  assert.strictEqual(row.result, 'unknown');
  assert.match(row.detail, /gh absent/);
});

test('acceptance-labeling check passes when demo:pending label and a brief comment both present', () => {
  const runDir = makeTmpDir('verify-acceptance-pass-');
  writeSpecFile(runDir, '900', 900);
  const fakeGh = (args) => {
    if (args[0] === '--version') return 'gh version 2.0.0';
    if (args.includes('parent')) return JSON.stringify({ parent: null });
    if (args.includes('labels')) return JSON.stringify({ labels: [{ name: 'demo:pending' }] });
    if (args.includes('comments')) return JSON.stringify({ comments: [{ body: '## Verification Brief\n### Confirmed\n' }] });
    return '';
  };
  const result = runVerify({ runDir, base: 'main', deps: { git: () => '', gh: fakeGh } });
  const row = result.rows.find((r) => r.check === 'acceptance-labeling');
  assert.strictEqual(row.result, 'pass');
});

test('acceptance-labeling check fails when demo:pending label missing', () => {
  const runDir = makeTmpDir('verify-acceptance-fail-');
  writeSpecFile(runDir, '900', 900);
  const fakeGh = (args) => {
    if (args[0] === '--version') return 'gh version 2.0.0';
    if (args.includes('parent')) return JSON.stringify({ parent: null });
    if (args.includes('labels')) return JSON.stringify({ labels: [] });
    return JSON.stringify({ comments: [] });
  };
  const result = runVerify({ runDir, base: 'main', deps: { git: () => '', gh: fakeGh } });
  const row = result.rows.find((r) => r.check === 'acceptance-labeling');
  assert.strictEqual(row.result, 'fail');
});

test('acceptance-labeling check skips when no resolved issues found', () => {
  const runDir = makeTmpDir('verify-acceptance-skip-');
  const fakeGh = (args) => (args[0] === '--version' ? 'gh version 2.0.0' : '');
  const result = runVerify({ runDir, base: 'main', deps: { git: () => '', gh: fakeGh } });
  const row = result.rows.find((r) => r.check === 'acceptance-labeling');
  assert.strictEqual(row.result, 'skip');
});

test('acceptance-labeling check redirects to a resolvable parent, never checking the sub-issue itself', () => {
  const runDir = makeTmpDir('verify-acceptance-parent-');
  writeSpecFile(runDir, '900', 900);
  const calls = [];
  const fakeGh = (args) => {
    calls.push(args);
    if (args[0] === '--version') return 'gh version 2.0.0';
    if (args.includes('parent')) return JSON.stringify({ parent: { number: 898 } });
    if (args.includes('labels')) return JSON.stringify({ labels: [{ name: 'demo:pending' }] });
    if (args.includes('comments')) return JSON.stringify({ comments: [{ body: '## Verification Brief\n### Confirmed\n' }] });
    return '';
  };
  const result = runVerify({ runDir, base: 'main', deps: { git: () => '', gh: fakeGh } });
  const row = result.rows.find((r) => r.check === 'acceptance-labeling');
  assert.strictEqual(row.result, 'pass');
  const labelCalls = calls.filter((a) => a.includes('labels'));
  assert.strictEqual(labelCalls.length, 1);
  assert.strictEqual(labelCalls[0][2], '898', 'the labels check must target the parent #898, not the sub-issue #900');
  const commentCalls = calls.filter((a) => a[0] === 'issue' && a.includes('comments'));
  assert.strictEqual(commentCalls[0][2], '898', 'the comments check must target the parent #898, not the sub-issue #900');
});

test('acceptance-labeling check queries a shared parent exactly once for two sub-issues', () => {
  const runDir = makeTmpDir('verify-acceptance-dedup-');
  writeSpecFile(runDir, '900', 900);
  writeSpecFile(runDir, '901', 901);
  const calls = [];
  const fakeGh = (args) => {
    calls.push(args);
    if (args[0] === '--version') return 'gh version 2.0.0';
    if (args.includes('parent')) return JSON.stringify({ parent: { number: 898 } });
    if (args.includes('labels')) return JSON.stringify({ labels: [{ name: 'demo:pending' }] });
    if (args.includes('comments')) return JSON.stringify({ comments: [{ body: '## Verification Brief\n### Confirmed\n' }] });
    return '';
  };
  const result = runVerify({ runDir, base: 'main', deps: { git: () => '', gh: fakeGh } });
  const row = result.rows.find((r) => r.check === 'acceptance-labeling');
  assert.strictEqual(row.result, 'pass');
  const labelCalls = calls.filter((a) => a.includes('labels'));
  assert.strictEqual(labelCalls.length, 1, 'parent #898 must only be checked once despite two sub-issues resolving to it');
  const commentCalls = calls.filter((a) => a[0] === 'issue' && a.includes('comments'));
  assert.strictEqual(commentCalls.length, 1, 'parent #898 comments must only be fetched once');
  assert.strictEqual(row.detail, '');
});

test('acceptance-labeling check passes via the pr-first pointer+brief form (full brief on the PR, pointer on the issue)', () => {
  const runDir = makeTmpDir('verify-acceptance-prpointer-pass-');
  writeSpecFile(runDir, '900', 900);
  fs.writeFileSync(path.join(runDir, 'run-state.json'), JSON.stringify({ pr: { number: 1199 } }));
  const fakeGh = (args) => {
    if (args[0] === '--version') return 'gh version 2.0.0';
    if (args.includes('parent')) return JSON.stringify({ parent: null });
    if (args.includes('labels')) return JSON.stringify({ labels: [{ name: 'demo:pending' }] });
    if (args[0] === 'pr' && args[1] === 'view') {
      return JSON.stringify({ comments: [{ body: '<!-- run-comment: brief -->\n\n## Verification Brief\n### Confirmed\n' }] });
    }
    if (args.includes('comments')) {
      return JSON.stringify({ comments: [{ body: 'Verification Brief posted to PR #1199: https://github.com/org/repo/pull/1199' }] });
    }
    return '';
  };
  const result = runVerify({ runDir, base: 'main', deps: { git: () => '', gh: fakeGh } });
  const row = result.rows.find((r) => r.check === 'acceptance-labeling');
  assert.strictEqual(row.result, 'pass');
});

test('acceptance-labeling check fails when the pr-first pointer is present but the PR carries no confirmed brief', () => {
  const runDir = makeTmpDir('verify-acceptance-prpointer-fail-');
  writeSpecFile(runDir, '900', 900);
  fs.writeFileSync(path.join(runDir, 'run-state.json'), JSON.stringify({ pr: { number: 1199 } }));
  const fakeGh = (args) => {
    if (args[0] === '--version') return 'gh version 2.0.0';
    if (args.includes('parent')) return JSON.stringify({ parent: null });
    if (args.includes('labels')) return JSON.stringify({ labels: [{ name: 'demo:pending' }] });
    if (args[0] === 'pr' && args[1] === 'view') return JSON.stringify({ comments: [] });
    if (args.includes('comments')) {
      return JSON.stringify({ comments: [{ body: 'Verification Brief posted to PR #1199: https://github.com/org/repo/pull/1199' }] });
    }
    return '';
  };
  const result = runVerify({ runDir, base: 'main', deps: { git: () => '', gh: fakeGh } });
  const row = result.rows.find((r) => r.check === 'acceptance-labeling');
  assert.strictEqual(row.result, 'fail');
  assert.match(row.detail, /PR #1199/);
});

test('acceptance-labeling check folds a parent-resolution gh failure into a fail detail instead of throwing', () => {
  const runDir = makeTmpDir('verify-acceptance-parenterr-');
  writeSpecFile(runDir, '900', 900);
  const fakeGh = (args) => {
    if (args[0] === '--version') return 'gh version 2.0.0';
    if (args.includes('parent')) throw new Error('gh: rate limited');
    return '';
  };
  const result = runVerify({ runDir, base: 'main', deps: { git: () => '', gh: fakeGh } });
  const row = result.rows.find((r) => r.check === 'acceptance-labeling');
  assert.strictEqual(row.result, 'fail');
  assert.match(row.detail, /#900.*gh issue view \(parent\) failed/);
});

test('resolvePrNumber falls back to run-state.json one level up when absent at runDir itself (multi-spec subdir case)', () => {
  const parentDir = makeTmpDir('verify-prnum-parent-');
  fs.writeFileSync(path.join(parentDir, 'run-state.json'), JSON.stringify({ pr: { number: 1199 } }));
  const subDir = path.join(parentDir, 'spec-900');
  fs.mkdirSync(subDir);
  assert.strictEqual(resolvePrNumber(subDir), 1199);
});

test('resolvePrNumber returns null when neither runDir nor its parent has run-state.json', () => {
  const runDir = makeTmpDir('verify-prnum-none-');
  assert.strictEqual(resolvePrNumber(runDir), null);
});

test('resolvePrNumber returns null when run-state.json exists directly at runDir but carries no pr field', () => {
  const runDir = makeTmpDir('verify-prnum-nopr-');
  fs.writeFileSync(path.join(runDir, 'run-state.json'), JSON.stringify({ status: 'ok' }));
  assert.strictEqual(resolvePrNumber(runDir), null);
});

function writeExpectations(runDir, data) {
  fs.writeFileSync(path.join(runDir, 'verify-expectations.json'), JSON.stringify(data));
}

test('memory-updates check renders unknown when expectations file is absent', () => {
  const runDir = makeTmpDir('verify-memory-noexp-');
  const result = runVerify({ runDir, base: 'main', deps: { git: () => '', gh: () => '' } });
  const row = result.rows.find((r) => r.check === 'memory-updates');
  assert.strictEqual(row.result, 'unknown');
  assert.match(row.detail, /expectations file missing/);
});

test('memory-updates check skips when expectations.memory is present but empty', () => {
  const runDir = makeTmpDir('verify-memory-empty-');
  writeExpectations(runDir, { version: 1, memory: [], upstream: [] });
  const result = runVerify({ runDir, base: 'main', deps: { git: () => '', gh: () => '' } });
  const row = result.rows.find((r) => r.check === 'memory-updates');
  assert.strictEqual(row.result, 'skip');
  assert.match(row.detail, /nothing recorded/);
});

test('memory-updates check passes when every recorded file and index line exist on disk', () => {
  const runDir = makeTmpDir('verify-memory-pass-');
  const memDir = makeTmpDir('verify-memory-target-');
  const memFile = path.join(memDir, 'insight.md');
  const indexFile = path.join(memDir, 'MEMORY.md');
  fs.writeFileSync(memFile, '# insight');
  fs.writeFileSync(indexFile, '- [insight](insight.md)');
  writeExpectations(runDir, { version: 1, memory: [{ file: memFile, indexFile }], upstream: [] });
  const result = runVerify({ runDir, base: 'main', deps: { git: () => '', gh: () => '' } });
  const row = result.rows.find((r) => r.check === 'memory-updates');
  assert.strictEqual(row.result, 'pass');
});

test('memory-updates check fails when recorded file is missing on disk', () => {
  const runDir = makeTmpDir('verify-memory-fail-');
  writeExpectations(runDir, { version: 1, memory: [{ file: '/tmp/does-not-exist-verify-900.md', indexFile: '/tmp/also-missing-900.md' }], upstream: [] });
  const result = runVerify({ runDir, base: 'main', deps: { git: () => '', gh: () => '' } });
  const row = result.rows.find((r) => r.check === 'memory-updates');
  assert.strictEqual(row.result, 'fail');
});

test('expectations checks render unknown-unsupported-version for a bad version field', () => {
  const runDir = makeTmpDir('verify-badversion-');
  writeExpectations(runDir, { version: 99, memory: [], upstream: [] });
  const result = runVerify({ runDir, base: 'main', deps: { git: () => '', gh: () => '' } });
  const row = result.rows.find((r) => r.check === 'memory-updates');
  assert.strictEqual(row.result, 'unknown');
  assert.match(row.detail, /version 99 unsupported/);
});

test('upstream-feedback check passes via gh issue view when recorded url resolves', () => {
  const runDir = makeTmpDir('verify-upstream-pass-');
  writeExpectations(runDir, { version: 1, memory: [], upstream: [{ url: 'https://github.com/org/repo/issues/42' }] });
  const fakeGh = (args) => (args[0] === '--version' ? 'gh version 2.0.0' : JSON.stringify({ number: 42 }));
  const result = runVerify({ runDir, base: 'main', deps: { git: () => '', gh: fakeGh } });
  const row = result.rows.find((r) => r.check === 'upstream-feedback');
  assert.strictEqual(row.result, 'pass');
});

test('worktree-removed check skips when deferred set includes worktree', () => {
  const runDir = makeTmpDir('verify-deferred-worktree-');
  writeExpectations(runDir, { version: 1, memory: [], upstream: [], deferred: ['worktree'] });
  const fakeGit = () => { throw new Error('should not be called'); };
  const result = runVerify({ runDir, base: 'main', deps: { git: fakeGit, gh: () => '' } });
  const row = result.rows.find((r) => r.check === 'worktree-removed');
  assert.strictEqual(row.result, 'skip');
  assert.match(row.detail, /deferred to parent console/);
});

test('design-caches check skips when deferred set includes design-caches', () => {
  const runDir = makeTmpDir('verify-deferred-designcaches-');
  const cacheDir = path.join(process.cwd(), 'docs', 'plans');
  fs.mkdirSync(cacheDir, { recursive: true });
  const slug = path.basename(runDir);
  const strayCache = path.join(cacheDir, `${slug}-audit.json`);
  fs.writeFileSync(strayCache, '{}');
  writeExpectations(runDir, { version: 1, memory: [], upstream: [], deferred: ['design-caches'] });
  try {
    const result = runVerify({ runDir, base: 'main', deps: { git: () => '', gh: () => '' } });
    const row = result.rows.find((r) => r.check === 'design-caches');
    assert.strictEqual(row.result, 'skip');
    assert.match(row.detail, /deferred to parent console/);
  } finally {
    fs.rmSync(strayCache, { force: true });
  }
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
