'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { run, realDeps } = require('../../../plugin/bin/release-claim');
const claimsGitCas = require('../../../plugin/bin/lib/issues/claims-git-cas');
const release = require('../../../plugin/bin/lib/release-claim/release');

const NOW = Date.parse('2026-08-16T12:00:00Z');
const RUN_DIR_NAME = '2026-08-16T100000-spec-999';
const live = (runId) => JSON.stringify({ runId, sessionId: 's', claimedAt: '2026-08-16T11:00:00.000Z', ttlHours: 72, host: 'h' });
const isGet = (a) => a[0] === 'api' && String(a[1]).startsWith('repos/acme/w/contents/claims/issue-999.json?ref=');
const isPut = (a) => a[0] === 'api' && a[1] === '--method' && a[2] === 'PUT';
const isComment = (a) => a[0] === 'issue' && a[1] === 'comment';
const isEdit = (a) => a[0] === 'issue' && a[1] === 'edit';
// One gh call -> its step name; a label edit reports the label it removed.
function callKind(a) {
  if (isGet(a)) return 'get';
  if (isPut(a)) return 'put';
  if (isComment(a)) return 'comment';
  return a[a.indexOf('--remove-label') + 1];
}

function mkRun() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-'));
  const runDir = path.join(root, '.claude-tweaks', 'pipelines', RUN_DIR_NAME);
  fs.mkdirSync(runDir, { recursive: true });
  fs.mkdirSync(path.join(root, '.git'));
  return runDir;
}
// The real main checkout for `root/.claude-tweaks/pipelines/<name>` — resolveTarget's
// anchoring check needs this injected as `mainRoot` in tests (the same seam
// bin/log-decision.js's own cli.test.js uses), since a synthetic fixture root never
// matches the real repo that mainCheckoutRoot(process.cwd()) would resolve to.
function rootOf(runDir) { return path.dirname(path.dirname(path.dirname(runDir))); }
function deps({ content, putThrows, gh = true, out, mainRoot, editFailLabel }) {
  const calls = [];
  const runner = (a) => {
    calls.push(a);
    if (isGet(a)) { if (content === null) throw new Error('HTTP 404'); return JSON.stringify({ content, sha: 'blobsha1' }); }
    if (isPut(a)) { if (putThrows) throw new Error(putThrows); return '{}'; }
    if (isEdit(a)) {
      const label = a[a.indexOf('--remove-label') + 1];
      if (editFailLabel && label === editFailLabel) throw new Error('HTTP 404');
      return '';
    }
    if (isComment(a)) return '';
    throw new Error('unexpected ' + a.join(' '));
  };
  return { calls, d: { runner, ghAvailable: () => gh, remoteUrl: () => 'git@github.com:acme/w.git', now: () => NOW, cwd: () => process.cwd(), mainRoot, stdout: (s) => out.push(['out', s]), stderr: (s) => out.push(['err', s]) } };
}
const streamOf = (out, kind) => out.filter((o) => o[0] === kind).map((o) => o[1]).join('');
const stderrOf = (out) => streamOf(out, 'err');
const envelope = (out) => JSON.parse(streamOf(out, 'out'));

