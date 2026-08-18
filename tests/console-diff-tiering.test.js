'use strict';
// Pins #906's reversibility-tiered patch-display rule: the canonical statement
// in wrap-up/console-template.md, the citation (not restatement) in
// flow/multispec-console-template.md, and the repo-wide absence of the old
// unconditional show-every-full-patch phrasing (whitespace-normalized, so a
// restatement wrapped mid-phrase cannot slip through).
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const CT = path.join(ROOT, 'plugin', 'skills', 'wrap-up', 'console-template.md');
const MSCT = path.join(ROOT, 'plugin', 'skills', 'flow', 'multispec-console-template.md');

function mdFilesUnder(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...mdFilesUnder(p));
    else if (entry.name.endsWith('.md')) out.push(p);
  }
  return out;
}

test('console-template.md states the reversibility-tiered display rule once, in full', () => {
  const text = fs.readFileSync(CT, 'utf8');
  assert.ok(
    text.includes('tiered by the item\'s recorded reversibility'),
    'tier rule heading clause missing',
  );
  assert.ok(
    text.includes('cat "{absolute stagePath}"'),
    'paste-ready view command for the high tier missing',
  );
  assert.ok(
    text.includes('fail toward showing more'),
    'fail-open default (unrecorded reversibility renders full) missing',
  );
  assert.ok(
    /`decisions\.md` entry — correlated by `stagePath` basename/.test(text),
    'the decisions.md consultation step of the resolution ladder missing — an implementation that always renders full for engine rows must fail this pin',
  );
  assert.ok(
    text.includes('no `stagePath` at all also renders in full'),
    'the no-stagePath full-render branch missing',
  );
});

test('multispec-console-template.md cites the canonical rule instead of restating it', () => {
  const text = fs.readFileSync(MSCT, 'utf8');
  assert.ok(
    text.includes('console-template.md') && text.includes('reversibility-tiered'),
    'multispec template must cite wrap-up/console-template.md\'s reversibility-tiered rule',
  );
});

test('the old unconditional full-patch phrasing is gone from plugin/**/*.md', () => {
  const OLD = 'show the full patch / diff for each pending item';
  const offenders = [];
  for (const f of mdFilesUnder(path.join(ROOT, 'plugin'))) {
    const normalized = fs.readFileSync(f, 'utf8').replace(/\s+/g, ' ');
    if (normalized.includes(OLD)) offenders.push(path.relative(ROOT, f));
  }
  assert.deepStrictEqual(offenders, [], 'unconditional full-patch rule restated in: ' + offenders.join(', '));
});
