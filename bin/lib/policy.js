// bin/lib/policy.js — reads flat dotted-key project policy from
// .claude-tweaks/policy.yml. No YAML dependency: the plugin ships zero
// runtime npm deps, and the only supported shape is a top-level
// `key.path: value` line, matching the convention already documented for
// other policies (e.g. issues.autonomous-eligibility).
'use strict';
const fs = require('fs');
const path = require('path');

function readPolicyFile(repoRoot) {
  try {
    return fs.readFileSync(path.join(repoRoot, '.claude-tweaks', 'policy.yml'), 'utf8');
  } catch {
    return null;
  }
}

function isWorktreeAlwaysOn(repoRoot) {
  const raw = readPolicyFile(repoRoot);
  if (!raw) return false;
  // Allow (and ignore) a trailing `# comment` after the value — policy.yml is
  // documented as hand-editable (skills/_shared/git-discipline.md,
  // skills/init/SKILL.md), and a user who hand-writes
  // `worktree.always: true  # enabled after the incident on 2026-07-10` must
  // not have that natural annotation silently read as policy-OFF.
  return raw.split('\n').some((line) => /^worktree\.always:\s*true(\s*#.*)?$/.test(line.trim()));
}

// `integration-branch: <name>` — where finished work lands. Unset on most
// projects, where each consumer falls back to the repository's own default
// branch. Trailing `# comment` tolerated, same as isWorktreeAlwaysOn.
function readIntegrationBranch(repoRoot) {
  const raw = readPolicyFile(repoRoot);
  if (!raw) return null;
  for (const line of raw.split('\n')) {
    const m = /^integration-branch:\s*([^\s#]+)(\s*#.*)?$/.exec(line.trim());
    if (m) return m[1];
  }
  return null;
}

// Generic single-line comma-separated list-key reader — the same convention
// already documented for merge-sensitive-paths (assess-agent-autonomy/
// SKILL.md): `key: a,b,c` on one line, trailing `# comment` tolerated. Empty
// or absent both return `[]` — a caller needing to distinguish "no value
// configured" from "configured empty" has nothing to distinguish, since a
// hand-written `key: ` line with nothing after the colon is indistinguishable
// from an absent key under this flat-file format. Used by any policy key
// typed `list` in bin/lib/policy-schema.js whose reader needs the parsed
// array rather than the raw string (candidates-experiment-cleanup.js's
// `experiment-flag-patterns` / `experiment-flag-exclude` is the first
// caller).
function readListKey(repoRoot, key) {
  const raw = readPolicyFile(repoRoot);
  if (!raw) return [];
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^${escapedKey}:\\s*([^#]*)`);
  for (const rawLine of raw.split('\n')) {
    const line = rawLine.trim();
    const m = re.exec(line);
    if (!m) continue;
    const value = m[1].trim();
    if (!value) return [];
    return value.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

module.exports = { isWorktreeAlwaysOn, readIntegrationBranch, readListKey };