test('happy path: read -> PUT(sha) -> comment; --remove-grants adds two label removals; exit 0; logs to decisions.md', () => {
  const runDir = mkRun();
  const out = [];
  const { calls, d } = deps({ content: live(RUN_DIR_NAME), out, mainRoot: rootOf(runDir) });
  const code = run(['999', '--run', runDir + '/', '--reason', 'merged: spec 999', '--link', 'https://x/1', '--remove-grants'], d);
  assert.equal(code, 0);
  assert.deepEqual(calls.map(callKind), ['get', 'put', 'comment', 'auto:build', 'auto:merge']);
  const put = calls.find(isPut);
  assert.ok(put.includes('sha=blobsha1'), 'PUT carries the read sha');
  const env = envelope(out);
  assert.equal(env.outcome, 'released');
  assert.equal(env.runId, RUN_DIR_NAME, 'runId is basename(--run), trailing slash stripped');
  assert.equal(env.logged, true);
  const log = fs.readFileSync(path.join(runDir, 'decisions.md'), 'utf8');
  assert.match(log, /^- AUTO \d{2}:\d{2}:\d{2} — Section E: released claim on #999 \(merged: spec 999\); link https:\/\/x\/1; labels removed: auto:build, auto:merge\. Reversibility: high\.$/m);
});

test('a failed label removal (issue edit throws) warns to stderr and logs "label removal failed"; exit unchanged', () => {
  const runDir = mkRun();
  const out = [];
  const { d } = deps({ content: live(RUN_DIR_NAME), out, mainRoot: rootOf(runDir), editFailLabel: 'auto:merge' });
  const code = run(['999', '--run', runDir, '--reason', 'merged: spec 999', '--remove-grants'], d);
  assert.equal(code, 0, 'a best-effort label failure never changes the release outcome/exit code');
  const err = stderrOf(out);
  assert.match(err, /release-claim\.js: warning — could not remove label auto:merge on #999 \(best-effort, continuing\)/);
  const log = fs.readFileSync(path.join(runDir, 'decisions.md'), 'utf8');
  assert.match(log, /labels removed: auto:build; label removal failed: auto:merge\./);
});

test('--section places the log line under the named heading; --step overrides the default "Section E"', () => {
  const runDir = mkRun();
  const out = [];
  const { d } = deps({ content: live(RUN_DIR_NAME), out, mainRoot: rootOf(runDir) });
  const code = run(['999', '--run', runDir, '--reason', 'failed: build', '--section', '/dispatch', '--step', 'Settle'], d);
  assert.equal(code, 0);
  const log = fs.readFileSync(path.join(runDir, 'decisions.md'), 'utf8');
  const lines = log.split('\n');
  assert.equal(lines[0], '## /dispatch');
  assert.match(lines[1], /^- AUTO \d{2}:\d{2}:\d{2} — Settle: released claim on #999 \(failed: build\)\. Reversibility: high\.$/);
});

test('404/422 on the PUT: comment still posted, exit 3', () => {
  const runDir = mkRun();
  const out = [];
  const { calls, d } = deps({ content: live(RUN_DIR_NAME), putThrows: 'HTTP 422 sha mismatch', out });
  assert.equal(run(['999', '--run', runDir, '--reason', 'merged: spec 999'], d), 3);
  assert.equal(calls.filter(isComment).length, 1);
  assert.equal(envelope(out).outcome, 'already-released');
});

test('blob owned by another run: exit 4, nothing written, skip line logged', () => {
  const runDir = mkRun();
  const out = [];
  const { calls, d } = deps({ content: live('2026-08-16T110000-spec-999'), out, mainRoot: rootOf(runDir) });
  assert.equal(run(['999', '--run', runDir, '--reason', 'merged: spec 999', '--remove-grants'], d), 4);
  assert.equal(calls.length, 1, 'only the read');
  assert.match(fs.readFileSync(path.join(runDir, 'decisions.md'), 'utf8'), /skipped release of issue #999: claim held by run 2026-08-16T110000-spec-999/);
});

test('failed PUT (500): exit 1, no comment, FAILED line still logged; missing run dir still releases (logged:false, warning)', () => {
  const runDir = mkRun();
  const out = [];
  const { calls, d } = deps({ content: live(RUN_DIR_NAME), putThrows: 'HTTP 500', out, mainRoot: rootOf(runDir) });
  assert.equal(run(['999', '--run', runDir, '--reason', 'r'], d), 1);
  assert.equal(calls.filter(isComment).length, 0);
  const log = fs.readFileSync(path.join(runDir, 'decisions.md'), 'utf8');
  assert.match(log, /^- AUTO \d{2}:\d{2}:\d{2} — Section E: release of #999 FAILED \(r\): HTTP 500\. Reversibility: n\/a\.$/m);
  const out2 = [];
  const { d: d2 } = deps({ content: live(RUN_DIR_NAME), out: out2 });
  // Same basename (so the ownership check still matches) under a directory that does not exist.
  assert.equal(run(['999', '--run', path.join(os.tmpdir(), 'rc-none-' + process.pid, RUN_DIR_NAME), '--reason', 'r'], d2), 0);
  assert.equal(envelope(out2).logged, false);
  assert.match(stderrOf(out2), /decisions\.md not written/);

  // A run dir that exists but sits under a worktree-local shadow (a linked
  // worktree's `.git` is a FILE, not a directory) must be refused, never
  // silently written to — [IL-127].
  const shadowRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-shadow-'));
  const wt = path.join(shadowRoot, '.claude', 'worktrees', 'wt');
  const shadowRunDir = path.join(wt, '.claude-tweaks', 'pipelines', RUN_DIR_NAME);
  fs.mkdirSync(shadowRunDir, { recursive: true });
  fs.writeFileSync(path.join(wt, '.git'), 'gitdir: ../../../.git/worktrees/wt\n');
  const out3 = [];
  const { d: d3 } = deps({ content: live(RUN_DIR_NAME), out: out3 });
  assert.equal(run(['999', '--run', shadowRunDir, '--reason', 'r'], d3), 0);
  assert.equal(envelope(out3).logged, false);
  assert.match(stderrOf(out3), /not anchored/);
  assert.equal(fs.existsSync(path.join(shadowRunDir, 'decisions.md')), false);
});

// Wiring, not behavior: every test above injects its own deps, so a dropped
// `gitRunner` in realDeps would leave this whole suite green while the real
// CLI silently fell back to the contents-API transport #787 moved off.
test('realDeps wires the real git-CAS runner and the real gh runner', () => {
  assert.equal(realDeps.gitRunner, claimsGitCas.defaultRunner, 'gitRunner is claims-git-cas.js\'s defaultRunner export');
  assert.equal(realDeps.runner, release.defaultRunner, 'runner is release.js\'s defaultRunner export');
});

test('malformed invocation / gh absent exit 2 with the MCP fallback named; --help exits 0', () => {
  const runDir = mkRun();
  const out = [];
  const { d } = deps({ content: live(RUN_DIR_NAME), out });
  assert.equal(run(['--run', runDir, '--reason', 'r'], d), 2, 'issue missing');
  assert.match(stderrOf(out), /<issue> is required/);
  assert.equal(run(['abc', '--run', runDir, '--reason', 'r'], d), 2, 'issue not a number');
  assert.equal(run(['999', '--reason', 'r'], d), 2, '--run missing');
  assert.equal(run(['999', '--run', runDir], d), 2, '--reason missing');
  const { d: noGh } = deps({ content: live(RUN_DIR_NAME), gh: false, out });
  assert.equal(run(['999', '--run', runDir, '--reason', 'r'], noGh), 2);
  assert.match(stderrOf(out), /github-write-transport\.md/);
  const help = [];
  const { d: h } = deps({ content: null, out: help });
  assert.equal(run(['--help'], h), 0);
  assert.match(help[0][1], /usage: release-claim\.js/);
});
