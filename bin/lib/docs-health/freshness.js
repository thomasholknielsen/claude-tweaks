'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { parseFrontmatterListField } = require('../health-core/frontmatter-list');

// Parses a doc's `files:` frontmatter list (repo-relative dependency
// paths) — reuses journey docs' existing `files:` field/shape (see
// journeys/journey-template.md's regression-detection use) rather than
// introducing a competing field name for a near-identical concept.
// Returns [] when absent or the doc has no frontmatter at all. Thin wrapper
// over the shared parser (bin/lib/health-core/frontmatter-list.js), which
// also backs harness-health/scope.js's parseRulePaths and journey-health/
// scope.js's parseJourneyFiles — same bullet-list shape, different
// frontmatter key.
function parseFilesField(content) {
  return parseFrontmatterListField(content, 'files');
}

// For each files: dependency: does it exist (missing = its own staleness
// signal), and has it changed more recently than sinceTimestamp (the
// doc's last-audit cursor, epoch ms, or null if never audited — nothing
// is flagged stale against a null baseline)? Mechanical signal only — the
// JUDGE step in docs-health/SKILL.md decides whether a flagged change is
// substantive enough to matter.
function checkTrackedFreshness(content, root, sinceTimestamp) {
  const files = parseFilesField(content);
  const missing = [];
  const stale = [];
  for (const relPath of files) {
    const absPath = path.join(root, relPath);
    if (!fs.existsSync(absPath)) {
      missing.push(relPath);
      continue;
    }
    let lastChangedMs = null;
    try {
      const out = execFileSync(
        'git', ['-C', root, 'log', '-1', '--format=%ct', '--', relPath],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 30000 },
      ).trim();
      if (out) lastChangedMs = parseInt(out, 10) * 1000;
    } catch {
      lastChangedMs = null;
    }
    if (lastChangedMs !== null && sinceTimestamp !== null && lastChangedMs > sinceTimestamp) {
      stale.push({ path: relPath, lastChangedMs });
    }
  }
  return { stale, missing };
}

module.exports = { parseFilesField, checkTrackedFreshness };
