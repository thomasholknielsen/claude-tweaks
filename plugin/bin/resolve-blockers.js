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
// Usage: resolve-blockers.js <n>[,<n2>,...] [--repo owner/name] [--help]
// A comma-joined list (no spaces, mirroring this codebase's existing
// multi-spec-number convention — see flow/materialize.md's `#A,#B` form)
// batches every number into the ONE aliased GraphQL call
// fetchNativeDependencies already makes for an N-record set — this CLI
// never issues more than one gh call regardless of how many numbers are
// passed (#1174).
// Output: one JSON line, an object keyed by each requested number (as a
// string, JSON's own key convention) to its {"blockedBy":[...],
// "openBlocker":bool,"openBlockerIds":[...]} — the same per-record shape
// fetchNativeDependencies' Map values already carry (and preflight-records.js's
// buildRecords `dep` entries expose), not a new shape invented here. A
// single-number invocation still returns a one-key object — no special-cased
// flat shape — so every caller reads results the same way regardless of
// how many numbers it asked for. Exit 0 on success; 1 on a malformed
// invocation (missing/non-positive-integer number in the list, unknown
// flag); 2 when `gh` is absent or owner/repo cannot be resolved (no
// `--repo` and no readable `origin` remote); 3 when the GraphQL call itself
// throws (network/API failure, or fetchNativeDependencies' own
// partial-result guard). Repo root comes from `git remote get-url origin`
// at the process cwd — never from CLAUDE_PLUGIN_ROOT (unset in Bash tool
// environments, #170) — mirroring bin/materialize.js's --repo override +
// remote-url fallback.
'use strict';

const { execFileSync } = require('child_process');
const { fetchNativeDependencies } = require('./lib/issues/native-dependencies');
const { parseRepo, ghAvailable, remoteUrl } = require('./lib/repo-resolve');

const USAGE = 'usage: resolve-blockers.js <n>[,<n2>,...] [--repo owner/name] [--help]\n';

const isPos = (n) => Number.isInteger(n) && n > 0;

// Parses the comma-joined positional argument into an array of positive
// integers, or returns null on any malformed entry (empty segment,
// non-numeric, zero/negative) — the caller reports one uniform "malformed"
// error rather than naming which segment failed, matching this CLI's
// existing single-number error wording.
function parseNumbers(raw) {
  const numbers = raw.split(',').map((p) => Number(p));
  if (numbers.some((n) => !isPos(n))) return null;
  return numbers;
}

function parseArgs(argv) {
  const opts = { numbersRaw: null, repo: null, help: false };
  if (argv[0] === '--help' || argv[0] === '-h') { opts.help = true; return opts; }
  if (argv[0] === undefined || argv[0].startsWith('--')) return { error: 'missing <n> argument' };
  opts.numbersRaw = argv[0];
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
  // 30s bound: ONE GraphQL call for the whole aliased batch, whatever its
  // size — matches fetch-sub-issues.js's precedent for its own 50-alias
  // batch shape rather than #1154's 5s single-call default, since a
  // comma-list here can legitimately span the full ~200-record queues
  // unblocked-records.md/queue-pull-script.md build from `--limit 200`.
  runner: (args) => execFileSync('gh', args, { encoding: 'utf8', timeout: 30000 }),
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s),
};

// argv -> exit code. All I/O through deps so tests never touch gh or git —
// same seam as bin/materialize.js's run(argv, deps).
function run(argv, deps = realDeps) {
  const opts = parseArgs(argv);
  if (opts.error) { deps.stderr(opts.error + '\n' + USAGE); return 1; }
  if (opts.help) { deps.stdout(USAGE); return 0; }
  const numbers = parseNumbers(opts.numbersRaw);
  if (!numbers) { deps.stderr('malformed <n> — every entry must be a positive integer\n' + USAGE); return 1; }
  if (!deps.ghAvailable()) { deps.stderr('resolve-blockers.js: `gh` is required (work-links: native)\n'); return 2; }

  let remote = null;
  if (!opts.repo) { try { remote = deps.remoteUrl(); } catch { remote = null; } }
  const repoSpec = opts.repo ? parseRepo(`github.com/${opts.repo}`) : parseRepo(remote);
  if (!repoSpec) { deps.stderr('resolve-blockers.js: could not resolve owner/repo — pass --repo owner/name\n'); return 2; }
  const { owner, repo } = repoSpec;

  let byNumber;
  try {
    byNumber = fetchNativeDependencies({ numbers, owner, repo, runner: deps.runner });
  } catch (err) {
    deps.stderr(`resolve-blockers.js: ${err && err.message ? err.message : String(err)}\n`);
    return 3;
  }

  const result = {};
  for (const n of numbers) result[n] = byNumber.get(n);
  deps.stdout(`${JSON.stringify(result)}\n`);
  return 0;
}

module.exports = { run, parseArgs, parseNumbers, parseRepo };

if (require.main === module) process.exitCode = run(process.argv.slice(2), realDeps);
