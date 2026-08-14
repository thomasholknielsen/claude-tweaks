'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { gitRepo, linkedWorktreeOf } = require('./helpers/git-fixtures');

// #421: /flow's materialize step (and the shared resolution algorithm it
// defers to) adopted an inherited $PIPELINE_RUN_DIR on existence alone — no
// check that the path actually resolves under the main checkout. #389
// observed this live: a dispatch-created worktree's /flow invocation ended up
// with its run directory trapped inside that worktree, where a later
// `git worktree remove` would have silently destroyed decisions.md/config.yml
// /staged/ with no git history to recover ([IL-127]). This test executes the
// *actual* documented resolution snippet (extracted verbatim from
// skills/_shared/pipeline-run-dir.md's "Bash snippet (resolution)" section —
// not a reimplementation, so a future edit that silently drops the anchoring
// check breaks this test) against a real temp git repo + linked worktree.

const ROOT = path.join(__dirname, '..');
const SHARED_DOC = fs.readFileSync(
  path.join(ROOT, 'skills', '_shared', 'pipeline-run-dir.md'),
  'utf8',
);

function extractSnippet() {
  const section = SHARED_DOC.match(
    /## Bash snippet \(resolution\)\n\n```bash\n([\s\S]*?)\n```/,
  );
  assert.ok(section, 'skills/_shared/pipeline-run-dir.md must have a "## Bash snippet (resolution)" fenced bash block — extraction pattern is out of sync with the doc');
  return section[1];
}

function runResolution({ cwd, runDirEnv, specSlug }) {
  const snippet = extractSnippet();
  const script = `${snippet}\nprintf 'RESOLVED:%s\\n' "$RUN_DIR"`;
  const out = execFileSync('bash', ['-c', script], {
    cwd,
    env: {
      ...process.env,
      PIPELINE_RUN_DIR: runDirEnv || '',
      SPEC_SLUG: specSlug || 'no-match-xyz',
      MODE: '',
      STANDALONE_SKILL: '',
    },
    timeout: 30000,
  }).toString('utf8');
  const line = out.split('\n').find((l) => l.startsWith('RESOLVED:'));
  assert.ok(line, `resolution script produced no RESOLVED: line — full output:\n${out}`);
  return line.slice('RESOLVED:'.length);
}

test('adoption anchoring: an inherited PIPELINE_RUN_DIR trapped inside a linked worktree is rejected, not adopted', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);

  // Simulate the #389 shape: a run directory that exists, but lives inside
  // the worktree instead of the main checkout.
  const trapped = path.join(wt, '.claude-tweaks', 'pipelines', '2026-01-01T000000-record-999');
  fs.mkdirSync(trapped, { recursive: true });

  const resolved = runResolution({ cwd: wt, runDirEnv: trapped, specSlug: 'record-999' });

  assert.notStrictEqual(
    resolved,
    trapped,
    'the trapped-in-worktree directory must never be adopted as RUN_DIR — this is the exact #389 failure shape',
  );
  // Nothing under the (empty) main checkout matches the slug either, so
  // resolution must fall through all the way to empty (interactive fallback),
  // not silently substitute some other value.
  assert.strictEqual(resolved, '', `expected empty RUN_DIR (fall-through to interactive mode), got: ${resolved}`);
});

test('adoption anchoring: an inherited PIPELINE_RUN_DIR correctly anchored to the main checkout is still adopted', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);

  const anchored = path.join(main, '.claude-tweaks', 'pipelines', '2026-01-01T000000-record-421');
  fs.mkdirSync(anchored, { recursive: true });

  // Invoked from inside the worktree (the dispatch shape) — the anchoring
  // check must still accept a value that is legitimately under $RUN_ROOT.
  const resolved = runResolution({ cwd: wt, runDirEnv: anchored, specSlug: 'record-421' });

  assert.strictEqual(
    resolved,
    anchored,
    'a PIPELINE_RUN_DIR that genuinely resolves under the main checkout must still be adopted — anchoring must not become a false-positive rejection',
  );
});
