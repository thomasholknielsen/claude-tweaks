#!/usr/bin/env node
// bin/hooks.js — single dispatcher for all claude-tweaks hook registrations.
// Cardinal invariant: never break a session. Every path — including a
// PreToolUse deny — exits 0; no module ever sets a non-zero `exit`. A deny
// is communicated entirely via `hookSpecificOutput.permissionDecision:
// 'deny'` in the stdout JSON (see pre-tool-use.js's own header comment for
// why: exit 2 is a cruder, stderr-only mechanism that would silently drop
// the custom permissionDecisionReason). This corrects an earlier version of
// this comment ("the only deliberate non-zero exit is the pre-tool-use
// deny") that never actually matched pre-tool-use.js's real behavior.
'use strict';
const fs = require('fs');
const path = require('path');
const ctxLib = require('./lib/hooks/context');
const siblingSessions = require('./lib/hooks/sibling-sessions');
const specStatusLib = require('./lib/flow/manifest');
const resumeFreshness = require('./lib/hooks/resume-freshness');
const stagedInventory = require('./lib/hooks/staged-inventory');
const wtDetect = require('./lib/hooks/worktree-detect');
const { closeRunState } = require('./lib/hooks/close-run-state');
const { teardownRun } = require('./lib/hooks/teardown-run');
const { deriveBranch, repoRootOf } = require('./lib/hooks/run-integrity');

const EVENTS = ['session-start', 'session-end', 'pre-compact', 'pre-tool-use', 'post-tool-use', 'subagent-stop'];

// The write-only, janitorial half of reconcile/index.js's ALL_CHECKS — run
// by the `reconcile-background` subcommand below, off session-start.js's hot
// path (#820, D8). Exported (alongside session-start.js's own FAST_CHECKS
// export) so a test can assert the two lists partition ALL_CHECKS exactly —
// no overlap, nothing silently dropped when a check is added to one list and
// not the other.
const BACKGROUND_CHECKS = ['release', 'archive', 'archive-branches', 'remote-prune', 'reap'];

// String-literal per-event requires — not a computed `require('./lib/hooks/' +
// event)` — so every `bin/lib/hooks/*.js` module resolves statically inside
// `plugin/` (payload-boundary test #419, assertion (b): a dynamic require() is
// itself a failure, not an accepted blind spot). `event` is already gated to
// one of `EVENTS` by this function's one call site before it's ever reached
// here, so the lookup table's keys are exactly — and only — that fixed set.
const EVENT_MODULES = {
  'session-start': () => require('./lib/hooks/session-start'),
  'session-end': () => require('./lib/hooks/session-end'),
  'pre-compact': () => require('./lib/hooks/pre-compact'),
  'pre-tool-use': () => require('./lib/hooks/pre-tool-use'),
  'post-tool-use': () => require('./lib/hooks/post-tool-use'),
  'subagent-stop': () => require('./lib/hooks/subagent-stop'),
};

function loadModule(event) {
  const load = EVENT_MODULES[event];
  if (!load) return null;
  try { return load(); } catch { return null; }
}

// Matches lib/hooks/pre-tool-use.js's pluginRoot() convention (also used
// inline in session-start.js): resolve the real path when a session has it,
// otherwise fall back to the unexpanded env-var literal so the printed
// command text is still copy-pasteable in whatever shell reads it.
function pluginRoot() {
  return process.env.CLAUDE_PLUGIN_ROOT || '${CLAUDE_PLUGIN_ROOT}';
}

// #1143: usage strings for every documented `hooks.js` subcommand (the
// dispatch table's own record-worktree/close-run/teardown-run/archive-run/
// resolve-run-dir/record-pr/spec-status/check-resume-freshness/check-staged-
// inventory/check-sibling-sessions/sweep-shadow/reconcile/reconcile-
// background/reconcile-summary set — see docs/plugin-structure.md's hooks.js
// line). Doubles as the membership table for the `--help`/`-h` intercept
// below: a verb absent from this map gets no guard, by design — the six
// EVENTS names are invoked by the harness via stdin JSON, never probed with
// a `--help` flag, and never fell through to the implicit-run-dir-guess
// hazard this record closes. record-pr's and spec-status's own internal
// "usage:" error strings (printed on malformed non-help args) reuse these
// same entries rather than a second, driftable copy of the same text.
const USAGE = {
  'record-worktree': 'record-worktree --run <dir> <worktree-path>',
  'resolve-run-dir': 'resolve-run-dir [--spec-slug <slug>] [--mode <mode>] [--standalone <value>] [--create] [--root-only]',
  'sweep-shadow': 'sweep-shadow [--run <dir>] [--worktree <path>]',
  'record-pr': 'record-pr [--run <dir>] <number> <url>',
  'spec-status': 'spec-status --run <parent-dir> --spec <n> --status <pending|running|complete|failed|not-run> --phase <phase>',
  'close-run': 'close-run [--run <dir>]',
  'teardown-run': 'teardown-run [--run <dir>] [--merged|--abandoned]',
  'archive-run': 'archive-run [--run <dir>]',
  'check-resume-freshness': 'check-resume-freshness [--run <dir>]',
  'check-staged-inventory': 'check-staged-inventory [--run <dir>]',
  'check-sibling-sessions': 'check-sibling-sessions --record <id-or-slug>',
  reconcile: 'reconcile [--dry-run] [--json]',
  'reconcile-summary': 'reconcile-summary',
  'reconcile-background': 'reconcile-background',
};

const HELP_FLAGS = new Set(['--help', '-h']);

// Shared by the resolve-run-dir and spec-status subcommands below — each
// previously defined its own identical `--flag value` lookup closure over a
// different local array (`args` vs `rest`); one function taking the array
// explicitly instead of two copies that could drift.
function flagVal(args, name) {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1];
}

