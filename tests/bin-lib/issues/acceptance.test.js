'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  dispositionState,
  verificationSurface,
  needsBackstop,
  parentGateState,
} = require('../../../plugin/bin/lib/issues/acceptance.js');

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

test('needsBackstop suppresses a closed leaf that belongs to a family', () => {
  assert.equal(needsBackstop({ state: 'CLOSED', labels: [], hasParent: true }), false);
});

test('needsBackstop is unchanged when hasParent is absent or not literally true', () => {
  // Explicit-boolean check, not truthiness of a default object — an absent field
  // must preserve today's behavior for human-filed and /capture'd records.
  assert.equal(needsBackstop({ state: 'CLOSED', labels: [] }), true);
  assert.equal(needsBackstop({ state: 'CLOSED', labels: [], hasParent: false }), true);
  assert.equal(needsBackstop({ state: 'CLOSED', labels: [], hasParent: undefined }), true);
});

const CLOSED = (n) => ({ number: n, state: 'CLOSED' });
const OPEN = (n) => ({ number: n, state: 'OPEN' });

test('parentGateState is incomplete while any sub-issue is open', () => {
  assert.equal(parentGateState({ leaves: [CLOSED(1), OPEN(2)], parentLabels: [] }), 'incomplete');
});

test('parentGateState is due when every sub-issue is closed and the parent is unlabelled', () => {
  assert.equal(parentGateState({ leaves: [CLOSED(1), CLOSED(2)], parentLabels: [] }), 'due');
});

test('parentGateState is gated once the parent carries demo:pending', () => {
  assert.equal(parentGateState({ leaves: [CLOSED(1)], parentLabels: ['demo:pending'] }), 'gated');
});

test('parentGateState is resolved once a verdict is recorded', () => {
  assert.equal(parentGateState({ leaves: [CLOSED(1)], parentLabels: ['demo:approved'] }), 'resolved');
  assert.equal(
    parentGateState({ leaves: [CLOSED(1)], parentLabels: ['demo:changes-requested'] }),
    'resolved',
  );
});

test('parentGateState reports gated even if a sub-issue reopens after gating', () => {
  // The label is the authoritative record of what was applied; a reopened sub-issue
  // must not cause the sweep to re-gate an already-gated parent.
  assert.equal(parentGateState({ leaves: [OPEN(1)], parentLabels: ['demo:pending'] }), 'gated');
});

test('parentGateState never reports due for a parent with no discoverable sub-issues', () => {
  // A parent whose sub-issues cannot be resolved is a resolution failure, not a
  // complete parent — gating it would demand a verdict on work nobody built.
  assert.equal(parentGateState({ leaves: [], parentLabels: [] }), 'incomplete');
  assert.equal(parentGateState({}), 'incomplete');
  assert.equal(parentGateState(), 'incomplete');
});
