const { test } = require('node:test');
const assert = require('node:assert');
const {
  extractTemplateBody,
  splitSections,
} = require('../../../bin/lib/init/claude-md-conformance');

const FIXTURE = [
  '# Phase 5: CLAUDE.md Template and Guidelines',
  '',
  '## Initial Mode Template',
  '',
  'Produce CLAUDE.md from scratch following this template:',
  '',
  '```markdown',
  '# {project name}',
  '',
  '## Stack',
  '',
  '{table}',
  '',
  '## Working Approach',
  '',
  '- **Think before coding.** State assumptions.',
  '',
  "## Don'ts",
  '',
  '{anti-patterns}',
  '```',
  '',
  '## Update Mode',
  '',
  'Produce a patch.',
].join('\n');

test('extractTemplateBody returns only the fenced Initial Mode Template', () => {
  const body = extractTemplateBody(FIXTURE);
  assert.ok(body.includes('# {project name}'));
  assert.ok(body.includes('## Working Approach'));
  assert.ok(!body.includes('## Update Mode'), 'must not leak the file\'s own headings');
  assert.ok(!body.includes('```'), 'fence markers must be stripped');
});

test('splitSections maps each h2 to its body', () => {
  const sections = splitSections(extractTemplateBody(FIXTURE));
  assert.deepStrictEqual([...sections.keys()], ['Stack', 'Working Approach', "Don'ts"]);
  assert.strictEqual(sections.get('Stack').trim(), '{table}');
  assert.strictEqual(
    sections.get('Working Approach').trim(),
    '- **Think before coding.** State assumptions.',
  );
});

test('extractTemplateBody throws when the fence is unbalanced', () => {
  const broken = FIXTURE.replace("```\n\n## Update Mode", '\n## Update Mode');
  assert.throws(() => extractTemplateBody(broken), /unterminated|stopped early/i);
});

test('extractTemplateBody throws when a nested fence truncates the template', () => {
  // A same-length inner fence is indistinguishable from the outer closing
  // fence, so extraction stops early and Don'ts never appears. This is exactly
  // the shape the template had before the Project Defaults block was removed.
  const nested = FIXTURE.replace(
    '- **Think before coding.** State assumptions.',
    '- **Think before coding.** State assumptions.\n\n## Project Defaults\n\n```\nfoo: bar\n```',
  );
  assert.throws(() => extractTemplateBody(nested), /stopped early/i);
});

const { classifySections, PHILOSOPHY_EXCEPTION } = require('../../../bin/lib/init/claude-md-conformance');

test('classifySections sorts known sections into the two lists', () => {
  const sections = new Map([
    ['Stack', '\n| Layer | Tech |\n|---|---|\n| ... | ... |\n'],
    ['Working Approach', '\n- **Think before coding.** State assumptions.\n'],
    ['Philosophy', '\n{Adaptive principles. See "Generating Philosophy" below.}\n'],
  ]);
  const { pluginAuthored, projectAuthored, unclassified } = classifySections(sections);
  assert.deepStrictEqual(pluginAuthored.sort(), ['Philosophy', 'Working Approach']);
  assert.deepStrictEqual(projectAuthored, ['Stack']);
  assert.deepStrictEqual(unclassified, []);
});

test('Stack is project-authored despite having no {...} placeholder', () => {
  // Regression guard for the rejected heuristic: Stack's body is a literal
  // table skeleton, so "placeholder body means project-authored" classifies it
  // plugin-authored and every project then reports drift on it.
  const sections = new Map([['Stack', '\n| Layer | Tech |\n|---|---|\n| ... | ... |\n']]);
  const { projectAuthored, pluginAuthored } = classifySections(sections);
  assert.deepStrictEqual(projectAuthored, ['Stack']);
  assert.deepStrictEqual(pluginAuthored, []);
});

test('an unknown section is reported unclassified, never silently dropped', () => {
  const sections = new Map([['Deployment', '\n{how to deploy}\n']]);
  const { pluginAuthored, projectAuthored, unclassified } = classifySections(sections);
  assert.deepStrictEqual(unclassified, ['Deployment']);
  assert.deepStrictEqual(pluginAuthored, []);
  assert.deepStrictEqual(projectAuthored, []);
});

test('PHILOSOPHY_EXCEPTION names the present/absent-only section', () => {
  assert.strictEqual(PHILOSOPHY_EXCEPTION, 'Philosophy');
});

const fs = require('fs');
const path = require('path');

const TEMPLATE = path.resolve(
  __dirname, '..', '..', '..', 'skills', 'init', 'claude-md-template.md',
);

test('every section in the live template is classified', () => {
  const src = fs.readFileSync(TEMPLATE, 'utf8');
  const { unclassified } = classifySections(splitSections(extractTemplateBody(src)));
  assert.deepStrictEqual(
    unclassified, [],
    'A template section belongs to neither PLUGIN_AUTHORED_SECTIONS nor '
    + 'PROJECT_AUTHORED_SECTIONS. Add it to one deliberately — this assertion exists so a '
    + 'new section cannot silently escape the conformance check.',
  );
});

test('the live template yields exactly the expected plugin-authored set', () => {
  const src = fs.readFileSync(TEMPLATE, 'utf8');
  const { pluginAuthored } = classifySections(splitSections(extractTemplateBody(src)));
  assert.deepStrictEqual(
    pluginAuthored.sort(),
    ['Philosophy', 'Working Approach', 'claude-tweaks Pipeline'].sort(),
  );
});

