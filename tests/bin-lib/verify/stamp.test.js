'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const {
  composeStamp, writeStamp, readStamp, STAMP_JSON_NAME, STAMP_LEGACY_NAME,
} = require(path.join(__dirname, '..', '..', '..', 'plugin', 'bin', 'lib', 'verify', 'stamp.js'));

function fakeFs(files = {}) {
  return {
    files,
    readFileSync: (p) => {
      if (!(p in files)) { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e; }
      return files[p];
    },
    writeFileSync: (p, data) => { files[p] = data; },
    renameSync: (from, to) => { files[to] = files[from]; delete files[from]; },
  };
}

const REPORT = { sha: 'abc123', dirty: false, pass: true, checks: {} };

test('composeStamp copies sha/dirty from the report and carries every field verbatim', () => {
  const stamp = composeStamp({
    report: REPORT, scope: 'full', fullSha: 'abc123', base: null, changedFiles: [],
    suitesRun: ['tests'], flakyRetried: [], reportPath: '/g/claude-tweaks-verify/report.json',
    at: '2026-09-05T14:07:09Z',
  });
  assert.deepStrictEqual(stamp, {
    sha: 'abc123', dirty: false, scope: 'full', fullSha: 'abc123', base: null, changedFiles: [],
    suitesRun: ['tests'], flakyRetried: [], reportPath: '/g/claude-tweaks-verify/report.json',
    at: '2026-09-05T14:07:09Z',
  });
});

test('composeStamp never lets caller-supplied fields override the derived sha/dirty (no spread-after-derived)', () => {
  const stamp = composeStamp({
    report: { sha: 'real', dirty: true }, scope: 'full', fullSha: 'real', base: null, changedFiles: [],
    suitesRun: [], flakyRetried: [], reportPath: '/r.json', at: 't', sha: 'forged', dirty: false,
  });
  assert.strictEqual(stamp.sha, 'real');
  assert.strictEqual(stamp.dirty, true);
});

test('writeStamp writes the JSON stamp and the legacy bare-SHA twin atomically', () => {
  const fsImpl = fakeFs();
  const stamp = composeStamp({
    report: REPORT, scope: 'full', fullSha: 'abc123', base: null, changedFiles: [],
    suitesRun: ['tests'], flakyRetried: [], reportPath: '/r.json', at: 't',
  });
  const out = writeStamp('/g', stamp, { fsImpl });
  assert.strictEqual(out.jsonPath, path.join('/g', STAMP_JSON_NAME));
  assert.strictEqual(out.legacyPath, path.join('/g', STAMP_LEGACY_NAME));
  assert.deepStrictEqual(JSON.parse(fsImpl.files[out.jsonPath]), stamp);
  assert.strictEqual(fsImpl.files[out.legacyPath], 'abc123\n');
  assert.ok(!Object.keys(fsImpl.files).some((p) => p.endsWith('.tmp')), 'no tmp files left behind');
});

test('readStamp returns null when neither file exists', () => {
  assert.strictEqual(readStamp('/g', fakeFs()), null);
});

test('readStamp prefers the JSON stamp regardless of the bare file', () => {
  const fsImpl = fakeFs({
    [path.join('/g', STAMP_JSON_NAME)]: JSON.stringify({ sha: 'json', scope: 'full', fullSha: 'json' }),
    [path.join('/g', STAMP_LEGACY_NAME)]: 'bare\n',
  });
  assert.deepStrictEqual(readStamp('/g', fsImpl), { sha: 'json', scope: 'full', fullSha: 'json' });
});

test('readStamp returns null on unparseable JSON — never falls back to the bare file', () => {
  const fsImpl = fakeFs({
    [path.join('/g', STAMP_JSON_NAME)]: 'not json',
    [path.join('/g', STAMP_LEGACY_NAME)]: '0123456789abcdef0123456789abcdef01234567\n',
  });
  assert.strictEqual(readStamp('/g', fsImpl), null);
});

test('readStamp returns null when the JSON parses but is not an object with a string sha', () => {
  assert.strictEqual(readStamp('/g', fakeFs({ [path.join('/g', STAMP_JSON_NAME)]: '"abc"' })), null);
  assert.strictEqual(readStamp('/g', fakeFs({ [path.join('/g', STAMP_JSON_NAME)]: '{"scope":"full"}' })), null);
});

test('readStamp falls back to the bare file as a legacy full-scope stamp when JSON is absent', () => {
  const fsImpl = fakeFs({ [path.join('/g', STAMP_LEGACY_NAME)]: '0123456789abcdef0123456789abcdef01234567\n' });
  assert.deepStrictEqual(readStamp('/g', fsImpl), { sha: '0123456789abcdef0123456789abcdef01234567', scope: 'full', legacy: true });
});

test('readStamp returns null when the bare file is not a 40-hex SHA', () => {
  const fsImpl = fakeFs({ [path.join('/g', STAMP_LEGACY_NAME)]: 'garbage\n' });
  assert.strictEqual(readStamp('/g', fsImpl), null);
  assert.strictEqual(readStamp('/g', fakeFs({ [path.join('/g', STAMP_LEGACY_NAME)]: '' })), null);
});
