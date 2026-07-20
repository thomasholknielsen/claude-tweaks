'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseRoutineTemplate } = require('../bin/lib/routine-template-parser.js');

test('parseRoutineTemplate parses a one-level nested map (key: value children)', () => {
  const result = parseRoutineTemplate('default_schedule:\n  cron_expression: "0 3 * * *"\n  description: "off-peak"\n');
  assert.deepStrictEqual(result.default_schedule, {
    cron_expression: '0 3 * * *',
    description: 'off-peak',
  });
});

test('parseRoutineTemplate resolves a bare "key:" with no children to an empty string', () => {
  const result = parseRoutineTemplate('notes:\ntemplate_version: 2\n');
  assert.strictEqual(result.notes, '');
  assert.strictEqual(result.template_version, 2);
});

// Regression test for the removed-behavior finding: a YAML block-style list
// nested under a top-level key used to silently resolve to an empty object
// {} (sawNested was set true for ANY non-blank indented line, matching or
// not, so a run of unparseable '- item' lines still flipped it true while
// leaving `nested` empty). It must now fail loudly instead.
test('parseRoutineTemplate throws a clear error for a YAML block-style list nested under a key', () => {
  assert.throws(
    () => parseRoutineTemplate('targets:\n  - foo\n  - bar\n'),
    /targets.*block-style list/,
  );
});

test('parseRoutineTemplate still throws for a single-item block list', () => {
  assert.throws(
    () => parseRoutineTemplate('allowed_tools:\n  - Bash\n'),
    /allowed_tools.*block-style list/,
  );
});
