'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  serviceVars, mergeManagedRegion, hasComposeFile, writeEnvFiles, BEGIN_MARKER, END_MARKER,
} = require('../../../plugin/bin/lib/ports/env-file');

// AC9
test('serviceVars: first service -> PORT, later ones -> sanitized {NAME}_PORT', () => {
  assert.deepEqual(
    serviceVars(['web', 'api', 'db'], 20010),
    [['PORT', '20010'], ['API_PORT', '20011'], ['DB_PORT', '20012']],
  );
  assert.deepEqual(serviceVars(['my-db'], 20000), [['PORT', '20000']]);
  assert.deepEqual(serviceVars(['web', 'my-db'], 20000)[1], ['MY_DB_PORT', '20001']);
});

// AC10
test('mergeManagedRegion: replaces only the region, is idempotent, preserves CRLF, appends when absent', () => {
  const withForeign = `TOP=1\n${BEGIN_MARKER}\nPORT=1\n${END_MARKER}\nBOTTOM=1\n`;
  const merged = mergeManagedRegion(withForeign, [['PORT', '20000']]);
  assert.equal(merged, `TOP=1\n${BEGIN_MARKER}\nPORT=20000\n${END_MARKER}\nBOTTOM=1\n`);

  const mergedTwice = mergeManagedRegion(merged, [['PORT', '20000']]);
  assert.equal(mergedTwice, merged, 'running it twice yields identical bytes');

  const crlf = `TOP=1\r\n${BEGIN_MARKER}\r\nPORT=1\r\n${END_MARKER}\r\nBOTTOM=1\r\n`;
  const mergedCrlf = mergeManagedRegion(crlf, [['PORT', '20005']]);
  assert.ok(mergedCrlf.includes('\r\n'));
  assert.ok(!/[^\r]\n/.test(mergedCrlf), 'no bare LF introduced into a CRLF file');

  const noRegion = 'FOO=bar\n';
  const appended = mergeManagedRegion(noRegion, [['PORT', '20000']]);
  assert.ok(appended.startsWith('FOO=bar\n'));
  assert.ok(appended.includes(BEGIN_MARKER));
  assert.ok(appended.endsWith('\n'));

  const empty = mergeManagedRegion('', [['PORT', '20000']]);
  assert.equal(empty, `${BEGIN_MARKER}\nPORT=20000\n${END_MARKER}\n`);
});

// AC11 + writeEnvFiles skip-when-unchanged gotcha
test('writeEnvFiles: .env.local always, .env only with a Compose file, skips an unchanged write', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-file-'));
  const vars = [['PORT', '20000']];

  const r1 = writeEnvFiles(dir, vars);
  assert.deepEqual(r1.written, [path.join(dir, '.env.local')]);
  assert.equal(fs.existsSync(path.join(dir, '.env')), false);

  const mtimeBefore = fs.statSync(path.join(dir, '.env.local')).mtimeMs;
  const r2 = writeEnvFiles(dir, vars);
  assert.deepEqual(r2.written, [], 'no write when content is unchanged');
  assert.equal(fs.statSync(path.join(dir, '.env.local')).mtimeMs, mtimeBefore);

  fs.writeFileSync(path.join(dir, 'docker-compose.yml'), 'services: {}\n');
  assert.equal(hasComposeFile(dir), true);
  const r3 = writeEnvFiles(dir, [['PORT', '20010']]);
  assert.deepEqual(
    r3.written.sort(),
    [path.join(dir, '.env'), path.join(dir, '.env.local')].sort(),
  );
});
