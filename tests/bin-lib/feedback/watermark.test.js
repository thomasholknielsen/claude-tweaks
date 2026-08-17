'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const watermark = require('../../../plugin/bin/lib/feedback/watermark');

// Fake deps are plain objects backed by an in-memory `store` keyed by the
// path a real fs call would use, matching tests/bin-lib/feedback/
// file-feedback.test.js's fake-runner convention — no real filesystem
// access anywhere in this file.
function makeStore() {
  const store = {};
  const mkdirSync = () => {};
  const writeFile = (p, content) => { store[p] = content; };
  const readFile = (p) => {
    if (!(p in store)) { const e = new Error(`ENOENT: no such file, open '${p}'`); e.code = 'ENOENT'; throw e; }
    return store[p];
  };
  return { store, mkdirSync, writeFile, readFile };
}

const TRANSCRIPT = '/Users/x/.claude/projects/foo/session-abc123.jsonl';
const WATERMARK_REL = path.join('.claude-tweaks', 'feedback', 'watermarks', 'session-abc123.json');

// ---- watermarkPath ---------------------------------------------------------

test('watermarkPath: strips directory and .jsonl extension, keeps the session-id form', () => {
  assert.equal(watermark.watermarkPath(TRANSCRIPT), WATERMARK_REL);
});

test('watermarkPath: two different transcripts derive two different watermark paths', () => {
  const a = watermark.watermarkPath('/a/session-one.jsonl');
  const b = watermark.watermarkPath('/b/session-two.jsonl');
  assert.notEqual(a, b);
});

// ---- readWatermark: degrade-open -------------------------------------------

test('readWatermark: no file -> null, no throw', () => {
  const { readFile } = makeStore();
  const result = watermark.readWatermark(TRANSCRIPT, { readFile });
  assert.equal(result, null);
});

test('readWatermark: corrupt/malformed JSON -> null, no throw', () => {
  const { store, readFile } = makeStore();
  store[WATERMARK_REL] = '{ this is not valid json ';
  const result = watermark.readWatermark(TRANSCRIPT, { readFile });
  assert.equal(result, null);
});

// ---- writeWatermark + read-back round trip ---------------------------------

test('writeWatermark: creates the watermarks directory and writes JSON at the derived path', () => {
  const mkdirCalls = [];
  const writeCalls = [];
  const mkdirSync = (p, opts) => mkdirCalls.push({ p, opts });
  const writeFile = (p, content) => writeCalls.push({ p, content });
  const data = { transcriptPath: TRANSCRIPT, bytesAtDispatch: 1024, evaluatedAt: '2026-08-17T00:00:00Z', filedRecords: [], dismissedFingerprints: [] };

  watermark.writeWatermark(TRANSCRIPT, data, { mkdirSync, writeFile });

  assert.equal(mkdirCalls.length, 1);
  assert.equal(mkdirCalls[0].p, path.dirname(WATERMARK_REL));
  assert.deepEqual(mkdirCalls[0].opts, { recursive: true });
  assert.equal(writeCalls.length, 1);
  assert.equal(writeCalls[0].p, WATERMARK_REL);
  assert.deepEqual(JSON.parse(writeCalls[0].content), data);
});

test('read-back round trip: write then read returns the exact data written', () => {
  const { mkdirSync, writeFile, readFile } = makeStore();
  const data = {
    transcriptPath: TRANSCRIPT,
    bytesAtDispatch: 6815744,
    evaluatedAt: '2026-08-17T12:34:56Z',
    filedRecords: ['#681', '#682'],
    dismissedFingerprints: ['feedback-deadbeef'],
  };

  watermark.writeWatermark(TRANSCRIPT, data, { mkdirSync, writeFile });
  const result = watermark.readWatermark(TRANSCRIPT, { readFile });

  assert.deepEqual(result, data);
});

