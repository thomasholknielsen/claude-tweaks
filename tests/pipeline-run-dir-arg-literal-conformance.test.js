// tests/pipeline-run-dir-arg-literal-conformance.test.js
//
// #790: static backstop for the same failure class Tasks 1-3 fixed at
// runtime — a skill .md citing `--run`/`--run-dir` with a bare-relative
// `.claude-tweaks/pipelines/` literal instead of an anchored value
// ($RUN_ROOT/..., "$PIPELINE_RUN_DIR", or a {run-dir} placeholder) would
// silently teach a future reader/agent the exact worktree-relative-shadow
// mistake this record fixed. Scans the three skill files
// _shared/pipeline-run-dir.md's own Resolution order names as citing
// `--run`/`--run-dir`: flow/steps-and-gates.md, flow/materialize.md,
// wrap-up/SKILL.md.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILES = [
  'skills/flow/steps-and-gates.md',
  'skills/flow/materialize.md',
  'skills/wrap-up/SKILL.md',
];

// A bare-relative literal: `--run`/`--run-dir` (or `--run-dir=`) directly
// followed by a quoted or bare `.claude-tweaks/pipelines/...` path — never
// preceded by `$RUN_ROOT`, `"$PIPELINE_RUN_DIR"`, or a `{...}` placeholder,
// all of which are already-anchored forms this test must NOT flag.
function findBareRelativeRunArgLiterals(content) {
  const re = /--run(?:-dir)?[= ]"?\.claude-tweaks\/pipelines\//g;
  return content.match(re) || [];
}

test('shipped skill prose never passes a bare-relative .claude-tweaks/pipelines/ literal to --run/--run-dir', () => {
  for (const rel of FILES) {
    const content = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const hits = findBareRelativeRunArgLiterals(content);
    assert.deepStrictEqual(hits, [], `${rel} carries a bare-relative --run/--run-dir literal: ${JSON.stringify(hits)}`);
  }
});

test('the scanner actually detects a deliberately reintroduced violation (discrimination check)', () => {
  const clean = 'run `node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" check-resume-freshness --run "$PIPELINE_RUN_DIR"`';
  const dirty = 'run `node bin/wrap-up-engine.js plan --run-dir .claude-tweaks/pipelines/2026-01-01T000000-spec-1`';
  assert.deepStrictEqual(findBareRelativeRunArgLiterals(clean), []);
  assert.strictEqual(findBareRelativeRunArgLiterals(dirty).length, 1);
});
