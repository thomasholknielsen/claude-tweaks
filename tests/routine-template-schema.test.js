'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseRoutineTemplate } = require('../bin/lib/routine-template-parser.js');

const SKILLS_DIR = path.join(__dirname, '..', 'skills');
const CRON_RE = /^\S+\s+\S+\s+\S+\s+\S+\s+\S+$/;
const FORBIDDEN_KEYS = ['environment_id', 'repo_url', 'account', 'credentials', 'connector_uuid', 'url'];

function findTemplates() {
  return fs
    .readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(SKILLS_DIR, d.name, 'routine-template.yml'))
    .filter((p) => fs.existsSync(p));
}

test('at least one routine-template.yml exists to validate', () => {
  const templates = findTemplates();
  assert.ok(templates.length >= 1, 'expected at least one skills/*/routine-template.yml to exist');
});

for (const templatePath of findTemplates()) {
  const skillName = path.basename(path.dirname(templatePath));

  test(`${skillName}/routine-template.yml conforms to schema`, () => {
    const text = fs.readFileSync(templatePath, 'utf8');
    const tpl = parseRoutineTemplate(text);

    assert.equal(typeof tpl.template_version, 'number');
    assert.ok(
      Number.isInteger(tpl.template_version) && tpl.template_version >= 1,
      'template_version must be a positive integer'
    );

    assert.equal(typeof tpl.routine_name, 'string');
    assert.match(
      tpl.routine_name,
      /^[a-z0-9]+(-[a-z0-9]+)*$/,
      'routine_name must be a lowercase hyphenated slug (it becomes both a live routine name and a filename)'
    );

    assert.equal(typeof tpl.prompt, 'string');
    assert.match(
      tpl.prompt.trim(),
      /\/claude-tweaks:[a-z-]+(\s+\S.*)?$/,
      'prompt must be self-contained and end with a /claude-tweaks:<skill> kickoff command (the standard preamble in routine-template-schema.md precedes it)'
    );

    // The preamble's target branch is substituted at instantiation by
    // /claude-tweaks:routine (CREATE Step 5.5). A template authored without the
    // placeholder silently reverts to resolving the repo's GitHub default branch
    // on every firing — the #132 bug, which is invisible in a diff review.
    assert.equal(
      tpl.prompt.split('{{TARGET_BRANCH}}').length - 1,
      1,
      'prompt must contain the standard preamble\'s {{TARGET_BRANCH}} placeholder exactly once — substitution is a single replacement'
    );
    assert.ok(
      !/\{\{(?!TARGET_BRANCH\}\})/.test(tpl.prompt),
      'the preamble defines exactly one placeholder; any other {{...}} would reach a live routine unsubstituted'
    );

    // `branch` is a legal template field (a vendored, single-project template may
    // pin one) but must stay unset in the plugin-shipped copies — the same
    // portability rule that bans environment_id and repo URLs below.
    assert.equal(
      tpl.branch,
      undefined,
      'a plugin-shipped template must not pin `branch` — it ships to every project, and /claude-tweaks:routine resolves the branch per project'
    );

    assert.equal(typeof tpl.model, 'string');
    assert.ok(tpl.model.length > 0, 'model must be non-empty');

    assert.ok(Array.isArray(tpl.allowed_tools), 'allowed_tools must be an array');
    assert.ok(tpl.allowed_tools.length > 0, 'allowed_tools must not be empty');
    for (const t of tpl.allowed_tools) {
      assert.equal(typeof t, 'string');
      assert.ok(t.length > 0);
    }

    assert.ok(Array.isArray(tpl.mcp_connections), 'mcp_connections must be an array (may be empty)');

    assert.ok(
      tpl.default_schedule && typeof tpl.default_schedule === 'object',
      'default_schedule must be a nested map'
    );
    assert.equal(typeof tpl.default_schedule.cron_expression, 'string');
    assert.match(tpl.default_schedule.cron_expression, CRON_RE, 'cron_expression must be a 5-field cron string');
    assert.equal(typeof tpl.default_schedule.description, 'string');
    assert.ok(tpl.default_schedule.description.length > 0, 'default_schedule.description must be non-empty');

    for (const forbidden of FORBIDDEN_KEYS) {
      assert.equal(tpl[forbidden], undefined, `template must never contain account-specific field "${forbidden}"`);
      if (tpl.default_schedule) {
        assert.equal(
          tpl.default_schedule[forbidden],
          undefined,
          `default_schedule must never contain account-specific field "${forbidden}"`
        );
      }
    }
  });
}

// The standard preamble is written once in routine-template-schema.md and copied verbatim
// into every template's `prompt`. Nothing but this test notices when one copy is edited and
// the others aren't — and a preamble paragraph that reaches five of six routines is worse
// than one that reaches none, because the gap is invisible from any single file.
function canonicalPreamble() {
  const schema = fs.readFileSync(path.join(SKILLS_DIR, '_shared', 'routine-template-schema.md'), 'utf8');
  const section = schema.split('## Standard prompt preamble')[1];
  assert.ok(section, 'routine-template-schema.md must carry a "## Standard prompt preamble" section');
  const block = section.split('```')[1];
  assert.ok(block, 'the preamble section must carry a fenced block holding the canonical text');
  // Normalise to how a YAML folded scalar renders it: each paragraph joined onto one line,
  // blank lines between paragraphs kept, and the template-specific kickoff line dropped.
  return block
    .trim()
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s*\n\s*/g, ' ').trim())
    .filter((paragraph) => !paragraph.startsWith('Then: '))
    .join('\n\n');
}

// #271: code-health's Focus Mode (skills/code-health/focus-mode.md) documents a
// future `--focus <value>` CREATE-time argument (routine-template-schema.md's
// "Focus-mode variants" section) that would append ` focus=<value>` to this
// kickoff line. It is not yet wired into /claude-tweaks:routine (fleet
// provisioning is out of scope for #271) — this pin exists so that later wiring
// cannot silently change the parameterless (no `--focus`) path, which must keep
// producing today's generalist prompt byte-identically.
test('code-health/routine-template.yml: the parameterless kickoff line is exactly "Then: /claude-tweaks:code-health"', () => {
  const templatePath = path.join(SKILLS_DIR, 'code-health', 'routine-template.yml');
  const tpl = parseRoutineTemplate(fs.readFileSync(templatePath, 'utf8'));
  const kickoffAt = tpl.prompt.lastIndexOf('Then: ');
  assert.ok(kickoffAt > 0, 'prompt must carry a "Then: " kickoff line');
  assert.equal(
    tpl.prompt.slice(kickoffAt).trim(),
    'Then: /claude-tweaks:code-health',
    'the no-focus kickoff line must stay byte-identical to today\'s generalist prompt — a future ' +
      '--focus wiring must add to this only when --focus is actually passed, never by default',
  );
});

for (const templatePath of findTemplates()) {
  const skillName = path.basename(path.dirname(templatePath));

  test(`${skillName}/routine-template.yml opens with the canonical standard preamble`, () => {
    const tpl = parseRoutineTemplate(fs.readFileSync(templatePath, 'utf8'));
    const kickoffAt = tpl.prompt.lastIndexOf('Then: ');
    assert.ok(kickoffAt > 0, 'prompt must carry a "Then: " kickoff line after the preamble');
    assert.equal(
      tpl.prompt.slice(0, kickoffAt).trim(),
      canonicalPreamble(),
      `${skillName}'s preamble has drifted from the canonical block in _shared/routine-template-schema.md — ` +
        'edit the schema and every skills/*/routine-template.yml together, never one alone'
    );
  });
}
