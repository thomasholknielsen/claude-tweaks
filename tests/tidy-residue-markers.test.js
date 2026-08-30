'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// #1493: tidy residue markers + `--approve`. This file currently pins only
// the `.gitignore` carve-out that makes a `*-tidy-standalone*` run's own
// audit files (`decisions.md`, `report.md`, `staged/**`) trackable — Task 4
// extends this suite with the rest of #1493's coverage (needs:decision
// marker writes, loop-safety skip, etc.). Don't assume this is the whole
// #1493 test surface.

const ROOT = path.join(__dirname, '..');
const GITIGNORE = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
const LINES = GITIGNORE.split('\n');

// Rule-shape pin, not a behavioral git-ignore check (that's already covered
// live by Task 2's own `git check-ignore -v` / `git add -n` probes at
// implementation time — see the task report). This test's job is narrower:
// make sure a later `.gitignore` edit can't silently widen or drop the
// narrow top-level-pipelines carve-out without a test going red here.
test('.gitignore: tidy-standalone carve-out lines are present verbatim, at top-level pipelines depth', () => {
  const expectedCarveOut = [
    '!.claude-tweaks/pipelines/*-tidy-standalone*/decisions.md',
    '!.claude-tweaks/pipelines/*-tidy-standalone*/report.md',
    '!.claude-tweaks/pipelines/*-tidy-standalone*/staged/',
    '!.claude-tweaks/pipelines/*-tidy-standalone*/staged/**',
  ];
  for (const line of expectedCarveOut) {
    assert.ok(
      LINES.includes(line),
      `expected .gitignore to carry the exact carve-out line: ${line}`,
    );
  }

  // Never spec-*/-nested: a tidy standalone run dir is never a multi-spec
  // parent, so the carve-out must not also target a spec-*/-nested shape.
  for (const line of expectedCarveOut) {
    assert.ok(
      !line.includes('/spec-'),
      `tidy-standalone carve-out line must stay top-level, not spec-*/-nested: ${line}`,
    );
  }
});

test('.gitignore: the blanket pipelines-contents ignore the carve-out depends on is still present', () => {
  // The carve-out above only means anything as a narrow exception punched
  // into this still-active blanket rule. If a future edit ever removes or
  // loosens this line (e.g. widens it, or deletes it so everything under
  // pipelines/*/ becomes trackable by default), the carve-out silently stops
  // being narrow — this line is what makes it narrow in the first place.
  assert.ok(
    LINES.includes('.claude-tweaks/pipelines/*/*'),
    'expected the surviving blanket-ignore line `.claude-tweaks/pipelines/*/*` — the ' +
      'tidy-standalone carve-out is a narrow exception punched into this rule, not a replacement for it',
  );
});
