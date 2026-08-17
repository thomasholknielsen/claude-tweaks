'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { composeMirroredCatalog, mirrorRelease } = require('../../../plugin/bin/lib/release/mirror.js');

// The pre-cutover catalog shape: a bare-string `source` plus a `version` field the
// marketplace used to carry. Both are what the git-subdir cutover (#418) replaces —
// the payload now lives under `plugin/`, so the entry names a subdirectory source
// pinned at the release commit, and the version comes from the payload's own
// plugin.json rather than being duplicated here.
const CATALOG = JSON.stringify({
  name: 'claude-tweaks-marketplace',
  metadata: { version: '2.4.0' },
  plugins: [{ name: 'claude-tweaks', version: '6.70.1', description: 'Old description', source: 'https://github.com/thomasholknielsen/claude-tweaks' }],
}, null, 2);

const SHA = '1111111111111111111111111111111111111111';
const OTHER_SHA = '2222222222222222222222222222222222222222';

// The composed shape, per Probe 1 §4's verified field spellings (source/url/path/sha).
const mirrored = (sha) => ({
  source: 'git-subdir',
  url: 'https://github.com/thomasholknielsen/claude-tweaks',
  path: 'plugin',
  sha,
});

const catalogWith = (entry) => JSON.stringify({
  name: 'claude-tweaks-marketplace',
  metadata: { version: '2.4.0' },
  plugins: [entry],
}, null, 2);

test('composeMirroredCatalog rewrites source to a sha-pinned git-subdir entry and drops version', () => {
  const { text, changed } = composeMirroredCatalog(CATALOG, { version: '6.71.0', description: 'New description', sha: SHA });
  const parsed = JSON.parse(text);
  const entry = parsed.plugins[0];
  assert.strictEqual(changed, true);
  assert.deepStrictEqual(entry.source, mirrored(SHA));
  assert.strictEqual(entry.source.source, 'git-subdir');
  assert.strictEqual(entry.source.path, 'plugin');
  assert.strictEqual(entry.source.sha, SHA);
  // The payload's own plugin.json is the only version authority once the plugin
  // installs from a subdirectory — a duplicated catalog `version` can only drift.
  assert.ok(!('version' in entry), `entry must carry no version field: ${JSON.stringify(entry)}`);
  assert.strictEqual(entry.description, 'New description');
  assert.strictEqual(parsed.metadata.version, '2.4.0', "the marketplace catalog's own version is never touched");
});

test('composeMirroredCatalog reports changed when only the sha pin moved', () => {
  const current = catalogWith({ name: 'claude-tweaks', description: 'Same description', source: mirrored(SHA) });
  const { text, changed } = composeMirroredCatalog(current, { version: '6.71.0', description: 'Same description', sha: OTHER_SHA });
  assert.strictEqual(changed, true, 'a new release commit must re-pin the mirror');
  assert.strictEqual(JSON.parse(text).plugins[0].source.sha, OTHER_SHA);
});

test('composeMirroredCatalog reports no change when the sha and description are identical', () => {
  const current = catalogWith({ name: 'claude-tweaks', description: 'Same description', source: mirrored(SHA) });
  const { changed } = composeMirroredCatalog(current, { version: '6.71.0', description: 'Same description', sha: SHA });
  assert.strictEqual(changed, false);
});

test('composeMirroredCatalog reports changed for an old-style entry even when the sha already matches', () => {
  // A leftover `version` key is itself a reason to rewrite: the catalog is still
  // carrying the duplicated number the cutover removes.
  const current = catalogWith({ name: 'claude-tweaks', version: '6.70.1', description: 'Same description', source: mirrored(SHA) });
  const { text, changed } = composeMirroredCatalog(current, { version: '6.71.0', description: 'Same description', sha: SHA });
  assert.strictEqual(changed, true);
  assert.ok(!('version' in JSON.parse(text).plugins[0]));
});

test('composeMirroredCatalog refuses to compose without a release sha', () => {
  assert.throws(() => composeMirroredCatalog(CATALOG, { version: '6.71.0', description: 'D' }), /sha/i);
  assert.throws(() => composeMirroredCatalog(CATALOG, { version: '6.71.0', description: 'D', sha: '  ' }), /sha/i);
});

test('composeMirroredCatalog throws when the plugin entry is missing', () => {
  const empty = JSON.stringify({ metadata: { version: '2.4.0' }, plugins: [] });
  assert.throws(() => composeMirroredCatalog(empty, { version: '6.71.0', sha: SHA }), /claude-tweaks/);
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
  const dry = mirrorRelease(deps, { version: '6.71.0', description: 'D', sha: SHA, dryRun: true });
  assert.strictEqual(dry.changed, true);
  assert.strictEqual(writes.length, 0, 'dry-run must not write');

  const live = mirrorRelease(deps, { version: '6.71.0', description: 'D', sha: SHA, dryRun: false });
  assert.strictEqual(live.changed, true);
  assert.strictEqual(writes.length, 1, 'live run writes exactly once');
  assert.ok(writes[0].some((a) => String(a) === 'sha=abc123'), 'PUT carries the blob sha');
  // The blob sha (GitHub's contents-API concurrency token) and the release commit sha
  // are different values — the PUT must carry both, in their own places.
  const contentArg = writes[0].find((a) => String(a).startsWith('content='));
  const written = JSON.parse(Buffer.from(String(contentArg).slice('content='.length), 'base64').toString('utf8'));
  assert.deepStrictEqual(written.plugins[0].source, mirrored(SHA));
  assert.ok(!('version' in written.plugins[0]));
});

test('mirrorRelease makes no write when the catalog already pins this release commit', () => {
  const writes = [];
  const current = catalogWith({ name: 'claude-tweaks', description: 'D', source: mirrored(SHA) });
  const deps = {
    gh: (args) => {
      const key = args.join(' ');
      if (key.includes('-X PUT')) { writes.push(args); return '{}'; }
      return JSON.stringify({ content: Buffer.from(current).toString('base64'), sha: 'abc123' });
    },
  };
  const noop = mirrorRelease(deps, { version: '6.71.0', description: 'D', sha: SHA, dryRun: false });
  assert.strictEqual(noop.changed, false);
  assert.strictEqual(writes.length, 0, 'no-op mirror must not write');
});
