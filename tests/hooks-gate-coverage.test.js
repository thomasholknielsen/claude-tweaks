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
const { WRITE_SHAPES, fileWriteTargets, gitTargets } = require('../plugin/bin/lib/hooks/git-command');

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
  const expected = [...GATE_COVERAGE.exemptions.paths, GATE_COVERAGE.exemptions.commit, GATE_COVERAGE.exemptions.push];
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

// #590: gitTargets now also recognizes `env git ...` — pin that hooks.json
// carries a matching `if` predicate for both PreToolUse and PostToolUse (the
// same #70 asymmetry the WRITE_SHAPES test above guards against: a parser
// branch nothing spawns the hook for is dead code), and that the parser
// really does resolve a target for the shape each new predicate names.
test('every env-git `if` predicate this fix adds has a parser-recognized counterpart, in both PreToolUse and PostToolUse (#590)', () => {
  const hooks = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'plugin', 'hooks', 'hooks.json'), 'utf8'));
  // Exact literal predicates this fix adds — mirrors the six existing bare-`git`
  // predicates one-for-one, so this list is deliberately hand-typed rather than
  // derived from ENV_GIT_ACTIONS: -C/-c keep their trailing space (`Bash(git -C *)`
  // already does), --exec-path=/--namespace= don't (`Bash(git --exec-path=*)`).
  const ENV_GIT_PREDICATES = [
    'Bash(env git commit *)',
    'Bash(env git push *)',
    'Bash(env git -C *)',
    'Bash(env git -c *)',
    'Bash(env git --exec-path=*)',
    'Bash(env git --namespace=*)',
  ];

  for (const group of ['PreToolUse', 'PostToolUse']) {
    const bashGroup = hooks.hooks[group].find((e) => e.matcher === 'Bash');
    assert.ok(bashGroup, `${group} must carry a Bash matcher group`);
    const ifs = bashGroup.hooks.map((h) => h.if).filter(Boolean);
    for (const predicate of ENV_GIT_PREDICATES) {
      assert.ok(ifs.includes(predicate),
        `${group}'s Bash group is missing an "if": "${predicate}" predicate — gitTargets recognizes this 'env git' shape but the hook would never spawn for it`);
    }
  }

  // Parser side: the shapes these new predicates name really do resolve.
  assert.deepStrictEqual(gitTargets('env git commit -m "x"', '/repo'), [{ action: 'commit', dir: '/repo' }]);
  assert.deepStrictEqual(gitTargets('env git push', '/repo'), [{ action: 'push', dir: '/repo' }]);
});

// env's own flags ahead of git (`env -C <dir> git commit`, `env -u NAME git
// push`) match none of the literal `env git ...` predicates above — the flag
// sits between `env` and `git` — so without a `Bash(env -*)` predicate the
// hook never spawns for exactly the shape findGitLead's -C/--chdir handling
// exists to resolve (same #70 matcher/parser asymmetry).
test('the `Bash(env -*)` predicate covers env-with-flags git shapes, in both PreToolUse and PostToolUse', () => {
  const hooks = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'plugin', 'hooks', 'hooks.json'), 'utf8'));
  for (const group of ['PreToolUse', 'PostToolUse']) {
    const bashGroup = hooks.hooks[group].find((e) => e.matcher === 'Bash');
    const ifs = bashGroup.hooks.map((h) => h.if).filter(Boolean);
    assert.ok(ifs.includes('Bash(env -*)'),
      `${group}'s Bash group is missing an "if": "Bash(env -*)" predicate — gitTargets resolves env-flag git shapes but the hook would never spawn for them`);
  }

  // Parser side: the shapes the predicate exists for really do resolve.
  assert.deepStrictEqual(gitTargets('env -C /main-checkout git commit -m "x"', '/repo'), [{ action: 'commit', dir: '/main-checkout' }]);
  assert.deepStrictEqual(gitTargets('env -u FOO git push', '/repo'), [{ action: 'push', dir: '/repo' }]);
});

