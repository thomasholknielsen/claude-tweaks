'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOOKS = path.join(__dirname, '..', '..', '..', 'bin', 'hooks.js');

function git(args, cwd) { return execFileSync('git', args, { cwd, encoding: 'utf8' }); }

test('reconcile-background: writes a status file with completedAt + summary, exits 0 even with no gh/remote', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-recon-bg-'));
  git(['init', '-q', '--initial-branch=main'], dir);
  git(['config', 'user.email', 't@e.com'], dir);
  git(['config', 'user.name', 'T'], dir);
  fs.writeFileSync(path.join(dir, 'a.txt'), 'x');
  git(['add', 'a.txt'], dir);
  git(['commit', '-q', '-m', 'seed'], dir);

  const result = execFileSync('node', [HOOKS, 'reconcile-background'], { cwd: dir, encoding: 'utf8' });
  assert.equal(result.trim(), 'claude-tweaks: reconcile-background complete');

  const statusPath = path.join(dir, '.claude-tweaks', 'reconcile-background-status.json');
  const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
  assert.equal(typeof status.completedAt, 'number');
  assert.equal(status.surfaced, false);
  assert.equal(typeof status.summary, 'object');
});