test('writeWatermark: overwrites an existing watermark (the --full reset primitive)', () => {
  const { mkdirSync, writeFile, readFile } = makeStore();
  const first = { transcriptPath: TRANSCRIPT, bytesAtDispatch: 100, evaluatedAt: 'a', filedRecords: ['#1'], dismissedFingerprints: [] };
  const second = { transcriptPath: TRANSCRIPT, bytesAtDispatch: 9999, evaluatedAt: 'b', filedRecords: [], dismissedFingerprints: [] };

  watermark.writeWatermark(TRANSCRIPT, first, { mkdirSync, writeFile });
  watermark.writeWatermark(TRANSCRIPT, second, { mkdirSync, writeFile });
  const result = watermark.readWatermark(TRANSCRIPT, { readFile });

  assert.deepEqual(result, second);
});

test('writeWatermark: propagates a real write failure to the caller rather than swallowing it', () => {
  const mkdirSync = () => {};
  const writeFile = () => { throw new Error('ENOSPC: no space left on device'); };
  assert.throws(
    () => watermark.writeWatermark(TRANSCRIPT, { transcriptPath: TRANSCRIPT }, { mkdirSync, writeFile }),
    /ENOSPC/,
  );
});

// ---- byteOffsetToLine -------------------------------------------------------
// Fixture: 'aaa\nbbb\nccc\n' — 12 bytes, newlines at byte indices 3, 7, 11.
const FIXTURE = 'aaa\nbbb\nccc\n';

test('byteOffsetToLine: offset 0 -> line 1', () => {
  const readFile = () => Buffer.from(FIXTURE, 'utf8');
  assert.equal(watermark.byteOffsetToLine('/fake/t.jsonl', 0, { readFile }), 1);
});

test('byteOffsetToLine: offset mid-line -> the line containing that byte', () => {
  const readFile = () => Buffer.from(FIXTURE, 'utf8');
  // byte 5 is inside "bbb" (line 2), after the first newline at byte 3.
  assert.equal(watermark.byteOffsetToLine('/fake/t.jsonl', 5, { readFile }), 2);
});

test('byteOffsetToLine: offset exactly on a newline byte -> still the line it terminates', () => {
  const readFile = () => Buffer.from(FIXTURE, 'utf8');
  // byte 3 IS the first newline; it has not yet been consumed by the slice.
  assert.equal(watermark.byteOffsetToLine('/fake/t.jsonl', 3, { readFile }), 1);
});

test('byteOffsetToLine: offset one past a newline -> the next line', () => {
  const readFile = () => Buffer.from(FIXTURE, 'utf8');
  // byte 4 is the first byte of "bbb" (line 2), right after the newline at byte 3.
  assert.equal(watermark.byteOffsetToLine('/fake/t.jsonl', 4, { readFile }), 2);
});

test('byteOffsetToLine: offset past EOF -> one past the last complete line, no throw', () => {
  const readFile = () => Buffer.from(FIXTURE, 'utf8');
  assert.equal(watermark.byteOffsetToLine('/fake/t.jsonl', 1000, { readFile }), 4);
});

test('byteOffsetToLine: readFile returning a plain string (not a Buffer) still works', () => {
  const readFile = () => FIXTURE;
  assert.equal(watermark.byteOffsetToLine('/fake/t.jsonl', 5, { readFile }), 2);
});

// ---- formatOffsetClause ------------------------------------------------------

test('formatOffsetClause: exact literal wording, with filed records', () => {
  const s = watermark.formatOffsetClause({ bytesAtDispatch: 6815744, line: 41203, filedRecords: ['#681', '#682'] });
  assert.equal(
    s,
    'Evaluate from byte offset 6815744 (line 41203); these records already exist: #681, #682; omit findings they cover.',
  );
});

test('formatOffsetClause: empty filedRecords renders "none"', () => {
  const s = watermark.formatOffsetClause({ bytesAtDispatch: 100, line: 3, filedRecords: [] });
  assert.equal(s, 'Evaluate from byte offset 100 (line 3); these records already exist: none; omit findings they cover.');
});

test('formatOffsetClause: missing filedRecords (undefined) also renders "none"', () => {
  const s = watermark.formatOffsetClause({ bytesAtDispatch: 50, line: 1, filedRecords: undefined });
  assert.match(s, /records already exist: none;/);
});
