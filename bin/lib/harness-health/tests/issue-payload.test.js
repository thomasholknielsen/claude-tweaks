const { test } = require('node:test');
const assert = require('node:assert');
const { toIssuePayload } = require('../issue-payload');
const { extractFingerprint } = require('../../issues/record');

function patchFinding(overrides = {}) {
  return {
    id: 'skillhealth-abc12345',
    kind: 'patch',
    target: 'auth',
    assetType: 'skill',
    category: 'drift',
    section: 'Key Patterns',
    classification: 'restructural',
    confidence: 'high',
    reversibility: 'med',
    description: 'Stale example path',
    oldString: 'See `src/auth/login.js`.',
    newString: 'See `src/auth/session.js`.',
    reason: 'login.js was renamed to session.js.',
    ...overrides,
  };
}

function newSkillFinding(overrides = {}) {
  return {
    id: 'skillhealth-def67890',
    kind: 'new-skill',
    target: 'queue-retry-pattern',
    assetType: 'skill',
    category: 'drift',
    classification: 'additive',
    confidence: 'med',
    reversibility: 'high',
    description: 'Three files implement retry-with-backoff with no skill covering it',
    proposedBody: '---\nname: queue-retry-pattern\n---\n# Queue Retry Pattern',
    reason: 'src/jobs/a.js, b.js, c.js all implement the same pattern independently.',
    ...overrides,
  };
}

// ── classification -> scoring axis fold (spec 15) ───────────────────────────

test('toIssuePayload for a restructural patch finding maps classification to risk:medium/effort:high, ready, and appends the diagnostic label last', () => {
  const payload = toIssuePayload(patchFinding()); // classification: 'restructural'
  assert.deepStrictEqual(payload.labels, ['by:harness-health', 'risk:medium', 'effort:high', 'ready', 'harness-health:restructural']);
  assert.ok(payload.title.includes('auth'));
  assert.ok(payload.body.includes('src/auth/login.js'));
  assert.ok(payload.body.includes('src/auth/session.js'));
});

test('toIssuePayload for an additive patch finding maps classification to risk:low/effort:low', () => {
  const payload = toIssuePayload(patchFinding({ classification: 'additive' }));
  assert.deepStrictEqual(payload.labels, ['by:harness-health', 'risk:low', 'effort:low', 'ready', 'harness-health:additive']);
});

test('toIssuePayload for a new-skill finding is unscored (no risk:*/effort:* label) and uses the new-skill diagnostic label', () => {
  const payload = toIssuePayload(newSkillFinding());
  assert.deepStrictEqual(payload.labels, ['by:harness-health', 'ready', 'harness-health:new-skill']);
  assert.ok(!payload.labels.some((l) => l.startsWith('risk:') || l.startsWith('effort:')), 'new-skill must carry no scoring label');
  assert.ok(payload.title.includes('queue-retry-pattern'));
  assert.ok(payload.body.includes('Queue Retry Pattern'));
});

test('toIssuePayload carries type: task for every kind', () => {
  assert.strictEqual(toIssuePayload(patchFinding()).type, 'task');
  assert.strictEqual(toIssuePayload(newSkillFinding()).type, 'task');
});

// ── fingerprint marker (work-fingerprint, not the legacy marker) ───────────

test('toIssuePayload body embeds the work-fingerprint marker, not the legacy harness-health-fingerprint marker', () => {
  const payload = toIssuePayload(patchFinding());
  assert.ok(payload.body.includes('<!-- work-fingerprint: skillhealth-abc12345 -->'));
  assert.ok(!payload.body.includes('harness-health-fingerprint'), 'legacy marker must not be emitted');
});

test('the fingerprint marker is re-extractable with extractFingerprint', () => {
  const payload = toIssuePayload(patchFinding());
  assert.strictEqual(extractFingerprint(payload.body), 'skillhealth-abc12345');
});

test('toIssuePayload body starts directly with the header line (no leading marker or blank line)', () => {
  const patch = toIssuePayload(patchFinding());
  assert.ok(patch.body.startsWith('**Skill:**'), `expected body to start with the header line, got: ${patch.body.slice(0, 40)}`);
  const newSkill = toIssuePayload(newSkillFinding());
  assert.ok(newSkill.body.startsWith('**New skill candidate**'), `expected body to start with the header line, got: ${newSkill.body.slice(0, 40)}`);
});

// ── body sections ────────────────────────────────────────────────────────

test('toIssuePayload body always includes Current State, Deliverables, and Acceptance Criteria sections', () => {
  const payload = toIssuePayload(patchFinding());
  assert.ok(payload.body.includes('## Current State'));
  assert.ok(payload.body.includes('## Deliverables'));
  assert.ok(payload.body.includes('## Acceptance Criteria'));
});

// ── preserved structured fields (Step 7 producer/consumer invariant) ───────

test('toIssuePayload for a patch finding carries structured decision fields matching the input finding', () => {
  const finding = patchFinding();
  const payload = toIssuePayload(finding);
  assert.strictEqual(payload.id, finding.id);
  assert.strictEqual(payload.kind, finding.kind);
  assert.strictEqual(payload.target, finding.target);
  assert.strictEqual(payload.assetType, finding.assetType);
  assert.strictEqual(payload.category, finding.category);
  assert.strictEqual(payload.classification, finding.classification);
  assert.strictEqual(payload.confidence, finding.confidence);
  assert.strictEqual(payload.reversibility, finding.reversibility);
  assert.strictEqual(payload.oldString, finding.oldString);
  assert.strictEqual(payload.newString, finding.newString);
});

