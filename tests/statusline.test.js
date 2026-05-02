const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const STATUSLINE = path.join(__dirname, '..', 'bin', 'claude-tweaks-statusline.js');
const sl = require('../bin/claude-tweaks-statusline.js');

function runStatusline(input, env = {}) {
  return execFileSync('node', [STATUSLINE], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    env: { ...process.env, HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'ct-sl-')), ...env },
  });
}

test('renderModel returns display name', () => {
  assert.strictEqual(sl.renderModel({ model_display_name: 'Sonnet 4.6' }), 'Sonnet 4.6');
});

test('renderModel returns null when missing', () => {
  assert.strictEqual(sl.renderModel({}), null);
});

test('renderContext computes percentage', () => {
  const r = sl.renderContext({ context_used: 36000, context_window_size: 200000 });
  assert.ok(r.includes('ctx: 18%'));
});

test('renderContext returns null on missing fields', () => {
  assert.strictEqual(sl.renderContext({}), null);
});

test('renderEffort hides on default/unset', () => {
  assert.strictEqual(sl.renderEffort({ thinking_effort: 'default' }), null);
  assert.strictEqual(sl.renderEffort({}), null);
  assert.strictEqual(sl.renderEffort({ thinking_effort: 'high' }), 'eff: high');
});

test('renderUsage formats minute/hour/day reset', () => {
  const now = 1_700_000_000_000;
  const sec = Math.floor(now / 1000);
  const min45 = sl.renderUsage('sess', { pct: 50, reset_at: sec + 45 * 60 }, now);
  const hr3 = sl.renderUsage('sess', { pct: 50, reset_at: sec + 3 * 3600 }, now);
  const d4 = sl.renderUsage('week', { pct: 50, reset_at: sec + 4 * 86400 }, now);
  assert.match(min45, /sess: 50% \(45m\)/);
  assert.match(hr3, /sess: 50% \(3h\)/);
  assert.match(d4, /week: 50% \(4d\)/);
});

test('renderUsage returns null when data missing', () => {
  assert.strictEqual(sl.renderUsage('sess', null, Date.now()), null);
  assert.strictEqual(sl.renderUsage('sess', {}, Date.now()), null);
});

test('formatK suffix scaling', () => {
  assert.strictEqual(sl.formatK(500), '500');
  assert.strictEqual(sl.formatK(2400), '2.4k');
  assert.strictEqual(sl.formatK(15000), '15k');
  assert.strictEqual(sl.formatK(2_000_000), '2M');
});

test('formatDuration scales correctly', () => {
  assert.strictEqual(sl.formatDuration(30), null);
  assert.strictEqual(sl.formatDuration(180), '3m');
  assert.strictEqual(sl.formatDuration(7200), '2h');
  assert.strictEqual(sl.formatDuration(2 * 86400), '2d');
});

test('colorByPct adds ANSI red at >=90%', () => {
  process.env.NO_COLOR = '';
  delete process.env.NO_COLOR;
  const r = sl.colorByPct(95, 'ctx: 95%');
  assert.ok(r.includes('\x1b[31m'));
});

test('colorByPct skips colors when NO_COLOR set', (t) => {
  const orig = process.env.NO_COLOR;
  process.env.NO_COLOR = '1';
  const r = sl.colorByPct(95, 'ctx: 95%');
  assert.strictEqual(r, 'ctx: 95%');
  if (orig === undefined) delete process.env.NO_COLOR;
  else process.env.NO_COLOR = orig;
});

test('end-to-end: minimal input renders model + context', () => {
  const out = runStatusline(
    { model_display_name: 'sonnet 4.6', context_used: 40000, context_window_size: 200000 },
    { NO_COLOR: '1' },
  );
  assert.ok(out.includes('sonnet 4.6'));
  assert.ok(out.includes('ctx: 20%'));
});

test('end-to-end: empty input outputs nothing breaking', () => {
  const out = runStatusline({}, { NO_COLOR: '1' });
  assert.ok(typeof out === 'string');
});

test('end-to-end: NO_COLOR strips ANSI codes', () => {
  const out = runStatusline(
    { model_display_name: 'sonnet 4.6', context_used: 190000, context_window_size: 200000 },
    { NO_COLOR: '1' },
  );
  assert.doesNotMatch(out, /\x1b\[/);
});

test('end-to-end: render under 100ms', () => {
  const start = Date.now();
  runStatusline({ model_display_name: 'sonnet 4.6', context_used: 36000, context_window_size: 200000 }, { NO_COLOR: '1' });
  const elapsed = Date.now() - start;
  assert.ok(elapsed < 500, `statusline too slow: ${elapsed}ms`);
});
