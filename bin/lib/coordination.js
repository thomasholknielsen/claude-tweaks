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
    lens: 'Could I build exactly what this asks for without asking a question?',
  },
  {
    name: 'Maintainer',
    lens: "In 6 months, can someone changing related code know what they can/can't break?",
  },
  {
    name: 'Skeptical Reviewer',
    lens: 'What unstated assumption is doing the load-bearing work here?',
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

// Template A (skills/_shared/subagent-output-contract.md) mandates dispatched
// agents return findings as a markdown table with a single combined
// "Path:Line" column (e.g. "src/auth.ts:42"), not separate path/line fields.
// findingsMatch/categoriseReproduction/detectCrossLensOverlap below compare
// on separate `.path`/`.line` fields, so parsePathLine/normalizeFinding are
// the bridge between Template A's literal output shape and what these
// functions require — without it, a caller that transcribes the table
// without splitting that column (leaving `.path`/`.line` undefined, or
// `.path` holding the combined string with no `.line`) makes every finding
// pair spuriously "match": `a.path !== b.path` is `undefined !== undefined`
// = false, and `Math.abs(a.line - b.line) > tolerance` is `NaN > tolerance`
// = false — neither check short-circuits, so the reproduction/overlap gate
// silently passes everything regardless of actual location.

function parsePathLine(pathLine) {
  if (typeof pathLine !== 'string') return { path: pathLine, line: undefined };
  const idx = pathLine.lastIndexOf(':');
  if (idx === -1) return { path: pathLine, line: undefined };
  const line = Number(pathLine.slice(idx + 1));
  if (Number.isNaN(line)) return { path: pathLine, line: undefined };
  return { path: pathLine.slice(0, idx), line };
}

function normalizeFinding(finding) {
  if (!finding || typeof finding !== 'object') return finding;
  const hasSeparateFields = finding.path !== undefined && finding.line !== undefined && finding.line !== null;
  if (hasSeparateFields) return finding;
  // finding.path may itself hold the combined "path:line" string (a naive
  // transcription that never split it out), or the combined string may be
  // sitting under the literal table-header key "Path:Line" (a transcription
  // that copied the markdown column header verbatim as the JSON key).
  const rawPathLine = finding.path !== undefined ? finding.path : finding['Path:Line'];
  const parsed = parsePathLine(rawPathLine);
  if (parsed.line === undefined) return finding;
  const severity = finding.severity !== undefined ? finding.severity : finding.Severity;
  return { ...finding, path: parsed.path, line: parsed.line, severity };
}

function findingsMatch(a, b, tolerance = LINE_TOLERANCE_REPRODUCTION) {
  const na = normalizeFinding(a);
  const nb = normalizeFinding(b);
  if (na.path !== nb.path) return false;
  if (Math.abs(na.line - nb.line) > tolerance) return false;
  return severityBucket(na.severity) === severityBucket(nb.severity);
}

function categoriseReproduction(agentAFindings, agentBFindings) {
  const confirmed = [];
  const unconfirmed = [];
  const matchedB = new Set();

  for (const rawFa of agentAFindings) {
    const fa = normalizeFinding(rawFa);
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

  agentBFindings.forEach((rawFb, i) => {
    if (!matchedB.has(i)) unconfirmed.push({ ...normalizeFinding(rawFb), source: 'B' });
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
      for (const rawFa of findingsByLens[lensA]) {
        for (const rawFb of findingsByLens[lensB]) {
          const fa = normalizeFinding(rawFa);
          const fb = normalizeFinding(rawFb);
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
  parsePathLine,
  normalizeFinding,
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
