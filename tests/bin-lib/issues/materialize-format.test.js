'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { shapeGate, liftMetadata, composeHeader, composeFile, sectionText } = require('../../../bin/lib/issues/materialize-format');
const wtDetect = require('../../../bin/lib/hooks/worktree-detect');

const SHAPED_BODY = [
  'Surface: backend',
  '',
  '## Current State',
  'Some current state text.',
  '',
  '## Deliverables',
  '- [ ] do a thing',
  '',
  '## Acceptance Criteria',
  '1. It works',
].join('\n');

// ---- sectionText -------------------------------------------------------

test('sectionText: extracts a section body up to the next heading', () => {
  assert.equal(sectionText(SHAPED_BODY, 'Current State'), 'Some current state text.');
});

test('sectionText: last section runs to end of body', () => {
  assert.equal(sectionText(SHAPED_BODY, 'Acceptance Criteria'), '1. It works');
});

test('sectionText: missing heading returns null', () => {
  assert.equal(sectionText(SHAPED_BODY, 'Nonexistent'), null);
});

// ---- shapeGate -----------------------------------------------------------

test('shapeGate: a fully spec-shaped body passes', () => {
  assert.deepEqual(shapeGate(SHAPED_BODY), { ok: true, missing: [] });
});

test('shapeGate: missing Deliverables section fails, naming it', () => {
  const body = SHAPED_BODY.replace(/## Deliverables\n- \[ \] do a thing\n\n/, '');
  const gate = shapeGate(body);
  assert.equal(gate.ok, false);
  assert.ok(gate.missing.includes('Deliverables'));
});

test('shapeGate: an empty section (heading present, no content) fails', () => {
  const body = SHAPED_BODY.replace('- [ ] do a thing', '');
  const gate = shapeGate(body);
  assert.equal(gate.ok, false);
  assert.ok(gate.missing.includes('Deliverables'));
});

test('shapeGate: an unresolved TBD/TODO/ambiguity marker fails even with all sections present', () => {
  assert.equal(shapeGate(SHAPED_BODY + '\n\nTBD: fill this in later').ok, false);
  assert.equal(shapeGate(SHAPED_BODY + '\n\nTODO: revisit').ok, false);
  assert.equal(shapeGate(SHAPED_BODY + '\n\n<!-- ambiguity: which api? -->').ok, false);
});

test('shapeGate: multiple missing sections are all reported at once', () => {
  const gate = shapeGate('Just a title, no sections at all.');
  assert.deepEqual(gate.missing.sort(), ['Acceptance Criteria', 'Current State', 'Deliverables']);
});

// ---- liftMetadata ----------------------------------------------------------

test('liftMetadata: reads Surface/Design-intent/Design-seed from the leading metadata block', () => {
  const body = 'Surface: web\nDesign-intent: quiet\nDesign-seed: abc123\n\n## Current State\nx';
  assert.deepEqual(liftMetadata(body), { surface: 'web', designIntent: 'quiet', designSeed: 'abc123' });
});

test('liftMetadata: legacy Surface: frontend reads as web', () => {
  assert.deepEqual(liftMetadata('Surface: frontend\n\n## Current State\nx'), { surface: 'web' });
});

test('liftMetadata: no metadata block at all — every field omitted', () => {
  assert.deepEqual(liftMetadata(SHAPED_BODY.replace('Surface: backend\n\n', '')), {});
});

test('liftMetadata: only Surface present — design-intent/design-seed omitted, never emitted as empty strings', () => {
  const lifted = liftMetadata('Surface: infra\n\n## Current State\nx');
  assert.deepEqual(lifted, { surface: 'infra' });
  assert.equal('designIntent' in lifted, false);
});

// ---- composeHeader ----------------------------------------------------------

test('composeHeader: ceremony and grants are always emitted, even an empty grants list', () => {
  const header = composeHeader({ record: 5, origin: 'human', ceremony: 'standard', grants: { build: false, merge: false } });
  assert.match(header, /^ceremony: standard$/m);
  assert.match(header, /^grants: \[\]$/m);
});

test('composeHeader: risk/size/fingerprint/blocked-by/surface/design-intent/design-seed/parked-at-shaping omitted when absent', () => {
  const header = composeHeader({ record: 5, origin: 'human', ceremony: 'standard', grants: { build: true, merge: false } });
  for (const key of ['risk:', 'size:', 'fingerprint:', 'blocked-by:', 'surface:', 'design-intent:', 'design-seed:', 'parked-at-shaping:']) {
    assert.doesNotMatch(header, new RegExp('^' + key, 'm'), `${key} should be omitted when its value is absent`);
  }
  assert.match(header, /^grants: \[build\]$/m);
});

test('composeHeader: every optional field present renders in the documented order', () => {
  const header = composeHeader({
    record: 711, origin: 'capture', risk: 'low', size: 'high', ceremony: 'standard',
    grants: { build: true, merge: true }, fingerprint: 'fp123', blockedBy: [1, 2],
    surface: 'backend', designIntent: 'none', designSeed: 'seedabc', parkedAtShaping: true,
  });
  const lines = header.split('\n');
  assert.deepEqual(lines, [
    '---', 'record: 711', 'origin: capture', 'risk: low', 'size: high', 'ceremony: standard',
    'grants: [build, merge]', 'fingerprint: fp123', 'blocked-by: [1, 2]', 'surface: backend',
    'design-intent: none', 'design-seed: seedabc', 'parked-at-shaping: true', '---',
  ]);
});

// ---- composeFile -----------------------------------------------------------

test('composeFile: header, then "# {n}: {title}", then the body verbatim', () => {
  const header = composeHeader({ record: 5, origin: 'human', ceremony: 'standard', grants: { build: false, merge: false } });
  const file = composeFile({ header, n: 5, title: 'Fix the thing', body: SHAPED_BODY });
  assert.ok(file.startsWith(header + '\n# 5: Fix the thing\n\n'));
  assert.ok(file.includes(SHAPED_BODY));
});

// ---- materialize.js CLI -----------------------------------------------------

const { run: cliRun } = require('../../../bin/materialize');

// #790/[IL-127]: materialize.js's run() now rejects a --run-dir that doesn't
// resolve under the main checkout (bin/lib/hooks/worktree-detect.js's
// isAnchoredUnderRoot), read through deps.cwd()/deps.mainRoot() (#790
// Finding 1) rather than process.cwd()/wtDetect directly. repoRoot below is
// that main checkout; every CLI test below runs with cwd chdir'd into it and
// a run-dir nested under it — a bare os.tmpdir() literal like the old
// '/tmp/run-1' no longer anchors. worktree-detect.js's checks are purely
// structural (`fs.statSync(...).isDirectory()`), not real git plumbing, so a
// bare `.git` directory — no `git init` subprocess — is enough, mirroring
// tests/bin-lib/release-claim/cli.test.js's `mkRun()` fixture.
let repoRoot;
before(() => {
  repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-materialize-cli-'));
  fs.mkdirSync(path.join(repoRoot, '.git'));
});
after(() => {
  fs.rmSync(repoRoot, { recursive: true, force: true });
});

function withCwd(dir, fn) {
  const prev = process.cwd();
  process.chdir(dir);
  try { return fn(); } finally { process.chdir(prev); }
}

function cliDeps({ ghView, ghAvailable = true, remoteUrl = 'https://github.com/acme/w.git' } = {}) {
  const out = []; const err = []; const written = {};
  return {
    deps: {
      ghView, ghAvailable: () => ghAvailable, remoteUrl: () => remoteUrl,
      cwd: () => process.cwd(), mainRoot: (cwd) => wtDetect.mainCheckoutRoot(cwd),
      mkdirp: () => {}, writeFile: (p, c) => { written[p] = c; },
      stdout: (s) => out.push(s), stderr: (s) => err.push(s),
    },
    out, err, written,
  };
}

function ghJson({ n = 1, title = 'A record', body = SHAPED_BODY, labels = ['ready', 'by:capture', 'risk:low', 'size:high', 'ceremony:standard', 'auto:build'] } = {}) {
  return JSON.stringify({ number: n, title, body, labels, url: `https://github.com/acme/w/issues/${n}` });
}

test('materialize CLI: --help exits 0', () => {
  const { deps, out } = cliDeps({ ghView: () => { throw new Error('must not call gh'); } });
  assert.equal(cliRun(['--help'], deps), 0);
  assert.match(out.join(''), /usage: materialize\.js/);
});

test('materialize CLI: happy path writes {run-dir}/work/{n}-spec.md with the composed header', () => {
  const runDir = path.join(repoRoot, '.claude-tweaks', 'pipelines', 'run-1');
  const { deps, out, written } = cliDeps({ ghView: () => ghJson() });
  const code = withCwd(repoRoot, () => cliRun(['1', '--run-dir', runDir], deps));
  assert.equal(code, 0);
  const env = JSON.parse(out.join(''));
  const expectedFile = path.join(runDir, 'work', '1-spec.md');
  assert.equal(env.file, expectedFile);
  const content = written[expectedFile];
  assert.match(content, /^---\nrecord: 1\norigin: capture\nrisk: low\nsize: high\nceremony: standard\ngrants: \[build\]/);
  assert.match(content, /^# 1: A record$/m);
});

test('materialize CLI: an unshaped record fails the gate (exit 1), pointing at /specify', () => {
  const runDir = path.join(repoRoot, '.claude-tweaks', 'pipelines', 'run-1');
  const { deps, err } = cliDeps({ ghView: () => ghJson({ body: 'no sections here' }) });
  const code = withCwd(repoRoot, () => cliRun(['1', '--run-dir', runDir], deps));
  assert.equal(code, 1);
  assert.match(err.join(''), /run `\/claude-tweaks:specify #1` first/);
});

test('materialize CLI: no ceremony label and no --ceremony override is a malformed invocation (exit 2)', () => {
  const runDir = path.join(repoRoot, '.claude-tweaks', 'pipelines', 'run-1');
  const { deps, err } = cliDeps({ ghView: () => ghJson({ labels: ['ready', 'risk:low'] }) });
  const code = withCwd(repoRoot, () => cliRun(['1', '--run-dir', runDir], deps));
  assert.equal(code, 2);
  assert.match(err.join(''), /ceremony-check/);
});

test('materialize CLI: --ceremony override is honored when the record carries no ceremony label', () => {
  const runDir = path.join(repoRoot, '.claude-tweaks', 'pipelines', 'run-1');
  const { deps, out, written } = cliDeps({ ghView: () => ghJson({ labels: ['ready'] }) });
  const code = withCwd(repoRoot, () => cliRun(['1', '--run-dir', runDir, '--ceremony', 'fast-lane'], deps));
  assert.equal(code, 0);
  const env = JSON.parse(out.join(''));
  assert.equal(env.ceremonySource, 'override');
  assert.match(written[path.join(runDir, 'work', '1-spec.md')], /^ceremony: fast-lane$/m);
});

test('materialize CLI: an unresolvable issue number is a malformed invocation (exit 2)', () => {
  const runDir = path.join(repoRoot, '.claude-tweaks', 'pipelines', 'run-1');
  const { deps, err } = cliDeps({ ghView: () => { throw new Error('gh: issue not found'); } });
  const code = withCwd(repoRoot, () => cliRun(['999', '--run-dir', runDir], deps));
  assert.equal(code, 2);
  assert.match(err.join(''), /could not be resolved/);
});

test('materialize CLI: --multi-record-slug writes under spec-{slug}/work/', () => {
  const runDir = path.join(repoRoot, '.claude-tweaks', 'pipelines', 'run-parent');
  const { deps, out } = cliDeps({ ghView: () => ghJson() });
  const code = withCwd(repoRoot, () => cliRun(['1', '--run-dir', runDir, '--multi-record-slug', '1'], deps));
  assert.equal(code, 0);
  const env = JSON.parse(out.join(''));
  assert.equal(env.file, path.join(runDir, 'spec-1', 'work', '1-spec.md'));
});

test('materialize CLI: gh absent exits 2', () => {
  const runDir = path.join(repoRoot, '.claude-tweaks', 'pipelines', 'run-1');
  const { deps, err } = cliDeps({ ghView: () => { throw new Error('must not call gh'); }, ghAvailable: false });
  const code = withCwd(repoRoot, () => cliRun(['1', '--run-dir', runDir], deps));
  assert.equal(code, 2);
  assert.match(err.join(''), /`gh` is required/);
});
