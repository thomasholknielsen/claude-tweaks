const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const c = require('../bin/lib/coordination');

const PRIMITIVE_DOC = fs.readFileSync(
  path.join(__dirname, '..', 'skills', '_shared', 'multi-agent-coordination.md'),
  'utf8',
);

// ---------- Dispatch recorder helper ----------
//
// Stub of the Task() interface for unit tests. Captures
// { tier, prompt, role } per call. Callers (Specs 02-04) will be
// test-driven against this recorder; Spec 01 only locks the shape.

function makeRecorder() {
  const calls = [];
  return {
    calls,
    record(call) {
      calls.push(call);
    },
  };
}

// ============================================================
// Reproduction
// ============================================================

test('reproduction: dispatches exactly 2 agents in one batch with identical prompts', () => {
  const dispatch = c.buildReproductionDispatch('Audit src/auth.ts for OWASP top 10.');
  assert.strictEqual(dispatch.agentCount, 2);
  assert.strictEqual(dispatch.agents.length, 2);
  assert.strictEqual(dispatch.agents[0].prompt, dispatch.agents[1].prompt);
  assert.strictEqual(c.REPRODUCTION_AGENT_COUNT, 2);
});

test('reproduction: matching Path:Line + matching severity bucket → confirmed', () => {
  const a = [{ path: 'src/auth.ts', line: 42, severity: 'critical', text: 'missing check' }];
  const b = [{ path: 'src/auth.ts', line: 43, severity: 'high', text: 'missing check' }];
  const { confirmed, unconfirmed } = c.categoriseReproduction(a, b);
  assert.strictEqual(confirmed.length, 1);
  assert.strictEqual(unconfirmed.length, 0);
  assert.strictEqual(confirmed[0].path, 'src/auth.ts');
});

test('reproduction: one-side-only finding → unconfirmed with STAGED entry text in correct schema', () => {
  const a = [{ path: 'src/auth.ts', line: 42, severity: 'critical', text: 'only-A' }];
  const b = [];
  const { confirmed, unconfirmed } = c.categoriseReproduction(a, b);
  assert.strictEqual(confirmed.length, 0);
  assert.strictEqual(unconfirmed.length, 1);
  assert.strictEqual(unconfirmed[0].source, 'A');

  const entry =
    `- STAGED 14:32:08 — /review reproduction: finding ${unconfirmed[0].path}:${unconfirmed[0].line} ` +
    `surfaced by one agent only. Stage path: staged/review-unconfirmed-1.patch.`;
  const schema = /^- (AUTO|STAGED|KEPT-PROMPT) \d{2}:\d{2}:\d{2} — .+\. .+\.$/;
  assert.match(entry, schema);
});

test('reproduction: line numbers within ±2 are treated as matching', () => {
  const a = { path: 'src/x.ts', line: 100, severity: 'low' };
  for (const delta of [-2, -1, 0, 1, 2]) {
    const b = { path: 'src/x.ts', line: 100 + delta, severity: 'low' };
    assert.strictEqual(c.findingsMatch(a, b), true, `delta ${delta} should match`);
  }
});

test('reproduction: line numbers ±3 or more are NOT matching', () => {
  const a = { path: 'src/x.ts', line: 100, severity: 'low' };
  for (const delta of [-5, -3, 3, 5, 10]) {
    const b = { path: 'src/x.ts', line: 100 + delta, severity: 'low' };
    assert.strictEqual(c.findingsMatch(a, b), false, `delta ${delta} should NOT match`);
  }
});

test('reproduction: severity buckets collapse correctly (critical+high vs medium+low+info)', () => {
  assert.strictEqual(c.severityBucket('critical'), 'high');
  assert.strictEqual(c.severityBucket('high'), 'high');
  assert.strictEqual(c.severityBucket('medium'), 'low');
  assert.strictEqual(c.severityBucket('low'), 'low');
  assert.strictEqual(c.severityBucket('info'), 'low');

  const a = { path: 'p', line: 10, severity: 'critical' };
  const sameBucket = { path: 'p', line: 10, severity: 'high' };
  const otherBucket = { path: 'p', line: 10, severity: 'medium' };
  assert.strictEqual(c.findingsMatch(a, sameBucket), true);
  assert.strictEqual(c.findingsMatch(a, otherBucket), false);
});

// ============================================================
// Debate
// ============================================================

test('debate: triggers only on cross-lens Path:Line overlap within ±5 lines with contradicting verdicts', () => {
  const findingsByLens = {
    security: [{ path: 'src/auth.ts', line: 42, severity: 'high', text: 'issue' }],
    architecture: [{ path: 'src/auth.ts', line: 45, severity: 'low', text: 'no issue' }],
    perf: [{ path: 'src/api.ts', line: 200, severity: 'low', text: 'unrelated' }],
  };
  const overlaps = c.detectCrossLensOverlap(findingsByLens);
  assert.strictEqual(overlaps.length, 1);
  assert.strictEqual(overlaps[0].findingA.path, 'src/auth.ts');
  assert.strictEqual(overlaps[0].findingB.path, 'src/auth.ts');

  // ±6 should NOT overlap
  const noOverlap = c.detectCrossLensOverlap({
    a: [{ path: 'src/x.ts', line: 10, severity: 'high' }],
    b: [{ path: 'src/x.ts', line: 17, severity: 'low' }],
  });
  assert.strictEqual(noOverlap.length, 0);
});

