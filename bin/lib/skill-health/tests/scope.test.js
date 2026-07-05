const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { listSkills, extractDomainPaths, domainChurn, selectTarget } = require('../scope');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'skill-health-scope-')); }

function initGitRepo(root) {
  execFileSync('git', ['-C', root, 'init', '-q']);
  execFileSync('git', ['-C', root, 'config', 'user.email', 'test@test.com']);
  execFileSync('git', ['-C', root, 'config', 'user.name', 'Test']);
}

function commit(root, msg) {
  execFileSync('git', ['-C', root, 'add', '-A']);
  execFileSync('git', ['-C', root, 'commit', '-q', '-m', msg]);
}

// ─── listSkills ────────────────────────────────────────────────────────────

test('listSkills returns [] when .claude/skills does not exist', () => {
  const root = tmp();
  assert.deepStrictEqual(listSkills(root), []);
});

test('listSkills lists .md files under .claude/skills, sorted by id', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude', 'skills'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'zebra.md'), '# zebra');
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'auth.md'), '# auth');
  const skills = listSkills(root);
  assert.deepStrictEqual(skills.map((s) => s.id), ['auth', 'zebra']);
  assert.strictEqual(skills[0].path, path.join(root, '.claude', 'skills', 'auth.md'));
});

test('listSkills ignores non-.md files', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude', 'skills'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'auth.md'), '# auth');
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'notes.txt'), 'ignore me');
  assert.deepStrictEqual(listSkills(root).map((s) => s.id), ['auth']);
});

// ─── extractDomainPaths ────────────────────────────────────────────────────

test('extractDomainPaths finds backtick-quoted file paths', () => {
  const content = 'See `src/api/user.js` for the pattern, also `bin/recon.js`.';
  assert.deepStrictEqual(extractDomainPaths(content).sort(), ['bin/recon.js', 'src/api/user.js']);
});

test('extractDomainPaths ignores backtick-quoted strings with no slash', () => {
  const content = 'Run `npm test` and see `SKILL.md`.';
  assert.deepStrictEqual(extractDomainPaths(content), []);
});

test('extractDomainPaths dedupes repeated references', () => {
  const content = '`src/a.js` is used here and `src/a.js` again there.';
  assert.deepStrictEqual(extractDomainPaths(content), ['src/a.js']);
});

// ─── domainChurn ───────────────────────────────────────────────────────────

test('domainChurn returns 0 for an empty path list', () => {
  const root = tmp();
  assert.strictEqual(domainChurn(root, [], 0), 0);
});

test('domainChurn counts commits touching the given paths since sinceMs', () => {
  const root = tmp();
  initGitRepo(root);
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'a.js'), 'const x = 1;\n');
  commit(root, 'first');
  const sinceMs = Date.now() - 86400000;
  fs.writeFileSync(path.join(root, 'src', 'a.js'), 'const x = 2;\n');
  commit(root, 'second');
  const churn = domainChurn(root, ['src/a.js'], sinceMs);
  assert.ok(churn >= 1, 'must count the commit touching src/a.js');
});

test('domainChurn returns 0 when git is unavailable (bad root)', () => {
  const churn = domainChurn('/nonexistent/path/xyz', ['a.js'], 0);
  assert.strictEqual(churn, 0);
});

// ─── selectTarget ──────────────────────────────────────────────────────────

test('selectTarget returns null when no skills exist', () => {
  const root = tmp();
  assert.strictEqual(selectTarget(root, {}, { now: Date.now() }), null);
});

test('selectTarget force-picks a never-audited skill as stale', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude', 'skills'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'auth.md'), '# auth\nSee `src/auth.js`.');
  const result = selectTarget(root, {}, { now: Date.now() });
  assert.ok(result !== null);
  assert.strictEqual(result.id, 'auth');
  assert.strictEqual(result.why, 'stale');
});

test('selectTarget force-picks a skill unaudited past STALE_DAYS even with a cursor present', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude', 'skills'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'auth.md'), '# auth');
  const staleMs = Date.now() - (90 + 5) * 86400000;
  const result = selectTarget(root, { auth: { lastAuditedMs: staleMs } }, { now: Date.now() });
  assert.ok(result !== null);
  assert.strictEqual(result.why, 'stale');
});

test('selectTarget returns null when all skills are fresh with zero churn', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude', 'skills'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'auth.md'), '# auth');
  const recentMs = Date.now() - 1 * 86400000;
  const result = selectTarget(root, { auth: { lastAuditedMs: recentMs } }, {
    now: Date.now(),
    signals: { auth: 0 },
  });
  assert.strictEqual(result, null);
});

test('selectTarget picks the highest-churn skill among fresh candidates (via signals injection)', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude', 'skills'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'auth.md'), '# auth');
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'billing.md'), '# billing');
  const recentMs = Date.now() - 1 * 86400000;
  const cursors = {
    auth: { lastAuditedMs: recentMs },
    billing: { lastAuditedMs: recentMs },
  };
  const result = selectTarget(root, cursors, {
    now: Date.now(),
    signals: { auth: 2, billing: 8 },
  });
  assert.ok(result !== null);
  assert.strictEqual(result.id, 'billing');
  assert.strictEqual(result.why, 'hotspot');
});
