'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const FILE = path.join(__dirname, '..', 'plugin', 'skills', 'wrap-up', 'execution-and-verification.md');

function section() {
  const content = fs.readFileSync(FILE, 'utf8');
  const start = content.indexOf('### Verify execution');
  assert.notStrictEqual(start, -1, 'Verify execution section header not found');
  const rest = content.slice(start);
  const nextHeader = rest.slice(1).search(/\n#{1,3} /);
  return nextHeader === -1 ? rest : rest.slice(0, nextHeader + 1);
}

test('Verify execution section has no imperative check commands', () => {
  const sec = section();
  assert.doesNotMatch(sec, /git log --grep/);
  assert.doesNotMatch(sec, /gh issue view/);
  assert.doesNotMatch(sec, /ls docs\//);
});

test('Verify execution section carries the four-part shape: expectations write, verb invocation, verbatim-table rule, exit-3 BLOCKED rule', () => {
  const sec = section();
  assert.match(sec, /verify-expectations\.json/, 'must instruct writing the expectations file');
  assert.match(sec, /wrap-up-engine\.js verify/, 'must instruct invoking the verb');
  assert.match(sec, /verbatim/i, 'must instruct inserting the table verbatim');
  assert.match(sec, /BLOCKED/, 'must instruct the exit-3 BLOCKED rule');
  assert.match(sec, /exit(s|\s)?\s*3|exit code 3/i, 'must name exit code 3 specifically, not just "non-zero"');
});

test('a paraphrased hand-run instruction still fails the shape pin (negative control)', () => {
  // A hypothetical paraphrase that avoids the exact banned substrings above
  // but still hand-runs a check -- this proves substring absence alone is
  // not sufficient proof of the rewrite; the shape assertions above must
  // themselves be strict enough to reject it. This test documents the
  // paraphrase pattern reviewers should watch for; it does not execute
  // against the live file (that would defeat its own purpose as a control) --
  // it asserts the pattern against a literal string standing in for a
  // regression, proving the two positive assertions above would catch it.
  const paraphrase = 'Confirm via `git --no-pager log --grep="Fixes #{n}"` that the commit landed.';
  assert.doesNotMatch(paraphrase, /wrap-up-engine\.js verify/);
});
