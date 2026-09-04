'use strict';
const { parseChangelogVersions } = require('../changelog.js');
const {
  MANIFEST_PATH: MANIFEST, MANIFEST_PATHS, readManifestAtRef, manifestVersionAtRef, NOT_FOUND_ERROR_RE,
} = require('../manifest-path.js');

const CHANGELOG = 'CHANGELOG.md';

// Defensive check for non-CLI callers of releaseStatus — the CLI (bin/release.js
// parseStatusArgs) already rejects these, but a value beginning with `-` reaching git
// as a bare positional would otherwise be parsed as an option.
function isBadRefValue(v) {
  return v === undefined || v === null || String(v).trim() === '' || String(v).startsWith('-');
}

// ref -> every commit reachable from it that changed the manifest's `version`,
// newest first, lazily. A manifest edit that leaves `version` alone (description, keywords)
// shows up in the path log but is not a bump — hence the parent comparison. A root
// commit (no parent) that carries a version counts as the first bump. `--topo-order`
// guarantees parent-before-child ordering, which `carryingBump`'s `break` relies on.
function* iterBumpCommits(deps, ref) {
  // A ref with no plugin manifest at all has no release model to judge against — an empty
  // `git log` for it would otherwise read as "not yet in a release," which is a different
  // claim than "this isn't a plugin repo."
  try {
    readManifestAtRef((p) => deps.git(['cat-file', '-e', `${ref}:${p}`]));
  } catch (err) {
    // `fatal: path '...' does not exist in '<ref>'` is a genuinely missing manifest — the
    // condition this function documents. Anything else (e.g. `fatal: invalid object name
    // '<ref>'` for a bad ref) is a resolution failure and must not be misread as "no manifest".
    if (/does not exist in/i.test(String(err.message))) {
      throw new Error(`no plugin manifest at ${ref} — nothing to judge`);
    }
    throw new Error(`could not resolve ${ref}: ${err.message}`);
  }
  // Both spellings as pathspecs: a history spanning the #418 move has bump commits
  // on each side of it, and a single-path log silently drops one side's releases.
  const shas = deps.git(['log', '--format=%H', '--topo-order', ref, '--', ...MANIFEST_PATHS]).split('\n').map((s) => s.trim()).filter(Boolean);
  for (const sha of shas) {
    let version;
    try {
      version = manifestVersionAtRef(deps, sha);
    } catch (err) {
      throw new Error(`could not read ${sha}'s manifest: ${err.message}`);
    }
    let parentVersion = null;
    try {
      parentVersion = manifestVersionAtRef(deps, `${sha}^`);
    } catch (err) {
      // Only a genuinely absent parent is "root commit" — any other failure
      // (git error, malformed manifest JSON) aborts rather than silently treating it as a root.
      if (NOT_FOUND_ERROR_RE.test(String(err.message))) {
        parentVersion = null; // root commit — nothing to compare against
      } else {
        throw new Error(`could not read ${sha}^'s manifest: ${err.message}`);
      }
    }
    if (version !== parentVersion) yield { sha, version };
  }
}

function findBumpCommits(deps, ref) {
  return [...iterBumpCommits(deps, ref)];
}

function isAncestor(deps, ancestor, descendant) {
  try {
    deps.git(['merge-base', '--is-ancestor', ancestor, descendant]);
    return true;
  } catch (err) {
    // execFileSync failures carry `.status`: exit 1 is the benign "not an ancestor" case,
    // any other status (e.g. 128 — invalid commit name) is a real git failure and must not
    // be swallowed as a false. Errors without a numeric `.status` (test fakes) read as exit 1.
    if (err && typeof err.status === 'number' && err.status !== 1) {
      throw new Error(`could not check ancestry of ${ancestor} in ${descendant}: ${err.message}`);
    }
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

// This repo's CHANGELOG names records as ranges as often as it names them individually
// (`#620-#625`, `#528-530`). Collect every range's member numbers into a Set before the
// per-record test so a record documented only as part of a range still counts as named.
// Cap the expansion at 500 members so a typo'd range (`#1-#99999`) can't blow up the loop.
function rangeMembers(haystack) {
  const members = new Set();
  const re = /(?<![0-9])#(\d+)\s*[-–]\s*#?(\d+)(?![0-9])/g;
  let m;
  while ((m = re.exec(haystack))) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a <= b && (b - a) <= 500) {
      for (let n = a; n <= b; n++) members.add(n);
    }
  }
  return members;
}

// Digit-boundary + range-aware "which of these record numbers does this text name"
// check — the matcher `changelogCoverage` uses against a single changelog entry's
// title+body, and that `unnamed-records.js`'s release gate reuses verbatim against
// both a release summary and the newest changelog entry (`#768`).
function recordsNamedIn(haystack, records) {
  const ranges = rangeMembers(haystack);
  const named = [];
  const missing = [];
  for (const n of records) {
    const re = new RegExp(`(?<![0-9])#${n}(?![0-9])`);
    if (re.test(haystack) || ranges.has(n)) named.push(n);
    else missing.push(n);
  }
  return { named, missing };
}

function changelogCoverage(changelogText, version, records) {
  const entry = parseChangelogVersions(changelogText).find((e) => e.version === version);
  if (!entry) return { entryFound: false, named: [], missing: [...records] };
  const haystack = `${entry.title}\n${entry.body}`;
  return { entryFound: true, ...recordsNamedIn(haystack, records) };
}

function releaseStatus(deps, { ref = 'HEAD', merge, records } = {}) {
  if (!merge || !String(merge).trim()) throw new Error('merge commit is required (--merge <sha>)');
  if (!Array.isArray(records) || records.length === 0 || !records.every((n) => Number.isInteger(n) && n > 0)) {
    throw new Error('at least one record number is required (--records 603,604)');
  }
  if (isBadRefValue(merge) || isBadRefValue(ref)) {
    throw new Error('merge commit and ref must not start with "-"');
  }
  const bump = carryingBump(deps, merge, iterBumpCommits(deps, ref));
  if (!bump) return { shipped: false };
  const coverage = changelogCoverage(deps.readFile(CHANGELOG), bump.version, records);
  return { shipped: true, version: bump.version, bumpCommit: bump.sha, ...coverage };
}

function formatStatusLine(result) {
  if (!result.shipped) return 'not yet in a release — bump pending';
  if (!result.entryFound) {
    return `already carried by v${result.version} — CHANGELOG has no v${result.version} entry; backfill needed: ${result.missing.map((n) => `#${n}`).join(', ')}`;
  }
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
    'is numbered for other work. Backfilled after the fact.',
    '',
  ].join('\n');
}

module.exports = {
  iterBumpCommits, findBumpCommits, carryingBump, changelogCoverage, recordsNamedIn, releaseStatus,
  formatStatusLine, formatBackfillSection, isBadRefValue, MANIFEST, CHANGELOG,
};
