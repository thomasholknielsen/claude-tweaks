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

// A file "performs the PUT" when it contains a `--method`, `'PUT'` pair AND
// builds a contents-API path that reaches the claims keyspace. "Reaches the
// claims keyspace" is deliberately NOT "the interpolation expression's own
// text says claim": the retired claim-engine.js wrote
// `` `repos/${owner}/${repo}/contents/${path}` `` with `path` assigned
// earlier from `claimFilePath(issueNumber)` — no `claim` substring inside the
// `${...}`, so a name-based regex misses the exact evasion this test exists to
// catch (proven by the `claim-engine.js-shaped` case below). So the second
// condition is satisfied by EITHER:
//   (a) the narrow, self-evident shape — `contents/${...claim...}` or a
//       literal `contents/claims/` path; or
//   (b) ANY interpolated `contents/${...}` path in a file that separately
//       references the shared claims-path helpers (`claimPath(`,
//       `claimFilePath(`) or a literal `claims/issue-` path anywhere.
// (b) is intentionally file-scoped rather than expression-scoped: a module
// that both composes a contents-API PUT and knows how to build a claims path
// is a claims writer regardless of which local variable carries the path.
function performsClaimsPut(source) {
  const hasPutMethod = /--method['"]?\s*,\s*['"]PUT['"]/.test(source) || /'PUT'/.test(source);
  if (!hasPutMethod) return false;
  const namesClaimsInPath = /contents\/(\$\{[^}]*claim[^}]*\}|claims\/)/i.test(source);
  const interpolatesContentsPath = /contents\/\$\{[^}]*\}/.test(source);
  const buildsClaimsPath = /claimPath\(|claimFilePath\(|claims\/issue-/i.test(source);
  return namesClaimsInPath || (interpolatesContentsPath && buildsClaimsPath);
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

// The retired claim-engine.js's exact PUT shape, reconstructed: the path is a
// plain local variable, so nothing inside the `${...}` says "claim". This is
// the evasion the header comment above always claimed to catch and (pre-#787
// amendment) did not — a permanent regression test, not an assertion of intent.
const CLAIM_ENGINE_SHAPE = [
  "const path = claimFilePath(issueNumber);",
  "const args = [",
  "  '--method', 'PUT', `repos/${owner}/${repo}/contents/${path}`,",
  "  '-f', `message=${message}`,",
  "  '-f', `content=${encoded}`,",
  "];",
].join('\n');

test('performsClaimsPut catches the retired claim-engine.js path shape (no "claim" inside the interpolation)', () => {
  assert.equal(
    /contents\/(\$\{[^}]*claim[^}]*\}|claims\/)/i.test(CLAIM_ENGINE_SHAPE),
    false,
    'precondition: the name-based regex genuinely misses this shape — otherwise this test proves nothing',
  );
  assert.equal(performsClaimsPut(CLAIM_ENGINE_SHAPE), true);
});

test('performsClaimsPut does not flag a contents-API PUT unrelated to the claims keyspace', () => {
  const unrelated = [
    "const target = docPath(name);",
    "const args = ['--method', 'PUT', `repos/${owner}/${repo}/contents/${target}`, '-f', `message=${message}`];",
  ].join('\n');
  assert.equal(performsClaimsPut(unrelated), false);
  assert.equal(performsClaimsPut("const p = claimFilePath(n); read(`contents/${p}?ref=x`);"), false, 'a read with no PUT is not a writer');
});