// #976 (IL-141): gitTargets() used to classify only `commit`/`push`, so every
// git-plumbing verb bypassed E1/worktree-always/the pipeline-shadow guard
// entirely — the concrete case docs/incident-log.md's IL-141 records landed a
// commit via `hash-object`/`update-index`/`commit-tree`/`checkout` with none of
// it visible to this gate. This pins the evidence-driven subset now covered:
// the two verbs #976's own Acceptance Criteria names (`mv`, `update-ref`) plus
// `rm`, `apply`, `update-index`, `commit-tree` from its Technical Approach and
// IL-141's own bypass sequence. `checkout`/`stash`/`reset`/`merge`/`pull`/
// `fetch` etc. stay deliberately uncovered — see policy-schema-coverage.md's
// "Not covered — deliberately, and measured" note; widening those is a
// separate, evidence-driven call, not a default extrapolation from this fix.
test('gitTargets recognizes the #976 git-plumbing write verbs, in both the parser and hooks.json (#976, IL-141)', () => {
  const PLUMBING_VERBS = ['mv', 'update-ref', 'rm', 'apply', 'update-index', 'commit-tree'];

  // Parser side: each plumbing verb resolves a target the same shape commit/push do.
  for (const verb of PLUMBING_VERBS) {
    assert.deepStrictEqual(
      gitTargets(`git ${verb} a b`, '/repo'),
      [{ action: verb, dir: '/repo' }],
      `gitTargets must classify 'git ${verb}' as a write target`,
    );
  }

  // `git apply --check`/`--stat`/`--numstat`/`--summary` are read-only (dry-run
  // / info) invocations — must NOT resolve as a write, the same read/write
  // precision sed/perl's in-place-flag detection already applies.
  assert.deepStrictEqual(gitTargets('git apply --check a.patch', '/repo'), [],
    'git apply --check is a dry run, not a write — must resolve no target');
  assert.deepStrictEqual(gitTargets('git apply --stat a.patch', '/repo'), [],
    'git apply --stat is read-only — must resolve no target');

  // (#976 review) `--apply` is git's own documented override for every flag
  // above — "git apply --check --apply x.patch" really applies the patch
  // despite --check's presence. Must resolve as a write (fail closed), not
  // silently classify as read-only (fail open).
  assert.notDeepStrictEqual(gitTargets('git apply --check --apply a.patch', '/repo'), [],
    'git apply --check --apply overrides --check back to real application — must resolve a write target');
  assert.deepStrictEqual(gitTargets('git apply --check --apply a.patch', '/repo'), [{ action: 'apply', dir: '/repo' }],
    'git apply --check --apply must classify as an apply write target');

  // GATE_COVERAGE.gitActions must include every new verb, or the
  // worktree-always gate's own action filter (pre-tool-use.js's
  // checkWorktreeRequired) silently drops these targets even though
  // gitTargets resolved them.
  for (const verb of PLUMBING_VERBS) {
    assert.ok(GATE_COVERAGE.gitActions.includes(verb),
      `GATE_COVERAGE.gitActions must include '${verb}'`);
  }

  // hooks.json side: a bare `git {verb} ...` predicate must exist in both
  // PreToolUse and PostToolUse's Bash groups, or the hook process never
  // spawns for this shape and the parser branch above is dead code (#70).
  const hooks = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'plugin', 'hooks', 'hooks.json'), 'utf8'));
  for (const group of ['PreToolUse', 'PostToolUse']) {
    const bashGroup = hooks.hooks[group].find((e) => e.matcher === 'Bash');
    assert.ok(bashGroup, `${group} must carry a Bash matcher group`);
    const ifs = bashGroup.hooks.map((h) => h.if).filter(Boolean);
    for (const verb of PLUMBING_VERBS) {
      assert.ok(ifs.includes(`Bash(git ${verb} *)`),
        `${group}'s Bash group is missing an "if": "Bash(git ${verb} *)" predicate — gitTargets recognizes 'git ${verb}' but the hook would never spawn for it`);
    }
  }
});

