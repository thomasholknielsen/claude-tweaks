const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { detectAreas, selectAreas } = require('../areas');

function tmpRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'recon-areas-'));
}

test('detectAreas falls back to a single "." area when no workspace markers', () => {
  const root = tmpRepo();
  const areas = detectAreas(root);
  assert.deepStrictEqual(areas, [{ id: '.', globs: ['.'], flags: {} }]);
});

test('detectAreas reads package.json workspaces and only counts dirs with a manifest', () => {
  const root = tmpRepo();
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ workspaces: ['apps/*'] }));
  fs.mkdirSync(path.join(root, 'apps', 'web'), { recursive: true });
  fs.writeFileSync(path.join(root, 'apps', 'web', 'package.json'), '{}');
  fs.mkdirSync(path.join(root, 'apps', 'empty'), { recursive: true }); // no manifest -> excluded
  const areas = detectAreas(root);
  assert.deepStrictEqual(areas, [{ id: 'apps/web', globs: ['apps/web'], flags: {} }]);
});

test('selectAreas passes through when no --area filter', () => {
  const areas = [{ id: 'a', globs: ['a'], flags: {} }, { id: 'b', globs: ['b'], flags: {} }];
  assert.deepStrictEqual(selectAreas(areas, {}), areas);
});

test('selectAreas filters to the requested area', () => {
  const areas = [{ id: 'a', globs: ['a'], flags: {} }, { id: 'b', globs: ['b'], flags: {} }];
  assert.deepStrictEqual(selectAreas(areas, { area: 'b' }), [{ id: 'b', globs: ['b'], flags: {} }]);
});

test('selectAreas with --area not in detected set synthesizes an explicit area', () => {
  const areas = [{ id: 'a', globs: ['a'], flags: {} }];
  assert.deepStrictEqual(selectAreas(areas, { area: 'packages/x' }),
    [{ id: 'packages/x', globs: ['packages/x'], flags: {} }]);
});
