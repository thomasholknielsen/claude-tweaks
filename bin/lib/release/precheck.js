'use strict';
const { compareVersions } = require('../changelog.js');
const { nextVersion } = require('./compose.js');

const VERSION_IN_TEXT = /\bv?(\d+\.\d+\.\d+)\b/g;

function manifestVersion(text) {
  return JSON.parse(text).version;
}

function collectClaims(deps) {
  const originMain = manifestVersion(deps.git(['show', 'origin/main:.claude-plugin/plugin.json']));
  const localMain = manifestVersion(deps.git(['show', 'main:.claude-plugin/plugin.json']));

  const worktreeBranches = [];
  const porcelain = deps.git(['worktree', 'list', '--porcelain']);
  for (const line of porcelain.split('\n')) {
    const m = /^branch refs\/heads\/(.+)$/.exec(line.trim());
    if (!m || m[1] === 'main') continue;
    let version;
    try {
      version = manifestVersion(deps.git(['show', `${m[1]}:.claude-plugin/plugin.json`]));
    } catch (err) {
      // Only a genuinely absent manifest is "not a claim" — any other failure
      // (git error, malformed manifest JSON) aborts rather than silently weakening the check.
      if (/does not exist|exists on disk, but not in|invalid object name/i.test(String(err.message))) {
        continue;
      }
      throw new Error(`pre-check could not read ${m[1]}'s manifest: ${err.message}`);
    }
    if (version !== localMain) worktreeBranches.push({ branch: m[1], version });
  }

  const planClaims = [];
  for (const file of deps.listPlanFiles()) {
    const text = deps.readFile(file);
    for (const match of text.matchAll(VERSION_IN_TEXT)) {
      if (compareVersions(match[1], originMain) > 0) {
        planClaims.push({ file, version: match[1] });
      }
    }
  }
  return { originMain, localMain, worktreeBranches, planClaims };
}

function checkCollisions(candidate, claims) {
  const conflicts = [];
  for (const wt of claims.worktreeBranches) {
    if (compareVersions(wt.version, candidate) >= 0) {
      conflicts.push({ source: 'worktree-branch', detail: wt.branch, version: wt.version });
    }
  }
  for (const claim of claims.planClaims) {
    if (compareVersions(claim.version, candidate) >= 0) {
      conflicts.push({ source: 'plan-claim', detail: claim.file, version: claim.version });
    }
  }
  let suggested = candidate;
  if (conflicts.length) {
    const highest = conflicts.map((c) => c.version).sort(compareVersions).pop();
    const part = candidate.endsWith('.0') ? 'minor' : 'patch';
    suggested = nextVersion(highest, part);
  }
  return { ok: conflicts.length === 0, conflicts, suggested };
}

function precheck(deps, part) {
  deps.git(['fetch', 'origin', 'main']);
  const claims = collectClaims(deps);
  const base = compareVersions(claims.localMain, claims.originMain) > 0 ? claims.localMain : claims.originMain;
  const candidate = nextVersion(base, part);
  return { candidate, claims, result: checkCollisions(candidate, claims) };
}

module.exports = { collectClaims, checkCollisions, precheck };