// (#976 review) findGitLead's `env git ...` recognition (#590) is generic, not
// verb-specific — gitTargets already classifies `env git mv/rm/apply/
// update-ref/update-index/commit-tree ...` as writes, the same shape the
// existing 'env-git if predicate' test above pins for commit/push. But
// hooks.json only ever grew `Bash(env git commit *)`/`Bash(env git push *)` —
// no `Bash(env git {verb} *)` predicate exists for any of the six #976
// plumbing verbs, in either PreToolUse or PostToolUse. The bare `env git
// {verb} ...` shape (no env-level flag before `git`) therefore matches no
// predicate at all: not `Bash(git {verb} *)` (leads with `env`, not `git`),
// not `Bash(env -*)` (no dash after `env`) — the hook process never spawns,
// so the parser classification above is dead code for this shape (#70/#590's
// matcher/parser asymmetry, left open for these six verbs).
test('every #976 plumbing verb also has an env-git `if` predicate, in both PreToolUse and PostToolUse (#976 review)', () => {
  const PLUMBING_VERBS = ['mv', 'update-ref', 'rm', 'apply', 'update-index', 'commit-tree'];
  const hooks = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'plugin', 'hooks', 'hooks.json'), 'utf8'));

  for (const group of ['PreToolUse', 'PostToolUse']) {
    const bashGroup = hooks.hooks[group].find((e) => e.matcher === 'Bash');
    assert.ok(bashGroup, `${group} must carry a Bash matcher group`);
    const ifs = bashGroup.hooks.map((h) => h.if).filter(Boolean);
    for (const verb of PLUMBING_VERBS) {
      assert.ok(ifs.includes(`Bash(env git ${verb} *)`),
        `${group}'s Bash group is missing an "if": "Bash(env git ${verb} *)" predicate — gitTargets recognizes 'env git ${verb}' but the hook would never spawn for it`);
    }
  }

  // Parser side: the shapes these predicates would exist for really do resolve.
  for (const verb of PLUMBING_VERBS) {
    assert.deepStrictEqual(gitTargets(`env git ${verb} a b`, '/repo'), [{ action: verb, dir: '/repo' }],
      `gitTargets must classify 'env git ${verb}' as a write target`);
  }
});

// #500's stampAdHocRunDir and #307's staleness backstop both hard-gate on
// tool_name === 'EnterWorktree' in post-tool-use.js — a PostToolUse group
// without an EnterWorktree matcher makes both dead at the registration seam
// (the hook process never spawns), the exact dead-branch shape
// policy-schema-coverage.md warns about.
test('PostToolUse carries an EnterWorktree matcher group for the post-tool-use EnterWorktree handlers', () => {
  const hooks = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'plugin', 'hooks', 'hooks.json'), 'utf8'));
  const group = hooks.hooks.PostToolUse.find((e) => e.matcher === 'EnterWorktree');
  assert.ok(group, 'PostToolUse has no EnterWorktree matcher group — stampAdHocRunDir (#500) and the staleness backstop (#307) never run');
  assert.ok(group.hooks.some((h) => typeof h.command === 'string' && h.command.includes('post-tool-use')),
    'the EnterWorktree PostToolUse group must invoke hooks.js post-tool-use');
});

test('an unlisted Bash write shape is genuinely not detected', () => {
  // Proves the WRITE_SHAPES guard above is doing work rather than sitting
  // upstream of branches that would have matched anyway.
  assert.deepStrictEqual(fileWriteTargets('rsync a.txt /tmp/b.txt', '/tmp'), [],
    'rsync is not in WRITE_SHAPES, so it must resolve no target');
  assert.ok(fileWriteTargets('cp a.txt /tmp/b.txt', '/tmp').length > 0,
    'a listed shape must still resolve — otherwise the guard proves nothing');
});
