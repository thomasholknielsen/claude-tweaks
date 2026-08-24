'use strict';

// Conformance pin (#654): grant-mode's not-already-claimed exclusion must
// keep using the exact filter expression refineWorklist's `inProgress`
// semantics use (bin/lib/issues/backlog.js). This filter's source of truth
// moved from hand-composed grant-mode.md prose into real, tested code when
// #1384 consolidated Step 1's candidate fetch into `bin/backlog-grant-gate.js`
// — see `filterCandidates` in
// `plugin/bin/lib/backlog-grant-gate/backlog-grant-gate.js`. Pinning the
// literal there (rather than in the prose, which now just names the CLI) is
// a strictly tighter guarantee: `node --test` exercises the expression
// directly instead of only pinning its text. If that function's filter ever
// rewrites this expression — even to something behaviorally equivalent —
// this pin fails loudly instead of letting it silently drift from
// `refineWorklist`'s semantics.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

test('backlog-grant-gate.js still contains the literal not-already-claimed filter expression', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'plugin/bin/lib/backlog-grant-gate/backlog-grant-gate.js'),
    'utf8',
  );
  assert.ok(
    source.includes('.filter((i) => !i.facets.bot.inProgress)'),
    'expected the literal filter expression `.filter((i) => !i.facets.bot.inProgress)` in plugin/bin/lib/backlog-grant-gate/backlog-grant-gate.js'
  );
});
