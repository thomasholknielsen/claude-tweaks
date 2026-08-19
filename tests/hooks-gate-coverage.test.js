// tests/hooks-gate-coverage.test.js
//
// Binds the worktree-always gate's actual coverage to the prose that documents
// it. The gate was widened twice on 2026-07-20 (push in c8f929e1, cp/mv/tee in
// cab6142b) and neither commit swept the prose; four skill files went on
// describing the pre-widening gate, two of them prescribing procedures the
// widened gate denies (#138). Nothing failed, because nothing checked.
//
// This suite reads live production prose, which [IL-80] warns against — a test
// asserting "this real file currently contains X" is a scheduled failure timed
// to the next migration. It is acceptable HERE, and only here, because the
// coverage block is a declared contract whose update IS the intended action
// when the gate changes. Do not generalize the pattern to prose that merely
// happens to mention the gate.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { GATE_COVERAGE } = require('../plugin/bin/lib/hooks/pre-tool-use');
const { WRITE_SHAPES, fileWriteTargets } = require('../plugin/bin/lib/hooks/git-command');

const SCHEMA = path.join(__dirname, '..', 'plugin', 'skills', '_shared', 'policy-schema-coverage.md');
const BEGIN = '<!-- gate-coverage:begin -->';
const END = '<!-- gate-coverage:end -->';
const TEARDOWN_BEGIN = '<!-- teardown-gate-coverage:begin -->';
const TEARDOWN_END = '<!-- teardown-gate-coverage:end -->';

function coverageBlock() {
  const text = fs.readFileSync(SCHEMA, 'utf8');
  const start = text.indexOf(BEGIN);
  const end = text.indexOf(END);
  assert.ok(start !== -1 && end !== -1 && end > start,
    `policy-schema-coverage.md must contain a ${BEGIN} ... ${END} block — it is the canonical statement of gate coverage`);
  return text.slice(start + BEGIN.length, end);
}

function teardownCoverageBlock() {
  const text = fs.readFileSync(SCHEMA, 'utf8');
  const start = text.indexOf(TEARDOWN_BEGIN);
  const end = text.indexOf(TEARDOWN_END);
  assert.ok(start !== -1 && end !== -1 && end > start,
    `policy-schema-coverage.md must contain a ${TEARDOWN_BEGIN} ... ${TEARDOWN_END} block — it is the canonical statement of teardown gate coverage`);
  return text.slice(start + TEARDOWN_BEGIN.length, end);
}

