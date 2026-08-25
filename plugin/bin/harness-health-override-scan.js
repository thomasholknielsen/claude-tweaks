#!/usr/bin/env node
// bin/harness-health-override-scan.js — mechanical detection of a bypassed
// CLAUDE.md pipeline override: parses the "route to `/X`, never `/Y`" prose
// convention out of CLAUDE.md, then checks the skill_invoked event ledger
// (bin/lib/hooks/skill-invocation.js) across this checkout's pipeline run
// directories for a case where Y was invoked but X never was. See
// bin/lib/harness-health/override-bypass.js for the full contract/scope.
//
// Detection only — this CLI never files anything. harness-health/SKILL.md's
// "Override-bypass check" reads this command's JSON output and applies its
// own dedup + filing procedure, the same shape its "Policy schema check"
// paragraph already uses for another mechanical, every-firing check.
//   node bin/harness-health-override-scan.js [--root <dir>] [--help]
// Exit 0 always on a successful scan (prints `{ overrides, bypasses }` JSON
// to stdout, `bypasses: []` when none found or CLAUDE.md declares no
// recognized override — that is the expected, common case, not an error);
// 2 malformed invocation.
'use strict';

const fs = require('fs');
const path = require('path');
const {
  parseDeclaredOverrides, listPipelineRunDirs, collectSkillInvocations, detectBypasses,
} = require('./lib/harness-health/override-bypass');

const USAGE = 'usage: harness-health-override-scan.js [--root <dir>] [--help]\n';

function parseArgs(argv) {
  const o = { root: process.cwd(), help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--root') o.root = argv[++i];
    else return { error: `unknown argument: ${a}` };
  }
  return o;
}

const realDeps = {
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s),
  readClaudeMd: (root) => {
    try { return fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8'); } catch { return ''; }
  },
};

function run(argv, deps = realDeps) {
  const o = parseArgs(argv);
  if (o.error) { deps.stderr(`harness-health-override-scan.js: ${o.error}\n${USAGE}`); return 2; }
  if (o.help) { deps.stdout(USAGE); return 0; }

  const claudeMd = deps.readClaudeMd(o.root);
  const overrides = parseDeclaredOverrides(claudeMd);
  const runDirs = listPipelineRunDirs(o.root);
  const invocations = collectSkillInvocations(runDirs);
  const bypasses = overrides.length ? detectBypasses({ overrides, invocations }) : [];

  deps.stdout(`${JSON.stringify({ overrides, bypasses }, null, 2)}\n`);
  return 0;
}

module.exports = { run, parseArgs };
if (require.main === module) process.exitCode = run(process.argv.slice(2), realDeps);
