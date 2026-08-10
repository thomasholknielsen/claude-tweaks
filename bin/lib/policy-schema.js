// bin/lib/policy-schema.js — canonical data + deterministic validator for every
// project-config lever documented in skills/_shared/policy-schema.md. If the two
// disagree, one of them has a bug — fix, don't fork.
'use strict';
const fs = require('fs');
const path = require('path');
const { PROFILES } = require('./model-profiles/profiles');

const PROFILE_NAMES = Object.keys(PROFILES);

const POLICY_KEYS = [
  { key: 'worktree.always', type: 'boolean', default: false },
  { key: 'execution.always', type: 'enum', values: ['subagent', 'batched'] },
  { key: 'execution-strategy', type: 'enum', values: ['subagent', 'batched'], default: 'subagent' },
  { key: 'git-strategy', type: 'enum', values: ['current-branch', 'worktree'], default: 'worktree' },
  { key: 'project.maturity', type: 'enum', values: ['greenfield', 'pre-launch', 'early-production', 'established'], default: 'greenfield' },
  { key: 'integration-branch', type: 'string' },
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
  { key: 'backlog-fetch-limit', type: 'integer', default: 1000 },
  { key: 'depth-survey', type: 'enum', values: ['off'] },
  { key: 'creative-survey', type: 'enum', values: ['off'] },
  { key: 'promise-register-min-leaves', type: 'integer', default: 4 },
  { key: 'scope-keywords-required', type: 'boolean', default: false },
  { key: 'section-confirmation', type: 'enum', values: ['adaptive', 'per-section', 'batch'], default: 'adaptive' },
  { key: 'merge-check', type: 'boolean', default: true },
  { key: 'autonomy', type: 'enum', values: ['supervised', 'trusted', 'unattended'], default: 'supervised' },
  { key: 'doc-convention.adr', type: 'enum', values: ['plugin', 'project'] },
  // Model-profile resolver levers (#216's bin/lib/model-profiles/profiles.js is
  // the runtime reader for these four key names — POLICY_KEYS_READ pins them;
  // registration here is schema/audit only, deliberately shallow (#219): this
  // file checks model-profiles' row keys are real profile names, never the
  // shape of a row's own fields — that's the resolver's job, at resolve time.
  { key: 'model-stance', type: 'enum', values: ['economy', 'default', 'max-rigor'], default: 'default' },
  { key: 'frontier-run-cap', type: 'integer', default: 3 },
  { key: 'model-ceiling', type: 'enum', values: PROFILE_NAMES },
  { key: 'model-profiles', type: 'map', keys: PROFILE_NAMES },
  // Read from /claude-tweaks:research's own `## Input` --mode= flag (IL-24:
  // that file is authoritative for the vocabulary, not this schema).
  { key: 'research-mode', type: 'enum', values: ['quick', 'standard', 'deep', 'ultradeep'] },
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
    // Every top-level key in this file's flat convention starts in column 0
    // (dot-notation namespacing, e.g. harness-health.scoped-rule-budget, is
    // how nesting is expressed — never indentation). An indented line belongs
    // to a nested block's own field (today, only model-profiles' rows) and
    // must never be read as a flat key in its own right.
    if (/^\s/.test(rawLine)) continue;
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
    case 'string':
      // Non-empty and whitespace-free. Enough to catch a mistyped branch name
      // ("dev branch") without reimplementing git check-ref-format's full rules
      // — a name git itself would reject is worth flagging, but this validator
      // has no repo to resolve the name against.
      return value.length > 0 && !/\s/.test(value);
    case 'list':
    case 'opaque':
      return true;
    case 'map':
      // Shallow by design (#219 Non-Goals): every row key must name a real
      // profile; a row's own value shape is never inspected here — the
      // resolver (bin/lib/model-profiles/policy-fragment.js) validates that
      // deeply, at resolve time, and rejects an unknown field there instead.
      return Object.keys(value).every((k) => schemaEntry.keys.includes(k));
    default:
      return true;
  }
}

// Shallow extractor for a nested `{topKey}:` block's first-level indented key
// names — parseFlatLines only sees flat `key: value` lines, so a block-style
// value (today, only model-profiles) is otherwise invisible to auditPolicy.
// Returns undefined when the block is absent, distinct from an empty map.
function extractMapEntry(raw, topKey) {
  if (!raw) return undefined;
  const lines = raw.split('\n');
  let found = false;
  const map = {};
  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i];
    const stripped = rawLine.replace(/#.*$/, '').trimEnd();
    if (!found) {
      if (/^\S/.test(rawLine) && new RegExp(`^${topKey}:\\s*$`).test(stripped.trim())) found = true;
      continue;
    }
    if (!stripped.trim()) continue;
    if (!/^\s/.test(rawLine)) break; // dedent — block ended
    const rowMatch = /^ {2}([A-Za-z0-9_-]+):/.exec(stripped);
    if (rowMatch) map[rowMatch[1]] = true;
    // Deeper-nested field lines (4-space `model:`/`effort:`) are ignored —
    // shallow means only the row's own key name is read here.
  }
  return found ? map : undefined;
}

function auditPolicy(repoRoot) {
  const policyRaw = readFileSafe(path.join(repoRoot, '.claude-tweaks', 'policy.yml'));
  const claudeMdRaw = readFileSafe(path.join(repoRoot, 'CLAUDE.md'));
  const policyEntries = parseFlatLines(policyRaw);
  const claudeMdEntries = parseFlatLines(claudeMdRaw);
  // model-profiles is the one block-style (non-flat) key today; parseFlatLines
  // can't see it, so it's read separately and merged in under its own name —
  // this never collides with a flat-line entry of the same key.
  const modelProfilesEntry = extractMapEntry(policyRaw, 'model-profiles');
  if (modelProfilesEntry !== undefined) policyEntries['model-profiles'] = modelProfilesEntry;
  const schemaByKey = new Map(POLICY_KEYS.map((entry) => [entry.key, entry]));

  const unrecognizedKeys = Object.keys(policyEntries).filter((key) => !schemaByKey.has(key));

  // policy.yml is the only config home, so it is the only thing worth validating.
  const invalidValues = [];
  for (const [key, value] of Object.entries(policyEntries)) {
    const schemaEntry = schemaByKey.get(key);
    if (schemaEntry && !isValidValue(schemaEntry, value)) {
      invalidValues.push({ key, value, expected: schemaEntry });
    }
  }

  // A recognized key still sitting in CLAUDE.md no longer applies to anything.
  // Its value is not audited — correcting a value nobody reads is not the fix;
  // moving the key is. `alsoInPolicy` separates the two remedies: false means
  // "move it," true means "delete the dead copy, policy.yml already wins."
  // Deliberately restricted to POLICY_KEYS: CLAUDE.md prose is full of
  // key-shaped lines ("Lifecycle:", "Status:"), and the /init migration this
  // feeds deletes lines from a file users hand-tune.
  const migratableKeys = [];
  for (const [key, value] of Object.entries(claudeMdEntries)) {
    if (!schemaByKey.has(key)) continue;
    migratableKeys.push({
      key,
      value,
      alsoInPolicy: Object.prototype.hasOwnProperty.call(policyEntries, key),
    });
  }

  return { unrecognizedKeys, invalidValues, migratableKeys };
}

module.exports = { POLICY_KEYS, auditPolicy };
