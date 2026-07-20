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

test('parseStatusBranch: clean branch with no upstream', () => {
  assert.deepStrictEqual(sl.parseStatusBranch('## main\n'), { branch: 'main', dirty: false });
});

test('parseStatusBranch: dirty branch with tracked upstream and ahead/behind info', () => {
  assert.deepStrictEqual(
    sl.parseStatusBranch('## main...origin/main [ahead 1]\n M file.js\n'),
    { branch: 'main', dirty: true },
  );
});

test('parseStatusBranch: fresh repo with no commits yet', () => {
  assert.deepStrictEqual(sl.parseStatusBranch('## No commits yet on main\n'), { branch: 'main', dirty: false });
});

test('parseStatusBranch: detached HEAD reports no branch', () => {
  assert.deepStrictEqual(sl.parseStatusBranch('## HEAD (no branch)\n'), { branch: null, dirty: false });
});

test('parseStatusBranch: empty or unparseable output reports no branch', () => {
  assert.deepStrictEqual(sl.parseStatusBranch(''), { branch: null, dirty: false });
});

test('renderGit: uses the passed cwd rather than the process-wide cwd', () => {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-git-'));
  try {
    execFileSync('git', ['init', '-q', '-b', 'feature/isolated-branch'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: repoDir });
    fs.writeFileSync(path.join(repoDir, 'file.txt'), 'hello\n');
    execFileSync('git', ['add', 'file.txt'], { cwd: repoDir });
    execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: repoDir });

    // The real process cwd (this repo checkout) is on a different branch, so if renderGit
    // ever regresses to relying on execSync's implicit process.cwd() instead of the passed
    // cwd, this would report the wrong (or no) branch instead of the isolated repo's.
    const realBranch = execFileSync('git', ['branch', '--show-current'], { cwd: process.cwd(), encoding: 'utf8' }).trim();
    assert.notStrictEqual(realBranch, 'feature/isolated-branch');

    const orig = process.env.NO_COLOR;
    process.env.NO_COLOR = '1';
    try {
      assert.strictEqual(sl.renderGit(repoDir), 'feature/isolated-branch');
    } finally {
      if (orig === undefined) delete process.env.NO_COLOR;
      else process.env.NO_COLOR = orig;
    }
  } finally {
    fs.rmSync(repoDir, { recursive: true, force: true });
  }
});

test('readStdin: clears the 50ms fallback timeout once stdin ends (regression: dangling timer)', async () => {
  const { EventEmitter } = require('node:events');
  const fakeStdin = new EventEmitter();
  fakeStdin.isTTY = false;
  fakeStdin.setEncoding = () => {};

  const stdinDescriptor = Object.getOwnPropertyDescriptor(process, 'stdin');
  Object.defineProperty(process, 'stdin', { value: fakeStdin, configurable: true });

  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  let capturedTimer = null;
  let clearedWith = null;
  global.setTimeout = (fn, ms, ...args) => {
    capturedTimer = originalSetTimeout(fn, ms, ...args);
    return capturedTimer;
  };
  global.clearTimeout = (t) => {
    clearedWith = t;
    return originalClearTimeout(t);
  };

  try {
    const promise = sl.readStdin();
    fakeStdin.emit('data', '{"ok":true}');
    fakeStdin.emit('end');
    const result = await promise;
    assert.strictEqual(result, '{"ok":true}');
    assert.ok(capturedTimer !== null, 'expected the 50ms fallback timer to be scheduled');
    assert.strictEqual(clearedWith, capturedTimer, 'expected the fallback timer to be cleared once stdin ended');
  } finally {
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
    Object.defineProperty(process, 'stdin', stdinDescriptor);
  }
});

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

test('renderProject returns null when no directory or fallback available', () => {
  assert.strictEqual(sl.renderProject({}), null);
});

