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
  return raw.split('\n').some((line) => /^worktree\.always:\s*true$/.test(line.trim()));
}

module.exports = { isWorktreeAlwaysOn };
