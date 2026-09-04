'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const CLI = path.resolve(__dirname, '..', '..', '..', 'plugin', 'bin', 'plan-audit.js');

function makeTmpRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'plan-audit-cli-'));
}

function writePlan(repo, text) {
  const p = path.join(repo, 'plan.md');
  fs.writeFileSync(p, text);
  return p;
}

function runCli(planFile, repoRoot) {
  try {
    const stdout = execFileSync('node', [CLI, planFile, '--repo-root', repoRoot], { encoding: 'utf8' });
    return { exitCode: 0, stdout };
  } catch (err) {
    return { exitCode: err.status, stdout: err.stdout || '' };
  }
}

// AC1 — missing Files: path
test('AC1: a fixture plan naming a missing Files: path fails Check A and exits non-zero', () => {
  const repo = makeTmpRepo();
  try {
    const plan = writePlan(repo, [
      '### Task 1: Do a thing',
      '**Files:**',
      '- Modify: `does/not/exist.js`',
    ].join('\n'));
    const { exitCode, stdout } = runCli(plan, repo);
    assert.notStrictEqual(exitCode, 0);
    const report = JSON.parse(stdout.split('\n')[0]);
    assert.strictEqual(report.checkA.ok, false);
    assert.deepStrictEqual(report.checkA.missing, ['does/not/exist.js']);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

// AC2 — Scope keywords match a file absent from the plan
test('AC2: a fixture plan with a Scope keywords match outside the plan fails Check B and exits non-zero', () => {
  const repo = makeTmpRepo();
  fs.writeFileSync(path.join(repo, 'unswept.txt'), 'has SCOPE_TOKEN_XYZ inside');
  try {
    const plan = writePlan(repo, [
      'Scope keywords: SCOPE_TOKEN_XYZ',
      '### Task 1: Do a thing',
      '**Files:**',
      '- Modify: `plan.md`',
    ].join('\n'));
    const { exitCode, stdout } = runCli(plan, repo);
    assert.notStrictEqual(exitCode, 0);
    const report = JSON.parse(stdout.split('\n')[0]);
    assert.strictEqual(report.checkB.ok, false);
    assert.deepStrictEqual(report.checkB.unplanned, ['unswept.txt']);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

// AC3 — near-ceiling file: soft flag, exit 0 when nothing else fails
test('AC3: a fixture plan adding prose to a near-ceiling governed file gets a soft nearCeiling flag and still exits 0', () => {
  const repo = makeTmpRepo();
  const rel = 'plugin/skills/build/plan-audit.md';
  const abs = path.join(repo, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, 'x'.repeat(40 * 1024 - 500));
  try {
    const plan = writePlan(repo, [
      '### Task 1: Add prose',
      '**Files:**',
      `- Modify: \`${rel}\``,
    ].join('\n'));
    const { exitCode, stdout } = runCli(plan, repo);
    assert.strictEqual(exitCode, 0);
    const report = JSON.parse(stdout.split('\n')[0]);
    assert.strictEqual(report.headroom.ok, true);
    assert.strictEqual(report.headroom.nearCeiling.length, 1);
    assert.strictEqual(report.headroom.nearCeiling[0].file, rel);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

// AC4 — breaching file: exit non-zero
test('AC4: a fixture plan adding prose to a governed file already over the ceiling fails headroom and exits non-zero', () => {
  const repo = makeTmpRepo();
  const rel = 'plugin/skills/build/SKILL.md';
  const abs = path.join(repo, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, 'x'.repeat(40 * 1024 + 1));
  try {
    const plan = writePlan(repo, [
      '### Task 1: Add prose',
      '**Files:**',
      `- Modify: \`${rel}\``,
    ].join('\n'));
    const { exitCode, stdout } = runCli(plan, repo);
    assert.notStrictEqual(exitCode, 0);
    const report = JSON.parse(stdout.split('\n')[0]);
    assert.strictEqual(report.headroom.ok, false);
    assert.strictEqual(report.headroom.breaches.length, 1);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

// AC5 — clean plan
test('AC5: a clean fixture plan has no failures, no flags, exits 0', () => {
  const repo = makeTmpRepo();
  fs.mkdirSync(path.join(repo, 'plugin', 'bin'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'plugin', 'bin', 'existing.js'), '// existing\n');
  try {
    const plan = writePlan(repo, [
      '### Task 1: Do a thing',
      '**Files:**',
      '- Modify: `plugin/bin/existing.js`',
    ].join('\n'));
    const { exitCode, stdout } = runCli(plan, repo);
    assert.strictEqual(exitCode, 0);
    const report = JSON.parse(stdout.split('\n')[0]);
    assert.ok(report.checkA.ok && report.checkB.ok && report.checkC.ok && report.headroom.ok);
    assert.deepStrictEqual(report.checkA.missing, []);
    assert.deepStrictEqual(report.checkB.unplanned, []);
    assert.deepStrictEqual(report.checkC.findings, []);
    assert.deepStrictEqual(report.headroom.nearCeiling, []);
    assert.deepStrictEqual(report.headroom.breaches, []);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

// AC6 — Check C fixture exercising its pinned failure shape
test('AC6: a fixture plan whose Step 2 command already passes despite declaring Expected: FAIL fails Check C and exits non-zero', () => {
  const repo = makeTmpRepo();
  try {
    const plan = writePlan(repo, [
      '### Task 1: Add a guard clause',
      '**Files:**',
      '- Modify: `plan.md`',
      '',
      '- [ ] **Step 2: Run test to verify it fails**',
      '',
      'Run: `node -e "process.exit(0)"`',
      'Expected: FAIL with "guard not present"',
    ].join('\n'));
    const { exitCode, stdout } = runCli(plan, repo);
    assert.notStrictEqual(exitCode, 0);
    const report = JSON.parse(stdout.split('\n')[0]);
    assert.strictEqual(report.checkC.ok, false);
    assert.strictEqual(report.checkC.findings.length, 1);
    assert.strictEqual(report.checkC.findings[0].task, '1');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('a task declaring Expected: FAIL whose command genuinely fails pre-dispatch is not a Check C finding', () => {
  const repo = makeTmpRepo();
  try {
    const plan = writePlan(repo, [
      '### Task 1: Later task in a dependent chain',
      '**Files:**',
      '- Modify: `plan.md`',
      '',
      '- [ ] **Step 2: Run test to verify it fails**',
      '',
      'Run: `node -e "process.exit(1)"`',
      'Expected: FAIL with "not defined"',
    ].join('\n'));
    const { exitCode, stdout } = runCli(plan, repo);
    assert.strictEqual(exitCode, 0);
    const report = JSON.parse(stdout.split('\n')[0]);
    assert.strictEqual(report.checkC.ok, true);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('usage error on a missing plan-file argument exits 2', () => {
  try {
    execFileSync('node', [CLI], { encoding: 'utf8' });
    assert.fail('expected a non-zero exit');
  } catch (err) {
    assert.strictEqual(err.status, 2);
    assert.match(err.stderr, /usage: plan-audit\.js/);
  }
});
