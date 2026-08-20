#!/usr/bin/env node
// bin/log-decision.js — append one _shared/auto-decision-log.md entry to a run's decisions.md.
//   node bin/log-decision.js --run <run-dir> --status AUTO|STAGED|KEPT-PROMPT|SCANNED|REFUSED --text "..." \
//     [--spec <n>] [--step <text>] [--reversibility high|med|low|n/a] [--lever "<k>=<v> (<source>)"] \
//     [--section "/<skill>"] [--help]
// Exit 0 appended (entry echoed to stdout); 2 malformed invocation; 3 run dir missing or not
// anchored under the main checkout (a worktree-local shadow — _shared/pipeline-run-dir.md).
// The decisions.md half of #637; the staged/ half now ships as bin/stage-item.js.
'use strict';

const { STATUSES, formatEntry, resolveTarget, appendEntry } = require('./lib/log-decision/append');

const USAGE = 'usage: log-decision.js --run <run-dir> --status AUTO|STAGED|KEPT-PROMPT|SCANNED|REFUSED --text "..." [--spec <n>] [--step <text>] [--reversibility high|med|low|n/a] [--lever "<k>=<v> (<source>)"] [--section "/<skill>"] [--help]\n';
const REVERSIBILITY = ['high', 'med', 'low', 'n/a'];

function parseArgs(argv) {
  const o = { run: null, status: null, text: null, spec: null, step: null, reversibility: 'n/a', lever: null, section: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => { const v = argv[++i]; return v === undefined ? null : v; };
    if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--run') o.run = next();
    else if (a === '--status') o.status = next();
    else if (a === '--text') o.text = next();
    else if (a === '--spec') o.spec = next();
    else if (a === '--step') o.step = next();
    else if (a === '--reversibility') o.reversibility = next();
    else if (a === '--lever') o.lever = next();
    else if (a === '--section') o.section = next();
    else return { error: `unknown argument: ${a}` };
  }
  return o;
}

const realDeps = {
  now: () => Date.now(),
  cwd: () => process.cwd(),
  mainRoot: undefined,
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s),
};

function run(argv, deps = realDeps) {
  const o = parseArgs(argv);
  if (o.error) { deps.stderr(o.error + '\n' + USAGE); return 2; }
  if (o.help) { deps.stdout(USAGE); return 0; }
  if (!o.run) { deps.stderr('log-decision.js: --run <run-dir> is required\n' + USAGE); return 2; }
  if (!STATUSES.includes(o.status)) { deps.stderr(`log-decision.js: --status must be one of ${STATUSES.join('|')}\n` + USAGE); return 2; }
  if (!o.text || !String(o.text).trim()) { deps.stderr('log-decision.js: --text is required\n' + USAGE); return 2; }
  if (!REVERSIBILITY.includes(o.reversibility)) { deps.stderr(`log-decision.js: --reversibility must be one of ${REVERSIBILITY.join('|')}\n` + USAGE); return 2; }
  if (o.spec !== null && !/^\d+$/.test(String(o.spec))) { deps.stderr('log-decision.js: --spec must be a record number\n' + USAGE); return 2; }
  let target;
  try { target = resolveTarget({ runDir: o.run, cwd: deps.cwd(), mainRoot: deps.mainRoot }); } catch (err) { deps.stderr(`log-decision.js: ${err && err.message}\n`); return 3; }
  if (!target.ok) {
    if (target.reason === 'missing') deps.stderr(`log-decision.js: run dir does not exist: ${o.run}\n`);
    else deps.stderr(`log-decision.js: run dir is not anchored under the main checkout (a worktree-local shadow): ${o.run} — resolve $RUN_ROOT per _shared/pipeline-run-dir.md's Anchoring section and pass the main-checkout path\n`);
    return 3;
  }
  const entry = formatEntry({ status: o.status, now: deps.now(), step: o.step, spec: o.spec, text: o.text, reversibility: o.reversibility, lever: o.lever });
  try { appendEntry({ runDir: o.run, section: o.section, entry }); } catch (err) { deps.stderr(`log-decision.js: could not write decisions.md (${err && err.message})\n`); return 3; }
  deps.stdout(entry + '\n');
  return 0;
}

module.exports = { run, parseArgs };

if (require.main === module) process.exitCode = run(process.argv.slice(2), realDeps);
