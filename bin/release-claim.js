#!/usr/bin/env node
// bin/release-claim.js — release a claims-registry claim in one command.
//   node bin/release-claim.js <issue> --run <run-dir> --reason <reason> [--link <url>] \
//     [--remove-grants] [--remove-in-progress] [--repo owner/name] \
//     [--section "/<skill>"] [--step <text>] [--help]
// Performs wrap-up/cleanup-procedures.md Section E steps 3-8 for one issue: read the
// blob, ownership check (never delete a successor's claim), releasePayload -> tombstone
// PUT carrying the read sha, release comment; --remove-grants strips auto:build/auto:merge,
// --remove-in-progress strips bot:in-progress; one AUTO line is appended to
// <run-dir>/decisions.md when that directory exists AND resolves as anchored under the
// main checkout (resolveTarget — a worktree-local shadow is refused, never silently
// written, matching bin/log-decision.js's guard [IL-127]). runId = basename(<run-dir>).
// Exit 0 released; 3 already released or swept (404/409/422 — comment still posted);
// 4 skipped, claim held by another run (nothing written); 1 failed; 2 malformed
// invocation or `gh` absent — the MCP path in _shared/github-write-transport.md is the
// documented fallback there, deliberately not grown into this CLI. Logging is
// bookkeeping, never a gate: the exit code always reflects the release outcome, never
// whether decisions.md was written.
'use strict';

const path = require('path');
const { execFileSync } = require('child_process');
const release = require('./lib/release-claim/release');
const { formatEntry, appendEntry, resolveTarget } = require('./lib/log-decision/append');

const USAGE = 'usage: release-claim.js <issue> --run <run-dir> --reason <reason> [--link <url>] [--remove-grants] [--remove-in-progress] [--repo owner/name] [--section "/<skill>"] [--step <text>] [--help]\n';
const EXIT = { released: 0, 'already-released': 3, 'skipped-not-owner': 4, failed: 1 };

function parseArgs(argv) {
  const o = { issue: null, run: null, reason: null, link: null, removeGrants: false, removeInProgress: false, repo: null, section: null, step: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => { const v = argv[++i]; return v === undefined ? null : v; };
    if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--run') o.run = next();
    else if (a === '--reason') o.reason = next();
    else if (a === '--link') o.link = next();
    else if (a === '--remove-grants') o.removeGrants = true;
    else if (a === '--remove-in-progress') o.removeInProgress = true;
    else if (a === '--repo') o.repo = next();
    else if (a === '--section') o.section = next();
    else if (a === '--step') o.step = next();
    else if (/^--/.test(a)) return { error: `unknown argument: ${a}` };
    else if (o.issue === null) o.issue = a;
    else return { error: `unexpected argument: ${a}` };
  }
  return o;
}

function parseRepo(url) {
  const m = /github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(String(url || '').trim());
  return m ? { owner: m[1], repo: m[2] } : null;
}

const realDeps = {
  runner: release.defaultRunner,
  ghAvailable: () => { try { execFileSync('gh', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; } },
  remoteUrl: () => execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' }),
  now: () => Date.now(),
  cwd: () => process.cwd(),
  mainRoot: undefined,
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s),
};

function decisionText(issue, r, reason, link) {
  if (r.outcome === 'failed') return `release of #${issue} FAILED (${reason}): ${r.error}`;
  if (r.outcome === 'skipped-not-owner') return `skipped release of issue #${issue}: claim held by run ${r.holder}`;
  const detail = r.outcome === 'already-released' ? ' — already released or swept' : '';
  let text = `released claim on #${issue} (${reason})${link ? `; link ${link}` : ''}${detail}`;
  if (r.labelsRemoved.length) text += `; labels removed: ${r.labelsRemoved.join(', ')}`;
  if (r.labelsFailed.length) text += `; label removal failed: ${r.labelsFailed.join(', ')}`;
  return text;
}

function run(argv, deps = realDeps) {
  const o = parseArgs(argv);
  if (o.error) { deps.stderr(o.error + '\n' + USAGE); return 2; }
  if (o.help) { deps.stdout(USAGE); return 0; }
  if (o.issue === null) { deps.stderr('release-claim.js: <issue> is required\n' + USAGE); return 2; }
  const issue = Number(o.issue);
  if (!Number.isInteger(issue) || issue <= 0) { deps.stderr('release-claim.js: <issue> must be a positive integer\n' + USAGE); return 2; }
  if (!o.run) { deps.stderr('release-claim.js: --run <run-dir> is required (its basename is the claim runId)\n' + USAGE); return 2; }
  if (!o.reason || !o.reason.trim()) { deps.stderr('release-claim.js: --reason is required\n' + USAGE); return 2; }
  if (!deps.ghAvailable()) {
    deps.stderr('release-claim.js: `gh` is required — in a gh-absent environment run the same read-classify-write over the MCP tools per _shared/github-write-transport.md and _shared/issue-claims.md ("The lock").\n');
    return 2;
  }
  let remote = null;
  if (!o.repo) { try { remote = deps.remoteUrl(); } catch { remote = null; } }
  const repoSpec = o.repo ? parseRepo(`github.com/${o.repo}`) : parseRepo(remote);
  if (!repoSpec) { deps.stderr('release-claim.js: could not resolve owner/repo — pass --repo owner/name\n'); return 2; }
  const runDir = o.run.replace(/\/+$/, '');
  const runId = path.basename(runDir);
  const reason = o.reason.trim();
  const r = release.releaseClaim({
    owner: repoSpec.owner, repo: repoSpec.repo, issueNumber: issue, runId, reason, link: o.link || undefined,
    removeGrants: o.removeGrants, removeInProgress: o.removeInProgress, runner: deps.runner, now: deps.now(),
  });
  for (const label of r.labelsFailed) {
    deps.stderr(`release-claim.js: warning — could not remove label ${label} on #${issue} (best-effort, continuing)\n`);
  }
  let logged = false;
  let target;
  try { target = resolveTarget({ runDir, cwd: deps.cwd(), mainRoot: deps.mainRoot }); } catch { target = { ok: false, reason: 'missing' }; }
  if (target.ok) {
    const reversibility = (r.outcome === 'skipped-not-owner' || r.outcome === 'failed') ? 'n/a' : 'high';
    const entry = formatEntry({ status: 'AUTO', now: deps.now(), step: o.step || 'Section E', text: decisionText(issue, r, reason, o.link), reversibility });
    try { appendEntry({ runDir, section: o.section, entry }); logged = true; } catch (err) { deps.stderr(`release-claim.js: decisions.md not written (${err && err.message})\n`); }
  } else if (target.reason === 'not-anchored') {
    deps.stderr(`release-claim.js: decisions.md not written — run dir is not anchored under the main checkout (a worktree-local shadow): ${runDir} — see _shared/pipeline-run-dir.md\n`);
  } else {
    deps.stderr(`release-claim.js: decisions.md not written — run dir does not exist: ${runDir}\n`);
  }
  deps.stdout(JSON.stringify({ issue, runId, reason, link: o.link || null, outcome: r.outcome, holder: r.holder || null, commentPosted: r.commentPosted, labelsRemoved: r.labelsRemoved, labelsFailed: r.labelsFailed, note: r.note || null, error: r.error || null, logged }, null, 2) + '\n');
  return EXIT[r.outcome] ?? 1;
}

module.exports = { run, parseArgs, parseRepo };

if (require.main === module) process.exitCode = run(process.argv.slice(2), realDeps);
