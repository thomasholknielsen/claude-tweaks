'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// #409: a pr-first run is born public — draft PR at run start, one push +
// checklist flip per phase exit, thereafter. The procedure is prose, not
// code, so prose is what has to be pinned — these tests catch the doc
// drifting out from under the deliverables/ACs it was written to satisfy.

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const LIFECYCLE = read('plugin', 'skills', '_shared', 'pr-early-run-lifecycle.md');
const GIT_DISCIPLINE = read('plugin', 'skills', '_shared', 'git-discipline.md');
const WORKTREE_SETUP = read('plugin', 'skills', 'build', 'worktree-setup.md');
const BUILD_SKILL = read('plugin', 'skills', 'build', 'SKILL.md');
const TEST_SKILL = read('plugin', 'skills', 'test', 'SKILL.md');
// /review's Step 7 (phase exit) lives in the code-mode-steps.md sub-file since the #887
// dispatcher split — concatenate so this asserts against the text wherever it lives.
const REVIEW_SKILL =
  read('plugin', 'skills', 'review', 'SKILL.md') +
  '\n' +
  read('plugin', 'skills', 'review', 'code-mode-steps.md');
const STEPS_AND_GATES = read('plugin', 'skills', 'flow', 'steps-and-gates.md');
const WRAP_EXEC = read('plugin', 'skills', 'wrap-up', 'execution-and-verification.md');
const HOOKS_JS = read('plugin', 'bin', 'hooks.js');
const INCIDENT_LOG = read('docs', 'incident-log.md');

test('the run marker is the unconditional first line of the PR body', () => {
  assert.match(
    LIFECYCLE,
    /<!-- claude-tweaks-run: \{run-id\} -->\n\n### Spec summary/,
    'the sweep and reconciler key on this marker to recognize a plugin-created PR without a local run-dir join — it must never be conditional or buried',
  );
});

test('the push at run start is its own Bash call, never chained', () => {
  assert.match(
    LIFECYCLE,
    /git -C "\{worktree-path\}" push origin \{branch\}/,
    'the worktree-always gate denies a chained push entirely (IL-33)',
  );
});

test('run start checks for an existing PR by state before creating one, and distinguishes open from closed/merged', () => {
  assert.match(
    LIFECYCLE,
    /gh pr list --repo \{owner\}\/\{repo\} --head \{branch\} --state all --json number,url,state,isDraft/,
    'a resumed or retried run must not duplicate a PR — state:all is required to see the closed/merged case and fall through to creation rather than misreading it as a live match',
  );
  assert.match(LIFECYCLE, /Never flip an already-non-draft open PR back to draft/);
});

test('the phase checklist is delimited by HTML-comment markers for reliable re-composition', () => {
  assert.match(LIFECYCLE, /<!-- phases-start -->/);
  assert.match(LIFECYCLE, /<!-- phases-end -->/);
});

