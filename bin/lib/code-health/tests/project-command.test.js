const { test } = require('node:test');
const assert = require('node:assert');
const lens = require('../lenses/project-command');

const AREA = { id: '.', globs: ['.'], flags: {} };

test('mechanical contract', () => {
  assert.strictEqual(lens.id, 'project-command');
  assert.strictEqual(lens.kind, 'mechanical');
});

test('no-op when no command is configured', () => {
  assert.deepStrictEqual(lens.run(AREA, process.cwd(), {}), []);
});

test('runs the command and maps parsed output to findings', () => {
  const findings = lens.run(AREA, process.cwd(), {
    command: 'printf "a.js:3 unused var\\n"',
    lensId: 'project-lint',
    parse: (out) => out.trim().split('\n').map((line) => ({
      files: [line.split(' ')[0]],
      signature: `lint ${line}`,
      title: 'Lint violation',
      evidence: line,
    })),
  });
  assert.strictEqual(findings.length, 1);
  assert.strictEqual(findings[0].lens, 'project-lint');
  assert.deepStrictEqual(findings[0].files, ['a.js:3']);
});

test('captures stdout from a non-zero exit and still parses it', () => {
  const findings = lens.run(AREA, process.cwd(), {
    command: 'printf "x.ts:1 boom\\n"; exit 1',
    parse: (out) => out.trim() ? [{ signature: 'lint x', title: 'v', evidence: out.trim() }] : [],
  });
  assert.strictEqual(findings.length, 1);
});
