// bin/lib/issues/backlog.js
// Pure: build GitHub issue payloads for the backlog (INBOX/DEFERRED) system, and
// extract the Watched paths field back out of a parked issue's body. The SKILL.md
// runs gh and passes results back — no network here.
// Contract: skills/_shared/issue-claims.md; design doc:
// docs/superpowers/specs/2026-07-08-backlog-github-issues-design.md.
'use strict';

const CATEGORIES = ['product', 'technical', 'legal', 'infrastructure'];
const WATCHED_PATHS_RE = /^\*\*Watched paths:\*\*\s*(.+)$/m;

function categoryLabel(category) {
  return `backlog:category-${category}`;
}

// opts: { title, related, context, scope, category }
// Returns { title, body, labels } for a fresh inbox-stage issue.
function inboxIssuePayload({ title, related, context, scope, category }) {
  const body = [
    `**Related:** ${related || 'none'}`,
    '',
    `Context: ${context}`,
    '',
    `Scope: ${scope}`,
  ].join('\n');
  return { title, body, labels: ['backlog', categoryLabel(category)] };
}

// opts: { title, origin, context, trigger, optionsConsidered, category, watchedPaths? }
// watchedPaths, when a non-empty array, adds a **Watched paths:** field between
// Trigger and Options considered.
// Returns { title, body, labels } for a fresh parked issue (e.g. DEFERRED.md migration).
function parkedIssuePayload({ title, origin, context, trigger, optionsConsidered, category, watchedPaths }) {
  const lines = [
    `**Origin:** ${origin}`,
    '',
    `Context: ${context}`,
    '',
    `**Trigger:** ${trigger}`,
  ];
  if (Array.isArray(watchedPaths) && watchedPaths.length > 0) {
    lines.push('', `**Watched paths:** ${watchedPaths.join(', ')}`);
  }
  lines.push('', `Options considered: ${optionsConsidered}`);
  return { title, body: lines.join('\n'), labels: ['backlog', 'parked', categoryLabel(category)] };
}

// Extracts the **Watched paths:** field from a parked issue's body, comma-split and
// trimmed. Returns string[] or null when the field is absent or body isn't a string.
function extractWatchedPaths(body) {
  if (typeof body !== 'string') return null;
  const m = WATCHED_PATHS_RE.exec(body);
  if (!m) return null;
  return m[1].split(',').map((p) => p.trim()).filter(Boolean);
}

module.exports = { CATEGORIES, categoryLabel, inboxIssuePayload, parkedIssuePayload, extractWatchedPaths };
