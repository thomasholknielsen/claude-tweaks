// tests/hooks-pre-tool-use.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const pre = require('../bin/lib/hooks/pre-tool-use');

function gitRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-e1-'));
  execFileSync('git', ['-C', dir, 'init', '-q']);
  return fs.realpathSync(dir);
}
function mkRun(worktree, sessionId) {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-e1run-'));
  const run = path.join(project, '.claude-tweaks', 'pipelines', '2026-07-01T090000-spec-1');
  fs.mkdirSync(run, { recursive: true });
  const state = worktree ? { status: 'active', worktree } : { status: 'active' };
  if (sessionId !== undefined) state.sessionId = sessionId;
  fs.writeFileSync(path.join(run, 'run-state.json'), JSON.stringify(state));
  return { run, state };
}
// Multi-run helpers: several run dirs living under the SAME project, so
// listRunDirs(ctx.cwd) can see siblings — mirrors two parallel /flow
// terminals sharing one main checkout.
function tmpProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-e1proj-'));
  fs.mkdirSync(path.join(dir, '.claude-tweaks', 'pipelines'), { recursive: true });
  return dir;
}
function mkRunAt(project, name, worktree) {
  const run = path.join(project, '.claude-tweaks', 'pipelines', name);
  fs.mkdirSync(run, { recursive: true });
  const state = { status: 'active', worktree };
  fs.writeFileSync(path.join(run, 'run-state.json'), JSON.stringify(state));
  return { run, state };
}
const bashInput = (command, cwd) => ({ tool_name: 'Bash', tool_input: { command }, cwd });
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('commit in the assigned worktree is allowed', () => {
  const wt = gitRepo();
  const { run, state } = mkRun(wt);
  const out = pre.run({ input: bashInput('git commit -m "x"', wt), runDir: run, runState: state, cwd: wt });
  assert.deepStrictEqual(out, {});
});

