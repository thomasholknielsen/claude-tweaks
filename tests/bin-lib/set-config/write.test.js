'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  MANIFESTO_LEVERS, leverValues, validateLever, setConfigLever,
} = require('../../../plugin/bin/lib/set-config/write');

const REPO_ROOT = path.join(__dirname, '..', '..', '..');

function fixtureRunDir() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'setcfg-'));
  const runDir = path.join(root, '.claude-tweaks', 'pipelines', '2026-08-20T090000-spec-12');
  fs.mkdirSync(runDir, { recursive: true });
  return runDir;
}

test('validateLever: every canonical Manifesto lever is accepted with a known-good value', () => {
  const good = {
    mode: 'auto',
    'scope-creep': 'add-to-plan',
    overlap: 'companion',
    'design-intent': 'none',
    'leftover-default': 'defer',
    'auto-fix-threshold': 'lint+type',
    'review-auto-apply-ceiling': 'low',
    'tidy-aggressiveness': 'moderate',
    'ceremony-profile': 'standard',
    'model-stance': 'default',
    'merge-verification': 'merge-when-green',
    'design-critique': 'auto',
    'merge-authorization': 'ask',
  };
  assert.deepEqual(Object.keys(good).sort(), [...MANIFESTO_LEVERS].sort());
  for (const [key, value] of Object.entries(good)) {
    assert.deepEqual(validateLever(key, value), { ok: true }, `${key}=${value} should validate`);
  }
});

test('validateLever: a key outside the lever enum is refused (unknown-key) — including config.yml bookkeeping fields', () => {
  for (const key of ['spec', 'created', 'worktree-always', 'not-a-lever']) {
    assert.deepEqual(validateLever(key, 'x'), { ok: false, reason: 'unknown-key' });
  }
});

test('validateLever: a value outside the lever\'s enum is refused with the allowed list', () => {
  const res = validateLever('ceremony-profile', 'turbo');
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'invalid-value');
  assert.deepEqual(res.allowed, ['fast-lane', 'standard']);
  const res2 = validateLever('design-critique', 'sometimes');
  assert.equal(res2.ok, false);
  assert.deepEqual(res2.allowed, ['off', 'auto', 'full']);
});

test('leverValues: schema-backed levers surface POLICY_KEYS enums; config-only levers surface local enums; non-levers null', () => {
  assert.deepEqual(leverValues('mode'), ['auto', 'hybrid', 'interactive']);
  assert.deepEqual(leverValues('ceremony-profile'), ['fast-lane', 'standard']);
  assert.deepEqual(leverValues('model-stance'), ['economy', 'default', 'max-rigor']);
  assert.equal(leverValues('spec'), null);
});

test('MANIFESTO_LEVERS matches manifesto.md\'s config.yml example block (the canonical lever set)', () => {
  const manifesto = fs.readFileSync(
    path.join(REPO_ROOT, 'plugin', 'skills', 'flow', 'manifesto.md'), 'utf8');
  const approvalIdx = manifesto.indexOf('On approval (option 1)');
  assert.ok(approvalIdx !== -1);
  const fenceStart = manifesto.indexOf('```yaml', approvalIdx);
  assert.ok(fenceStart !== -1);
  const fenceEnd = manifesto.indexOf('```', fenceStart + 7);
  const block = manifesto.slice(fenceStart + 7, fenceEnd);
  const keys = [];
  for (const rawLine of block.split('\n')) {
    const m = /^([a-z0-9-]+):/.exec(rawLine.trim());
    if (m && m[1] !== 'spec' && m[1] !== 'created') keys.push(m[1]);
  }
  assert.deepEqual(keys, [...MANIFESTO_LEVERS],
    'MANIFESTO_LEVERS must track manifesto.md\'s config.yml example block, in order');
});

test('setConfigLever: replaces an existing lever line in place, preserving every other line (comments included)', () => {
  const runDir = fixtureRunDir();
  const file = path.join(runDir, 'config.yml');
  fs.writeFileSync(file, [
    'mode: auto',
    '# a comment line',
    'ceremony-profile: fast-lane   # ceiling note',
    'spec: 12',
    '',
  ].join('\n'));
  const res = setConfigLever({ runDir, key: 'ceremony-profile', value: 'standard' });
  assert.equal(res.file, file);
  assert.equal(res.previous, 'fast-lane');
  assert.equal(fs.readFileSync(file, 'utf8'), [
    'mode: auto',
    '# a comment line',
    'ceremony-profile: standard',
    'spec: 12',
    '',
  ].join('\n'));
});

test('setConfigLever: appends the lever when the line is absent, and creates config.yml when missing', () => {
  const runDir = fixtureRunDir();
  const file = path.join(runDir, 'config.yml');
  fs.writeFileSync(file, 'mode: auto\n');
  const res = setConfigLever({ runDir, key: 'ceremony-profile', value: 'standard' });
  assert.equal(res.previous, null);
  assert.equal(fs.readFileSync(file, 'utf8'), 'mode: auto\nceremony-profile: standard\n');

  const runDir2 = fixtureRunDir();
  const res2 = setConfigLever({ runDir: runDir2, key: 'mode', value: 'interactive' });
  assert.equal(res2.previous, null);
  assert.equal(fs.readFileSync(path.join(runDir2, 'config.yml'), 'utf8'), 'mode: interactive\n');
});

test('setConfigLever: idempotent — setting the same value twice leaves one line', () => {
  const runDir = fixtureRunDir();
  fs.writeFileSync(path.join(runDir, 'config.yml'), 'ceremony-profile: fast-lane\n');
  setConfigLever({ runDir, key: 'ceremony-profile', value: 'standard' });
  const second = setConfigLever({ runDir, key: 'ceremony-profile', value: 'standard' });
  assert.equal(second.previous, 'standard');
  const body = fs.readFileSync(path.join(runDir, 'config.yml'), 'utf8');
  assert.equal(body, 'ceremony-profile: standard\n');
  assert.equal(body.match(/ceremony-profile:/g).length, 1);
});

test('setConfigLever: the written line is readable by policy-schema\'s parseFlatLines', () => {
  const { parseFlatLines } = require('../../../plugin/bin/lib/policy-schema');
  const runDir = fixtureRunDir();
  fs.writeFileSync(path.join(runDir, 'config.yml'), 'ceremony-profile: fast-lane   # note\n');
  setConfigLever({ runDir, key: 'ceremony-profile', value: 'standard' });
  const parsed = parseFlatLines(fs.readFileSync(path.join(runDir, 'config.yml'), 'utf8'));
  assert.equal(parsed['ceremony-profile'], 'standard');
});
