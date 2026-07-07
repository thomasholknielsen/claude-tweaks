'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { STALE_DAYS } = require('./score');

// ─── listSkills ──────────────────────────────────────────────────────────────
// Returns [{ id, path }] for each .claude/skills/*.md file, sorted by id.
// Empty array if the directory doesn't exist — a project with no generated
// skills yet is a valid state, not an error.
function listSkills(root) {
  const dir = path.join(root, '.claude', 'skills');
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => ({ id: e.name.slice(0, -3), path: path.join(dir, e.name) }))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

// ─── extractDomainPaths ──────────────────────────────────────────────────────
// Mechanical proxy for "what this skill documents": backtick-quoted strings
// that look like a file path (no whitespace, a dot-extension, AND a slash).
// Deliberately NOT prose understanding — that's the LLM judge's job, not the
// engine's.
function extractDomainPaths(content) {
  const matches = content.match(/`([^`\s]+\.[a-zA-Z0-9]+)`/g) || [];
  const paths = matches
    .map((m) => m.slice(1, -1))
    .filter((p) => p.includes('/'));
  return [...new Set(paths)];
}

// ─── domainChurn ─────────────────────────────────────────────────────────────
// Count commits touching any of `relPaths` since `sinceMs` (epoch ms). Returns
// 0 (not an error) when git is unavailable, paths don't exist, or there is no
// churn — the caller treats 0 as "nothing changed," not a failure signal.
function domainChurn(root, relPaths, sinceMs) {
  if (!relPaths || relPaths.length === 0) return 0;
  try {
    const since = new Date(sinceMs || 0).toISOString().slice(0, 10);
    const out = execFileSync(
      'git',
      ['-C', root, 'log', '--oneline', `--since=${since}`, '--', ...relPaths],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    return out.split('\n').filter(Boolean).length;
  } catch {
    return 0;
  }
}

// ─── selectTarget ────────────────────────────────────────────────────────────
// opts: { now?: number, signals?: { [id]: number } }
// Returns { id, path, why: 'stale' | 'hotspot' } or null.
function selectTarget(root, cursors, opts = {}) {
  const now = opts.now != null ? opts.now : Date.now();
  const signals = opts.signals || null; // test injection hook — churn override by skill id

  const candidates = listSkills(root);
  if (candidates.length === 0) return null;

  // Phase 1: force-pick any skill unaudited past STALE_DAYS.
  for (const skill of candidates) {
    const cursor = cursors[skill.id];
    const lastAuditedMs = cursor && cursor.lastAuditedMs != null ? cursor.lastAuditedMs : null;
    const daysSince = lastAuditedMs === null ? Infinity : (now - lastAuditedMs) / 86400000;
    if (daysSince > STALE_DAYS) {
      return { ...skill, why: 'stale' };
    }
  }

  // Phase 2: among non-stale candidates, score by domain churn since last audit.
  const scored = [];
  for (const skill of candidates) {
    const cursor = cursors[skill.id] || {};
    const sinceMs = cursor.lastAuditedMs || 0;
    let churn;
    if (signals) {
      churn = signals[skill.id] || 0;
    } else {
      let content;
      try { content = fs.readFileSync(skill.path, 'utf8'); } catch { content = ''; }
      const domainPaths = extractDomainPaths(content);
      churn = domainChurn(root, domainPaths, sinceMs);
    }
    if (churn > 0) scored.push({ skill, churn });
  }

  if (scored.length === 0) return null;
  scored.sort((a, b) => (b.churn !== a.churn ? b.churn - a.churn : (a.skill.id < b.skill.id ? -1 : 1)));
  return { ...scored[0].skill, why: 'hotspot' };
}

module.exports = { listSkills, extractDomainPaths, domainChurn, selectTarget };
