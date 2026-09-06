'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { resolveConditions } = require('../../../plugin/bin/lib/compose-context/resolve-conditions');

// Fixture: a fake main checkout (repoRoot) and a run dir under it. Files are
// written only when the test needs them, so "absent" cases are real absences.
function fixture({ policy, config, claudeMd } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'compose-rc-'));
  const runDir = path.join(root, '.claude-tweaks', 'pipelines', '2026-09-06T000000-spec-1');
  fs.mkdirSync(runDir, { recursive: true });
  if (policy != null) fs.writeFileSync(path.join(root, '.claude-tweaks', 'policy.yml'), policy);
  if (config != null) fs.writeFileSync(path.join(runDir, 'config.yml'), config);
  if (claudeMd != null) fs.writeFileSync(path.join(root, 'CLAUDE.md'), claudeMd);
  return { root, runDir };
}

const ghPresent = () => 'gh version 2.0.0\n';
const ghAbsent = () => { const e = new Error('spawnSync gh ENOENT'); e.code = 'ENOENT'; throw e; };
const neverDetect = () => { throw new Error('detection must not run when the run pins integration-model'); };

test('fully-resolved run: every key resolves from config.yml/policy.yml/CLAUDE.md and gh presence; unresolved is empty', () => {
  const { root, runDir } = fixture({
    policy: 'autonomy: unattended\nworktree-always: true\n',
    config: 'mode: auto\nintegration-model: pr-first\n',
    claudeMd: '# x\n\nwork-backend: github-issues\nwork-types: labels\n',
  });
  const calls = [];
  const { conditions, unresolved } = resolveConditions({ runDir, repoRoot: root }, {
    execFileSync: (cmd, args) => { calls.push([cmd, ...args]); return ghPresent(); },
    resolveIntegrationModel: neverDetect,
  });
  assert.deepEqual(conditions, {
    'integration-model': 'pr-first', mode: 'auto', attendance: 'headless',
    transport: 'gh', 'worktree-policy': 'always', 'work-backend': 'github-issues',
  });
  assert.deepEqual(unresolved, []);
  assert.deepEqual(calls, [['gh', '--version']]);
});

test('standalone run with no config.yml and no policy.yml: mode/attendance/worktree-policy/work-backend are unresolved, integration-model falls back to detection, transport still resolves', () => {
  const { root, runDir } = fixture();
  const { conditions, unresolved } = resolveConditions({ runDir, repoRoot: root }, {
    execFileSync: ghAbsent,
    resolveIntegrationModel: (repoRoot) => { assert.equal(repoRoot, root); return 'local-merge'; },
  });
  assert.deepEqual(conditions, {
    'integration-model': 'local-merge', mode: 'unresolved', attendance: 'unresolved',
    transport: 'mcp', 'worktree-policy': 'unresolved', 'work-backend': 'unresolved',
  });
  assert.deepEqual(unresolved, ['mode', 'attendance', 'worktree-policy', 'work-backend']);
});

test('config.yml present but with no mode: line resolves mode unresolved; an off-vocabulary mode also resolves unresolved', () => {
  const a = fixture({ config: 'scope-creep: add-to-plan\n' });
  assert.equal(resolveConditions({ runDir: a.runDir, repoRoot: a.root }, { execFileSync: ghPresent, resolveIntegrationModel: () => 'pr-first' }).conditions.mode, 'unresolved');
  const b = fixture({ config: 'mode: turbo\n' });
  assert.equal(resolveConditions({ runDir: b.runDir, repoRoot: b.root }, { execFileSync: ghPresent, resolveIntegrationModel: () => 'pr-first' }).conditions.mode, 'unresolved');
});

