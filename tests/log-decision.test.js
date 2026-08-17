'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { run, insertEntry, hhmmss } = require('../bin/log-decision');

function fakeFs(initial = {}) {
  const files = { ...initial };
  const dirs = new Set();
  return {
    files,
    deps: {
      exists: (p) => p in files || dirs.has(p),
      mkdirp: (p) => { dirs.add(p); },
      readFile: (p) => files[p],
      writeFile: (p, c) => { files[p] = c; },
      now: () => new Date('2026-08-17T06:53:00'),
      stdout: () => {},
      stderr: () => {},
    },
  };
}

test('hhmmss: formats local time as HH:MM:SS', () => {
  assert.equal(hhmmss(new Date('2026-08-17T06:53:07')), '06:53:07');
});

test('insertEntry: no --skill appends at end of file', () => {
  const text = '# Auto-Decision Log — pipeline x\n\n## /build\n- AUTO 06:00:00 — existing entry.\n';
  const out = insertEntry(text, '- AUTO 06:01:00 — new entry.', null);
  assert.ok(out.endsWith('- AUTO 06:01:00 — new entry.\n'));
});

test('insertEntry: --skill appends under an existing "## /{skill}" heading, after its last entry', () => {
  const text = '# log\n\n## /flow\n- AUTO 06:00:00 — flow entry.\n\n## /build\n- AUTO 06:01:00 — build entry.\n';
  const out = insertEntry(text, '- AUTO 06:02:00 — new flow entry.', 'flow');
  const flowSection = out.slice(out.indexOf('## /flow'), out.indexOf('## /build'));
  assert.match(flowSection, /flow entry\.\n- AUTO 06:02:00 — new flow entry\.\n/);
});

test('insertEntry: --skill with no existing heading creates a new section at end of file', () => {
  const text = '# log\n\n## /flow\n- AUTO 06:00:00 — flow entry.\n';
  const out = insertEntry(text, '- AUTO 06:02:00 — test entry.', 'test');
  assert.match(out, /## \/test\n- AUTO 06:02:00 — test entry\.\n$/);
});

// ---- CLI --------------------------------------------------------------

test('CLI: --help exits 0', () => {
  const { deps } = fakeFs();
  const out = [];
  deps.stdout = (s) => out.push(s);
  assert.equal(run(['--help'], deps), 0);
  assert.match(out.join(''), /usage: log-decision\.js/);
});

test('CLI: an invalid STATUS is a malformed invocation (exit 2)', () => {
  const { deps } = fakeFs();
  const err = []; deps.stderr = (s) => err.push(s);
  const code = run(['--run-dir', '/run', 'BOGUS', 'hello'], deps);
  assert.equal(code, 2);
  assert.match(err.join(''), /STATUS must be one of/);
});

test('CLI: missing --run-dir is a malformed invocation (exit 2)', () => {
  const { deps } = fakeFs();
  const err = []; deps.stderr = (s) => err.push(s);
  assert.equal(run(['AUTO', 'hello'], deps), 2);
  assert.match(err.join(''), /missing required --run-dir/);
});

test('CLI: happy path — creates decisions.md if absent, writes a properly prefixed line', () => {
  const { deps, files } = fakeFs();
  const code = run(['--run-dir', '/run/2026-08-17T065201-record-711', 'AUTO', 'Step 1: did a thing. Reversibility: high.'], deps);
  assert.equal(code, 0);
  const content = files['/run/2026-08-17T065201-record-711/decisions.md'];
  assert.match(content, /- AUTO 06:53:00 — Step 1: did a thing\. Reversibility: high\.\n$/);
});

test('CLI: --spec routes to the spec-{n}/decisions.md subdirectory when it exists', () => {
  const { deps, files } = fakeFs();
  deps.exists = (p) => p === '/run/spec-42' || p in files;
  const code = run(['--run-dir', '/run', '--spec', '42', 'STAGED', 'a staged finding.'], deps);
  assert.equal(code, 0);
  assert.ok(files['/run/spec-42/decisions.md']);
});

test('CLI: --spec pointing at a non-existent subdirectory is a malformed invocation (exit 2)', () => {
  const { deps } = fakeFs();
  const err = []; deps.stderr = (s) => err.push(s);
  const code = run(['--run-dir', '/run', '--spec', '99', 'AUTO', 'msg'], deps);
  assert.equal(code, 2);
  assert.match(err.join(''), /does not resolve to an existing/);
});

test('CLI: appends under a --skill heading in an existing file rather than clobbering it', () => {
  const { deps, files } = fakeFs({ '/run/decisions.md': '# log\n\n## /flow\n- AUTO 06:00:00 — earlier entry.\n' });
  const code = run(['--run-dir', '/run', '--skill', 'flow', 'AUTO', 'later entry.'], deps);
  assert.equal(code, 0);
  const content = files['/run/decisions.md'];
  assert.match(content, /earlier entry\.\n- AUTO 06:53:00 — later entry\.\n/);
});
