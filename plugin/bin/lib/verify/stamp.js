// plugin/bin/lib/verify/stamp.js — the runner-written verification pass
// stamp (#1921). bin/verify.js is the ONLY writer: an agent-written stamp is a
// claim, a runner-written one is an artifact bound to the report it summarizes
// (#1784: the agent stamped a failing run). JSON is canonical from this
// release; the bare-SHA twin (STAMP_LEGACY_NAME) is written for one minor
// release so an installed build running older skill prose still finds it —
// removal condition in skills/_shared/policy-deprecations.md. writeStamp's
// `deps.legacy` (default true) gates that twin: bin/verify.js passes `false`
// for a non-full --scope run (#1922) so a narrowed pass never repoints the
// bare file — it is left naming the last real FULL pass.
//
// Read fallback order (spec Gotchas): JSON present and parses -> use it
// (regardless of the bare file); JSON present but unparseable -> null (no
// fallback); JSON absent -> try the bare file; bare file absent or not a
// 40-hex SHA -> null. Fail toward absence, like count-stamp.js.
'use strict';

const fs = require('fs');
const path = require('path');
const { writeJsonAtomic } = require('./atomic-write');

const STAMP_JSON_NAME = 'claude-tweaks-verify-pass.json';
const STAMP_LEGACY_NAME = 'claude-tweaks-verify-pass';
const SHA_RE = /^[0-9a-f]{40}$/;

// Derived fields (sha, dirty) come from the report and are assigned AFTER
// the caller-supplied fields so a caller can never override them (the same
// rule appendEvent states in bin/lib/hooks/context.js).
function composeStamp({
  report, scope, fullSha, base, changedFiles, suitesRun, flakyRetried, reportPath, at,
}) {
  return {
    sha: report.sha,
    dirty: report.dirty,
    scope,
    fullSha,
    base,
    changedFiles,
    suitesRun,
    flakyRetried,
    reportPath,
    at,
  };
}

function writeStamp(gitDir, stamp, deps = {}) {
  const fsImpl = deps.fsImpl || fs;
  const legacy = deps.legacy === undefined ? true : deps.legacy;
  const jsonPath = path.join(gitDir, STAMP_JSON_NAME);
  const legacyPath = path.join(gitDir, STAMP_LEGACY_NAME);
  writeJsonAtomic(jsonPath, stamp, fsImpl);
  if (legacy) {
    const tmp = `${legacyPath}.tmp`;
    fsImpl.writeFileSync(tmp, `${stamp.sha}\n`);
    fsImpl.renameSync(tmp, legacyPath);
  }
  return { jsonPath, legacyPath };
}

function readStamp(gitDir, fsImpl = fs) {
  const jsonPath = path.join(gitDir, STAMP_JSON_NAME);
  let jsonText = null;
  try { jsonText = fsImpl.readFileSync(jsonPath, 'utf8'); } catch { jsonText = null; }
  if (jsonText !== null) {
    let parsed;
    try { parsed = JSON.parse(jsonText); } catch { return null; }
    if (typeof parsed !== 'object' || parsed === null || typeof parsed.sha !== 'string') return null;
    return parsed;
  }
  let bare;
  try { bare = String(fsImpl.readFileSync(path.join(gitDir, STAMP_LEGACY_NAME), 'utf8')).trim(); } catch { return null; }
  if (!SHA_RE.test(bare)) return null;
  return { sha: bare, scope: 'full', legacy: true };
}

module.exports = {
  composeStamp, writeStamp, readStamp, STAMP_JSON_NAME, STAMP_LEGACY_NAME,
};
