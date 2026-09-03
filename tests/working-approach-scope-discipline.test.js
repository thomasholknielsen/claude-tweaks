// Pins the scope-and-edit discipline adopted from the Fable 5.1 prompting
// guide (platform.claude.com/docs/en/build-with-claude/prompt-engineering/
// prompting-claude-fable-5-1) at its three plugin surfaces:
//
//   1. The Working Approach block in init's CLAUDE.md template — the rules an
//      /init-generated CLAUDE.md loads on every turn of a project session.
//   2. This repo's own CLAUDE.md and the evals fixtures' CLAUDE.md copies,
//      byte-conformant to that block through the same checker Update Mode
//      runs against adopting projects — a template edit that skips a copy
//      turns every /init re-run into a "drifted" report.
//   3. /build's implementer injection point — the same rules reach dispatched
//      implementers in projects whose CLAUDE.md carries no such block.
//
// Reads the live corpus deliberately: each assertion pins the shipped text,
// not a fixture, so a deliberate reword has to touch this file too.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { checkConformance } = require('../plugin/bin/lib/init/claude-md-conformance');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const TEMPLATE = 'plugin/skills/init/claude-md-template.md';
const CLAUDE_MD_COPIES = [
  'CLAUDE.md',
  'evals/fixtures/code-health-repo/CLAUDE.md',
  'evals/fixtures/complexity-repo/CLAUDE.md',
  'evals/fixtures/depth-repo/CLAUDE.md',
  'evals/fixtures/init-baseline/CLAUDE.md',
  'evals/fixtures/minimal-node-repo/CLAUDE.md',
];

// Content pins — the clauses the adoption added, one per rule.
const TEST_VOLUME_CLAUSE = 'Commit tests only where the task asks for them or the repo already keeps tests for this kind of change, sized like the neighboring test files; scratch checks stay scratch.';
const FOLLOW_UP_CLAUSE = 'A pre-existing bug or unrelated concern you notice is a follow-up to report, not a fix to fold in, unless the requested behavior cannot work without it.';
const REWRITE_CLAUSE = 'Edit a file in place rather than rewriting it when the result is the same';

function workingApproachSection(markdown) {
  const m = markdown.match(/^## Working Approach\n([\s\S]*?)(?=^## )/m);
  assert.ok(m, 'no "## Working Approach" section found');
  return m[1];
}

test('the template Working Approach block carries the test-volume, follow-up, and rewrite clauses', () => {
  const section = workingApproachSection(read(TEMPLATE));
  assert.ok(section.includes(TEST_VOLUME_CLAUSE), 'test-volume clause missing from Simplicity first');
  assert.ok(section.includes(FOLLOW_UP_CLAUSE), 'follow-up clause missing from Surgical changes');
  assert.ok(section.includes(REWRITE_CLAUSE), 'rewrite clause missing from Surgical changes');
  // Each clause extends an existing bullet rather than adding one: this repo's
  // CLAUDE.md sits against its always-loaded line budget, and the block's
  // bullet roster is enumerated by name in the template's own guidance.
  const bullets = section.split('\n').filter((l) => l.startsWith('- **'));
  assert.strictEqual(bullets.length, 8, `Working Approach bullet count changed: ${bullets.length}`);
});

for (const rel of CLAUDE_MD_COPIES) {
  test(`${rel} Working Approach is byte-conformant to the template`, () => {
    const r = checkConformance({ templateSource: read(TEMPLATE), projectClaudeMd: read(rel) });
    const drifted = r.drifted.find((d) => d.section === 'Working Approach');
    const missing = r.missing.find((m) => m.section === 'Working Approach');
    assert.ok(!missing, `${rel} has no Working Approach section`);
    assert.ok(!drifted, `${rel} Working Approach drifted from the template:\n--- expected\n${drifted && drifted.expected}\n--- actual\n${drifted && drifted.actual}`);
    assert.ok(r.conformant.includes('Working Approach'));
  });
}

test('/build folds the scope-and-edit instruction into implementer execution, after the maturity table', () => {
  const skill = read('plugin/skills/build/SKILL.md');
  const step = skill.split('### Common Step 2: Execute the Plan')[1];
  assert.ok(step, 'build SKILL.md must carry "### Common Step 2: Execute the Plan"');
  const body = step.split(/^### /m)[0];
  const posMaturity = body.indexOf('**Maturity-scaled test discipline');
  const posScope = body.indexOf('**Scope and edit discipline (both strategies, every maturity):**');
  assert.ok(posMaturity > -1, 'maturity-scaled paragraph missing');
  assert.ok(posScope > posMaturity, 'scope-and-edit paragraph must follow the maturity table it piggybacks on');
  const paragraph = body.slice(posScope).split('\n\n')[0];
  for (const phrase of [
    'fold this second instruction into the same execution skill, verbatim and unconditionally',
    "don't fix, optimize or extend it in this change unless the requested behavior cannot work without it; report it as a follow-up in your summary",
    'Commit tests only where the task asks for them or this repository already keeps tests for this kind of change, sized like the neighboring test files',
    "don't turn scratch checks into additional permanent test files",
    'Edit a file surgically rather than rewriting it whenever the result is the same',
    'This is about extras only: implement every behavior the task asks for, completely.',
  ]) {
    assert.ok(paragraph.includes(phrase), `scope-and-edit paragraph missing: ${phrase}`);
  }
});
