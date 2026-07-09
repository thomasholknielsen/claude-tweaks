const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  listSkills, extractDomainPaths, domainChurn, selectTarget,
  listRules, parseRulePaths, listClaudeMd, listTargets,
  readDesignIntegrationFlag, listDesignArtifacts,
} = require('../scope');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'harness-health-scope-')); }

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

test('listSkills lists .md files under .claude/skills, sorted by id, tagged kind: skill', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude', 'skills'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'zebra.md'), '# zebra');
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'auth.md'), '# auth');
  const skills = listSkills(root);
  assert.deepStrictEqual(skills.map((s) => s.id), ['auth', 'zebra']);
  assert.strictEqual(skills[0].path, path.join(root, '.claude', 'skills', 'auth.md'));
  assert.strictEqual(skills[0].kind, 'skill');
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

// ─── parseRulePaths / listRules ────────────────────────────────────────────

test('parseRulePaths extracts a paths: frontmatter list', () => {
  const content = '---\npaths:\n  - src/api/**\n  - src/routes/**\n---\nBody text.';
  assert.deepStrictEqual(parseRulePaths(content), ['src/api/**', 'src/routes/**']);
});

test('parseRulePaths returns [] when there is no frontmatter', () => {
  assert.deepStrictEqual(parseRulePaths('# no frontmatter here'), []);
});

test('parseRulePaths returns [] when there is no paths: key', () => {
  const content = '---\nother: value\n---\nBody.';
  assert.deepStrictEqual(parseRulePaths(content), []);
});

test('listRules returns [] when .claude/rules does not exist', () => {
  const root = tmp();
  assert.deepStrictEqual(listRules(root), []);
});

