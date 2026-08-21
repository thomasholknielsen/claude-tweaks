#!/usr/bin/env node
// bin/apply-refine-labels.js — apply a batch of `gh issue edit`/`gh issue
// comment` actions from one structured JSON intermediate in a single
// dispatched call, replacing backlog refine's one-paste-line-per-record
// blocks (#844). Follows bin/materialize.js's run(argv, deps) + injectable-
// runner + --run anchoring pattern (gh-api-module-pattern skill).
//   node bin/apply-refine-labels.js <actions.json> [--run <run-dir>] [--repo owner/name] [--help]
// actions.json: a JSON array of
//   { issue: number, addLabels?: string[], removeLabels?: string[], commentFile?: string }
// — each action needs at least one of addLabels/removeLabels/commentFile.
// `--run <run-dir>` is optional: when given, one AUTO decisions.md line is
// appended per successfully-applied action, under the /backlog heading — the
// run dir must resolve under the main checkout (#790/[IL-127]), refused
// loudly otherwise, before any `gh` call.
// Exit 0 with a {ok, failed} JSON summary on stdout — one failed action never
// aborts the batch; 1 when the actions file can't be read or is malformed;
// 2 on a bad invocation, an unanchored --run, or a missing `gh`.
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const wtDetect = require('./lib/hooks/worktree-detect');
const { appendEntry, formatEntry } = require('./lib/log-decision/append');
const { parseRepo, ghAvailable, remoteUrl } = require('./lib/repo-resolve');

const USAGE = 'usage: apply-refine-labels.js <actions.json> [--run <run-dir>] [--repo owner/name] [--help]\n';

function parseArgs(argv) {
  const opts = { file: null, run: null, runEmpty: false, repo: null, help: false };
  if (argv[0] === '--help' || argv[0] === '-h') { opts.help = true; return opts; }
  if (argv[0] === undefined || argv[0].startsWith('--')) return { error: 'missing <actions.json> argument' };
  opts.file = argv[0];
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--run') {
      const val = next();
      if (val === undefined || val.startsWith('--')) return { error: '--run requires a value' };
      opts.run = val === '' ? null : val;
      opts.runEmpty = val === '';
    }
    else if (a === '--repo') opts.repo = next();
    else return { error: `unknown argument: ${a}` };
  }
  return opts;
}

function isPosInt(n) { return Number.isInteger(n) && n > 0; }

function hasItems(arr) { return Array.isArray(arr) && arr.length > 0; }

function validateAction(a, i) {
  if (!a || typeof a !== 'object') return `action[${i}]: not an object`;
  if (!isPosInt(a.issue)) return `action[${i}]: issue must be a positive integer`;
  const hasAdd = hasItems(a.addLabels);
  const hasRemove = hasItems(a.removeLabels);
  const hasComment = typeof a.commentFile === 'string' && a.commentFile.trim() !== '';
  if (!hasAdd && !hasRemove && !hasComment) return `action[${i}] (#${a.issue}): must set addLabels, removeLabels, or commentFile`;
  return null;
}

const realDeps = {
  gh: (args) => execFileSync('gh', args, { encoding: 'utf8' }),
  ghAvailable,
  remoteUrl,
  readFile: (f) => fs.readFileSync(f, 'utf8'),
  cwd: () => process.cwd(),
  mainRoot: (cwd) => wtDetect.mainCheckoutRoot(cwd),
  isAnchored: (resolvedPath, mainRoot) => wtDetect.isAnchoredUnderRoot(resolvedPath, mainRoot),
  now: () => Date.now(),
  appendEntry,
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s),
};

