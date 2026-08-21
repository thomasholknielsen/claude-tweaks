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
const { parseWorktreeList } = require('../hooks/worktree-reap');

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

// ---- plans + ledger removal ------------------------------------------------
//
// docs/superpowers/plans/ and docs/plans/ are relative to the repo root, not
// runDir -- run readdirSync against process.cwd() (the checkout the CLI runs
// from), matching how build/wrap-up already resolve these paths elsewhere.
function specSlugFromRunDir(runDir) {
  // run-dir basenames are '{ISO-timestamp}-{spec-slug}' or, for a
  // multi-record spec-{N}/ subdirectory, just 'spec-{N}'. Strip a leading
  // ISO-timestamp prefix (YYYY-MM-DDTHHMMSS-) when present; otherwise the
  // whole basename is already the slug.
  const base = path.basename(runDir);
  const m = base.match(/^\d{4}-\d{2}-\d{2}T\d{6}-(.+)$/);
  return m ? m[1] : base;
}

registerCheck('plans-ledger', ({ runDir }) => {
  const slug = specSlugFromRunDir(runDir);
  const plansDir = path.join(process.cwd(), 'docs', 'superpowers', 'plans');
  const ledgerDir = path.join(process.cwd(), 'docs', 'plans');
  const matches = [];
  for (const dir of [plansDir, ledgerDir]) {
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir)) {
      if (entry.includes(slug)) matches.push(path.join(dir, entry));
    }
  }
  if (matches.length) return { result: 'fail', detail: `${matches.length} file(s) remain: ${matches.join(', ')}` };
  return { result: 'pass', detail: '' };
});

// ---- design caches deleted --------------------------------------------------
registerCheck('design-caches', ({ runDir }) => {
  const slug = specSlugFromRunDir(runDir);
  const cacheDir = path.join(process.cwd(), 'docs', 'plans');
  if (!fs.existsSync(cacheDir)) return { result: 'pass', detail: '' };
  const suffixes = ['-audit.json', '-recommendations.json', '-declined.json'];
  const matches = fs.readdirSync(cacheDir).filter(
    (entry) => entry.includes(slug) && suffixes.some((suf) => entry.endsWith(suf))
  );
  if (matches.length) return { result: 'fail', detail: `${matches.length} cache file(s) remain: ${matches.join(', ')}` };
  return { result: 'pass', detail: '' };
});

// ---- run-dir archived --------------------------------------------------------
//
// "Archived" means the shape bin/lib/reconcile/archive-merged.js's
// archiveRunDir() produces: the original .claude-tweaks/pipelines/{run-id}/
// path is gone, .claude-tweaks/pipelines/archive/{run-id}/ exists, and its
// work/ subdirectory (when the run had one) is git-tracked at the new path.
registerCheck('run-dir-archived', ({ runDir, deps }) => {
  const repoRoot = process.cwd();
  const runId = path.basename(runDir);
  const originalPath = path.join(repoRoot, '.claude-tweaks', 'pipelines', runId);
  const archivePath = path.join(repoRoot, '.claude-tweaks', 'pipelines', 'archive', runId);
  if (fs.existsSync(originalPath)) return { result: 'fail', detail: `original path still present: ${originalPath}` };
  if (!fs.existsSync(archivePath)) return { result: 'fail', detail: `archive path missing: ${archivePath}` };
  const archivedWork = path.join(archivePath, 'work');
  if (fs.existsSync(archivedWork)) {
    let tracked;
    try {
      tracked = deps.git(['ls-files', archivedWork], repoRoot);
    } catch (err) {
      return { result: 'fail', detail: `git ls-files failed for ${archivedWork}: ${err.message}` };
    }
    if (!tracked.trim()) return { result: 'fail', detail: `${archivedWork} exists but is not git-tracked` };
  }
  return { result: 'pass', detail: '' };
});

// ---- worktree removed ---------------------------------------------------------
registerCheck('worktree-removed', ({ runDir, deps }) => {
  // Worktree paths/branches are named from the spec-slug alone (e.g.
  // .claude/worktrees/flow-spec-900, branch worktree-flow-spec-900), not the
  // ISO-timestamp-prefixed run-dir basename -- match against the same slug
  // plans-ledger/design-caches already derive, not the raw basename.
  const slug = specSlugFromRunDir(runDir);
  let porcelain;
  try {
    porcelain = deps.git(['worktree', 'list', '--porcelain'], process.cwd());
  } catch (err) {
    return { result: 'unknown', detail: `git worktree list failed: ${err.message}` };
  }
  const list = parseWorktreeList(porcelain);
  const match = list.find((wt) => wt.path.includes(slug) || (wt.branch && wt.branch.includes(slug)));
  if (match) return { result: 'fail', detail: `worktree still listed: ${match.path}` };
  return { result: 'pass', detail: '' };
});

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
