'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const {
  recordPayload, TYPE_LABELS,
  extractFingerprint, parseRecordFacets, parseDependencies, parseDependencyAssumptions, specShapedBody,
  buildNativeDependencyQuery, hasOpenNativeBlocker,
} = require('../record');

test('recordPayload assembles labels for a born-ready health record', () => {
  const result = recordPayload({
    title: 't', body: 'b', type: 'task', origin: 'code-health',
    risk: 'low', effort: 'low', ready: true, fingerprint: 'ch:abc',
  });
  assert.deepStrictEqual(result.labels, ['by:code-health', 'risk:low', 'effort:low', 'ready']);
  assert.strictEqual(result.type, 'task');
  assert.strictEqual(result.body, 'b\n\n<!-- work-fingerprint: ch:abc -->');
});

test('recordPayload assembles a plain capture record', () => {
  const result = recordPayload({ title: 't', body: 'b', type: 'feature', origin: 'capture' });
  assert.deepStrictEqual(result.labels, ['by:capture']);
  assert.strictEqual(result.body, 'b');
});

test('recordPayload with origin omitted emits no by:* label and does not throw', () => {
  const result = recordPayload({ title: 't', body: 'b', type: 'bug' });
  assert.deepStrictEqual(result.labels, []);
});

test('recordPayload throws when title is missing', () => {
  assert.throws(() => recordPayload({ body: 'b', type: 'task' }), /title/);
});

test('recordPayload throws when title is not a string', () => {
  assert.throws(() => recordPayload({ title: 5, body: 'b', type: 'task' }), /title/);
});

test('recordPayload throws when body is missing', () => {
  assert.throws(() => recordPayload({ title: 't', type: 'task' }), /body/);
});

test('recordPayload throws when body is not a string', () => {
  assert.throws(() => recordPayload({ title: 't', body: 5, type: 'task' }), /body/);
});

test('recordPayload throws on unknown type; absence never throws', () => {
  assert.throws(() => recordPayload({ title: 't', body: 'b', type: 'epic' }), /bug|feature|task/);
});

test('recordPayload throws on unknown origin', () => {
  assert.throws(() => recordPayload({ title: 't', body: 'b', type: 'task', origin: 'wrap-up' }), /origin/);
});

test('recordPayload accepts origin: docs-health', () => {
  const payload = recordPayload({ title: 'x', body: 'y', type: 'task', origin: 'docs-health' });
  assert.ok(payload.labels.includes('by:docs-health'));
});

test('recordPayload throws on unknown risk', () => {
  assert.throws(() => recordPayload({ title: 't', body: 'b', type: 'task', risk: 'critical' }), /risk/);
});

test('recordPayload throws on unknown effort', () => {
  assert.throws(() => recordPayload({ title: 't', body: 'b', type: 'task', effort: 'gigantic' }), /effort/);
});

test('recordPayload throws on unknown priority', () => {
  assert.throws(() => recordPayload({ title: 't', body: 'b', type: 'task', priority: 'urgent' }), /priority/);
});

test('recordPayload throws when both ready and parked are true', () => {
  assert.throws(
    () => recordPayload({ title: 't', body: 'b', type: 'task', ready: true, parked: true }),
    /both ready and parked/
  );
});

test('recordPayload emits parked and priority labels', () => {
  const result = recordPayload({ title: 't', body: 'b', type: 'task', parked: true, priority: 'high' });
  assert.deepStrictEqual(result.labels, ['parked', 'priority:high']);
});

test('TYPE_LABELS has exactly 3 pairs naming type:bug|feature|task with descriptions <= 100 chars', () => {
  assert.strictEqual(TYPE_LABELS.length, 3);
  assert.deepStrictEqual(TYPE_LABELS.map(([name]) => name), ['type:bug', 'type:feature', 'type:task']);
  for (const [, description] of TYPE_LABELS) {
    assert.ok(description.length <= 100, `description too long: "${description}"`);
  }
});

// AC 2 — dual-marker extraction

