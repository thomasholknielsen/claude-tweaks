#!/usr/bin/env node
// plugin/bin/verify.js — deterministic verification runner (#892).
// The caller resolves the project's check commands (verification.md Step 1)
// and passes each as --cmd <name>=<command>; this CLI owns execution order,
// per-check log capture, exit-code keying, bounded extraction, and
// report.json. It never reads .claude-tweaks/policy.yml or CLAUDE.md —
// command resolution stays caller-side (spec: Option A boundary). Reading
// git and its own artifacts (the #1921 pass stamp) stays inside that boundary.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { parseArgs, UsageError, USAGE } = require('./lib/verify/args');
const { runChecks } = require('./lib/verify/run');
const { sniffFamily, extractFailingRegion, parseCounts, summaryLine } = require('./lib/verify/extract');
const { gitInfo, gitDir: resolveGitDir, composeReport } = require('./lib/verify/report');
const { readStamp: readCountStamp, detectRegression, caveatLine } = require('./lib/verify/count-stamp');
const { writeJsonAtomic } = require('./lib/verify/atomic-write');
const { composeStamp, writeStamp, readStamp: readVerifyStamp } = require('./lib/verify/stamp');

function enrich(result) {
  if (result.skipped) return result;
  let text = '';
  try {
    text = fs.readFileSync(result.logPath, 'utf8');
  } catch {
    // Unreadable log degrades to absence, never to a fabricated pass —
    // summary/region/counts stay empty; exitCode still decides pass/fail.
    return { ...result, summary: result.spawnError || null, failingRegion: null, counts: null };
  }
  const family = sniffFamily(text);
  const failed = result.exitCode !== 0;
  return {
    ...result,
    summary: result.spawnError || summaryLine(text, family) || null,
    failingRegion: failed ? extractFailingRegion(text, family) : null,
    counts: parseCounts(text, family),
  };
}

function statusOf(check) {
  if (check.skipped) return `skipped: ${check.skipped}`;
  return check.exitCode === 0 ? 'pass' : 'fail';
}

function realpathOrNull(targetPath) {
  try { return fs.realpathSync(targetPath); } catch { return null; }
}

// --stamp-status (#1921): a read of the runner's own artifact. Status is data,
// never a failure — exit 0 in every case, including "no checkout at all".
// `dirty` and `head` are recomputed fresh from the live tree, never echoed
// from the stored stamp (spec Gotchas: a tree that went dirty after a clean
// pass reports match:false).
function stampStatus(parsed) {
  const ownGitDir = resolveGitDir();
  const gitDir = parsed.gitDir || ownGitDir;
  const stamp = gitDir ? readVerifyStamp(gitDir) : null;
  const git = gitDir ? gitInfo() : { sha: null, dirty: null };
  const present = stamp !== null;
  const scope = present ? (stamp.scope || null) : null;
  // An explicit --git-dir that is not this checkout's own git dir can never
  // match: head/dirty above are always the invoking cwd's (gitInfo() takes
  // no directory argument), so a foreign --git-dir's stamp is still read and
  // reported, but never trusted as verifying THIS cwd's HEAD — otherwise a
  // sibling checkout sitting at the same commit could read match:true for a
  // verification it never ran (review finding, refs #1921).
  const requestedGitDir = parsed.gitDir ? realpathOrNull(parsed.gitDir) : null;
  const resolvedOwnGitDir = ownGitDir ? realpathOrNull(ownGitDir) : null;
  const foreignGitDir = Boolean(parsed.gitDir)
    && (requestedGitDir === null || resolvedOwnGitDir === null || requestedGitDir !== resolvedOwnGitDir);
  const status = {
    present,
    sha: present ? stamp.sha : null,
    head: git.sha,
    dirty: git.dirty,
    scope,
    fullSha: present ? (stamp.fullSha === undefined ? stamp.sha : stamp.fullSha) : null,
    match: !foreignGitDir && present && git.sha !== null && stamp.sha === git.sha && git.dirty === false && scope === 'full',
    reportPath: present && typeof stamp.reportPath === 'string' ? stamp.reportPath : null,
    legacy: present ? stamp.legacy === true : false,
  };
  process.stdout.write(`${JSON.stringify(status)}\n`);
  process.exitCode = 0;
}