test('listRules lists .claude/rules/*.md sorted by id, tagged kind: rule, with parsed pathGlobs', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude', 'rules'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'rules', 'api-errors.md'), '---\npaths:\n  - src/api/**\n---\nUse the error handler.');
  fs.writeFileSync(path.join(root, '.claude', 'rules', 'zzz.md'), '# no frontmatter');
  const rules = listRules(root);
  assert.deepStrictEqual(rules.map((r) => r.id), ['api-errors', 'zzz']);
  assert.strictEqual(rules[0].kind, 'rule');
  assert.deepStrictEqual(rules[0].pathGlobs, ['src/api/**']);
  assert.deepStrictEqual(rules[1].pathGlobs, []);
});

// ─── listClaudeMd ───────────────────────────────────────────────────────────

test('listClaudeMd returns [] when CLAUDE.md does not exist', () => {
  const root = tmp();
  assert.deepStrictEqual(listClaudeMd(root), []);
});

test('listClaudeMd returns a single kind: claude-md item when CLAUDE.md exists', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), '# Project\n');
  const result = listClaudeMd(root);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].kind, 'claude-md');
  assert.strictEqual(result[0].id, 'CLAUDE');
  assert.strictEqual(result[0].path, path.join(root, 'CLAUDE.md'));
});

// ─── readDesignIntegrationFlag / listDesignArtifacts ──────────────────────

test('readDesignIntegrationFlag returns disabled when CLAUDE.md does not exist', () => {
  const root = tmp();
  assert.strictEqual(readDesignIntegrationFlag(root), 'disabled');
});

test('readDesignIntegrationFlag parses the design-integration value from CLAUDE.md', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), '# Project\n\n## Design integration\n\ndesign-integration: enabled\n');
  assert.strictEqual(readDesignIntegrationFlag(root), 'enabled');
});

test('readDesignIntegrationFlag returns disabled when the flag is absent from CLAUDE.md', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), '# Project\n\nNo design flag here.\n');
  assert.strictEqual(readDesignIntegrationFlag(root), 'disabled');
});

test('listDesignArtifacts returns [] when design-integration is not enabled', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), '## Design integration\n\ndesign-integration: plugin-only\n');
  fs.writeFileSync(path.join(root, 'PRODUCT.md'), '# Product context');
  assert.deepStrictEqual(listDesignArtifacts(root), []);
});

test('listDesignArtifacts returns [] when CLAUDE.md is absent, even if PRODUCT.md/DESIGN.md exist', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'PRODUCT.md'), '# Product context');
  assert.deepStrictEqual(listDesignArtifacts(root), []);
});

test('listDesignArtifacts finds PRODUCT.md and DESIGN.md at the project root when enabled', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), '## Design integration\n\ndesign-integration: enabled\n');
  fs.writeFileSync(path.join(root, 'PRODUCT.md'), '# Product context');
  fs.writeFileSync(path.join(root, 'DESIGN.md'), '# Design system');
  const artifacts = listDesignArtifacts(root);
  assert.deepStrictEqual(artifacts.map((a) => a.id).sort(), ['DESIGN', 'PRODUCT']);
  assert.ok(artifacts.every((a) => a.kind === 'design-artifact'));
});

test('listDesignArtifacts omits a file that is absent at every canonical and fallback path', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), '## Design integration\n\ndesign-integration: enabled\n');
  fs.writeFileSync(path.join(root, 'PRODUCT.md'), '# Product context');
  const artifacts = listDesignArtifacts(root);
  assert.deepStrictEqual(artifacts.map((a) => a.id), ['PRODUCT']);
});

test('listDesignArtifacts falls back to docs/design/ then docs/ when root files are absent', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), '## Design integration\n\ndesign-integration: enabled\n');
  fs.mkdirSync(path.join(root, 'docs', 'design'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'design', 'PRODUCT.md'), '# fallback product');
  fs.writeFileSync(path.join(root, 'docs', 'DESIGN.md'), '# fallback design');
  const artifacts = listDesignArtifacts(root);
  const product = artifacts.find((a) => a.id === 'PRODUCT');
  const design = artifacts.find((a) => a.id === 'DESIGN');
  assert.strictEqual(product.path, path.join(root, 'docs', 'design', 'PRODUCT.md'));
  assert.strictEqual(design.path, path.join(root, 'docs', 'DESIGN.md'));
});

test('listDesignArtifacts gives PRODUCT empty pathGlobs and DESIGN the frontend-signal glob list', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), '## Design integration\n\ndesign-integration: enabled\n');
  fs.writeFileSync(path.join(root, 'PRODUCT.md'), '# p');
  fs.writeFileSync(path.join(root, 'DESIGN.md'), '# d');
  const artifacts = listDesignArtifacts(root);
  const product = artifacts.find((a) => a.id === 'PRODUCT');
  const design = artifacts.find((a) => a.id === 'DESIGN');
  assert.deepStrictEqual(product.pathGlobs, []);
  assert.ok(design.pathGlobs.includes('components/'));
  assert.ok(design.pathGlobs.includes('*.tsx'));
});

// ─── listTargets ────────────────────────────────────────────────────────────

test('listTargets aggregates skills, rules, and CLAUDE.md, each correctly tagged', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude', 'skills'), { recursive: true });
  fs.mkdirSync(path.join(root, '.claude', 'rules'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'auth.md'), '# auth');
  fs.writeFileSync(path.join(root, '.claude', 'rules', 'api-errors.md'), '---\npaths:\n  - src/api/**\n---\n');
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), '# Project\n');
  const targets = listTargets(root);
  assert.deepStrictEqual(
    targets.map((t) => `${t.kind}:${t.id}`).sort(),
    ['claude-md:CLAUDE', 'rule:api-errors', 'skill:auth'],
  );
});

test('listTargets includes design artifacts when design-integration is enabled', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), '## Design integration\n\ndesign-integration: enabled\n');
  fs.writeFileSync(path.join(root, 'PRODUCT.md'), '# p');
  const targets = listTargets(root);
  assert.ok(targets.some((t) => t.kind === 'design-artifact' && t.id === 'PRODUCT'));
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
  const result = selectTarget(root, { 'skill:auth': { lastAuditedMs: staleMs } }, { now: Date.now() });
  assert.ok(result !== null);
  assert.strictEqual(result.why, 'stale');
});

test('selectTarget returns null when all skills are fresh with zero churn', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude', 'skills'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'auth.md'), '# auth');
  const recentMs = Date.now() - 1 * 86400000;
  const result = selectTarget(root, { 'skill:auth': { lastAuditedMs: recentMs } }, {
    now: Date.now(),
    signals: { 'skill:auth': 0 },
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
    'skill:auth': { lastAuditedMs: recentMs },
    'skill:billing': { lastAuditedMs: recentMs },
  };
  const result = selectTarget(root, cursors, {
    now: Date.now(),
    signals: { 'skill:auth': 2, 'skill:billing': 8 },
  });
  assert.ok(result !== null);
  assert.strictEqual(result.id, 'billing');
  assert.strictEqual(result.why, 'hotspot');
});

test('selectTarget does not collide when a skill and a rule share the same bare id', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude', 'skills'), { recursive: true });
  fs.mkdirSync(path.join(root, '.claude', 'rules'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'auth.md'), '# auth');
  fs.writeFileSync(path.join(root, '.claude', 'rules', 'auth.md'), '---\npaths:\n  - src/auth/**\n---\n');
  const recentMs = Date.now() - 1 * 86400000;
  const cursors = {
    'skill:auth': { lastAuditedMs: recentMs },
    'rule:auth': { lastAuditedMs: recentMs },
  };
  const result = selectTarget(root, cursors, {
    now: Date.now(),
    signals: { 'skill:auth': 0, 'rule:auth': 5 },
  });
  assert.ok(result !== null);
  assert.strictEqual(result.kind, 'rule');
  assert.strictEqual(result.id, 'auth');
});

test('selectTarget --kind filter restricts the pool to one kind', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude', 'skills'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'auth.md'), '# auth');
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), '# Project\n');
  const result = selectTarget(root, {}, { now: Date.now(), kind: 'claude-md' });
  assert.ok(result !== null);
  assert.strictEqual(result.kind, 'claude-md');
});

test('selectTarget reports daysSinceLastAudit: null for a never-audited (no cursor) stale pick', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude', 'skills'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'auth.md'), '# auth');
  const result = selectTarget(root, {}, { now: Date.now() });
  assert.strictEqual(result.why, 'stale');
  assert.strictEqual(result.daysSinceLastAudit, null);
});

test('selectTarget reports a numeric daysSinceLastAudit for a stale pick with a prior cursor', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude', 'skills'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'auth.md'), '# auth');
  const staleMs = Date.now() - (90 + 10) * 86400000;
  const result = selectTarget(root, { 'skill:auth': { lastAuditedMs: staleMs } }, { now: Date.now() });
  assert.strictEqual(result.why, 'stale');
  assert.ok(result.daysSinceLastAudit >= 100, `expected >= 100, got ${result.daysSinceLastAudit}`);
});

test('selectTarget reports churnCount on a hotspot pick', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude', 'skills'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'auth.md'), '# auth');
  const recentMs = Date.now() - 1 * 86400000;
  const result = selectTarget(root, { 'skill:auth': { lastAuditedMs: recentMs } }, {
    now: Date.now(),
    signals: { 'skill:auth': 7 },
  });
  assert.strictEqual(result.why, 'hotspot');
  assert.strictEqual(result.churnCount, 7);
});

test('selectTarget Phase 2 uses a design-artifact candidate pathGlobs, not content-scraped paths', () => {
  const root = tmp();
  initGitRepo(root);
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), '## Design integration\n\ndesign-integration: enabled\n');
  fs.mkdirSync(path.join(root, 'components'), { recursive: true });
  fs.writeFileSync(path.join(root, 'components', 'Button.tsx'), 'export const Button = () => null;\n');
  fs.writeFileSync(path.join(root, 'DESIGN.md'), 'No backtick file references in this prose at all.');
  commit(root, 'first');
  const sinceMs = Date.now() - 86400000;
  fs.writeFileSync(path.join(root, 'components', 'Button.tsx'), 'export const Button = () => <button />;\n');
  commit(root, 'second');
  const recentMs = Date.now() - 1 * 86400000;
  const result = selectTarget(root, { 'design-artifact:DESIGN': { lastAuditedMs: sinceMs } }, {
    now: Date.now(),
    kind: 'design-artifact',
  });
  assert.ok(result !== null, 'must pick DESIGN via its curated pathGlobs, not via content-scraping (which would find zero backtick paths and score 0 churn)');
  assert.strictEqual(result.id, 'DESIGN');
  assert.strictEqual(result.why, 'hotspot');
});
