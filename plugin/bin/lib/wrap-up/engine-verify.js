// bin/lib/wrap-up/engine-verify.js — deterministic checks for wrap-up's
// closure gate. Verifies the run this verb is invoked on, immediately after
// that run's own execution step (`execution-and-verification.md`'s "Execute
// approved actions" section) — it is not a retrospective auditor of an
// arbitrary historical run-dir, whose commit conventions may predate the
// trailers/markers this module greps for.
//
// Injectable seam: every check function takes `deps.git`/`deps.gh`
// (execFileSync-backed defaults below), following the same fake-runner
// convention as bin/lib/merge-size-probe.js (see the gh-api-module-pattern
// skill) — argv array only, never a shell string.
//
// Read-only by design: only `git log`, `git ls-files`, `git worktree list`,
// `fs.readdirSync`/`fs.existsSync`, and `gh issue view`/`gh pr view`. No
// state-changing command belongs in this module.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function defaultGit(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function defaultGh(args, cwd) {
  return execFileSync('gh', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

// Registry of check functions, populated by Tasks 2-5. Each entry:
// { name: string, fn: ({runDir, base, expectations, deps}) => {result, detail} }.
// A flat array (not an object keyed by name) preserves the fixed row order
// the table renders in, matching the prose checklist's original order.
const CHECKS = [];

function registerCheck(name, fn) {
  CHECKS.push({ name, fn });
}

function resolveArchivedRunDir(runDir, repoRoot) {
  if (fs.existsSync(runDir)) return runDir;
  const archived = path.join(repoRoot, '.claude-tweaks', 'pipelines', 'archive', path.basename(runDir));
  if (fs.existsSync(archived)) return archived;
  return null;
}

function runVerify({ runDir, base, deps = {} }) {
  const git = deps.git || defaultGit;
  const gh = deps.gh || defaultGh;

  // Null runDir (resolveArchivedRunDir found the run neither at its original
  // path nor under the archive) short-circuits here so every check function
  // registered by Tasks 2-6 can assume runDir is a real, existing path — none
  // of them need to re-implement this guard themselves.
  const rows = runDir === null
    ? CHECKS.map(({ name }) => ({
        check: name,
        result: 'unknown',
        detail: 'run dir not found at original or archive path',
      }))
    : CHECKS.map(({ name, fn }) => {
        const { result, detail } = fn({ runDir, base, deps: { git, gh } });
        return { check: name, result, detail: detail || '' };
      });

  const exitCode = rows.some((r) => r.result === 'fail') ? 3 : 0;
  return { rows, exitCode };
}

function renderVerifyTable(rows) {
  const lines = ['| Check | Result | Detail |', '|---|---|---|'];
  for (const row of rows) {
    const resultCell = (row.result === 'skip' || row.result === 'unknown') && row.detail
      ? `${row.result} (${row.detail})`
      : row.result;
    const detailCell = row.result === 'pass' ? '' : (row.result === 'fail' ? row.detail : '');
    lines.push(`| ${row.check} | ${resultCell} | ${detailCell} |`);
  }
  return lines.join('\n');
}

module.exports = { runVerify, renderVerifyTable, resolveArchivedRunDir, registerCheck, defaultGit, defaultGh };
