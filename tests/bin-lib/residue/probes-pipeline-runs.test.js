const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { probePipelineRuns } = require('../../../plugin/bin/lib/residue/probes/pipeline-runs');
const { archiveRunDir } = require('../../../plugin/bin/lib/reconcile/archive-merged');
const { filterResultsByScope } = require('../../../plugin/bin/lib/residue/scope-filter');

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'residue-pipeline-runs-'));
  fs.mkdirSync(path.join(root, '.git')); // mainCheckoutRoot needs a repo marker
  fs.mkdirSync(path.join(root, '.claude-tweaks', 'pipelines'), { recursive: true });
  fs.mkdirSync(path.join(root, '.claude-tweaks', 'pipelines', 'archive'), { recursive: true });
  return root;
}

function writeRun(root, name, state) {
  const dir = path.join(root, '.claude-tweaks', 'pipelines', name);
  fs.mkdirSync(dir, { recursive: true });
  if (state !== null) {
    fs.writeFileSync(path.join(dir, 'run-state.json'), JSON.stringify(state));
  }
  return dir;
}

test('an un-archived clean run dir is reported with remedy auto', () => {
  const root = makeFixture();
  writeRun(root, '2026-01-01T000000-spec-1', { status: 'clean' });
  const { ran, findings } = probePipelineRuns({ cwd: root });
  assert.strictEqual(ran, true);
  assert.strictEqual(findings.length, 1);
  assert.strictEqual(findings[0].kind, 'pipeline-run');
  assert.strictEqual(findings[0].remedy, 'auto');
  // No attribution inputs supplied -> nothing is provably this run's own (#1118).
  assert.strictEqual(findings[0].scope, 'observed');
  assert.match(findings[0].subject, /2026-01-01T000000-spec-1/);
});

// #1118 supersedes the #1011 audit that used to pin the opposite here:
// observed live during record #706's wrap-up, a `--scope blast-radius`
// sweep returned 6 un-archived clean run dirs belonging to OTHER records —
// exactly the cross-session noise residue-sweep.md documents blast-radius
// as excluding. A clean run dir is only this run's own blast radius when
// it can be attributed to the invoking run; sibling orphans stay visible
// under --scope repo (/tidy's sweep).
test('a clean run dir not attributable to the invoking run is observed (#1118)', () => {
  const root = makeFixture();
  writeRun(root, '2026-01-01T000000-record-999', { status: 'clean', worktree: path.join(root, 'elsewhere') });
  const { findings } = probePipelineRuns({ cwd: root, runId: '2026-01-02T000000-record-1118', worktreeRoot: root });
  assert.strictEqual(findings.length, 1);
  assert.strictEqual(findings[0].scope, 'observed');
});

test('a clean run dir whose name equals the invoking runId is blast-radius', () => {
  const root = makeFixture();
  writeRun(root, '2026-01-01T000000-record-1118', { status: 'clean' });
  const { findings } = probePipelineRuns({ cwd: root, runId: '2026-01-01T000000-record-1118' });
  assert.strictEqual(findings.length, 1);
  assert.strictEqual(findings[0].scope, 'blast-radius');
});

test('a clean run dir whose run-state worktree matches the invoking worktree root is blast-radius', () => {
  const root = makeFixture();
  // root sits under os.tmpdir(): on macOS that is a /var -> /private/var
  // symlink, so this test only passes when the probe realpaths BOTH sides.
  writeRun(root, '2026-01-01T000000-spec-7', { status: 'clean', worktree: root });
  const { findings } = probePipelineRuns({ cwd: root, worktreeRoot: root });
  assert.strictEqual(findings.length, 1);
  assert.strictEqual(findings[0].scope, 'blast-radius');
});

