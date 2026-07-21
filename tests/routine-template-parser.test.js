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

// Regression: a blank line inside a `>` folded block scalar used to be
// silently skipped (never recording a paragraph break), collapsing a
// multi-paragraph value into one run-on paragraph joined only by single
// spaces.
test('parseRoutineTemplate preserves paragraph breaks (blank lines) inside a folded ">" block scalar', () => {
  const yaml = [
    'prompt: >',
    '  First paragraph line one.',
    '  First paragraph line two.',
    '',
    '  Second paragraph starts here.',
    'template_version: 2',
    '',
  ].join('\n');
  const result = parseRoutineTemplate(yaml);
  assert.strictEqual(
    result.prompt,
    'First paragraph line one. First paragraph line two.\n\nSecond paragraph starts here.',
  );
  assert.strictEqual(result.template_version, 2);
});

test('parseRoutineTemplate folds a single-paragraph ">" block into one space-joined line (no regression)', () => {
  const result = parseRoutineTemplate('notes: >\n  line one\n  line two\n');
  assert.strictEqual(result.notes, 'line one line two');
});

// Regression: parseRoutineTemplate had no logic anywhere to strip a trailing
// `# comment` from a line, so an ordinary YAML authoring habit like
// `key: value  # note` silently became part of the parsed value's literal
// text instead of being discarded.
test('parseRoutineTemplate strips a trailing inline "# comment" from a plain scalar value', () => {
  const result = parseRoutineTemplate('routing: fast  # inline comment describing the value\n');
  assert.strictEqual(result.routing, 'fast');
});

test('parseRoutineTemplate strips a trailing inline "# comment" from an inline array value', () => {
  const result = parseRoutineTemplate('allowed_tools: [Bash, Read]  # only these\n');
  assert.deepStrictEqual(result.allowed_tools, ['Bash', 'Read']);
});

test('parseRoutineTemplate strips a trailing inline "# comment" from a nested-map child value', () => {
  const result = parseRoutineTemplate('default_schedule:\n  cron_expression: "0 3 * * *"  # off-peak\n');
  assert.deepStrictEqual(result.default_schedule, { cron_expression: '0 3 * * *' });
});

test('parseRoutineTemplate does not strip a "#" that is part of a quoted value', () => {
  const result = parseRoutineTemplate('routing: "fast #1 priority"\n');
  assert.strictEqual(result.routing, 'fast #1 priority');
});
