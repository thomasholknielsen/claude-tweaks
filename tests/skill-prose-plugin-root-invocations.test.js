// tests/skill-prose-plugin-root-invocations.test.js — pins #1170: skill prose must never
// invoke a plugin bin via a repo-relative `node plugin/bin/…` path. In any consumer project
// running the installed plugin there is no plugin/ subtree, so the invocation dies with
// MODULE_NOT_FOUND — and degrade clauses ("log a warning and continue") swallow it, so the
// step silently never runs anywhere but this repo itself. The `"${CLAUDE_PLUGIN_ROOT}/bin/…"`
// form is the only install-safe invocation.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS = path.join(__dirname, '..', 'plugin', 'skills');

// Documented exemptions — file (relative to plugin/skills/) -> why repo-relative is correct there.
// release.js is a maintainer command run from a clean main checkout of the claude-tweaks repo
// itself (CLAUDE.md `## Releasing`, docs/releasing.md use the identical form), never from an
// installed consumer plugin.
const EXEMPT = new Map([
  ['flow/summary-template.md', /node plugin\/bin\/release\.js/],
]);

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.name.endsWith('.md')) yield p;
  }
}

// A `compose-context.js` invocation whose source argument is a repo-relative `plugin/skills/…`
// path is install-dead the same way a repo-relative `node plugin/bin/…` invocation is (#1170):
// it resolves only inside a claude-tweaks checkout, so the call fails (and the fallback fires)
// in every installed consumer. The install-safe form is
// `"${CLAUDE_PLUGIN_ROOT}/skills/_shared/{file}.md"` (docs/skill-authoring.md's Call-site form).
function isComposeContextSourceRepoRelative(line) {
  return line.includes('compose-context.js') && line.includes(' plugin/skills/');
}

test('no skill prose invokes a bin via a repo-relative `node plugin/bin/` path (install-dead — #1170)', () => {
  const offenders = [];
  for (const file of walk(SKILLS)) {
    const rel = path.relative(SKILLS, file);
    // Normalize the one wrap shape that hid the original bug: `node` at end-of-line,
    // `plugin/bin/…` starting the next line (pr-early-run-lifecycle.md's own line wrap).
    const text = fs.readFileSync(file, 'utf8').replace(/node\s*\n\s*plugin\/bin\//g, 'node plugin/bin/');
    const exemptRe = EXEMPT.get(rel);
    for (const line of text.split('\n')) {
      const isInvokedRepoRelative = line.includes('node plugin/bin/');
      const isExempted = exemptRe && exemptRe.test(line);
      if (isInvokedRepoRelative && !isExempted) {
        offenders.push(`${rel}: ${line.trim().slice(0, 120)}`);
      }
      if (isComposeContextSourceRepoRelative(line) && !isExempted) {
        offenders.push(`compose-context source arg is repo-relative: ${rel}: ${line.trim().slice(0, 120)}`);
      }
    }
  }
  assert.deepStrictEqual(offenders, [], `repo-relative plugin/bin invocations in skill prose:\n${offenders.join('\n')}`);
});

test('the exemption list only exempts lines that still exist (no stale exemptions)', () => {
  for (const [rel, re] of EXEMPT) {
    const text = fs.readFileSync(path.join(SKILLS, rel), 'utf8');
    assert.ok(re.test(text), `stale exemption: ${rel} no longer contains ${re}`);
  }
});

test('the compose-context source-arg check can actually go red (predicate proof)', () => {
  const repoRelative = 'node "${CLAUDE_PLUGIN_ROOT}/bin/compose-context.js" --run x --step y plugin/skills/_shared/a.md';
  const installSafe = 'node "${CLAUDE_PLUGIN_ROOT}/bin/compose-context.js" --run x --step y "${CLAUDE_PLUGIN_ROOT}/skills/_shared/a.md"';
  const offendersRepoRelative = [repoRelative].filter(isComposeContextSourceRepoRelative);
  const offendersInstallSafe = [installSafe].filter(isComposeContextSourceRepoRelative);
  assert.equal(offendersRepoRelative.length, 1);
  assert.equal(offendersInstallSafe.length, 0);
});
