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
//
// A check confined to `cwd` alone missed the common case: `npm test` itself
// walks up to the nearest package.json, but a bare
// `fs.readFileSync(cwd + '/package.json')` does not — so running the probe
// from a subdirectory silently reported `no test command detected` on a
// repo that plainly has one. Ascend looking for the nearest package.json
// carrying a non-empty scripts.test, same as npm does — but stop at the
// repository boundary (a `.git` entry — a file for a linked worktree, a
// directory for the main checkout; `fs.existsSync` covers either) rather
// than the filesystem root. Walking past this repo into an enclosing
// project's package.json would be its own wrong answer, not a more honest
// one — falling back to the filesystem root only when no `.git` boundary
// exists anywhere above the starting directory.
//
// The starting directory is resolved to its real path ONCE, up front, via
// fs.realpathSync — every subsequent step is a pure path.dirname() string
// operation on that already-canonical path, so the ascent never re-resolves
// a symlink partway up and cannot be steered outside the intended tree by
// one.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

function readTestScript(dir) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    return Boolean(pkg && pkg.scripts && typeof pkg.scripts.test === 'string' && pkg.scripts.test.trim());
  } catch {
    return false;
  }
}

function isRepoBoundary(dir) {
  return fs.existsSync(path.join(dir, '.git'));
}

function hasTestScript(cwd) {
  let dir;
  try {
    dir = fs.realpathSync(cwd);
  } catch {
    dir = path.resolve(cwd);
  }
  for (;;) {
    if (readTestScript(dir)) return true;
    if (isRepoBoundary(dir)) return false;
    const parent = path.dirname(dir);
    if (parent === dir) return false; // filesystem root — no repo boundary ever found
    dir = parent;
  }
}

module.exports = { hasTestScript };
