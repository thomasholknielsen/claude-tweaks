'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const CLI = path.join(__dirname, '..', '..', '..', 'plugin', 'bin', 'console-resolve.js');
const { run } = require(CLI);

function mainCheckoutWithRun({ autonomy = 'unattended', staged = {}, decisions = '' } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'console-resolve-cli-')));
  const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  git('init', '-q'); git('config', 'user.email', 't@example.invalid'); git('config', 'user.name', 't'); git('commit', '-q', '--allow-empty', '-m', 'init');
  fs.mkdirSync(path.join(root, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude-tweaks', 'policy.yml'), `autonomy: ${autonomy}\n`);
  const runDir = path.join(root, '.claude-tweaks', 'pipelines', '2026-09-06T000000-record-7');
  fs.mkdirSync(path.join(runDir, 'staged'), { recursive: true });
  fs.mkdirSync(path.join(runDir, 'work'), { recursive: true });
  fs.writeFileSync(path.join(runDir, 'work', '7-spec.md'), '---\nrecord: 7\n---\n');
  fs.writeFileSync(path.join(runDir, 'decisions.md'), decisions);
  for (const [n, b] of Object.entries(staged)) fs.writeFileSync(path.join(runDir, 'staged', n), b);
  return { root, runDir };
}

const THREE = { 'reflect-1.md': 'r', 'wrap-up-memory-1.md': 'm', 'wrap-up-upstream-1.md': 'u' };

// The ceiling read runs `git rev-parse --show-toplevel` through the same execFile
// seam, so the fake must answer it with the fixture root — otherwise
// resolvePolicyConfig falls back to process.cwd() and reads THIS repo's policy.yml.
function fakeExec(calls, root) {
  return (cmd, args) => {
    calls.push([cmd, ...args]);
    if (cmd === 'git' && args[0] === 'rev-parse') return `${root}\n`;
    if (cmd === 'gh' && args[0] === 'issue' && args[1] === 'view') return JSON.stringify({ labels: [{ name: 'auto:merge' }], comments: [] });
    if (cmd === 'git' && args[0] === 'apply') return '';
    throw new Error(`unexpected exec: ${cmd} ${args.join(' ')}`);
  };
}

function baseDeps(fx, calls, over = {}) {
  let out = '';
  let err = '';
  const d = { cwd: () => fx.root, mainRoot: fx.root, stdout: (s) => { out += s; }, stderr: (s) => { err += s; }, now: () => Date.parse('2026-09-06T12:00:00Z'), execFile: fakeExec(calls, fx.root), ...over };
  return { d, out: () => out, err: () => err };
}

test('unattended: exit 0, one decisions block of items+1 lines, console.json resolved, one table row per item (#1932 AC5)', async () => {
  const fx = mainCheckoutWithRun({ staged: THREE });
  const calls = [];
  const { d, out } = baseDeps(fx, calls);
  const code = await run(['--run', fx.runDir, '--policy', 'console-auto'], d);
  assert.strictEqual(code, 0);
  const decisions = fs.readFileSync(path.join(fx.runDir, 'decisions.md'), 'utf8');
  const block = decisions.split('\n').filter((l) => /^- AUTO .*Console/.test(l));
  assert.strictEqual(block.length, 3 + 1, 'header + one line per item');
  assert.match(block[0], /Console auto-resolved 3 item\(s\) at unattended \(console-resolve\.js\)\. Reversibility: per item\./);
  const cj = JSON.parse(fs.readFileSync(path.join(fx.runDir, 'console.json'), 'utf8'));
  assert.strictEqual(cj.resolved, true);
  assert.strictEqual(cj.mode, 'auto-resolve');
  assert.strictEqual(cj.ceiling, 'unattended');
  assert.strictEqual(cj.items.length, 3);
  assert.deepStrictEqual(cj.merge, { resolution: 'merge', reason: 'every member carries auto:merge or a matured auto:merge-pending; no needs-human verdict' });
  const rows = out().split('\n').filter((l) => /AUTO-RESOLVED/.test(l));
  assert.strictEqual(rows.length, 3 + 1, 'one row per item plus the cleanup row');
});

test('trusted: exit 4 and nothing written (#1932 AC5)', async () => {
  const fx = mainCheckoutWithRun({ autonomy: 'trusted', staged: THREE });
  const before = fs.readFileSync(path.join(fx.runDir, 'decisions.md'), 'utf8');
  const { d, err } = baseDeps(fx, []);
  assert.strictEqual(await run(['--run', fx.runDir, '--policy', 'console-auto'], d), 4);
  assert.match(err(), /consoleAutoResolve/);
  assert.strictEqual(fs.readFileSync(path.join(fx.runDir, 'decisions.md'), 'utf8'), before);
  assert.ok(!fs.existsSync(path.join(fx.runDir, 'console.json')));
});

test('--dry-run at unattended prints the table and writes nothing (#1932 AC5)', async () => {
  const fx = mainCheckoutWithRun({ staged: THREE });
  const before = fs.readFileSync(path.join(fx.runDir, 'decisions.md'), 'utf8');
  const { d, out } = baseDeps(fx, []);
  assert.strictEqual(await run(['--run', fx.runDir, '--policy', 'console-auto', '--dry-run'], d), 0);
  assert.match(out(), /AUTO-RESOLVED/);
  assert.strictEqual(fs.readFileSync(path.join(fx.runDir, 'decisions.md'), 'utf8'), before);
  assert.ok(!fs.existsSync(path.join(fx.runDir, 'console.json')));
});

test('--json prints the result object instead of the table (#1932)', async () => {
  const fx = mainCheckoutWithRun({ staged: THREE });
  const { d, out } = baseDeps(fx, []);
  assert.strictEqual(await run(['--run', fx.runDir, '--policy', 'console-auto', '--json'], d), 0);
  const parsed = JSON.parse(out());
  assert.strictEqual(parsed.items.length, 3);
  assert.ok(!('snapshot' in parsed), 'the snapshot is internal');
});

test('malformed: a policy other than console-auto, or a --run that is not a directory, exits 2 (#1932 Gotcha)', async () => {
  const fx = mainCheckoutWithRun();
  const { d } = baseDeps(fx, []);
  assert.strictEqual(await run(['--run', fx.runDir, '--policy', 'manual'], d), 2);
  assert.strictEqual(await run(['--run', path.join(fx.runDir, 'nope'), '--policy', 'console-auto'], d), 2);
  assert.strictEqual(await run(['--policy', 'console-auto'], d), 2);
});

test('a --run outside the main checkout exits 3 and writes nothing (#1932 AC5)', async () => {
  const fx = mainCheckoutWithRun();
  const shadow = fs.mkdtempSync(path.join(os.tmpdir(), 'console-resolve-shadow-'));
  fs.mkdirSync(path.join(shadow, 'staged'));
  fs.writeFileSync(path.join(shadow, 'decisions.md'), '');
  const { d, err } = baseDeps(fx, []);
  assert.strictEqual(await run(['--run', shadow, '--policy', 'console-auto'], d), 3);
  assert.match(err(), /not anchored|missing/);
  assert.ok(!fs.existsSync(path.join(shadow, 'console.json')));
});

test('the merge is computed, never executed: no gh pr merge / git merge across a full run (#1932 Gotcha)', async () => {
  const fx = mainCheckoutWithRun({ staged: THREE });
  const calls = [];
  const { d } = baseDeps(fx, calls);
  assert.strictEqual(await run(['--run', fx.runDir, '--policy', 'console-auto'], d), 0);
  for (const c of calls) {
    assert.ok(!(c[0] === 'gh' && c[1] === 'pr' && c[2] === 'merge'), `gh pr merge invoked: ${c.join(' ')}`);
    assert.ok(!(c[0] === 'git' && c[1] === 'merge'), `git merge invoked: ${c.join(' ')}`);
  }
  assert.ok(calls.some((c) => c[0] === 'gh' && c[1] === 'issue' && c[2] === 'view'), 'grants were read live');
});

test('a gh failure while reading grants leaves the PR open with reason grants-unreadable (#1932 AC3)', async () => {
  const fx = mainCheckoutWithRun({ staged: THREE });
  const { d } = baseDeps(fx, [], { execFile: (cmd, args) => { if (cmd === 'gh') throw new Error('gh: not logged in'); if (cmd === 'git' && args[0] === 'rev-parse') return `${fx.root}\n`; return ''; } });
  assert.strictEqual(await run(['--run', fx.runDir, '--policy', 'console-auto'], d), 0);
  const cj = JSON.parse(fs.readFileSync(path.join(fx.runDir, 'console.json'), 'utf8'));
  assert.deepStrictEqual(cj.merge, { resolution: 'leave-open', reason: 'grants-unreadable' });
});
