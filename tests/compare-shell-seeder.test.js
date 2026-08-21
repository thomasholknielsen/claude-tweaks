'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SEEDER = path.join(__dirname, '..', 'plugin', 'skills', 'design-wrapper', 'compare-shell', 'seed-compare.mjs');
const FIXTURES = path.join(__dirname, 'fixtures', 'compare-shell');

function mkOut(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'compare-shell-'));
  return path.join(dir, name);
}

function loadIsland(htmlText) {
  const m = htmlText.match(/<script id="vd-data" type="application\/json">([\s\S]*?)<\/script>/);
  assert.ok(m, 'expected a vd-data JSON island in the output');
  return JSON.parse(m[1]);
}

function seedCli(args) {
  const res = spawnSync(process.execPath, [SEEDER, ...args], { encoding: 'utf8' });
  return { code: res.status, out: res.stdout || '', err: res.stderr || '' };
}

test('AC1 / AC9: live mode — one variant per manifest entry referencing its served path, /events + /stream wiring, focus-view indicator + grid selection affordances', () => {
  const out = mkOut('live-layout.html');
  const res = seedCli(['--manifest', path.join(FIXTURES, 'layout', 'manifest.json'), '--mode', 'live', '--out', out]);
  assert.equal(res.code, 0, res.err);
  const html = fs.readFileSync(out, 'utf8');
  const data = loadIsland(html);
  assert.equal(data.mode, 'live');
  assert.equal(data.variants.length, 4);
  assert.equal(data.variants.filter((v) => !v.degraded).map((v) => v.src).sort().join(','), 'variant-a.html,variant-b.html,variant-hostile.html'.split(',').sort().join(','));
  assert.match(html, /fetch\('\/events'/);
  assert.match(html, /new EventSource\('\/stream'\)/);
  assert.match(html, /id="focus-indicator"/);
  assert.match(html, /classList\.toggle\('selected'/);
});

test('AC2 / AC7: durable mode — zero http(s), embeds every variant sentinel safely, stamps outcome metadata', () => {
  const out = mkOut('durable-layout.html');
  const res = seedCli(['--manifest', path.join(FIXTURES, 'layout', 'manifest.json'), '--mode', 'durable', '--out', out]);
  assert.equal(res.code, 0, res.err);
  const html = fs.readFileSync(out, 'utf8');
  assert.equal(/https?:\/\//.test(html), false, 'durable output must not reference http(s)');

  const data = loadIsland(html);
  assert.equal(data.mode, 'durable');
  const byId = Object.fromEntries(data.variants.map((v) => [v.id, v]));
  assert.match(byId.a.content, /SENTINEL_LAYOUT_A/);
  assert.match(byId.b.content, /SENTINEL_LAYOUT_B/);
  assert.match(byId.hostile.content, /SENTINEL_HOSTILE/);
  // the hostile sentinel survives round-trip through the JSON island without
  // ever appearing as raw, unescaped page-breaking markup
  assert.match(byId.hostile.content, /<\/textarea><\/iframe>"'/);
  assert.equal(html.includes('</script><\\/script'), false);

  assert.equal(data.outcome.winner, 'a');
  assert.equal(data.outcome.seedKey, 'seed-layout-1');
  assert.equal(data.outcome.rerollCount, 0);
  assert.deepEqual(data.outcome.steerHistory, []);
  assert.ok(data.outcome.date);
});

test('AC4: degraded variant renders in both scopes — labeled, counted, never a pick target', () => {
  const out = mkOut('durable-degraded.html');
  const res = seedCli(['--manifest', path.join(FIXTURES, 'layout', 'manifest.json'), '--mode', 'durable', '--out', out]);
  assert.equal(res.code, 0, res.err);
  const data = loadIsland(fs.readFileSync(out, 'utf8'));
  const degraded = data.variants.find((v) => v.id === 'd');
  assert.equal(degraded.degraded, true);
  assert.equal(degraded.reason, 'render timed out');
  assert.equal(degraded.content, undefined);
  assert.equal(data.variants.length, 4); // indicator's {N} counts every slot, degraded included
  const html = fs.readFileSync(out, 'utf8');
  assert.match(html, /v\.degraded/); // pick-target/grid-selection code paths check this flag
});

test('AC5: refusal cases exit non-zero naming the offending variant/field; a size warning still writes the file', () => {
  const missing = seedCli(['--manifest', path.join(FIXTURES, 'refusals', 'missing-file-manifest.json'), '--mode', 'live', '--out', mkOut('x.html')]);
  assert.notEqual(missing.code, 0);
  assert.match(missing.err, /missing artifact file/);
  assert.match(missing.err, /does-not-exist\.html/);

  const dup = seedCli(['--manifest', path.join(FIXTURES, 'refusals', 'duplicate-id-manifest.json'), '--mode', 'live', '--out', mkOut('x.html')]);
  assert.notEqual(dup.code, 0);
  assert.match(dup.err, /duplicate variant id: a/);

  const noOutcome = seedCli(['--manifest', path.join(FIXTURES, 'refusals', 'no-outcome-manifest.json'), '--mode', 'durable', '--out', mkOut('x.html')]);
  assert.notEqual(noOutcome.code, 0);
  assert.match(noOutcome.err, /requires manifest\.outcome/);

  const badWinner = seedCli(['--manifest', path.join(FIXTURES, 'refusals', 'unknown-winner-manifest.json'), '--mode', 'durable', '--out', mkOut('x.html')]);
  assert.notEqual(badWinner.code, 0);
  assert.match(badWinner.err, /outcome\.winner "nonexistent" not found/);
});

test('AC5 (size warning): oversized output still writes, with a stderr warning', async () => {
  const bigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'compare-shell-big-'));
  const bigFile = path.join(bigDir, 'big.html');
  fs.writeFileSync(bigFile, `<!doctype html><body>${'x'.repeat(3 * 1024 * 1024)}</body>`);
  const manifestPath = path.join(bigDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    scope: 'layout',
    seedKey: 'seed-big',
    variants: [{ id: 'a', name: 'A', files: ['big.html'] }],
    outcome: { winner: 'a', date: '2026-08-21T00:00:00.000Z' },
  }));
  const out = mkOut('big-out.html');
  const res = seedCli(['--manifest', manifestPath, '--mode', 'durable', '--out', out]);
  assert.equal(res.code, 0, res.err);
  assert.match(res.err, /over the .* size guideline/);
  assert.equal(fs.existsSync(out), true);
});

