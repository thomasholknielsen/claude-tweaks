'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { checkA, checkB, checkC, headroomCheck, looksPassing, isGovernedMdPath } = require('../../../plugin/bin/lib/plan-audit/checks');
const { CEILING_BYTES } = require('../../../plugin/bin/lib/skill-audit/context-cost');

function makeTmpRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'plan-audit-checks-'));
}

// ── Check A ──────────────────────────────────────────────────────────────

test('checkA fails when a Modify path does not exist', () => {
  const repo = makeTmpRepo();
  try {
    const result = checkA([{ type: 'Modify', path: 'nope.js' }], repo);
    assert.strictEqual(result.ok, false);
    assert.deepStrictEqual(result.missing, ['nope.js']);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('checkA passes for Create when the parent directory exists, even though the file itself does not', () => {
  const repo = makeTmpRepo();
  fs.mkdirSync(path.join(repo, 'plugin', 'bin'), { recursive: true });
  try {
    const result = checkA([{ type: 'Create', path: 'plugin/bin/new.js' }], repo);
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.missing, []);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('checkA fails for Create when even the parent directory is missing', () => {
  const repo = makeTmpRepo();
  try {
    const result = checkA([{ type: 'Create', path: 'nowhere/new.js' }], repo);
    assert.strictEqual(result.ok, false);
    assert.deepStrictEqual(result.missing, ['nowhere/new.js']);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('checkA passes for an existing Delete path', () => {
  const repo = makeTmpRepo();
  fs.writeFileSync(path.join(repo, 'gone.js'), '');
  try {
    const result = checkA([{ type: 'Delete', path: 'gone.js' }], repo);
    assert.strictEqual(result.ok, true);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('checkA treats Test like Create — parent dir suffices for a brand-new test file', () => {
  const repo = makeTmpRepo();
  fs.mkdirSync(path.join(repo, 'tests'), { recursive: true });
  try {
    const result = checkA([{ type: 'Test', path: 'tests/new.test.js' }], repo);
    assert.strictEqual(result.ok, true);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

// ── Check B ──────────────────────────────────────────────────────────────

test('checkB is a no-op (ok, empty) when the plan declares no Scope keywords', () => {
  const repo = makeTmpRepo();
  try {
    assert.deepStrictEqual(checkB([], [], repo), { ok: true, unplanned: [] });
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('checkB flags a matched file absent from the plan', () => {
  const repo = makeTmpRepo();
  fs.writeFileSync(path.join(repo, 'unplanned.txt'), 'mentions PLAYWRIGHT_MCP here');
  try {
    const result = checkB(['PLAYWRIGHT_MCP'], [], repo);
    assert.strictEqual(result.ok, false);
    assert.deepStrictEqual(result.unplanned, ['unplanned.txt']);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('checkB does not flag a matched file that IS in the plan', () => {
  const repo = makeTmpRepo();
  fs.writeFileSync(path.join(repo, 'planned.txt'), 'mentions PLAYWRIGHT_MCP here');
  try {
    const result = checkB(['PLAYWRIGHT_MCP'], ['planned.txt'], repo);
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.unplanned, []);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('checkB is case-insensitive', () => {
  const repo = makeTmpRepo();
  fs.writeFileSync(path.join(repo, 'x.txt'), 'lowercase playwright_mcp appears here');
  try {
    const result = checkB(['PLAYWRIGHT_MCP'], [], repo);
    assert.strictEqual(result.ok, false);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('checkB never descends into node_modules or .git (control match)', () => {
  const repo = makeTmpRepo();
  fs.mkdirSync(path.join(repo, 'node_modules'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'node_modules', 'x.txt'), 'PLAYWRIGHT_MCP');
  fs.mkdirSync(path.join(repo, '.git'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.git', 'x.txt'), 'PLAYWRIGHT_MCP');
  try {
    const result = checkB(['PLAYWRIGHT_MCP'], [], repo);
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.unplanned, []);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

// ── Check C ──────────────────────────────────────────────────────────────

test('looksPassing: exit code 0 is always a passing signature', () => {
  assert.strictEqual(looksPassing(0, ''), true);
});

test('looksPassing: non-zero exit with failure markers is not a passing signature', () => {
  assert.strictEqual(looksPassing(1, 'FAIL: 1 test failed'), false);
});

test('looksPassing: non-zero exit is not a passing signature even with a stray "PASS" substring alongside a failure marker', () => {
  assert.strictEqual(looksPassing(1, 'PASS suite-a\nFAIL suite-b'), false);
});

test('checkC flags a task whose command already exits 0 despite declaring Expected: FAIL', () => {
  const calls = [];
  const deps = { run: (command, cwd) => { calls.push({ command, cwd }); return { exitCode: 0, output: '# tests 3\n# pass 3\n' }; } };
  const result = checkC(
    [{ taskNumber: '1', title: 'A', command: 'node --test a.test.js', expected: 'FAIL with "not defined"' }],
    '/repo', deps,
  );
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.findings.length, 1);
  assert.strictEqual(result.findings[0].task, '1');
  assert.deepStrictEqual(calls, [{ command: 'node --test a.test.js', cwd: '/repo' }]);
});

test('checkC does not flag a command that errors or cleanly fails pre-dispatch', () => {
  const deps = { run: () => ({ exitCode: 1, output: 'Error: Cannot find module\n' }) };
  const result = checkC(
    [{ taskNumber: '5', title: 'Later task', command: 'node --test e.test.js', expected: 'FAIL with "not defined"' }],
    '/repo', deps,
  );
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.findings, []);
});

test('checkC with no verification checks passes trivially', () => {
  const result = checkC([], '/repo', { run: () => { throw new Error('must not be called'); } });
  assert.strictEqual(result.ok, true);
});

test('checkC returns an empty warnings array when no unparseable Step 2s are passed', () => {
  const result = checkC([], '/repo', { run: () => { throw new Error('must not be called'); } });
  assert.deepStrictEqual(result.warnings, []);
});

test('checkC surfaces unparseable Step 2s as warnings without affecting ok or findings', () => {
  const unparseableStep2s = [
    { taskNumber: '3', title: 'Add the row', raw: '- [ ] **Step 2: Run it to confirm FAIL**\n\n```bash\nnode --test x.test.js\n```' },
  ];
  const result = checkC([], '/repo', {}, unparseableStep2s);
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.findings, []);
  assert.strictEqual(result.warnings.length, 1);
  assert.strictEqual(result.warnings[0].task, '3');
  assert.strictEqual(result.warnings[0].title, 'Add the row');
  assert.match(result.warnings[0].raw, /Step 2: Run it to confirm FAIL/);
});

test('checkC: a real finding and an unparseable warning coexist independently', () => {
  const deps = { run: () => ({ exitCode: 0, output: 'PASS\n' }) };
  const result = checkC(
    [{ taskNumber: '1', title: 'A', command: 'node -e "process.exit(0)"', expected: 'FAIL' }],
    '/repo', deps,
    [{ taskNumber: '2', title: 'B', raw: 'raw text' }],
  );
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.findings.length, 1);
  assert.strictEqual(result.warnings.length, 1);
  assert.strictEqual(result.warnings[0].task, '2');
});

// ── Headroom ─────────────────────────────────────────────────────────────

test('isGovernedMdPath matches plugin/skills/**/*.md only', () => {
  assert.strictEqual(isGovernedMdPath('plugin/skills/build/SKILL.md'), true);
  assert.strictEqual(isGovernedMdPath('plugin/skills/build/plan-audit.md'), true);
  assert.strictEqual(isGovernedMdPath('docs/plugin-structure.md'), false);
  assert.strictEqual(isGovernedMdPath('plugin/bin/lib/plan-audit/checks.js'), false);
});

function writeFileOfSize(filePath, bytes) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, 'x'.repeat(bytes));
}

test('headroomCheck flags a near-ceiling governed file with < 1,024 B headroom (soft flag, ok stays true) — see #553', () => {
  const repo = makeTmpRepo();
  const rel = 'plugin/skills/build/plan-audit.md';
  writeFileOfSize(path.join(repo, rel), CEILING_BYTES - 500);
  try {
    const result = headroomCheck([{ type: 'Modify', path: rel }], repo);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.breaches.length, 0);
    assert.strictEqual(result.nearCeiling.length, 1);
    assert.strictEqual(result.nearCeiling[0].file, rel);
    assert.strictEqual(result.nearCeiling[0].headroom, 500);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('headroomCheck reports a breach (ok: false) for a governed file already over the ceiling', () => {
  const repo = makeTmpRepo();
  const rel = 'plugin/skills/build/SKILL.md';
  writeFileOfSize(path.join(repo, rel), CEILING_BYTES + 200);
  try {
    const result = headroomCheck([{ type: 'Modify', path: rel }], repo);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.breaches.length, 1);
    assert.strictEqual(result.breaches[0].file, rel);
    assert.strictEqual(result.breaches[0].bytes, CEILING_BYTES + 200);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('headroomCheck ignores a non-governed .md file even when near the ceiling', () => {
  const repo = makeTmpRepo();
  const rel = 'docs/plugin-structure.md';
  writeFileOfSize(path.join(repo, rel), CEILING_BYTES + 200);
  try {
    const result = headroomCheck([{ type: 'Modify', path: rel }], repo);
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.nearCeiling, []);
    assert.deepStrictEqual(result.breaches, []);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('headroomCheck ignores Create entries — nothing to measure yet', () => {
  const repo = makeTmpRepo();
  try {
    const result = headroomCheck([{ type: 'Create', path: 'plugin/skills/build/new.md' }], repo);
    assert.deepStrictEqual(result, { ok: true, nearCeiling: [], breaches: [] });
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('a clean plan (no missing paths, no scope keywords, no FAIL findings, no headroom issues) passes every check', () => {
  const repo = makeTmpRepo();
  const rel = 'plugin/skills/build/plan-audit.md';
  writeFileOfSize(path.join(repo, rel), 1000);
  try {
    const a = checkA([{ type: 'Modify', path: rel }], repo);
    const b = checkB([], [], repo);
    const c = checkC([], repo);
    const h = headroomCheck([{ type: 'Modify', path: rel }], repo);
    assert.ok(a.ok && b.ok && c.ok && h.ok);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
