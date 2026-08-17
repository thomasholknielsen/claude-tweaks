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

const SKILLS = path.join(__dirname, '..', 'plugin', 'skills');
const ENGINE = fs.readFileSync(path.join(SKILLS, 'wrap-up', 'curation-engine.md'), 'utf8');
const BATCH = fs.readFileSync(path.join(SKILLS, 'flow', 'multispec-batch-curation.md'), 'utf8');

// #692: the sweep snippet's RUN_ROOT line now shells out to
// `node bin/hooks.js resolve-run-dir --root-only`, so a live spawn needs
// CLAUDE_PLUGIN_ROOT pointing at THIS repo's plugin payload root (`plugin/`,
// where bin/hooks.js physically lives) — independent of whatever temp git repo
// a given probe's `cwd` is. Every spawnSync below spreads `...process.env`, so
// setting it once here propagates everywhere; guarded so a real value (an
// actual plugin-hosted run) is never clobbered.
if (!process.env.CLAUDE_PLUGIN_ROOT) process.env.CLAUDE_PLUGIN_ROOT = path.join(__dirname, '..', 'plugin');

// The documented sweep — must appear verbatim inside a ```bash fence in curation-engine.md §4.
const SWEEP_SNIPPET = [
  'RUN_ROOT=$(node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" resolve-run-dir --root-only)',
  'RUN_DIR=$( [ -n "$PIPELINE_RUN_DIR" ] && cd "$PIPELINE_RUN_DIR" 2>/dev/null && pwd -P )',
  'WT=$( [ -n "$WORKTREE" ] && cd "$WORKTREE" 2>/dev/null && pwd -P )',
  'if [ -z "$RUN_DIR" ] || [ -z "$WT" ]; then',
  '  echo "sweep: PIPELINE_RUN_DIR or WORKTREE unset/missing — not swept"',
  'elif [ "${RUN_DIR#"$RUN_ROOT"/}" = "$RUN_DIR" ]; then',
  '  echo "sweep: $RUN_DIR is not under $RUN_ROOT — not swept"',
  'else',
  '  SHADOW="$WT/${RUN_DIR#"$RUN_ROOT"/}"           # the worktree\'s shadow of .claude-tweaks/pipelines/{run-id}[/spec-{N}]',
  '  if [ ! "$SHADOW" -ef "$RUN_DIR" ] && [ -d "$SHADOW/staged" ]; then',
  '    for f in "$SHADOW"/staged/*; do',
  '      [ -e "$f" ] || continue',
  '      base=$(basename "$f")',
  '      if [ -L "$f" ] || [ ! -f "$f" ]; then echo "sweep: skipped $base — not a regular file"; continue; fi',
  '      dest="$RUN_DIR/staged/$base"',
  '      if [ -e "$dest" ]; then',
  '        dest="$dest.shadow-dup"; n=1',
  '        while [ -e "$dest" ]; do dest="$RUN_DIR/staged/$base.shadow-dup-$n"; n=$((n+1)); done',
  '        mv "$f" "$dest" && echo "collision: $base (kept as $(basename "$dest"))" || echo "sweep: FAILED to move $base — still in the shadow"',
  '      else',
  '        mv "$f" "$dest" && echo "relocated: $base" || echo "sweep: FAILED to move $base — still in the shadow"',
  '      fi',
  '    done',
  '    rmdir "$SHADOW/staged" 2>/dev/null || echo "sweep: shadow staged/ not empty after sweep — inspect $SHADOW/staged"',
  '  fi',
  '  if [ ! "$SHADOW" -ef "$RUN_DIR" ] && [ -f "$SHADOW/decisions.md" ] && [ ! -L "$SHADOW/decisions.md" ]; then',
  '    if grep \'^- \' "$SHADOW/decisions.md" >> "$RUN_DIR/decisions.md"; then echo "relocated: decisions.md (entries appended)"; else echo "sweep: shadow decisions.md had no entries — dropped"; fi',
  '    rm "$SHADOW/decisions.md"',
  '  fi',
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
  const { wt, runDir, shadow } = buildFixture(t);
  // A judge that resolved the run dir relatively from inside the worktree — the incident shape.
  fs.mkdirSync(path.join(shadow, 'staged'), { recursive: true });
  fs.mkdirSync(path.join(shadow, 'work'), { recursive: true });
  fs.writeFileSync(path.join(shadow, 'staged', 'wrap-up-skill-1.md'), 'proposal\n');
  fs.writeFileSync(path.join(shadow, 'decisions.md'), '# Auto-Decision Log — x\n\n## /wrap-up\n- STAGED stray line\n');
  fs.writeFileSync(path.join(shadow, 'work', '1-spec.md'), 'materialized — must stay\n');

  const r = sweep(wt, { ...process.env, PIPELINE_RUN_DIR: runDir, WORKTREE: wt });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /relocated: wrap-up-skill-1\.md/);
  assert.match(r.stdout, /relocated: decisions\.md/);
  assert.ok(fs.existsSync(path.join(runDir, 'staged', 'wrap-up-skill-1.md')), 'file now at the anchored path');
  assert.ok(!fs.existsSync(path.join(shadow, 'staged', 'wrap-up-skill-1.md')), 'shadow copy gone');
  assert.ok(!fs.existsSync(path.join(shadow, 'staged')), 'empty shadow staged/ removed');
  const log = fs.readFileSync(path.join(runDir, 'decisions.md'), 'utf8');
  assert.match(log, /STAGED stray line/, 'shadow decisions.md entry appended to the anchored log');
  assert.ok(!log.includes('# Auto-Decision Log — x'), 'shadow decisions.md header dropped, not appended');
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

