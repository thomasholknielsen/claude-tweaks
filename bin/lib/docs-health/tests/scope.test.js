const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { listDocs, extractDomainPaths, domainChurn, selectTarget } = require('../scope');
const { listTargets } = require('../../harness-health/scope');
const { STALE_DAYS } = require('../score');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'docs-health-scope-')); }

function initGitRepo(root) {
  execFileSync('git', ['-C', root, 'init', '-q']);
  execFileSync('git', ['-C', root, 'config', 'user.email', 'test@test.com']);
  execFileSync('git', ['-C', root, 'config', 'user.name', 'Test']);
}

function commit(root, msg) {
  execFileSync('git', ['-C', root, 'add', '-A']);
  execFileSync('git', ['-C', root, 'commit', '-q', '-m', msg]);
}

// ── listDocs ────────────────────────────────────────────────────────────

test('listDocs returns [] when docs/ does not exist', () => {
  const root = tmp();
  assert.deepStrictEqual(listDocs(root), []);
});

test('listDocs recursively lists .md files under docs/, sorted by id, tagged kind: doc', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'docs', 'decisions'), { recursive: true });
  fs.mkdirSync(path.join(root, 'docs', 'guides'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'decisions', '0007-foo.md'), '# foo');
  fs.writeFileSync(path.join(root, 'docs', 'guides', 'setup.md'), '# setup');
  const docs = listDocs(root);
  assert.deepStrictEqual(docs.map((d) => d.id), ['decisions/0007-foo', 'guides/setup']);
  assert.strictEqual(docs[0].kind, 'doc');
  assert.strictEqual(docs[0].path, path.join(root, 'docs', 'decisions', '0007-foo.md'));
});

test('listDocs ignores non-.md files', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'notes.txt'), 'ignore me');
  fs.writeFileSync(path.join(root, 'docs', 'readme.md'), '# readme');
  assert.deepStrictEqual(listDocs(root).map((d) => d.id), ['readme']);
});

test('listDocs excludes docs/superpowers/** entirely', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'docs', 'superpowers', 'specs'), { recursive: true });
  fs.mkdirSync(path.join(root, 'docs', 'decisions'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'superpowers', 'specs', '2026-01-01-foo-design.md'), '# design doc');
  fs.writeFileSync(path.join(root, 'docs', 'decisions', '0001-bar.md'), '# bar');
  assert.deepStrictEqual(listDocs(root).map((d) => d.id), ['decisions/0001-bar']);
});

test('listDocs never overlaps with harness-health\'s own target list', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude', 'skills'), { recursive: true });
  fs.mkdirSync(path.join(root, '.claude', 'rules'), { recursive: true });
  fs.mkdirSync(path.join(root, 'docs', 'guides'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'auth.md'), '# auth skill');
  fs.writeFileSync(path.join(root, '.claude', 'rules', 'api-errors.md'), '# api errors rule');
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), '# project');
  fs.writeFileSync(path.join(root, 'docs', 'guides', 'setup.md'), '# setup');

  const docsHealthPaths = new Set(listDocs(root).map((d) => d.path));
  const harnessHealthPaths = new Set(listTargets(root).map((t) => t.path));
  const overlap = [...docsHealthPaths].filter((p) => harnessHealthPaths.has(p));
  assert.deepStrictEqual(overlap, [], 'docs-health and harness-health target lists must never overlap');
});

// ── extractDomainPaths / domainChurn ────────────────────────────────────

test('extractDomainPaths finds backtick-quoted file paths', () => {
  const content = 'See `src/api/user.js` for the pattern, also `bin/docs-health.js`.';
  assert.deepStrictEqual(extractDomainPaths(content).sort(), ['bin/docs-health.js', 'src/api/user.js']);
});

test('extractDomainPaths ignores backtick-quoted strings with no slash', () => {
  const content = 'Run `npm test` and see `SKILL.md`.';
  assert.deepStrictEqual(extractDomainPaths(content), []);
});

test('domainChurn returns 0 when git is unavailable or paths do not exist', () => {
  const root = tmp();
  assert.strictEqual(domainChurn(root, ['src/nope.js'], 0), 0);
});

// ── selectTarget ─────────────────────────────────────────────────────────

test('selectTarget returns null when there are no docs at all', () => {
  const root = tmp();
  assert.strictEqual(selectTarget(root, {}), null);
});

test('selectTarget force-picks a never-audited doc as stale', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'readme.md'), '# readme');
  const result = selectTarget(root, {}, { now: 1000000 });
  assert.strictEqual(result.id, 'readme');
  assert.strictEqual(result.why, 'stale');
});

test('selectTarget does not force-pick a doc audited within STALE_DAYS', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'readme.md'), '# readme');
  const now = Date.now();
  const cursors = { 'doc:readme': { lastAuditedMs: now - (STALE_DAYS - 1) * 86400000 } };
  const result = selectTarget(root, cursors, { now, signals: {} });
  assert.strictEqual(result, null, 'no churn signal and not stale yet -> nothing due');
});

test('selectTarget picks the highest-churn non-stale doc via injected signals', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'low.md'), '# low churn');
  fs.writeFileSync(path.join(root, 'docs', 'high.md'), '# high churn');
  const now = Date.now();
  const recentAudit = now - (STALE_DAYS - 1) * 86400000;
  const cursors = {
    ['doc:low.md'.replace('.md', '')]: { lastAuditedMs: recentAudit },
    ['doc:high.md'.replace('.md', '')]: { lastAuditedMs: recentAudit },
  };
  const result = selectTarget(root, cursors, {
    now,
    signals: { 'doc:low': 1, 'doc:high': 5 },
  });
  assert.strictEqual(result.id, 'high');
  assert.strictEqual(result.why, 'hotspot');
  assert.strictEqual(result.churnCount, 5);
});
