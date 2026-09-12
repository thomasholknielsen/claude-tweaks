'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../../../plugin/bin/lib/release-local/manifest.js');

const files = (map) => ({ readFile: (p) => (Object.prototype.hasOwnProperty.call(map, p) ? map[p] : null), map });
const config = (releaseType, extraFiles) => JSON.stringify({ packages: { '.': { 'release-type': releaseType, ...(extraFiles ? { 'extra-files': extraFiles } : {}) } } });

test('readConfig: null without a config, release-type + extra-files with one', () => {
  assert.strictEqual(M.readConfig(files({}).readFile), null);
  assert.deepStrictEqual(M.readConfig(files({ 'release-please-config.json': config('node') }).readFile), { releaseType: 'node', extraFiles: [] });
  const ef = [{ type: 'json', path: 'plugin/.claude-plugin/plugin.json', jsonpath: '$.version' }];
  assert.deepStrictEqual(M.readConfig(files({ 'release-please-config.json': config('simple', ef) }).readFile).extraFiles, ef);
});

test('resolveTargets: one row per stack type, the manifest file always, unsupported types throw naming the type', () => {
  assert.deepStrictEqual(M.resolveTargets({ releaseType: 'node', extraFiles: [] }).map((t) => [t.path, t.kind]),
    [['.release-please-manifest.json', 'manifest'], ['package.json', 'json'], ['package-lock.json', 'json-lock']]);
  assert.deepStrictEqual(M.resolveTargets({ releaseType: 'python', extraFiles: [] }).map((t) => t.path), ['.release-please-manifest.json', 'pyproject.toml']);
  assert.deepStrictEqual(M.resolveTargets({ releaseType: 'rust', extraFiles: [] }).map((t) => t.path), ['.release-please-manifest.json', 'Cargo.toml']);
  assert.deepStrictEqual(M.resolveTargets({ releaseType: 'php', extraFiles: [] }).map((t) => t.path), ['.release-please-manifest.json', 'composer.json']);
  assert.deepStrictEqual(M.resolveTargets({ releaseType: 'go', extraFiles: [] }).map((t) => t.path), ['.release-please-manifest.json']);
  assert.deepStrictEqual(M.resolveTargets({ releaseType: 'simple', extraFiles: ['VERSION.txt', { type: 'json', path: 'p.json', jsonpath: '$.version' }] }).map((t) => [t.path, t.kind]),
    [['.release-please-manifest.json', 'manifest'], ['version.txt', 'text'], ['VERSION.txt', 'generic'], ['p.json', 'json']]);
  assert.throws(() => M.resolveTargets({ releaseType: 'java', extraFiles: [] }), (e) => e instanceof M.ManifestError && /java/.test(e.message) && /simple/.test(e.message));
  assert.throws(() => M.resolveTargets({ releaseType: 'simple', extraFiles: [{ type: 'yaml', path: 'x.yml' }] }), /yaml/);
  assert.throws(() => M.resolveTargets({ releaseType: 'simple', extraFiles: [{ type: 'json', path: 'p.json', jsonpath: '$.nested.version' }] }), /jsonpath/);
});

test('spliceVersion json: only the version token changes, formatting untouched, previous reported', () => {
  const text = '{\n\t"name": "x",\n\t"version": "1.2.0",\n\t"dependencies": {"y": {"version": "9.9.9"}}\n}\n';
  const out = M.spliceVersion('json', text, '1.3.0');
  assert.strictEqual(out.text, text.replace('"1.2.0"', '"1.3.0"'));
  assert.strictEqual(out.previous, '1.2.0');
  assert.strictEqual(M.spliceVersion('json', '{"name":"x"}', '1.3.0').found, false);
});

test('spliceVersion json-lock: the first two root tokens change, nested dependency versions do not', () => {
  const text = '{\n  "name": "x",\n  "version": "1.2.0",\n  "packages": {\n    "": {\n      "version": "1.2.0"\n    },\n    "node_modules/y": {\n      "version": "1.2.0"\n    }\n  }\n}\n';
  const out = M.spliceVersion('json-lock', text, '1.3.0');
  assert.strictEqual((out.text.match(/1\.3\.0/g) || []).length, 2);
  assert.ok(out.text.includes('"node_modules/y": {\n      "version": "1.2.0"'));
});