test('Fixes lines are safe because the PR stays draft until gates pass, not because of a scope guard', () => {
  assert.match(
    LIFECYCLE,
    /GitHub blocks merging a draft by default/,
    'unlike the retired dispatch-only durability procedure this file replaced (IL-128), whose PR opened only after review already passed and used Refs, this one opens before any gate has run',
  );
  assert.match(LIFECYCLE, /Fixes #\{n\}/);
});

test('the resume path re-verifies a recorded PR against GitHub before trusting it', () => {
  assert.match(
    LIFECYCLE,
    /gh pr view \{recorded-number\} --repo \{owner\}\/\{repo\} --json state,isDraft,url/,
    'the branch could have been force-pushed or the PR closed since an earlier phase recorded it — trusting run-state.json blindly would silently skip the checklist update',
  );
});

test('phase-checklist updates degrade the same way phase-exit pushes do: log and continue, never block', () => {
  assert.match(LIFECYCLE, /Best-effort, like the phase-exit push it follows/);
});

test('the skip/degrade table names local-merge, push failure, gh-create failure, gh-absent, and offline as distinct rows', () => {
  for (const needle of [
    'integration-model: local-merge',
    'Push at run start fails',
    '`gh pr create` fails twice',
    '`gh` absent',
    'Offline / no `origin` remote',
  ]) {
    assert.ok(LIFECYCLE.includes(needle), `skip/degrade table missing a row for: ${needle}`);
  }
});

test('gh-absent is distinguished from a plain failure by the absence of an MCP fallback for pull requests', () => {
  assert.match(
    LIFECYCLE,
    /no pull-request row.*no MCP fallback|no MCP fallback.*pull requests/s,
    '_shared/github-write-transport.md carries no pull-request row — unlike issue operations, there is no fallback transport to attempt',
  );
});

test('record-pr is cited as the sanctioned run-state write path, not a direct write', () => {
  assert.match(LIFECYCLE, /node "\$\{CLAUDE_PLUGIN_ROOT\}\/bin\/hooks\.js" record-pr \{number\} \{url\}/);
  assert.match(LIFECYCLE, /run-state is written\s*\n?\s*only through `hooks\.js` verbs/);
});

test('git-discipline.md states the phase-exit push rule once, cites the spike headroom, and never persists a degrade flag', () => {
  assert.match(GIT_DISCIPLINE, /## Phase-exit push \(`integration-model: pr-first` only\)/);
  assert.match(GIT_DISCIPLINE, /≥50× headroom/);
  assert.match(
    GIT_DISCIPLINE,
    /never a flag written to `run-state\.json` that would suppress the \*next\*\s+phase's own push attempt/,
    'degradation must be per-attempt — a persisted flag would permanently disable pushes for the rest of the run after one transient failure',
  );
  assert.match(GIT_DISCIPLINE, /`local-merge` runs keep today's behavior: no phase-exit push, one push at finish/);
});

test('build/worktree-setup.md Step 6 cites the lifecycle file rather than restating its procedure', () => {
  assert.match(WORKTREE_SETUP, /Open the draft PR \(`integration-model: pr-first` only\)/);
  assert.match(WORKTREE_SETUP, /_shared\/pr-early-run-lifecycle\.md/);
});

test('build/SKILL.md invokes worktree-setup.md Step 6 immediately after the materialize commit', () => {
  assert.match(
    BUILD_SKILL,
    /Immediately after the materialize commit, in `worktree` mode only:\*\* run `build\/worktree-setup\.md` Step 6/,
  );
});

test('every phase-exit citation (build, test, review, polish via steps-and-gates, wrap-up) names both canonical files', () => {
  for (const [label, text] of [
    ['build/SKILL.md', BUILD_SKILL],
    ['test/SKILL.md', TEST_SKILL],
    ['review/SKILL.md + code-mode-steps.md', REVIEW_SKILL],
    ['flow/steps-and-gates.md (polish)', STEPS_AND_GATES],
  ]) {
    assert.match(text, /_shared\/git-discipline\.md/, `${label} must cite the phase-exit push rule`);
    assert.match(text, /_shared\/pr-early-run-lifecycle\.md/, `${label} must cite the checklist-update procedure`);
  }
});

test('wrap-up\'s phase exit explicitly defers merge-readiness to the merge-path sub-issue, not this one', () => {
  assert.match(WRAP_EXEC, /_shared\/git-discipline\.md/);
  assert.match(WRAP_EXEC, /_shared\/pr-early-run-lifecycle\.md/);
  assert.match(
    WRAP_EXEC,
    /does not mark the PR ready for merge or touch its draft state — that\s*\ntransition belongs to the merge-path sub-issue/,
  );
});

test('wrap-up does not duplicate the Fixes lines already carried by the draft PR body under pr-first', () => {
  assert.match(
    WRAP_EXEC,
    /no `Fixes` line here/,
    'the draft PR already carries one Fixes line per record from run start — a second, differently-scoped set here would risk disagreeing with it',
  );
});

test('bin/hooks.js record-pr verb writes run-state.json.pr through writeRunState, mirroring record-worktree', () => {
  assert.match(HOOKS_JS, /if \(cmd === 'record-pr'\)/);
  assert.match(HOOKS_JS, /ctxLib\.writeRunState\(runDir, \{ pr: \{ number, url: urlArg \} \}\)/);
});

// [IL-131] second recurrence (#991): both #118 and #893 hit the identical
// "already satisfied by prior work" trigger with zero further commits, so a
// mechanical check keyed on git activity would never fire — the fix is a
// dedicated /claude-tweaks:test HARD-GATE step that reads run-state.json
// directly, plus a structured degrade field so a genuine push/PR-create
// failure never trips it.

test('bin/hooks.js record-pr also accepts --degraded to record a PR-lifecycle degrade, distinct from a real pr field', () => {
  assert.match(HOOKS_JS, /--degraded <reason>/);
  assert.match(HOOKS_JS, /prDegraded: \{ reason, at: new Date\(\)\.toISOString\(\) \}/);
});

test('bin/hooks.js exposes check-lifecycle-stamps as a genuinely non-zero-exit HARD-GATE verb', () => {
  assert.match(HOOKS_JS, /if \(cmd === 'check-lifecycle-stamps'\)/);
  assert.match(HOOKS_JS, /require\('\.\/lib\/hooks\/lifecycle-stamps'\)\.checkLifecycleStamps/);
});

test('every degrade row in the skip/degrade table records the degrade via record-pr --degraded, not just decisions.md', () => {
  assert.match(LIFECYCLE, /record-pr --run "\$RUN_DIR" --degraded "push-failed: \{reason\}"/);
  assert.match(LIFECYCLE, /record-pr --run "\$RUN_DIR" --degraded "create-failed:/);
  assert.match(LIFECYCLE, /record-pr --run "\$RUN_DIR" --degraded "gh-absent: no MCP fallback for pull requests"/);
});

test('test/SKILL.md carries the Lifecycle Stamp Gate as Step 1.6, citing check-lifecycle-stamps and IL-131', () => {
  assert.match(TEST_SKILL, /## Step 1\.6: Lifecycle Stamp Gate \(\[IL-131\]\)/);
  assert.match(TEST_SKILL, /check-lifecycle-stamps/);
  assert.match(TEST_SKILL, /A standalone `\/test` invocation has no run dir and nothing to enforce/);
  assert.match(TEST_SKILL, /A genuine degrade is not a gate failure/);
});

test('flow/steps-and-gates.md\'s test gate row names the Lifecycle Stamp Gate alongside types/lint/tests/QA', () => {
  assert.match(STEPS_AND_GATES, /Lifecycle Stamp Gate \(`test\/SKILL\.md` Step 1\.6, \[IL-131\]\)/);
});

test('build/SKILL.md\'s non-skippable paragraph now points at the mechanical enforcement, not prose alone', () => {
  assert.match(BUILD_SKILL, /This is enforced mechanically, not only by this paragraph's own prose/);
  assert.match(BUILD_SKILL, /Lifecycle Stamp Gate/);
});

test('docs/incident-log.md records the structural fix under IL-131, linked to #991', () => {
  assert.match(INCIDENT_LOG, /\*\*Structural fix \(record #991, 2026-08-21\):\*\*/);
  assert.match(INCIDENT_LOG, /Lifecycle Stamp Gate/);
  assert.match(INCIDENT_LOG, /check-lifecycle-stamps/);
});
