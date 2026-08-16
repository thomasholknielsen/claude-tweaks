// tests/curation-judge-stagepath.test.js — pins #675: a curation judge that stages a finding
// self-verifies the file at the ABSOLUTE anchored stagePath and echoes that path; a relative
// stagePath is a payload violation the controller rejects; and after every judged fan-out the
// engine sweeps the current worktree's shadow of the run-dir `staged/` path. The sweep snippet
// below is asserted byte-identical to the one in curation-engine.md, then run live against a
// fixture worktree shadow — so the documented procedure is what this probe exercised.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SKILLS = path.join(__dirname, '..', 'skills');
const ENGINE = fs.readFileSync(path.join(SKILLS, 'wrap-up', 'curation-engine.md'), 'utf8');
const BATCH = fs.readFileSync(path.join(SKILLS, 'flow', 'multispec-batch-curation.md'), 'utf8');

// The documented sweep — must appear verbatim inside a ```bash fence in curation-engine.md §4.
const SWEEP_SNIPPET = [
  'RUN_ROOT=$(cd "$(dirname "$(git rev-parse --git-common-dir)")" && pwd)',
  'REL="${PIPELINE_RUN_DIR#"$RUN_ROOT"/}"           # e.g. .claude-tweaks/pipelines/{run-id}[/spec-{N}]',
  'SHADOW="$WORKTREE/$REL"',
  'if [ "$SHADOW" != "$PIPELINE_RUN_DIR" ] && [ -d "$SHADOW/staged" ]; then',
  '  for f in "$SHADOW"/staged/*; do',
  '    [ -e "$f" ] || continue',
  '    mv -n "$f" "$PIPELINE_RUN_DIR/staged/" && echo "relocated: $(basename "$f")"',
  '  done',
  '  rmdir "$SHADOW/staged" 2>/dev/null || true',
  'fi',
  'if [ "$SHADOW" != "$PIPELINE_RUN_DIR" ] && [ -f "$SHADOW/decisions.md" ]; then',
  '  cat "$SHADOW/decisions.md" >> "$PIPELINE_RUN_DIR/decisions.md" && rm "$SHADOW/decisions.md" && echo "relocated: decisions.md (appended)"',
  'fi',
].join('\n');

test('curation-engine.md §4 carries the judge self-verification step and the absolute-stagePath rule', () => {
  const s4 = ENGINE.slice(ENGINE.indexOf('## 4. Parallel dispatch'));
  assert.match(s4, /test -f/, 'judge self-verifies with test -f');
  assert.match(s4, /absolute/, 'names the absolute anchored path');
  assert.match(s4, /stagePath/, 'names the payload field');
  assert.match(s4, /re-prompt once/, 'controller re-prompts once on a relative stagePath');
  assert.match(s4, /unstaged/, 'then treats the finding as unstaged and surfaces it');
});

test('curation-engine.md §3 stagePath row requires the absolute anchored path and names the rejection', () => {
  const row = ENGINE.split('\n').find((l) => l.startsWith('| `findings[].stagePath` |'));
  assert.ok(row, 'stagePath contract row present');
  assert.match(row, /absolute/i);
  assert.match(row, /reject/i);
});

test('curation-engine.md §4 documents the post-fan-out shadow sweep verbatim, scoped to staged/ never work/', () => {
  const s4 = ENGINE.slice(ENGINE.indexOf('## 4. Parallel dispatch'));
  assert.ok(s4.includes('```bash\n' + SWEEP_SNIPPET + '\n```'), 'sweep snippet present byte-for-byte inside a bash fence');
  assert.match(s4, /shadow/i);
  assert.match(s4, /never `work\/`/, 'states the work/ exclusion');
});

test('multispec-batch-curation.md cites the sweep at its registry pass', () => {
  assert.match(BATCH, /shadow sweep/i);
  assert.ok(BATCH.includes('curation-engine.md'), 'cites the engine file that owns the sweep');
});

