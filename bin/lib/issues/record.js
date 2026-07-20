// bin/lib/issues/record.js
// Pure: the unified work-record taxonomy and payload assembly — the code twin of
// skills/_shared/work-record.md. Every label-string literal used by the health
// skills, /capture, /specify, /triage, and /dispatch lives here; other modules
// import from this file rather than re-declaring their own copies. No network.
'use strict';

const ORIGINS = ['code-health', 'harness-health', 'journey-health', 'docs-health', 'capture'];
const TYPES = ['bug', 'feature', 'task'];
const TIERS = ['low', 'medium', 'high'];
const PRIORITIES = ['high', 'medium', 'low'];
const CEREMONY_TIERS = ['fast-lane', 'standard'];

const LABELS = {
  READY: 'ready',
  PARKED: 'parked',
  AUTO_BUILD: 'auto:build',
  AUTO_MERGE: 'auto:merge',
  BOT_IN_PROGRESS: 'bot:in-progress',
  BOT_BLOCKED: 'bot:blocked',
  WONTFIX: 'wontfix',
  DEMO_PENDING: 'demo:pending',
  DEMO_APPROVED: 'demo:approved',
  DEMO_CHANGES_REQUESTED: 'demo:changes-requested',
};

// F8 from the program promise register — type:* label descriptions home
// (each <= 100 chars; used only when work-types: labels is configured).
const TYPE_LABELS = [
  ['type:bug', 'Type: a defect in existing behavior'],
  ['type:feature', 'Type: new capability or enhancement'],
  ['type:task', 'Type: maintenance, refactor, docs, or chore work'],
];

// Dual-write fingerprint markers: FP_RE_WORK is the current marker written by
// recordPayload(); FP_RE_LEGACY is the pre-work-record marker still present on older
// issues during the migration window, read from all three health producers
// (skills/_shared/work-record.md).
const FP_RE_WORK = /<!--\s*work-fingerprint:\s*([^\s>]+)\s*-->/;
const FP_RE_LEGACY = /<!--\s*(?:code-health|harness-health|journey-health)-fingerprint:\s*([^\s>]+)\s*-->/;

// Line-anchored 'Blocked by #N' dependency declarations (multiline).
const DEP_RE = /^Blocked by #(\d+)\b/gm;

// Line-anchored 'Blocked by #N: {text}' assumption declarations (multiline) —
// a separate, additive sibling to DEP_RE/parseDependencies below, never a
// modification of either. DEP_RE already stops matching at the number, so a
// trailing ': {text}' parses under it with zero changes; this regex only
// exists to capture that trailing text when a caller wants it.
const DEP_ASSUMPTION_RE = /^Blocked by #(\d+):[ \t]*(.+)$/gm;

const BY_RE = /^by:(.+)$/;
const RISK_LABEL_RE = /^risk:(.+)$/;
const EFFORT_LABEL_RE = /^effort:(.+)$/;
const PRIORITY_LABEL_RE = /^priority:(.+)$/;
const CEREMONY_LABEL_RE = /^ceremony:(.+)$/;

function oneOf(name, value, allowed) {
  if (!allowed.includes(value)) {
    throw new Error(`${name} must be one of ${allowed.join('|')} (got "${value}")`);
  }
}

// { title, body, type, origin?, risk?, effort?, ceremony?, ready?, parked?, priority?, fingerprint? }
// -> { title, body, labels: string[], type }
// Validates supplied enum values; absence of an optional field never throws.
function recordPayload({ title, body, type, origin, risk, effort, ceremony, ready, parked, priority, fingerprint } = {}) {
  if (typeof title !== 'string' || !title) {
    throw new Error(`title must be a non-empty string (got ${typeof title})`);
  }
  if (typeof body !== 'string') {
    throw new Error(`body must be a string (got ${typeof body})`);
  }
  oneOf('type', type, TYPES);

  if (ready && parked) {
    throw new Error('a record cannot be both ready and parked');
  }

  // Deterministic emission order: by:*, risk:*, effort:*, ceremony:*, ready, parked, priority:*.
  const labels = [];

  if (origin !== undefined) {
    oneOf('origin', origin, ORIGINS);
    labels.push(`by:${origin}`);
  }
  if (risk !== undefined) {
    oneOf('risk', risk, TIERS);
    labels.push(`risk:${risk}`);
  }
  if (effort !== undefined) {
    oneOf('effort', effort, TIERS);
    labels.push(`effort:${effort}`);
  }
  if (ceremony !== undefined) {
    oneOf('ceremony', ceremony, CEREMONY_TIERS);
    labels.push(`ceremony:${ceremony}`);
  }
  if (ready) labels.push(LABELS.READY);
  if (parked) labels.push(LABELS.PARKED);
  if (priority !== undefined) {
    oneOf('priority', priority, PRIORITIES);
    labels.push(`priority:${priority}`);
  }

  const finalBody = fingerprint
    ? `${body}\n\n<!-- work-fingerprint: ${fingerprint} -->`
    : body;

  return { title, body: finalBody, labels, type };
}

