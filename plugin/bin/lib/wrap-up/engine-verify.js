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

// ---- verify-expectations.json (v1) -----------------------------------------
//
// Written by the wrap-up Review Console at resolution time, always -- even
// an empty { version: 1, memory: [], upstream: [] } when nothing resolved.
// Absent-entirely is DISTINCT from present-but-empty (spec's load-bearing
// asymmetry): absent means the console's own write step failed -- exactly
// the silent-non-execution class this whole verb exists to catch -- so it
// renders 'unknown', never folded into 'skip'.
const SUPPORTED_EXPECTATIONS_VERSION = 1;

function readExpectations(runDir) {
  const expPath = path.join(runDir, 'verify-expectations.json');
  if (!fs.existsSync(expPath)) return { ok: false, reason: 'missing' };
  let data;
  try {
    data = JSON.parse(fs.readFileSync(expPath, 'utf8'));
  } catch {
    return { ok: false, reason: 'missing' };
  }
  if (data.version !== SUPPORTED_EXPECTATIONS_VERSION) {
    return { ok: false, reason: 'unsupported-version', version: data.version };
  }
  return { ok: true, data };
}

function deferredSet(expectations) {
  return expectations.ok ? new Set(expectations.data.deferred || []) : new Set();
}

function expectationsUnknownDetail(expectations) {
  return expectations.reason === 'unsupported-version'
    ? `expectations version ${expectations.version} unsupported`
    : 'expectations file missing';
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
registerCheck('design-caches', ({ runDir, expectations }) => {
  const deferred = deferredSet(expectations);
  if (deferred.has('design-caches')) return { result: 'skip', detail: 'deferred to parent console' };
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
registerCheck('run-dir-archived', ({ runDir, expectations, deps }) => {
  const deferred = deferredSet(expectations);
  if (deferred.has('run-dir-archival')) return { result: 'skip', detail: 'deferred to parent console' };
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
registerCheck('worktree-removed', ({ runDir, expectations, deps }) => {
  const deferred = deferredSet(expectations);
  if (deferred.has('worktree')) return { result: 'skip', detail: 'deferred to parent console' };
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

// ---- resolved-issue-number resolution --------------------------------------
function resolvedIssueNumbers(runDir) {
  const workDir = path.join(runDir, 'work');
  const fromHeaders = [];
  if (fs.existsSync(workDir)) {
    for (const entry of fs.readdirSync(workDir)) {
      if (!entry.endsWith('-spec.md')) continue;
      const content = fs.readFileSync(path.join(workDir, entry), 'utf8');
      const m = content.match(/^record:\s*(\d+)/m);
      if (m) fromHeaders.push(Number(m[1]));
    }
  }
  if (fromHeaders.length) return fromHeaders;
  const expPath = path.join(runDir, 'verify-expectations.json');
  if (fs.existsSync(expPath)) {
    try {
      const exp = JSON.parse(fs.readFileSync(expPath, 'utf8'));
      if (Array.isArray(exp.issues)) return exp.issues;
    } catch { /* malformed expectations file -- Task 5 owns reporting this on the expectations-dependent rows; this fallback simply yields nothing here */ }
  }
  return [];
}

// ---- carrier commit -----------------------------------------------------------
registerCheck('carrier-commit', ({ runDir, base, deps }) => {
  const issues = resolvedIssueNumbers(runDir);
  if (!issues.length) return { result: 'skip', detail: 'no resolved issue numbers found (conversation-based work, or no materialized headers and no expectations issues)' };
  const missing = [];
  for (const n of issues) {
    let out;
    try {
      out = deps.git(['log', '--grep', `Fixes #${n}`, `${base}..HEAD`, '--oneline'], process.cwd());
    } catch (err) {
      return { result: 'unknown', detail: `git log failed: ${err.message}` };
    }
    if (!out.trim()) missing.push(n);
  }
  if (missing.length) return { result: 'fail', detail: `no carrier commit found for #${missing.join(', #')}` };
  return { result: 'pass', detail: '' };
});

// ---- reference-repair commit scoping -------------------------------------------
registerCheck('reference-repairs', ({ runDir, base, deps }) => {
  const statePath = path.join(runDir, 'engine-state.json');
  if (!fs.existsSync(statePath)) return { result: 'skip', detail: 'no engine-state.json (curation deferred or not run)' };
  let state;
  try {
    state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch (err) {
    return { result: 'unknown', detail: `could not parse engine-state.json: ${err.message}` };
  }
  const findings = (state.results && state.results.references && state.results.references.findings) || [];
  const applied = findings.filter((f) => f.action === 'applied').map((f) => f.targetPath).filter(Boolean);
  if (!applied.length) return { result: 'skip', detail: 'no applied reference-repair findings this run' };
  let commitLog;
  try {
    commitLog = deps.git(['log', '--grep=Initiative-Fix:', `${base}..HEAD`, '--format=%H'], process.cwd());
  } catch (err) {
    return { result: 'unknown', detail: `git log failed: ${err.message}` };
  }
  const commits = commitLog.split('\n').filter(Boolean);
  if (!commits.length) return { result: 'fail', detail: 'no Initiative-Fix: commit found in range' };
  const touched = new Set();
  for (const sha of commits) {
    let diff;
    try {
      diff = deps.git(['diff-tree', '--no-commit-id', '--name-only', '-r', sha], process.cwd());
    } catch (err) {
      return { result: 'unknown', detail: `git diff-tree failed for ${sha}: ${err.message}` };
    }
    for (const f of diff.split('\n').filter(Boolean)) touched.add(f);
  }
  const appliedSet = new Set(applied);
  const extra = [...touched].filter((f) => !appliedSet.has(f));
  if (extra.length) return { result: 'fail', detail: `Initiative-Fix: commit touches unrelated file(s): ${extra.join(', ')}` };
  return { result: 'pass', detail: '' };
});

// ---- gh availability probe ------------------------------------------------
function ghAvailable(deps) {
  try {
    deps.gh(['--version'], process.cwd());
    return true;
  } catch {
    return false;
  }
}

// ---- parent resolution + pr-first pointer helpers ---------------------------
//
// `verification-brief.md`'s Routing section: a resolvable-parent sub-issue
// never carries its own `demo:pending` -- its parent carries one gate for
// all of them. Callers must redirect to the parent before checking labels/
// comments. Returns { ok:false, error } instead of throwing so a gh/JSON
// failure folds into the check's own `fail` detail line rather than
// aborting the whole check.
function resolveParent(n, deps) {
  let raw;
  try {
    raw = deps.gh(['issue', 'view', String(n), '--json', 'parent'], process.cwd());
  } catch (err) {
    return { ok: false, error: `gh issue view (parent) failed for #${n} (${err.message})` };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: `could not parse parent JSON for #${n}` };
  }
  return { ok: true, parent: parsed.parent ? parsed.parent.number : null };
}

// `verify`'s --run-dir may be the parent pipeline run directory, or (in a
// multi-spec run) a spec-{N}/ subdirectory with no run-state.json of its
// own -- checks runDir first, then one directory up. Absence or a parse/
// shape failure at whichever path is checked returns null, which correctly
// degrades to "no PR" (local-merge / degraded-pr-first) behavior in the
// caller -- it never falls further than one level up, and it never treats a
// present-but-PR-less run-state.json as a reason to keep searching.
function resolvePrNumber(runDir) {
  const direct = path.join(runDir, 'run-state.json');
  const statePath = fs.existsSync(direct) ? direct : path.join(path.dirname(runDir), 'run-state.json');
  if (!fs.existsSync(statePath)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    return data.pr && data.pr.number ? data.pr.number : null;
  } catch {
    return null;
  }
}

// ---- acceptance labeling ---------------------------------------------------
//
// Reproduces execution-and-verification.md's existing per-backend,
// per-parent-vs-non-parent check (the prose this record deletes), including
// the two nuances the original version of this check omitted (record #900,
// Task 6 fix): parent redirection, and the pr-first pointer+brief split.
// Deliberate scope note (spec's own nuance, preserved here rather than
// re-derived): a resolvable-parent record's brief lives on the PARENT, and
// correctly-gated parents routinely have OTHER comments after the brief
// lands (the Parent-Gate Procedure's already-posted-brief branch only adds
// the label, posting nothing new) -- so this check tests whether ANY
// comment on the target issue (or, under the pr-first pointer form, the PR)
// contains the brief, never only the most recent one. A last-comment-only
// test would hard-stop a correctly-gated parent.
//
// Known, deliberate gaps (not reproduced here -- said honestly rather than
// implied by omission): the Oversight-floor gate (a non-parent record that
// doesn't clear the floor legitimately carries no `demo:pending` at all --
// this check has no way to distinguish that from a genuinely missed
// labeling step, so it will report a false `fail` for that case) and the
// `local-files` backend's different acceptance shape (`facets.acceptance`
// on the record body, no `gh` comments at all) are both out of scope for
// this check as written; it only reproduces the `github-issues` path.
registerCheck('acceptance-labeling', ({ runDir, deps }) => {
  if (!ghAvailable(deps)) return { result: 'unknown', detail: 'gh absent' };
  const issues = resolvedIssueNumbers(runDir);
  if (!issues.length) return { result: 'skip', detail: 'no resolved issue numbers found' };
  const failing = [];

  // Resolve each issue's target (its parent, when resolvable; itself
  // otherwise), deduping by target -- two sub-issues sharing one parent
  // must only be checked once, both to avoid redundant gh calls and to
  // avoid redundant identical detail lines.
  const targets = [];
  const seenTargets = new Set();
  for (const n of issues) {
    const resolved = resolveParent(n, deps);
    if (!resolved.ok) {
      failing.push(`#${n}: ${resolved.error}`);
      continue;
    }
    const target = resolved.parent || n;
    if (seenTargets.has(target)) continue;
    seenTargets.add(target);
    targets.push(target);
  }

  const prNumber = resolvePrNumber(runDir);

  for (const target of targets) {
    let labelsRaw;
    try {
      labelsRaw = deps.gh(['issue', 'view', String(target), '--json', 'labels'], process.cwd());
    } catch (err) {
      failing.push(`#${target}: gh issue view failed (${err.message})`);
      continue;
    }
    let labels;
    try {
      labels = JSON.parse(labelsRaw).labels || [];
    } catch {
      failing.push(`#${target}: could not parse labels JSON`);
      continue;
    }
    if (!labels.some((l) => l.name === 'demo:pending')) {
      failing.push(`#${target}: missing demo:pending label`);
      continue;
    }
    let commentsRaw;
    try {
      commentsRaw = deps.gh(['issue', 'view', String(target), '--json', 'comments'], process.cwd());
    } catch (err) {
      failing.push(`#${target}: gh issue view (comments) failed (${err.message})`);
      continue;
    }
    let comments;
    try {
      comments = JSON.parse(commentsRaw).comments || [];
    } catch {
      failing.push(`#${target}: could not parse comments JSON`);
      continue;
    }
    const hasFullBrief = comments.some((c) => c.body && c.body.includes('## Verification Brief') && c.body.includes('### Confirmed'));
    if (hasFullBrief) continue;

    // No full brief on the issue itself -- under pr-first (run-state.json
    // carries a `pr` object), verification-brief.md's "`pr` object present"
    // branch posts the full brief on the PR instead, leaving only a
    // one-line pointer on the issue. Check for that form before failing.
    if (prNumber) {
      const hasPointer = comments.some((c) => c.body && c.body.includes('Verification Brief posted to PR #'));
      if (hasPointer) {
        let prCommentsRaw;
        try {
          prCommentsRaw = deps.gh(['pr', 'view', String(prNumber), '--json', 'comments'], process.cwd());
        } catch (err) {
          failing.push(`#${target}: gh pr view failed for PR #${prNumber} (${err.message})`);
          continue;
        }
        let prComments;
        try {
          prComments = JSON.parse(prCommentsRaw).comments || [];
        } catch {
          failing.push(`#${target}: could not parse PR #${prNumber} comments JSON`);
          continue;
        }
        const hasPrBrief = prComments.some(
          (c) => c.body && c.body.includes('<!-- run-comment: brief -->') && c.body.includes('### Confirmed')
        );
        if (hasPrBrief) continue;
        failing.push(`#${target}: pointer to PR #${prNumber} found but no confirmed Verification Brief on PR #${prNumber}`);
        continue;
      }
    }
    failing.push(`#${target}: no comment carries a confirmed Verification Brief`);
  }
  if (failing.length) return { result: 'fail', detail: failing.join('; ') };
  return { result: 'pass', detail: '' };
});

// ---- memory updates -----------------------------------------------------------
registerCheck('memory-updates', ({ expectations }) => {
  if (!expectations.ok) return { result: 'unknown', detail: expectationsUnknownDetail(expectations) };
  const entries = expectations.data.memory || [];
  if (!entries.length) return { result: 'skip', detail: 'nothing recorded' };
  const missing = [];
  for (const { file, indexFile } of entries) {
    if (!fs.existsSync(file)) missing.push(`file missing: ${file}`);
    if (indexFile && fs.existsSync(indexFile)) {
      const indexContent = fs.readFileSync(indexFile, 'utf8');
      const base = path.basename(file, '.md');
      if (!indexContent.includes(base)) missing.push(`index line missing for ${base} in ${indexFile}`);
    } else if (indexFile) {
      missing.push(`index file missing: ${indexFile}`);
    }
  }
  if (missing.length) return { result: 'fail', detail: missing.join('; ') };
  return { result: 'pass', detail: '' };
});

// ---- upstream feedback ----------------------------------------------------------
registerCheck('upstream-feedback', ({ expectations, deps }) => {
  if (!expectations.ok) return { result: 'unknown', detail: expectationsUnknownDetail(expectations) };
  const entries = expectations.data.upstream || [];
  if (!entries.length) return { result: 'skip', detail: 'nothing recorded' };
  if (!ghAvailable(deps)) return { result: 'unknown', detail: 'gh absent' };
  const failing = [];
  for (const { url } of entries) {
    const m = url.match(/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/);
    if (!m) { failing.push(`could not parse issue URL: ${url}`); continue; }
    const [, owner, repo, number] = m;
    try {
      deps.gh(['issue', 'view', number, '--repo', `${owner}/${repo}`, '--json', 'number'], process.cwd());
    } catch (err) {
      failing.push(`${url}: gh issue view failed (${err.message})`);
    }
  }
  if (failing.length) return { result: 'fail', detail: failing.join('; ') };
  return { result: 'pass', detail: '' };
});

function runVerify({ runDir, base, deps = {} }) {
  const git = deps.git || defaultGit;
  const gh = deps.gh || defaultGh;
  const expectations = runDir === null ? null : readExpectations(runDir);

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
        const { result, detail } = fn({ runDir, base, expectations, deps: { git, gh } });
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

module.exports = {
  runVerify,
  renderVerifyTable,
  resolveArchivedRunDir,
  registerCheck,
  defaultGit,
  defaultGh,
  resolveParent,
  resolvePrNumber,
};