test('extractFingerprint reads the legacy code-health-fingerprint marker', () => {
  assert.strictEqual(extractFingerprint('x\n<!-- code-health-fingerprint: old:1 -->'), 'old:1');
});

test('extractFingerprint reads the new work-fingerprint marker', () => {
  assert.strictEqual(extractFingerprint('x\n<!-- work-fingerprint: new:2 -->'), 'new:2');
});

test('extractFingerprint prefers the new work-fingerprint marker when both are present', () => {
  assert.strictEqual(
    extractFingerprint('<!-- code-health-fingerprint: old:1 -->\n<!-- work-fingerprint: new:2 -->'),
    'new:2'
  );
});

test('extractFingerprint reads the legacy harness-health-fingerprint marker', () => {
  assert.strictEqual(extractFingerprint('x\n<!-- harness-health-fingerprint: hh:1 -->'), 'hh:1');
});

test('extractFingerprint reads the legacy journey-health-fingerprint marker', () => {
  assert.strictEqual(extractFingerprint('x\n<!-- journey-health-fingerprint: jh:1 -->'), 'jh:1');
});

test('extractFingerprint prefers work-fingerprint over harness-health-fingerprint', () => {
  assert.strictEqual(
    extractFingerprint('<!-- harness-health-fingerprint: hh:1 -->\n<!-- work-fingerprint: new:2 -->'),
    'new:2'
  );
});

test('extractFingerprint prefers work-fingerprint over journey-health-fingerprint', () => {
  assert.strictEqual(
    extractFingerprint('<!-- journey-health-fingerprint: jh:1 -->\n<!-- work-fingerprint: new:2 -->'),
    'new:2'
  );
});

test('extractFingerprint returns null when no marker is present', () => {
  assert.strictEqual(extractFingerprint('no markers here'), null);
});

test('extractFingerprint returns null for null, undefined, and empty-string bodies', () => {
  assert.strictEqual(extractFingerprint(null), null);
  assert.strictEqual(extractFingerprint(undefined), null);
  assert.strictEqual(extractFingerprint(''), null);
});

// AC 4 — facets

test('parseRecordFacets: by:capture + parked', () => {
  assert.deepStrictEqual(parseRecordFacets(['by:capture', 'parked']), {
    origin: 'capture', risk: null, effort: null, priority: null, stage: 'parked',
    grants: { build: false, merge: false }, bot: { inProgress: false, blocked: false },
    acceptance: null,
  });
});

test('parseRecordFacets: ready + auto:build + bot:in-progress', () => {
  const result = parseRecordFacets(['ready', 'auto:build', 'bot:in-progress']);
  assert.strictEqual(result.stage, 'ready');
  assert.deepStrictEqual(result.grants, { build: true, merge: false });
  assert.deepStrictEqual(result.bot, { inProgress: true, blocked: false });
  assert.strictEqual(result.origin, null);
});

test('parseRecordFacets: auto:build + auto:merge grants both build and merge', () => {
  const result = parseRecordFacets(['auto:build', 'auto:merge']);
  assert.deepStrictEqual(result.grants, { build: true, merge: true });
});

test('parseRecordFacets: bot:blocked sets bot.blocked without bot.inProgress', () => {
  const result = parseRecordFacets(['bot:blocked']);
  assert.deepStrictEqual(result.bot, { inProgress: false, blocked: true });
});

test('parseRecordFacets: empty label list', () => {
  assert.deepStrictEqual(parseRecordFacets([]), {
    origin: null, risk: null, effort: null, priority: null, stage: 'backlog',
    grants: { build: false, merge: false }, bot: { inProgress: false, blocked: false },
    acceptance: null,
  });
});

test('parseRecordFacets: {name} label objects for risk/effort/priority, unmatched wontfix ignored', () => {
  const result = parseRecordFacets([
    { name: 'risk:high' }, { name: 'effort:low' }, { name: 'priority:medium' }, { name: 'wontfix' },
  ]);
  assert.strictEqual(result.risk, 'high');
  assert.strictEqual(result.effort, 'low');
  assert.strictEqual(result.priority, 'medium');
  assert.strictEqual(result.stage, 'backlog');
});

