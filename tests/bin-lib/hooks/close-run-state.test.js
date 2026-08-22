'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { closeRunState } = require('../../../plugin/bin/lib/hooks/close-run-state');

function makeTmpRunDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'close-run-state-test-'));
  return dir;
}

test('closeRunState: notYetArchived is true when the run dir still has a top-level work/ subdirectory', () => {
  const dir = makeTmpRunDir();
  try {
    fs.mkdirSync(path.join(dir, 'work'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'work', '42-spec.md'), '# 42\n');
    const r = closeRunState(dir, { explicit: true, sessionId: 's1' });
    assert.strictEqual(r.status, 'closed');
    assert.strictEqual(r.notYetArchived, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('closeRunState: notYetArchived is true when a multi-spec spec-N/work/ subdirectory exists', () => {
  const dir = makeTmpRunDir();
  try {
    fs.mkdirSync(path.join(dir, 'spec-42', 'work'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'spec-42', 'work', '42-spec.md'), '# 42\n');
    const r = closeRunState(dir, { explicit: true, sessionId: 's1' });
    assert.strictEqual(r.notYetArchived, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('closeRunState: notYetArchived is false when no work/ subdirectory exists anywhere under the run dir', () => {
  const dir = makeTmpRunDir();
  try {
    fs.writeFileSync(path.join(dir, 'decisions.md'), '# decisions\n');
    const r = closeRunState(dir, { explicit: true, sessionId: 's1' });
    assert.strictEqual(r.notYetArchived, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('closeRunState: refused-foreign case never reaches the notYetArchived check', () => {
  const dir = makeTmpRunDir();
  try {
    fs.writeFileSync(path.join(dir, 'run-state.json'), JSON.stringify({ sessionId: 'other-session' }));
    const r = closeRunState(dir, { explicit: false, sessionId: 'this-session' });
    assert.strictEqual(r.status, 'refused-foreign');
    assert.strictEqual('notYetArchived' in r, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
