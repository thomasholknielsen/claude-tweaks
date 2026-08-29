'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { extractArgumentHint } = require('../plugin/bin/lib/skill-audit/argument-hint');
const { listSkillDirs } = require('../plugin/bin/lib/skill-audit/skill-catalog');

const ROOT = path.join(__dirname, '..');
const CARD_PATH = path.join(ROOT, 'plugin', 'skills', 'help', 'reference-card.md');
const SKILLS_DIR = path.join(ROOT, 'plugin', 'skills');
const SKILLS = new Set(listSkillDirs(path.join(ROOT, 'plugin')));

// Rows that legitimately diverge from their skill's argument-hint. Empty by
// design (refs #564) -- every row in the corpus today is either already
// byte-identical or accidental staleness, never an intentional abbreviation.
const ALLOWLIST = [];

// Parse only the three `| Command | What it does | Takes |` tables --
// the file's fourth table ("Artifact Lifecycle") has different columns
// (Skill | Creates | Deletes) and must never be treated as a Takes-table.
//
// Row shape is asserted, not best-effort: a 3-column table row splits into
// exactly 5 cells (leading '', 3 content cells, trailing ''). A row that
// doesn't match this shape -- a missing trailing pipe, a stray unescaped
// `|` shifting columns -- throws immediately instead of being silently
// dropped from `rows`, which would otherwise let that row's drift go
// completely unchecked (refs #564 review finding: reproduced by stripping
// a row's trailing cell and confirming it vanished from the parse with no
// signal, while the old `rows.length > 10` sanity check kept passing).
function parseTakesRows(content) {
  const lines = content.split('\n');
  const rows = [];
  let inTakesTable = false;
  let takesTableCount = 0;
  for (const line of lines) {
    if (line.startsWith('| Command | What it does | Takes |')) {
      inTakesTable = true;
      takesTableCount += 1;
      continue;
    }
    if (inTakesTable && line.startsWith('|---')) continue; // separator row
    if (inTakesTable && !line.startsWith('|')) {
      inTakesTable = false; // table ended (blank line or prose)
      continue;
    }
    if (inTakesTable) {
      // Split on unescaped `|` only -- a `\|` inside the Takes cell (the
      // markdown escape for a literal pipe within alternation syntax) is
      // cell content, not a table-column delimiter. A plain split('|')
      // truncates every multi-alternative Takes cell at its first `\|`.
      const cells = line.split(/(?<!\\)\|/).map((c) => c.trim());
      if (cells.length !== 5 || cells[0] !== '' || cells[4] !== '') {
        throw new Error(`Malformed Takes-table row (expected 5 cells, got ${cells.length}): ${line}`);
      }
      rows.push({ command: cells[1], takes: cells[3] });
    }
  }
  if (takesTableCount !== 3) {
    throw new Error(`Expected exactly 3 "| Command | What it does | Takes |" tables, found ${takesTableCount}`);
  }
  return rows;
}

// First backtick command's skill name, e.g. "`/claude-tweaks:help`" -> "help",
// "`/claude-tweaks:help policy`" -> "help" (only the first colon-separated,
// space-terminated token after the namespace prefix counts as the skill name).
function resolveSkillName(command) {
  const m = command.match(/`\/(?:claude-tweaks|superpowers):([a-z0-9-]+)/);
  return m ? m[1] : null;
}

test('reference-card Takes columns match each skill\'s argument-hint byte-for-byte', () => {
  const card = fs.readFileSync(CARD_PATH, 'utf8');
  const rows = parseTakesRows(card);
  assert.ok(rows.length > 10, 'sanity check: expected the three Takes-tables to yield a substantial row set');

  const mismatches = [];
  for (const { command, takes } of rows) {
    const name = resolveSkillName(command);
    if (!name || !SKILLS.has(name)) continue; // no local skills/{name}/SKILL.md -- skip
    if (ALLOWLIST.includes(name)) continue;
    const skillMd = fs.readFileSync(path.join(SKILLS_DIR, name, 'SKILL.md'), 'utf8');
    const hint = extractArgumentHint(skillMd);
    if (hint === null) continue; // skill declares no argument-hint at all
    const takesUnescaped = takes.replace(/\\\|/g, '|');
    // Takes column is wrapped in a single backtick-code-span; strip it before comparing.
    const takesStripped = takesUnescaped.startsWith('`') && takesUnescaped.endsWith('`')
      ? takesUnescaped.slice(1, -1)
      : takesUnescaped;
    if (takesStripped !== hint) {
      mismatches.push(`${name}: card has ${JSON.stringify(takesStripped)}, argument-hint is ${JSON.stringify(hint)}`);
    }
  }

  assert.deepEqual(mismatches, [], `Reference-card drift (refs #564):\n${mismatches.join('\n')}`);
});
