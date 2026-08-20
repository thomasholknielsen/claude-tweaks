#!/usr/bin/env node
// bin/stage-item.js — write one staged proposal file into a run's staged/
// directory.
//   node bin/stage-item.js --run <run-dir> --id <kind>-<n> --file <path> [--help]
// Exit 0 on success (writes staged/<id><ext>, echoes the file path to
// stdout); 2 on a malformed invocation (missing/unsafe args, unreadable
// --file); 3 when the run dir is missing or not anchored under the main
// checkout (a worktree-local shadow — _shared/pipeline-run-dir.md's
// Anchoring section, [IL-127]).
// The staged/ half of #637 ("no CLI writes decisions.md or staged/ items");
// bin/log-decision.js is the decisions.md half, shipped under #686.
'use strict';

const fs = require('fs');
const { resolveTarget, sanitizeId, writeStagedItem } = require('./lib/stage-item/write');

const USAGE = 'usage: stage-item.js --run <run-dir> --id <kind>-<n> --file <path> [--help]\n';

function parseArgs(argv) {
  const o = { run: null, id: null, file: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => { const v = argv[++i]; return v === undefined ? null : v; };
    if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--run') o.run = next();
    else if (a === '--id') o.id = next();
    else if (a === '--file') o.file = next();
    else return { error: `unknown argument: ${a}` };
  }
  return o;
}

const realDeps = {
  cwd: () => process.cwd(),
  readFile: (p) => fs.readFileSync(p),
  mainRoot: undefined,
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s),
};

function run(argv, deps = realDeps) {
  const o = parseArgs(argv);
  if (o.error) { deps.stderr(o.error + '\n' + USAGE); return 2; }
  if (o.help) { deps.stdout(USAGE); return 0; }
  if (!o.run) { deps.stderr('stage-item.js: --run <run-dir> is required\n' + USAGE); return 2; }
  if (!o.file) { deps.stderr('stage-item.js: --file <path> is required\n' + USAGE); return 2; }
  const id = sanitizeId(o.id);
  if (!id) { deps.stderr(`stage-item.js: --id must be a plain filename stem (letters, digits, ., _, - — no path separators): ${JSON.stringify(o.id)}\n` + USAGE); return 2; }

  let content;
  try { content = deps.readFile(o.file); } catch (err) {
    deps.stderr(`stage-item.js: could not read --file ${o.file} (${err && err.message})\n`);
    return 2;
  }

  let target;
  try { target = resolveTarget({ runDir: o.run, cwd: deps.cwd(), mainRoot: deps.mainRoot }); } catch (err) {
    deps.stderr(`stage-item.js: ${err && err.message}\n`);
    return 3;
  }
  if (!target.ok) {
    if (target.reason === 'missing') deps.stderr(`stage-item.js: run dir does not exist: ${o.run}\n`);
    else deps.stderr(`stage-item.js: run dir is not anchored under the main checkout (a worktree-local shadow): ${o.run} — resolve $RUN_ROOT per _shared/pipeline-run-dir.md's Anchoring section and pass the main-checkout path\n`);
    return 3;
  }

  let result;
  try { result = writeStagedItem({ runDir: target.dir, id, sourcePath: o.file, content }); } catch (err) {
    deps.stderr(`stage-item.js: could not write staged item (${err && err.message})\n`);
    return 3;
  }
  deps.stdout(result.file + '\n');
  return 0;
}

module.exports = { run, parseArgs };

if (require.main === module) process.exitCode = run(process.argv.slice(2), realDeps);
