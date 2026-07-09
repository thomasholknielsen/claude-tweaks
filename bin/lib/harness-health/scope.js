'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { STALE_DAYS } = require('./score');

// ─── listSkills ──────────────────────────────────────────────────────────────
// Returns [{ kind: 'skill', id, path }] for each .claude/skills/*.md file,
// sorted by id. Empty array if the directory doesn't exist — a project with
// no generated skills yet is a valid state, not an error.
function listSkills(root) {
  const dir = path.join(root, '.claude', 'skills');
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => ({ kind: 'skill', id: e.name.slice(0, -3), path: path.join(dir, e.name) }))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

// ─── parseRulePaths ────────────────────────────────────────────────────────────
// Extracts a rule file's `paths:` frontmatter list, e.g.:
//   ---
//   paths:
//     - src/api/**
//   ---
// Returns [] if there's no frontmatter, no `paths:` key, or no list items —
// an unparseable header means "no declared domain," not an error.
function parseRulePaths(content) {
  const lines = content.split('\n');
  if (lines[0] !== '---') return [];
  const closeIdx = lines.indexOf('---', 1);
  if (closeIdx === -1) return [];
  const frontmatter = lines.slice(1, closeIdx);
  const pathsIdx = frontmatter.findIndex((l) => /^paths:\s*$/.test(l));
  if (pathsIdx === -1) return [];
  const globs = [];
  for (let i = pathsIdx + 1; i < frontmatter.length; i++) {
    const m = frontmatter[i].match(/^\s*-\s*(.+?)\s*$/);
    if (!m) break;
    globs.push(m[1]);
  }
  return globs;
}

// ─── listRules ───────────────────────────────────────────────────────────────
// Returns [{ kind: 'rule', id, path, pathGlobs }] for each .claude/rules/*.md
// file, sorted by id. pathGlobs is the parsed `paths:` frontmatter list (may
// be [] for an unparseable or absent header).
function listRules(root) {
  const dir = path.join(root, '.claude', 'rules');
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => {
      const filePath = path.join(dir, e.name);
      let content = '';
      try { content = fs.readFileSync(filePath, 'utf8'); } catch { /* unreadable -> no globs */ }
      return { kind: 'rule', id: e.name.slice(0, -3), path: filePath, pathGlobs: parseRulePaths(content) };
    })
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

// ─── listClaudeMd ──────────────────────────────────────────────────────────────
// Returns a single-item list, [{ kind: 'claude-md', id: 'CLAUDE', path }], if
// <root>/CLAUDE.md exists — [] otherwise. Not a rotation candidate among
// siblings of its own kind (there's only ever one project CLAUDE.md), but
// competes in the same unified pool as skills/rules for churn/staleness
// selection.
function listClaudeMd(root) {
  const filePath = path.join(root, 'CLAUDE.md');
  if (!fs.existsSync(filePath)) return [];
  return [{ kind: 'claude-md', id: 'CLAUDE', path: filePath }];
}

