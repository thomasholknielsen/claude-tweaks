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

test('parsePathLine / normalizeFinding: bridges Template A\'s combined "Path:Line" column into separate path/line fields', () => {
  assert.deepStrictEqual(c.parsePathLine('src/auth.ts:42'), { path: 'src/auth.ts', line: 42 });
  assert.deepStrictEqual(c.parsePathLine('src/auth.ts'), { path: 'src/auth.ts', line: undefined });

  // Already-split findings pass through untouched.
  const alreadySplit = { path: 'src/x.ts', line: 10, severity: 'high' };
  assert.strictEqual(c.normalizeFinding(alreadySplit), alreadySplit);

  // Naive transcription: combined string kept under `.path`, no separate `.line`.
  const combinedUnderPath = c.normalizeFinding({ path: 'src/x.ts:10', severity: 'high' });
  assert.strictEqual(combinedUnderPath.path, 'src/x.ts');
  assert.strictEqual(combinedUnderPath.line, 10);
  assert.strictEqual(combinedUnderPath.severity, 'high');

  // Naive transcription: literal table-header key "Path:Line", capitalized "Severity".
  const headerKeyTranscription = c.normalizeFinding({
    Severity: 'critical',
    'Path:Line': 'src/x.ts:10',
    Finding: 'missing check',
  });
  assert.strictEqual(headerKeyTranscription.path, 'src/x.ts');
  assert.strictEqual(headerKeyTranscription.line, 10);
  assert.strictEqual(headerKeyTranscription.severity, 'critical');
});

