#!/usr/bin/env node
// bin/resolve-blockers.js — single-invocation CLI wrapping
// bin/lib/issues/record.js's buildNativeDependencyQuery and the GraphQL
// call it produces (bin/lib/issues/native-dependencies.js's
// fetchNativeDependencies — the same function
// bin/lib/preflight-records/preflight-records.js calls for its own N-record
// batch) behind one shell command, mirroring bin/resolve-policy.js's /
// bin/resolve-profile.js's CLI shape: thin argument-parsing shell over a
// bin/lib/ function, injectable runner. Exists so a worktree-isolated
// session's compound-Bash refusal on hand-rolling `gh api graphql` with
// bound variables (skills/_shared/scratch-worktree.md's Shell constraint
// section) has a single-command escape hatch for the work-links: native
// blocked-by check (#538). Zero runtime npm deps.
//
// Usage: resolve-blockers.js <n> [--repo owner/name] [--help]
// Output: one JSON line {"blockedBy":[...],"openBlocker":bool} on stdout —
// the same shape fetchNativeDependencies' Map values already carry (and
// preflight-records.js's buildRecords `dep` entries expose), not a new
// shape invented for this entry point. Exit 0 on success; 1 on a malformed
// invocation (missing/non-positive-integer <n>, unknown flag); 2 when `gh`
// is absent or owner/repo cannot be resolved (no `--repo` and no readable
// `origin` remote); 3 when the GraphQL call itself throws (network/API
// failure, or fetchNativeDependencies' own partial-result guard). Repo root
// comes from `git remote get-url origin` at the process cwd — never from
// CLAUDE_PLUGIN_ROOT (unset in Bash tool environments, #170) — mirroring
// bin/materialize.js's --repo override + remote-url fallback.
'use strict';

const { execFileSync } = require('child_process');
const { fetchNativeDependencies } = require('./lib/issues/native-dependencies');
const { parseRepo, ghAvailable, remoteUrl } = require('./lib/repo-resolve');

const USAGE = 'usage: resolve-blockers.js <n> [--repo owner/name] [--help]\n';

const isPos = (n) => Number.isInteger(n) && n > 0;

function parseArgs(argv) {
  const opts = { n: null, repo: null, help: false };
  if (argv[0] === '--help' || argv[0] === '-h') { opts.help = true; return opts; }
  if (argv[0] === undefined || argv[0].startsWith('--')) return { error: 'missing <n> argument' };
  opts.n = Number(argv[0]);
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--repo') {
      const v = argv[i + 1];
      if (!v || v.startsWith('--')) return { error: 'missing value for --repo' };
      opts.repo = v;
      i++;
    }
    else return { error: `unknown argument: ${a}` };
  }
  return opts;
}

const realDeps = {
  ghAvailable,
  remoteUrl,
  // 5s bound: one GraphQL call per record — gh-api-module-pattern's default
  // single-call convention (#1154; fetch-sub-issues.js's wider 30s is only
  // for its 50-alias batch shape, which this single-record call isn't).
  runner: (args) => execFileSync('gh', args, { encoding: 'utf8', timeout: 5000 }),
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s),
};

// argv -> exit code. All I/O through deps so tests never touch gh or git —
// same seam as bin/materialize.js's run(argv, deps).
function run(argv, deps = realDeps) {
  const opts = parseArgs(argv);
  if (opts.error) { deps.stderr(opts.error + '\n' + USAGE); return 1; }
  if (opts.help) { deps.stdout(USAGE); return 0; }
  if (!isPos(opts.n)) { deps.stderr('malformed <n> — must be a positive integer\n' + USAGE); return 1; }
  if (!deps.ghAvailable()) { deps.stderr('resolve-blockers.js: `gh` is required (work-links: native)\n'); return 2; }

  let remote = null;
  if (!opts.repo) { try { remote = deps.remoteUrl(); } catch { remote = null; } }
  const repoSpec = opts.repo ? parseRepo(`github.com/${opts.repo}`) : parseRepo(remote);
  if (!repoSpec) { deps.stderr('resolve-blockers.js: could not resolve owner/repo — pass --repo owner/name\n'); return 2; }
  const { owner, repo } = repoSpec;

  let result;
  try {
    const byNumber = fetchNativeDependencies({ numbers: [opts.n], owner, repo, runner: deps.runner });
    result = byNumber.get(opts.n);
  } catch (err) {
    deps.stderr(`resolve-blockers.js: ${err && err.message ? err.message : String(err)}\n`);
    return 3;
  }

  deps.stdout(`${JSON.stringify(result)}\n`);
  return 0;
}

module.exports = { run, parseArgs, parseRepo };

if (require.main === module) process.exitCode = run(process.argv.slice(2), realDeps);
