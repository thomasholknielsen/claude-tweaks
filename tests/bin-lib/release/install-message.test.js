'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const { installUpdateLines } = require(path.resolve(__dirname, '../../../plugin/bin/release.js'));

test('installUpdateLines: renders both the CLI form and the /plugin slash-command form', () => {
  const lines = installUpdateLines('owner/marketplace-repo').join('\n');
  assert.match(lines, /Install\/update this release from the CLI:/);
  assert.match(lines, /^ {2}claude plugin marketplace add owner\/marketplace-repo$/m);
  assert.match(lines, /^ {2}claude plugin install claude-tweaks@marketplace-repo$/m);
  assert.match(lines, /Or from inside a Claude Code session:/);
  assert.match(lines, /^ {2}\/plugin marketplace add owner\/marketplace-repo$/m);
  assert.match(lines, /^ {2}\/plugin install claude-tweaks@marketplace-repo$/m);
});

test('installUpdateLines: marketplace name is derived from the repo slug, not hardcoded', () => {
  const lines = installUpdateLines('someone-else/other-marketplace').join('\n');
  assert.match(lines, /claude plugin install claude-tweaks@other-marketplace/);
  assert.match(lines, /\/plugin install claude-tweaks@other-marketplace/);
});
