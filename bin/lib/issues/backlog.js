// bin/lib/issues/backlog.js
// Pure: build GitHub issue payloads for the backlog, and
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
// Returns { title, body, labels } for a fresh parked issue (e.g. migrating a
// specs/backlog/{slug}.md entry with Stage: parked).
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

function labelNames(labels) {
  return (labels || []).map((l) => (typeof l === 'string' ? l : l.name)).filter(Boolean);
}

// issue: { number, title, labels, body, milestone, updatedAt, url } — shaped like
// `gh issue list --json number,title,labels,body,milestone,updatedAt,url` output.
// Returns { number, title, stage: 'inbox'|'parked', category, priority, milestone,
// watchedPaths, updatedAt, url } — category/priority/milestone/watchedPaths are null
// when absent.
function classifyBacklogIssue({ number, title, labels, body, milestone, updatedAt, url }) {
  const names = labelNames(labels);
  const stage = names.includes('parked') ? 'parked' : 'inbox';
  const categoryLabelName = names.find((n) => n.startsWith('backlog:category-'));
  const priorityLabelName = names.find((n) => n.startsWith('backlog:priority-'));
  return {
    number,
    title,
    stage,
    category: categoryLabelName ? categoryLabelName.slice('backlog:category-'.length) : null,
    priority: priorityLabelName ? priorityLabelName.slice('backlog:priority-'.length) : null,
    milestone: milestone ? milestone.title : null,
    watchedPaths: extractWatchedPaths(body),
    updatedAt,
    url,
  };
}

module.exports = { CATEGORIES, categoryLabel, inboxIssuePayload, parkedIssuePayload, extractWatchedPaths, classifyBacklogIssue };