test('commit in a different checkout is denied with corrective reason', () => {
  const wt = gitRepo();
  const other = gitRepo();
  const { run, state } = mkRun(wt);
  const out = pre.run({ input: bashInput('git commit -m "x"', other), runDir: run, runState: state, cwd: other });
  const spec = out.json.hookSpecificOutput;
  assert.strictEqual(spec.permissionDecision, 'deny');
  assert.match(spec.permissionDecisionReason, new RegExp(wt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(spec.permissionDecisionReason, /git -C/);
  const events = fs.readFileSync(path.join(run, 'events.jsonl'), 'utf8');
  assert.match(events, /"type":"wd-deny"/);
});

test('wrong-checkout commit from a FOREIGN session is allowed with a warn and logs wd-foreign-session', () => {
  const wt = gitRepo();
  const other = gitRepo();
  const { run, state } = mkRun(wt, 'owner-session');
  const input = { ...bashInput('git commit -m "x"', other), session_id: 'bystander-session' };
  const out = pre.run({ input, runDir: run, runState: state, cwd: other });
  assert.ok(!(out.json && out.json.hookSpecificOutput), 'foreign-session commit must not be denied');
  assert.match(out.json.systemMessage, /allowing this commit/);
  assert.match(out.json.systemMessage, new RegExp(esc(wt)));
  assert.match(out.json.systemMessage, /2026-07-01T090000-spec-1/);
  const events = fs.readFileSync(path.join(run, 'events.jsonl'), 'utf8');
  assert.match(events, /"type":"wd-foreign-session"/);
  assert.doesNotMatch(events, /"type":"wd-deny"/);
});

test('wrong-checkout commit from the OWNING session is still denied', () => {
  const wt = gitRepo();
  const other = gitRepo();
  const { run, state } = mkRun(wt, 'owner-session');
  const input = { ...bashInput('git commit -m "x"', other), session_id: 'owner-session' };
  const out = pre.run({ input, runDir: run, runState: state, cwd: other });
  assert.strictEqual(out.json.hookSpecificOutput.permissionDecision, 'deny');
  const events = fs.readFileSync(path.join(run, 'events.jsonl'), 'utf8');
  assert.match(events, /"type":"wd-deny"/);
});

test('missing or malformed session identity on either side falls back to deny (status quo)', () => {
  // Legacy run-state (no recorded owner), caller id present.
  const legacyOther = gitRepo();
  const legacy = mkRun(gitRepo());
  const legacyOut = pre.run({
    input: { ...bashInput('git commit -m "x"', legacyOther), session_id: 'bystander-session' },
    runDir: legacy.run, runState: legacy.state, cwd: legacyOther,
  });
  assert.strictEqual(legacyOut.json.hookSpecificOutput.permissionDecision, 'deny');

  // Owner recorded, caller id absent from hook input.
  const noCallerOther = gitRepo();
  const noCaller = mkRun(gitRepo(), 'owner-session');
  const noCallerOut = pre.run({
    input: bashInput('git commit -m "x"', noCallerOther),
    runDir: noCaller.run, runState: noCaller.state, cwd: noCallerOther,
  });
  assert.strictEqual(noCallerOut.json.hookSpecificOutput.permissionDecision, 'deny');

  // Corrupt owner (non-string) never counts as identity.
  const corruptOther = gitRepo();
  const corrupt = mkRun(gitRepo(), { nested: true });
  const corruptOut = pre.run({
    input: { ...bashInput('git commit -m "x"', corruptOther), session_id: 'bystander-session' },
    runDir: corrupt.run, runState: corrupt.state, cwd: corruptOther,
  });
  assert.strictEqual(corruptOut.json.hookSpecificOutput.permissionDecision, 'deny');
});

test('git -C into the assigned worktree from elsewhere is allowed', () => {
  const wt = gitRepo();
  const other = gitRepo();
  const { run, state } = mkRun(wt);
  const out = pre.run({ input: bashInput(`git -C ${wt} commit -m "x"`, other), runDir: run, runState: state, cwd: other });
  assert.deepStrictEqual(out, {});
});

test('push mismatch logs but never denies', () => {
  const wt = gitRepo();
  const other = gitRepo();
  const { run, state } = mkRun(wt);
  const out = pre.run({ input: bashInput('git push origin main', other), runDir: run, runState: state, cwd: other });
  assert.deepStrictEqual(out, {});
  const events = fs.readFileSync(path.join(run, 'events.jsonl'), 'utf8');
  assert.match(events, /"type":"wd-push-mismatch"/);
});

test('ambiguity allows: no worktree assigned, non-repo dir, non-Bash tool, no run dir', () => {
  const wt = gitRepo();
  const { run, state } = mkRun(null);
  assert.deepStrictEqual(pre.run({ input: bashInput('git commit -m "x"', wt), runDir: run, runState: state, cwd: wt }), {});
  const assigned = mkRun(wt);
  const nonRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-nonrepo-'));
  assert.deepStrictEqual(pre.run({ input: bashInput('git commit -m "x"', nonRepo), runDir: assigned.run, runState: assigned.state, cwd: nonRepo }), {});
  assert.deepStrictEqual(pre.run({ input: { tool_name: 'Edit', tool_input: {}, cwd: wt }, runDir: assigned.run, runState: assigned.state, cwd: wt }), {});
  assert.deepStrictEqual(pre.run({ input: bashInput('git commit -m "x"', wt), runDir: null, runState: null, cwd: wt }), {});
});

test('two live runs: commit in the OLDER run\'s own worktree is allowed even when the resolved run is the NEWER one, and logs wd-ambiguous on the resolved run', () => {
  const project = tmpProject();
  const olderWt = gitRepo();
  const newerWt = gitRepo();
  mkRunAt(project, '2026-07-01T090000-spec-1', olderWt); // older, non-terminal, NOT the resolved run
  const newer = mkRunAt(project, '2026-07-02T090000-spec-2', newerWt); // resolved run

  const out = pre.run({
    input: bashInput(`git -C ${olderWt} commit -m "x"`, project),
    runDir: newer.run,
    runState: newer.state,
    cwd: project,
  });
  assert.deepStrictEqual(out, {});
  const events = fs.readFileSync(path.join(newer.run, 'events.jsonl'), 'utf8');
  assert.match(events, /"type":"wd-ambiguous"/);
  assert.match(events, new RegExp(esc(olderWt)));
});

test('two live runs: commit in a THIRD repo matching neither worktree is still denied, reason mentions both worktrees', () => {
  const project = tmpProject();
  const olderWt = gitRepo();
  const newerWt = gitRepo();
  const thirdRepo = gitRepo();
  mkRunAt(project, '2026-07-01T090000-spec-1', olderWt);
  const newer = mkRunAt(project, '2026-07-02T090000-spec-2', newerWt);

  const out = pre.run({
    input: bashInput(`git -C ${thirdRepo} commit -m "x"`, project),
    runDir: newer.run,
    runState: newer.state,
    cwd: project,
  });
  const spec = out.json.hookSpecificOutput;
  assert.strictEqual(spec.permissionDecision, 'deny');
  assert.match(spec.permissionDecisionReason, new RegExp(esc(newerWt)));
  assert.match(spec.permissionDecisionReason, new RegExp(esc(olderWt)));
});

test('two live runs: a push mismatch matching another live worktree is not logged at all', () => {
  const project = tmpProject();
  const olderWt = gitRepo();
  const newerWt = gitRepo();
  mkRunAt(project, '2026-07-01T090000-spec-1', olderWt);
  const newer = mkRunAt(project, '2026-07-02T090000-spec-2', newerWt);

  const out = pre.run({
    input: bashInput(`git -C ${olderWt} push origin main`, project),
    runDir: newer.run,
    runState: newer.state,
    cwd: project,
  });
  assert.deepStrictEqual(out, {});
  assert.ok(!fs.existsSync(path.join(newer.run, 'events.jsonl')));
});

test('deny reason substitutes CLAUDE_PLUGIN_ROOT when set, else keeps the literal placeholder', () => {
  const wt = gitRepo();
  const other = gitRepo();

  delete process.env.CLAUDE_PLUGIN_ROOT;
  const { run: run1, state: state1 } = mkRun(wt);
  const withoutEnv = pre.run({ input: bashInput('git commit -m "x"', other), runDir: run1, runState: state1, cwd: other });
  assert.match(withoutEnv.json.hookSpecificOutput.permissionDecisionReason, /\$\{CLAUDE_PLUGIN_ROOT\}\/bin\/hooks\.js/);

  process.env.CLAUDE_PLUGIN_ROOT = '/opt/claude-tweaks';
  try {
    const { run: run2, state: state2 } = mkRun(wt);
    const withEnv = pre.run({ input: bashInput('git commit -m "x"', other), runDir: run2, runState: state2, cwd: other });
    assert.match(withEnv.json.hookSpecificOutput.permissionDecisionReason, /\/opt\/claude-tweaks\/bin\/hooks\.js/);
  } finally {
    delete process.env.CLAUDE_PLUGIN_ROOT;
  }
});

function gitRepoWithCommit() {
  const dir = gitRepo();
  execFileSync('git', ['-C', dir, 'commit', '--allow-empty', '-m', 'init', '-q']);
  return dir;
}

function linkedWorktreeOf(main) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-e1-wtparent-'));
  const wt = path.join(parent, 'wt');
  execFileSync('git', ['-C', main, 'worktree', 'add', '-q', wt, '-b', `wt-branch-${path.basename(parent)}`]);
  return fs.realpathSync(wt);
}

function withPolicy(repo, content) {
  fs.mkdirSync(path.join(repo, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.claude-tweaks', 'policy.yml'), content);
}

test('worktree-required: policy off allows Edit/Write/NotebookEdit/commit in the main checkout', () => {
  const repo = gitRepoWithCommit();
  assert.deepStrictEqual(pre.run({ input: { tool_name: 'Edit', tool_input: { file_path: path.join(repo, 'a.txt') } }, runDir: null, runState: null, cwd: repo }), {});
  assert.deepStrictEqual(pre.run({ input: { tool_name: 'Write', tool_input: { file_path: path.join(repo, 'b.txt') } }, runDir: null, runState: null, cwd: repo }), {});
  assert.deepStrictEqual(pre.run({ input: { tool_name: 'NotebookEdit', tool_input: { notebook_path: path.join(repo, 'n.ipynb') } }, runDir: null, runState: null, cwd: repo }), {});
  assert.deepStrictEqual(pre.run({ input: bashInput('git commit -m "x"', repo), runDir: null, runState: null, cwd: repo }), {});
});

test('worktree-required: policy on denies Edit in the main checkout with a corrective reason', () => {
  const repo = gitRepoWithCommit();
  withPolicy(repo, 'worktree.always: true\n');
  const out = pre.run({ input: { tool_name: 'Edit', tool_input: { file_path: path.join(repo, 'a.txt') } }, runDir: null, runState: null, cwd: repo });
  const spec = out.json.hookSpecificOutput;
  assert.strictEqual(spec.permissionDecision, 'deny');
  assert.match(spec.permissionDecisionReason, /worktree\.always/);
  assert.match(spec.permissionDecisionReason, /using-git-worktrees/);
});

test('worktree-required: policy on allows Edit inside a linked worktree', () => {
  const repo = gitRepoWithCommit();
  withPolicy(repo, 'worktree.always: true\n');
  execFileSync('git', ['-C', repo, 'add', '.claude-tweaks/policy.yml']);
  execFileSync('git', ['-C', repo, 'commit', '-m', 'policy', '-q']);
  const wt = linkedWorktreeOf(repo);
  const out = pre.run({ input: { tool_name: 'Edit', tool_input: { file_path: path.join(wt, 'a.txt') } }, runDir: null, runState: null, cwd: wt });
  assert.deepStrictEqual(out, {});
});

test('worktree-required: policy on denies Write to a not-yet-existing file, and NotebookEdit, in the main checkout', () => {
  const repo = gitRepoWithCommit();
  withPolicy(repo, 'worktree.always: true\n');
  const writeOut = pre.run({ input: { tool_name: 'Write', tool_input: { file_path: path.join(repo, 'new', 'brand-new.txt') } }, runDir: null, runState: null, cwd: repo });
  assert.strictEqual(writeOut.json.hookSpecificOutput.permissionDecision, 'deny');
  const nbOut = pre.run({ input: { tool_name: 'NotebookEdit', tool_input: { notebook_path: path.join(repo, 'n.ipynb') } }, runDir: null, runState: null, cwd: repo });
  assert.strictEqual(nbOut.json.hookSpecificOutput.permissionDecision, 'deny');
});

test('worktree-required: policy on denies a git commit in the main checkout even with NO pipeline run dir at all', () => {
  const repo = gitRepoWithCommit();
  withPolicy(repo, 'worktree.always: true\n');
  const out = pre.run({ input: bashInput('git commit -m "x"', repo), runDir: null, runState: null, cwd: repo });
  assert.strictEqual(out.json.hookSpecificOutput.permissionDecision, 'deny');
});

test('worktree-required: policy is read from the EDIT TARGET\'s own repo, not the session cwd', () => {
  const policyRepo = gitRepoWithCommit();
  withPolicy(policyRepo, 'worktree.always: true\n');
  const otherRepo = gitRepoWithCommit(); // no policy
  const out = pre.run({ input: { tool_name: 'Edit', tool_input: { file_path: path.join(otherRepo, 'a.txt') } }, runDir: null, runState: null, cwd: policyRepo });
  assert.deepStrictEqual(out, {});
});

test('worktree-required: a policy file in an ancestor directory OUTSIDE the target repo does not leak in (repo-scoped, not filesystem-ancestor-scoped)', () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-e1-ancestor-'));
  withPolicy(parent, 'worktree.always: true\n');
  const nestedRepo = path.join(parent, 'nested-repo');
  fs.mkdirSync(nestedRepo, { recursive: true });
  execFileSync('git', ['-C', nestedRepo, 'init', '-q']);
  execFileSync('git', ['-C', nestedRepo, 'commit', '--allow-empty', '-m', 'init', '-q']);
  const out = pre.run({ input: { tool_name: 'Edit', tool_input: { file_path: path.join(nestedRepo, 'a.txt') } }, runDir: null, runState: null, cwd: nestedRepo });
  assert.deepStrictEqual(out, {});
});

test('worktree-required: policy on denies a non-git Bash file write in the main checkout (tee, cp, mv)', () => {
  const repo = gitRepoWithCommit();
  withPolicy(repo, 'worktree.always: true\n');
  const target = path.join(repo, 'a.txt');

  const tee = pre.run({ input: bashInput(`echo hi | tee ${target}`, repo), runDir: null, runState: null, cwd: repo });
  assert.strictEqual(tee.json.hookSpecificOutput.permissionDecision, 'deny');

  const cp = pre.run({ input: bashInput(`cp source.txt ${target}`, repo), runDir: null, runState: null, cwd: repo });
  assert.strictEqual(cp.json.hookSpecificOutput.permissionDecision, 'deny');

  const mv = pre.run({ input: bashInput(`mv source.txt ${target}`, repo), runDir: null, runState: null, cwd: repo });
  assert.strictEqual(mv.json.hookSpecificOutput.permissionDecision, 'deny');
});

test('worktree-required: a non-git Bash file write inside a linked worktree is allowed', () => {
  const repo = gitRepoWithCommit();
  withPolicy(repo, 'worktree.always: true\n');
  execFileSync('git', ['-C', repo, 'add', '.claude-tweaks/policy.yml']);
  execFileSync('git', ['-C', repo, 'commit', '-m', 'policy', '-q']);
  const wt = linkedWorktreeOf(repo);
  const target = path.join(wt, 'a.txt');
  const out = pre.run({ input: bashInput(`cp source.txt ${target}`, wt), runDir: null, runState: null, cwd: wt });
  assert.deepStrictEqual(out, {});
});

test('worktree-required: /dev/null is not treated as a file-write target', () => {
  const repo = gitRepoWithCommit();
  withPolicy(repo, 'worktree.always: true\n');
  const out = pre.run({ input: bashInput('cp source.txt /dev/null', repo), runDir: null, runState: null, cwd: repo });
  assert.deepStrictEqual(out, {});
});

test('worktree-required: a Bash command with no file-write shape at all (e.g. a plain read) is allowed', () => {
  const repo = gitRepoWithCommit();
  withPolicy(repo, 'worktree.always: true\n');
  const out = pre.run({ input: bashInput('cat a.txt | grep foo', repo), runDir: null, runState: null, cwd: repo });
  assert.deepStrictEqual(out, {});
});
