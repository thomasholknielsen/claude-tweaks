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
  { key: 'dispatch-batch-size', type: 'integer', default: 3 },
  // Deprecated alias for dispatch-batch-size (renamed in #295 — the value is a
  // sequential batch count, never a concurrency slot count). Still recognized so a
  // project's existing policy.yml validates; removal condition in
  // skills/dispatch/deprecated-aliases.md.
  { key: 'dispatch-pick-max-concurrent', type: 'integer', default: 3 },
  { key: 'automerge-max-lines', type: 'integer', default: 40 },
  { key: 'automerge-max-files', type: 'integer', default: 2 },
  { key: 'merge-sensitive-paths', type: 'list', default: [] },
  { key: 'work-links', type: 'enum', values: ['native', 'body-text'], default: 'body-text' },
  { key: 'review-effort-floor', type: 'enum', values: ['low', 'medium', 'high', 'xhigh', 'max'] },
  { key: 'review-diff-heuristic-thresholds', type: 'opaque' },
  { key: 'harness-health.scoped-rule-budget', type: 'integer', default: 30 },
  { key: 'harness-health.always-loaded-budget', type: 'integer', default: 150 },
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
  { key: 'trust-revert-window-days', type: 'integer', min: 1, default: 14 },
  // The reserved second opt-in named by skills/_shared/autonomy-ceiling.md —
  // read by permittedGrants as grantOriginationEnabled. false by default: the
  // 'unattended' ceiling alone never authorizes a machine-originated grant.
  { key: 'grant-origination-enabled', type: 'boolean', default: false },
  // Positive integer counting machine grants issued today (audit-comment
  // markers dated today, UTC) — /claude-tweaks:backlog grant mode's own floor.
  // Absent = uncapped (optional-when-absent, see #269's Deliverables).
  { key: 'fleet-daily-grant-cap', type: 'integer', min: 1 },
  // experiment-cleanup vertical (code-health focus mode) — the repo's own
  // feature-flag idiom, as regex-source strings (first capture group =
  // flag identifier). Empty/absent = the vertical is inactive; there is no
  // whole-repo-scan fallback (see bin/lib/code-health/candidates-experiment-
  // cleanup.js and skills/code-health/focus-mode.md).
  { key: 'experiment-flag-patterns', type: 'list', default: [] },
  // Kill-switch name substrings, extending (never replacing) the shipped
  // defaults ["emergency", "circuit", "kill"] — a flag whose identifier
  // matches is never emitted as a candidate, regardless of decision signals.
  { key: 'experiment-flag-exclude', type: 'list', default: [] },
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

const SCHEMA_BY_KEY = new Map(POLICY_KEYS.map((entry) => [entry.key, entry]));

// Keys retired from POLICY_KEYS but still worth detecting in a project's live
// policy.yml, so a stray value migrates instead of silently reporting as an
// unrecognized typo. `migrate` maps the retired key's old value to a suggested
// value for `replacedBy` -- null means "delete the stray key, no replacement
// value needs setting" (unattended-tier's own 'off' never unlocked anything
// autonomy's own 'supervised' default doesn't already match, so there is
// nothing to carry forward).
const RENAMED_KEYS = [
  {
    key: 'unattended-tier',
    replacedBy: 'autonomy',
    migrate: (value) => (value === 'on' ? 'unattended' : null),
  },
  // Renamed in #295 (the value is a sequential batch count, never a concurrency
  // slot count). Unlike unattended-tier, the old key ALSO still sits in
  // POLICY_KEYS — it runs its own removal course; removal condition in
  // skills/dispatch/deprecated-aliases.md.
  {
    key: 'dispatch-pick-max-concurrent',
    replacedBy: 'dispatch-batch-size',
    migrate: (value) => value,
  },
];
const RENAMED_KEY_NAMES = new Set(RENAMED_KEYS.map((entry) => entry.key));

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
    case 'integer': {
      if (!/^-?\d+$/.test(value)) return false;
      const parsed = Number(value);
      return (schemaEntry.min === undefined || parsed >= schemaEntry.min)
        && (schemaEntry.max === undefined || parsed <= schemaEntry.max);
    }
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