// ---- Shared fixture builder for the remaining probes: a main checkout + linked worktree + anchored run dir ----
function buildFixture(t, { realpath = true } = {}) {
  const raw = fs.mkdtempSync(path.join(os.tmpdir(), 'stagepath-probe-'));
  const root = realpath ? fs.realpathSync(raw) : raw;
  t.after(() => fs.rmSync(raw, { recursive: true, force: true }));
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
  return { main, wt, runDir, shadow: path.join(wt, runRel) };
}
const sweep = (cwd, env) => spawnSync('bash', ['-c', SWEEP_SNIPPET], { cwd, encoding: 'utf8', timeout: 30_000, env });

test('probe: a same-basename collision keeps the anchored file, moves the shadow copy to .shadow-dup, and says so', (t) => {
  const { wt, runDir, shadow } = buildFixture(t);
  fs.mkdirSync(path.join(shadow, 'staged'), { recursive: true });
  fs.writeFileSync(path.join(runDir, 'staged', 'wrap-up-skill-1.md'), 'ANCHORED ORIGINAL\n');
  fs.writeFileSync(path.join(shadow, 'staged', 'wrap-up-skill-1.md'), 'shadow copy\n');
  const r = sweep(wt, { ...process.env, PIPELINE_RUN_DIR: runDir, WORKTREE: wt });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /collision: wrap-up-skill-1\.md \(kept as wrap-up-skill-1\.md\.shadow-dup\)/);
  assert.doesNotMatch(r.stdout, /relocated: wrap-up-skill-1\.md/, 'a collision is never reported as a relocation');
  assert.equal(fs.readFileSync(path.join(runDir, 'staged', 'wrap-up-skill-1.md'), 'utf8'), 'ANCHORED ORIGINAL\n', 'anchored file untouched');
  assert.equal(fs.readFileSync(path.join(runDir, 'staged', 'wrap-up-skill-1.md.shadow-dup'), 'utf8'), 'shadow copy\n', 'shadow copy preserved at the anchored path');
  assert.ok(!fs.existsSync(path.join(shadow, 'staged')), 'shadow staged/ emptied and removed');
});

test('probe: run from the main checkout with a trailing-slash WORKTREE, the guard holds and the anchored staged/ survives', (t) => {
  const { main, runDir } = buildFixture(t);
  const r = sweep(main, { ...process.env, PIPELINE_RUN_DIR: runDir + '/', WORKTREE: main + '/' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), '', 'a well-configured no-op prints nothing');
  assert.ok(fs.existsSync(path.join(runDir, 'staged')), 'anchored staged/ survives — trailing slashes cannot defeat the -ef guard');
});

test('probe: a symlinked temp root (raw mkdtemp path, no realpath) still relocates — pwd -P normalizes both sides', (t) => {
  const { wt, runDir, shadow } = buildFixture(t, { realpath: false });
  fs.mkdirSync(path.join(shadow, 'staged'), { recursive: true });
  fs.writeFileSync(path.join(shadow, 'staged', 'claude-md-1.md'), 'p\n');
  const r = sweep(wt, { ...process.env, PIPELINE_RUN_DIR: runDir, WORKTREE: wt });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /relocated: claude-md-1\.md/);
  assert.ok(fs.existsSync(path.join(runDir, 'staged', 'claude-md-1.md')), 'relocated to the anchored path despite symlinked components');
});

test('probe: an unset WORKTREE is a loud diagnostic, not a silent no-op — nothing is moved', (t) => {
  const { wt, runDir, shadow } = buildFixture(t);
  fs.mkdirSync(path.join(shadow, 'staged'), { recursive: true });
  fs.writeFileSync(path.join(shadow, 'staged', 'x.md'), 'x\n');
  const env = { ...process.env, PIPELINE_RUN_DIR: runDir };
  delete env.WORKTREE;
  const r = sweep(wt, env);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /not swept/);
  assert.ok(fs.existsSync(path.join(shadow, 'staged', 'x.md')), 'nothing moved when misconfigured');
});

