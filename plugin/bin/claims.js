#!/usr/bin/env node
// bin/claims.js — the claims-registry read-classify-write loop in one command.
//   node bin/claims.js claim <n,n,...> --run-id <id> [--repo owner/name] [--keep-going] [--help]
//   node bin/claims.js release <n,n,...> --run-id <id> --reason <text> [--link <url>] [--repo owner/name] [--help]
// Replaces the hand-scripted per-run claim loop (`flow/claim-targets.md`) —
// see bin/lib/issues/claim-engine.js for the read-classify-write mechanics
// and the 404-vs-error distinction this CLI exists to get right every time.
// Prints one JSON envelope. Exit 0 on a run that completed (even a fully
// contested/aborted group — the envelope's own fields carry the outcome for
// the caller to act on); 1 when the branch bootstrap itself fails; 2 on a
// malformed invocation or when `gh` is absent (no MCP fallback here — the
// caller falls back to `_shared/github-write-transport.md`'s MCP path,
// documented, never invented, in that file).
'use strict';

const { execFileSync } = require('child_process');
const engine = require('./lib/issues/claim-engine');

const USAGE = 'usage: claims.js claim <n,n,...> --run-id <id> [--repo owner/name] [--keep-going] [--help]\n' +
  '       claims.js release <n,n,...> --run-id <id> --reason <text> [--link <url>] [--repo owner/name] [--help]\n';

const isPos = (n) => Number.isInteger(n) && n > 0;

function parseArgs(argv) {
  const opts = { mode: null, numbers: [], runId: null, repo: null, keepGoing: false, reason: null, link: null, help: false };
  if (argv[0] === '--help' || argv[0] === '-h') { opts.help = true; return opts; }
  if (argv[0] === 'claim' || argv[0] === 'release') { opts.mode = argv[0]; }
  else return { error: `unknown subcommand: ${argv[0] || '(none)'}` };
  if (argv[1] === undefined || argv[1].startsWith('--')) return { error: 'missing <n,n,...> argument' };
  opts.numbers = String(argv[1]).split(',').filter(Boolean).map(Number);
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--run-id') opts.runId = next();
    else if (a === '--repo') opts.repo = next();
    else if (a === '--keep-going') opts.keepGoing = true;
    else if (a === '--reason') opts.reason = next();
    else if (a === '--link') opts.link = next();
    else return { error: `unknown argument: ${a}` };
  }
  return opts;
}

function parseRepo(url) {
  const m = /github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(String(url || '').trim());
  return m ? { owner: m[1], repo: m[2] } : null;
}

const realDeps = {
  runner: engine.defaultRunner,
  ghAvailable: () => { try { execFileSync('gh', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; } },
  remoteUrl: () => execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' }),
  hostname: () => require('os').hostname(),
  sessionId: () => process.env.CLAUDE_CODE_SESSION_ID || '',
  now: () => Date.now(),
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s),
};

// argv -> exit code. All I/O through deps (a runner + a handful of getters)
// so tests inject a fake runner and never touch real gh/git — the same
// shape bin/link-records.js's deps use, just with claim-engine's functions
// in place of bin/lib/issues/link.js's.
function run(argv, deps = realDeps) {
  const opts = parseArgs(argv);
  if (opts.error) { deps.stderr(opts.error + '\n' + USAGE); return 2; }
  if (opts.help) { deps.stdout(USAGE); return 0; }
  if (!opts.runId) { deps.stderr('missing required --run-id\n' + USAGE); return 2; }
  if (opts.numbers.length === 0 || opts.numbers.some((n) => !isPos(n))) { deps.stderr('malformed <n,n,...> — every value must be a positive integer\n' + USAGE); return 2; }
  if (opts.mode === 'release' && !opts.reason) { deps.stderr('release requires --reason\n' + USAGE); return 2; }
  if (!deps.ghAvailable()) {
    deps.stderr('claims.js: `gh` is required — the claims-registry blob store has no GitHub MCP equivalent wired into this CLI. Fall back to `_shared/github-write-transport.md`\'s MCP path for the claim protocol.\n');
    return 2;
  }
  let remote = null;
  if (!opts.repo) { try { remote = deps.remoteUrl(); } catch { remote = null; } }
  const repoSpec = opts.repo ? parseRepo(`github.com/${opts.repo}`) : parseRepo(remote);
  if (!repoSpec) { deps.stderr('claims.js: could not resolve owner/repo — pass --repo owner/name\n'); return 2; }
  const { owner, repo } = repoSpec;
  const now = deps.now();

  if (opts.mode === 'claim') {
    try {
      engine.ensureClaimsBranch({ owner, repo, runner: deps.runner });
    } catch (err) {
      deps.stderr(`claims.js: could not bootstrap the claims-registry branch: ${engine.errorText(err)}\n`);
      return 1;
    }
    const result = engine.claimGroup({
      owner, repo, issueNumbers: opts.numbers, runId: opts.runId,
      sessionId: deps.sessionId(), host: deps.hostname(), now, runner: deps.runner, keepGoing: opts.keepGoing,
    });
    deps.stdout(JSON.stringify({ mode: 'claim', repo: `${owner}/${repo}`, runId: opts.runId, ...result }, null, 2) + '\n');
    return 0;
  }

  // release
  const results = opts.numbers.map((issueNumber) => engine.releaseOne({ owner, repo, issueNumber, runId: opts.runId, reason: opts.reason, link: opts.link, now, runner: deps.runner }));
  const released = results.filter((r) => r.outcome === 'released').map((r) => r.issueNumber);
  const skipped = results.filter((r) => r.outcome !== 'released');
  deps.stdout(JSON.stringify({ mode: 'release', repo: `${owner}/${repo}`, runId: opts.runId, released, skipped }, null, 2) + '\n');
  return 0;
}

module.exports = { run, parseArgs, parseRepo };

if (require.main === module) process.exitCode = run(process.argv.slice(2), realDeps);
