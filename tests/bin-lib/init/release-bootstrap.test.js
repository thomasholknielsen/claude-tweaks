'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const rb = require('../../../plugin/bin/lib/init/release-bootstrap');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'release-bootstrap-')); }
function write(root, rel, content) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}
const SHAPED = JSON.stringify({ packages: { '.': { 'release-type': 'node' } } });

test('detectReleaseProcess: nothing at all -> fresh', () => {
  assert.deepEqual(rb.detectReleaseProcess(tmp()), { verdict: 'fresh' });
});

test('detectReleaseProcess: semantic-release, changesets, goreleaser markers -> conflict naming the tool and evidence', () => {
  const a = tmp(); write(a, '.releaserc.json', '{}');
  assert.deepEqual(rb.detectReleaseProcess(a), { verdict: 'conflict', tool: 'semantic-release', evidence: '.releaserc.json' });
  const b = tmp(); write(b, 'release.config.js', 'module.exports = {}');
  assert.equal(rb.detectReleaseProcess(b).tool, 'semantic-release');
  const c = tmp(); fs.mkdirSync(path.join(c, '.changeset'));
  assert.deepEqual(rb.detectReleaseProcess(c), { verdict: 'conflict', tool: 'changesets', evidence: '.changeset/' });
  const d = tmp(); write(d, '.goreleaser.yaml', 'builds: []');
  assert.equal(rb.detectReleaseProcess(d).tool, 'goreleaser');
});

test('detectReleaseProcess: a foreign release-please config -> conflict; the bootstrap shape -> already-bootstrapped', () => {
  const a = tmp(); write(a, 'release-please-config.json', JSON.stringify({ 'release-type': 'node' }));
  assert.deepEqual(rb.detectReleaseProcess(a), { verdict: 'conflict', tool: 'release-please (foreign config)', evidence: 'release-please-config.json' });
  const b = tmp(); write(b, 'release-please-config.json', SHAPED); write(b, '.release-please-manifest.json', '{".":"1.2.3"}');
  assert.deepEqual(rb.detectReleaseProcess(b), { verdict: 'already-bootstrapped' });
  const c = tmp(); write(c, 'release-please-config.json', 'not json');
  assert.equal(rb.detectReleaseProcess(c).verdict, 'conflict');
});

test('detectReleaseProcess: v* tags are never conflict evidence (root scan only, no tag input)', () => {
  const a = tmp(); write(a, 'package.json', '{"version":"1.0.0"}');
  assert.deepEqual(rb.detectReleaseProcess(a), { verdict: 'fresh' });
});

test('resolveReleaseType: exactly one stack row -> its type; zero or two rows -> simple', () => {
  const node = tmp(); write(node, 'package.json', '{"name":"x","version":"1.0.0"}');
  assert.deepEqual(rb.resolveReleaseType(node), { releaseType: 'node', extraFiles: [] });
  const rust = tmp(); write(rust, 'Cargo.toml', '[package]\nname = "x"\nversion = "0.3.0"\n');
  assert.equal(rb.resolveReleaseType(rust).releaseType, 'rust');
  const dotnet = tmp(); write(dotnet, 'App.csproj', '<Project />');
  assert.equal(rb.resolveReleaseType(dotnet).releaseType, 'dotnet');
  const two = tmp(); write(two, 'package.json', '{}'); write(two, 'go.mod', 'module x');
  assert.equal(rb.resolveReleaseType(two).releaseType, 'simple');
  assert.equal(rb.resolveReleaseType(tmp()).releaseType, 'simple');
  const dirPkg = tmp(); fs.mkdirSync(path.join(dirPkg, 'package.json'));
  assert.equal(rb.resolveReleaseType(dirPkg).releaseType, 'simple');
});

