// bin/lib/hooks/run-dir-resolve.js — pure resolver behind
// `node bin/hooks.js resolve-run-dir` (#692).
//
// Implements _shared/pipeline-run-dir.md's resolution order (env var with
// adoption-time anchoring check -> newest matching directory -> standalone
// fallback) on top of worktree-detect.js's mainCheckoutRoot(), so a skill step
// gets the anchored $RUN_ROOT/run directory back as a single command instead of
// composing it from `git rev-parse --git-common-dir` inline. That composition
// is exactly how #692's incident happened: a relative `.claude-tweaks/pipelines/…`
// read from inside a worktree silently created/used a worktree-local shadow,
// splitting run state across two locations ([IL-127]).
//
// `pipeline-run-dir.md`'s Bash snippet stays as the reference implementation
// this module mirrors — every call site should cite this command instead of
// restating that snippet.
//
// Deliberately loud where the shared resolution algorithm (as consumed by a
// skill adopting $PIPELINE_RUN_DIR) is deliberately quiet: that algorithm
// treats a worktree-trapped env var as "stale, fall through" so a skill can
// keep going. This command exists specifically to CATCH that shape, so it
// fails loud instead — see the header comment on `resolve` below.
'use strict';
const fs = require('fs');
const path = require('path');
const wtDetect = require('./worktree-detect');

function safeReal(p) {
  try { return fs.realpathSync(p); } catch { return null; }
}

