'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// AC1: "exactly one write-path module (plus its CLI wrappers)" — the check
// #723's final review ran by hand, now mechanical. Matches the CALL SHAPE
// (a `--method PUT` against a `contents/${...}` path reaching a `claims`
// keyspace), not a literal string — claim-engine.js used to evade a
// literal-string grep by building its path as `` contents/${path} ``
// (#787's amendment, AC1 repair). A CLI wrapper (bin/claim-targets.js,
// bin/release-claim.js) is exempt — it never composes the PUT arguments
// itself, only calls into the one library module that does.
const BIN_ROOT = path.join(__dirname, '..', 'plugin', 'bin');
const CLI_WRAPPER_ALLOWLIST = new Set(['claim-targets.js', 'release-claim.js']);

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

// A file "performs the PUT" when it contains both a `--method`, `'PUT'`
// pair and a template/string literal building a `contents/` path whose
// final segment reaches into a `claims` directory — matches
// `` `repos/${x}/contents/${claimPath(...)}` `` and
// `` `repos/${x}/contents/claims/issue-${n}.json` `` alike.
function performsClaimsPut(source) {
  const hasPutMethod = /--method['"]?\s*,\s*['"]PUT['"]/.test(source) || /'PUT'/.test(source);
  const hasContentsClaimsPath = /contents\/(\$\{[^}]*claim[^}]*\}|claims\/)/i.test(source);
  return hasPutMethod && hasContentsClaimsPath;
}

test('exactly one module under bin/ performs the contents-API PUT to claims/', () => {
  const files = walk(BIN_ROOT).filter((f) => !path.basename(path.dirname(f)).match(/^(tests|node_modules)$/));
  const writers = files.filter((f) => {
    const base = path.basename(f);
    if (CLI_WRAPPER_ALLOWLIST.has(base) && path.dirname(f) === BIN_ROOT) return false; // CLI wrapper, not a write-path module
    return performsClaimsPut(fs.readFileSync(f, 'utf8'));
  });
  assert.equal(writers.length, 1, `expected exactly one contents-API-PUT module under bin/, found: ${writers.map((f) => path.relative(BIN_ROOT, f)).join(', ')}`);
  assert.equal(path.basename(writers[0]), 'claim-store.js');
});
