'use strict';

// Pins record #648's contract: a Frontier singleton call site must never
// hard-code --unattended (the resolver reads it as "no human present" and
// unconditionally degrades Frontier, making the singleton slot dead at its
// call site). A literal is "guarded" when its surrounding text names the
// headless-only condition. \s+ spans newlines deliberately — the original
// offender in skills/feedback/session-evaluation.md wrapped mid-command
// ("frontier\n--unattended"), which a plain single-line grep misses.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

function mdFilesUnder(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...mdFilesUnder(p));
    else if (entry.name.endsWith('.md')) out.push(p);
  }
  return out;
}

test('no unguarded "frontier --unattended" literal in skills/ (whitespace-spanning)', () => {
  const root = path.join(__dirname, '..', 'skills');
  const offenders = [];
  for (const file of mdFilesUnder(root)) {
    const text = fs.readFileSync(file, 'utf8');
    const re = /frontier\s+--unattended/gi;
    let m;
    while ((m = re.exec(text)) !== null) {
      const context = text.slice(Math.max(0, m.index - 300), m.index + 300);
      if (!/headless/i.test(context)) {
        offenders.push(`${file}: index ${m.index}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `Unguarded frontier --unattended literal(s): ${offenders.join('; ')}`);
});