test('toIssuePayload for a new-skill finding carries structured decision fields matching the input finding', () => {
  const finding = newSkillFinding();
  const payload = toIssuePayload(finding);
  assert.strictEqual(payload.id, finding.id);
  assert.strictEqual(payload.kind, finding.kind);
  assert.strictEqual(payload.target, finding.target);
  assert.strictEqual(payload.assetType, finding.assetType);
  assert.strictEqual(payload.category, finding.category);
  assert.strictEqual(payload.classification, finding.classification);
  assert.strictEqual(payload.confidence, finding.confidence);
  assert.strictEqual(payload.reversibility, finding.reversibility);
});

// ── title formatting ─────────────────────────────────────────────────────

test('toIssuePayload title reflects asset type and category', () => {
  const rule = toIssuePayload(patchFinding({ assetType: 'rule', target: 'api-errors', section: 'paths glob' }));
  assert.ok(rule.title.startsWith('Rule drift:'), rule.title);

  const claudeMd = toIssuePayload(patchFinding({ assetType: 'claude-md', target: 'CLAUDE', section: 'Conventions', category: 'best-practice' }));
  assert.ok(claudeMd.title.startsWith('CLAUDE.md best-practice:'), claudeMd.title);
});

test('toIssuePayload title uses the Design Context label for a design-artifact finding', () => {
  const payload = toIssuePayload(patchFinding({
    assetType: 'design-artifact', target: 'PRODUCT', section: 'Freshness',
    oldString: 'Unaudited for 120 days', newString: 'Run /impeccable:impeccable init',
  }));
  assert.ok(payload.title.startsWith('Design Context drift:'), payload.title);
  assert.ok(payload.body.includes('Unaudited for 120 days'));
  assert.ok(payload.body.includes('Run /impeccable:impeccable init'));
});

test('toIssuePayload renders a Memory label for assetType: memory', () => {
  const payload = toIssuePayload({
    ...patchFinding({ assetType: 'memory', target: 'design-feedback-style' }),
    id: 'harnesshealth-abc12345',
  });
  assert.match(payload.title, /^Memory /);
});

// ── relatedSections rendering (bundled findings) ─────────────────────────────

test('toIssuePayload body includes an "Also affects" line when relatedSections is present on a patch finding', () => {
  const payload = toIssuePayload(patchFinding({ relatedSections: ['Key Patterns', 'Overview'] }));
  assert.ok(payload.body.includes('Also affects:'), 'missing Also affects block');
  assert.ok(payload.body.includes('`Key Patterns`'));
  assert.ok(payload.body.includes('`Overview`'));
});

test('toIssuePayload body omits "Also affects" when relatedSections is absent', () => {
  const payload = toIssuePayload(patchFinding());
  assert.ok(!payload.body.includes('Also affects:'));
});

test('toIssuePayload body omits "Also affects" when relatedSections is an empty array', () => {
  const payload = toIssuePayload(patchFinding({ relatedSections: [] }));
  assert.ok(!payload.body.includes('Also affects:'));
});

test('toIssuePayload for a new-skill finding never renders "Also affects" (no section to bundle by)', () => {
  const payload = toIssuePayload(newSkillFinding());
  assert.ok(!payload.body.includes('Also affects:'));
});

// ── fenced Current/Proposed blocks (a nested ``` in oldString/newString must
//    not prematurely close the outer fence) ─────────────────────────────────

test('toIssuePayload widens the Current/Proposed fence when oldString or newString itself contains a ``` fenced block', () => {
  const oldString = 'Example:\n```bash\necho hi\n```\nEnd.';
  const newString = 'Example:\n```bash\necho bye\n```\nEnd.';
  const payload = toIssuePayload(patchFinding({ oldString, newString }));

  // The outer fence must be longer than any backtick run inside the content
  // (here 3), so it opens with 4+ backticks, not exactly 3.
  const currentMatch = payload.body.match(/\*\*Current:\*\*\n(`{4,})\n/);
  assert.ok(currentMatch, `expected a >=4-backtick opening fence around Current, got: ${payload.body.slice(0, 200)}`);
  const proposedMatch = payload.body.match(/\*\*Proposed:\*\*\n(`{4,})\n/);
  assert.ok(proposedMatch, `expected a >=4-backtick opening fence around Proposed, got: ${payload.body}`);

  // The inner ``` sequences must survive intact inside the widened fence,
  // proving the outer fence did not close early.
  assert.ok(payload.body.includes(oldString), 'oldString with its own ``` block must be preserved verbatim');
  assert.ok(payload.body.includes(newString), 'newString with its own ``` block must be preserved verbatim');
});

test('toIssuePayload uses the minimal 3-backtick fence when oldString/newString contain no backticks', () => {
  const payload = toIssuePayload(patchFinding({ oldString: 'plain old text', newString: 'plain new text' }));
  assert.ok(payload.body.includes('**Current:**\n```\nplain old text\n```'));
  assert.ok(payload.body.includes('**Proposed:**\n```\nplain new text\n```'));
});
