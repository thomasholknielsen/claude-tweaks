#!/usr/bin/env node
// bin/tidy-report-lint.js — mechanical conformance linter for a rendered
// tidy report (plugin/skills/tidy/step-6-auto.md's "Conformance scan"
// section, #731). Reads a rendered report from stdin or a path argument and
// emits one line per failing conformance row, following the same
// prose-rule-to-mechanical-check pattern bin/residue.js and the skill-audit
// modules (bin/lib/skill-audit/) already establish in this repo.
//
// This is the mechanical HALF of that conformance scan, not a replacement
// for it — the row-by-row check logic lives in
// ./lib/tidy-report-lint/rules.js, named after the table's own `Rule`
// column so the two stay greppable against each other. That file's header
// documents the two rows ("Command alone", "Batch only where allowed") that
// are necessarily heuristic rather than fully mechanical.
//
// Shells out to nothing (no `gh`, no `git`) — this CLI reads only the text
// it is given.
//
// Exit codes: 0 conformant (no issues, nothing printed), 1 non-conformant
// (issues printed to stdout, one per line), 2 malformed invocation (bad
// args, unreadable path, or no stdin available).
'use strict';

const fs = require('node:fs');
const { lintReport } = require('./lib/tidy-report-lint/rules');

const USAGE = 'usage: tidy-report-lint.js [path]  (reads stdin when no path is given)\n';

function run(argv, deps) {
  if (argv.includes('--help') || argv.includes('-h')) {
    deps.stdout(USAGE);
    return 0;
  }
  if (argv.length > 1) {
    deps.stderr(USAGE);
    return 2;
  }

  let text;
  try {
    if (argv.length === 1) {
      text = deps.readFileSync(argv[0], 'utf8');
    } else {
      if (deps.stdinIsTTY()) {
        deps.stderr(`tidy-report-lint.js: no path given and stdin is a terminal\n${USAGE}`);
        return 2;
      }
      text = deps.readFileSync(0, 'utf8');
    }
  } catch (err) {
    deps.stderr(`tidy-report-lint.js: ${err.message}\n`);
    return 2;
  }

  const issues = lintReport(text);
  for (const issue of issues) deps.stdout(`${issue}\n`);
  return issues.length === 0 ? 0 : 1;
}

if (require.main === module) {
  process.exitCode = run(process.argv.slice(2), {
    readFileSync: fs.readFileSync,
    stdinIsTTY: () => Boolean(process.stdin.isTTY),
    stdout: (s) => process.stdout.write(s),
    stderr: (s) => process.stderr.write(s),
  });
}

module.exports = { run };