test('probe: a run dir outside RUN_ROOT is a loud diagnostic — nothing is moved', (t) => {
  const { wt, shadow } = buildFixture(t);
  const other = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'stagepath-other-')));
  t.after(() => fs.rmSync(other, { recursive: true, force: true }));
  fs.mkdirSync(path.join(other, 'staged'));
  fs.mkdirSync(path.join(shadow, 'staged'), { recursive: true });
  fs.writeFileSync(path.join(shadow, 'staged', 'x.md'), 'x\n');
  const r = sweep(wt, { ...process.env, PIPELINE_RUN_DIR: other, WORKTREE: wt });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /not under .* — not swept/);
  assert.ok(fs.existsSync(path.join(shadow, 'staged', 'x.md')), 'nothing moved');
});

test('probe: a headers-only shadow decisions.md is dropped and reported as such, never as "entries appended"', (t) => {
  const { wt, runDir, shadow } = buildFixture(t);
  fs.mkdirSync(shadow, { recursive: true });
  fs.writeFileSync(path.join(shadow, 'decisions.md'), '# Auto-Decision Log — x\n\n## /wrap-up\n');
  const before = fs.readFileSync(path.join(runDir, 'decisions.md'), 'utf8');
  const r = sweep(wt, { ...process.env, PIPELINE_RUN_DIR: runDir, WORKTREE: wt });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /had no entries — dropped/);
  assert.doesNotMatch(r.stdout, /entries appended/);
  assert.equal(fs.readFileSync(path.join(runDir, 'decisions.md'), 'utf8'), before, 'anchored log unchanged');
  assert.ok(!fs.existsSync(path.join(shadow, 'decisions.md')), 'shadow file removed');
});

test('probe: a repeated collision keeps every earlier .shadow-dup — the second lands as .shadow-dup-1', (t) => {
  const { wt, runDir, shadow } = buildFixture(t);
  fs.mkdirSync(path.join(shadow, 'staged'), { recursive: true });
  fs.writeFileSync(path.join(runDir, 'staged', 'wrap-up-skill-1.md'), 'ANCHORED\n');
  fs.writeFileSync(path.join(runDir, 'staged', 'wrap-up-skill-1.md.shadow-dup'), 'FIRST DUP — pending\n');
  fs.writeFileSync(path.join(shadow, 'staged', 'wrap-up-skill-1.md'), 'second shadow copy\n');
  const r = sweep(wt, { ...process.env, PIPELINE_RUN_DIR: runDir, WORKTREE: wt });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /collision: wrap-up-skill-1\.md \(kept as wrap-up-skill-1\.md\.shadow-dup-1\)/);
  assert.equal(fs.readFileSync(path.join(runDir, 'staged', 'wrap-up-skill-1.md.shadow-dup'), 'utf8'), 'FIRST DUP — pending\n', 'earlier dup untouched');
  assert.equal(fs.readFileSync(path.join(runDir, 'staged', 'wrap-up-skill-1.md.shadow-dup-1'), 'utf8'), 'second shadow copy\n');
});

test('probe: a symlink in the shadow staged/ is skipped with a diagnostic, never moved, and the shadow dir is left for inspection', (t) => {
  const { wt, runDir, shadow } = buildFixture(t);
  fs.mkdirSync(path.join(shadow, 'staged'), { recursive: true });
  fs.writeFileSync(path.join(shadow, 'secret.txt'), 'outside staged\n');
  fs.symlinkSync(path.join(shadow, 'secret.txt'), path.join(shadow, 'staged', 'link.md'));
  const r = sweep(wt, { ...process.env, PIPELINE_RUN_DIR: runDir, WORKTREE: wt });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /skipped link\.md — not a regular file/);
  assert.match(r.stdout, /shadow staged\/ not empty after sweep/);
  assert.ok(!fs.existsSync(path.join(runDir, 'staged', 'link.md')), 'symlink never relocated');
  assert.ok(fs.lstatSync(path.join(shadow, 'staged', 'link.md')).isSymbolicLink(), 'symlink left in place');
});

test('probe: an mv failure is a loud diagnostic, not a silent no-op', (t) => {
  if (typeof process.getuid === 'function' && process.getuid() === 0) { t.skip('root ignores directory permissions'); return; }
  const { wt, runDir, shadow } = buildFixture(t);
  fs.mkdirSync(path.join(shadow, 'staged'), { recursive: true });
  fs.writeFileSync(path.join(shadow, 'staged', 'x.md'), 'x\n');
  fs.chmodSync(path.join(runDir, 'staged'), 0o555);
  t.after(() => { if (fs.existsSync(path.join(runDir, 'staged'))) fs.chmodSync(path.join(runDir, 'staged'), 0o755); });
  const r = sweep(wt, { ...process.env, PIPELINE_RUN_DIR: runDir, WORKTREE: wt });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /FAILED to move x\.md/);
  assert.match(r.stdout, /shadow staged\/ not empty after sweep/);
  assert.ok(fs.existsSync(path.join(shadow, 'staged', 'x.md')), 'file still in the shadow — nothing lost');
  fs.chmodSync(path.join(runDir, 'staged'), 0o755);
});
