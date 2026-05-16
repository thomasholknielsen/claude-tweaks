const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function readSkill(name, file = 'SKILL.md') {
  return fs.readFileSync(path.join(REPO_ROOT, 'skills', name, file), 'utf8');
}

function readSubfile(skill, filename) {
  return fs.readFileSync(path.join(REPO_ROOT, 'skills', skill, filename), 'utf8');
}

// /research → capture, challenge, specify, browse (forward references — should exist from Task 6)
test('/research SKILL.md references /capture in Relationship table', () => {
  const body = readSkill('research');
  assert.match(body, /claude-tweaks:capture/, '/research must reference /capture in its Relationship table');
});

test('/research SKILL.md references /challenge in Relationship table', () => {
  const body = readSkill('research');
  assert.match(body, /claude-tweaks:challenge/, '/research must reference /challenge in its Relationship table');
});

test('/research SKILL.md references /specify in Relationship table', () => {
  const body = readSkill('research');
  assert.match(body, /claude-tweaks:specify/, '/research must reference /specify in its Relationship table');
});

test('/research SKILL.md references /browse in Relationship table', () => {
  const body = readSkill('research');
  assert.match(body, /claude-tweaks:browse/, '/research must reference /browse in its Relationship table');
});

// Reverse references — added by Task 8
test('/capture, /challenge, /specify, /browse each reference /research', () => {
  for (const skill of ['capture', 'challenge', 'specify', 'browse']) {
    const body = readSkill(skill);
    assert.match(
      body,
      /claude-tweaks:research/,
      `skills/${skill}/SKILL.md must reference /research in its Relationship table`
    );
  }
});

// Task 9 will add this — expected to fail until then
test('/help reference card lists /research', () => {
  const body = readSubfile('help', 'reference-card.md');
  assert.match(body, /research/, '/help reference-card.md must mention /research');
});
