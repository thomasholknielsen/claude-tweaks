#!/usr/bin/env node
// bin/log-decision.js — one appender for the canonical decisions.md entry
// schema (_shared/auto-decision-log.md's "Entry schema").
//   node bin/log-decision.js --run-dir <dir> [--spec <n>] [--skill <name>] <STATUS> <message...>
// `message` is everything after STATUS, joined with spaces — the caller
// composes the "{step or location}: {short action}. {detail}. Reversibility:
// {high|med|low}{; commit ref}" text per the schema; this CLI only prefixes
// the status word and a local HH:MM:SS timestamp, and appends the line under
// the given --skill heading (or at end of file when --skill is omitted).
// Exit 0 on success; 2 on a malformed invocation (bad STATUS, missing
// --run-dir/message, or a --spec value that doesn't resolve to an existing
// spec-{n}/ subdirectory).
'use strict';

const fs = require('fs');
const path = require('path');

const VALID_STATUSES = ['AUTO', 'STAGED', 'KEPT-PROMPT', 'SCANNED', 'REFUSED'];
const USAGE = 'usage: log-decision.js --run-dir <dir> [--spec <n>] [--skill <name>] <STATUS> <message...>\n' +
  `       STATUS is one of ${VALID_STATUSES.join('|')}\n`;

function parseArgs(argv) {
  const opts = { runDir: null, spec: null, skill: null, status: null, message: null, help: false };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--help' || a === '-h') { opts.help = true; }
    else if (a === '--run-dir') opts.runDir = next();
    else if (a === '--spec') opts.spec = next();
    else if (a === '--skill') opts.skill = next();
    else if (a.startsWith('--')) return { error: `unknown argument: ${a}` };
    else rest.push(a);
  }
  if (opts.help) return opts;
  if (rest.length === 0) return { error: 'missing STATUS argument' };
  opts.status = rest[0];
  opts.message = rest.slice(1).join(' ');
  return opts;
}

function hhmmss(date = new Date()) {
  return date.toTimeString().slice(0, 8);
}

// Insert `line` as the last entry under `## /{skill}` in `text`, creating the
// section (appended at end of file) if it doesn't exist yet. No --skill:
// append `line` at the very end of the file (a trailing newline is preserved).
function insertEntry(text, line, skill) {
  const body = text.endsWith('\n') ? text : text + '\n';
  if (!skill) return body + line + '\n';
  const heading = `## /${skill}`;
  const headingIdx = body.indexOf(heading);
  if (headingIdx === -1) {
    const sep = body.endsWith('\n\n') ? '' : (body.endsWith('\n') ? '\n' : '\n\n');
    return body + sep + heading + '\n' + line + '\n';
  }
  const afterHeadingLine = body.indexOf('\n', headingIdx) + 1;
  const nextHeadingRel = body.slice(afterHeadingLine).search(/\n## /);
  const chunkEnd = nextHeadingRel === -1 ? body.length : afterHeadingLine + nextHeadingRel + 1;
  const chunk = body.slice(afterHeadingLine, chunkEnd);
  // Insert right after the section's last content line, not after any blank
  // line(s) separating it from the next heading — trim trailing newlines
  // down to exactly one, insert there, then restore whatever was trimmed.
  const trimmedChunk = chunk.replace(/\n+$/, '\n');
  const trailing = chunk.slice(trimmedChunk.length);
  return body.slice(0, afterHeadingLine) + trimmedChunk + line + '\n' + trailing + body.slice(chunkEnd);
}

const realDeps = {
  exists: (p) => fs.existsSync(p),
  mkdirp: (p) => fs.mkdirSync(p, { recursive: true }),
  readFile: (p) => fs.readFileSync(p, 'utf8'),
  writeFile: (p, content) => fs.writeFileSync(p, content),
  now: () => new Date(),
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s),
};

function run(argv, deps = realDeps) {
  const opts = parseArgs(argv);
  if (opts.error) { deps.stderr(opts.error + '\n' + USAGE); return 2; }
  if (opts.help) { deps.stdout(USAGE); return 0; }
  if (!opts.runDir) { deps.stderr('missing required --run-dir\n' + USAGE); return 2; }
  if (!VALID_STATUSES.includes(opts.status)) { deps.stderr(`STATUS must be one of ${VALID_STATUSES.join('|')} (got "${opts.status}")\n` + USAGE); return 2; }
  if (!opts.message) { deps.stderr('missing required message text\n' + USAGE); return 2; }

  const targetDir = opts.spec ? path.join(opts.runDir, `spec-${opts.spec}`) : opts.runDir;
  if (opts.spec && !deps.exists(targetDir)) {
    deps.stderr(`log-decision.js: --spec ${opts.spec} does not resolve to an existing ${targetDir}\n`);
    return 2;
  }
  const file = path.join(targetDir, 'decisions.md');
  const line = `- ${opts.status} ${hhmmss(deps.now())} — ${opts.message}`;

  const existing = deps.exists(file) ? deps.readFile(file) : `# Auto-Decision Log — pipeline ${path.basename(opts.runDir)}\n`;
  deps.mkdirp(targetDir);
  deps.writeFile(file, insertEntry(existing, line, opts.skill));

  deps.stdout(JSON.stringify({ file, line }, null, 2) + '\n');
  return 0;
}

module.exports = { run, parseArgs, insertEntry, hhmmss };

if (require.main === module) process.exitCode = run(process.argv.slice(2), realDeps);
