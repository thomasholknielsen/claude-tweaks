// bin/lib/policy.js — reads flat dotted-key project policy from
// .claude-tweaks/policy.yml. No YAML dependency: the plugin ships zero
// runtime npm deps, and the only supported shape is a top-level
// `key.path: value` line, matching the convention already documented for
// other policies (e.g. issues.autonomous-eligibility). Parsing is delegated
// to bin/lib/policy-schema.js's parseFlatLines, so one flat-line parser
// implementation remains; this module only does the fs read plus each
// reader's own value interpretation.
'use strict';
const fs = require('fs');
const path = require('path');
const { parseFlatLines } = require('./policy-schema');

function readPolicyFile(repoRoot) {
  try {
    return fs.readFileSync(path.join(repoRoot, '.claude-tweaks', 'policy.yml'), 'utf8');
  } catch {
    return null;
  }
}

function parsePolicy(repoRoot) {
  return parseFlatLines(readPolicyFile(repoRoot));
}

// `worktree.always: true` — anything else (absent, `false`, trailing garbage
// that isn't a `# comment`) reads as policy-OFF. Trailing `# comment` after
// the value is stripped by parseFlatLines — policy.yml is documented as
// hand-editable (skills/_shared/git-discipline.md, skills/init/SKILL.md), and
// a user who hand-writes `worktree.always: true  # enabled after the incident
// on 2026-07-10` must not have that natural annotation silently read as
// policy-OFF.
function isWorktreeAlwaysOn(repoRoot) {
  return parsePolicy(repoRoot)['worktree.always'] === 'true';
}

// `integration-branch: <name>` — where finished work lands. Unset on most
// projects, where each consumer falls back to the repository's own default
// branch. Trailing `# comment` tolerated; a value containing internal
// whitespace is not a branch name git would accept, so it reads as unset.
function readIntegrationBranch(repoRoot) {
  const value = parsePolicy(repoRoot)['integration-branch'];
  if (!value || /\s/.test(value)) return null;
  return value;
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
  const value = parsePolicy(repoRoot)[key];
  if (!value) return [];
  return value.split(',').map((s) => s.trim()).filter(Boolean);
}

module.exports = { isWorktreeAlwaysOn, readIntegrationBranch, readListKey };
