// bin/lib/issues/record.js
// Pure: the unified work-record taxonomy and payload assembly — the code twin of
// skills/_shared/work-record.md. Every label-string literal used by the health
// skills, /capture, /specify, /triage, and /dispatch lives here; other modules
// import from this file rather than re-declaring their own copies. No network.
'use strict';

const ORIGINS = ['code-health', 'harness-health', 'journey-health', 'capture'];
const TYPES = ['bug', 'feature', 'task'];
const TIERS = ['low', 'medium', 'high'];
const PRIORITIES = ['high', 'medium', 'low'];

const LABELS = {
  READY: 'ready',
  PARKED: 'parked',
  AUTO_BUILD: 'auto:build',
  AUTO_MERGE: 'auto:merge',
  BOT_IN_PROGRESS: 'bot:in-progress',
  BOT_BLOCKED: 'bot:blocked',
  WONTFIX: 'wontfix',
};

// F8 from the program promise register — type:* label descriptions home
// (each <= 100 chars; used only when work-types: labels is configured).
const TYPE_LABELS = [
  ['type:bug', 'Type: a defect in existing behavior'],
  ['type:feature', 'Type: new capability or enhancement'],
  ['type:task', 'Type: maintenance, refactor, docs, or chore work'],
];

function oneOf(name, value, allowed) {
  if (!allowed.includes(value)) {
    throw new Error(`${name} must be one of ${allowed.join('|')} (got "${value}")`);
  }
}

// { title, body, type, origin?, risk?, effort?, ready?, parked?, priority?, fingerprint? }
// -> { title, body, labels: string[], type }
// Validates supplied enum values; absence of an optional field never throws.
function recordPayload({ title, body, type, origin, risk, effort, ready, parked, priority, fingerprint } = {}) {
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

  // Deterministic emission order: by:*, risk:*, effort:*, ready, parked, priority:*.
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

module.exports = { ORIGINS, TYPES, TIERS, PRIORITIES, LABELS, TYPE_LABELS, recordPayload };