test('AC6: identity scope — 1 markup + 3 skins produces 3 variant frames; each srcdoc carries shared + its own skin, never a sibling\'s', () => {
  const out = mkOut('durable-identity.html');
  const res = seedCli(['--manifest', path.join(FIXTURES, 'identity', 'manifest.json'), '--mode', 'durable', '--out', out]);
  assert.equal(res.code, 0, res.err);
  const data = loadIsland(fs.readFileSync(out, 'utf8'));
  assert.equal(data.variants.length, 3);
  const byId = Object.fromEntries(data.variants.map((v) => [v.id, v]));
  assert.match(byId.a.content, /SENTINEL_SHARED_MARKUP/);
  assert.match(byId.a.content, /SENTINEL_SKIN_A/);
  assert.doesNotMatch(byId.a.content, /SENTINEL_SKIN_B/);
  assert.doesNotMatch(byId.a.content, /SENTINEL_SKIN_C/);
  assert.match(byId.b.content, /SENTINEL_SHARED_MARKUP/);
  assert.match(byId.b.content, /SENTINEL_SKIN_B/);
  assert.doesNotMatch(byId.b.content, /SENTINEL_SKIN_A/);
});

test('AC6: layout scope — 3 whole markups produce 3 variant frames', () => {
  const out = mkOut('durable-layout-scope.html');
  const res = seedCli(['--manifest', path.join(FIXTURES, 'layout', 'manifest.json'), '--mode', 'durable', '--out', out]);
  assert.equal(res.code, 0, res.err);
  const data = loadIsland(fs.readFileSync(out, 'utf8'));
  assert.equal(data.variants.filter((v) => !v.degraded).length, 3);
});

test('AC8: durable-mode verdict buttons carry disabled, and listener attachment never runs under the durable flag', () => {
  const out = mkOut('durable-buttons.html');
  const res = seedCli(['--manifest', path.join(FIXTURES, 'layout', 'manifest.json'), '--mode', 'durable', '--out', out]);
  assert.equal(res.code, 0, res.err);
  const html = fs.readFileSync(out, 'utf8');
  assert.match(html, /var MODE = "durable";/);
  assert.match(html, /if \(MODE === 'live'\) \{\s*\n\s*attachVerdictHandlers\(\);/);
  assert.match(html, /btnPick\.disabled = true;/);
  assert.match(html, /btnReroll\.disabled = true;/);
});

test('AC10: npm test picks up this suite (self-check — file lives under tests/)', () => {
  assert.match(__filename, /tests[\\/]compare-shell-seeder\.test\.js$/);
});

test('unit: assembleIdentityDoc inlines skin CSS before </head>', async () => {
  const mod = await import(require('node:url').pathToFileURL(SEEDER).href);
  const doc = mod.assembleIdentityDoc('<html><head><title>t</title></head><body>x</body></html>', 'body{color:red}');
  assert.match(doc, /<style>body\{color:red\}<\/style><\/head>/);
});

test('unit: escapeForInlineScript neutralizes </script regardless of case', async () => {
  const mod = await import(require('node:url').pathToFileURL(SEEDER).href);
  const escaped = mod.escapeForInlineScript('before </SCRIPT> after </script src="x">');
  assert.equal(/<\/script/i.test(escaped), false);
  assert.match(escaped, /<\\\/script/i);
});
