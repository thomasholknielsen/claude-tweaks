'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { STALE_DAYS } = require('./score');
const { parseFilesField } = require('./freshness');

// Directory names excluded when they sit directly under docs/ — ephemeral
// /specify + /superpowers:writing-plans build artifacts (specs, plans), not
// Diátaxis-portal content. Not a recursive-anywhere exclusion: only
// docs/superpowers itself is skipped, not any nested "superpowers" dir
// deeper in the tree (there shouldn't be one, but this keeps the rule
// narrow and explicit rather than accidentally over-broad).
const EXCLUDE_TOP_LEVEL_DIRS = new Set(['superpowers']);

// ─── listDocs ────────────────────────────────────────────────────────────
// Recursively walks docs/**, returning [{ kind: 'doc', id, path }] for
// every .md file, sorted by id. id is the path relative to docs/,
// forward-slashed, without the .md extension — e.g.
// docs/decisions/0007-foo.md -> "decisions/0007-foo". Skips
// docs/superpowers/** and any dotfile directory. [] if docs/ doesn't exist
// — a project with no docs/ tree yet is a valid state, not an error.
//
// Structurally never returns anything under .claude/skills/**,
// .claude/rules/**, or a project-root CLAUDE.md — this walker only ever
// descends into docs/, so harness-health's exclusive territory is excluded
// by construction, not by an explicit skip rule.
function walk(dir, docsRoot, out) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (dir === docsRoot && EXCLUDE_TOP_LEVEL_DIRS.has(entry.name)) continue;
      walk(full, docsRoot, out);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      const rel = path.relative(docsRoot, full).split(path.sep).join('/').replace(/\.md$/, '');
      out.push({ kind: 'doc', id: rel, path: full });
    }
  }
}

function listDocs(root) {
  const docsRoot = path.join(root, 'docs');
  const out = [];
  walk(docsRoot, docsRoot, out);
  return out.sort((a, b) => (a.id < b.id ? -1 : 1));
}

// ─── extractDomainPaths ────────────────────────────────────────────────────
// Mechanical proxy for "what this doc references": backtick-quoted strings
// that look like a file path (no whitespace, a dot-extension, AND a
// slash). Deliberately NOT prose understanding — that's the LLM judge's
// job, not the engine's.
function extractDomainPaths(content) {
  const matches = content.match(/`([^`\s]+\.[a-zA-Z0-9]+)`/g) || [];
  const paths = matches.map((m) => m.slice(1, -1)).filter((p) => p.includes('/'));
  return [...new Set(paths)];
}

// ─── domainChurn ─────────────────────────────────────────────────────────────
// Count commits touching any of `relPaths` since `sinceMs` (epoch ms).
// Returns 0 (not an error) when git is unavailable, paths don't exist, or
// there is no churn.
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
// Returns { kind: 'doc', id, path, why: 'stale' | 'hotspot' } or null.
// Cursor key is namespaced "doc:<id>" throughout, matching harness-health's
// "${kind}:${id}" convention (docs-health has a single kind, so the prefix
// is a fixed literal rather than a variable).
function selectTarget(root, cursors, opts = {}) {
  const now = opts.now != null ? opts.now : Date.now();
  const signals = opts.signals || null; // test injection hook — churn override by "doc:<id>" key

  const candidates = listDocs(root);
  if (candidates.length === 0) return null;

  // Phase 1: force-pick any doc unaudited past STALE_DAYS.
  for (const candidate of candidates) {
    const key = `doc:${candidate.id}`;
    const cursor = cursors[key];
    const lastAuditedMs = cursor && cursor.lastAuditedMs != null ? cursor.lastAuditedMs : null;
    const daysSince = lastAuditedMs === null ? Infinity : (now - lastAuditedMs) / 86400000;
    if (daysSince > STALE_DAYS) {
      return { ...candidate, why: 'stale', daysSinceLastAudit: Number.isFinite(daysSince) ? Math.round(daysSince) : null };
    }
  }

  // Phase 2: among non-stale candidates, score by churn since last audit —
  // the doc's own referenced paths (extractDomainPaths) UNION the doc
  // file's own path, so editing the doc itself also counts (a doc that
  // changed a lot recently is itself a drift risk, independent of what it
  // references).
  const scored = [];
  for (const candidate of candidates) {
    const key = `doc:${candidate.id}`;
    const cursor = cursors[key] || {};
    const sinceMs = cursor.lastAuditedMs || 0;
    let churn;
    if (signals) {
      churn = signals[key] || 0;
    } else {
      let content;
      try { content = fs.readFileSync(candidate.path, 'utf8'); } catch { content = ''; }
      const relDocPath = path.relative(root, candidate.path).split(path.sep).join('/');
      const declaredPaths = parseFilesField(content);
      const domainPaths = declaredPaths.length > 0 ? declaredPaths : extractDomainPaths(content);
      churn = domainChurn(root, [relDocPath, ...domainPaths], sinceMs);
    }
    if (churn > 0) scored.push({ candidate, churn });
  }

  if (scored.length === 0) return null;
  scored.sort((a, b) => (b.churn !== a.churn ? b.churn - a.churn : (a.candidate.id < b.candidate.id ? -1 : 1)));
  return { ...scored[0].candidate, why: 'hotspot', churnCount: scored[0].churn };
}

module.exports = { listDocs, extractDomainPaths, domainChurn, selectTarget };
