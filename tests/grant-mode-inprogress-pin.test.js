'use strict';

// Conformance pin (#654): grant-mode's not-already-claimed exclusion must
// keep using the exact filter expression refineWorklist's `inProgress`
// semantics use (bin/lib/issues/backlog.js). If grant-mode.md's prose ever
// rewrites this filter — even to something behaviorally equivalent — this
// pin fails loudly instead of letting the two silently drift apart.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

test('grant-mode.md still contains the literal not-already-claimed filter expression', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'plugin/skills/backlog/grant-mode.md'), 'utf8');
  assert.ok(
    source.includes('.filter((i) => !i.facets.bot.inProgress)'),
    'expected the literal filter expression `.filter((i) => !i.facets.bot.inProgress)` in skills/backlog/grant-mode.md'
  );
});