// ─── readDesignIntegrationFlag ─────────────────────────────────────────────
// Parses CLAUDE.md's `design-integration:` value. Returns 'disabled' when
// CLAUDE.md is missing/unreadable or the flag is absent — mirrors the design
// wrapper's own "missing flag = disabled" rule (skills/design/SKILL.md Layer 1).
function readDesignIntegrationFlag(root) {
  let content;
  try { content = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8'); } catch { return 'disabled'; }
  const m = content.match(/^design-integration:\s*(\S+)/m);
  return m ? m[1] : 'disabled';
}

// ─── DESIGN_DOMAIN_PATHS ────────────────────────────────────────────────────
// Frontend-signal git pathspecs, matching the file/directory signals /init's
// bootstrap uses for frontend detection. DESIGN.md documents the visual
// system, so churn here since its last regeneration is a meaningful
// staleness proxy.
const DESIGN_DOMAIN_PATHS = [
  '*.tsx', '*.jsx', '*.vue', '*.svelte', '*.css',
  'components/', 'pages/', 'app/', 'routes/', 'views/', 'ui/',
];

// ─── listDesignArtifacts ────────────────────────────────────────────────────
// Returns [{ kind: 'design-artifact', id: 'PRODUCT'|'DESIGN', path, pathGlobs }]
// for PRODUCT.md/DESIGN.md, gated on design-integration being exactly
// 'enabled' ('plugin-only' and 'disabled' both skip — matches the design
// wrapper's Layer 1). Resolves each file at the project root first, then
// docs/design/<filename>, then docs/<filename> as fallbacks (a deterministic
// equivalent of the LLM-oriented glob description in
// skills/design/modes/pre-build.md's own fallback discovery step). A file
// absent at every location is simply omitted — not an error, not a finding.
// pathGlobs reuses the same field name (and, in selectTarget, the same
// domain-path branch) as a rule's pathGlobs — see selectTarget below.
function listDesignArtifacts(root) {
  if (readDesignIntegrationFlag(root) !== 'enabled') return [];

  const candidates = [
    { id: 'PRODUCT', filename: 'PRODUCT.md', pathGlobs: [] },
    { id: 'DESIGN', filename: 'DESIGN.md', pathGlobs: DESIGN_DOMAIN_PATHS },
  ];

  const results = [];
  for (const c of candidates) {
    const searchPaths = [
      path.join(root, c.filename),
      path.join(root, 'docs', 'design', c.filename),
      path.join(root, 'docs', c.filename),
    ];
    const resolved = searchPaths.find((p) => fs.existsSync(p));
    if (resolved) {
      results.push({ kind: 'design-artifact', id: c.id, path: resolved, pathGlobs: c.pathGlobs });
    }
  }
  return results;
}

// ─── listTargets ────────────────────────────────────────────────────────────
// Aggregates listSkills + listRules + listClaudeMd + listDesignArtifacts into
// one flat pool for the unified rotation/selection algorithm.
function listTargets(root) {
  return [...listSkills(root), ...listRules(root), ...listClaudeMd(root), ...listDesignArtifacts(root)];
}

// ─── extractDomainPaths ────────────────────────────────────────────────────────
// Mechanical proxy for "what this document documents": backtick-quoted strings
// that look like a file path (no whitespace, a dot-extension, AND a slash).
// Deliberately NOT prose understanding — that's the LLM judge's job, not the
// engine's. Reused unchanged for skills and CLAUDE.md; rules prefer their own
// parsed pathGlobs (a precise, structured signal) when present.
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
// relPaths may be exact file paths (skills, CLAUDE.md's extracted references)
// or glob pathspecs (a rule's pathGlobs) — git's pathspec matching accepts
// both.
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
// opts: { now?: number, signals?: { [kind:id]: number }, kind?: string }
// Returns { kind, id, path, why: 'stale' | 'hotspot' } or null. Cursor and
// signal lookups are namespaced as `${kind}:${id}` so a skill and a rule that
// happen to share a bare id never collide.
function selectTarget(root, cursors, opts = {}) {
  const now = opts.now != null ? opts.now : Date.now();
  const signals = opts.signals || null; // test injection hook — churn override by "kind:id" key
  const kindFilter = opts.kind || null;

  let candidates = listTargets(root);
  if (kindFilter) candidates = candidates.filter((c) => c.kind === kindFilter);
  if (candidates.length === 0) return null;

  // Phase 1: force-pick any target unaudited past STALE_DAYS.
  for (const candidate of candidates) {
    const key = `${candidate.kind}:${candidate.id}`;
    const cursor = cursors[key];
    const lastAuditedMs = cursor && cursor.lastAuditedMs != null ? cursor.lastAuditedMs : null;
    const daysSince = lastAuditedMs === null ? Infinity : (now - lastAuditedMs) / 86400000;
    if (daysSince > STALE_DAYS) {
      return { ...candidate, why: 'stale', daysSinceLastAudit: Number.isFinite(daysSince) ? Math.round(daysSince) : null };
    }
  }

  // Phase 2: among non-stale candidates, score by domain churn since last audit.
  const scored = [];
  for (const candidate of candidates) {
    const key = `${candidate.kind}:${candidate.id}`;
    const cursor = cursors[key] || {};
    const sinceMs = cursor.lastAuditedMs || 0;
    let churn;
    if (signals) {
      churn = signals[key] || 0;
    } else {
      let content;
      try { content = fs.readFileSync(candidate.path, 'utf8'); } catch { content = ''; }
      const domainPaths = (candidate.kind === 'rule' || candidate.kind === 'design-artifact') && candidate.pathGlobs && candidate.pathGlobs.length > 0
        ? candidate.pathGlobs
        : extractDomainPaths(content);
      churn = domainChurn(root, domainPaths, sinceMs);
    }
    if (churn > 0) scored.push({ candidate, churn });
  }

  if (scored.length === 0) return null;
  scored.sort((a, b) => (b.churn !== a.churn ? b.churn - a.churn : (a.candidate.id < b.candidate.id ? -1 : 1)));
  return { ...scored[0].candidate, why: 'hotspot', churnCount: scored[0].churn };
}

module.exports = {
  listSkills, parseRulePaths, listRules, listClaudeMd, listTargets,
  extractDomainPaths, domainChurn, selectTarget,
  readDesignIntegrationFlag, listDesignArtifacts,
};
