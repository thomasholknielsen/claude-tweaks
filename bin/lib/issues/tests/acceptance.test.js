'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  dispositionState,
  verificationSurface,
  needsBackstop,
} = require('../acceptance.js');

test('dispositionState reads each acceptance label', () => {
  assert.equal(dispositionState(['demo:pending']), 'pending');
  assert.equal(dispositionState(['demo:approved']), 'approved');
  assert.equal(dispositionState(['demo:changes-requested']), 'changes-requested');
});

test('dispositionState returns none when no acceptance label is present', () => {
  assert.equal(dispositionState(['ready', 'type:bug']), 'none');
  assert.equal(dispositionState([]), 'none');
  assert.equal(dispositionState(undefined), 'none');
});

test('a resolved verdict wins over a stale demo:pending', () => {
  // /demo removes demo:pending as it adds the verdict, but a partial write or a
  // concurrent edit can leave both. A resolved record must never be re-swept.
  assert.equal(dispositionState(['demo:pending', 'demo:approved']), 'approved');
  assert.equal(dispositionState(['demo:pending', 'demo:changes-requested']), 'changes-requested');
});

test('verificationSurface treats docs, skills, bin and config as non-interactive', () => {
  assert.equal(verificationSurface(['docs/plugin-structure.md']), 'non-interactive');
  assert.equal(verificationSurface(['skills/tidy/SKILL.md']), 'non-interactive');
  assert.equal(verificationSurface(['bin/lib/issues/acceptance.js']), 'non-interactive');
  assert.equal(verificationSurface(['.claude-plugin/plugin.json']), 'non-interactive');
});

test('verificationSurface treats stories and journeys as interactive despite being markdown', () => {
  assert.equal(verificationSurface(['docs/journeys/checkout.md']), 'interactive');
  assert.equal(verificationSurface(['stories/login.md']), 'interactive');
});

test('verificationSurface is interactive when any path is a UI surface', () => {
  assert.equal(verificationSurface(['docs/a.md', 'src/components/Button.tsx']), 'interactive');
});

// The classifier deliberately carries no "backend code with no route/component/page"
// category — see the NON_INTERACTIVE comment in acceptance.js. These pin the boundary so a
// later prefix (`^src/`, `^lib/`, `^app/`) cannot be added without confronting the UI cases
// it would silently reclassify.
test('backend-looking project paths still classify as interactive', () => {
  assert.equal(verificationSurface(['docs/a.md', 'src/services/payments.ts']), 'interactive');
  assert.equal(verificationSurface(['app/api/orders/route.ts']), 'interactive');
  assert.equal(verificationSurface(['lib/db/client.ts']), 'interactive');
  assert.equal(verificationSurface(['internal/billing/charge.go']), 'interactive');
});

test('a backend prefix would have to reclassify these UI paths to work', () => {
  assert.equal(verificationSurface(['src/components/Button.tsx']), 'interactive');
  assert.equal(verificationSurface(['lib/ui/Modal.svelte']), 'interactive');
  assert.equal(verificationSurface(['app/dashboard/page.tsx']), 'interactive');
});

test('verificationSurface defaults to non-interactive for an empty path list', () => {
  assert.equal(verificationSurface([]), 'non-interactive');
  assert.equal(verificationSurface(undefined), 'non-interactive');
});

test('needsBackstop fires only for a closed record with no disposition', () => {
  assert.equal(needsBackstop({ state: 'CLOSED', labels: [] }), true);
  assert.equal(needsBackstop({ state: 'CLOSED', labels: ['demo:approved'] }), false);
  assert.equal(needsBackstop({ state: 'OPEN', labels: [] }), false);
  assert.equal(needsBackstop(undefined), false);
});
