#!/usr/bin/env node
// bin/resolve-linked-prs.js — single-invocation CLI wrapping
// bin/lib/issues/record.js's buildLinkedPRQuery and the GraphQL call it
// produces (bin/lib/issues/linked-prs.js's fetchLinkedPRs) behind one shell
// command, mirroring bin/resolve-blockers.js's CLI shape exactly: thin
// argument-parsing shell over a bin/lib/ function, injectable runner.
// Exists for the same reason resolve-blockers.js does — a worktree-isolated
// session's compound-Bash refusal on hand-rolling `gh api graphql` with
// bound variables — for the open-linked-PR exclusion check (#1224). Zero
// runtime npm deps.
//
// Usage: resolve-linked-prs.js <n>[,<n2>,...] [--repo owner/name] [--help]
// A comma-joined list (no spaces, mirroring resolve-blockers.js's own
// convention) batches every number into the ONE aliased GraphQL call
// fetchLinkedPRs makes for an N-record set — this CLI never issues more
// than one gh call regardless of how many numbers are passed.
// Output: one JSON line, an object keyed by each requested number (as a
// string, JSON's own key convention) to its {"openPR": number|null} — the
// same per-record shape fetchLinkedPRs' Map values already carry, not a new
// shape invented here. A single-number invocation still returns a one-key
// object — no special-cased flat shape — so every caller reads results the
// same way regardless of how many numbers it asked for. Exit 0 on success;
// 1 on a malformed invocation (missing/non-positive-integer number in the
// list, unknown flag); 2 when `gh` is absent or owner/repo cannot be
// resolved (no --repo and no readable origin remote); 3 when the GraphQL
// call itself throws (network/API failure, or fetchLinkedPRs' own
// partial-result guard). Repo root comes from `git remote get-url origin`
// at the process cwd — never from CLAUDE_PLUGIN_ROOT (unset in Bash tool
// environments, #170) — mirroring resolve-blockers.js's --repo override +
// remote-url fallback.
'use strict';

const { execFileSync } = require('child_process');
const { fetchLinkedPRs } = require('./lib/issues/linked-prs');
const { parseRepo, ghAvailable, remoteUrl } = require('./lib/repo-resolve');

const USAGE = 'usage: resolve-linked-prs.js <n>[,<n2>,...] [--repo owner/name] [--help]\n';

const isPos = (n) => Number.isInteger(n) && n > 0;

// Parses the comma-joined positional argument into an array of positive
// integers, or returns null on any malformed entry (empty segment,
// non-numeric, zero/negative) — the caller reports one uniform "malformed"
// error rather than naming which segment failed, matching
// resolve-blockers.js's existing single-number error wording.
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
  // size — same precedent as resolve-blockers.js's own runner bound, since
  // this comma-list can span the same full ~200-record queues
  // queue-pull-script.md builds from `--limit 200`.
  runner: (args) => execFileSync('gh', args, { encoding: 'utf8', timeout: 30000 }),
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s),
};

// argv -> exit code. All I/O through deps so tests never touch gh or git —
// same seam as bin/resolve-blockers.js's run(argv, deps).
function run(argv, deps = realDeps) {
  const opts = parseArgs(argv);
  if (opts.error) { deps.stderr(opts.error + '\n' + USAGE); return 1; }
  if (opts.help) { deps.stdout(USAGE); return 0; }
  const numbers = parseNumbers(opts.numbersRaw);
  if (!numbers) { deps.stderr('malformed <n> — every entry must be a positive integer\n' + USAGE); return 1; }
  if (!deps.ghAvailable()) { deps.stderr('resolve-linked-prs.js: `gh` is required\n'); return 2; }

  let remote = null;
  if (!opts.repo) { try { remote = deps.remoteUrl(); } catch { remote = null; } }
  const repoSpec = opts.repo ? parseRepo(`github.com/${opts.repo}`) : parseRepo(remote);
  if (!repoSpec) { deps.stderr('resolve-linked-prs.js: could not resolve owner/repo — pass --repo owner/name\n'); return 2; }
  const { owner, repo } = repoSpec;

  let byNumber;
  try {
    byNumber = fetchLinkedPRs({ numbers, owner, repo, runner: deps.runner });
  } catch (err) {
    deps.stderr(`resolve-linked-prs.js: ${err && err.message ? err.message : String(err)}\n`);
    return 3;
  }

  const result = {};
  for (const n of numbers) result[n] = byNumber.get(n);
  deps.stdout(`${JSON.stringify(result)}\n`);
  return 0;
}

module.exports = { run, parseArgs, parseNumbers, parseRepo };

if (require.main === module) process.exitCode = run(process.argv.slice(2), realDeps);
