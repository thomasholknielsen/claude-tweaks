const { test } = require('node:test');
const assert = require('node:assert');
const {
  extractTemplateBody,
  splitSections,
} = require('../claude-md-conformance');

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