// argv -> exit code. All I/O through deps so tests never touch gh, git, or the filesystem.
function run(argv, deps = realDeps) {
  const opts = parseArgs(argv);
  if (opts.error) { deps.stderr(opts.error + '\n' + USAGE); return 2; }
  if (opts.help) { deps.stdout(USAGE); return 0; }

  let runDir = null;
  if (opts.runEmpty) {
    deps.stderr('apply-refine-labels.js: --run was empty — proceeding without run-dir/decisions.md logging\n');
  }
  if (opts.run) {
    // #790/[IL-127]: reject an unanchored --run before any gh/network work,
    // same guard bin/materialize.js's --run-dir applies.
    const cwd = deps.cwd();
    const mainRoot = deps.mainRoot(cwd);
    if (!mainRoot) {
      deps.stderr(`apply-refine-labels.js: ${wtDetect.unanchoredRunDirNoRepoMessage(cwd)}\n`);
      return 2;
    }
    const resolved = path.resolve(cwd, opts.run);
    if (!deps.isAnchored(resolved, mainRoot)) {
      deps.stderr(`apply-refine-labels.js: ${wtDetect.unanchoredRunDirShadowMessage(opts.run, mainRoot)}\n`);
      return 2;
    }
    runDir = resolved;
  }

  if (!deps.ghAvailable()) { deps.stderr('apply-refine-labels.js: `gh` is required\n'); return 2; }

  let raw;
  try { raw = deps.readFile(opts.file); } catch (err) {
    deps.stderr(`apply-refine-labels.js: could not read ${opts.file} (${err && err.message ? err.message : err})\n`);
    return 1;
  }
  let actions;
  try { actions = JSON.parse(raw); } catch (err) {
    deps.stderr(`apply-refine-labels.js: ${opts.file} is not valid JSON (${err && err.message ? err.message : err})\n`);
    return 1;
  }
  if (!Array.isArray(actions) || actions.length === 0) {
    deps.stderr(`apply-refine-labels.js: ${opts.file} must be a non-empty JSON array of actions\n`);
    return 1;
  }
  for (let i = 0; i < actions.length; i++) {
    const err = validateAction(actions[i], i);
    if (err) { deps.stderr(`apply-refine-labels.js: ${err}\n`); return 1; }
  }

  let remote = null;
  if (!opts.repo) { try { remote = deps.remoteUrl(); } catch { remote = null; } }
  const repoSpec = opts.repo ? parseRepo(`github.com/${opts.repo}`) : parseRepo(remote);
  if (!repoSpec) { deps.stderr('apply-refine-labels.js: could not resolve owner/repo — pass --repo owner/name\n'); return 2; }
  const repoFlag = `${repoSpec.owner}/${repoSpec.repo}`;

  const ok = [];
  const failed = [];
  for (const action of actions) {
    try {
      const hasAdd = hasItems(action.addLabels);
      const hasRemove = hasItems(action.removeLabels);
      if (hasAdd || hasRemove) {
        const editArgs = ['issue', 'edit', String(action.issue), '--repo', repoFlag];
        for (const l of action.addLabels || []) editArgs.push('--add-label', l);
        for (const l of action.removeLabels || []) editArgs.push('--remove-label', l);
        deps.gh(editArgs);
      }
      if (action.commentFile) {
        deps.gh(['issue', 'comment', String(action.issue), '--repo', repoFlag, '--body-file', action.commentFile]);
      }
      ok.push(action.issue);
      if (runDir) {
        const summaryParts = [];
        if (hasAdd) summaryParts.push(`+${action.addLabels.join(' +')}`);
        if (hasRemove) summaryParts.push(`-${action.removeLabels.join(' -')}`);
        if (action.commentFile) summaryParts.push('comment posted');
        try {
          deps.appendEntry({
            runDir,
            section: '/backlog',
            entry: formatEntry({
              status: 'AUTO',
              now: deps.now(),
              step: 'apply-refine-labels',
              text: `#${action.issue}: applied ${summaryParts.join(', ')}`,
              reversibility: 'high',
            }),
          });
        } catch { /* logging is best-effort — never fails the batch */ }
      }
    } catch (err) {
      const message = [err && err.message, err && err.stderr, err && err.stdout].filter(Boolean).join(' ') || String(err);
      failed.push({ issue: action.issue, error: message });
    }
  }

  deps.stdout(JSON.stringify({ ok, failed }, null, 2) + '\n');
  return 0;
}

module.exports = { run, parseArgs, validateAction };

if (require.main === module) process.exitCode = run(process.argv.slice(2), realDeps);
