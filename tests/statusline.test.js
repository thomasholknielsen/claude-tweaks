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

test('renderModel: nested display_name', () => {
  assert.strictEqual(sl.renderModel({ model: { display_name: 'Sonnet 4.6', id: 'claude-sonnet-4-6' } }), 'Sonnet 4.6');
});

test('renderModel: falls back to id when display_name absent', () => {
  assert.strictEqual(sl.renderModel({ model: { id: 'claude-sonnet-4-6' } }), 'claude-sonnet-4-6');
});

test('renderModel: accepts plain string model', () => {
  assert.strictEqual(sl.renderModel({ model: 'Sonnet 4.6' }), 'Sonnet 4.6');
});

test('renderModel returns null when missing', () => {
  assert.strictEqual(sl.renderModel({}), null);
});

test('renderProject: uses workspace.project_dir basename', () => {
  assert.strictEqual(sl.renderProject({ workspace: { project_dir: '/Users/x/Code/claude-tweaks' } }), 'claude-tweaks');
});

test('renderProject: falls back to current_dir when project_dir missing', () => {
  assert.strictEqual(sl.renderProject({ workspace: { current_dir: '/Users/x/Code/other-proj' } }), 'other-proj');
});

test('renderProject: falls back to input.cwd when workspace missing', () => {
  assert.strictEqual(sl.renderProject({ cwd: '/Users/x/Code/fallback' }), 'fallback');
});

test('renderProject returns null when no directory available', () => {
  assert.strictEqual(sl.renderProject({}), null);
});

test('renderContext: uses used_percentage when provided', () => {
  const r = sl.renderContext({ context_window: { used_percentage: 18 } });
  assert.ok(r.includes('ctx: 18%'));
});

test('renderContext: falls back to token math when percentage absent', () => {
  const r = sl.renderContext({
    context_window: { total_input_tokens: 36000, context_window_size: 200000 },
  });
  assert.ok(r.includes('ctx: 18%'));
});

test('renderContext returns null on missing context_window', () => {
  assert.strictEqual(sl.renderContext({}), null);
});

test('renderEffort: hides on default/unset/missing', () => {
  assert.strictEqual(sl.renderEffort({}), null);
  assert.strictEqual(sl.renderEffort({ effort: { level: 'default' } }), null);
  assert.strictEqual(sl.renderEffort({ effort: { level: null } }), null);
  assert.strictEqual(sl.renderEffort({ effort: { level: 'high' } }), 'eff: high');
});

test('renderRateLimit: formats reset countdown at minute/hour/day scales', () => {
  const now = 1_700_000_000_000;
  const sec = Math.floor(now / 1000);
  const min45 = sl.renderRateLimit('sess', { used_percentage: 50, resets_at: sec + 45 * 60 }, now);
  const hr3 = sl.renderRateLimit('sess', { used_percentage: 50, resets_at: sec + 3 * 3600 }, now);
  const d4 = sl.renderRateLimit('week', { used_percentage: 50, resets_at: sec + 4 * 86400 }, now);
  assert.match(min45, /sess: 50% \(45m\)/);
  assert.match(hr3, /sess: 50% \(3h\)/);
  assert.match(d4, /week: 50% \(4d\)/);
});

test('renderRateLimit returns null when data missing', () => {
  assert.strictEqual(sl.renderRateLimit('sess', null, Date.now()), null);
  assert.strictEqual(sl.renderRateLimit('sess', {}, Date.now()), null);
});

test('renderRateLimit omits parenthetical when reset is missing', () => {
  const now = 1_700_000_000_000;
  const r = sl.renderRateLimit('sess', { used_percentage: 42 }, now);
  assert.strictEqual(r, 'sess: 42%');
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
  const orig = process.env.NO_COLOR;
  delete process.env.NO_COLOR;
  const r = sl.colorByPct(95, 'ctx: 95%');
  assert.ok(r.includes('\x1b[31m'));
  if (orig !== undefined) process.env.NO_COLOR = orig;
});

test('colorByPct skips colors when NO_COLOR set', () => {
  const orig = process.env.NO_COLOR;
  process.env.NO_COLOR = '1';
  const r = sl.colorByPct(95, 'ctx: 95%');
  assert.strictEqual(r, 'ctx: 95%');
  if (orig === undefined) delete process.env.NO_COLOR;
  else process.env.NO_COLOR = orig;
});

test('end-to-end: real Claude Code schema renders model + context', () => {
  const out = runStatusline(
    {
      model: { id: 'claude-sonnet-4-6', display_name: 'Sonnet 4.6' },
      context_window: { used_percentage: 18, context_window_size: 200000 },
    },
    { NO_COLOR: '1' },
  );
  assert.ok(out.includes('Sonnet 4.6'), `missing model: ${out}`);
  assert.ok(out.includes('ctx: 18%'), `missing ctx: ${out}`);
});

test('end-to-end: project segment renders before model', () => {
  const out = runStatusline(
    {
      workspace: { project_dir: '/Users/x/Code/claude-tweaks' },
      model: { display_name: 'Sonnet 4.6' },
    },
    { NO_COLOR: '1' },
  );
  assert.ok(out.startsWith('claude-tweaks'), `expected project first: ${out}`);
  assert.ok(out.includes('Sonnet 4.6'), `missing model: ${out}`);
});

test('end-to-end: rate_limits flow through to sess/week segments', () => {
  const sec = Math.floor(Date.now() / 1000);
  const out = runStatusline(
    {
      model: { display_name: 'Sonnet 4.6' },
      rate_limits: {
        five_hour: { used_percentage: 42, resets_at: sec + 3 * 3600 },
        seven_day: { used_percentage: 71, resets_at: sec + 4 * 86400 },
      },
    },
    { NO_COLOR: '1' },
  );
  assert.ok(out.includes('sess: 42%'), `missing sess: ${out}`);
  assert.ok(out.includes('week: 71%'), `missing week: ${out}`);
});

test('end-to-end: effort segment renders when level is set', () => {
  const out = runStatusline(
    { model: { display_name: 'Sonnet 4.6' }, effort: { level: 'high' } },
    { NO_COLOR: '1' },
  );
  assert.ok(out.includes('eff: high'), `missing eff: ${out}`);
});

test('end-to-end: empty input does not crash', () => {
  const out = runStatusline({}, { NO_COLOR: '1' });
  assert.ok(typeof out === 'string');
});

test('end-to-end: NO_COLOR strips ANSI codes even at high context', () => {
  const out = runStatusline(
    { model: { display_name: 'Sonnet 4.6' }, context_window: { used_percentage: 95 } },
    { NO_COLOR: '1' },
  );
  assert.doesNotMatch(out, /\x1b\[/);
});

test('end-to-end: render under 500ms', () => {
  const start = Date.now();
  runStatusline(
    { model: { display_name: 'Sonnet 4.6' }, context_window: { used_percentage: 18 } },
    { NO_COLOR: '1' },
  );
  const elapsed = Date.now() - start;
  assert.ok(elapsed < 500, `statusline too slow: ${elapsed}ms`);
});