// key, rawValue (string | number | undefined | null) -> the coerced, valid
// value for that key: `rawValue` itself when it type-checks (parsed to a
// number for 'integer', to a boolean for 'boolean'), the schema's own
// `default` when `rawValue` is absent/empty or fails validation, or
// `rawValue` unchanged when `key` names no known lever (nothing to coerce
// against). The one place malformed-value coercion is decided for a
// programmatic (non-audit) reader — a caller with a raw policy.yml string
// (or nothing at all) calls this once and trusts what comes back without
// re-validating it itself.
function resolveValue(key, rawValue) {
  const entry = SCHEMA_BY_KEY.get(key);
  if (!entry) return rawValue;
  if (rawValue === undefined || rawValue === null || rawValue === '') return entry.default;
  const strValue = String(rawValue);
  if (!isValidValue(entry, strValue)) return entry.default;
  if (entry.type === 'integer') return parseInt(strValue, 10);
  if (entry.type === 'boolean') return strValue === 'true';
  return rawValue;
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

// Multi-key resolver behind bin/resolve-policy.js (#329). Pure — callers hand
// in raw file contents as strings; no fs, no process state. Returns a plain
// object keyed by each requested key name (never an array — IL-121), each
// entry one of:
//   { value, source }                      source: "run-config" | "policy" | "default"
//   { value, source, "renamed-from": k }   value arrived via a RENAMED_KEYS migration
//   { value: default, source: "default", invalid: true }   present-but-invalid at
//                                          the winning source (never cascades)
//   { error: "unknown-key" }               key in neither POLICY_KEYS nor RENAMED_KEYS
// Precedence per key: run-config (only when runConfigRaw is a string) ->
// policy -> schema default. Alias normalization happens per source, BEFORE
// precedence: old key alone -> migrate() contributes under the new name with
// a renamed-from tag (a null migration contributes nothing, but still tags
// renamed-from when the final resolution falls to the default); old + new in
// one source -> the new key wins with no tag (the stray old key is
// auditPolicy's business).
function resolvePolicyKeys(requestedKeys, { policyRaw, runConfigRaw } = {}) {
  const sources = [
    { name: 'run-config', raw: typeof runConfigRaw === 'string' ? runConfigRaw : null },
    { name: 'policy', raw: typeof policyRaw === 'string' ? policyRaw : null },
  ].map(({ name, raw }) => {
    const entries = parseFlatLines(raw);
    const values = { ...entries }; // canonical-name -> raw string value
    const renamedFrom = {}; // canonical-name -> old name, when the value arrived via migrate
    const emptyRenames = {}; // canonical-name -> old name, when migrate returned null (no value)
    for (const alias of RENAMED_KEYS) {
      if (!hasOwn(entries, alias.key)) continue;
      delete values[alias.key]; // an old name never resolves as a flat key of its own
      if (hasOwn(entries, alias.replacedBy)) continue; // new key wins, no renamed-from
      const migrated = alias.migrate(entries[alias.key]);
      if (migrated === null) {
        emptyRenames[alias.replacedBy] = alias.key;
        continue;
      }
      values[alias.replacedBy] = String(migrated);
      renamedFrom[alias.replacedBy] = alias.key;
    }
    return { name, values, renamedFrom, emptyRenames };
  });

  const result = {};
  for (const requested of requestedKeys) {
    // model-profiles is the one block-style key — invisible to this flat
    // resolver by design. Emit its documented absent shape; the CLI overwrites
    // this entry via its parsePolicyModelConfig delegation before printing.
    if (requested === 'model-profiles') {
      result[requested] = { value: null, source: 'default' };
      continue;
    }
    // A request by an alias's old name resolves the replacement key.
    const aliasEntry = RENAMED_KEYS.find((alias) => alias.key === requested);
    const canonical = aliasEntry ? aliasEntry.replacedBy : requested;
    const schemaEntry = SCHEMA_BY_KEY.get(canonical);
    if (!schemaEntry) {
      result[requested] = { error: 'unknown-key' };
      continue;
    }
    // No schema default is itself null, so `?? null` only fires on absent.
    const defaultValue = schemaEntry.default ?? null;
    let resolved = null;
    for (const source of sources) {
      if (!hasOwn(source.values, canonical)) continue;
      const raw = source.values[canonical];
      if (isValidValue(schemaEntry, raw)) {
        resolved = { value: resolveValue(canonical, raw), source: source.name };
      } else {
        // A typo must never activate a different configured value: resolve to
        // the schema default here, never the next source's value.
        resolved = { value: defaultValue, source: 'default', invalid: true };
      }
      if (hasOwn(source.renamedFrom, canonical)) resolved['renamed-from'] = source.renamedFrom[canonical];
      break;
    }
    if (!resolved) {
      resolved = { value: defaultValue, source: 'default' };
      const tagged = sources.find((source) => hasOwn(source.emptyRenames, canonical));
      if (tagged) resolved['renamed-from'] = tagged.emptyRenames[canonical];
    }
    result[requested] = resolved;
  }
  return result;
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

  const unrecognizedKeys = Object.keys(policyEntries)
    .filter((key) => !SCHEMA_BY_KEY.has(key) && !RENAMED_KEY_NAMES.has(key));

  // A renamed key reports exactly once, under renamedKeys -- never also under
  // unrecognizedKeys (excluded above). policyEntries only: this check is
  // policy.yml-only, since that's the only file code ever reads.
  const renamedKeys = [];
  for (const entry of RENAMED_KEYS) {
    if (Object.prototype.hasOwnProperty.call(policyEntries, entry.key)) {
      const value = policyEntries[entry.key];
      renamedKeys.push({
        key: entry.key,
        value,
        replacedBy: entry.replacedBy,
        suggestedValue: entry.migrate(value),
        currentReplacementValue: Object.prototype.hasOwnProperty.call(policyEntries, entry.replacedBy)
          ? policyEntries[entry.replacedBy]
          : null,
      });
    }
  }

  // policy.yml is the only config home, so it is the only thing worth validating.
  const invalidValues = [];
  for (const [key, value] of Object.entries(policyEntries)) {
    const schemaEntry = SCHEMA_BY_KEY.get(key);
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
    if (!SCHEMA_BY_KEY.has(key)) continue;
    migratableKeys.push({
      key,
      value,
      alsoInPolicy: Object.prototype.hasOwnProperty.call(policyEntries, key),
    });
  }

  return { unrecognizedKeys, invalidValues, migratableKeys, renamedKeys };
}

module.exports = { POLICY_KEYS, RENAMED_KEYS, auditPolicy, resolveValue, parseFlatLines, resolvePolicyKeys };
