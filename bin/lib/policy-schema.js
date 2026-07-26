// bin/lib/policy-schema.js — canonical data + deterministic validator for every
// project-config lever documented in skills/_shared/policy-schema.md. If the two
// disagree, one of them has a bug — fix, don't fork.
'use strict';
const fs = require('fs');
const path = require('path');

const POLICY_KEYS = [
  { key: 'worktree.always', type: 'boolean', default: false },
  { key: 'execution.always', type: 'enum', values: ['subagent', 'batched'] },
  { key: 'project.maturity', type: 'enum', values: ['greenfield', 'pre-launch', 'early-production', 'established'], default: 'greenfield' },
  { key: 'dispatch-retry-ceiling', type: 'integer', default: 3 },
  { key: 'dispatch-pick-max-concurrent', type: 'integer', default: 3 },
  { key: 'automerge-max-lines', type: 'integer', default: 40 },
  { key: 'automerge-max-files', type: 'integer', default: 2 },
  { key: 'merge-sensitive-paths', type: 'list', default: [] },
  { key: 'work-links', type: 'enum', values: ['native', 'body-text'], default: 'body-text' },
  { key: 'review-effort-floor', type: 'enum', values: ['low', 'medium', 'high', 'xhigh', 'max'] },
  { key: 'review-diff-heuristic-thresholds', type: 'opaque' },
  { key: 'harness-health.scoped-rule-budget', type: 'integer', default: 30 },
  { key: 'harness-health.always-loaded-budget', type: 'integer', default: 150 },
  { key: 'unattended-tier', type: 'enum', values: ['off', 'on'], default: 'off' },
  { key: 'scope-creep', type: 'enum', values: ['add-to-plan', 'stop-and-ask', 'drop'], default: 'add-to-plan' },
  { key: 'overlap', type: 'enum', values: ['companion', 'extend', 'skip', 'replace'], default: 'companion' },
  { key: 'design-intent', type: 'enum', values: ['none', 'bold', 'quiet', 'minimal', 'delightful', 'onboarding'], default: 'none' },
  { key: 'leftover-default', type: 'enum', values: ['defer', 'backlog', 'drop'], default: 'defer' },
  { key: 'auto-fix-threshold', type: 'enum', values: ['lint-only', 'lint+type', 'lint+type+test'], default: 'lint+type' },
  { key: 'review-severity-floor', type: 'enum', values: ['none', 'low', 'medium'], default: 'low' },
  { key: 'tidy-aggressiveness', type: 'enum', values: ['conservative', 'moderate', 'aggressive'], default: 'conservative' },
  { key: 'auto-mode', type: 'enum', values: ['default-on', 'default-off'] },
  { key: 'triage-retry-ceiling', type: 'integer', default: 3 },
  { key: 'triage-fast-track-max-lines', type: 'integer', default: 40 },
  { key: 'triage-fast-track-max-files', type: 'integer', default: 2 },
  { key: 'triage-dispatch-max-concurrent', type: 'integer', default: 3 },
  { key: 'backlog-fetch-limit', type: 'integer', default: 1000 },
  { key: 'depth-survey', type: 'enum', values: ['off'] },
  { key: 'creative-survey', type: 'enum', values: ['off'] },
  { key: 'tidy-routine-autonomy', type: 'enum', values: ['conservative', 'evidence-based'], default: 'conservative' },
];

// The 8 levers previously generated into CLAUDE.md's "## Auto-mode policy" block.
const LEGACY_CLAUDE_MD_LEVER_KEYS = [
  'unattended-tier',
  'scope-creep',
  'overlap',
  'design-intent',
  'leftover-default',
  'auto-fix-threshold',
  'review-severity-floor',
  'tidy-aggressiveness',
];

function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

// Flat `key: value` line matcher, tolerant of a trailing `# comment` and of
// living inside a fenced code block — matches bin/lib/policy.js's convention.
function parseFlatLines(raw) {
  const result = {};
  if (!raw) return result;
  for (const rawLine of raw.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([a-zA-Z0-9_.-]+):\s*([^#]*)/);
    if (!match) continue;
    const value = match[2].trim();
    if (value) result[match[1]] = value;
  }
  return result;
}

function isValidValue(schemaEntry, value) {
  switch (schemaEntry.type) {
    case 'boolean':
      return value === 'true' || value === 'false';
    case 'integer':
      return /^-?\d+$/.test(value);
    case 'enum':
      return schemaEntry.values.includes(value);
    case 'list':
    case 'opaque':
      return true;
    default:
      return true;
  }
}

function auditPolicy(repoRoot) {
  const policyRaw = readFileSafe(path.join(repoRoot, '.claude-tweaks', 'policy.yml'));
  const claudeMdRaw = readFileSafe(path.join(repoRoot, 'CLAUDE.md'));
  const policyEntries = parseFlatLines(policyRaw);
  const claudeMdEntries = parseFlatLines(claudeMdRaw);
  const schemaByKey = new Map(POLICY_KEYS.map((entry) => [entry.key, entry]));

  const unrecognizedKeys = Object.keys(policyEntries).filter((key) => !schemaByKey.has(key));

  const invalidValues = [];
  for (const [entries, source] of [[policyEntries, 'policy.yml'], [claudeMdEntries, 'CLAUDE.md']]) {
    for (const [key, value] of Object.entries(entries)) {
      const schemaEntry = schemaByKey.get(key);
      if (schemaEntry && !isValidValue(schemaEntry, value)) {
        invalidValues.push({ key, value, expected: schemaEntry, source });
      }
    }
  }

  const legacyClaudeMdLevers = LEGACY_CLAUDE_MD_LEVER_KEYS
    .filter((key) => claudeMdEntries[key] !== undefined)
    .map((key) => {
      const schemaEntry = schemaByKey.get(key);
      const value = claudeMdEntries[key];
      return {
        key,
        value,
        matchesDefault: value === String(schemaEntry.default),
        isValid: isValidValue(schemaEntry, value),
      };
    });

  return { unrecognizedKeys, invalidValues, legacyClaudeMdLevers };
}

module.exports = { POLICY_KEYS, auditPolicy };
