'use strict';
// tests/bin-lib/residue/artifacts.test.js — the artifacts retention probe
// (#1078): aged artifact dirs under .claude-tweaks/artifacts/ (30-day
// newest-file rule), legacy project-root screenshots/ + traces/ residue,
// per-root ENOENT-clean semantics, fail-loud on unreadable roots.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { probeArtifacts, THIRTY_DAYS_MS } = require('../../../plugin/bin/lib/residue/probes/artifacts');
const { validateFinding } = require('../../../plugin/bin/lib/residue/finding');

const NOW = Date.UTC(2026, 7, 20, 12, 0, 0);
const OLD = new Date(NOW - THIRTY_DAYS_MS - 24 * 60 * 60 * 1000); // 31 days ago
const FRESH = new Date(NOW - 24 * 60 * 60 * 1000); // 1 day ago

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-probe-'));
}

function mkFile(p, mtime) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, 'x');
  fs.utimesSync(p, mtime, mtime);
}

test('no roots at all is a clean, ran result', () => {
  const root = tmpRoot();
  assert.deepStrictEqual(probeArtifacts({ cwd: root, now: NOW }), { ran: true, reason: null, findings: [] });
});

test('partial presence: missing sibling subdirs are silently clean', () => {
  const root = tmpRoot();
  mkFile(path.join(root, '.claude-tweaks/artifacts/screenshots/browse/sess1/01.png'), FRESH);
  const r = probeArtifacts({ cwd: root, now: NOW });
  assert.strictEqual(r.ran, true);
  assert.deepStrictEqual(r.findings, []);
});

test('aged dir (newest file >30d) yields an auto artifact finding that validates', () => {
  const root = tmpRoot();
  mkFile(path.join(root, '.claude-tweaks/artifacts/screenshots/qa/20260601_010101_abc123/shot.png'), OLD);
  const r = probeArtifacts({ cwd: root, now: NOW });
  assert.strictEqual(r.findings.length, 1);
  const f = r.findings[0];
  assert.strictEqual(f.kind, 'artifact');
  assert.strictEqual(f.scope, 'observed');
  assert.strictEqual(f.remedy, 'auto');
  assert.ok(f.subject.includes('20260601_010101_abc123'));
  assert.deepStrictEqual(validateFinding(f), []);
});

test('discrimination: old dir mtime but one fresh file is NOT flagged', () => {
  const root = tmpRoot();
  const dir = path.join(root, '.claude-tweaks/artifacts/traces/story-1');
  mkFile(path.join(dir, 'old.zip'), OLD);
  mkFile(path.join(dir, 'new.zip'), FRESH);
  fs.utimesSync(dir, OLD, OLD);
  const r = probeArtifacts({ cwd: root, now: NOW });
  assert.deepStrictEqual(r.findings, []);
});

test('empty aged dir falls back to its own mtime and is flagged', () => {
  const root = tmpRoot();
  const dir = path.join(root, '.claude-tweaks/artifacts/screenshots/qa/20260501_010101_dead00');
  fs.mkdirSync(dir, { recursive: true });
  fs.utimesSync(dir, OLD, OLD);
  const r = probeArtifacts({ cwd: root, now: NOW });
  assert.strictEqual(r.findings.length, 1);
  assert.strictEqual(r.findings[0].remedy, 'auto');
});

test('legacy root with fresh content is flagged remedy record', () => {
  const root = tmpRoot();
  mkFile(path.join(root, 'traces/story-2/t.zip'), FRESH);
  const r = probeArtifacts({ cwd: root, now: NOW });
  assert.strictEqual(r.findings.length, 1);
  assert.strictEqual(r.findings[0].kind, 'artifact');
  assert.strictEqual(r.findings[0].remedy, 'record');
  assert.ok(r.findings[0].evidence.includes('.claude-tweaks/artifacts/'));
  assert.deepStrictEqual(validateFinding(r.findings[0]), []);
});

test('legacy root aged >30d is flagged remedy auto', () => {
  const root = tmpRoot();
  mkFile(path.join(root, 'screenshots/qa-old/x.png'), OLD);
  const r = probeArtifacts({ cwd: root, now: NOW });
  assert.strictEqual(r.findings.length, 1);
  assert.strictEqual(r.findings[0].remedy, 'auto');
});

test('an unreadable root fails the whole probe loudly, naming it', { skip: process.getuid && process.getuid() === 0 }, () => {
  const root = tmpRoot();
  const locked = path.join(root, '.claude-tweaks/artifacts/traces');
  fs.mkdirSync(locked, { recursive: true });
  mkFile(path.join(root, '.claude-tweaks/artifacts/screenshots/qa/run1/a.png'), OLD);
  fs.chmodSync(locked, 0o000);
  try {
    const r = probeArtifacts({ cwd: root, now: NOW });
    assert.strictEqual(r.ran, false);
    assert.ok(r.reason.includes('traces'));
    assert.deepStrictEqual(r.findings, []);
  } finally {
    fs.chmodSync(locked, 0o755);
  }
});

test("'artifact' is a registered kind", () => {
  const { KINDS } = require('../../../plugin/bin/lib/residue/finding');
  assert.ok(KINDS.includes('artifact'));
});