test('spliceVersion toml: the version under the named section, other sections untouched', () => {
  const text = '[build-system]\nversion = "0.0.1"\n\n[project]\nname = "x"\nversion = "1.2.0"   # keep comment\n\n[tool.poetry]\nversion = "1.2.0"\n';
  const out = M.spliceVersion('toml', text, '1.3.0', { sections: ['project', 'tool.poetry'] });
  assert.strictEqual(out.text, text.replace('version = "1.2.0"   # keep', 'version = "1.3.0"   # keep'));
  assert.strictEqual(out.previous, '1.2.0');
  const poetryOnly = '[tool.poetry]\nversion = "1.2.0"\n';
  assert.strictEqual(M.spliceVersion('toml', poetryOnly, '1.3.0', { sections: ['project', 'tool.poetry'] }).text, '[tool.poetry]\nversion = "1.3.0"\n');
});

test('spliceVersion text/generic/manifest', () => {
  assert.deepStrictEqual(M.spliceVersion('text', '1.2.0\n', '1.3.0'), { text: '1.3.0\n', found: true, previous: '1.2.0' });
  assert.deepStrictEqual(M.spliceVersion('text', null, '1.3.0'), { text: '1.3.0', found: false, previous: null });
  const gen = 'FOO=1\nAPP_VERSION=1.2.0 # x-release-please-version\nOTHER=1.2.0\n';
  assert.strictEqual(M.spliceVersion('generic', gen, '1.3.0').text, 'FOO=1\nAPP_VERSION=1.3.0 # x-release-please-version\nOTHER=1.2.0\n');
  assert.strictEqual(M.spliceVersion('manifest', '{\n  ".": "1.2.0"\n}\n', '1.3.0').text, '{\n  ".": "1.3.0"\n}\n');
});

test('currentVersion / versionAtRef: manifest file first, then the stack manifest, null when nothing carries a version', () => {
  const t = M.resolveTargets({ releaseType: 'node', extraFiles: [] });
  assert.strictEqual(M.currentVersion(t, files({ '.release-please-manifest.json': '{".": "1.2.0"}', 'package.json': '{"version": "1.1.0"}' }).readFile), '1.2.0');
  assert.strictEqual(M.currentVersion(t, files({ 'package.json': '{"version": "1.1.0"}' }).readFile), '1.1.0');
  assert.strictEqual(M.currentVersion(t, files({}).readFile), null);
  const show = (p) => { if (p === 'package.json') return '{"version": "1.1.0"}'; throw new Error(`fatal: path '${p}' does not exist in 'main'`); };
  assert.strictEqual(M.versionAtRef(t, show), '1.1.0');
  const bad = () => { throw new Error('fatal: invalid object name'); };
  assert.throws(() => M.versionAtRef(t, bad), /invalid object name/);
});

test('applyVersion: writes only files that exist (optional targets skipped, text created), reports previous values', () => {
  const store = { 'package.json': '{"version": "1.2.0"}\n' };
  const writes = [];
  const t = M.resolveTargets({ releaseType: 'node', extraFiles: [] });
  const out = M.applyVersion(t, '1.2.0', '1.3.0', (p) => (p in store ? store[p] : null), (p, text) => { writes.push(p); store[p] = text; });
  assert.deepStrictEqual(writes, ['package.json']);
  assert.deepStrictEqual(out, [{ path: 'package.json', previous: '1.2.0' }]);
  assert.strictEqual(store['package.json'], '{"version": "1.3.0"}\n');
  const simple = M.resolveTargets({ releaseType: 'simple', extraFiles: [] });
  const s2 = {}; const w2 = [];
  M.applyVersion(simple, null, '0.2.0', (p) => (p in s2 ? s2[p] : null), (p, text) => { w2.push(p); s2[p] = text; });
  assert.deepStrictEqual(w2, ['version.txt']);
  assert.strictEqual(s2['version.txt'], '0.2.0');
  assert.throws(() => M.applyVersion(t, '1.2.0', '1.3.0', () => '{"name":"x"}', () => {}), /no version token/);
});