test('attendance: autonomy supervised/trusted -> attended, unattended -> headless; policy.yml sets it, config.yml overrides it', () => {
  const p = fixture({ policy: 'autonomy: trusted\n' });
  assert.equal(resolveConditions({ runDir: p.runDir, repoRoot: p.root }, { execFileSync: ghPresent, resolveIntegrationModel: () => 'pr-first' }).conditions.attendance, 'attended');
  const o = fixture({ policy: 'autonomy: trusted\n', config: 'autonomy: unattended\n' });
  assert.equal(resolveConditions({ runDir: o.runDir, repoRoot: o.root }, { execFileSync: ghPresent, resolveIntegrationModel: () => 'pr-first' }).conditions.attendance, 'headless');
});

test('worktree-policy: worktree-always true -> always, false -> optional, unset -> unresolved', () => {
  const t = fixture({ policy: 'worktree-always: true\n' });
  assert.equal(resolveConditions({ runDir: t.runDir, repoRoot: t.root }, { execFileSync: ghPresent, resolveIntegrationModel: () => 'pr-first' }).conditions['worktree-policy'], 'always');
  const f = fixture({ policy: 'worktree-always: false\n' });
  assert.equal(resolveConditions({ runDir: f.runDir, repoRoot: f.root }, { execFileSync: ghPresent, resolveIntegrationModel: () => 'pr-first' }).conditions['worktree-policy'], 'optional');
});

test('integration-model: policy.yml pin wins over detection; detection only when neither config nor policy set it', () => {
  const pinned = fixture({ policy: 'integration-model: local-merge\n' });
  assert.equal(resolveConditions({ runDir: pinned.runDir, repoRoot: pinned.root }, { execFileSync: ghPresent, resolveIntegrationModel: neverDetect }).conditions['integration-model'], 'local-merge');
});

test('work-backend reads the CLAUDE.md line at repoRoot (never the run dir), and a missing or off-vocabulary line is unresolved', () => {
  const ok = fixture({ claudeMd: 'work-backend: local-files\n' });
  assert.equal(resolveConditions({ runDir: ok.runDir, repoRoot: ok.root }, { execFileSync: ghPresent, resolveIntegrationModel: () => 'pr-first' }).conditions['work-backend'], 'local-files');
  const bad = fixture({ claudeMd: 'work-backend: postgres\n' });
  assert.equal(resolveConditions({ runDir: bad.runDir, repoRoot: bad.root }, { execFileSync: ghPresent, resolveIntegrationModel: () => 'pr-first' }).conditions['work-backend'], 'unresolved');
});

test('work-backend is read via parseFlatLines, so a trailing comment on the line still resolves', () => {
  const { root, runDir } = fixture({ claudeMd: 'work-backend: github-issues # default\n' });
  assert.equal(resolveConditions({ runDir, repoRoot: root }, { execFileSync: ghPresent, resolveIntegrationModel: () => 'pr-first' }).conditions['work-backend'], 'github-issues');
});

test('an unreadable-but-present file is a real error surfaced to the caller, not silently read as unresolved', () => {
  const { root, runDir } = fixture({ policy: 'autonomy: trusted\n' });
  const policyPath = path.join(root, '.claude-tweaks', 'policy.yml');
  const readFile = (p, enc) => {
    if (p === policyPath) { const e = new Error('EACCES: permission denied'); e.code = 'EACCES'; throw e; }
    return fs.readFileSync(p, enc);
  };
  assert.throws(
    () => resolveConditions({ runDir, repoRoot: root }, {
      readFile,
      execFileSync: ghPresent,
      resolveIntegrationModel: () => 'pr-first',
    }),
    (err) => err.code === 'EACCES',
  );
});

test('transport is the only shell-out and it is the injected execFileSync — no other command is spawned', () => {
  const { root, runDir } = fixture({ policy: 'autonomy: supervised\nworktree-always: false\n', config: 'mode: hybrid\nintegration-model: pr-first\n', claudeMd: 'work-backend: github-issues\n' });
  const calls = [];
  resolveConditions({ runDir, repoRoot: root }, {
    execFileSync: (cmd, args) => { calls.push(cmd); if (cmd !== 'gh') throw new Error('unexpected ' + cmd); return 'gh version 2\n'; },
    resolveIntegrationModel: neverDetect,
  });
  assert.deepEqual(calls, ['gh']);
});