// ---- Live probe: the documented sweep relocates a stray shadow file and leaves work/ alone ----
test('probe: the documented sweep relocates a staged file written to the worktree shadow and never touches work/', (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'stagepath-probe-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = (cwd, ...args) => {
    const r = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 30_000, env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' } });
    assert.equal(r.status, 0, r.stderr);
    return r;
  };
  const main = path.join(root, 'main');
  fs.mkdirSync(main);
  git(main, 'init', '-q');
  git(main, 'config', 'user.email', 'probe@example.invalid');
  git(main, 'config', 'user.name', 'probe');
  fs.writeFileSync(path.join(main, 'a.txt'), 'a\n');
  git(main, 'add', 'a.txt');
  git(main, 'commit', '-q', '-m', 'base');
  const wt = path.join(root, 'wt');
  git(main, 'worktree', 'add', '-q', wt, '-b', 'probe');

  const runRel = '.claude-tweaks/pipelines/2026-01-01T000000-spec-1/spec-1';
  const runDir = path.join(main, runRel);
  fs.mkdirSync(path.join(runDir, 'staged'), { recursive: true });
  fs.writeFileSync(path.join(runDir, 'decisions.md'), '# log\n');
  // A judge that resolved the run dir relatively from inside the worktree — the incident shape.
  const shadow = path.join(wt, runRel);
  fs.mkdirSync(path.join(shadow, 'staged'), { recursive: true });
  fs.mkdirSync(path.join(shadow, 'work'), { recursive: true });
  fs.writeFileSync(path.join(shadow, 'staged', 'wrap-up-skill-1.md'), 'proposal\n');
  fs.writeFileSync(path.join(shadow, 'decisions.md'), '- STAGED stray line\n');
  fs.writeFileSync(path.join(shadow, 'work', '1-spec.md'), 'materialized — must stay\n');

  const r = spawnSync('bash', ['-c', SWEEP_SNIPPET], {
    cwd: wt, encoding: 'utf8', timeout: 30_000,
    env: { ...process.env, PIPELINE_RUN_DIR: runDir, WORKTREE: wt },
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /relocated: wrap-up-skill-1\.md/);
  assert.match(r.stdout, /relocated: decisions\.md/);
  assert.ok(fs.existsSync(path.join(runDir, 'staged', 'wrap-up-skill-1.md')), 'file now at the anchored path');
  assert.ok(!fs.existsSync(path.join(shadow, 'staged', 'wrap-up-skill-1.md')), 'shadow copy gone');
  assert.ok(!fs.existsSync(path.join(shadow, 'staged')), 'empty shadow staged/ removed');
  assert.match(fs.readFileSync(path.join(runDir, 'decisions.md'), 'utf8'), /STAGED stray line/, 'shadow decisions.md appended to the anchored log');
  assert.ok(!fs.existsSync(path.join(shadow, 'decisions.md')), 'shadow decisions.md removed after append');
  assert.ok(fs.existsSync(path.join(shadow, 'work', '1-spec.md')), 'work/ untouched');
});

test('probe: the sweep is a no-op when no shadow exists', (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'stagepath-probe-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const main = path.join(root, 'main');
  fs.mkdirSync(main);
  const r0 = spawnSync('git', ['init', '-q'], { cwd: main, encoding: 'utf8', timeout: 30_000 });
  assert.equal(r0.status, 0, r0.stderr);
  const runDir = path.join(main, '.claude-tweaks/pipelines/x/spec-1');
  fs.mkdirSync(path.join(runDir, 'staged'), { recursive: true });
  const r = spawnSync('bash', ['-c', SWEEP_SNIPPET], { cwd: main, encoding: 'utf8', timeout: 30_000, env: { ...process.env, PIPELINE_RUN_DIR: runDir, WORKTREE: main } });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), '');
  assert.ok(fs.existsSync(path.join(runDir, 'staged')), 'anchored staged/ survives — the same-path guard stops the sweep from rmdir-ing it');
});