// body -> fingerprint string, or null when neither marker is present (also null
// for null/undefined/empty body). The new work-fingerprint marker wins whenever
// both the new and legacy markers are present, regardless of which appears first
// in the body (dual-write/migration period).
function extractFingerprint(body) {
  if (typeof body !== 'string' || !body) return null;
  const work = FP_RE_WORK.exec(body);
  if (work) return work[1];
  const legacy = FP_RE_LEGACY.exec(body);
  return legacy ? legacy[1] : null;
}

// Same label normalization as tier.js/ingest.js: accept strings or {name} objects.
function normalizeLabelNames(labels) {
  return (labels || []).map((l) => (typeof l === 'string' ? l : l.name)).filter(Boolean);
}

// labels (string[] | {name}[]) -> the full record-facet shape. Explicit false/null
// defaults are set first and only ever flipped/assigned as matching labels are found
// in a single pass over the normalized names — never inferred from truthiness. Stage
// precedence is ready > parked > backlog regardless of array order or malformed
// combinations (e.g. both 'ready' and 'parked' present resolves to 'ready').
// Acceptance has no such precedence — the three demo:* labels are mutually exclusive
// by construction, so a plain last-match-in-array-wins assignment (same style as
// origin/risk/effort/priority below) is enough.
function parseRecordFacets(labels) {
  const names = normalizeLabelNames(labels);

  const facets = {
    origin: null,
    risk: null,
    effort: null,
    ceremony: null,
    priority: null,
    stage: 'backlog',
    grants: { build: false, merge: false },
    bot: { inProgress: false, blocked: false },
    acceptance: null,
  };

  for (const name of names) {
    if (name === LABELS.READY) {
      facets.stage = 'ready';
      continue;
    }
    if (name === LABELS.PARKED) {
      if (facets.stage !== 'ready') facets.stage = 'parked';
      continue;
    }
    if (name === LABELS.AUTO_BUILD) {
      facets.grants.build = true;
      continue;
    }
    if (name === LABELS.AUTO_MERGE) {
      facets.grants.merge = true;
      continue;
    }
    if (name === LABELS.BOT_IN_PROGRESS) {
      facets.bot.inProgress = true;
      continue;
    }
    if (name === LABELS.BOT_BLOCKED) {
      facets.bot.blocked = true;
      continue;
    }
    if (name === LABELS.DEMO_PENDING) {
      facets.acceptance = 'pending';
      continue;
    }
    if (name === LABELS.DEMO_APPROVED) {
      facets.acceptance = 'approved';
      continue;
    }
    if (name === LABELS.DEMO_CHANGES_REQUESTED) {
      facets.acceptance = 'changes-requested';
      continue;
    }

    const by = BY_RE.exec(name);
    if (by && ORIGINS.includes(by[1])) {
      facets.origin = by[1];
      continue;
    }
    const risk = RISK_LABEL_RE.exec(name);
    if (risk && TIERS.includes(risk[1])) {
      facets.risk = risk[1];
      continue;
    }
    const effort = EFFORT_LABEL_RE.exec(name);
    if (effort && TIERS.includes(effort[1])) {
      facets.effort = effort[1];
      continue;
    }
    const ceremony = CEREMONY_LABEL_RE.exec(name);
    if (ceremony && CEREMONY_TIERS.includes(ceremony[1])) {
      facets.ceremony = ceremony[1];
      continue;
    }
    const priority = PRIORITY_LABEL_RE.exec(name);
    if (priority && PRIORITIES.includes(priority[1])) {
      facets.priority = priority[1];
      continue;
    }
  }

  return facets;
}

