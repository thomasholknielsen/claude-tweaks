// bin/lib/residue/detect-test-script.js — whether the project defines a test
// script at all, checked BEFORE ever invoking `npm test`.
//
// `npm test` with no `scripts.test` key exits non-zero for a reason that has
// nothing to do with this repo's code — verified live: a directory with no
// package.json produced a fabricated `subject: "test suite exit 254"`
// finding instead of the `unknown` the design's error table requires.
// Node-only by design; multi-ecosystem detection is explicitly out of scope
// here (a future ecosystem's own absence check is that ecosystem's addition,
// not a reason to widen this one speculatively).
'use strict';

const fs = require('node:fs');
const path = require('node:path');

function hasTestScript(cwd) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
    return Boolean(pkg && pkg.scripts && typeof pkg.scripts.test === 'string' && pkg.scripts.test.trim());
  } catch {
    return false;
  }
}

module.exports = { hasTestScript };