test('renderProject: falls back to explicit fallbackCwd when nothing else available', () => {
  assert.strictEqual(sl.renderProject({}, '/Users/x/Code/fallback-cwd'), 'fallback-cwd');
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

function withLedgers(files, fn) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-ledger-'));
  const plans = path.join(cwd, 'docs', 'plans');
  fs.mkdirSync(plans, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(plans, name), content);
  }
  try {
    return fn(cwd);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}

const LEDGER_HEADER = '| # | Phase | Item | Status | Resolution |\n| --- | --- | --- | --- | --- |\n';

test('findOpenLedger returns null when no ledger files exist', () => {
  withLedgers({}, (cwd) => {
    assert.strictEqual(sl.findOpenLedger(cwd), null);
  });
});

test('findOpenLedger returns null when cwd has no docs/plans', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-noplans-'));
  try {
    assert.strictEqual(sl.findOpenLedger(cwd), null);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('findOpenLedger returns null when all rows are terminal', () => {
  withLedgers(
    {
      'a-ledger.md': `${LEDGER_HEADER}| 1 | build | item | fixed | done |\n| 2 | test | item | observation | n/a |\n`,
    },
    (cwd) => assert.strictEqual(sl.findOpenLedger(cwd), null),
  );
});

test('findOpenLedger counts open rows in a single ledger', () => {
  withLedgers(
    {
      'a-ledger.md': `${LEDGER_HEADER}| 1 | build | item | open | — |\n| 2 | test | item | fixed | done |\n`,
    },
    (cwd) => assert.match(sl.findOpenLedger(cwd), /ledger: 1 open/),
  );
});

test('findOpenLedger sums open rows across all ledgers in cwd', () => {
  withLedgers(
    {
      'spec-1-ledger.md': `${LEDGER_HEADER}| 1 | build | item | open | — |\n`,
      'spec-2-ledger.md': `${LEDGER_HEADER}| 1 | build | item | open | — |\n| 2 | test | item | open | — |\n`,
      'spec-3-ledger.md': `${LEDGER_HEADER}| 1 | build | item | fixed | done |\n`,
    },
    (cwd) => assert.match(sl.findOpenLedger(cwd), /ledger: 3 open/),
  );
});

test('findOpenLedger colors yellow at >=3 open and red at >=10', () => {
  const orig = process.env.NO_COLOR;
  delete process.env.NO_COLOR;
  const threeRows = Array.from({ length: 3 }, (_, i) => `| ${i + 1} | build | item | open | — |`).join('\n');
  const tenRows = Array.from({ length: 10 }, (_, i) => `| ${i + 1} | build | item | open | — |`).join('\n');
  withLedgers({ 'a-ledger.md': `${LEDGER_HEADER}${threeRows}\n` }, (cwd) => {
    assert.ok(sl.findOpenLedger(cwd).includes('\x1b[33m'));
  });
  withLedgers({ 'a-ledger.md': `${LEDGER_HEADER}${tenRows}\n` }, (cwd) => {
    assert.ok(sl.findOpenLedger(cwd).includes('\x1b[31m'));
  });
  if (orig !== undefined) process.env.NO_COLOR = orig;
});

function withSpecs(files, fn) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-specs-'));
  const specs = path.join(cwd, 'specs');
  fs.mkdirSync(specs, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(specs, name), content);
  }
  try {
    return fn(cwd);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}

test('findActiveSpec returns spec: NNN for a specs/ file with a 3+ digit numeric prefix', () => {
  withSpecs({ '042-something.md': '# content' }, (cwd) => {
    assert.strictEqual(sl.findActiveSpec(cwd), 'spec: 042');
  });
});

test('findActiveSpec returns null when specs/ is empty', () => {
  withSpecs({}, (cwd) => {
    assert.strictEqual(sl.findActiveSpec(cwd), null);
  });
});

test('findActiveSpec returns null when specs/ does not exist', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-nospecs-'));
  try {
    assert.strictEqual(sl.findActiveSpec(cwd), null);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
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

test('end-to-end: project segment is always present, even with empty input', () => {
  const out = runStatusline({}, { NO_COLOR: '1' });
  assert.ok(out.startsWith(path.basename(process.cwd())), `expected project segment: ${out}`);
});

test('end-to-end: NO_COLOR strips ANSI codes even at high context', () => {
  const out = runStatusline(
    { model: { display_name: 'Sonnet 4.6' }, context_window: { used_percentage: 95 } },
    { NO_COLOR: '1' },
  );
  assert.doesNotMatch(out, /\x1b\[/);
});

test('end-to-end: render under 750ms (best of 3, absorbs load contention)', () => {
  // execFileSync spawns a fresh Node process and a fresh temp HOME per call, so wall-clock
  // time is sensitive to whatever else is competing for CPU (see specs/DEFERRED.md's
  // flaky-statusline-timing entry — isolated runs land at ~100-130ms, but full-suite runs
  // have been observed spiking past 900ms under contention with no change to the renderer
  // itself). Best-of-3 absorbs one contended attempt without masking a genuine regression,
  // which would be slow on every attempt, not just one.
  let best = Infinity;
  for (let i = 0; i < 3; i++) {
    const start = Date.now();
    runStatusline(
      { model: { display_name: 'Sonnet 4.6' }, context_window: { used_percentage: 18 } },
      { NO_COLOR: '1' },
    );
    best = Math.min(best, Date.now() - start);
  }
  assert.ok(best < 750, `statusline too slow even at best of 3 attempts: ${best}ms`);
});
