'use strict';
// The gather half of assess-agent-autonomy's merge-check mode, as one process
// (#888): merge-base resolution, numstat parsing, policy-config resolution, and
// classification via bin/lib/issues/blast-radius.js. Hard-fails (throws
// BlastRadiusError) when the base cannot be resolved — a zero-file summary from
// a resolution failure is structurally impossible, which is the whole point:
// the retired prose choreography could silently read `git diff ""..HEAD` as an
// empty diff and clear every auto-merge threshold.
//
// Injectable seams (deps.git, deps.readFile) follow the same fake-runner test
// convention as the gh-shelling modules (see the gh-api-module-pattern skill).
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { classifyDiffFiles, blastRadiusSummary } = require('./issues/blast-radius.js');
const { resolvePolicyKeys } = require('./policy-schema.js');

class BlastRadiusError extends Error {
  constructor(...args) {
    super(...args);
    this.name = 'BlastRadiusError';
  }
}

function defaultGit(args) {
  return execFileSync('git', args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
}

function defaultReadFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

// git diff --numstat: "<additions>\t<deletions>\t<path>" per line; binary files
// report "-" for both counts (counted as a changed file with zero lines); a
// path may itself contain tabs, so it is everything after the second tab.
function parseNumstat(raw) {
  return raw
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [additions, deletions, ...pathParts] = line.split('\t');
      return {
        path: pathParts.join('\t'),
        additions: Number.parseInt(additions, 10) || 0,
        deletions: Number.parseInt(deletions, 10) || 0,
      };
    });
}

function resolveConfig({ git, readFile, runDir }) {
  let root;
  try {
    root = git(['rev-parse', '--show-toplevel']).trim();
  } catch {
    root = process.cwd();
  }
  let policyRaw;
  let runConfigRaw;
  try {
    policyRaw = readFile(path.join(root, '.claude-tweaks', 'policy.yml'));
    runConfigRaw = runDir ? readFile(path.join(runDir, 'config.yml')) : null;
  } catch (err) {
    throw new BlastRadiusError(`failed to read policy config: ${err.message}`);
  }
  const resolved = resolvePolicyKeys(
    ['merge-sensitive-paths', 'auto-merge-max-lines', 'auto-merge-max-files'],
    { policyRaw, runConfigRaw }
  );
  const rawPaths = resolved['merge-sensitive-paths'] && resolved['merge-sensitive-paths'].value;
  const mergeSensitivePaths = Array.isArray(rawPaths)
    ? rawPaths
    : String(rawPaths || '').split(',').map((s) => s.trim()).filter(Boolean);
  return {
    mergeSensitivePaths,
    autoMergeMaxLines: Number(resolved['auto-merge-max-lines'].value),
    autoMergeMaxFiles: Number(resolved['auto-merge-max-files'].value),
  };
}

function computeBlastRadius(opts = {}, deps = {}) {
  const git = deps.git || defaultGit;
  const readFile = deps.readFile || defaultReadFile;
  const { base, integrationBranch, runDir = null } = opts;

  if (!base && !integrationBranch) {
    throw new BlastRadiusError('one of --base or --integration-branch is required');
  }

  let mergeBase;
  if (base) {
    try {
      mergeBase = git(['rev-parse', '--verify', '--end-of-options', `${base}^{commit}`]).trim();
    } catch (err) {
      throw new BlastRadiusError(`--base "${base}" does not resolve to a commit: ${err.message}`);
    }
  } else {
    try {
      mergeBase = git(['merge-base', '--end-of-options', integrationBranch, 'HEAD']).trim();
    } catch (err) {
      throw new BlastRadiusError(
        `could not resolve merge base of "${integrationBranch}" and HEAD: ${err.message}`
      );
    }
  }
  if (!mergeBase) {
    throw new BlastRadiusError('merge-base resolution returned an empty value');
  }

  let diffRaw;
  try {
    diffRaw = git(['diff', '--no-renames', '--numstat', `${mergeBase}..HEAD`]);
  } catch (err) {
    throw new BlastRadiusError(`git diff --numstat failed: ${err.message}`);
  }
  const files = parseNumstat(diffRaw);
  const config = resolveConfig({ git, readFile, runDir });
  const summary = blastRadiusSummary(classifyDiffFiles(files, config.mergeSensitivePaths));
  return { mergeBase, config, summary };
}

module.exports = { computeBlastRadius, parseNumstat, BlastRadiusError };