test('reproduction: Template A contract gap — combined "path:line" field (no separate .line) is normalized before comparison, not silently treated as a universal match', () => {
  // Regression for the cross-file-contract bug: without normalizeFinding,
  // a.path/b.path/a.line/b.line end up undefined for every finding (since
  // the real field lives in a combined string), so findingsMatch's
  // `a.path !== b.path` (undefined !== undefined = false) and
  // `Math.abs(a.line - b.line) > tolerance` (NaN > tolerance = false) both
  // fail to short-circuit — every pair spuriously "matches" as confirmed
  // regardless of actual location.
  const a = [{ path: 'src/auth.ts:42', severity: 'critical', text: 'missing check' }];
  const b = [{ path: 'src/auth.ts:43', severity: 'high', text: 'missing check' }];
  const same = c.categoriseReproduction(a, b);
  assert.strictEqual(same.confirmed.length, 1, 'same file, line within tolerance, should reproduce');
  assert.strictEqual(same.unconfirmed.length, 0);
  assert.strictEqual(same.confirmed[0].path, 'src/auth.ts');
  assert.strictEqual(same.confirmed[0].line, 42);

  // Two genuinely different locations must NOT spuriously match once the
  // combined field is correctly split — this is what the pre-fix NaN
  // short-circuit failure would have gotten wrong.
  const c1 = [{ path: 'src/other.ts:100', severity: 'critical', text: 'x' }];
  const d1 = [{ path: 'src/different.ts:900', severity: 'critical', text: 'y' }];
  const different = c.categoriseReproduction(c1, d1);
  assert.strictEqual(different.confirmed.length, 0, 'different files/lines must not spuriously match');
  assert.strictEqual(different.unconfirmed.length, 2);

  // Header-key transcription shape also normalizes and compares correctly.
  const headerA = [{ Severity: 'high', 'Path:Line': 'src/auth.ts:100', Finding: 'x' }];
  const headerB = [{ Severity: 'high', 'Path:Line': 'src/auth.ts:101', Finding: 'x' }];
  const headerResult = c.categoriseReproduction(headerA, headerB);
  assert.strictEqual(headerResult.confirmed.length, 1);
  assert.strictEqual(headerResult.confirmed[0].path, 'src/auth.ts');
  assert.strictEqual(headerResult.confirmed[0].line, 100);
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

// ============================================================
// /review integration tests (Spec 02)
// ============================================================

test('/review reproduction integration: per-lens reproduction → confirmed/unconfirmed categorisation on fixture lens outputs', () => {
  // Fixture: 2 agents for the "security" lens. Both flag finding X at src/auth.ts:42.
  // Agent A also flags finding Y at src/api.ts:100; agent B does not.
  const agentA = [
    { path: 'src/auth.ts', line: 42, severity: 'high', text: 'missing expiry check' },
    { path: 'src/api.ts', line: 100, severity: 'medium', text: 'unhandled rejection' },
  ];
  const agentB = [{ path: 'src/auth.ts', line: 43, severity: 'critical', text: 'missing expiry check' }];
  const { confirmed, unconfirmed } = c.categoriseReproduction(agentA, agentB);

  // Reproduction match: src/auth.ts:42 (A) and src/auth.ts:43 (B) — line ±2, critical+high share bucket
  assert.strictEqual(confirmed.length, 1);
  assert.strictEqual(confirmed[0].path, 'src/auth.ts');

  // One-side-only: src/api.ts:100 in A only
  assert.strictEqual(unconfirmed.length, 1);
  assert.strictEqual(unconfirmed[0].path, 'src/api.ts');
  assert.strictEqual(unconfirmed[0].source, 'A');

  // Decision-log entry schema
  const lensName = 'security';
  const confirmedEntry =
    `- AUTO 14:32:08 — Reproduction: lens "${lensName}" finding ${confirmed[0].path}:${confirmed[0].line} reproduced. Confirmed. Reversibility: high.`;
  assert.match(
    confirmedEntry,
    /^- AUTO \d{2}:\d{2}:\d{2} — Reproduction: lens ".+" finding .+:.+ reproduced\. Confirmed\. Reversibility: high\.$/,
  );
  const unconfirmedEntry =
    `- STAGED 14:32:11 — Reproduction: lens "${lensName}" finding ${unconfirmed[0].path}:${unconfirmed[0].line} not reproduced. Staged to Review Console as low-confidence. Reversibility: high.`;
  assert.match(
    unconfirmedEntry,
    /^- STAGED \d{2}:\d{2}:\d{2} — Reproduction: lens ".+" finding .+:.+ not reproduced\. Staged to Review Console as low-confidence\. Reversibility: high\.$/,
  );
});

test('/review debate integration: cross-lens overlap with contradicting verdicts → debate dispatched → confirmed/unconfirmed/contested resolution per verdict combination', () => {
  // Two lenses both touch src/auth.ts near line 42 with contradicting verdicts.
  const findingsByLens = {
    security: [{ path: 'src/auth.ts', line: 42, severity: 'high', text: 'token issue' }],
    architecture: [{ path: 'src/auth.ts', line: 45, severity: 'low', text: 'minor concern' }],
  };
  const overlaps = c.detectCrossLensOverlap(findingsByLens);
  assert.strictEqual(overlaps.length, 1, 'one overlap pair expected');
  assert.strictEqual(overlaps[0].lensA, 'security');
  assert.strictEqual(overlaps[0].lensB, 'architecture');

  // Debate dispatched as a 2-agent, 1-round pair
  const dispatch = c.buildDebateDispatch(overlaps[0].findingA);
  assert.strictEqual(dispatch.agentCount, 2);
  assert.strictEqual(dispatch.rounds, 1);

  // Verdict resolution across all three outcomes
  assert.strictEqual(c.resolveDebate('agree', 'agree'), 'confirmed');
  assert.strictEqual(c.resolveDebate('disagree', 'disagree'), 'unconfirmed');
  assert.strictEqual(c.resolveDebate('agree', 'partial'), 'contested');

  const confirmedEntry = `- AUTO 14:41:02 — Debate: cross-lens disagreement on src/auth.ts:42 converged positive after 1 round. Reversibility: high.`;
  assert.match(
    confirmedEntry,
    /^- AUTO \d{2}:\d{2}:\d{2} — Debate: cross-lens disagreement on .+ converged positive after 1 round\. Reversibility: high\.$/,
  );
  const unconfirmedEntry = `- AUTO 14:41:05 — Debate: cross-lens disagreement on src/auth.ts:42 converged negative after 1 round. Reversibility: high.`;
  assert.match(
    unconfirmedEntry,
    /^- AUTO \d{2}:\d{2}:\d{2} — Debate: cross-lens disagreement on .+ converged negative after 1 round\. Reversibility: high\.$/,
  );
  const contestedEntry = `- STAGED 14:41:08 — Debate: cross-lens disagreement on src/auth.ts:42 inconclusive (agree, partial). Both verdicts staged. Reversibility: high.`;
  assert.match(
    contestedEntry,
    /^- STAGED \d{2}:\d{2}:\d{2} — Debate: cross-lens disagreement on .+ inconclusive \(.+\)\. Both verdicts staged\. Reversibility: high\.$/,
  );
});

test('/review summary assembly: confirmed flow to summary; unconfirmed + contested flow to Wrap-Up Console subsections', () => {
  // Per-lens reproduction outcomes
  const lensSecurity = c.categoriseReproduction(
    [{ path: 'src/auth.ts', line: 42, severity: 'high', text: 'X' }],
    [{ path: 'src/auth.ts', line: 43, severity: 'critical', text: 'X' }],
  );
  const lensArchitecture = c.categoriseReproduction(
    [{ path: 'src/api.ts', line: 200, severity: 'medium', text: 'Y' }],
    [],
  );

  // Cross-lens overlap on a third file with contested debate outcome
  const overlapVerdict = c.resolveDebate('agree', 'partial');

  // Three-bucket assembly
  const buckets = {
    confirmed: [...lensSecurity.confirmed, ...lensArchitecture.confirmed],
    unconfirmed: [...lensSecurity.unconfirmed, ...lensArchitecture.unconfirmed],
    contested: overlapVerdict === 'contested' ? [{ path: 'src/storage.ts', line: 10 }] : [],
  };

  // Confirmed flows into the review summary's severity table
  assert.strictEqual(buckets.confirmed.length, 1);
  assert.strictEqual(buckets.confirmed[0].path, 'src/auth.ts');

  // Unconfirmed flows into the Low-confidence Console subsection
  assert.strictEqual(buckets.unconfirmed.length, 1);
  assert.strictEqual(buckets.unconfirmed[0].path, 'src/api.ts');

  // Contested flows into the Contested Console subsection
  assert.strictEqual(buckets.contested.length, 1);

  // No silent drops: total in equals total out
  const totalIn = 1 /* security reproduced */ + 1 /* architecture A only */ + 1 /* contested overlap */;
  const totalOut = buckets.confirmed.length + buckets.unconfirmed.length + buckets.contested.length;
  assert.strictEqual(totalOut, totalIn, 'no silent drops — every finding ends up in exactly one bucket');

  // Verify the wrap-up Review Console template documents the two new subsections.
  const REVIEW_CONSOLE = fs.readFileSync(
    path.join(__dirname, '..', 'skills', 'wrap-up', 'review-console.md'),
    'utf8',
  );
  assert.ok(
    REVIEW_CONSOLE.includes('Low-confidence findings (not reproduced)'),
    'review-console.md must document the Low-confidence subsection',
  );
  assert.ok(
    REVIEW_CONSOLE.includes('Contested findings (debate inconclusive)'),
    'review-console.md must document the Contested subsection',
  );
});

// ============================================================
// /specify integration tests (Spec 03)
// ============================================================

test('/specify red-team integration: ambiguous draft spec → red-team flags it → spec body contains Open Questions row OR inline ambiguity comment', () => {
  // Fixture: a draft spec containing a deliberate ambiguity.
  const draftSpec = [
    '# Spec 99: Fast API',
    '',
    '## Acceptance Criteria',
    '1. The API should be fast.',
    '2. Returns paginated results.',
  ].join('\n');

  // Build the red-team dispatch — 3 personas, batched.
  const dispatch = c.buildRedTeamDispatch(draftSpec);
  assert.strictEqual(dispatch.agentCount, 3);
  assert.deepStrictEqual(
    dispatch.agents.map((a) => a.role).sort(),
    ['Implementer', 'Maintainer', 'Skeptical Reviewer'],
  );

  // Each persona prompt contains the draft spec verbatim AND the lens question verbatim.
  for (const agent of dispatch.agents) {
    assert.ok(agent.prompt.includes(draftSpec), `${agent.role}'s prompt must include the draft spec`);
    const persona = c.RED_TEAM_PERSONAS.find((p) => p.name === agent.role);
    assert.ok(agent.prompt.includes(persona.lens), `${agent.role}'s prompt must include its lens question`);
  }

  // Simulate persona output: Skeptical Reviewer flags "fast" with a precise location;
  // Implementer flags missing pagination shape with general location.
  const personaFindings = [
    {
      persona: 'Skeptical Reviewer',
      severity: 'medium',
      location: 'Acceptance Criteria 1',
      finding: '"fast" has no metric — load-bearing assumption',
      resolution: 'define p95 latency target',
    },
    {
      persona: 'Implementer',
      severity: 'medium',
      location: 'general',
      finding: 'pagination shape not defined — page size? cursor or offset?',
    },
  ];

  // Apply write-back logic: precise-location → inline comment; general → Open Questions row.
  function applyRedTeamFindings(specBody, findings) {
    let body = specBody;
    const openQuestions = [];
    for (const f of findings) {
      if (f.location === 'general') {
        openQuestions.push(f);
      } else {
        const comment = `<!-- ambiguity: ${f.persona} — ${f.finding}${f.resolution ? `; suggested: ${f.resolution}` : ''} -->`;
        // Insert comment after the line containing the location identifier.
        body = body.replace(/(1\. The API should be fast\.)/, `$1 ${comment}`);
      }
    }
    if (openQuestions.length > 0) {
      const rows = openQuestions
        .map((f) => `| ${f.persona} | ${f.finding} | ${f.resolution || '—'} |`)
        .join('\n');
      body +=
        '\n\n## Open Questions\n\n| Persona | Finding | Suggested Resolution |\n|---------|---------|---------------------|\n' +
        rows;
    }
    return body;
  }

  const updated = applyRedTeamFindings(draftSpec, personaFindings);

  // Precise-location finding → inline ambiguity comment
  assert.ok(
    updated.includes('<!-- ambiguity: Skeptical Reviewer'),
    'spec body must contain inline ambiguity comment for precise-location finding',
  );
  assert.ok(
    updated.includes('"fast" has no metric'),
    'inline comment must include the finding text',
  );
  assert.ok(
    updated.includes('suggested: define p95 latency target'),
    'inline comment must include the suggested resolution',
  );

  // General-location finding → Open Questions row
  assert.ok(updated.includes('## Open Questions'), 'spec body must contain Open Questions section');
  assert.ok(
    updated.includes('pagination shape not defined'),
    'Open Questions table must contain the general-location finding',
  );

  // Decision-log entry schema for one staged finding
  const entry =
    `- STAGED 11:22:33 — Red-team: persona "Skeptical Reviewer" flagged ambiguity at Acceptance Criteria 1. ` +
    `Written to spec as <!-- ambiguity: --> marker.`;
  assert.match(
    entry,
    /^- STAGED \d{2}:\d{2}:\d{2} — Red-team: persona ".+" flagged (ambiguity|gap|unstated assumption) at .+\. Written to spec as .+\.$/,
  );
});

test('/specify red-team integration: zero findings → Open Questions section is omitted entirely (no empty placeholder)', () => {
  const draftSpec = '# Spec 100\n\nNo issues here.';
  function applyRedTeamFindings(specBody, findings) {
    if (findings.length === 0) return specBody; // Section omitted entirely
    let body = specBody;
    const general = findings.filter((f) => f.location === 'general');
    if (general.length > 0) {
      body += '\n\n## Open Questions\n\n| Persona | Finding | Suggested Resolution |\n|---|---|---|\n';
    }
    return body;
  }
  const result = applyRedTeamFindings(draftSpec, []);
  assert.ok(!result.includes('## Open Questions'), 'empty findings must not emit a placeholder header');
  assert.strictEqual(result, draftSpec, 'spec body unchanged when there are no findings');
});

// ============================================================
// /challenge integration tests (Spec 04)
// ============================================================

const REQUIRED_BRIEF_SECTIONS = [
  '### Original Framing',
  '### Reframed Problem',
  '### Key Assumptions Surfaced',
  '### Blind Spots Identified',
  '### Constraints to Carry Forward',
  '### Open Questions for Brainstorming',
];

test('/challenge MoA integration: fixture INBOX item → 7 proposers + 1 aggregator dispatched → resulting brief contains all 6 required sections', () => {
  const inboxItem = 'Voice shopping list';
  const problemStatement = `Build a voice-driven shopping list feature for our app`;
  const reflectedSummary = `User wants a voice-driven addition to the shopping list flow`;

  // Full mode: 7 proposers (one per lens) + 1 aggregator.
  const proposerCount = 7;
  const dispatch = c.buildMoADispatch(
    `${problemStatement}\n\nReflected: ${reflectedSummary}\n\nINBOX: ${inboxItem}`,
    proposerCount,
  );

  // Layer 1: 7 parallel proposers, Standard tier
  assert.strictEqual(dispatch.layer1.agentCount, proposerCount);
  assert.strictEqual(dispatch.layer1.parallel, true);
  assert.strictEqual(dispatch.layer1.tier, 'Standard');
  assert.strictEqual(dispatch.layer1.agents.length, proposerCount);

  // Layer 2: 1 aggregator, Capable tier, sequential
  assert.strictEqual(dispatch.layer2.agentCount, 1);
  assert.strictEqual(dispatch.layer2.parallel, false);
  assert.strictEqual(dispatch.layer2.tier, 'Capable');

  // Simulate proposer outputs and build the aggregator prompt
  const proposerOutputs = [
    'Lens 1 (Surface Hidden Assumptions): The framing assumes voice is what users want.',
    'Lens 2 (Invert): Maybe the real problem is item entry friction, not modality.',
    'Lens 3 (Zoom Out): Shopping list is a symptom — meal planning may be the bigger lever.',
    'Lens 4 (Outsider): A speech accessibility consultant would ask about ambient noise tolerance.',
    'Lens 5 (Pre-Mortem): In 6 months voice misrecognition created duplicate-item bugs.',
    'Lens 6 (Temporal Distance): Two years out we may regret optimising for novelty over reliability.',
    'Lens 7 (Meta): Is the question "build voice" or "remove friction"?',
  ];
  const aggregatorPrompt = dispatch.layer2.buildAggregatorPrompt(proposerOutputs);

  // The verbatim Mode 4 instruction template must lead the aggregator prompt
  assert.ok(
    aggregatorPrompt.startsWith(c.MOA_AGGREGATOR_INSTRUCTION),
    'aggregator prompt must begin with the verbatim Mode 4 instruction template',
  );

  // All proposer outputs must reach the aggregator verbatim — no truncation
  for (const output of proposerOutputs) {
    assert.ok(aggregatorPrompt.includes(output), `aggregator prompt must include proposer output verbatim: "${output.slice(0, 40)}..."`);
  }

  // Simulate aggregator return: a brief with all six required sections
  const aggregatedBrief = [
    `## Brainstorming Brief: ${inboxItem}`,
    '',
    '### Original Framing',
    problemStatement,
    '',
    '### Reframed Problem',
    'Reduce shopping-list friction; voice is one of several modalities to evaluate.',
    '',
    '### Key Assumptions Surfaced',
    '- Voice is the desired modality (unvalidated)',
    '',
    '### Blind Spots Identified',
    '- Ambient noise tolerance and misrecognition failure modes',
    '',
    '### Constraints to Carry Forward',
    'Must reach the shopping list within 2 taps for non-voice users.',
    '',
    '### Open Questions for Brainstorming',
    '- Voice vs. quick text vs. photo-of-list scan?',
  ].join('\n');

  for (const section of REQUIRED_BRIEF_SECTIONS) {
    assert.ok(aggregatedBrief.includes(section), `brief must contain section "${section}"`);
  }

  // Decision-log entry: ONE AUTO entry per MoA invocation
  const entry = `- AUTO 14:55:01 — MoA: applied ${proposerCount} proposers + 1 aggregator on INBOX item "${inboxItem}". Aggregator tier: Capable.`;
  assert.match(
    entry,
    /^- AUTO \d{2}:\d{2}:\d{2} — MoA: applied \d+ proposers \+ 1 aggregator on .+\. Aggregator tier: Capable\.$/,
  );
});

test('/challenge Quick mode: 2 proposers + 1 aggregator dispatched (lens 1 + lens 7); brief schema unchanged', () => {
  const dispatch = c.buildMoADispatch('Quick debias topic', 2);
  assert.strictEqual(dispatch.layer1.agentCount, 2);
  assert.strictEqual(dispatch.layer1.parallel, true);
  assert.strictEqual(dispatch.layer2.agentCount, 1);

  // The aggregator's prompt still contains the verbatim Mode 4 instruction
  const prompt = dispatch.layer2.buildAggregatorPrompt(['Lens 1 output', 'Lens 7 output']);
  assert.ok(
    prompt.includes(c.MOA_AGGREGATOR_INSTRUCTION),
    'Quick mode still uses the verbatim Mode 4 aggregator instruction — no special-casing',
  );

  // Brief schema unchanged between Full and Quick modes
  for (const section of REQUIRED_BRIEF_SECTIONS) {
    assert.ok(section.startsWith('### '), 'each required section is a third-level heading');
  }
});

test('/challenge auto-mode contract update: Listen + Reflect-back are the not-silenced entry points; per-lens engagement is gone', () => {
  const CONTRACT = fs.readFileSync(
    path.join(__dirname, '..', 'skills', '_shared', 'auto-mode-contract.md'),
    'utf8',
  );
  // The contract no longer lists "/challenge lenses" as not-silenced
  assert.ok(
    !CONTRACT.includes('`/challenge` lenses |'),
    'auto-mode-contract.md must no longer list "/challenge lenses" as a not-silenced item',
  );
  // It DOES list the new Listen + Reflect-back protection
  assert.ok(
    CONTRACT.includes("`/challenge`'s Listen + Reflect-back steps"),
    'auto-mode-contract.md must list /challenge\'s Listen + Reflect-back steps as not-silenced',
  );
});