test('parseRecordFacets: malformed ready+parked resolves deterministically to ready (ready > parked)', () => {
  assert.strictEqual(parseRecordFacets(['ready', 'parked']).stage, 'ready');
});

test('parseRecordFacets: malformed parked+ready still resolves to ready regardless of array order', () => {
  assert.strictEqual(parseRecordFacets(['parked', 'ready']).stage, 'ready');
});

// AC — acceptance axis (demo skill)

test('parseRecordFacets: demo:pending sets acceptance to pending', () => {
  assert.strictEqual(parseRecordFacets(['demo:pending']).acceptance, 'pending');
});

test('parseRecordFacets: demo:approved sets acceptance to approved', () => {
  assert.strictEqual(parseRecordFacets(['demo:approved']).acceptance, 'approved');
});

test('parseRecordFacets: demo:changes-requested sets acceptance to changes-requested', () => {
  assert.strictEqual(parseRecordFacets(['demo:changes-requested']).acceptance, 'changes-requested');
});

test('parseRecordFacets: acceptance defaults to null when no demo:* label is present', () => {
  assert.strictEqual(parseRecordFacets([]).acceptance, null);
  assert.strictEqual(parseRecordFacets(['ready', 'auto:build']).acceptance, null);
});

test('parseRecordFacets: LABELS exposes the three demo:* acceptance label strings', () => {
  const { LABELS } = require('../record');
  assert.strictEqual(LABELS.DEMO_PENDING, 'demo:pending');
  assert.strictEqual(LABELS.DEMO_APPROVED, 'demo:approved');
  assert.strictEqual(LABELS.DEMO_CHANGES_REQUESTED, 'demo:changes-requested');
});

// AC 5 — dependencies

test('parseDependencies collects line-anchored Blocked-by numbers in order of appearance', () => {
  assert.deepStrictEqual(parseDependencies('intro\nBlocked by #12\nBlocked by #7\ntail'), [12, 7]);
});

test('parseDependencies dedupes repeated numbers', () => {
  assert.deepStrictEqual(parseDependencies('Blocked by #12\nBlocked by #12'), [12]);
});

test('parseDependencies returns an empty array when there are no dependency lines', () => {
  assert.deepStrictEqual(parseDependencies('no deps'), []);
});

test('parseDependencies ignores mid-line occurrences (line-anchored only)', () => {
  assert.deepStrictEqual(parseDependencies('see Blocked by #9 mid-line'), []);
});

test('hasOpenNativeBlocker returns true when any blockedBy node is OPEN', () => {
  assert.strictEqual(
    hasOpenNativeBlocker({ number: 39, blockedBy: { nodes: [{ number: 14, state: 'OPEN' }] } }),
    true
  );
});

test('hasOpenNativeBlocker returns false when all blockedBy nodes are CLOSED', () => {
  assert.strictEqual(
    hasOpenNativeBlocker({ number: 39, blockedBy: { nodes: [{ number: 14, state: 'CLOSED' }] } }),
    false
  );
});

test('hasOpenNativeBlocker returns false when blockedBy has no nodes', () => {
  assert.strictEqual(hasOpenNativeBlocker({ number: 39, blockedBy: { nodes: [] } }), false);
});

test('hasOpenNativeBlocker returns false for null or undefined input', () => {
  assert.strictEqual(hasOpenNativeBlocker(null), false);
  assert.strictEqual(hasOpenNativeBlocker(undefined), false);
});

test('hasOpenNativeBlocker returns false when blockedBy is missing entirely', () => {
  assert.strictEqual(hasOpenNativeBlocker({ number: 39 }), false);
});

test('buildNativeDependencyQuery aliases each number and requests blockedBy state', () => {
  const q = buildNativeDependencyQuery([39, 37]);
  assert.match(q, /i39: issue\(number:39\)/);
  assert.match(q, /i37: issue\(number:37\)/);
  assert.match(q, /blockedBy\(first:25\)/);
  assert.match(q, /state/);
  assert.match(q, /repository\(owner:\$owner,name:\$repo\)/);
});