// body -> deduped array of issue numbers from line-anchored 'Blocked by #N' lines,
// in order of first appearance. Mid-line occurrences (not at line start) don't
// count as a dependency declaration. DEP_RE carries the 'g' flag but matchAll
// clones it internally per call, so lastIndex state is never shared across calls.
function parseDependencies(body) {
  if (typeof body !== 'string' || !body) return [];
  const seen = new Set();
  const result = [];
  for (const match of body.matchAll(DEP_RE)) {
    const n = Number(match[1]);
    if (!seen.has(n)) {
      seen.add(n);
      result.push(n);
    }
  }
  return result;
}

// candidate issue numbers -> one batched, aliased GraphQL query requesting each
// candidate's native blockedBy connection (work-links: native). GraphQL aliases
// can't start with a digit, hence the 'i' prefix. Returns null for an empty or
// non-array input — nothing to query, and an empty repository{} selection set
// would be invalid GraphQL.
function buildNativeDependencyQuery(numbers) {
  if (!Array.isArray(numbers) || numbers.length === 0) return null;
  const fields = numbers
    .map((n) => `i${n}: issue(number:${n}){ number blockedBy(first:25){ nodes{ number state } } }`)
    .join('\n      ');
  return `query($owner:String!,$repo:String!){\n  repository(owner:$owner,name:$repo){\n      ${fields}\n  }\n}`;
}

// one candidate's parsed aliased response value (the { number, blockedBy: { nodes } }
// shape buildNativeDependencyQuery's query produces per alias) -> true when at least
// one blockedBy node is still OPEN. Mirrors parseDependencies' role for the
// work-links: body-text case, but judges a single already-parsed node instead of
// scanning body text for every candidate at once.
function hasOpenNativeBlocker(issueNode) {
  const nodes = issueNode && issueNode.blockedBy && issueNode.blockedBy.nodes;
  if (!Array.isArray(nodes)) return false;
  return nodes.some((n) => n && n.state === 'OPEN');
}

// body -> array of {number, assumption} for every line-anchored
// 'Blocked by #N: {text}' declaration, in order of appearance. A bare
// 'Blocked by #N' line (no colon) contributes nothing here — parseDependencies
// above is still the only reader of bare dependency lines. Not deduped by
// number: a caller writing the same N twice with different text gets both
// entries back, same as matchAll would naturally produce.
function parseDependencyAssumptions(body) {
  if (typeof body !== 'string' || !body) return [];
  const result = [];
  for (const match of body.matchAll(DEP_ASSUMPTION_RE)) {
    result.push({ number: Number(match[1]), assumption: match[2] });
  }
  return result;
}

// Compose the spec-shaped body the gate's structural check re-verifies
// (skills/_shared/work-record.md: Current State / Deliverables / Acceptance Criteria
// present and non-empty). Owning the skeleton here means the three health builders
// cannot drift a section heading or the footer sentence independently. Sections accept
// a string or an array of strings (arrays render as blank-line-separated blocks).
// recordPayload still appends the work-fingerprint marker afterward, as before.
function specShapedBody({ header, currentState, deliverables, acceptanceCriteria, filedBy }) {
  const isEmpty = (value) => value === undefined || value === null || value === ''
    || (Array.isArray(value) && value.length === 0);
  const sections = [
    ['header', header],
    ['currentState', currentState],
    ['deliverables', deliverables],
    ['acceptanceCriteria', acceptanceCriteria],
    ['filedBy', filedBy],
  ];
  for (const [name, value] of sections) {
    if (isEmpty(value)) {
      throw new Error(`specShapedBody: ${name} is required and must be non-empty`);
    }
  }
  const block = (v) => (Array.isArray(v) ? v.join('\n\n') : v);
  return [
    header,
    '## Current State',
    block(currentState),
    '## Deliverables',
    block(deliverables),
    '## Acceptance Criteria',
    block(acceptanceCriteria),
    `_Filed by \`${filedBy}\`. Close to resolve; label \`wontfix\` to suppress future reports of this finding._`,
  ].join('\n\n');
}

module.exports = {
  ORIGINS, TYPES, TIERS, PRIORITIES, LABELS, TYPE_LABELS, recordPayload, specShapedBody,
  FP_RE_WORK, FP_RE_LEGACY, extractFingerprint, parseRecordFacets, parseDependencies,
  parseDependencyAssumptions, buildNativeDependencyQuery, hasOpenNativeBlocker,
};
