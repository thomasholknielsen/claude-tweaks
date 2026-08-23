// bin/lib/hooks/staged-inventory.js — reconciles decisions.md's STAGED
// entries against staged/'s actual file inventory (#1269).
//
// Why this exists: log-decision.js (writes the decisions.md STAGED line)
// and stage-item.js (writes the actual staged/{name} file) are two
// independent calls with no atomicity between them. A session crash
// between the two leaves decisions.md claiming a staged proposal exists
// when the file was never written -- observed directly: review's Step 3
// lens dispatch logged a STAGED line for staged/review-defer-1.md, but the
// session crashed before the file was written, and the next wrap-up run
// had to manually re-derive the missing proposal from decisions.md's
// prose. This module is the check that should have caught it.
//
// Deliberately separate from resume-freshness.js / checkResumeFreshness:
// that function's return shape is pinned by existing tests
// (assert.deepStrictEqual against exact objects) and its CLI verb
// (check-resume-freshness) is documented to write exactly one line to
// stdout. Folding this concern in there would break both. This module and
// its own CLI verb (check-staged-inventory) are additive and orthogonal --
// a staged-inventory mismatch never blocks a resume, it only surfaces.
'use strict';
const fs = require('fs');
const path = require('path');

// Matches "Stage path: staged/{name}." anywhere in decisions.md, capturing
// the path non-greedily up to a literal period that is followed by
// whitespace or end-of-string -- tolerates trailing prose on the same line
// ("... Stage path: staged/foo.patch. Reversibility: high.") and filenames
// that themselves contain dots (extensions like ".patch"/".md").
//
// Declared once and reused via matchAll (not exec in a loop) -- matchAll
// operates on an internal clone and never mutates this regex's lastIndex,
// so reuse across calls is safe.
const STAGE_PATH_RE = /Stage path:\s+(staged\/\S+?)\.(?=\s|$)/g;

function parseStagePaths(text) {
  return [...text.matchAll(STAGE_PATH_RE)].map((match) => match[1]);
}

// runDir: the pipeline run directory (holding decisions.md and staged/).
// Returns { checked, missing } -- missing is empty when every named STAGED
// destination exists on disk, including when decisions.md is absent or
// carries no STAGED lines at all (nothing to reconcile).
function checkStagedInventory(runDir) {
  const decisionsPath = path.join(runDir, 'decisions.md');
  if (!fs.existsSync(decisionsPath)) return { checked: 0, missing: [] };
  const text = fs.readFileSync(decisionsPath, 'utf8');
  const staged = parseStagePaths(text);
  const missing = staged.filter((rel) => !fs.existsSync(path.join(runDir, rel)));
  return { checked: staged.length, missing };
}

module.exports = { checkStagedInventory, parseStagePaths };
