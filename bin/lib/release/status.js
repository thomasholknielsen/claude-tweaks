'use strict';
const { parseChangelogVersions } = require('../changelog.js');

const MANIFEST = '.claude-plugin/plugin.json';
const CHANGELOG = 'CHANGELOG.md';

function manifestVersionAt(deps, spec) {
  return JSON.parse(deps.git(['show', `${spec}:${MANIFEST}`])).version;
}

// ref -> every commit reachable from it that changed the manifest's `version`,
// newest first. A manifest edit that leaves `version` alone (description, keywords)
// shows up in the path log but is not a bump — hence the parent comparison. A root
// commit (no parent) that carries a version counts as the first bump.
function findBumpCommits(deps, ref) {
  const shas = deps.git(['log', '--format=%H', ref, '--', MANIFEST]).split('\n').map((s) => s.trim()).filter(Boolean);
  const bumps = [];
  for (const sha of shas) {
    const version = manifestVersionAt(deps, sha);
    let parentVersion = null;
    try {
      parentVersion = manifestVersionAt(deps, `${sha}^`);
    } catch (err) {
      // Only a genuinely absent parent is "root commit" — any other failure
      // (git error, malformed manifest JSON) aborts rather than silently treating it as a root.
      if (/does not exist|exists on disk, but not in|invalid object name/i.test(String(err.message))) {
        parentVersion = null; // root commit — nothing to compare against
      } else {
        throw new Error(`could not read ${sha}^'s manifest: ${err.message}`);
      }
    }
    if (version !== parentVersion) bumps.push({ sha, version });
  }
  return bumps;
}

function isAncestor(deps, ancestor, descendant) {
  try {
    deps.git(['merge-base', '--is-ancestor', ancestor, descendant]);
    return true;
  } catch {
    return false; // non-zero exit = not an ancestor
  }
}

// The release that first carried the merge: walk newest -> oldest and keep the last
// bump that still contains it. Newest-not-containing means the merge is unshipped.
function carryingBump(deps, mergeSha, bumps) {
  let carrying = null;
  for (const bump of bumps) {
    if (!isAncestor(deps, mergeSha, bump.sha)) break;
    carrying = bump;
  }
  return carrying;
}

function changelogCoverage(changelogText, version, records) {
  const entry = parseChangelogVersions(changelogText).find((e) => e.version === version);
  if (!entry) return { entryFound: false, named: [], missing: [...records] };
  const haystack = `${entry.title}\n${entry.body}`;
  const named = [];
  const missing = [];
  for (const n of records) {
    const re = new RegExp(`(?<![0-9])#${n}(?![0-9])`);
    (re.test(haystack) ? named : missing).push(n);
  }
  return { entryFound: true, named, missing };
}

function releaseStatus(deps, { ref = 'HEAD', merge, records } = {}) {
  if (!merge || !String(merge).trim()) throw new Error('merge commit is required (--merge <sha>)');
  if (!Array.isArray(records) || records.length === 0 || !records.every((n) => Number.isInteger(n) && n > 0)) {
    throw new Error('at least one record number is required (--records 603,604)');
  }
  const bumps = findBumpCommits(deps, ref);
  const bump = carryingBump(deps, merge, bumps);
  if (!bump) return { shipped: false };
  const coverage = changelogCoverage(deps.readFile(CHANGELOG), bump.version, records);
  return { shipped: true, version: bump.version, bumpCommit: bump.sha, ...coverage };
}

function formatStatusLine(result) {
  if (!result.shipped) return 'not yet in a release — bump pending';
  if (result.missing.length === 0) return `already carried by v${result.version} — every record named in CHANGELOG`;
  return `already carried by v${result.version} — CHANGELOG backfill needed: ${result.missing.map((n) => `#${n}`).join(', ')}`;
}

// The `### also carried in this build` subsection, per docs/releasing.md's convention.
// Named after the fact and labelled, never folded into the surrounding entry.
function formatBackfillSection(result, { merge } = {}) {
  if (!result.shipped || result.missing.length === 0) return '';
  const list = result.missing.map((n) => `#${n}`).join(', ');
  const short = String(merge || '').slice(0, 8);
  const at = short ? ` (merge \`${short}\`)` : '';
  return [
    '### also carried in this build',
    '',
    `Records ${list}${at} reached \`main\` under v${result.version} without a bump of their own — the`,
    'release step that would have written them up never ran, so the build that first carried them',
    'is numbered for other work. Detected by `node bin/release.js status` at pr-first merge and',
    'backfilled after the fact (see `docs/releasing.md`).',
    '',
  ].join('\n');
}

module.exports = {
  findBumpCommits, carryingBump, changelogCoverage, releaseStatus,
  formatStatusLine, formatBackfillSection, MANIFEST, CHANGELOG,
};