test('the live template still ends with Don\'ts — the fence is unambiguous', () => {
  // Guards the Plan A dependency: while the Project Defaults block existed, its
  // same-length inner fence truncated extraction here and Don'ts never appeared.
  const src = fs.readFileSync(TEMPLATE, 'utf8');
  const names = [...splitSections(extractTemplateBody(src)).keys()];
  assert.strictEqual(names[names.length - 1], "Don'ts");
});

const { checkConformance } = require('../../../bin/lib/init/claude-md-conformance');

const TPL = [
  '## Initial Mode Template',
  '',
  '```markdown',
  '# {project name}',
  '',
  '## Stack',
  '',
  '{table}',
  '',
  '## Working Approach',
  '',
  '- **Think before coding.** State assumptions.',
  '',
  '## claude-tweaks Pipeline',
  '',
  '**Artifacts:** design doc then spec.',
  '',
  "## Don'ts",
  '',
  '{anti-patterns}',
  '```',
].join('\n');

test('a conformant project reports no missing and no drifted sections', () => {
  const project = [
    '# acme',
    '',
    '## Stack',
    '',
    '| Layer | Tech |',
    '',
    '## Working Approach',
    '',
    '- **Think before coding.** State assumptions.',
    '',
    '## claude-tweaks Pipeline',
    '',
    '**Artifacts:** design doc then spec.',
  ].join('\n');
  const r = checkConformance({ templateSource: TPL, projectClaudeMd: project });
  assert.deepStrictEqual(r.missing, []);
  assert.deepStrictEqual(r.drifted, []);
  assert.deepStrictEqual(r.conformant.sort(), ['Working Approach', 'claude-tweaks Pipeline'].sort());
});

test('an absent plugin-authored section is reported missing with its expected body', () => {
  const project = ['# acme', '', '## Stack', '', '| Layer | Tech |'].join('\n');
  const r = checkConformance({ templateSource: TPL, projectClaudeMd: project });
  assert.deepStrictEqual(r.missing.map((m) => m.section).sort(), ['Working Approach', 'claude-tweaks Pipeline'].sort());
  const wa = r.missing.find((m) => m.section === 'Working Approach');
  assert.match(wa.expected, /Think before coding/);
});

test('an edited plugin-authored section is reported drifted, not missing', () => {
  const project = [
    '# acme',
    '',
    '## Working Approach',
    '',
    '- **Think before coding.** But ship fast.',
    '',
    '## claude-tweaks Pipeline',
    '',
    '**Artifacts:** design doc then spec.',
  ].join('\n');
  const r = checkConformance({ templateSource: TPL, projectClaudeMd: project });
  assert.deepStrictEqual(r.missing, []);
  assert.deepStrictEqual(r.drifted.map((d) => d.section), ['Working Approach']);
  assert.match(r.drifted[0].actual, /ship fast/);
  assert.match(r.drifted[0].expected, /State assumptions/);
});

test('project-authored sections are never reported', () => {
  const project = ['# acme', '', '## Working Approach', '', '- **Think before coding.** State assumptions.',
    '', '## claude-tweaks Pipeline', '', '**Artifacts:** design doc then spec.'].join('\n');
  const r = checkConformance({ templateSource: TPL, projectClaudeMd: project });
  const named = [...r.missing.map((m) => m.section), ...r.drifted.map((d) => d.section), ...r.conformant];
  assert.ok(!named.includes('Stack'), 'Stack is project-authored and must never be reported');
});

// TPL has no `## Philosophy` heading (byte-comparing it would flag every
// project — see the PHILOSOPHY_EXCEPTION comment above), so this test uses its
// own fixture that adds one, mirroring the live template's placeholder body.
const TPL_WITH_PHILOSOPHY = [
  '## Initial Mode Template',
  '',
  '```markdown',
  '# {project name}',
  '',
  '## Philosophy',
  '',
  '{Adaptive principles that calibrate how Claude approaches changes in this project.',
  'Generated from the maturity classification detected in Phase 2h. See "Generating Philosophy" below.}',
  '',
  '## Working Approach',
  '',
  '- **Think before coding.** State assumptions.',
  '',
  "## Don'ts",
  '',
  '{anti-patterns}',
  '```',
].join('\n');

test('a missing Philosophy section is reported with a generation instruction, not the template placeholder', () => {
  const project = ['# acme'].join('\n');
  const r = checkConformance({ templateSource: TPL_WITH_PHILOSOPHY, projectClaudeMd: project });
  const missingSections = r.missing.map((m) => m.section).sort();
  assert.deepStrictEqual(missingSections, ['Philosophy', 'Working Approach']);

  const philosophy = r.missing.find((m) => m.section === 'Philosophy');
  assert.strictEqual(philosophy.expected, null);
  assert.strictEqual(philosophy.generate, 'maturity-classification');

  // A different missing plugin-authored section still carries a real,
  // insertable `expected` string in the same result — only Philosophy is
  // special-cased.
  const workingApproach = r.missing.find((m) => m.section === 'Working Approach');
  assert.strictEqual(typeof workingApproach.expected, 'string');
  assert.match(workingApproach.expected, /Think before coding/);
  assert.strictEqual(workingApproach.generate, undefined);
});
