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

function severityBucket(severity) {
  // Case-insensitive: a dispatched agent's transcription may capitalize the
  // severity value (normalizeFinding's own header-key handling below already
  // anticipates a capitalized "Severity" table-header key, so a capitalized
  // *value* like "Critical" is an equally realistic input shape). Without
  // lowercasing first, 'Critical' misses every key in SEVERITY_BUCKETS (which
  // is all-lowercase) and silently falls into the 'low' bucket regardless of
  // its real severity.
  if (typeof severity !== 'string') return 'low';
  return SEVERITY_BUCKETS[severity.toLowerCase()] || 'low';
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
  const lineStr = pathLine.slice(idx + 1);
  // An empty (or whitespace-only) trailing segment — e.g. "src/auth.ts:" with
  // no line number after the colon — must resolve to "no line", not 0.
  // Number("") and Number(" ") both coerce to 0 in JS (not NaN), which would
  // otherwise silently produce a real, matchable line number out of a
  // location nobody actually reported.
  if (lineStr.trim() === '') return { path: pathLine, line: undefined };
  const line = Number(lineStr);
  if (Number.isNaN(line)) return { path: pathLine, line: undefined };
  return { path: pathLine.slice(0, idx), line };
}

function normalizeFinding(finding) {
  if (!finding || typeof finding !== 'object') return finding;
  // `.line` must actually be a real, finite number for the "already split"
  // fast path to be trusted — a non-numeric leftover (e.g. `line: 'n/a'`)
  // must NOT short-circuit here, or the garbage value survives untouched
  // into findingsMatch's guard below.
  const hasNumericLine = typeof finding.line === 'number' && !Number.isNaN(finding.line);
  const hasSeparateFields = finding.path !== undefined && hasNumericLine;
  if (hasSeparateFields) return finding;
  // finding.path may itself hold the combined "path:line" string (a naive
  // transcription that never split it out), or the combined string may be
  // sitting under the literal table-header key "Path:Line" (a transcription
  // that copied the markdown column header verbatim as the JSON key).
  const rawPathLine = finding.path !== undefined ? finding.path : finding['Path:Line'];
  const parsed = parsePathLine(rawPathLine);
  const severity = finding.severity !== undefined ? finding.severity : finding.Severity;
  if (parsed.line === undefined) {
    // No usable location could be recovered — either the combined-string
    // parse failed, or `.line` held a non-numeric value with no colon-
    // embedded fallback in `.path`. Explicitly clear `.line` (rather than
    // leaving whatever garbage was there) so downstream guards see this as
    // unlocated instead of quietly falling through with a value that looks
    // present but isn't a real number.
    return { ...finding, line: undefined, severity };
  }
  return { ...finding, path: parsed.path, line: parsed.line, severity };
}

// Shared "do these two normalized findings refer to the same location?"
// guard, used by both findingsMatch and detectCrossLensOverlap. A finding
// with no known, numeric location can never be judged to match another by
// location — without these explicit checks, `undefined !== undefined`
// (false) and `NaN > tolerance` / `NaN <= tolerance` (also false) all fail
// to short-circuit, so two entirely unrelated, unlocated findings would
// fall through and spuriously "match".
function sameLocation(na, nb, tolerance) {
  if (!na || typeof na !== 'object' || !nb || typeof nb !== 'object') return false;
  if (na.path === undefined || nb.path === undefined) return false;
  if (typeof na.line !== 'number' || typeof nb.line !== 'number') return false;
  if (Number.isNaN(na.line) || Number.isNaN(nb.line)) return false;
  if (na.path !== nb.path) return false;
  return Math.abs(na.line - nb.line) <= tolerance;
}

function findingsMatch(a, b, tolerance = LINE_TOLERANCE_REPRODUCTION) {
  const na = normalizeFinding(a);
  const nb = normalizeFinding(b);
  if (!sameLocation(na, nb, tolerance)) return false;
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
          if (sameLocation(fa, fb, LINE_TOLERANCE_DEBATE)) {
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

// Sibling to resolveDebate, not an overload of it — the input/output shape
// differs on purpose. resolveDebate reconciles two judges into one of three
// buckets (confirmed/unconfirmed/contested); resolveRefutation takes a
// single verdict from one falsification agent and only ever moves a finding
// one direction: a `confirmed` finding that survives refutation stays
// `confirmed`, one that gets refuted downgrades to `unconfirmed`. There is
// no "contested" outcome here — a single agent's verdict has no second
// judge to disagree with. Ambiguity fails toward more scrutiny, not less —
// matching resolveDebate's own conservative default: only the exact literal
// 'not-refuted' keeps a finding confirmed. 'refuted', a missing/empty
// verdict, or any other malformed string (e.g. from a failed or BLOCKED
// dispatch) all downgrade to 'unconfirmed' — a failed refutation attempt
// must never be indistinguishable from a genuine "stands as confirmed."
function resolveRefutation(verdict) {
  return verdict === 'not-refuted' ? 'confirmed' : 'unconfirmed';
}

function buildReproductionDispatch(taskScope, profile = 'Standard') {
  const prompt = `${taskScope}\n\n[Use: ${profile}] (contract § Model Selection — reproduction agent, independent run)`;
  return {
    profile,
    agentCount: REPRODUCTION_AGENT_COUNT,
    agents: [
      { role: 'reproducer-A', prompt },
      { role: 'reproducer-B', prompt },
    ],
  };
}

function buildDebateDispatch(contestedFinding, profile = 'Capable') {
  const prompt =
    `Review this finding and reply with verdict ('agree' / 'disagree' / 'partial') ` +
    `then one paragraph of reasoning:\n\n${JSON.stringify(contestedFinding)}\n\n` +
    `[Use: ${profile}] (contract § Model Selection — debate agent)`;
  return {
    profile,
    agentCount: DEBATE_AGENT_COUNT,
    rounds: 1,
    agents: [
      { role: 'debater-A', prompt },
      { role: 'debater-B', prompt },
    ],
  };
}

function buildRedTeamDispatch(specContent, profile = 'Standard') {
  return {
    profile,
    agentCount: RED_TEAM_PERSONAS.length,
    agents: RED_TEAM_PERSONAS.map((p) => ({
      role: p.name,
      prompt: `${p.lens}\n\nSpec under review:\n\n${specContent}\n\n[Use: ${profile}] (contract § Model Selection — ${p.name} persona)`,
    })),
  };
}

module.exports = {
  // Constants
  LINE_TOLERANCE_REPRODUCTION,
  LINE_TOLERANCE_DEBATE,
  REPRODUCTION_AGENT_COUNT,
  DEBATE_AGENT_COUNT,
  RED_TEAM_PERSONAS,
  // Comparison / aggregation logic
  severityBucket,
  parsePathLine,
  normalizeFinding,
  sameLocation,
  findingsMatch,
  categoriseReproduction,
  detectCrossLensOverlap,
  resolveDebate,
  resolveRefutation,
  // Dispatch shape builders (pure data — no actual Task() calls)
  buildReproductionDispatch,
  buildDebateDispatch,
  buildRedTeamDispatch,
};
