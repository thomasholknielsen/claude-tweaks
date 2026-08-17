// tests/wrap-up-registry-pin.test.js
//
// Binds skills/wrap-up/SKILL.md's Phase 2 registry table to the code registry
// it documents (bin/lib/wrap-up/registry.js). The table is prose restating a
// data structure — target, judge file, and disposition per curation row — and
// nothing enforced that the two stay in sync. A row added, reordered, or
// edited on one side and not the other would silently misdescribe the engine's
// actual behaviour to anyone reading SKILL.md. [IL-80] warns against reading
// live production prose in a test — it's acceptable HERE, and only here,
// because the table IS the declared contract whose update is the intended
// action when the registry changes (see the house pattern in
// tests/hooks-gate-coverage.test.js).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { REGISTRY } = require('../plugin/bin/lib/wrap-up/registry');

const SKILL_PATH = path.join(__dirname, '..', 'plugin', 'skills', 'wrap-up', 'SKILL.md');
const skill = fs.readFileSync(SKILL_PATH, 'utf8');

// Strip markdown inline formatting (backticks, bold) from a table cell so
// `` `apply-or-stage` `` compares equal to the raw string 'apply-or-stage'.
function stripFormatting(cell) {
  return cell.trim().replace(/`/g, '').replace(/\*\*/g, '').trim();
}

function splitRow(line) {
  // A markdown table row: leading/trailing '|' are optional-ish but SKILL.md's
  // rows are fully piped ('| a | b | c |'). Drop the empty strings produced by
  // the leading/trailing delimiter.
  const cells = line.split('|').map((c) => c.trim());
  if (cells.length && cells[0] === '') cells.shift();
  if (cells.length && cells[cells.length - 1] === '') cells.pop();
  return cells;
}

function proseRows() {
  const lines = skill.split('\n');
  const headerIdx = lines.findIndex(
    (l) => l.includes('| Target |') && l.includes('| Judge |')
  );
  assert.ok(
    headerIdx !== -1,
    'SKILL.md must contain a registry table whose header row has both "| Target |" and "| Judge |"'
  );

  const header = splitRow(lines[headerIdx]);
  const targetCol = header.indexOf('Target');
  const judgeCol = header.indexOf('Judge');
  const dispositionCol = header.indexOf('Disposition');
  assert.ok(
    targetCol !== -1 && judgeCol !== -1 && dispositionCol !== -1,
    'registry table header must have Target, Judge, and Disposition columns'
  );

  // Row after the header is the '|---|---|' separator; body rows start after it.
  const rows = [];
  for (let i = headerIdx + 2; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim().startsWith('|')) break; // table ended
    const cells = splitRow(line);
    rows.push({
      target: stripFormatting(cells[targetCol] || ''),
      judge: stripFormatting(cells[judgeCol] || ''),
      disposition: stripFormatting(cells[dispositionCol] || ''),
    });
  }
  return rows;
}

test('SKILL.md registry table row order matches registry.js row order', () => {
  const prose = proseRows();
  assert.deepStrictEqual(
    prose.map((p) => p.target),
    REGISTRY.map((r) => r.target),
    'SKILL.md\'s registry table target column, read top to bottom, must match REGISTRY\'s target sequence exactly — a swapped or reordered row will show up as a full-sequence diff here'
  );
});

test('SKILL.md registry table matches registry.js — same rows, same fields', () => {
  const prose = proseRows();
  assert.strictEqual(
    prose.length,
    REGISTRY.length,
    `SKILL.md's registry table has ${prose.length} rows, registry.js has ${REGISTRY.length} — add or remove a row in both places`
  );
  prose.forEach((p, i) => {
    const r = REGISTRY[i];
    assert.strictEqual(
      p.target,
      r.target,
      `row ${i} ("${r.target}"): SKILL.md target "${p.target}" !== registry.js target "${r.target}"`
    );
    assert.ok(
      p.judge.includes(r.judge),
      `row ${i} ("${r.target}"): SKILL.md judge cell "${p.judge}" does not include registry.js judge "${r.judge}"`
    );
    assert.strictEqual(
      p.disposition,
      r.disposition,
      `row ${i} ("${r.target}"): SKILL.md disposition "${p.disposition}" !== registry.js disposition "${r.disposition}"`
    );
  });
});

test('every judge file the registry names exists in skills/wrap-up/', () => {
  for (const r of REGISTRY) {
    assert.ok(
      fs.existsSync(path.join(__dirname, '..', 'plugin', 'skills', 'wrap-up', r.judge)),
      `registry.js names judge "${r.judge}" for target "${r.target}" but skills/wrap-up/${r.judge} does not exist`
    );
  }
});