test('resolveReleaseType: simple names the first version-bearing JSON manifest as an extra-file', () => {
  const a = tmp(); write(a, 'plugin/.claude-plugin/plugin.json', '{"name":"p","version":"6.1.0"}');
  assert.deepEqual(rb.resolveReleaseType(a), { releaseType: 'simple', extraFiles: [{ type: 'json', path: 'plugin/.claude-plugin/plugin.json', jsonpath: '$.version' }] });
  const b = tmp(); write(b, 'thing.json', '{"version":"2.0.0"}'); write(b, 'other.json', '{"noversion":true}');
  assert.deepEqual(rb.resolveReleaseType(b).extraFiles, [{ type: 'json', path: 'thing.json', jsonpath: '$.version' }]);
});

test('readStackManifestVersion: node/php read JSON version, python/rust read the TOML version line, others null', () => {
  const node = tmp(); write(node, 'package.json', '{"version":"1.4.2"}');
  assert.equal(rb.readStackManifestVersion(node, 'node'), '1.4.2');
  const py = tmp(); write(py, 'pyproject.toml', '[project]\nname = "x"\nversion = "0.9.1"\n');
  assert.equal(rb.readStackManifestVersion(py, 'python'), '0.9.1');
  const rust = tmp(); write(rust, 'Cargo.toml', '[package]\nversion = "0.3.0"\n');
  assert.equal(rb.readStackManifestVersion(rust, 'rust'), '0.3.0');
  assert.equal(rb.readStackManifestVersion(tmp(), 'go'), null);
  const bad = tmp(); write(bad, 'package.json', '{"version":"not-semver"}');
  assert.equal(rb.readStackManifestVersion(bad, 'node'), null);
});

test('seedManifestVersion: newest v* tag by semver precedence, never lexicographic (AC 8)', () => {
  assert.equal(rb.seedManifestVersion({ tags: ['v1.9.0', 'v1.10.0'], manifestVersion: '0.0.1' }), '1.10.0');
  assert.equal(rb.seedManifestVersion({ tags: ['v1.10.0', 'v1.9.0', 'v0.2.0'], manifestVersion: null }), '1.10.0');
  assert.equal(rb.seedManifestVersion({ tags: ['release-2024', 'v1.2'], manifestVersion: '3.0.0' }), '3.0.0'); // non-semver tags ignored
  assert.equal(rb.seedManifestVersion({ tags: [], manifestVersion: '2.5.0' }), '2.5.0');
  assert.equal(rb.seedManifestVersion({ tags: [], manifestVersion: null }), '0.1.0');
});

test('renderers: workflow, config, manifest, policy rows', () => {
  const wf = rb.renderWorkflowYaml({ branch: 'develop' });
  assert.match(wf, /uses: googleapis\/release-please-action@v4/);
  assert.match(wf, /branches:\n\s+- develop/);
  assert.match(wf, /contents: write/);
  assert.match(wf, /pull-requests: write/);
  assert.match(wf, /config-file: release-please-config\.json/);
  assert.match(wf, /manifest-file: \.release-please-manifest\.json/);
  const cfg = JSON.parse(rb.renderConfig({ releaseType: 'node', extraFiles: [] }));
  assert.equal(cfg.packages['.']['release-type'], 'node');
  assert.equal(cfg.packages['.']['bump-minor-pre-major'], false);
  assert.equal(cfg.packages['.']['include-component-in-tag'], false);
  assert.equal('extra-files' in cfg.packages['.'], false);
  assert.ok(rb.isBootstrapShaped(cfg));
  const simple = JSON.parse(rb.renderConfig({ releaseType: 'simple', extraFiles: [{ type: 'json', path: 'p.json', jsonpath: '$.version' }] }));
  assert.deepEqual(simple.packages['.']['extra-files'], [{ type: 'json', path: 'p.json', jsonpath: '$.version' }]);
  assert.deepEqual(JSON.parse(rb.renderManifest('1.10.0')), { '.': '1.10.0' });
  assert.ok(rb.renderConfig({ releaseType: 'node', extraFiles: [] }).endsWith('\n'));
  const rows = rb.renderPolicyRows();
  assert.equal(rows.length, 2);
  assert.match(rows[0], /^# release-hook: /);
  assert.equal(rows[1], '# release-train: false');
});
