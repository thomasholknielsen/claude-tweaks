'use strict';
// Pins #905's tidy backstop scan for preserved-but-unfiled upstream feedback
// drafts: the scan subsection exists with its find command, its paste-ready
// re-file/discard commands, the clean-scan explicit-zero rule, and the
// [unfiled] tag's Collection routing row.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SCAN = path.join(__dirname, '..', 'plugin', 'skills', 'tidy', 'scan-procedures.md');

test('scan-procedures.md carries the unfiled-drafts backstop', () => {
  const text = fs.readFileSync(SCAN, 'utf8');
  assert.ok(
    text.includes('### Backstop: preserved but unfiled upstream feedback drafts'),
    'backstop subsection heading missing',
  );
  assert.ok(
    text.includes('find .claude-tweaks/pipelines -path "*/staged/upstream-unfiled-*.md"'),
    'find enumeration command missing or does not match the live+archived glob shape',
  );
  assert.ok(
    text.includes('/claude-tweaks:feedback re-file the preserved draft at'),
    're-file paste-ready command template missing',
  );
  assert.ok(
    /rm '\{abs path\}'|rm "\{abs path\}"/.test(text),
    'discard paste-ready rm command template missing',
  );
  assert.ok(
    text.includes('0 unfiled upstream drafts'),
    'explicit clean-scan report line missing',
  );
  assert.ok(
    text.includes('run still live'),
    'live non-terminal run annotation missing',
  );
});

test('scan-procedures.md routes [unfiled] to Yours, no mutation staged', () => {
  const text = fs.readFileSync(SCAN, 'utf8');
  const routingSection = text.slice(text.indexOf('## Collection routing'));
  assert.ok(
    /\[unfiled\]/.test(routingSection),
    '[unfiled] tag missing from the Collection routing table',
  );
});

test('the backstop cites --pre-confirmed as illegitimate for its own command', () => {
  const text = fs.readFileSync(SCAN, 'utf8');
  const section = text.slice(
    text.indexOf('### Backstop: preserved but unfiled upstream feedback drafts'),
    text.indexOf('## Step 4.8'),
  );
  assert.ok(
    !section.includes('--pre-confirmed'),
    'the re-file command in this scan must never carry --pre-confirmed (console-callers-only)',
  );
});
