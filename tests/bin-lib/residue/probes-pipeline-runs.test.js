const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { probePipelineRuns } = require('../../../bin/lib/residue/probes/pipeline-runs');

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

test('no .claude-tweaks/pipelines directory at all does not run', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'residue-pipeline-runs-empty-'));
  fs.mkdirSync(path.join(root, '.git'));
  const { ran, findings } = probePipelineRuns({ cwd: root });
  assert.strictEqual(ran, true);
  assert.deepStrictEqual(findings, []);
});