// Backtick-quoted tokens on a line beginning with the given label.
function tokensFor(block, label) {
  const line = block.split('\n').find((l) => l.trim().startsWith(`- ${label}:`));
  assert.ok(line, `the coverage block must carry a "- ${label}:" line`);
  return (line.match(/`([^`]+)`/g) || []).map((t) => t.slice(1, -1));
}

test('policy-schema-coverage.md\'s coverage block lists exactly the tools the gate checks', () => {
  assert.deepStrictEqual(tokensFor(coverageBlock(), 'Tools'), [...GATE_COVERAGE.tools],
    'GATE_COVERAGE.tools and the canonical prose have diverged — update the coverage block in skills/_shared/policy-schema-coverage.md');
});

test('policy-schema-coverage.md\'s coverage block lists exactly the git actions the gate checks', () => {
  assert.deepStrictEqual(tokensFor(coverageBlock(), 'Git actions'), [...GATE_COVERAGE.gitActions],
    'GATE_COVERAGE.gitActions and the canonical prose have diverged — update the coverage block in skills/_shared/policy-schema-coverage.md');
});

test('policy-schema-coverage.md\'s coverage block lists exactly the Bash write shapes the gate checks', () => {
  assert.deepStrictEqual(tokensFor(coverageBlock(), 'Bash write shapes'), [...GATE_COVERAGE.bashWriteShapes],
    'GATE_COVERAGE.bashWriteShapes and the canonical prose have diverged — update the coverage block in skills/_shared/policy-schema-coverage.md');
});

test('policy-schema-coverage.md\'s coverage block lists exactly the gate\'s exemptions', () => {
  // Derived from the constant, never a hand-typed literal (spec #537): a
  // hand-typed expectation would keep passing even after the exemption's
  // shape changed underneath it, which is exactly the drift this whole
  // suite exists to catch.
  const expected = [...GATE_COVERAGE.exemptions.paths, GATE_COVERAGE.exemptions.commit];
  assert.deepStrictEqual(tokensFor(coverageBlock(), 'Exemptions'), expected,
    'GATE_COVERAGE.exemptions and the canonical prose have diverged — update the coverage block in skills/_shared/policy-schema-coverage.md');
});

test('GATE_COVERAGE is frozen, so a caller cannot mutate the contract at runtime', () => {
  assert.ok(Object.isFrozen(GATE_COVERAGE));
  for (const key of Object.keys(GATE_COVERAGE)) {
    assert.ok(Object.isFrozen(GATE_COVERAGE[key]), `GATE_COVERAGE.${key} must be frozen too`);
  }
});

test('every GATE_COVERAGE field is load-bearing, not a parallel hand-kept list', () => {
  // A constant nothing reads documents nothing. If a field stops driving the
  // gate, the assertions above keep pinning prose against a dead value — still
  // green, and no longer about the gate's behaviour at all. That is precisely
  // the failure mode [IL-78] describes: a check that would pass on any input.
  const src = fs.readFileSync(path.join(__dirname, '..', 'plugin', 'bin', 'lib', 'hooks', 'pre-tool-use.js'), 'utf8');
  // Iterate every GATE_COVERAGE key rather than a hardcoded ['tools',
  // 'gitActions'] list — a field this loop doesn't visit is exactly the
  // "constant nothing reads" gap the loop exists to catch (whole-branch
  // review MINOR 8). bashWriteShapes is the one deliberate exception: it is
  // load-bearing in git-command.js instead, checked separately below.
  for (const field of Object.keys(GATE_COVERAGE)) {
    if (field === 'bashWriteShapes') continue;
    assert.ok(src.includes(`GATE_COVERAGE.${field}`),
      `pre-tool-use.js must branch on GATE_COVERAGE.${field}, not a duplicated literal`);
  }
  // bashWriteShapes is implemented in git-command.js, so it is load-bearing
  // there instead: WRITE_SHAPES guards which command words fileWriteTargets
  // will even inspect.
  const gc = fs.readFileSync(path.join(__dirname, '..', 'plugin', 'bin', 'lib', 'hooks', 'git-command.js'), 'utf8');
  assert.ok(gc.includes('WRITE_SHAPES.includes('),
    'fileWriteTargets must gate on WRITE_SHAPES so an unlisted shape is dead code');
  assert.strictEqual(GATE_COVERAGE.bashWriteShapes, WRITE_SHAPES,
    'GATE_COVERAGE.bashWriteShapes must BE git-command.js\'s list, not a copy of it');
});

test('every WRITE_SHAPES entry has a matching hooks.json if-matcher (#70)', () => {
  // The hook is a PreToolUse command gated by `if:` predicates. A shape the
  // parser handles but no predicate names is DEAD CODE — the hook process
  // never spawns for it — and it reads exactly like working coverage. That is
  // how `sed -i` bypassed the gate for months while fileWriteTargets looked
  // fine. Assert the two lists agree in both directions.
  const hooks = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'plugin', 'hooks', 'hooks.json'), 'utf8'));
  const bashPre = hooks.hooks.PreToolUse.find((e) => e.matcher === 'Bash');
  assert.ok(bashPre, 'PreToolUse must carry a Bash matcher group');

  const matched = new Set();
  for (const h of bashPre.hooks) {
    if (!h.if) {
      // A predicate-less entry fires on every Bash call — that is the
      // unconditional matcher policy-schema-coverage.md declines on measured cost.
      // If one is ever added deliberately, this test needs rewriting, not
      // deleting.
      assert.fail('PreToolUse Bash carries an unconditional hook — see the measured cost in policy-schema-coverage.md');
    }
    const m = /^Bash\(([^ )*]+)/.exec(h.if);
    if (m) matched.add(m[1]);
  }

  for (const shape of WRITE_SHAPES) {
    assert.ok(matched.has(shape),
      `WRITE_SHAPES includes '${shape}' but hooks/hooks.json has no Bash(${shape} *) predicate — the hook never spawns, so the parser branch is dead code`);
  }
});

test('policy-schema-coverage.md\'s teardown coverage block lists exactly the tools the teardown gate checks', () => {
  assert.deepStrictEqual(tokensFor(teardownCoverageBlock(), 'Tools'), [...GATE_COVERAGE.teardownTools],
    'GATE_COVERAGE.teardownTools and the canonical prose have diverged — update the teardown coverage block in skills/_shared/policy-schema-coverage.md');
});

test('policy-schema-coverage.md\'s teardown coverage block lists exactly the git commands the teardown gate checks', () => {
  assert.deepStrictEqual(tokensFor(teardownCoverageBlock(), 'Git commands'), [...GATE_COVERAGE.teardownGitCommands],
    'GATE_COVERAGE.teardownGitCommands and the canonical prose have diverged — update the teardown coverage block in skills/_shared/policy-schema-coverage.md');
});

test('pre-tool-use.js branches on GATE_COVERAGE.teardownTools, not a duplicated literal', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'plugin', 'bin', 'lib', 'hooks', 'pre-tool-use.js'), 'utf8');
  assert.ok(src.includes('GATE_COVERAGE.teardownTools'),
    'pre-tool-use.js must branch on GATE_COVERAGE.teardownTools, not a hardcoded comparison');
});

test('an unlisted Bash write shape is genuinely not detected', () => {
  // Proves the WRITE_SHAPES guard above is doing work rather than sitting
  // upstream of branches that would have matched anyway.
  assert.deepStrictEqual(fileWriteTargets('rsync a.txt /tmp/b.txt', '/tmp'), [],
    'rsync is not in WRITE_SHAPES, so it must resolve no target');
  assert.ok(fileWriteTargets('cp a.txt /tmp/b.txt', '/tmp').length > 0,
    'a listed shape must still resolve — otherwise the guard proves nothing');
});
