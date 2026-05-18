// Multi-agent coordination primitive — pure helpers.
//
// Companion to skills/_shared/multi-agent-coordination.md. The markdown
// is the spec; this file is the deterministic logic future callers
// (Specs 02-04) test against. No I/O, no imports from other bin/lib/
// modules — pure functions and constants only.

const LINE_TOLERANCE_REPRODUCTION = 2;
const LINE_TOLERANCE_DEBATE = 5;
const REPRODUCTION_AGENT_COUNT = 2;
const DEBATE_AGENT_COUNT = 2;

const SEVERITY_BUCKETS = {
  critical: 'high',
  high: 'high',
  medium: 'low',
  low: 'low',
  info: 'low',
};
// Alternative scheme (from spec gotchas): { critical: 'crit', high: 'mid',
// medium: 'mid', low: 'low', info: 'low' }. Swap by replacing the map above.

const RED_TEAM_PERSONAS = [
  {
    name: 'Implementer',
    lens: "What's ambiguous or under-specified that would block me from starting to code?",
  },
  {
    name: 'Maintainer',
    lens: 'What in this spec will be hard to maintain six months from now?',
  },
  {
    name: 'Skeptical Reviewer',
    lens: 'What is this spec assuming that might not be true?',
  },
];

const MOA_AGGREGATOR_INSTRUCTION =
  'Read N candidate responses below. Identify what each captures that the others miss. ' +
  'Produce a single output that incorporates the strongest elements of each. ' +
  'Do not list which proposer contributed which idea. ' +
  'Do not produce an analysis of the proposers.';

function severityBucket(severity) {
  return SEVERITY_BUCKETS[severity] || 'low';
}

function findingsMatch(a, b, tolerance = LINE_TOLERANCE_REPRODUCTION) {
  if (a.path !== b.path) return false;
  if (Math.abs(a.line - b.line) > tolerance) return false;
  return severityBucket(a.severity) === severityBucket(b.severity);
}

function categoriseReproduction(agentAFindings, agentBFindings) {
  const confirmed = [];
  const unconfirmed = [];
  const matchedB = new Set();

  for (const fa of agentAFindings) {
    const matchIdx = agentBFindings.findIndex(
      (fb, i) => !matchedB.has(i) && findingsMatch(fa, fb, LINE_TOLERANCE_REPRODUCTION),
    );
    if (matchIdx === -1) {
      unconfirmed.push({ ...fa, source: 'A' });
    } else {
      confirmed.push(fa);
      matchedB.add(matchIdx);
    }
  }

  agentBFindings.forEach((fb, i) => {
    if (!matchedB.has(i)) unconfirmed.push({ ...fb, source: 'B' });
  });

  return { confirmed, unconfirmed };
}

function detectCrossLensOverlap(findingsByLens) {
  const lenses = Object.keys(findingsByLens);
  const overlaps = [];

  for (let i = 0; i < lenses.length; i++) {
    for (let j = i + 1; j < lenses.length; j++) {
      const lensA = lenses[i];
      const lensB = lenses[j];
      for (const fa of findingsByLens[lensA]) {
        for (const fb of findingsByLens[lensB]) {
          if (fa.path === fb.path && Math.abs(fa.line - fb.line) <= LINE_TOLERANCE_DEBATE) {
            overlaps.push({ lensA, lensB, findingA: fa, findingB: fb });
          }
        }
      }
    }
  }

  return overlaps;
}

function resolveDebate(verdictA, verdictB) {
  if (verdictA === 'agree' && verdictB === 'agree') return 'confirmed';
  if (verdictA === 'disagree' && verdictB === 'disagree') return 'unconfirmed';
  return 'contested';
}

function buildReproductionDispatch(taskScope, tier = 'Standard') {
  const prompt = `${taskScope}\n\n[Use: ${tier} model — reproduction agent. Independent run.]`;
  return {
    tier,
    agentCount: REPRODUCTION_AGENT_COUNT,
    agents: [
      { role: 'reproducer-A', prompt },
      { role: 'reproducer-B', prompt },
    ],
  };
}

function buildDebateDispatch(contestedFinding, tier = 'Capable') {
  const prompt =
    `Review this finding and reply with verdict ('agree' / 'disagree' / 'partial') ` +
    `then one paragraph of reasoning:\n\n${JSON.stringify(contestedFinding)}\n\n` +
    `[Use: ${tier} model — debate agent.]`;
  return {
    tier,
    agentCount: DEBATE_AGENT_COUNT,
    rounds: 1,
    agents: [
      { role: 'debater-A', prompt },
      { role: 'debater-B', prompt },
    ],
  };
}

function buildRedTeamDispatch(specContent, tier = 'Standard') {
  return {
    tier,
    agentCount: RED_TEAM_PERSONAS.length,
    agents: RED_TEAM_PERSONAS.map((p) => ({
      role: p.name,
      prompt: `${p.lens}\n\nSpec under review:\n\n${specContent}\n\n[Use: ${tier} model — ${p.name} persona.]`,
    })),
  };
}

function buildMoADispatch(taskScope, proposerCount, proposerTier = 'Standard', aggregatorTier = 'Capable') {
  const proposerPrompt = `${taskScope}\n\n[Use: ${proposerTier} model — MoA proposer.]`;
  const proposers = Array.from({ length: proposerCount }, (_, i) => ({
    role: `proposer-${i + 1}`,
    prompt: proposerPrompt,
  }));
  return {
    layer1: { tier: proposerTier, agentCount: proposerCount, agents: proposers, parallel: true },
    layer2: {
      tier: aggregatorTier,
      agentCount: 1,
      parallel: false,
      buildAggregatorPrompt(proposerOutputs) {
        const numbered = proposerOutputs.map((o, i) => `### Candidate ${i + 1}\n${o}`).join('\n\n');
        return `${MOA_AGGREGATOR_INSTRUCTION}\n\n${numbered}\n\n[Use: ${aggregatorTier} model — MoA aggregator.]`;
      },
    },
  };
}

module.exports = {
  // Constants
  LINE_TOLERANCE_REPRODUCTION,
  LINE_TOLERANCE_DEBATE,
  REPRODUCTION_AGENT_COUNT,
  DEBATE_AGENT_COUNT,
  RED_TEAM_PERSONAS,
  MOA_AGGREGATOR_INSTRUCTION,
  // Comparison / aggregation logic
  severityBucket,
  findingsMatch,
  categoriseReproduction,
  detectCrossLensOverlap,
  resolveDebate,
  // Dispatch shape builders (pure data — no actual Task() calls)
  buildReproductionDispatch,
  buildDebateDispatch,
  buildRedTeamDispatch,
  buildMoADispatch,
};