async function main() {
  process.stdout.on('error', (err) => { if (err.code !== 'EPIPE') throw err; });
  let parsed;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (err) {
    if (err instanceof UsageError) {
      process.stderr.write(`${err.message}\n${USAGE}\n`);
      process.exitCode = 2;
      return;
    }
    throw err;
  }

  if (parsed.stampStatus) { stampStatus(parsed); return; }

  // Default paths resolve against the checkout's own git dir (#1921) so the
  // canonical skill invocation is one plain command with no $(...)
  // substitutions (the worktree Bash-shape guard refuses two of them).
  // Explicit flags win; outside a checkout the tmpdir fallback stands and
  // no count stamp is persisted.
  const gitDir = parsed.gitDir || resolveGitDir();
  const logDir = parsed.logDir
    || (gitDir ? path.join(gitDir, 'claude-tweaks-verify') : fs.mkdtempSync(path.join(os.tmpdir(), 'claude-tweaks-verify-')));
  fs.mkdirSync(logDir, { recursive: true });
  const jsonPath = parsed.json || path.join(logDir, 'report.json');
  const countStampPath = parsed.countStamp || (gitDir ? path.join(gitDir, 'claude-tweaks-test-count.json') : null);

  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  const results = (await runChecks({ cmds: parsed.cmds, logDir })).map(enrich);
  const git = gitInfo();

  // Suite-count regression stamp (#881, IL-84): the "tests" check's own
  // parsed count is compared against the previous run's persisted count.
  // --count-stamp is caller-resolved (verification.md Step 2) or defaults
  // under the git dir (#1921); outside a checkout with no flag, persistence
  // and comparison are disabled entirely.
  const testsCheck = results.find((c) => c.name === 'tests' && !c.skipped);
  const currentCount = testsCheck && testsCheck.counts && typeof testsCheck.counts.tests === 'number'
    ? { tests: testsCheck.counts.tests, sha: git.sha, recordedAt: startedAt }
    : null;
  let testCountRegression = null;
  if (countStampPath) {
    const previousCount = readCountStamp(countStampPath);
    testCountRegression = detectRegression(previousCount, currentCount);
    if (currentCount !== null) {
      // Fail-toward-absence on the write side too (readStamp already does
      // this on read): a stamp-write failure (ENOSPC, EACCES, a
      // --count-stamp path whose parent directory doesn't exist) must never
      // crash the whole run and discard an otherwise-passing report — this
      // is a caveat/surfacing mechanism, not a hard gate (count-stamp.js's
      // own stated intent). report.json's own write below is deliberately
      // unguarded: it IS the run's output, so a failure there must surface.
      try {
        fs.mkdirSync(path.dirname(countStampPath), { recursive: true });
        writeJsonAtomic(countStampPath, currentCount);
      } catch { /* best-effort persistence; next run simply has no baseline */ }
    }
  }

  const report = composeReport({
    checks: results, startedAt, durationMs: Date.now() - startMs, git, testCountRegression,
  });
  writeJsonAtomic(jsonPath, report);

  // Verification pass stamp (#1921): the runner is the ONLY writer, and only
  // for a passing run of the full resolved set — every --cmd check ran, none
  // was fail-fast skipped (#1784: an agent-written stamp let a failing run
  // stamp a pass). `dirty` never gates the write; --stamp-status's match
  // rule already requires dirty === false. --no-stamp is the caller's
  // declaration that this --cmd set is deliberately partial. The write is
  // best-effort like the count stamp: a stamp failure never fails the run.
  const fullSet = results.every((c) => !c.skipped);
  // An explicit --git-dir redirects logs and the count stamp only; the pass
  // stamp keys on the invoking cwd's HEAD, which may not be that repo's.
  if (report.pass && fullSet && !parsed.noStamp && gitDir && git.sha && !parsed.gitDir) {
    const suitesRun = results.filter((c) => c.name !== 'types' && c.name !== 'lint').map((c) => c.name);
    const stamp = composeStamp({
      report, scope: 'full', fullSha: git.sha, base: null, changedFiles: [],
      suitesRun, flakyRetried: [], reportPath: path.resolve(jsonPath), at: new Date().toISOString(),
    });
    try { writeStamp(gitDir, stamp); } catch { /* best-effort; next --stamp-status simply reads absent */ }
  }

  const lines = ['| Check | Status | Duration | Summary |', '|---|---|---|---|'];
  for (const check of results) {
    const duration = check.skipped ? '—' : `${(check.durationMs / 1000).toFixed(1)}s`;
    const summary = check.skipped ? '—' : (check.summary || '—');
    lines.push(`| ${check.name} | ${statusOf(check)} | ${duration} | ${summary} |`);
  }
  for (const check of results) {
    if (!check.skipped && check.exitCode !== 0 && check.failingRegion) {
      lines.push('', `### ${check.name} failing region (full log: ${check.logPath})`, check.failingRegion);
    }
  }
  if (testCountRegression) lines.push('', caveatLine(testCountRegression));
  lines.push('', `report: ${jsonPath}`);
  process.stdout.write(`${lines.join('\n')}\n`);
  process.exitCode = report.pass ? 0 : 1;
}

main().catch((err) => {
  process.stderr.write(`verify.js: ${String((err && err.stack) || err)}\n`);
  process.exitCode = 1;
});
