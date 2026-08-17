const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const CONTRACT = fs.readFileSync(
  path.join(__dirname, '..', 'skills', '_shared', 'auto-mode-contract.md'),
  'utf8',
);

function notSilencedSection() {
  const start = CONTRACT.indexOf('## What `auto` does NOT silence');
  const end = CONTRACT.indexOf('## Forbidden under auto');
  assert.notStrictEqual(start, -1, 'not-silenced heading present');
  assert.ok(end > start, 'section delimited by the Forbidden heading');
  return CONTRACT.slice(start, end);
}

test('terminal Next Actions block is on the not-silenced list', () => {
  const section = notSilencedSection();
  assert.match(section, /Terminal `## Next Actions`/);
  assert.match(section, /navigation affordance, not an approval gate/);
  assert.match(section, /outside `consoleAutoResolve`'s zero-click scope/);
});

test('row defines the recommended line and the rendering convention', () => {
  const section = notSilencedSection();
  assert.match(section, /actual next command/);
  assert.match(section, /never an `AskUserQuestion`/);
  assert.match(section, /including `unattended`/);
});
