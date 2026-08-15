'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  CEILING_BYTES,
  DESCRIPTION_CEILING_CHARS,
  DESCRIPTION_TOTAL_CEILING_CHARS,
  measureSkills,
  measureSubFiles,
  overCeiling,
  totalBytes,
  headroom,
  extractDescription,
  descriptionHashHazard,
  findDescriptionHashHazards,
  measureDescriptions,
  overDescriptionCeiling,
  totalDescriptionChars,
} = require('../../../bin/lib/skill-audit/context-cost.js');
const { listSkillDirs, KNOWN_SKILLS } = require('../../../bin/lib/skill-audit/skill-catalog.js');

const REPO = path.join(__dirname, '..', '..', '..');
const kb = (b) => (b / 1024).toFixed(1);

// Builds a scratch {tmp}/skills/{name}/SKILL.md fixture so findDescriptionHashHazards
// can be proven against a synthetic corpus without touching the real skills/ tree.
function makeFixtureRepo(skillName, descriptionLine) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'context-cost-hazard-'));
  const skillDir = path.join(root, 'skills', skillName);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, 'SKILL.md'),
    `---\nname: ${skillName}\n${descriptionLine}\n---\nbody\n`,
  );
  return root;
}

test('measureSkills finds every shipped skill', () => {
  const skills = measureSkills(REPO);
  // Directory-derived, not a hard-coded `33` -- see skill-catalog.js.
  assert.strictEqual(skills.length, listSkillDirs(REPO).length);
  for (const known of KNOWN_SKILLS) {
    assert.ok(skills.some((s) => s.name === known), `measureSkills is missing known skill: ${known}`);
  }
  assert.ok(skills.every((s) => s.bytes > 0));
});

test('overCeiling and headroom agree on the boundary', () => {
  const at = { name: 'x', bytes: CEILING_BYTES };
  const over = { name: 'y', bytes: CEILING_BYTES + 1 };
  assert.deepStrictEqual(overCeiling([at]), []);
  assert.deepStrictEqual(overCeiling([over]), [over]);
  assert.strictEqual(headroom(at), 0);
  assert.strictEqual(headroom(over), -1);
});

// ── The guards. Both can fail, and after the Phase 3 extraction several files
// sit within a kilobyte of the ceiling, so they are one paragraph from doing so.

test('no SKILL.md exceeds the 40 KB per-invocation ceiling', () => {
  const skills = measureSkills(REPO);
  const over = overCeiling(skills);
  assert.deepStrictEqual(
    over.map((s) => `${s.name} ${kb(s.bytes)} KB`),
    [],
    'a SKILL.md loads in full on every invocation and once per dispatched subagent — '
      + 'extract a section to a sub-file rather than raising this ceiling',
  );
});

test('no lazy-loaded sub-file exceeds the ceiling either', () => {
  // A stub citing a sub-file pays the whole file — Read has no section
  // granularity. This is the shape that let init/bootstrap-steps.md reach 86 KB
  // behind 18 stubs (IL-70), while the per-SKILL.md rule was followed exactly.
  const over = overCeiling(measureSubFiles(REPO));
  assert.deepStrictEqual(
    over.map((s) => `${s.skill}/${s.file} ${kb(s.bytes)} KB`),
    [],
    'split by the unit the stubs actually name, rather than growing one overflow file',
  );
});

test('reports the payload total and the tightest headroom', () => {
  const skills = measureSkills(REPO);
  const total = totalBytes(skills);
  const tightest = skills
    .map((s) => ({ ...s, free: headroom(s) }))
    .sort((a, b) => a.free - b.free)[0];

  // Informational, not asserted: a total that only ever ratchets one direction is
  // the thing this module exists to make visible, but pinning it would fail on
  // every legitimate edit.
  console.log(`    shipped SKILL.md payload: ${kb(total)} KB across ${skills.length} skills`);
  console.log(`    tightest headroom: ${tightest.name} at ${kb(tightest.bytes)} KB `
    + `(${tightest.free} B under the ceiling)`);

  assert.ok(total > 0);
  assert.ok(tightest.free >= 0, `${tightest.name} is already over the ceiling`);
});

