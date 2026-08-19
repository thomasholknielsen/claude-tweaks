'use strict';

// bin/residue.js reads this repo's own plugin manifest to decide whether
// probeRelease applies (`manifest.name === 'claude-tweaks'`). Since #418 the
// manifest lives at `plugin/.claude-plugin/plugin.json`; reading only the
// legacy repo-root spelling made the probe report "not applicable" in the one
// repo it exists for. Both spellings must resolve, new path first.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { readProjectManifest } = require('../plugin/bin/residue');
const { probeRelease } = require('../plugin/bin/lib/residue/probes/release');

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'residue-manifest-'));
}

function writeManifest(root, relDir, body) {
  const dir = path.join(root, relDir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify(body), 'utf8');
}

test('reads the cutover manifest at plugin/.claude-plugin/plugin.json', () => {
  const root = tmpdir();
  writeManifest(root, 'plugin/.claude-plugin', { name: 'claude-tweaks', version: '7.0.0' });
  const manifest = readProjectManifest(root);
  assert.ok(manifest, 'manifest under plugin/ must resolve');
  assert.equal(manifest.name, 'claude-tweaks');
  assert.equal(manifest.version, '7.0.0');
});

test('probeRelease is applicable when the manifest sits under plugin/', () => {
  const root = tmpdir();
  writeManifest(root, 'plugin/.claude-plugin', { name: 'claude-tweaks', version: '7.0.0' });
  const manifest = readProjectManifest(root);
  const result = probeRelease({
    scope: { ran: true, reason: null },
    manifest,
    run: () => null,
  });
  // `run` returns null for both git reads, so the probe cannot complete — but
  // the reason must be the read failure, NOT the name guard. "not applicable"
  // here is the exact silent degradation this test exists to catch.
  assert.ok(
    !/not applicable/.test(result.reason || ''),
    `probeRelease degraded to the name guard: ${result.reason}`,
  );
});

test('still reads the legacy repo-root manifest', () => {
  const root = tmpdir();
  writeManifest(root, '.claude-plugin', { name: 'claude-tweaks', version: '6.99.0' });
  const manifest = readProjectManifest(root);
  assert.ok(manifest, 'legacy repo-root manifest must still resolve');
  assert.equal(manifest.version, '6.99.0');
});

test('prefers the plugin/ spelling when both exist', () => {
  const root = tmpdir();
  writeManifest(root, 'plugin/.claude-plugin', { name: 'claude-tweaks', version: '7.0.0' });
  writeManifest(root, '.claude-plugin', { name: 'claude-tweaks', version: '6.99.0' });
  assert.equal(readProjectManifest(root).version, '7.0.0');
});

test('an absent manifest stays normal — null, not a throw', () => {
  assert.equal(readProjectManifest(tmpdir()), null);
});

test('an unparseable manifest stays normal — null, not a throw', () => {
  const root = tmpdir();
  fs.mkdirSync(path.join(root, 'plugin', '.claude-plugin'), { recursive: true });
  fs.writeFileSync(path.join(root, 'plugin', '.claude-plugin', 'plugin.json'), '{ not json', 'utf8');
  assert.equal(readProjectManifest(root), null);
});