function isDirectory(p) {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

// #280: the one signal that distinguishes "harness-isolation left a real run
// dir trapped in this worktree" from "an ordinary stray directory that
// happens to sit under .claude-tweaks/pipelines/". A bare `mkdir` produces a
// directory too — that must never match — so the bar is that a pipeline step
// actually WROTE to it: one of the three files every initialized run dir
// carries at least one of (decisions.md from Manifesto/standalone-fallback
// init, run-state.json from a hook write, config.yml from the Manifesto).
function isInitializedRunDir(dir) {
  return ['decisions.md', 'run-state.json', 'config.yml']
    .some((marker) => fs.existsSync(path.join(dir, marker)));
}

// Resolves an explicit `--run <path>` argument, validating it's a real
// directory, or falls back to ctxLib.resolveRunDir when --run is absent.
// Shared by record-worktree and close-run below so a future change to what
// counts as a valid --run path (e.g. also rejecting a directory that exists
// but isn't a real run dir, or resolving symlinks first) only needs to land
// once. `args` is the command's own argument list (cmd already stripped);
// when --run is found, its two-element span is spliced out of the returned
// `rest` so a caller with its own positional args (record-worktree's
// worktree path) can still find them regardless of flag placement. `resolveOpts`
// forwards unchanged to the implicit-fallback ctxLib.resolveRunDir call only
// (an explicit --run below never consults it) — close-run passes
// { includeWorktreeForeign: true } so its fallback can still find and report
// a run bound to a different, still-live worktree (whole-branch review
// finding, pre-v6.110.0); every other caller omits it and keeps #1410's
// worktree-safe fallback.
function resolveRunArg(args, cwd, env, resolveOpts) {
  const flagIdx = args.indexOf('--run');
  if (flagIdx === -1) {
    return { runDir: ctxLib.resolveRunDir(cwd, env, undefined, resolveOpts), invalidRunArg: null, rest: args, explicit: false };
  }
  const rest = args.slice();
  const rawCandidate = rest[flagIdx + 1];
  // An empty or whitespace-only value (the shape an unset $PIPELINE_RUN_DIR
  // expands to in shell) must never reach the guards/statSync/path-composition
  // below as a blank path (#1138) — reject it here, at the earliest parse
  // point, before any of that runs.
  const candidate = (rawCandidate && rawCandidate.trim() !== '') ? rawCandidate : null;
  rest.splice(flagIdx, 2);
  if (rawCandidate !== undefined && candidate === null) {
    return { runDir: null, invalidRunArg: '--run requires a value', rest, explicit: true };
  }
  // An explicit --run must resolve to a real directory — falling back to
  // resolveRunDir's "newest non-terminal run" scan on a bad path would
  // silently record against the WRONG run, defeating the reason --run
  // exists at all. Resolved once, against the `cwd` PARAMETER (not
  // process.cwd()) — every current caller happens to pass process.cwd() as
  // `cwd`, but the anchoring check below must honor the parameter it's
  // actually given, not assume the two are always the same value.
  const resolved = candidate ? path.resolve(cwd, candidate) : null;
  const isRealDir = resolved ? isDirectory(resolved) : false;
  if (isRealDir) {
    // #790/[IL-127]: a real directory is not enough — it must also resolve
    // under the main checkout, never a worktree-relative shadow copy. Mirrors
    // run-dir-resolve.js's identical adoption-time check for PIPELINE_RUN_DIR.
    const mainRoot = wtDetect.mainCheckoutRoot(cwd);
    if (!mainRoot) {
      // Distinct from the anchoring-rejection case below: mainCheckoutRoot()
      // returning null means no git repo could be determined at all (not a
      // repo, an unreadable ancestor, an unparseable .git file) — a
      // different failure than "exists, but resolves outside a KNOWN main
      // checkout". Mislabeling it as a worktree-shadow rejection would send
      // a reader hunting for the wrong problem.
      return {
        runDir: null,
        invalidRunArg: `${candidate} (${wtDetect.unanchoredRunDirNoRepoMessage(cwd)})`,
        rest,
        explicit: true,
      };
    }
    if (!wtDetect.isAnchoredUnderRoot(resolved, mainRoot)) {
      // #280/#1183: the general case above (a bare or stray worktree-local
      // directory) stays rejected — that's the [IL-96]/[IL-127] shadow this
      // anchoring check exists to prevent. The one narrow exception: a
      // session whose harness refused every write to the main checkout for
      // the whole session has no anchored copy to name at all, so its run
      // dir was legitimately initialized worktree-local as the only
      // available option (the incident #280 documents). Adopt it ONLY when
      // ALL of:
      //   (a) resolved sits inside a linked worktree of THIS SAME repo — not
      //       an arbitrary directory, and not an unrelated repo's checkout
      //       (#1183: the old check never verified this at all — any
      //       directory carrying a stray marker file was adopted);
      //   (b) that path, relative to the worktree's own
      //       .claude-tweaks/pipelines/, has a run-id-shaped leading segment
      //       (the same `RUN_ID_RE` shape context.js's own run-dir
      //       enumeration, iterRunDirsWithState, uses to distinguish a real
      //       pipeline run dir from an arbitrary directory);
      //   (c) it is already an INITIALIZED run dir — not merely a directory
      //       that exists, the same bar isInitializedRunDir states; and
      //   (d) no same-named run dir already exists at the SAME
      //       pipelines-relative path under the main checkout, which would
      //       make that copy the authoritative one instead — and, for an
      //       archive/{id} shadow specifically, no LIVE (non-archived) run
      //       dir exists under that same id either, since a run can be live
      //       under one id while a worktree-local session independently
      //       archived its own local copy under the same id (#1183 fix-wave);
      //       the mirror also holds for a LIVE-shape shadow: no ARCHIVED run
      //       dir exists under that same id at the main checkout either (#1299).
      // #1183: (d) used to join only path.basename(resolved), so a nested
      // multi-spec shadow (pipelines/{parent}/spec-N) or an archived shadow
      // (pipelines/archive/{id}) computed the wrong main-checkout candidate
      // (pipelines/spec-N, pipelines/{id} — neither ever exists) and was
      // adopted even though the anchored copy existed at the correct
      // nested/archived path. Comparing the full pipelines-relative path
      // fixes both shapes without special-casing either — an archive/{id}
      // shadow's run-id segment is relParts[1] (the archived run keeps its
      // original run-id-shaped directory name one level deeper); every
      // other shape's run-id segment is relParts[0].
      const candidateRepo = wtDetect.repoInfo(resolved);
      // #1183 fix-wave: repoInfo's repoRoot is realpath'd internally (safeReal),
      // but `resolved` above is not — a symlinked path component (macOS /tmp is
      // the common case) then makes the relative-path comparison below compare
      // a canonical root against a lexical path, producing a spurious `..`
      // prefix and wrongly rejecting a legitimate candidate. Realpath resolved
      // here too, mirroring pre-tool-use.js's shadowPipelineRunDir
      // (`const real = realTarget(resolved) || resolved;`). Only used for this
      // comparison — `runDir` below still returns the unresolved `resolved`,
      // matching isAnchoredUnderRoot(resolved, mainRoot) above.
      const realResolved = wtDetect.safeReal(resolved) || resolved;
      const sameRepo = !candidateRepo.indeterminate && candidateRepo.repoRoot && candidateRepo.isLinkedWorktree
        && wtDetect.mainCheckoutRoot(candidateRepo.repoRoot) === mainRoot;
      const relFromPipelines = sameRepo
        ? path.relative(path.join(candidateRepo.repoRoot, '.claude-tweaks', 'pipelines'), realResolved)
        : null;
      const inPipelines = !!relFromPipelines && !relFromPipelines.startsWith('..') && !path.isAbsolute(relFromPipelines);
      const relParts = inPipelines ? relFromPipelines.split(path.sep) : [];
      const isArchiveShape = relParts[0] === 'archive';
      const runIdSegment = isArchiveShape ? relParts[1] : relParts[0];
      const runIdShaped = !!runIdSegment && ctxLib.RUN_ID_RE.test(runIdSegment);
      const mainCandidate = inPipelines ? path.join(mainRoot, '.claude-tweaks', 'pipelines', relFromPipelines) : null;
      // #1183 fix-wave: an archive/{id} shadow must also be checked against a LIVE
      // (non-archived) copy of the same run-id under the main checkout — a run can be
      // live under one id while a worktree-local session independently archived its own
      // local copy under the same id; checking only the archive/{id} path would miss that.
      const mainLiveCandidate = (inPipelines && isArchiveShape && runIdSegment)
        ? path.join(mainRoot, '.claude-tweaks', 'pipelines', runIdSegment)
        : null;
      // #1299: the mirror direction — a LIVE-shape shadow (relParts[0] !==
      // 'archive') must also be checked against an ARCHIVED copy of the same
      // run-id under the main checkout. A run can be archived under one id at
      // the main checkout while a worktree-local session independently kept
      // (or re-created) a live copy under the same id; checking only the
      // live/live path (mainCandidate) would miss that, mirroring the exact
      // gap #1183 closed for the opposite (archive-shape) direction above.
      const mainArchivedCandidate = (inPipelines && !isArchiveShape && runIdSegment)
        ? path.join(mainRoot, '.claude-tweaks', 'pipelines', 'archive', runIdSegment)
        : null;
      // isDirectory already fails closed (try/catch) on a null path, so no
      // separate truthiness guard is needed for mainLiveCandidate/
      // mainArchivedCandidate — mirrors how mainCandidate above is passed
      // through unguarded.
      const twinExists = isDirectory(mainCandidate) || isDirectory(mainLiveCandidate)
        || isDirectory(mainArchivedCandidate);
      // `inPipelines` is provably implied by `runIdShaped` here (relParts, and so
      // runIdSegment, is only ever populated when inPipelines is true) — kept explicit
      // anyway as a self-documenting invariant a future edit to relParts/runIdSegment's
      // derivation could otherwise silently break without either variable's own name
      // signaling that it depends on the other.
      if (sameRepo && inPipelines && runIdShaped && isInitializedRunDir(resolved) && !twinExists) {
        return {
          runDir: resolved, invalidRunArg: null, rest, explicit: true, worktreeLocalFallback: true,
        };
      }
      return {
        runDir: null,
        invalidRunArg: `${candidate} (exists, but not anchored under the main checkout at ${mainRoot} — refusing a worktree-relative shadow run dir; see resolve-run-dir)`,
        rest,
        explicit: true,
      };
    }
    return { runDir: resolved, invalidRunArg: null, rest, explicit: true };
  }
  return { runDir: null, invalidRunArg: candidate || '(missing value)', rest, explicit: true };
}

// #280: prints the worktree-local-fallback disclosure resolveRunArg's
// `worktreeLocalFallback` flag calls for — shared by every call site so a
// future one can't silently omit it the way six of the seven did before this
// fix (review finding: the disclosure was wired only at record-worktree).
function reportWorktreeLocalFallback(runDir, worktreeLocalFallback) {
  if (!worktreeLocalFallback) return;
  process.stdout.write(`claude-tweaks: --run ${runDir} resolved via the worktree-local fallback (#280) — no anchored copy exists under the main checkout; this run's state lives only in this worktree until merge.\n`);
}

async function main(argv) {
  const cmd = argv[2];
  // #1143: dumb, verb-agnostic --help/-h intercept — ahead of every branch
  // below, before any lib call or resolveRunArg scan. Every subcommand here
  // (other than record-worktree, hardened separately by #1124) previously
  // fell through to its normal dispatch on a stray --help, and several of
  // those paths implicitly guess a target run dir (resolveRunDir's "newest
  // non-terminal run") when --run is absent — the exact cross-session
  // corruption hazard observed 2026-08-20 (see the now-removed docs/donts.md
  // bridging rule). Checked against the USAGE table, not a hardcoded verb
  // list, so a verb with no usage entry gets no guard by design.
  if (USAGE[cmd] && argv.slice(3).some((a) => HELP_FLAGS.has(a))) {
    process.stdout.write(`claude-tweaks: usage: ${USAGE[cmd]}\n`);
    return 0;
  }
  if (cmd === 'record-worktree') {
    // --run <path> pins the target run dir explicitly, mirroring close-run
    // below — without it, this always fell through to resolveRunDir's
    // "newest non-terminal run" fallback, which a stale never-closed run
    // could win over the run genuinely making this call.
    const {
      runDir, invalidRunArg, rest, worktreeLocalFallback, explicit,
    } = resolveRunArg(argv.slice(3), process.cwd(), process.env);
    const worktreeArg = rest[0];
    // #1124: every real caller already passes --run explicitly (build's
    // worktree-setup.md Step 4.5, the run-resume-freshness re-stamp, the
    // subagent-output-contract re-stamp) — nothing legitimate depends on the
    // implicit fallback below. An invocation that omits --run previously fell
    // through to resolveRunDir's "newest non-terminal run" GUESS and could
    // silently clobber a DIFFERENT live session's run-state.json (reproduced
    // 3x independently on 2026-08-20, across three different dispatched
    // subagents). Never guess here: refuse loudly, before this handler ever
    // gets a chance to WRITE anything — a true no-op, non-zero exit. (A bare
    // or malformed `--help` no longer reaches this branch at all — #1143's
    // dedicated guard above intercepts it first, before `resolveRunArg` ever
    // runs. `resolveRunArg` itself still runs unconditionally on every other
    // no-`--run` path below, and still calls `ctxLib.resolveRunDir` — a real
    // scan of sibling run-state.json files — whose result this branch simply
    // discards; the guarantee here is "no write," not "no read.")
    if (!explicit) {
      process.stdout.write('claude-tweaks: record-worktree requires --run — worktree not recorded\n');
      return 1;
    }
    reportWorktreeLocalFallback(runDir, worktreeLocalFallback);
    if (invalidRunArg) {
      process.stdout.write(`claude-tweaks: --run path rejected: ${invalidRunArg} — worktree not recorded\n`);
    } else if (worktreeArg && worktreeArg.startsWith('-')) {
      // An unrecognized flag landing in the worktree-path position must
      // never be treated as a literal path — this is the exact shape every
      // observed incident hit (a stray --help specifically no longer reaches
      // this far — #1143's dedicated guard above intercepts it first).
      process.stdout.write(`claude-tweaks: unrecognized argument ${worktreeArg} — worktree not recorded\n`);
      return 1;
    } else if (runDir && worktreeArg) {
      // Stamp the owning session so E1 can scope enforcement to it. Absent env
      // var: omit the key rather than write null — an env-less re-record must
      // not clobber a previous stamp.
      const patch = { worktree: path.resolve(worktreeArg), status: 'active' };
      if (process.env.CLAUDE_CODE_SESSION_ID) patch.sessionId = process.env.CLAUDE_CODE_SESSION_ID;
      const result = ctxLib.writeRunState(runDir, patch);
      if (result) {
        process.stdout.write(`claude-tweaks: worktree recorded for ${path.basename(runDir)}\n`);
      } else {
        process.stdout.write(`claude-tweaks: failed to record worktree for ${path.basename(runDir)} — run-state.json could not be written\n`);
      }
    } else {
      // runDir resolved but worktreeArg is falsy — the only remaining case
      // in this chain (with --run now required above, invalidRunArg is
      // falsy here only when runDir already resolved to a real directory —
      // see resolveRunArg: runDir is null iff invalidRunArg is truthy).
      // Without this branch, a call that omits the worktree positional
      // (e.g. "record-worktree --run <dir>" with nothing after)
      // printed nothing and exited 0, indistinguishable from success.
      process.stdout.write(`claude-tweaks: no worktree path given for ${path.basename(runDir)} — worktree not recorded\n`);
    }
    return 0;
  }
  if (cmd === 'resolve-run-dir') {
    // #692: the tool _shared/pipeline-run-dir.md's Anchoring section points
    // callers at, so a skill step gets the anchored $RUN_ROOT/run directory
    // as one command instead of composing `git rev-parse --git-common-dir`
    // inline — the composition that produced the worktree-local shadow
    // ([IL-127]) this command exists to stop happening again. Unlike every
    // other subcommand in this dispatcher, this one has a genuine non-zero
    // exit code: it is invoked directly from skill prose (never as a hook
    // event), and a skill step needs a real signal to branch on when nothing
    // resolves or an inherited PIPELINE_RUN_DIR turns out to be a shadow.
    const args = argv.slice(3);
    let result;
    try {
      result = require('./lib/hooks/run-dir-resolve').resolve({
        cwd: process.cwd(),
        env: process.env,
        specSlug: flagVal(args, '--spec-slug'),
        mode: flagVal(args, '--mode'),
        standalone: flagVal(args, '--standalone'),
        create: args.includes('--create'),
        rootOnly: args.includes('--root-only'),
      });
    } catch (e) {
      process.stderr.write(`claude-tweaks: resolve-run-dir: unexpected error — ${e && e.message ? e.message : e}\n`);
      return 1;
    }
    if (result.ok) {
      process.stdout.write(result.path + '\n');
      return 0;
    }
    process.stderr.write(`claude-tweaks: resolve-run-dir: ${result.message}\n`);
    return 1;
  }
  if (cmd === 'sweep-shadow') {
    // Promotes curation-engine.md §4's post-fan-out shadow sweep from an
    // inline bash snippet to this verb (#738). --run/--worktree are the raw
    // PIPELINE_RUN_DIR/WORKTREE values as a judge dispatch would set them —
    // sweepShadow() itself does the `pwd -P`-style normalization and the
    // anchoring/same-path checks, so unlike record-worktree/record-pr/
    // close-run this does NOT go through resolveRunArg: --worktree is
    // legitimately a linked worktree, which resolveRunArg's anchoring check
    // would reject outright, and --run's own "is it under the main
    // checkout" question is exactly the sweep's own diagnostic, not a
    // separate gate ahead of it.
    const args = argv.slice(3);
    const runArg = flagVal(args, '--run');
    const worktreeArg = flagVal(args, '--worktree');
    const mainRoot = wtDetect.mainCheckoutRoot(process.cwd());
    if (!mainRoot) {
      process.stdout.write(`sweep: ${wtDetect.unanchoredRunDirNoRepoMessage(process.cwd())} — not swept\n`);
      return 1;
    }
    const { sweepShadow } = require('./lib/hooks/sweep-shadow');
    const result = sweepShadow({
      runRoot: mainRoot,
      pipelineRunDir: runArg ? path.resolve(process.cwd(), runArg) : runArg,
      worktree: worktreeArg ? path.resolve(process.cwd(), worktreeArg) : worktreeArg,
    });
    for (const line of result.lines) process.stdout.write(line + '\n');
    return result.diagnostic ? 1 : 0;
  }
  if (cmd === 'record-pr') {
    // Mirrors record-worktree's shape: --run <path> pins the target run dir
    // explicitly (falls back to resolveRunDir's newest-non-terminal-run scan
    // when absent), positional args after it are the PR number and URL.
    // run-state.json is written only through hooks.js verbs (CLAUDE.md's
    // write-ownership rule) — this is the sanctioned verb for the pr-early
    // run lifecycle's { number, url } field (#409).
    const { runDir, invalidRunArg, rest, worktreeLocalFallback } = resolveRunArg(argv.slice(3), process.cwd(), process.env);
    reportWorktreeLocalFallback(runDir, worktreeLocalFallback);
    const numberArg = rest[0];
    const urlArg = rest[1];
    const number = Number(numberArg);
    if (invalidRunArg) {
      process.stdout.write(`claude-tweaks: --run path rejected: ${invalidRunArg} — PR not recorded\n`);
    } else if (!runDir) {
      process.stdout.write('claude-tweaks: no pipeline run dir found — PR not recorded\n');
    } else if (!numberArg || !Number.isInteger(number) || number <= 0 || !urlArg) {
      process.stdout.write(`claude-tweaks: usage: ${USAGE['record-pr']} — PR not recorded\n`);
    } else {
      // Record the branch alongside the PR while the worktree is still live —
      // this is the one moment it is reliably knowable. run-integrity.js's
      // torn-down-worktree fallback (#1672) reads it back later, when
      // `git worktree list` no longer has an entry to derive it from.
      // Best-effort: a run with no recorded worktree, or a derivation that
      // comes back null, simply records {number, url} as before.
      const prBranch = deriveBranch(repoRootOf(runDir), ctxLib.readRunState(runDir)?.worktree || null);
      const prField = prBranch ? { number, url: urlArg, branch: prBranch } : { number, url: urlArg };
      const result = ctxLib.writeRunState(runDir, { pr: prField });
      if (result) {
        process.stdout.write(`claude-tweaks: PR #${number} recorded for ${path.basename(runDir)}\n`);
      } else {
        process.stdout.write(`claude-tweaks: failed to record PR for ${path.basename(runDir)} — run-state.json could not be written\n`);
      }
    }
    return 0;
  }
  if (cmd === 'spec-status') {
    // Couples a multi-spec manifest.yml status transition to the
    // `## Flow: Running ...` progress banner (#690) — one call does both,
    // so a phase transition can't happen without the banner (and vice
    // versa). --run mirrors record-worktree/record-pr's shape: it names
    // the multi-spec PARENT run dir (where manifest.yml lives — see
    // multi-spec.md's "Run directory layout"), never a per-spec
    // PIPELINE_RUN_DIR subdirectory.
    const { runDir, invalidRunArg, rest, worktreeLocalFallback } = resolveRunArg(argv.slice(3), process.cwd(), process.env);
    reportWorktreeLocalFallback(runDir, worktreeLocalFallback);
    const specArg = flagVal(rest, '--spec');
    const statusArg = flagVal(rest, '--status');
    const phaseArg = flagVal(rest, '--phase');
    const nowArg = flagVal(rest, '--now'); // test-only clock override; real callers omit it
    if (invalidRunArg) {
      process.stdout.write(`claude-tweaks: --run path rejected: ${invalidRunArg} — spec status not recorded\n`);
    } else if (!runDir) {
      process.stdout.write('claude-tweaks: no pipeline run dir found — spec status not recorded\n');
    } else if (!specArg || !statusArg || !phaseArg) {
      process.stdout.write(`claude-tweaks: usage: ${USAGE['spec-status']} — spec status not recorded\n`);
    } else {
      const result = specStatusLib.transitionSpec({
        runDir, specId: specArg, status: statusArg, phase: phaseArg,
        now: nowArg ? new Date(nowArg) : new Date(),
      });
      if (!result.ok) {
        process.stdout.write(`claude-tweaks: spec status not recorded for spec #${specArg} (${result.reason}) — no manifest.yml at ${path.basename(runDir)}, or spec/status/phase invalid\n`);
      } else {
        process.stdout.write(result.banner + '\n');
        if (result.summaryLine) process.stdout.write(result.summaryLine + '\n');
      }
    }
    return 0;
  }
  if (cmd === 'close-run') {
    const { runDir, invalidRunArg, explicit, worktreeLocalFallback } = resolveRunArg(
      argv.slice(3), process.cwd(), process.env, { includeWorktreeForeign: true },
    );
    reportWorktreeLocalFallback(runDir, worktreeLocalFallback);
    if (invalidRunArg) {
      process.stdout.write(`claude-tweaks: --run path rejected: ${invalidRunArg} — run not closed\n`);
    } else if (runDir) {
      const r = closeRunState(runDir, { explicit, sessionId: process.env.CLAUDE_CODE_SESSION_ID });
      if (r.status === 'refused-foreign') {
        process.stdout.write(`claude-tweaks: run ${path.basename(runDir)} was recorded by another session — refusing to close it without an explicit --run\n`);
        return 0;
      }
      if (r.foreignOwner) {
        process.stdout.write(`claude-tweaks: closing run ${path.basename(runDir)} recorded by another session\n`);
      }
      if (!r.wrapupSeen) {
        process.stdout.write(
          `claude-tweaks: closing run ${path.basename(runDir)} with no recorded wrap-up invocation — ` +
          'expected if wrap-up was run manually (typed slash commands leave no ledger event); ' +
          'otherwise consider /claude-tweaks:wrap-up before closing. Event recorded: close-without-wrapup.\n',
        );
      }
      if (r.notYetArchived) {
        process.stdout.write(
          `claude-tweaks: run ${path.basename(runDir)} still holds un-archived work/ content — ` +
          'expected at this point in the normal wrap-up sequence (close-run always runs before archive-run); ' +
          'archival is still pending and will happen via the next routine reconcile pass, or you can archive it now: ' +
          `node "${pluginRoot()}/bin/hooks.js" archive-run --run "${runDir}"\n`,
        );
      }
      if (!r.writeOk) {
        process.stdout.write(`claude-tweaks: failed to close run ${path.basename(runDir)} — run-state.json could not be written\n`);
      }
    } else {
      // No --run was given (or it resolved to nothing) and resolveRunDir's
      // fallback also found no run dir — the only remaining case in this
      // chain. Without this branch, a call that can't resolve any run dir
      // printed nothing and exited 0, indistinguishable from success.
      process.stdout.write('claude-tweaks: no pipeline run dir found — run not closed\n');
    }
    return 0;
  }
  if (cmd === 'teardown-run') {
    const { runDir, invalidRunArg, worktreeLocalFallback } = resolveRunArg(argv.slice(3), process.cwd(), process.env);
    reportWorktreeLocalFallback(runDir, worktreeLocalFallback);
    const mode = argv.includes('--merged') ? 'merged' : (argv.includes('--abandoned') ? 'abandoned' : null);
    if (invalidRunArg) {
      process.stdout.write(`claude-tweaks: --run path rejected: ${invalidRunArg} — run not torn down\n`);
    } else if (runDir) {
      const result = teardownRun(runDir, { mode, sessionId: process.env.CLAUDE_CODE_SESSION_ID });
      process.stdout.write(`claude-tweaks: teardown-run ${path.basename(runDir)}\n${result.lines.map((l) => `  ${l}`).join('\n')}\n`);
    } else {
      process.stdout.write('claude-tweaks: no pipeline run dir found — run not torn down\n');
    }
    return 0;
  }
  if (cmd === 'archive-run') {
    const { archiveRunDir, readConsoleState } = require('./lib/reconcile/archive-merged');
    const { NON_TERMINAL } = require('./lib/hooks/run-integrity');
    const { runDir, invalidRunArg, worktreeLocalFallback } = resolveRunArg(argv.slice(3), process.cwd(), process.env);
    reportWorktreeLocalFallback(runDir, worktreeLocalFallback);
    if (invalidRunArg) {
      process.stdout.write(`claude-tweaks: --run path rejected: ${invalidRunArg} — run not archived\n`);
      return 0;
    }
    if (!runDir) {
      process.stdout.write('claude-tweaks: no pipeline run dir found — run not archived\n');
      return 0;
    }
    const state = ctxLib.readRunState(runDir);
    if (!state) {
      process.stdout.write(
        `claude-tweaks: ${path.basename(runDir)} has no readable run-state.json — not archived; ` +
        'a state-less dir is reconcile\'s archiveOrphanedMint\'s job, not this verb\'s\n',
      );
      return 0;
    }
    if (NON_TERMINAL.has(state.status)) {
      process.stdout.write(
        `claude-tweaks: ${path.basename(runDir)} is ${state.status} — not archived; ` +
        'run close-run first (or let the owning session finish)\n',
      );
      return 0;
    }
    // #1130 AC4: same console gate decideArchive enforces on the reconcile
    // path. 'none' stays allowed here — terminal status means close-run ran,
    // i.e. wrap-up's own flow (incl. the empty-console fast path) completed;
    // only a rendered-but-unanswered console blocks a direct archival.
    if (readConsoleState(runDir) === 'unresolved') {
      process.stdout.write('claude-tweaks: archival refused — console-unresolved (console.json rendered but not resolved; answer or resolve the console first)\n');
      return 0;
    }
    const mainRoot = wtDetect.mainCheckoutRoot(process.cwd());
    if (!mainRoot) {
      process.stdout.write('claude-tweaks: could not resolve the main checkout root — run not archived\n');
      return 0;
    }
    // Output below is informational human text, never parsed by any caller
    // (skills/flow/multispec-review-console.md's parent-dir archival is a
    // future caller of this verb, not a consumer of this stdout format).
    // The "moved:" lines are read from archiveRunDir's own movedEntries
    // return value — never a hardcoded guess at the run dir's shape, which
    // is the exact fixed-list drift this whole record eliminates.
    const result = archiveRunDir(mainRoot, runDir);
    if (!result.ok) {
      process.stdout.write(`claude-tweaks: archival refused — ${result.reason}\n`);
      return 0;
    }
    for (const name of result.movedEntries) {
      process.stdout.write(`moved: ${name}\n`);
    }
    process.stdout.write(`claude-tweaks: archived ${path.basename(runDir)}\n`);
    return 0;
  }
  if (cmd === 'check-resume-freshness') {
    // Read-only: never writes run-state.json. Skills call this immediately
    // before any of the three resume paths' safe-to-resume ruling
    // (skills/_shared/run-resume-freshness.md).
    const { runDir, invalidRunArg, worktreeLocalFallback } = resolveRunArg(argv.slice(3), process.cwd(), process.env);
    reportWorktreeLocalFallback(runDir, worktreeLocalFallback);
    if (invalidRunArg) {
      process.stdout.write(`claude-tweaks: --run path rejected: ${invalidRunArg} — resume freshness not checked\n`);
      return 0;
    }
    if (!runDir) {
      process.stdout.write('claude-tweaks: no pipeline run dir found — resume freshness not checked\n');
      return 0;
    }
    const result = resumeFreshness.checkResumeFreshness(runDir, {
      sessionId: process.env.CLAUDE_CODE_SESSION_ID,
    });
    const runId = path.basename(runDir);
    if (result.safe) {
      process.stdout.write(`claude-tweaks: resume freshness OK for ${runId} (${result.verdict})\n`);
    } else {
      process.stdout.write(`claude-tweaks: resume freshness BLOCKED for ${runId} — run appears actively owned (${result.reason})\n`);
    }
    return 0;
  }
  if (cmd === 'check-staged-inventory') {
    // Read-only, non-blocking companion to check-resume-freshness: reports
    // whether decisions.md's STAGED entries all have a backing staged/
    // file, but never gates a resume (#1269).
    const { runDir, invalidRunArg, worktreeLocalFallback } = resolveRunArg(argv.slice(3), process.cwd(), process.env);
    reportWorktreeLocalFallback(runDir, worktreeLocalFallback);
    if (invalidRunArg) {
      process.stdout.write(`claude-tweaks: --run path rejected: ${invalidRunArg} — staged inventory not checked\n`);
      return 0;
    }
    if (!runDir) {
      process.stdout.write('claude-tweaks: no pipeline run dir found — staged inventory not checked\n');
      return 0;
    }
    const result = stagedInventory.checkStagedInventory(runDir);
    const runId = path.basename(runDir);
    if (result.missing.length === 0) {
      process.stdout.write(`claude-tweaks: staged inventory OK for ${runId} (${result.checked} STAGED entries)\n`);
    } else {
      process.stdout.write(`claude-tweaks: staged inventory MISMATCH for ${runId} — ${result.missing.length} of ${result.checked} STAGED entries missing from staged/: ${result.missing.join(', ')}\n`);
    }
    return 0;
  }
  if (cmd === 'check-sibling-sessions') {
    // [IL-107]: before claiming a record, enumerate live worktrees and their
    // lock-owning pids, not just branches/claims/labels — those are the
    // signals that stayed silent while a sibling session sat eleven commits
    // deep in an unpushed worktree. This fails OPEN by construction: an
    // unresolvable --record, an unparseable lock, or a dead pid all read as
    // "no conflict", never as a block with no way forward (see
    // sibling-sessions.js's own header comment).
    const args = argv.slice(3);
    const flagIdx = args.indexOf('--record');
    const recordRef = flagIdx !== -1 ? args[flagIdx + 1] : null;
    if (!recordRef) {
      process.stdout.write('claude-tweaks: --record <id-or-slug> is required — sibling-session check not run\n');
      return 0;
    }
    const match = siblingSessions.findConflictingSession(recordRef, { cwd: process.cwd() });
    if (match) {
      process.stdout.write(
        `claude-tweaks: sibling session may already hold record ${recordRef} — ` +
        `worktree ${match.path} (branch ${match.branch || '(none)'}, pid ${match.pid}) is in use by a live session; ` +
        `verify before claiming\n`,
      );
    } else {
      process.stdout.write(`claude-tweaks: no sibling-session conflict found for record ${recordRef}\n`);
    }
    return 0;
  }
  if (cmd === 'reconcile') {
    // Thin wrapper over bin/lib/reconcile's one exported entry point —
    // session-start.js calls reconcile() the same way, in-process (#408),
    // so both surfaces are guaranteed to behave identically by construction
    // rather than by a parity test re-deriving the same logic twice.
    const args = argv.slice(3);
    const opts = { dryRun: args.includes('--dry-run'), cwd: process.cwd() };
    const jsonOut = args.includes('--json');
    let out;
    try {
      out = await require('./lib/reconcile').reconcile(opts);
    } catch {
      out = { mirror: null, redTip: null, worktrees: null, claims: null, runs: null, branches: null, remoteBranches: null, console: null, skipped: [{ check: 'all', reason: 'reconcile-threw' }] };
    }
    if (jsonOut) {
      // Unchanged from before #638 — byte-for-byte, so bin/lib/reconcile's
      // existing JSON consumers (dispatch/tidy reading `console.ready` off
      // this) don't move.
      process.stdout.write(JSON.stringify(out) + '\n');
    } else {
      // New default (#638): a compact human-readable summary instead of the
      // full per-item census — see format-summary.js for the aggregation.
      process.stdout.write(require('./lib/reconcile/format-summary').formatSummary(out) + '\n');
    }
    return 0;
  }
  if (cmd === 'reconcile-summary') {
    // #644 Deliverable 3 — the plain one-line residue summary
    // `/claude-tweaks:flow`'s closing report shells out for. Composed
    // without re-running the background checks (release/archive/
    // archive-branches/remote-prune/reap already ran off the hot path via
    // `reconcile-background`, most recently under `session-start.js`) —
    // this reads that persisted `summary.archived` count plus the residue
    // cache both `archive`/`reap` already maintain (Deliverable 2), and
    // runs only the cheap, git-only `mirror` check fresh (mirror-ff.js
    // never shells to `gh` — see index.js's own preflight comment on why
    // it's excluded from the gh-health gate), since mirror's own RESULT
    // never persists anywhere (it only ever runs inline at SessionStart —
    // see that file's FAST_CHECKS comment). The call itself still reaches
    // reconcile()'s end-of-pass freshness stamp, though, which is a
    // DIFFERENT persistence path this call must opt out of — see
    // `skipCacheStamp` below.
    const cwd = process.cwd();
    const root = wtDetect.mainCheckoutRoot(cwd) || cwd;
    const statusPath = path.join(root, '.claude-tweaks', 'reconcile-background-status.json');
    let archivedCount = 0;
    try {
      const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
      archivedCount = (status.summary && typeof status.summary.archived === 'number') ? status.summary.archived : 0;
    } catch { /* no background pass has completed yet — 0 archived is accurate */ }

    let mirror = null;
    try {
      // skipCacheStamp: true — this narrow mirror-only probe must not stamp
      // the shared reconcile-cache.json `lastRunAt` session-start.js's own
      // FAST_CHECKS call gates its `skipIfFresh` freshness check on; doing
      // so would make the next SessionStart within DEFAULT_TTL_MS believe
      // its own mirror/red-tip/console pass already ran and skip it,
      // silently suppressing red-tip's CI-failure surfacing after every
      // successful `/claude-tweaks:flow` completion (see index.js's own
      // comment on this option).
      const mirrorResult = await require('./lib/reconcile').reconcile({ cwd, checks: ['mirror'], skipCacheStamp: true });
      mirror = mirrorResult.mirror;
    } catch { /* best-effort — mirror shows n/a rather than blocking this summary */ }

    const { formatReconcileSummary } = require('./lib/reconcile/residue-summary');
    process.stdout.write(formatReconcileSummary(root, { archivedCount, mirror }) + '\n');
    return 0;
  }
  if (cmd === 'reconcile-background') {
    // Detached-process counterpart to the `reconcile` subcommand above:
    // session-start.js's fast path spawns this (see that file's own header
    // comment on the fast/background split, #820 D8) to run only the
    // write-only janitorial checks off the hot path. Never a session-
    // blocking failure — this process is detached (spawn'd with
    // `detached: true, stdio: 'ignore'` and unref'd) and nothing reads its
    // exit code or stdout, so every path below returns 0 and best-effort
    // swallows its own errors rather than surfacing them anywhere.
    const cwd = process.cwd();
    const { reconcile } = require('./lib/reconcile');
    const { mainCheckoutRoot } = require('./lib/hooks/worktree-detect');
    const { isFresh } = require('./lib/reconcile/cache');
    const { QUIET_SKIP_REASONS } = require('./lib/hooks/worktree-reap');
    const root = mainCheckoutRoot(cwd) || cwd;
    const statusPath = path.join(root, '.claude-tweaks', 'reconcile-background-status.json');

    // Freshness is decided from THIS status file's own `completedAt` —
    // deliberately NOT reconcile()'s shared reconcile-cache.json `lastRunAt`
    // stamp. That stamp fires unconditionally at the end of ANY
    // fully-completed pr-first pass regardless of which `checks` subset ran,
    // so session-start.js's own FAST_CHECKS call (mirror/red-tip/console)
    // also stamps it moments before this process starts — reusing it here
    // would make this process (and the spawn-gate that decided to launch it)
    // see a false "fresh" from a pass that never touched
    // release/archive/archive-branches/remote-prune/reap, and the
    // background checks would never run. Caught by task review against a
    // real pr-first remote (#820 Task 10 fix-up); reconcile()'s own
    // lastRunAt/cache.js contract is untouched by this fix.
    let existingStatus = null;
    try { existingStatus = JSON.parse(fs.readFileSync(statusPath, 'utf8')); } catch { /* none yet */ }
    const alreadyFresh = isFresh(
      { lastRunAt: existingStatus && typeof existingStatus.completedAt === 'number' ? existingStatus.completedAt : null },
      Date.now(),
    );
    if (alreadyFresh) {
      // A very recent background pass already ran — do nothing, not even a
      // status-file touch (surfaced/completedAt are left exactly as they
      // are), since nothing new happened. Same stdout line as a completed
      // run: nothing reads this detached process's stdout or exit code, so
      // there is no caller to distinguish the two for.
      process.stdout.write('claude-tweaks: reconcile-background complete\n');
      return 0;
    }

    // Mutex — session-start.js's spawn-decision TTL gate is best-effort, not
    // a lock, and can still let two sessions starting within the same short
    // window each spawn a background pass (review finding). Only one
    // process may actually run reconcile() at a time; a losing process does
    // nothing, not even a status-file touch — the winner's write already
    // covers this window and a losing process has nothing new to report.
    const { acquireBackgroundLock, releaseBackgroundLock } = require('./lib/reconcile/background-lock');
    const lock = acquireBackgroundLock(root);
    if (!lock) {
      process.stdout.write('claude-tweaks: reconcile-background complete (already running)\n');
      return 0;
    }

    let summary = {};
    try {
      const r = await reconcile({ cwd, checks: BACKGROUND_CHECKS });
      summary = {
        released: (r.claims || []).filter((c) => c.action === 'released').length,
        archived: (r.runs || []).filter((x) => x.action === 'archived').length,
        archivedBranches: (r.branches || []).filter((b) => b.kind === 'branch' && (b.action === 'delete' || b.action === 'tag-and-delete')).length,
        prunedRemote: (r.remoteBranches || []).filter((b) => b.action === 'delete').length,
        reaped: (r.worktrees || []).filter((w) => w.action === 'reaped').length,
        // Individually-named worktrees left in place and why — a more
        // granular signal than the check-level `skipped` array below.
        // Restores the pre-#820-D8 inline block's diagnostic, filtered the
        // same way that block filtered it (routine/expected skip reasons
        // stay quiet — see worktree-reap.js's QUIET_SKIP_REASONS).
        notableWorktrees: (r.worktrees || [])
          .filter((w) => w.action === 'skipped' && !QUIET_SKIP_REASONS.has(w.reason))
          .map((w) => ({ path: w.path, reason: w.reason })),
        skipped: r.skipped || [],
      };
    } catch {
      summary = { failed: true };
    } finally {
      releaseBackgroundLock(lock);
    }
    try {
      fs.mkdirSync(path.dirname(statusPath), { recursive: true });
      fs.writeFileSync(statusPath, JSON.stringify({ completedAt: Date.now(), summary, surfaced: false }));
    } catch { /* best-effort — this process is detached and unwatched either way */ }
    process.stdout.write('claude-tweaks: reconcile-background complete\n');
    return 0;
  }
  if (!EVENTS.includes(cmd)) return 0;
  const mod = loadModule(cmd);
  if (!mod || typeof mod.run !== 'function') return 0;
  const input = ctxLib.parseInput(ctxLib.readStdin());
  const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd();
  // Two views of the same runs, because enforcement and bookkeeping want
  // different things (#62).
  //
  // `runDir`/`runState` stay owner-UNFILTERED — the newest non-terminal run
  // regardless of who owns it (the one exception: unadopted mints — bare
  // mkdir'd dirs with neither run-state.json nor decisions.md — are skipped
  // by resolveRun's fallback since #721, so a mint can no longer shadow an
  // older adopted run and accidentally suppress E1's bystander warning). E1's
  // working-directory gate is about this checkout, not about who owns the run:
  // its whole foreign-session branch exists to warn a bystander that the
  // checkout belongs to somebody else's worktree, which it can only do by
  // resolving a run it does not own.
  //
  // `ownedRun` is scoped to the calling session and is what may be WRITTEN to.
  // The session id comes off the hook payload, not the environment: hook
  // processes are spawned with the harness's own env, so CLAUDE_CODE_SESSION_ID
  // is not reliably present here even though `record-worktree` (a Bash-invoked
  // subcommand, not a hook) can read it.
  const runDir = ctxLib.resolveRunDir(cwd, process.env);
  const runState = runDir ? ctxLib.readRunState(runDir) : null;
  const ownedRun = ctxLib.resolveRun(cwd, process.env, input.session_id);
  const out = (await mod.run({ input, runDir, runState, ownedRun, cwd })) || {};
  if (out.json) fs.writeSync(1, JSON.stringify(out.json));
  return typeof out.exit === 'number' ? out.exit : 0;
}

if (require.main === module) {
  main(process.argv).then((code) => process.exit(code)).catch(() => process.exit(0));
}

// USAGE exported so tests/hooks-help-guard.test.js's table-driven suite
// iterates the SAME verb list this dispatcher's --help/-h guard checks
// membership against, rather than a second, driftable copy of it.
module.exports = { main, BACKGROUND_CHECKS, USAGE };
