'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  RULES,
  lintReport,
} = require('../../../plugin/bin/lib/tidy-report-lint/rules');
const { conformantReport } = require('./fixtures');

test('lintReport: a known-conformant rendered report produces zero output', () => {
  assert.deepEqual(lintReport(conformantReport()), []);
});

test('RULES: row names match step-6-auto.md conformance scan table, in table order', () => {
  const names = RULES.map((r) => r.name);
  assert.deepEqual(names, [
    'Width',
    'Titles',
    'Aligned',
    'One record per row',
    'No shorthand',
    'Command alone',
    'Every Yours row covered',
    'Batch only where allowed',
    'Fenced, no box art',
    'Group order',
    'Clean shape',
    'Footer once',
    'Condense',
  ]);
});

test('Width: flags a line over 100 characters', () => {
  const text = `${conformantReport().split('\n')[2]}\n${'x'.repeat(101)}\n`;
  const issue = RULES.find((r) => r.name === 'Width').check(text);
  assert.match(issue, /^Width: line 2 is 101 chars \(max 100\)$/);
});

test('Width: a 100-char line is fine, 101 is not', () => {
  const check = RULES.find((r) => r.name === 'Width').check;
  assert.equal(check('x'.repeat(100)), null);
  assert.match(check('x'.repeat(101)), /^Width:/);
});

test('Titles: flags a title column over 50 characters', () => {
  const check = RULES.find((r) => r.name === 'Titles').check;
  const longTitle = 'x'.repeat(51);
  const okTitle = 'x'.repeat(50);
  assert.match(check(`deleted   #101  ${longTitle}  commit abc1234`), /^Titles: line 1/);
  assert.equal(check(`deleted   #101  ${okTitle}  commit abc1234`), null);
});

test('Aligned: a known-conformant report has consistent trailing-column offsets', () => {
  assert.equal(RULES.find((r) => r.name === 'Aligned').check(conformantReport()), null);
});

test('Aligned: flags a mis-padded Applied-automatically row', () => {
  const lines = conformantReport().split('\n');
  const idx = lines.findIndex((l) => l.startsWith('deleted'));
  lines[idx] = lines[idx].replace(/\s+commit/, ' commit'); // collapse to a single space, shifting the offset
  const issue = RULES.find((r) => r.name === 'Aligned').check(lines.join('\n'));
  assert.match(issue, /^Aligned: line \d+ trailing column starts at \d+, expected \d+$/);
});

test('One record per row: a bare row with two #N refs is flagged; a batch command line is not', () => {
  const check = RULES.find((r) => r.name === 'One record per row').check;
  assert.match(check('   #1  Some title (likewise #2)'), /^One record per row: line 1 carries 2 record refs/);
  assert.equal(check('   /claude-tweaks:flow #1,#2'), null);
});

test('No shorthand: flags every documented shorthand form', () => {
  const check = RULES.find((r) => r.name === 'No shorthand').check;
  for (const line of ['(likewise #41)', '(also #9)', '(and 3 more)', '(+5)', 'et al']) {
    assert.match(check(line), /^No shorthand:/, `expected a hit for "${line}"`);
  }
  assert.equal(check('a normal row with no shorthand'), null);
});

test('Command alone: flags a leading em-dash/arrow before a command', () => {
  const check = RULES.find((r) => r.name === 'Command alone').check;
  assert.match(check('   — /claude-tweaks:flow #1'), /^Command alone:/);
  assert.match(check('   → git log -1'), /^Command alone:/);
  assert.equal(check('   /claude-tweaks:flow #1'), null);
});

test('Every Yours row covered: flags a group with no closing command line; "review" is exempt', () => {
  const check = RULES.find((r) => r.name === 'Every Yours row covered').check;
  const missing = [
    '**Yours (1)**',
    '```text',
    'git (1)',
    '   #302  Archived branch to review                         requires human judgment',
    '```',
  ].join('\n');
  assert.match(check(missing), /^Every Yours row covered: group "git \(1\)" has no closing command line$/);

  const reviewGroup = [
    '**Yours (1)**',
    '```text',
    'review (1)',
    '   #303  A pattern observation                             see docs/patterns.md',
    '```',
  ].join('\n');
  assert.equal(check(reviewGroup), null);
});

test('Batch only where allowed: flags a batch line on a non-batchable command', () => {
  const check = RULES.find((r) => r.name === 'Batch only where allowed').check;
  const badBatch = [
    '**Yours (2)**',
    '```text',
    'git (2)',
    '   #401  A                                                  why',
    '   #402  B                                                  why',
    '   gh issue close #401,#402',
    '```',
  ].join('\n');
  assert.match(check(badBatch), /^Batch only where allowed:.*non-batchable command "gh"$/);

  const goodBatch = [
    '**Yours (2)**',
    '```text',
    '/claude-tweaks:specify (2)',
    '   #401  A                                                  why',
    '   #402  B                                                  why',
    '   /claude-tweaks:specify #401,#402',
    '```',
  ].join('\n');
  assert.equal(check(goodBatch), null);
});

test('Fenced, no box art: flags a box-drawing character anywhere', () => {
  const check = RULES.find((r) => r.name === 'Fenced, no box art').check;
  assert.match(check('┌ a table border ┐'), /^Fenced, no box art: line 1 contains a box-drawing character$/);
});

test('Fenced, no box art: flags a section header not immediately followed by a fence', () => {
  const check = RULES.find((r) => r.name === 'Fenced, no box art').check;
  const text = '**Applied automatically**\nnot a fence\n';
  assert.match(check(text), /^Fenced, no box art: section "Applied automatically" is not followed by a fence$/);
});

test('Group order: flags Yours groups out of the fixed+alphabetical order', () => {
  const check = RULES.find((r) => r.name === 'Group order').check;
  const wrongOrder = [
    '**Yours (2)**',
    '```text',
    'git (1)',
    '   #1  A                                                    why',
    '   git log -1',
    '/claude-tweaks:specify (1)',
    '   #2  B                                                    why',
    '   /claude-tweaks:specify #2',
    '```',
  ].join('\n');
  assert.match(check(wrongOrder), /^Group order:/);
});

test('Clean shape: flags a scan line that does not end in "{count} checked"', () => {
  const check = RULES.find((r) => r.name === 'Clean shape').check;
  const bad = '**Clean:**\n```text\nresidue not-a-count\n```\n';
  assert.match(check(bad), /^Clean shape: line 3 does not match/);
  const good = '**Clean:**\n```text\nresidue             12 checked\norphaned-plans       — checked\n```\n';
  assert.equal(check(good), null);
  assert.equal(check('**Clean:** nothing — every scan surfaced findings\n'), null);
});

test('Footer once: flags zero and multiple occurrences of decisions.md', () => {
  const check = RULES.find((r) => r.name === 'Footer once').check;
  assert.match(check('no footer here'), /^Footer once: "decisions\.md" appears 0 times/);
  assert.match(check('a/decisions.md\nb/decisions.md'), /^Footer once: "decisions\.md" appears 2 times/);
  assert.equal(check('Full decision log: run-dir/decisions.md'), null);
});

test('Condense: flags an over-40-line report with no report.md footer; a short report is exempt', () => {
  const check = RULES.find((r) => r.name === 'Condense').check;
  const over40 = `${'line\n'.repeat(41)}`;
  assert.match(check(over40), /^Condense: report is 42 lines \(over 40\)/);
  const over40WithFooter = `${'line\n'.repeat(41)}Full report: run-dir/report.md\n`;
  assert.equal(check(over40WithFooter), null);
  assert.equal(check('line\n'.repeat(10)), null);
});
