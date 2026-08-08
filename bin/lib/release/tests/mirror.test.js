'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { composeMirroredCatalog, mirrorRelease } = require('../mirror.js');

const CATALOG = JSON.stringify({
  name: 'claude-tweaks-marketplace',
  metadata: { version: '2.4.0' },
  plugins: [{ name: 'claude-tweaks', version: '6.70.1', description: 'Old description', source: 'https://github.com/thomasholknielsen/claude-tweaks' }],
}, null, 2);

test('composeMirroredCatalog updates plugin version and description, never metadata.version', () => {
  const { text, changed } = composeMirroredCatalog(CATALOG, { version: '6.71.0', description: 'New description' });
  const parsed = JSON.parse(text);
  assert.strictEqual(changed, true);
  assert.strictEqual(parsed.plugins[0].version, '6.71.0');
  assert.strictEqual(parsed.plugins[0].description, 'New description');
  assert.strictEqual(parsed.metadata.version, '2.4.0');
  assert.strictEqual(parsed.plugins[0].source, 'https://github.com/thomasholknielsen/claude-tweaks');
});

test('composeMirroredCatalog reports no change when already mirrored', () => {
  const { changed } = composeMirroredCatalog(CATALOG, { version: '6.70.1', description: 'Old description' });
  assert.strictEqual(changed, false);
});

test('composeMirroredCatalog throws when the plugin entry is missing', () => {
  const empty = JSON.stringify({ metadata: { version: '2.4.0' }, plugins: [] });
  assert.throws(() => composeMirroredCatalog(empty, { version: '6.71.0' }), /claude-tweaks/);
});

test('mirrorRelease reads live main, writes only when changed and not dry-run', () => {
  const writes = [];
  const deps = {
    gh: (args) => {
      const key = args.join(' ');
      if (key.includes('-X PUT')) { writes.push(args); return '{}'; }
      return JSON.stringify({ content: Buffer.from(CATALOG).toString('base64'), sha: 'abc123' });
    },
  };
  const dry = mirrorRelease(deps, { version: '6.71.0', description: 'D', dryRun: true });
  assert.strictEqual(dry.changed, true);
  assert.strictEqual(writes.length, 0, 'dry-run must not write');

  const live = mirrorRelease(deps, { version: '6.71.0', description: 'D', dryRun: false });
  assert.strictEqual(live.changed, true);
  assert.strictEqual(writes.length, 1, 'live run writes exactly once');
  assert.ok(writes[0].some((a) => a === 'sha=abc123' || a === '-f' ? true : String(a).includes('abc123')), 'PUT carries the blob sha');

  writes.length = 0;
  const noop = mirrorRelease(deps, { version: '6.70.1', description: 'Old description', dryRun: false });
  assert.strictEqual(noop.changed, false);
  assert.strictEqual(writes.length, 0, 'no-op mirror must not write');
});