// ── Description budget (#394). Descriptions load into every session of every
// project with the plugin enabled, regardless of whether the skill ever
// fires — a corpus-wide cost the per-SKILL.md ceiling above doesn't cover.

test('extractDescription reads a plain-scalar description', () => {
  const content = '---\nname: x\ndescription: Use when doing a thing. Keywords - a, b.\nargument-hint: "[x]"\n---\nbody\n';
  assert.strictEqual(extractDescription(content), 'Use when doing a thing. Keywords - a, b.');
});

test('extractDescription reads a double-quoted description (needed when the value contains a bare #)', () => {
  const content = '---\nname: x\ndescription: "Use when doing a thing with #N. Keywords - a, b."\n---\nbody\n';
  assert.strictEqual(extractDescription(content), 'Use when doing a thing with #N. Keywords - a, b.');
});

test('extractDescription returns null with no frontmatter or no description field', () => {
  assert.strictEqual(extractDescription('no frontmatter here'), null);
  assert.strictEqual(extractDescription('---\nname: x\n---\nbody\n'), null);
});

test('descriptionHashHazard: unquoted, no hash — safe', () => {
  assert.strictEqual(descriptionHashHazard('description: Use when doing a thing.'), false);
});

test('descriptionHashHazard: unquoted, hash preceded by whitespace — hazard (#393)', () => {
  assert.strictEqual(descriptionHashHazard('description: Bare, next, or #N direct.'), true);
});

test('descriptionHashHazard: unquoted, value itself starts with hash — hazard', () => {
  assert.strictEqual(descriptionHashHazard('description: #N direct only.'), true);
});

test('descriptionHashHazard: unquoted, hash glued to a non-space character — not a YAML comment marker', () => {
  assert.strictEqual(descriptionHashHazard('description: see issue#5 for context.'), false);
});

test('descriptionHashHazard: double-quoted scalar is immune even with a bare hash inside', () => {
  assert.strictEqual(descriptionHashHazard('description: "Bare, next, or #N direct."'), false);
});

test('findDescriptionHashHazards: proof — flags a synthetic skill carrying the hazard', () => {
  const root = makeFixtureRepo('hazard-skill', 'description: Bare, next, or #N direct.');
  assert.deepStrictEqual(findDescriptionHashHazards(root), ['hazard-skill']);
});

test('findDescriptionHashHazards: proof — a quoted description with the same text is not flagged', () => {
  const root = makeFixtureRepo('safe-skill', 'description: "Bare, next, or #N direct."');
  assert.deepStrictEqual(findDescriptionHashHazards(root), []);
});

test('findDescriptionHashHazards: the real skill corpus is currently clean (#393)', () => {
  assert.deepStrictEqual(
    findDescriptionHashHazards(REPO),
    [],
    'an unquoted description containing a bare # (preceded by whitespace) gets silently truncated by the YAML frontmatter parser — see #393',
  );
});

test('measureDescriptions finds every shipped skill', () => {
  const descriptions = measureDescriptions(REPO);
  assert.strictEqual(descriptions.length, listSkillDirs(REPO).length);
  for (const known of KNOWN_SKILLS) {
    assert.ok(descriptions.some((d) => d.name === known), `measureDescriptions is missing known skill: ${known}`);
  }
  assert.ok(descriptions.every((d) => d.chars > 0), 'every shipped skill must carry a non-empty description');
});

test('no description exceeds the per-skill ceiling', () => {
  const over = overDescriptionCeiling(measureDescriptions(REPO));
  assert.deepStrictEqual(
    over.map((d) => `${d.name} (${d.chars} chars)`),
    [],
    `description is the skill-selection surface: trim prose, never Keywords — see #394. Ceiling is ${DESCRIPTION_CEILING_CHARS} chars.`,
  );
});

test('the corpus-wide description total stays under budget', () => {
  const descriptions = measureDescriptions(REPO);
  const total = totalDescriptionChars(descriptions);
  console.log(`    shipped description payload: ${total} chars across ${descriptions.length} skills`);
  assert.ok(
    total <= DESCRIPTION_TOTAL_CEILING_CHARS,
    `description corpus is ${total} chars, over the ${DESCRIPTION_TOTAL_CEILING_CHARS}-char budget (#394)`,
  );
});
