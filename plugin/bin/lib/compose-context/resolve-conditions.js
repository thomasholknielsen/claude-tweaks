// bin/lib/compose-context/resolve-conditions.js — resolve the six-key condition
// set a run already knows (#1988). Reads policy.yml + the run's config.yml
// through policy-schema.js's own resolver (never a bespoke parse), CLAUDE.md's
// work-backend: line from $RUN_ROOT (the main checkout — never a worktree's cwd,
// [IL-127]), and probes `gh --version` for transport. That probe is this
// module's ONLY shell-out, injected via deps.execFileSync so tests never spawn
// (gh-api-module-pattern's injectable-runner seam).
//
// A key nobody set resolves to 'unresolved' — never a guessed default — so the
// composer keeps both branches for it (the record's unresolvable-key rule).
//
// An unreadable-but-present file is a real error surfaced to the caller,
// never silently read as unresolved — only an absent file (ENOENT/ENOTDIR)
// is swallowed.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync: realExecFileSync } = require('child_process');
const { parseFlatLines, resolvePolicyKeys, resolveIntegrationModel } = require('../policy-schema');
const { KEYS, VOCAB, UNRESOLVED } = require('./compose');

const GH_TIMEOUT_MS = 5000; // remote-contacting seam convention; --version is local, but the bound is free

const realDeps = {
  readFile: (p, enc) => fs.readFileSync(p, enc),
  execFileSync: realExecFileSync,
  resolveIntegrationModel,
};

function readFileSafe(p, readFile) {
  try {
    return readFile(p, 'utf8');
  } catch (err) {
    if (err && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) return null;
    throw err;
  }
}

// { runDir, repoRoot } -> { conditions, unresolved }
function resolveConditions({ runDir, repoRoot }, deps = {}) {
  const d = { ...realDeps, ...deps };
  const policyRaw = readFileSafe(path.join(repoRoot, '.claude-tweaks', 'policy.yml'), d.readFile);
  const runConfigRaw = readFileSafe(path.join(runDir, 'config.yml'), d.readFile);
  const claudeMdRaw = readFileSafe(path.join(repoRoot, 'CLAUDE.md'), d.readFile);
  const policy = resolvePolicyKeys(['integration-model', 'autonomy', 'worktree-always'], { policyRaw, runConfigRaw });
  const isSet = (entry) => entry && !entry.error && entry.source !== 'default';

  const conditions = {};
  // The run's own pin (config.yml) or policy.yml wins; detection is the fallback
  // (_shared/integration-model.md, "Run-scoped stability").
  conditions['integration-model'] = isSet(policy['integration-model'])
    ? policy['integration-model'].value
    : d.resolveIntegrationModel(repoRoot);

  const mode = parseFlatLines(runConfigRaw).mode;
  conditions.mode = VOCAB.mode.includes(mode) ? mode : UNRESOLVED;

  conditions.attendance = isSet(policy.autonomy)
    ? (policy.autonomy.value === 'unattended' ? 'headless' : 'attended')
    : UNRESOLVED;

  let transport;
  try {
    d.execFileSync('gh', ['--version'], { encoding: 'utf8', stdio: 'pipe', timeout: GH_TIMEOUT_MS });
    transport = 'gh';
  } catch {
    transport = 'mcp';
  }
  conditions.transport = transport;

  conditions['worktree-policy'] = isSet(policy['worktree-always'])
    ? (policy['worktree-always'].value === true ? 'always' : 'optional')
    : UNRESOLVED;

  const wb = parseFlatLines(claudeMdRaw)['work-backend'];
  conditions['work-backend'] = VOCAB['work-backend'].includes(wb) ? wb : UNRESOLVED;

  return { conditions, unresolved: KEYS.filter((key) => conditions[key] === UNRESOLVED) };
}

module.exports = { resolveConditions, realDeps };
