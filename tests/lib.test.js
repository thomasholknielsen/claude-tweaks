const { test } = require('node:test');
const assert = require('node:assert');

const color = require('../plugin/bin/lib/color');
const deps = require('../plugin/bin/lib/deps');

test('color: NO_COLOR=1 disables color', () => {
  const orig = process.env.NO_COLOR;
  process.env.NO_COLOR = '1';
  assert.strictEqual(color.red('x'), 'x');
  if (orig === undefined) delete process.env.NO_COLOR;
  else process.env.NO_COLOR = orig;
});

test('color: NO_COLOR=anything disables (per standard)', () => {
  const orig = process.env.NO_COLOR;
  process.env.NO_COLOR = 'true';
  assert.strictEqual(color.colorEnabled(), false);
  process.env.NO_COLOR = '0';
  assert.strictEqual(color.colorEnabled(), false);
  if (orig === undefined) delete process.env.NO_COLOR;
  else process.env.NO_COLOR = orig;
});

// Regression: per the NO_COLOR convention (https://no-color.org/), the
// variable's mere *presence* disables color regardless of its value — a
// script/CI harness exporting `NO_COLOR=` (present but empty) must still
// suppress ANSI codes, the same as every other value.
test('color: empty NO_COLOR still disables color (presence, not value, is what matters)', () => {
  const orig = process.env.NO_COLOR;
  process.env.NO_COLOR = '';
  assert.strictEqual(color.colorEnabled(), false);
  assert.strictEqual(color.red('x'), 'x');
  if (orig === undefined) delete process.env.NO_COLOR;
  else process.env.NO_COLOR = orig;
});

test('color: unset NO_COLOR enables color', () => {
  const orig = process.env.NO_COLOR;
  delete process.env.NO_COLOR;
  assert.strictEqual(color.colorEnabled(), true);
  if (orig !== undefined) process.env.NO_COLOR = orig;
});

test('color: red wraps with ANSI 31 when enabled', () => {
  const orig = process.env.NO_COLOR;
  delete process.env.NO_COLOR;
  const out = color.red('text');
  assert.ok(out.includes('\x1b[31m'));
  assert.ok(out.includes('text'));
  assert.ok(out.includes('\x1b[0m'));
  if (orig !== undefined) process.env.NO_COLOR = orig;
});

test('deps: has() returns false for non-existent command', () => {
  assert.strictEqual(deps.has('definitely-not-a-real-command-xyz123'), false);
});

test('deps: has() returns true for node', () => {
  assert.strictEqual(deps.has('node'), true);
});

// Regression: has('node') can only ever run while a Node process is already
// executing, so shelling out to `node --version` to answer "is node
// present" spawns a subprocess purely to re-derive a fact this process
// already has for free.
test('deps: has(\'node\') never shells out to `node --version` (no subprocess)', () => {
  const modulePath = require.resolve('../plugin/bin/lib/deps');
  const childProcess = require('node:child_process');
  const originalExecSync = childProcess.execSync;
  let called = false;
  childProcess.execSync = (...args) => {
    called = true;
    return originalExecSync(...args);
  };
  delete require.cache[modulePath];
  try {
    const freshDeps = require('../plugin/bin/lib/deps');
    assert.strictEqual(freshDeps.has('node'), true);
    assert.strictEqual(called, false, "has('node') must not shell out to `node --version`");
  } finally {
    childProcess.execSync = originalExecSync;
    delete require.cache[modulePath];
  }
});

test('deps: installCommand returns expected mapping', () => {
  assert.strictEqual(deps.installCommand({ name: 'brew' }, 'node'), 'brew install node');
  assert.strictEqual(deps.installCommand({ name: 'winget' }, 'git'), 'winget install Git.Git');
  assert.strictEqual(deps.installCommand({ name: 'unknown' }, 'node'), undefined);
});

test('deps: detectVersionManager derives from process.execPath with no subprocess', () => {
  const path = process.execPath;
  let expected = null;
  if (path.includes('/.nvm/')) expected = 'nvm';
  else if (path.includes('/.fnm/')) expected = 'fnm';
  else if (path.includes('/.volta/')) expected = 'volta';
  else if (path.includes('/.n/')) expected = 'n';
  assert.strictEqual(deps.detectVersionManager(), expected);
});
