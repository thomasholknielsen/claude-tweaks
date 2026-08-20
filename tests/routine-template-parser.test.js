'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseRoutineTemplate, listRoutineRecords, SIGNIFICANT_FIELDS } = require('../plugin/bin/lib/routine-template-parser.js');

// Deliberate: several fixtures below use `prompt: >` as the folded-scalar key
// under test. The parser is field-name-agnostic, so this is historical input —
// it exercises generic YAML fold-parsing mechanics (and, in the branch-key
// fixtures, the pre-#529 template shape those tests were written against) —
// not a claim that shipped templates still carry a `prompt` field. Templates
// carry `kickoff` since #529; retargeting these fixtures to `notes: >` would
// test the same parser paths and lose the historical-shape context, so they
// stay as `prompt` (#530 sweep).

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

test('listRoutineRecords returns [] for a directory that does not exist', () => {
  const missing = path.join(os.tmpdir(), 'routine-records-does-not-exist-' + process.pid);
  assert.deepStrictEqual(listRoutineRecords(missing), []);
});

test('listRoutineRecords parses every .yml file in the directory, attaching filename', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'routine-records-'));
  try {
    fs.writeFileSync(
      path.join(dir, 'claude-tweaks-code-health-daily.yml'),
      'routine_id: "trig_abc123"\ntemplate: code-health\ntemplate_version: 2\ncreated_at: "2026-06-01T00:00:00Z"\nschedule: "0 3 * * *"\nconsole_url: "https://claude.ai/code/routines/trig_abc123"\n',
    );
    fs.writeFileSync(
      path.join(dir, 'claude-tweaks-tidy-weekly.yml'),
      'routine_id: "trig_def456"\ntemplate: tidy\ntemplate_version: 3\ncreated_at: "2026-05-15T00:00:00Z"\nschedule: "0 4 * * 0"\nconsole_url: "https://claude.ai/code/routines/trig_def456"\n',
    );
    const records = listRoutineRecords(dir);
    assert.strictEqual(records.length, 2);
    assert.deepStrictEqual(records[0], {
      filename: 'claude-tweaks-code-health-daily.yml',
      routine_id: 'trig_abc123',
      template: 'code-health',
      template_version: 2,
      created_at: '2026-06-01T00:00:00Z',
      schedule: '0 3 * * *',
      console_url: 'https://claude.ai/code/routines/trig_abc123',
    });
    assert.strictEqual(records[1].filename, 'claude-tweaks-tidy-weekly.yml');
    assert.strictEqual(records[1].template, 'tidy');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// The optional `branch` field sits between the folded `prompt:` block and
// `model:` in a template that pins one, so it has to survive the folded-scalar
// terminator; the shipped templates ship it as a comment, which must NOT parse
// into a value.
test('parseRoutineTemplate reads an explicit branch: key set after a folded prompt block', () => {
  const yaml = [
    'template_version: 3',
    'prompt: >',
    '  Confirm this checkout is on {{TARGET_BRANCH}}.',
    '',
    '  Then: /claude-tweaks:code-health',
    'branch: dev',
    'model: claude-sonnet-5',
    '',
  ].join('\n');
  const result = parseRoutineTemplate(yaml);
  assert.strictEqual(result.branch, 'dev');
  assert.strictEqual(result.model, 'claude-sonnet-5');
  assert.strictEqual(
    result.prompt,
    'Confirm this checkout is on {{TARGET_BRANCH}}.\n\nThen: /claude-tweaks:code-health',
  );
});

test('parseRoutineTemplate leaves branch unset when the template only carries it as a comment', () => {
  const yaml = [
    'prompt: >',
    '  Then: /claude-tweaks:code-health',
    '# Optional: `branch: <name>` pins the prompt\'s {{TARGET_BRANCH}}. Normally unset here — a',
    '# branch is project-specific, so /claude-tweaks:routine resolves it at instantiation.',
    'model: claude-sonnet-5',
    '',
  ].join('\n');
  const result = parseRoutineTemplate(yaml);
  assert.strictEqual(result.branch, undefined);
  assert.strictEqual(result.model, 'claude-sonnet-5');
  assert.strictEqual(result.prompt, 'Then: /claude-tweaks:code-health');
});

test('listRoutineRecords ignores non-.yml files in the same directory', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'routine-records-'));
  try {
    fs.writeFileSync(path.join(dir, 'claude-tweaks-code-health-daily.yml'), 'template: code-health\n');
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'not a routine record\n');
    const records = listRoutineRecords(dir);
    assert.strictEqual(records.length, 1);
    assert.strictEqual(records[0].filename, 'claude-tweaks-code-health-daily.yml');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('listRoutineRecords returns a partial object (no crash) for a record missing a required field', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'routine-records-'));
  try {
    fs.writeFileSync(
      path.join(dir, 'claude-tweaks-broken.yml'),
      'template_version: 2\ncreated_at: "2026-06-01T00:00:00Z"\nschedule: "0 3 * * *"\n',
    );
    const records = listRoutineRecords(dir);
    assert.strictEqual(records.length, 1);
    assert.strictEqual(records[0].filename, 'claude-tweaks-broken.yml');
    assert.strictEqual(records[0].template, undefined);
    assert.strictEqual(records[0].routine_id, undefined);
    assert.strictEqual(records[0].template_version, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// #212: a one-off record structurally tags its cadence via `cadence: once` plus
// `run_once_at` in place of `schedule` — never a string-sniff of one overloaded
// field. `SIGNIFICANT_FIELDS` must know about both new fields so a cadence-class
// change (recurring <-> once) and a `run_once_at` edit both surface as record
// drift, the same as any other significant field.
test('SIGNIFICANT_FIELDS includes cadence and run_once_at (#212)', () => {
  assert.ok(SIGNIFICANT_FIELDS.includes('cadence'));
  assert.ok(SIGNIFICANT_FIELDS.includes('run_once_at'));
  // schedule stays significant too — a recurring record's cron is still tracked.
  assert.ok(SIGNIFICANT_FIELDS.includes('schedule'));
});

test('listRoutineRecords parses a one-off record (cadence: once, run_once_at, no schedule) (#212)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'routine-records-'));
  try {
    fs.writeFileSync(
      path.join(dir, 'claude-tweaks-cleanup-once.yml'),
      [
        'routine_id: "trig_once1"',
        'template: code-health',
        'template_version: 2',
        'kernel_version: 1',
        'model: "claude-sonnet-5"',
        'created_at: "2026-08-20T00:00:00Z"',
        'cadence: once',
        'run_once_at: "2026-09-15T07:00:00Z"',
        'console_url: "https://claude.ai/code/routines/trig_once1"',
        '',
      ].join('\n'),
    );
    const records = listRoutineRecords(dir);
    assert.strictEqual(records.length, 1);
    const rec = records[0];
    assert.strictEqual(rec.cadence, 'once');
    assert.strictEqual(rec.run_once_at, '2026-09-15T07:00:00Z');
    // Mutually exclusive with `schedule` — a one-off record never carries it.
    assert.strictEqual(rec.schedule, undefined);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('listRoutineRecords parses a recurring record with no cadence field the same as before (#212 backward compat)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'routine-records-'));
  try {
    fs.writeFileSync(
      path.join(dir, 'claude-tweaks-code-health-daily.yml'),
      'routine_id: "trig_abc123"\ntemplate: code-health\ntemplate_version: 2\ncreated_at: "2026-06-01T00:00:00Z"\nschedule: "0 3 * * *"\nconsole_url: "https://claude.ai/code/routines/trig_abc123"\n',
    );
    const records = listRoutineRecords(dir);
    assert.strictEqual(records.length, 1);
    // Absent `cadence` is the pre-existing record shape — every reader treats
    // this as recurring, never as a parse error or a missing-field warning.
    assert.strictEqual(records[0].cadence, undefined);
    assert.strictEqual(records[0].schedule, '0 3 * * *');
    assert.strictEqual(records[0].run_once_at, undefined);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
