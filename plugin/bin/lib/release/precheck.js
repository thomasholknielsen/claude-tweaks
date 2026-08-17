'use strict';
const { compareVersions } = require('../changelog.js');
const { nextVersion } = require('./compose.js');
const { readManifestAtRef } = require('../manifest-path.js');

const VERSION_IN_TEXT = /\bv?(\d+\.\d+\.\d+)\b/g;

function manifestVersion(text) {
  return JSON.parse(text).version;
}

// Every read here targets an arbitrary ref — origin/main, local main, or a sibling
// worktree's branch — any of which can predate the plugin/ payload move (#418).
function manifestVersionAtRef(deps, ref) {
  return manifestVersion(readManifestAtRef((p) => deps.git(['show', `${ref}:${p}`])).text);
}

function collectClaims(deps) {
  const originMain = manifestVersionAtRef(deps, 'origin/main');
  const localMain = manifestVersionAtRef(deps, 'main');

  const worktreeBranches = [];
  const porcelain = deps.git(['worktree', 'list', '--porcelain']);
  for (const line of porcelain.split('\n')) {
    const m = /^branch refs\/heads\/(.+)$/.exec(line.trim());
    if (!m || m[1] === 'main') continue;
    let version;
    try {
      version = manifestVersionAtRef(deps, m[1]);
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
  const originMajor = originMain.split('.')[0];
  for (const file of deps.listPlanFiles()) {
    const text = deps.readFile(file);
    for (const match of text.matchAll(VERSION_IN_TEXT)) {
      // Same-major only: a plan naming v20.12.0 in a repo at 6.x is citing a
      // dependency's version, not claiming a future plugin number.
      if (match[1].split('.')[0] === originMajor && compareVersions(match[1], originMain) > 0) {
        planClaims.push({ file, version: match[1] });
      }
    }
  }
  // The tsv's own tip participates in the base: a version can be documented
  // (a wip-never-shipped tombstone line) without the manifest ever reaching it,
  // and deriving the candidate from the manifest alone then lands exactly on
  // the burned number — compose's duplicate-heading guard aborts, and no
  // renumber suggestion ever fires because the tombstone is not a "claim".
  // Observed live releasing after 6.75.0's reverted premature bump. A missing
  // tsv (a repo predating it) contributes nothing rather than aborting.
  let tsvTip = null;
  try {
    const tsv = deps.git(['show', 'main:docs/shipped-versions.tsv']);
    for (const line of tsv.split('\n')) {
      const v = line.split('\t')[0];
      if (/^\d+\.\d+\.\d+$/.test(v) && (!tsvTip || compareVersions(v, tsvTip) > 0)) tsvTip = v;
    }
  } catch (err) {
    if (!/does not exist|exists on disk, but not in|invalid object name/i.test(String(err.message))) {
      throw new Error(`pre-check could not read docs/shipped-versions.tsv: ${err.message}`);
    }
  }

  return { originMain, localMain, worktreeBranches, planClaims, tsvTip };
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
  let base = compareVersions(claims.localMain, claims.originMain) > 0 ? claims.localMain : claims.originMain;
  if (claims.tsvTip && compareVersions(claims.tsvTip, base) > 0) base = claims.tsvTip;
  const candidate = nextVersion(base, part);
  return { candidate, claims, result: checkCollisions(candidate, claims) };
}

module.exports = { collectClaims, checkCollisions, precheck };