test('buildNativeDependencyQuery returns null for an empty array', () => {
  assert.strictEqual(buildNativeDependencyQuery([]), null);
});

test('buildNativeDependencyQuery returns null for non-array input', () => {
  assert.strictEqual(buildNativeDependencyQuery(undefined), null);
});

// AC — dependency assumptions (cross-spec-promise-tracking)

test('parseDependencyAssumptions captures trailing text after the colon', () => {
  assert.deepStrictEqual(
    parseDependencyAssumptions('Blocked by #14: needs getStatus() to exist'),
    [{ number: 14, assumption: 'needs getStatus() to exist' }],
  );
});

test('parseDependencyAssumptions handles multiple lines in order of appearance', () => {
  assert.deepStrictEqual(
    parseDependencyAssumptions('Blocked by #12: first thing\nBlocked by #7: second thing'),
    [
      { number: 12, assumption: 'first thing' },
      { number: 7, assumption: 'second thing' },
    ],
  );
});

test('parseDependencyAssumptions omits bare Blocked-by lines with no colon', () => {
  assert.deepStrictEqual(
    parseDependencyAssumptions('Blocked by #12\nBlocked by #7: has text'),
    [{ number: 7, assumption: 'has text' }],
  );
});

test('parseDependencyAssumptions returns an empty array when there are no assumption lines', () => {
  assert.deepStrictEqual(parseDependencyAssumptions('Blocked by #9\nno colon here'), []);
});

test('parseDependencyAssumptions ignores mid-line occurrences (line-anchored only)', () => {
  assert.deepStrictEqual(
    parseDependencyAssumptions('see Blocked by #9: mid-line text'),
    [],
  );
});

test('parseDependencyAssumptions trims leading whitespace after the colon', () => {
  assert.deepStrictEqual(
    parseDependencyAssumptions('Blocked by #3:    padded text'),
    [{ number: 3, assumption: 'padded text' }],
  );
});

test('parseDependencyAssumptions does not let a bare colon-only line swallow the next line', () => {
  assert.deepStrictEqual(
    parseDependencyAssumptions('Blocked by #3:\nBlocked by #7: real assumption'),
    [{ number: 7, assumption: 'real assumption' }],
  );
});

test('specShapedBody composes the gate-verified skeleton with string sections', () => {
  const body = specShapedBody({
    header: '**Kind:** x',
    currentState: 'the state',
    deliverables: 'the work',
    acceptanceCriteria: 'the proof',
    filedBy: '/claude-tweaks:harness-health',
  });
  assert.strictEqual(body, [
    '**Kind:** x',
    '## Current State',
    'the state',
    '## Deliverables',
    'the work',
    '## Acceptance Criteria',
    'the proof',
    '_Filed by `/claude-tweaks:harness-health`. Close to resolve; label `wontfix` to suppress future reports of this finding._',
  ].join('\n\n'));
});

test('specShapedBody renders array sections as blank-line-separated blocks', () => {
  const body = specShapedBody({
    header: 'h',
    currentState: ['block one', 'block two'],
    deliverables: 'd',
    acceptanceCriteria: 'a',
    filedBy: '/claude-tweaks:code-health',
  });
  assert.ok(body.includes('## Current State\n\nblock one\n\nblock two\n\n## Deliverables'));
});

test('specShapedBody throws on a missing or empty section', () => {
  assert.throws(() => specShapedBody({ header: 'h', currentState: '', deliverables: 'd', acceptanceCriteria: 'a', filedBy: 'f' }), /currentState/);
  assert.throws(() => specShapedBody({ header: 'h', currentState: 'c', deliverables: 'd', acceptanceCriteria: 'a' }), /filedBy/);
  assert.throws(() => specShapedBody({ header: 'h', currentState: [], deliverables: 'd', acceptanceCriteria: 'a', filedBy: 'f' }), /currentState/);
});
