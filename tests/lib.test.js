const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const jsonl = require('../bin/lib/jsonl');
const color = require('../bin/lib/color');
const paths = require('../bin/lib/paths');
const deps = require('../bin/lib/deps');

function tmpFile(suffix = '.jsonl') {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ct-lib-')), `data${suffix}`);
}

test('jsonl: readTail returns [] for non-existent file', () => {
  const fp = path.join(os.tmpdir(), 'definitely-not-here-' + Date.now() + '.jsonl');
  assert.deepStrictEqual(jsonl.readTail(fp), []);
});

test('jsonl: appendEvent writes parseable JSON lines', () => {
  const fp = tmpFile();
  jsonl.appendEvent(fp, { a: 1 });
  jsonl.appendEvent(fp, { b: 2 });
  const lines = jsonl.readTail(fp);
  assert.deepStrictEqual(lines, [{ a: 1 }, { b: 2 }]);
});

test('jsonl: readTail skips malformed lines silently', () => {
  const fp = tmpFile();
  fs.writeFileSync(fp, '{"good": 1}\nnot-json\n{"good": 2}\n');
  const lines = jsonl.readTail(fp);
  assert.deepStrictEqual(lines, [{ good: 1 }, { good: 2 }]);
});

test('jsonl: readTail handles tail boundary correctly', () => {
  const fp = tmpFile();
  for (let i = 0; i < 100; i++) jsonl.appendEvent(fp, { i });
  const lines = jsonl.readTail(fp, 200);
  assert.ok(lines.length > 0);
  assert.ok(lines.length < 100);
  for (const line of lines) {
    assert.ok(typeof line.i === 'number');
  }
});

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

test('color: empty NO_COLOR enables color', () => {
  const orig = process.env.NO_COLOR;
  process.env.NO_COLOR = '';
  assert.strictEqual(color.colorEnabled(), true);
  if (orig === undefined) delete process.env.NO_COLOR;
  else process.env.NO_COLOR = orig;
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

test('paths: dataDir creates and returns ~/.claude-tweaks', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-paths-'));
  const origHome = process.env.HOME;
  process.env.HOME = tmpHome;
  try {
    const dir = paths.dataDir();
    assert.ok(dir.endsWith('.claude-tweaks'));
    assert.ok(fs.statSync(dir).isDirectory());
  } finally {
    process.env.HOME = origHome;
  }
});

test('paths: bashLogPath includes timestamp', () => {
  const p = paths.bashLogPath(1234567890);
  assert.ok(p.includes('bash-1234567890.log'));
});

test('deps: has() returns false for non-existent command', () => {
  assert.strictEqual(deps.has('definitely-not-a-real-command-xyz123'), false);
});

test('deps: has() returns true for node', () => {
  assert.strictEqual(deps.has('node'), true);
});

test('deps: installCommand returns expected mapping', () => {
  assert.strictEqual(deps.installCommand({ name: 'brew' }, 'node'), 'brew install node');
  assert.strictEqual(deps.installCommand({ name: 'winget' }, 'git'), 'winget install Git.Git');
  assert.strictEqual(deps.installCommand({ name: 'unknown' }, 'node'), undefined);
});
