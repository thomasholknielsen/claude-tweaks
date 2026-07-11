'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { STALE_DAYS_LIGHT, STALE_DAYS_DEEP } = require('./score');

// ─── parseJourneyFiles ───────────────────────────────────────────────────────
// Extracts a journey file's `files:` frontmatter list, e.g.:
//   ---
//   files:
//     - src/checkout/Cart.tsx
//   ---
// Returns [] if there's no frontmatter, no `files:` key, or no list items —
// an unparseable header means "no declared domain," not an error.
function parseJourneyFiles(content) {
  const lines = content.split('\n');
  if (lines[0] !== '---') return [];
  const closeIdx = lines.indexOf('---', 1);
  if (closeIdx === -1) return [];
  const frontmatter = lines.slice(1, closeIdx);
  const filesIdx = frontmatter.findIndex((l) => /^files:\s*$/.test(l));
  if (filesIdx === -1) return [];
  const paths = [];
  for (let i = filesIdx + 1; i < frontmatter.length; i++) {
    const m = frontmatter[i].match(/^\s*-\s*(.+?)\s*$/);
    if (!m) break;
    paths.push(m[1]);
  }
  return paths;
}

// ─── listJourneys ────────────────────────────────────────────────────────────
// Returns [{ kind: 'journey', id, path, filesFrontmatter }] for each
// docs/journeys/*.md file, sorted by id. Empty array if the directory doesn't
// exist — a project with no journeys yet is a valid state, not an error.
function listJourneys(root) {
  const dir = path.join(root, 'docs', 'journeys');
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => {
      const filePath = path.join(dir, e.name);
      let content = '';
      try { content = fs.readFileSync(filePath, 'utf8'); } catch { /* unreadable -> no files */ }
      return { kind: 'journey', id: e.name.slice(0, -3), path: filePath, filesFrontmatter: parseJourneyFiles(content) };
    })
    .sort((a, b) => (a.id < b.id ? -1 : 1));
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
// opts: { now?: number, tier?: 'light'|'deep', signals?: { [id]: number } }
// Returns { kind: 'journey', id, path, filesFrontmatter, why: 'stale'|'hotspot', ... } or null.
// Light and deep tiers use independent staleness thresholds and independent
// cursor fields (lastLightAuditMs vs lastDeepAuditMs) — a journey force-picked
// as light-stale is not automatically deep-stale too, and vice versa.
function selectTarget(root, cursors, opts = {}) {
  const now = opts.now != null ? opts.now : Date.now();
  const tier = opts.tier === 'deep' ? 'deep' : 'light';
  const signals = opts.signals || null; // test injection hook — churn override by id
  const staleDays = tier === 'deep' ? STALE_DAYS_DEEP : STALE_DAYS_LIGHT;
  const auditField = tier === 'deep' ? 'lastDeepAuditMs' : 'lastLightAuditMs';

  const candidates = listJourneys(root);
  if (candidates.length === 0) return null;

  // Phase 1: force-pick any journey unaudited on this tier past staleDays.
  for (const candidate of candidates) {
    const cursor = cursors[candidate.id];
    const lastAuditedMs = cursor && cursor[auditField] != null ? cursor[auditField] : null;
    const daysSince = lastAuditedMs === null ? Infinity : (now - lastAuditedMs) / 86400000;
    if (daysSince > staleDays) {
      return { ...candidate, why: 'stale', daysSinceLastAudit: Number.isFinite(daysSince) ? Math.round(daysSince) : null };
    }
  }

  // Phase 2: among non-stale candidates, score by churn on filesFrontmatter
  // since last audit on this tier.
  const scored = [];
  for (const candidate of candidates) {
    const cursor = cursors[candidate.id] || {};
    const sinceMs = cursor[auditField] || 0;
    const churn = signals ? (signals[candidate.id] || 0) : domainChurn(root, candidate.filesFrontmatter, sinceMs);
    if (churn > 0) scored.push({ candidate, churn });
  }

  if (scored.length === 0) return null;
  scored.sort((a, b) => (b.churn !== a.churn ? b.churn - a.churn : (a.candidate.id < b.candidate.id ? -1 : 1)));
  return { ...scored[0].candidate, why: 'hotspot', churnCount: scored[0].churn };
}

module.exports = { parseJourneyFiles, listJourneys, domainChurn, selectTarget };
