'use strict';

// Record #721: run-dir ISO-timestamps are UTC, stated once in
// _shared/pipeline-run-dir.md and cited by every mint site. Two concurrent
// sessions minting in different timezones flipped newest-first ordering and
// let an empty local-time mint steal hook fallback attribution.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(REPO_ROOT, p), 'utf8');

function mdFilesUnder(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...mdFilesUnder(full));
    else if (entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

test('every run-dir timestamp snippet under skills/ uses date -u (#721)', () => {
  const offenders = [];
  for (const full of mdFilesUnder(path.join(REPO_ROOT, 'skills'))) {
    const text = fs.readFileSync(full, 'utf8');
    for (const line of text.split('\n')) {
      if (line.includes('%Y-%m-%dT%H%M%S') && line.includes('date ') && !line.includes('date -u ')) {
        offenders.push(`${path.relative(REPO_ROOT, full)}: ${line.trim()}`);
      }
    }
  }
  assert.deepStrictEqual(offenders, []);
});

test('pipeline-run-dir.md states the UTC ISO-timestamp rule once (#721)', () => {
  const content = read('skills/_shared/pipeline-run-dir.md');
  assert.match(content, /ISO-timestamp rule/);
  assert.match(content, /UTC/);
  assert.match(content, /date -u \+%Y-%m-%dT%H%M%S/);
});

test('the three mint sites cite the UTC rule instead of restating a bare format (#721)', () => {
  for (const p of ['skills/flow/claim-targets.md', 'skills/flow/manifesto.md', 'skills/dispatch/SKILL.md']) {
    const content = read(p);
    assert.match(content, /ISO-timestamp rule/, `${p} must cite the ISO-timestamp rule`);
    assert.match(content, /UTC|date -u/, `${p} must carry the UTC signal at its mint/path site`);
  }
});

test('claim-targets contest path removes a self-minted empty dir immediately (#721)', () => {
  const content = read('skills/flow/claim-targets.md');
  assert.match(content, /remove (the|it|that) (self-)?mint(ed)?[^.]*immediately/i);
  assert.match(content, /PIPELINE_RUN_DIR[^.]*unset on entry/);
  assert.doesNotMatch(content, /isOrphanedMint` sweep reclaims after 24h if it was freshly minted here/);
});