// Record #1118's acceptance criterion, end to end through the CLI's own
// filter: one attributable dir, one sibling dir — blast-radius keeps only
// the invoking run's own; repo scope still sees both, untouched.
test('AC #1118: blast-radius keeps only the attributable run dir; repo scope keeps both', () => {
  const root = makeFixture();
  writeRun(root, '2026-01-01T000000-record-1118', { status: 'clean', worktree: root });
  writeRun(root, '2026-01-01T000000-record-999', { status: 'clean', worktree: path.join(root, 'elsewhere') });
  const result = probePipelineRuns({ cwd: root, runId: '2026-01-01T000000-record-1118', worktreeRoot: root });
  assert.strictEqual(result.findings.length, 2);

  const [blast] = filterResultsByScope([result], 'blast-radius');
  assert.strictEqual(blast.findings.length, 1);
  assert.match(blast.findings[0].subject, /record-1118/);

  const [repo] = filterResultsByScope([result], 'repo');
  assert.strictEqual(repo.findings.length, 2);
});

test('a non-clean run dir is not reported', () => {
  const root = makeFixture();
  writeRun(root, '2026-01-01T000000-spec-2', { status: 'interrupted' });
  const { findings } = probePipelineRuns({ cwd: root });
  assert.deepStrictEqual(findings, []);
});

test('a run dir with no run-state.json is not reported', () => {
  const root = makeFixture();
  writeRun(root, '2026-01-01T000000-spec-3', null);
  const { findings } = probePipelineRuns({ cwd: root });
  assert.deepStrictEqual(findings, []);
});

test('the archive/ directory itself is never reported', () => {
  const root = makeFixture();
  // archive/ already exists from makeFixture(); it does not match RUN_ID_RE
  // and must never be treated as a candidate run dir.
  const { findings } = probePipelineRuns({ cwd: root });
  assert.deepStrictEqual(findings, []);
});

test('no .claude-tweaks/pipelines directory at all is a clean run with no findings', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'residue-pipeline-runs-empty-'));
  fs.mkdirSync(path.join(root, '.git'));
  const { ran, findings } = probePipelineRuns({ cwd: root });
  assert.strictEqual(ran, true);
  assert.deepStrictEqual(findings, []);
});

test('a genuine readdir failure (not ENOENT) reports ran: false, not a clean sweep', () => {
  const root = makeFixture();
  // Replace the pipelines dir with a file so readdirSync fails with ENOTDIR
  // (not ENOENT) — the same "real error, not absence" shape as EACCES/EIO.
  fs.rmSync(path.join(root, '.claude-tweaks', 'pipelines'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude-tweaks', 'pipelines'), 'not a directory');
  const { ran, reason, findings } = probePipelineRuns({ cwd: root });
  assert.strictEqual(ran, false);
  assert.match(reason, /could not read \.claude-tweaks\/pipelines/);
  assert.deepStrictEqual(findings, []);
});

test('the flagged remedy is mechanically applicable: archiveRunDir moves a flagged dir under archive/', () => {
  const root = makeFixture();
  execFileSync('git', ['-C', root, 'init', '-q']);
  execFileSync('git', ['-C', root, 'config', 'user.email', 'test@example.com']);
  execFileSync('git', ['-C', root, 'config', 'user.name', 'Test']);
  execFileSync('git', ['-C', root, 'commit', '--allow-empty', '-q', '-m', 'init']);

  const dir = writeRun(root, '2026-01-01T000000-spec-9', { status: 'clean' });

  const before = probePipelineRuns({ cwd: root });
  assert.strictEqual(before.findings.length, 1, 'the fixture must be flagged before remediation');

  const result = archiveRunDir(root, dir);
  assert.strictEqual(result.ok, true, `archiveRunDir failed: ${result.reason}`);

  const archivedPath = path.join(root, '.claude-tweaks', 'pipelines', 'archive', '2026-01-01T000000-spec-9');
  assert.strictEqual(fs.existsSync(archivedPath), true, 'the run dir must sit under archive/ after remediation');
  assert.strictEqual(fs.existsSync(dir), false, 'the original (un-archived) path must no longer exist');

  const after = probePipelineRuns({ cwd: root });
  assert.deepStrictEqual(after.findings, [], 'the archived dir must no longer be flagged');
});
