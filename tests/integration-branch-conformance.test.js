'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS_DIR = path.join(__dirname, '..', 'skills');
const FRAGMENT = '_shared/integration-branch.md';
const RESOLVER = /default_branch|remote show origin|refs\/remotes\/origin\/HEAD/;

// Any file naming the GitHub default branch is answering "which branch is this
// project's current state" — unless it is on this list, which states why not.
// This is the migration ratchet: an entry is removed as its site is migrated,
// and the remainder are the genuinely exempt cases.
const ALLOWLIST = new Map([
  ['_shared/integration-branch.md', 'this is the canonical fragment itself — it documents the literal git/gh resolution commands and per-consumer fallbacks that every other site cites; it cannot cite itself'],
  ['_shared/issue-claims.md', 'claim refs need any always-present base SHA; the default branch is arbitrary but reliable, not a statement about where work lands'],
  ['_shared/routine-template-schema.md', 'quotes the unresolved fallback wording verbatim as documentation of what gets substituted'],
  ['dispatch/SKILL.md', 'same claim-ref base SHA as _shared/issue-claims.md'],
  ['init/bootstrap/step-14-cloud-routine-parity.md', 'genuinely about the GitHub default branch — cloud sessions check out the environment branch, which is a different fact'],
]);

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (entry.name.endsWith('.md')) acc.push(full);
  }
  return acc;
}

test('every file resolving the GitHub default branch cites the shared fragment or is allowlisted', () => {
  const offenders = [];
  for (const file of walk(SKILLS_DIR)) {
    const rel = path.relative(SKILLS_DIR, file);
    const text = fs.readFileSync(file, 'utf8');
    if (!RESOLVER.test(text)) continue;
    if (ALLOWLIST.has(rel)) continue;
    if (text.includes(FRAGMENT)) continue;
    offenders.push(rel);
  }
  assert.deepStrictEqual(
    offenders,
    [],
    `these files resolve the GitHub default branch without citing ${FRAGMENT}: ${offenders.join(', ')}`
  );
});

test('the allowlist has no stale entries', () => {
  const stale = [];
  for (const rel of ALLOWLIST.keys()) {
    const full = path.join(SKILLS_DIR, rel);
    if (!fs.existsSync(full)) {
      stale.push(`${rel} (file no longer exists)`);
      continue;
    }
    const text = fs.readFileSync(full, 'utf8');
    if (!RESOLVER.test(text)) {
      stale.push(`${rel} (no longer resolves a default branch — drop the entry)`);
      continue;
    }
    if (text.includes(FRAGMENT)) {
      stale.push(`${rel} (cites ${FRAGMENT} — the entry is redundant, drop it)`);
    }
  }
  assert.deepStrictEqual(stale, [], `stale allowlist entries: ${stale.join(', ')}`);
});

test('every allowlist entry carries a justification', () => {
  for (const [rel, why] of ALLOWLIST) {
    assert.ok(why && why.length > 20, `${rel} needs a real justification, got: ${JSON.stringify(why)}`);
  }
});
