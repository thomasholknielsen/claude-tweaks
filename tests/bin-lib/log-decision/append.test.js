'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { formatEntry, resolveTarget, appendEntry, STATUSES } = require('../../../bin/lib/log-decision/append');

// The schema line _shared/auto-decision-log.md documents — a test-side parser, so
// every entry the module emits is proven readable by the documented shape.
const SCHEMA = /^- (AUTO|STAGED|KEPT-PROMPT|SCANNED) (\d{2}:\d{2}:\d{2}) — (.+?): (.+)\. Reversibility: (high|med|low|n\/a)(?:[^\[]*)?( \[lever: .+\])?$/;

const NOW = new Date(2026, 7, 16, 14, 32, 14).getTime(); // local 14:32:14

test('formatEntry: AUTO line with step + spec matches the documented schema', () => {
  const line = formatEntry({ status: 'AUTO', now: NOW, step: 'Section E', spec: 12, text: 'released claim', reversibility: 'high' });
  assert.equal(line, '- AUTO 14:32:14 — spec #12 — Section E: released claim. Reversibility: high.');
  assert.match(line, SCHEMA);
});

test('formatEntry: spec-only location, default reversibility n/a, lever last', () => {
  const line = formatEntry({ status: 'STAGED', now: NOW, spec: 12, text: 'x.', lever: 'scope-creep=add-to-plan (policy)' });
  assert.equal(line, '- STAGED 14:32:14 — spec #12: x. Reversibility: n/a. [lever: scope-creep=add-to-plan (policy)]');
  assert.match(line, SCHEMA);
});

test('formatEntry: no step/spec falls back to log-decision; rejects unknown status', () => {
  assert.match(formatEntry({ status: 'SCANNED', now: NOW, text: 'swept 3 files' }), /— log-decision: swept 3 files\. Reversibility: n\/a\.$/);
  assert.throws(() => formatEntry({ status: 'MAYBE', now: NOW, text: 'x' }), /status/);
  assert.deepEqual(STATUSES, ['AUTO', 'STAGED', 'KEPT-PROMPT', 'SCANNED']);
});

test('resolveTarget: run dir under mainRoot ok; under a linked worktree not-anchored; missing dir', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ld-'));
  const main = path.join(root, 'main');
  const wt = path.join(root, 'main', '.claude', 'worktrees', 'wt');
  const good = path.join(main, '.claude-tweaks', 'pipelines', 'run-a');
  const shadow = path.join(wt, '.claude-tweaks', 'pipelines', 'run-a');
  fs.mkdirSync(good, { recursive: true });
  fs.mkdirSync(shadow, { recursive: true });
  // mainRoot injected: the shadow lives *under* main on disk, so anchoring must
  // compare against the main root AND reject the worktree admin subtree.
  assert.deepEqual(resolveTarget({ runDir: good, mainRoot: main }).ok, true);
  const bad = resolveTarget({ runDir: shadow, mainRoot: main });
  assert.equal(bad.ok, false);
  assert.equal(bad.reason, 'not-anchored');
  assert.deepEqual(resolveTarget({ runDir: path.join(main, 'nope'), mainRoot: main }), { ok: false, reason: 'missing' });
});

test('appendEntry: creates the file, then inserts under the named section before the next heading', () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ld-run-'));
  const r1 = appendEntry({ runDir, section: '/build', entry: '- AUTO 10:00:00 — a: b. Reversibility: high.' });
  assert.equal(r1.created, true);
  appendEntry({ runDir, section: '/review', entry: '- AUTO 10:00:01 — c: d. Reversibility: high.' });
  appendEntry({ runDir, section: '/build', entry: '- AUTO 10:00:02 — e: f. Reversibility: high.' });
  appendEntry({ runDir, entry: '- AUTO 10:00:03 — g: h. Reversibility: high.' });
  const text = fs.readFileSync(path.join(runDir, 'decisions.md'), 'utf8');
  assert.equal(text,
    '## /build\n' +
    '- AUTO 10:00:00 — a: b. Reversibility: high.\n' +
    '- AUTO 10:00:02 — e: f. Reversibility: high.\n' +
    '## /review\n' +
    '- AUTO 10:00:01 — c: d. Reversibility: high.\n' +
    '- AUTO 10:00:03 — g: h. Reversibility: high.\n');
});