// ISO-timestamp-prefixed run-dir naming: YYYY-MM-DDTHHMMSS (no colons —
// portable across filesystems), matching pipeline-run-dir.md's SPEC_SLUG
// conventions and every hand-written snippet this module replaces.
function formatTimestamp(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`
  );
}

function fail(reason, message) {
  return { ok: false, path: null, created: false, reason, message };
}

function ok(dir, created) {
  return { ok: true, path: dir, created: !!created, reason: null, message: dir };
}

// Step 2 (`_shared/pipeline-run-dir.md`'s resolution order): the most recent
// directory under `{pipelinesRoot}` whose name contains `specSlug`, matching
// the reference snippet's `find ... -name "*${SPEC_SLUG}*" | sort | tail -n 1`.
function newestMatch(pipelinesRoot, specSlug) {
  let entries;
  try { entries = fs.readdirSync(pipelinesRoot, { withFileTypes: true }); } catch { return null; }
  const names = entries
    .filter((e) => e.isDirectory() && e.name.includes(specSlug))
    .map((e) => e.name)
    .sort();
  if (!names.length) return null;
  return path.join(pipelinesRoot, names[names.length - 1]);
}

// opts: { cwd, env, specSlug, mode, standalone, create, rootOnly, now }
function resolve(opts = {}) {
  const cwd = opts.cwd || process.cwd();
  const env = opts.env || {};
  const now = opts.now || new Date();

  const mainRoot = wtDetect.mainCheckoutRoot(cwd);
  if (!mainRoot) {
    return fail(
      'no-repo',
      `could not determine the git repository root from ${cwd} — not a git repo, ` +
      'or git/the .git file could not be read. resolve-run-dir refuses to guess.',
    );
  }

  // --root-only: just the anchored main-checkout root, no run resolution at
  // all. For call sites that only ever needed $RUN_ROOT itself (a `find`
  // backstop scoped to the whole pipelines/ tree, the wrap-up transitional
  // copy-out guard's DEST computation), not a specific run's directory.
  if (opts.rootOnly) return ok(mainRoot, false);

  const pipelinesRoot = path.join(mainRoot, '.claude-tweaks', 'pipelines');

  // Step 1: PIPELINE_RUN_DIR env var, with the adoption-time anchoring check.
  const envVal = typeof env.PIPELINE_RUN_DIR === 'string' && env.PIPELINE_RUN_DIR ? env.PIPELINE_RUN_DIR : null;
  if (envVal) {
    const real = safeReal(envVal);
    if (real) {
      if (wtDetect.isAnchoredUnderRoot(real, mainRoot)) {
        return ok(real, false);
      }
      // Exists, but resolves OUTSIDE the main checkout — this is the #692/
      // [IL-127] shape: adopting it would use (or create) a worktree-local
      // shadow of the run's audit trail. Fail loud rather than falling
      // through silently, naming what it actually is when we can tell.
      const info = wtDetect.repoInfo(real);
      const shadowNote = info.isLinkedWorktree
        ? `resolves inside a linked worktree (${info.repoRoot}) instead of the main checkout — a shadow copy`
        : `does not resolve under the main checkout root (${mainRoot})`;
      return fail(
        'shadow-env',
        `PIPELINE_RUN_DIR=${envVal} ${shadowNote}. This is exactly the failure ` +
        `_shared/pipeline-run-dir.md's Anchoring section exists to prevent ([IL-127]) — refusing to use it. ` +
        `Unset PIPELINE_RUN_DIR or point it at a directory under ${mainRoot}, then retry.`,
      );
    }
    // Set but nothing exists there at all — stale, not dangerous. Fall
    // through to step 2 exactly like an unset var (matches the reference
    // snippet's `[ -d "$RUN_DIR" ] || RUN_DIR=""`).
  }

  // Step 2: newest matching directory under the main checkout.
  if (opts.specSlug) {
    const match = newestMatch(pipelinesRoot, opts.specSlug);
    if (match) return ok(match, false);
  }

  // Standalone-fallback-shaped creation. Never runs unless --create was
  // explicitly passed.
  if (opts.create) {
    // `--mode`, when GIVEN, gates creation to auto mode only — mirroring
    // resolution-order step 4's "AND the skill is running in auto mode"
    // clause for the standalone-auto allowlist (/tidy, /init, /capture,
    // /claude-tweaks:dispatch, /claude-tweaks:backlog). When `--mode` is
    // OMITTED entirely, no such gate applies — that is wrap-up's own
    // documented exception (pipeline-run-dir.md resolution order step 4):
    // wrap-up creates a standalone run dir in *every* mode, not only auto,
    // because its Review Console runs in every mode. Callers on the
    // standalone-auto allowlist pass `--mode auto` themselves (only once
    // they have already confirmed auto mode); wrap-up passes neither.
    if (opts.mode && opts.mode !== 'auto') {
      return fail(
        'mode-not-auto',
        `--mode ${opts.mode} given — standalone creation only proceeds in auto mode ` +
        '(omit --mode entirely for a caller that creates in every mode, e.g. wrap-up).',
      );
    }
    if (opts.standalone) {
      // The step-4 standalone-auto-fallback shape: {ts}-{name}-standalone,
      // pre-populated with decisions.md and staged/ — byte-for-byte what the
      // reference snippet's own standalone branch does.
      const dir = path.join(pipelinesRoot, `${formatTimestamp(now)}-${opts.standalone}-standalone`);
      fs.mkdirSync(path.join(dir, 'staged'), { recursive: true });
      try { fs.closeSync(fs.openSync(path.join(dir, 'decisions.md'), 'a')); } catch { /* best-effort touch */ }
      return ok(dir, true);
    }
    if (opts.specSlug) {
      // The plain mint shape /flow (steps-and-gates.md case 4), /dispatch
      // (SKILL.md Step 4), and /claude-tweaks:flow's claim-targets.md use:
      // mkdir only. config.yml/decisions.md are written later, by whichever
      // step actually initializes the run (the Config Manifesto), not by
      // this mint.
      const dir = path.join(pipelinesRoot, `${formatTimestamp(now)}-${opts.specSlug}`);
      fs.mkdirSync(dir, { recursive: true });
      return ok(dir, true);
    }
    return fail(
      'create-unnamed',
      '--create was given but neither --standalone nor --spec-slug names the new directory.',
    );
  }

  return fail(
    'unresolved',
    `no pipeline run directory resolved under ${pipelinesRoot}` +
    (opts.specSlug ? ` for spec-slug "${opts.specSlug}"` : '') +
    ' (PIPELINE_RUN_DIR unset or invalid, no matching run, and --create not passed).',
  );
}

module.exports = { resolve, formatTimestamp };
