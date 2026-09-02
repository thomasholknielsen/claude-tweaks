// tests/root-work-dir-empty.test.js
// Pin for #1568: the repo-root work/ directory must never carry a
// {n}-spec.md file again. Materialized specs belong under
// .claude-tweaks/pipelines/{run-id}/work/ (or the multi-record
// spec-{slug}/work/ form) -- see plugin/skills/flow/materialize.md and
// plugin/bin/lib/hooks/pre-tool-use.js's `hasMaterializeCommit` comment,
// which documents root-level work/*-spec.md as the legacy pre-anchoring
// shape this test guards against regressing to.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const SPEC_FILE_RE = /^\d+-spec\.md$/;

test('repo-root work/ directory carries no {n}-spec.md files', () => {
  const workDir = path.join(REPO_ROOT, 'work');
  let entries;
  try {
    entries = fs.readdirSync(workDir);
  } catch (err) {
    if (err.code === 'ENOENT') return; // no work/ dir at all is also a pass
    throw err;
  }
  const offenders = entries.filter((e) => SPEC_FILE_RE.test(e));
  assert.deepEqual(
    offenders,
    [],
    `found legacy root-level spec file(s) in work/: ${offenders.join(', ')} -- ` +
      'materialized specs belong under .claude-tweaks/pipelines/{run-id}/work/ instead',
  );
});
