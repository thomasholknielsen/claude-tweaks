const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { FIXTURE_RECORDS } = require('./fixtures');

const CLI = path.resolve(__dirname, '..', '..', '..', 'plugin', 'bin', 'record-graph.js');

function tmpJson(records) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'record-graph-cli-'));
  const file = path.join(dir, 'records.json');
  fs.writeFileSync(file, JSON.stringify(records));
  return file;
}

test('render --format d2 writes valid-looking D2 source to stdout', () => {
  const jsonPath = tmpJson(FIXTURE_RECORDS);
  const out = execFileSync('node', [
    CLI, 'render', jsonPath, '--format', 'd2', '--work-links', 'body-text', '--generated-at', '2026-08-03T12:00:00.000Z',
  ], { encoding: 'utf8' });
  assert.match(out, /backlog: "Backlog" \{/);
  assert.match(out, /ready\.n20 -> backlog\.n10/);
});

test('render --format svg writes an svg fragment to stdout', () => {
  const jsonPath = tmpJson(FIXTURE_RECORDS);
  const out = execFileSync('node', [
    CLI, 'render', jsonPath, '--format', 'svg', '--work-links', 'body-text', '--generated-at', '2026-08-03T12:00:00.000Z',
  ], { encoding: 'utf8' });
  assert.match(out, /<svg class="vz-record-graph"/);
});

test('render --out writes the file instead of stdout', () => {
  const jsonPath = tmpJson(FIXTURE_RECORDS);
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'record-graph-cli-out-'));
  const outPath = path.join(outDir, 'record-graph.d2');
  // execFileSync's return value is always stdout, never stderr, regardless of
  // stdio config — spawnSync is used here instead because it exposes both
  // streams directly on its result object for a successful (non-throwing) run.
  const result = spawnSync('node', [
    CLI, 'render', jsonPath, '--format', 'd2', '--work-links', 'body-text', '--out', outPath,
  ], { encoding: 'utf8' });
  assert.strictEqual(result.status, 0);
  assert.ok(fs.existsSync(outPath));
  assert.match(fs.readFileSync(outPath, 'utf8'), /backlog: "Backlog" \{/);
  assert.match(result.stderr, /wrote .*record-graph\.d2 \(3 records, 1 edges\)/);
});

test('render sets truncated when record count equals --fetch-limit', () => {
  const jsonPath = tmpJson(FIXTURE_RECORDS);
  const out = execFileSync('node', [
    CLI, 'render', jsonPath, '--format', 'd2', '--work-links', 'body-text', '--fetch-limit', '3',
  ], { encoding: 'utf8' });
  assert.match(out, /Showing the fetch cap.s worth of records/);
});

// assert.throws(/Command failed/) would pass for ANY nonzero exit code — this
// captures the error so the status and stderr can both be checked directly.
function runExpectingFailure(args) {
  let error;
  try {
    execFileSync('node', [CLI, ...args], { encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (e) {
    error = e;
  }
  assert.ok(error, `expected a nonzero exit for: ${args.join(' ')}`);
  return error;
}

test('render rejects an unrecognized --format with exit code 2', () => {
  const jsonPath = tmpJson(FIXTURE_RECORDS);
  const error = runExpectingFailure(['render', jsonPath, '--format', 'png', '--work-links', 'body-text']);
  assert.strictEqual(error.status, 2);
  assert.match(error.stderr, /--format must be "d2" or "svg"/);
});

test('render rejects an unrecognized --work-links with exit code 2', () => {
  const jsonPath = tmpJson(FIXTURE_RECORDS);
  const error = runExpectingFailure(['render', jsonPath, '--format', 'd2', '--work-links', 'bogus']);
  assert.strictEqual(error.status, 2);
  assert.match(error.stderr, /--work-links must be "native" or "body-text"/);
});

test('render exits 2 with a clear message when the input file is missing', () => {
  const missing = path.join(os.tmpdir(), 'record-graph-does-not-exist-12345.json');
  const error = runExpectingFailure(['render', missing, '--format', 'd2', '--work-links', 'body-text']);
  assert.strictEqual(error.status, 2);
  assert.match(error.stderr, /could not read faceted-record JSON/);
  assert.ok(!/at Object\.<anonymous>/.test(error.stderr), 'leaked a raw Node stack trace');
});

test('render exits 2 with a clear message when the input file is not valid JSON', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'record-graph-cli-bad-'));
  const file = path.join(dir, 'records.json');
  fs.writeFileSync(file, '{not json at all');
  const error = runExpectingFailure(['render', file, '--format', 'd2', '--work-links', 'body-text']);
  assert.strictEqual(error.status, 2);
  assert.match(error.stderr, /could not read faceted-record JSON/);
  assert.ok(!/at Object\.<anonymous>/.test(error.stderr), 'leaked a raw Node stack trace');
});

test('render exits 2 when the input JSON is not an array of records', () => {
  const jsonPath = tmpJson({ number: 10 });
  const error = runExpectingFailure(['render', jsonPath, '--format', 'd2', '--work-links', 'body-text']);
  assert.strictEqual(error.status, 2);
  assert.match(error.stderr, /expected an array of faceted records/);
});

test('render exits 2 on a non-numeric --fetch-limit instead of silently disabling truncation', () => {
  const jsonPath = tmpJson(FIXTURE_RECORDS);
  const error = runExpectingFailure(['render', jsonPath, '--format', 'd2', '--work-links', 'body-text', '--fetch-limit', 'abc']);
  assert.strictEqual(error.status, 2);
  assert.match(error.stderr, /--fetch-limit must be a number/);
});

test('render exits 2 when --fetch-limit is given no value at all', () => {
  const jsonPath = tmpJson(FIXTURE_RECORDS);
  const error = runExpectingFailure(['render', jsonPath, '--format', 'd2', '--work-links', 'body-text', '--fetch-limit']);
  assert.strictEqual(error.status, 2);
  assert.match(error.stderr, /--fetch-limit must be a number/);
});

test('unknown command exits with code 2 and a usage message on stderr', () => {
  let error;
  try {
    execFileSync('node', [CLI, 'bogus'], { encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (e) {
    error = e;
  }
  assert.ok(error);
  assert.strictEqual(error.status, 2);
  assert.match(error.stderr, /unknown command "bogus"/);
});
