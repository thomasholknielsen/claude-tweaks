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
