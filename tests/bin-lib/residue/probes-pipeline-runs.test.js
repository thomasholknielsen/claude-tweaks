const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { probePipelineRuns } = require('../../../plugin/bin/lib/residue/probes/pipeline-runs');
const { archiveRunDir } = require('../../../plugin/bin/lib/reconcile/archive-merged');

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
  assert.strictEqual(findings[0].scope, 'blast-radius');
  assert.match(findings[0].subject, /2026-01-01T000000-spec-1/);
});

// #1011 audited this probe against the same class of gap #499 fixed in
// probeBranches (unconditional blast-radius tagging regardless of which
// session's artifact it is) and concluded this probe is NOT the same class:
// unlike a merged-but-undeleted branch (which could still belong to a LIVE
// concurrent session), a `status: 'clean'` run dir is a terminal,
// self-reported "nothing left to do but archive" state — inert regardless of
// which session's wrap-up produced it. This test pins that a clean run dir
// belonging to an unrelated record is still correctly tagged blast-radius,
// confirming the divergence from probeBranches is deliberate, not a
// regression waiting to happen.
test('a clean run dir belonging to an unrelated record is still blast-radius (deliberate divergence from probeBranches)', () => {
  const root = makeFixture();
  writeRun(root, '2026-01-01T000000-record-999', { status: 'clean' });
  const { findings } = probePipelineRuns({ cwd: root });
  assert.strictEqual(findings.length, 1);
  assert.strictEqual(findings[0].scope, 'blast-radius', 'a clean run dir is inert regardless of which session produced it');
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
