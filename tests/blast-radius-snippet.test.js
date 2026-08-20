'use strict';
// Binds merge-check.md's Step 1 fenced command to execution (docs/
// skill-authoring.md, "Executable snippets in skill prose" — extract-and-run
// form): the doc is the only source of the executed text, run against a
// fixture repo with CLAUDE_PLUGIN_ROOT and {integration-branch} substituted.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, execSync } = require('node:child_process');

const DOC = path.join(__dirname, '..', 'plugin', 'skills', 'assess-agent-autonomy', 'merge-check.md');
const PLUGIN_ROOT = path.join(__dirname, '..', 'plugin');

function extractSnippet() {
  const doc = fs.readFileSync(DOC, 'utf8');
  const match = /is one CLI call[^\n]*\n[^\n]*\n\n```bash\n([^`]+)```/m.exec(doc);
  assert.ok(match, 'extraction pattern is out of sync with merge-check.md — update this test');
  return match[1].trim();
}

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

test('merge-check.md Step 1 snippet executes verbatim against a fixture repo', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blast-snippet-'));
  git(dir, 'init', '-b', 'main');
  git(dir, 'config', 'user.email', 'test@example.invalid');
  git(dir, 'config', 'user.name', 'Test');
  fs.writeFileSync(path.join(dir, 'a.txt'), 'a\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-m', 'base');
  git(dir, 'checkout', '-b', 'feature');
  fs.writeFileSync(path.join(dir, 'b.js'), 'b\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-m', 'change');

  const snippet = extractSnippet().replace('{integration-branch}', 'main');
  const out = execSync(snippet, {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT },
  });
  const parsed = JSON.parse(out);
  assert.match(parsed.mergeBase, /^[0-9a-f]{40}$/);
  assert.strictEqual(parsed.summary.implFiles, 1);
});
