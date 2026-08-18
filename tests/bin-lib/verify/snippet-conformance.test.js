// tests/bin-lib/verify/snippet-conformance.test.js
// Pins verification.md's embedded verify.js invocation to the CLI's real arg
// parser (#892 AC8): a flag drift in either direction turns this red.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const DOC = fs.readFileSync(
  path.join(ROOT, 'plugin', 'skills', 'test', 'verification.md'), 'utf8');
const { parseArgs, UsageError } = require(
  path.join(ROOT, 'plugin', 'bin', 'lib', 'verify', 'args.js'));

// The one fenced bash block that invokes bin/verify.js.
function extractSnippet() {
  const blocks = [...DOC.matchAll(/```bash\n([\s\S]*?)```/g)].map((m) => m[1]);
  const hits = blocks.filter((b) => b.includes('bin/verify.js'));
  assert.strictEqual(hits.length, 1,
    `expected exactly one fenced bin/verify.js invocation, found ${hits.length}`);
  return hits[0].trim();
}

// Tokenize the snippet's argv after the script path: an argv word is a run of
// non-whitespace where a quoted span may sit anywhere inside it (shell joins
// adjacent quoted/unquoted segments into one word, e.g. name="value with spaces"),
// so quotes are stripped from the whole word rather than only its edges; $(...)
// inside a word collapses to one dummy-substituted value.
function snippetArgv(snippet) {
  assert.ok(!snippet.includes(';') && !snippet.includes('&&') && !snippet.includes('|'),
    'AC8: the invocation must be one plain command — no ;, && or pipes');
  const afterScript = snippet.split('bin/verify.js"')[1];
  assert.ok(afterScript, 'snippet must invoke ".../bin/verify.js"');
  const tokens = afterScript.match(/(?:"[^"]*"|\S)+/g) || [];
  return tokens.map((t) => t.replace(/"/g, '').replace(/\$\([^)]*\)/g, '/dummy'));
}

test('the embedded snippet parses clean through the real arg parser (AC8)', () => {
  const argv = snippetArgv(extractSnippet());
  const parsed = parseArgs(argv);
  assert.ok(parsed.cmds.length >= 1, 'snippet must pass at least one --cmd');
});

test('negative control: the parser rejects an unknown flag, so drift turns this suite red', () => {
  assert.throws(() => parseArgs(['--not-a-real-flag']), UsageError);
});

test('the retired capture recipe is gone from verification.md (AC8/AC11)', () => {
  assert.ok(!/verify-test\.log/.test(DOC), 'verify-test.log recipe still present');
  assert.ok(!/Capture, never stream/i.test(DOC), '"Capture, never stream" heading still present');
  assert.ok(!/LOG=/.test(DOC), 'LOG= capture recipe still present');
});