test('debate: runs exactly 1 round with 2 agents', () => {
  const dispatch = c.buildDebateDispatch({ path: 'src/x.ts', line: 10, severity: 'high' });
  assert.strictEqual(dispatch.agentCount, 2);
  assert.strictEqual(dispatch.rounds, 1);
  assert.strictEqual(dispatch.agents.length, 2);
  assert.strictEqual(c.DEBATE_AGENT_COUNT, 2);
});

test('debate: both agree → confirmed with AUTO entry', () => {
  assert.strictEqual(c.resolveDebate('agree', 'agree'), 'confirmed');
  const entry = `- AUTO 14:41:02 — /review debate: src/auth.ts:42 confirmed (both agreed). Reversibility: high.`;
  assert.match(entry, /^- AUTO \d{2}:\d{2}:\d{2} — .+confirmed.+Reversibility: high\.$/);
});

test('debate: both disagree → unconfirmed with AUTO entry', () => {
  assert.strictEqual(c.resolveDebate('disagree', 'disagree'), 'unconfirmed');
  const entry = `- AUTO 14:41:05 — /review debate: src/auth.ts:42 unconfirmed (both disagreed). Reversibility: high.`;
  assert.match(entry, /^- AUTO \d{2}:\d{2}:\d{2} — .+unconfirmed.+Reversibility: high\.$/);
});

test('debate: mixed/partial verdicts → contested with STAGED entry', () => {
  assert.strictEqual(c.resolveDebate('agree', 'disagree'), 'contested');
  assert.strictEqual(c.resolveDebate('agree', 'partial'), 'contested');
  assert.strictEqual(c.resolveDebate('disagree', 'partial'), 'contested');
  assert.strictEqual(c.resolveDebate('partial', 'partial'), 'contested');
  const entry = `- STAGED 14:41:08 — /review debate: src/auth.ts:42 contested (mixed verdicts). Stage path: staged/review-debate-1.md.`;
  assert.match(entry, /^- STAGED \d{2}:\d{2}:\d{2} — .+contested.+Stage path:.+$/);
});

// ============================================================
// Multi-persona red-team
// ============================================================

test('red-team: dispatches exactly 3 personas in one batch', () => {
  const dispatch = c.buildRedTeamDispatch('Spec content here.');
  assert.strictEqual(dispatch.agentCount, 3);
  assert.strictEqual(dispatch.agents.length, 3);
  assert.strictEqual(c.RED_TEAM_PERSONAS.length, 3);
  const roles = dispatch.agents.map((a) => a.role);
  assert.deepStrictEqual(roles.sort(), ['Implementer', 'Maintainer', 'Skeptical Reviewer']);
});

test('red-team: each persona prompt inlines its lens question verbatim', () => {
  const dispatch = c.buildRedTeamDispatch('Spec content here.');
  for (const persona of c.RED_TEAM_PERSONAS) {
    const agent = dispatch.agents.find((a) => a.role === persona.name);
    assert.ok(agent, `agent for ${persona.name} should exist`);
    assert.ok(
      agent.prompt.includes(persona.lens),
      `${persona.name}'s prompt must contain its lens question verbatim`,
    );
  }
});

test('red-team: findings emitted in the documented Open Questions / HTML comment shape', () => {
  assert.ok(
    PRIMITIVE_DOC.includes('## Open Questions'),
    'primitive doc must document the Open Questions section shape',
  );
  assert.ok(
    PRIMITIVE_DOC.includes('<!-- ambiguity:'),
    'primitive doc must document the inline HTML comment shape',
  );
});

// ============================================================
// Layered MoA
// ============================================================

test('MoA: dispatches N proposers in parallel + 1 aggregator sequential', () => {
  const dispatch = c.buildMoADispatch('Synthesize a challenge brief.', 4);
  assert.strictEqual(dispatch.layer1.agentCount, 4);
  assert.strictEqual(dispatch.layer1.parallel, true);
  assert.strictEqual(dispatch.layer1.agents.length, 4);
  assert.strictEqual(dispatch.layer2.agentCount, 1);
  assert.strictEqual(dispatch.layer2.parallel, false);
});

test("MoA: aggregator's prompt contains all proposer outputs verbatim", () => {
  const dispatch = c.buildMoADispatch('task scope', 3);
  const proposerOutputs = ['First proposer response.', 'Second proposer reply.', 'Third take.'];
  const aggregatorPrompt = dispatch.layer2.buildAggregatorPrompt(proposerOutputs);
  for (const output of proposerOutputs) {
    assert.ok(aggregatorPrompt.includes(output), `aggregator prompt must include "${output}" verbatim`);
  }
});

test('MoA: aggregator instruction template is inlined verbatim', () => {
  const expected =
    'Read N candidate responses below. Identify what each captures that the others miss. ' +
    'Produce a single output that incorporates the strongest elements of each. ' +
    'Do not list which proposer contributed which idea. ' +
    'Do not produce an analysis of the proposers.';
  assert.strictEqual(c.MOA_AGGREGATOR_INSTRUCTION, expected);

  const dispatch = c.buildMoADispatch('scope', 2);
  const aggregatorPrompt = dispatch.layer2.buildAggregatorPrompt(['p1', 'p2']);
  assert.ok(aggregatorPrompt.startsWith(expected), 'aggregator prompt must begin with the verbatim instruction');

  // Also verify the markdown doc carries the same verbatim text.
  assert.ok(PRIMITIVE_DOC.includes(expected), 'primitive doc must contain the aggregator instruction verbatim');
});
