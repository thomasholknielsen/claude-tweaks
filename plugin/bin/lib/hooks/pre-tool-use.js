// bin/lib/hooks/pre-tool-use.js — E1: working-directory discipline (block tier)
// + the worktree-required policy gate (run-independent; see below).
// Denies ONLY on a provable mismatch. Ambiguity -> allow: a false-positive
// freeze in an unattended run is worse than a missed catch (E2 still records).
// "Provable" includes ownership: a deny requires the commit to come from the
// session that recorded the worktree (or identity to be unavailable on either
// side, which preserves the pre-stamp behavior). A commit from a DIFFERENT
// session — e.g. unrelated fix work in the main checkout while a pipeline runs
// elsewhere — is not provably this run's work: allow, warn, log.
//
// Deny signal: every return below — including a deny — sets `exit: 0`. A
// PreToolUse deny is communicated entirely via `hookSpecificOutput.
// permissionDecision: 'deny'` on stdout, not via the process exit code; exit
// 2 is a separate, cruder mechanism (Claude Code reads only stderr for the
// block reason and does not also parse stdout JSON), which would silently
// drop the custom permissionDecisionReason built below. This has been the
// behavior since this file's first commit (362e209). Do not "fix" this by
// setting a non-zero exit on deny — CLAUDE.md and bin/hooks.js's header
// comment both now correctly describe this (exit is always 0; the deny
// signal lives only in the stdout JSON) after correcting an earlier version
// of both that claimed "the only deliberate non-zero outcome is the
// pre-tool-use deny," which never actually matched this module's real
// contract.
'use strict';
const fs = require('fs');
const path = require('path');
const { gitTargets, fileWriteTargets, mkdirTargets, WRITE_SHAPES, forEachCommandSegment, skipGlobalFlags } = require('./git-command');
const ctxLib = require('./context');
const policy = require('../policy');
const wtDetect = require('./worktree-detect');
const { runGit } = require('./git-exec');

function pluginRoot() {
  return process.env.CLAUDE_PLUGIN_ROOT || '${CLAUDE_PLUGIN_ROOT}';
}

// The gate's two path-prefix/path-identity exemptions. `.claude-tweaks/pipelines/`
// holds plugin-owned pipeline bookkeeping — run config, the auto-decision log,
// staged proposals — which is gitignored and is not the project work this
// gate exists to isolate. `.claude-tweaks/policy.yml` is the second: the one
// file a session legitimately needs to edit from a non-isolated checkout in
// order to CONFIGURE the very gate that would otherwise deny every other
// write there (spec #537) — see isPolicyFile below for how its comparison
// stays symlink-safe.
//
// Why the pipelines exemption is load-bearing TODAY: run directories are
// anchored to the MAIN checkout at creation (`_shared/pipeline-run-dir.md`,
// Anchoring), so a pipeline running inside a worktree writes config.yml /
// decisions.md / events.jsonl / staged/ to a path OUTSIDE its own isolated
// checkout, by design — that anchoring is what stops a worktree ever holding
// the only copy of a run's audit trail, and what makes automatic worktree
// reaping safe. Without this exemption the gate denies every one of those
// writes on every worktree-always project, and the audit trail is lost at the
// source rather than at teardown.
//
// The pipelines exemption's ORIGINAL justification (#138) was different:
// /wrap-up used to copy a run's audit state out of the worktree just before
// removing it, and that copy-out needed to write into the main checkout. That
// step was deleted once anchoring made it unnecessary. The reason changed;
// the exemption did not — do not read the dead justification as evidence this
// can be removed.
const PIPELINE_STATE_DIR = path.join('.claude-tweaks', 'pipelines');
const POLICY_FILE = path.join('.claude-tweaks', 'policy.yml');

// #959: the one documented worktree-local exception (_shared/pipeline-run-dir.md's
// Anchoring section, "work/{n}-spec.md is the exception"). Matches the tail of a
// pipeline-run-relative path (i.e. with the run-id segment already stripped) against
// either the single-record shape (`work[/{n}-spec.md]`) or the multi-record shape
// (`spec-{slug}/work[/{n}-spec.md]`) — the directory form covers a `mkdir -p` target,
// the file form covers the Write/heredoc target. Deliberately narrow: it does NOT match
// any other file inside `work/`, nor anything below `spec-{slug}/` besides `work/`,
// so the carve-out cannot be used to shadow-write arbitrary pipeline state into a
// worktree — only the one tracked, committed-on-branch artifact this section documents.
const WORK_SPEC_TAIL_RE = /^(?:spec-[^/\\]+[/\\])?work(?:[/\\]\d+-spec\.md)?$/;

// Materialize-commit sentinel for the bookkeeping-stamps gate below: a
// committed work/{n}-spec.md (or its multi-record spec-{slug}/work/{n}-spec.md
// form) on the current branch is the signal that build/SKILL.md Spec Step 1's
// materialize commit already landed — the exact precondition
// build/worktree-setup.md Step 4.5 (record-worktree) and Step 6 (PR-early
// lifecycle) are documented to precede. Read-only, best-effort: any git
// failure (no commits yet, git unavailable) resolves to false — ambiguity
// never triggers the gate, same posture as every other check in this file.
function hasMaterializeCommit(worktreeRoot) {
  const { stdout, failure } = runGit(
    ['log', '--oneline', '-1', '--', 'work', 'spec-*/work'],
    worktreeRoot,
  );
  if (failure) return false;
  return Boolean(stdout && stdout.trim());
}

// git always reports/accepts forward-slash paths regardless of platform —
// used for GATE_COVERAGE's prose-facing rendering and for comparing against
// `git diff --cached --name-only` output in isPolicyOnlyCommit below.
function toPosix(p) {
  return p.split(path.sep).join('/');
}

// The single machine-readable statement of what the worktree-always gate
// covers. `skills/_shared/policy-schema-coverage.md`'s `worktree-always`
// coverage block is its prose counterpart, and tests/hooks-gate-coverage.test.js
// asserts the two agree — so widening this constant fails a test until that
// block is updated. Every other skill file cites that block rather than
// restating the list.
//
// Why the binding exists: this set was widened twice on 2026-07-20 (push in
// c8f929e1, cp/mv/tee in cab6142b) and no commit swept the prose describing
// it. Four skill files went on documenting the pre-widening gate, two of them
// prescribing procedures that the widened gate denies (#138).
// Each field is read by the code below (or, for bashWriteShapes, re-exported
// from the module that implements it) — never a parallel hand-kept list, which
// is the drift this whole binding exists to prevent.
const GATE_COVERAGE = Object.freeze({
  tools: Object.freeze(['Edit', 'Write', 'NotebookEdit']),
  gitActions: Object.freeze(['commit', 'push']),
  bashWriteShapes: WRITE_SHAPES,
  // These have their own prose-binding block — skills/_shared/policy-schema-coverage.md's
  // "Teardown gate coverage" section (tests/hooks-gate-coverage.test.js pins
  // the two) — deliberately separate from the worktree-always block above,
  // so widening either gate never requires touching the other's prose.
  teardownTools: Object.freeze(['ExitWorktree']),
  teardownGitCommands: Object.freeze(['worktree remove']),
  // The two exemptions above (paths) plus the allowlisted-commit rule (see
  // POLICY_COMMIT_ALLOWLIST / isPolicyOnlyCommit below). `paths[0]` carries a
  // trailing slash to mark it as a PREFIX; `paths[1]` is an exact-file match.
  exemptions: Object.freeze({
    paths: Object.freeze([`${toPosix(PIPELINE_STATE_DIR)}/`, toPosix(POLICY_FILE)]),
    commit: 'policy-only',
    push: 'delete-only',
  }),
});

// Fails CLOSED, deliberately: anything this cannot prove sits under the repo's
// own .claude-tweaks/pipelines/ is NOT exempt and falls through to the deny.
// A relative path is unprovable here (the cwd it would resolve against is not
// necessarily the one the write executes in), so it is never exempt — matching
// resolveWriteTarget's own "never fabricate a target you can't prove" posture
// in git-command.js.
function isPipelineBookkeeping(repoRoot, targetPath) {
  if (!repoRoot || typeof targetPath !== 'string' || !targetPath) return false;
  if (!path.isAbsolute(targetPath)) return false;
  return path.resolve(targetPath).startsWith(path.join(repoRoot, PIPELINE_STATE_DIR) + path.sep);
}

// Resolves a write TARGET the way an already-existing file or symlink chain
// actually behaves: if something exists at this path, follow it all the way
// (fs.realpathSync follows every symlink, including the final component) —
// an Edit/Write through a symlink acts on whatever it ultimately points at.
// If nothing exists there yet (Write creating a brand-new file), there is no
// leaf to follow: resolve only the parent directory and keep the literal
// basename. A path that EXISTS but is an unresolvable (dangling/escaping)
// symlink is never treated as "doesn't exist yet" — that would let a symlink
// swap masquerade as a fresh Write and slip through the parent-only fallback
// meant for genuinely new files. Non-absolute/empty/non-string input is
// unprovable, matching isPipelineBookkeeping's own posture above.
function realTarget(targetPath) {
  if (typeof targetPath !== 'string' || !targetPath || !path.isAbsolute(targetPath)) return null;
  const resolved = path.resolve(targetPath);
  const real = safeReal(resolved);
  if (real) return real;
  let isSymlink = false;
  try { isSymlink = fs.lstatSync(resolved).isSymbolicLink(); } catch { /* nothing at this path at all */ }
  if (isSymlink) return null;
  const parentReal = safeReal(path.dirname(resolved));
  if (!parentReal) return null;
  return path.join(parentReal, path.basename(resolved));
}

// Resolves the CANONICAL reference location for a repo-relative path —
// {repoRoot}/{relPath} — WITHOUT ever following a symlink that might have
// replaced the leaf itself; only the parent directory is realpath'd. This
// asymmetry against realTarget above (which follows everything) is what
// stops an attacker from replacing .claude-tweaks/policy.yml with a symlink
// to somewhere writable: if both sides resolved the leaf, they would
// trivially agree on the forged destination. This side always means
// "whatever is literally at {relPath}", never wherever a swapped-in symlink
// currently points.
function canonicalRepoPath(repoRoot, relPath) {
  if (!repoRoot) return null;
  const joined = path.join(repoRoot, relPath);
  const parentReal = safeReal(path.dirname(joined));
  if (!parentReal) return null;
  return path.join(parentReal, path.basename(joined));
}

// The gate's second exemption (see the header comment above
// PIPELINE_STATE_DIR): Edit/Write/NotebookEdit targeting the repo's own
// .claude-tweaks/policy.yml, compared as fully-resolved real paths — exact
// equality only, never containment — so a symlink ALIAS to policy.yml
// resolves to the same allow and policy.yml itself being SWAPPED for a
// symlink elsewhere resolves to the same deny (see canonicalRepoPath).
function isPolicyFile(repoRoot, targetPath) {
  const real = realTarget(targetPath);
  if (!real) return false;
  const canonical = canonicalRepoPath(repoRoot, POLICY_FILE);
  if (!canonical) return false;
  return real === canonical;
}

// The commit exemption's allowlist grammar (spec #537 Deliverables): admits
// EXACTLY `git commit` plus one-or-more -m/--message args and an optional
// --no-verify, in any order, nothing else — no other flag, no pathspec, no
// shell operator, no env-var prefix, no path to git. Default-deny by
// construction: there is no disqualifying-flag list to maintain, because
// anything not spelled out here simply fails to match.
const CQ_SINGLE = "'[^']*'";
const CQ_DOUBLE = '"[^"$`\\\\]*"'; // no $, backtick, or backslash inside
const CQ_BARE = '[A-Za-z0-9._:/#-]+';
const CQ_ARG = `(?:${CQ_SINGLE}|${CQ_DOUBLE}|${CQ_BARE})`;
const CQ_MSG = `(?:-m\\s*${CQ_ARG}|--message(?:=|\\s+)${CQ_ARG})`;
const CQ_TOKEN = `(?:${CQ_MSG}|--no-verify)`;
const POLICY_COMMIT_ALLOWLIST = Object.freeze(new RegExp(
  `^\\s*git\\s+commit(?:\\s+${CQ_TOKEN})*\\s+${CQ_MSG}(?:\\s+${CQ_TOKEN})*\\s*$`,
));

// Allowlist-match first (pure regex, no spawn); only a match pays for a git
// query, and only that query's result decides the exemption — a staged set
// of exactly one entry, .claude-tweaks/policy.yml, whose status is an Add,
// Modify, or Delete. `--name-status` rather than `--name-only`, deliberately:
// `--name-only` collapses a rename to its single destination line, so
// `git mv <tracked-file> .claude-tweaks/policy.yml` (ungated — neither a
// commit/push nor a WRITE_SHAPE) on a repo where policy.yml is not yet in
// HEAD reads as "exactly policy.yml staged" and smuggles arbitrary tracked
// content into the enforcement file (review finding). A rename renders as
// `R<score>\told\tnew` under --name-status and is rejected on its status
// letter; likewise Copy (C) and type-change (T). Wrapped so any exception
// from the git spawn can never propagate out of this hook (this file's
// header: never throw) — it falls through to "not exempt" instead.
const POLICY_COMMIT_STATUSES = new Set(['A', 'M', 'D']);
function isPolicyOnlyCommit(command, cwd) {
  if (typeof command !== 'string' || !POLICY_COMMIT_ALLOWLIST.test(command)) return false;
  try {
    const { stdout, failure } = runGit(['diff', '--cached', '--name-status'], cwd);
    if (failure !== null || typeof stdout !== 'string') return false;
    const rows = stdout.split('\n').filter(Boolean);
    if (rows.length !== 1) return false;
    const cols = rows[0].split('\t');
    // Exactly two columns — status + one path. A rename/copy row carries three.
    if (cols.length !== 2) return false;
    const [status, file] = cols;
    return POLICY_COMMIT_STATUSES.has(status) && file === toPosix(POLICY_FILE);
  } catch {
    return false;
  }
}

// The delete-only push exemption's allowlist grammar (spec #658, Deliverable
// 1's decision: EXEMPT): admits EXACTLY `git push <remote> --delete <branch>`
// or `git push <remote> :<branch>` — one remote, one branch, nothing else —
// no other flag, no shell operator (&&, ;, |, $(), backticks), no env-var
// prefix, no path to git other than the bare word. Mirrors
// POLICY_COMMIT_ALLOWLIST's whole-command, default-deny-by-construction
// discipline directly: a compound command or an extra flag/positional simply
// fails to match, the same way a compound commit does above. Unlike the
// commit exemption, this needs no extra git query — a branch-delete push's
// ref target is fully determined by the command text alone (a commit's
// staged content is not), so the regex match is the whole check.
const DELETE_ONLY_PUSH_ALLOWLIST = Object.freeze(new RegExp(
  `^\\s*git\\s+push\\s+${CQ_ARG}\\s+(?:--delete\\s+${CQ_ARG}|:${CQ_BARE})\\s*$`,
));

function isDeleteOnlyPush(command) {
  return typeof command === 'string' && DELETE_ONLY_PUSH_ALLOWLIST.test(command);
}

// Kept returning `string | null` — E1's own callers below compare toplevels for
// a PROVABLE mismatch and already resolve any falsy value to allow, so the
// indeterminate/negative distinction that repoInfo now draws would change no
// decision here. (The worktree gate is the caller that needed it.)
function toplevel(dir) {
  return runGit(['rev-parse', '--show-toplevel'], dir).stdout;
}

function safeReal(p) {
  try { return fs.realpathSync(p); } catch { return null; }
}

// Shared shape for every PreToolUse deny below (checkTeardownGate,
// checkWorktreeRequired, runInner's E1) — same hookEventName/
// permissionDecision wrapper each time, differing only in the reason text.
// exit stays 0 on a deny; see this file's header comment for why.
function denyResult(reason) {
  return {
    exit: 0,
    json: {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    },
  };
}

// Resolves the worktree path(s) a teardown call targets, or [] when none can
// be determined confidently — teardownTargets never fabricates a target;
// checkTeardownGate below treats an empty result as allow.
//
// ExitWorktree: Task 0 (spec #373) captured the real PreToolUse payload and
// cross-checked it against ToolSearch's own loaded schema for the tool —
// `tool_input` is exactly `{action, discard_changes}`, structurally with NO
// path field at all (not just absent from the one sampled call). A
// design sketch for this gate carried an explicit-path branch as a
// hedge against that being unmeasured; per the pinned findings it is
// dead code for the real payload, so it is dropped here rather than kept
// unreachable. The only usable signal is the hook's own `cwd`, which Task 0
// also confirmed fires INSIDE the worktree being exited — PreToolUse runs
// before the tool's effect takes place, so this is always the worktree in
// teardown, never a post-exit directory. Resolved to its containing toplevel.
// Gated on `action === 'remove'` only — `action: 'keep'` (or anything else)
// is non-destructive (the worktree stays on disk; only cwd is restored), so
// it must never even become a candidate target, let alone get denied with a
// deny reason that would be factually false for it (whole-branch review
// CRITICAL 2, spec #373).
//
// Bash: ONLY the narrow `git worktree remove [--force|-f|--] <path>` shape,
// parsed per shell segment via git-command.js's own forEachCommandSegment —
// which also tracks `cd` across segments, so `cd <dir> && git worktree
// remove <relative>` resolves against the post-cd cwd instead of being
// missed entirely (whole-branch review IMPORTANT 4). This deliberately does
// not extend the compound-command surface #174 tracks. Any other flags,
// multiple positionals, or parse doubt skip that segment; never fabricate a
// target — ambiguity resolves to allow.
// Each entry carries `source` ('exitworktree' | 'bash') alongside the
// resolved `path` — checkTeardownGate's own-cwd guard (#693) below applies
// ONLY to the 'bash' source: ExitWorktree always resolves to ctx.cwd's own
// toplevel (see the block comment above this function) and IS the sanctioned
// own-cwd removal path, so the same "target is my own cwd" shape must never
// deny it the way it denies a raw `git worktree remove`.
function teardownTargets(ctx) {
  const toolName = ctx.input && ctx.input.tool_name;
  const toolInput = ctx.input && ctx.input.tool_input;
  if (GATE_COVERAGE.teardownTools.includes(toolName)) {
    if (!toolInput || toolInput.action !== 'remove') return [];
    const top = toplevel(ctx.cwd || process.cwd());
    return top ? [{ path: top, source: 'exitworktree' }] : [];
  }
  if (toolName !== 'Bash' || !toolInput || typeof toolInput.command !== 'string') return [];
  const out = [];
  forEachCommandSegment(toolInput.command, ctx.cwd || process.cwd(), (toks, effCwd) => {
    if (toks[0] !== 'git') return;
    // Shares gitTargets' own global-flag skipper: any global flag ahead of
    // the subcommand (-C, -c, --exec-path, --namespace, --git-dir,
    // --work-tree, or an unrecognized `-...` flag) used to defeat this
    // parser entirely when it only checked for a literal `-C`, silently
    // allowing `git -c foo=bar worktree remove <path>` past the gate.
    const { index: i, dir, unprovable } = skipGlobalFlags(toks, 1, effCwd);
    if (unprovable) return;
    if (dir === null) return; // cwd unknown and no provable -C -> no target
    // Derived from GATE_COVERAGE.teardownGitCommands rather than a hardcoded
    // comparison, so the constant stays load-bearing (see tools/gitActions
    // above) instead of a parallel hand-kept list nothing reads (#hooks-gate-coverage).
    if (typeof toks[i] !== 'string' || typeof toks[i + 1] !== 'string') return;
    const sub = `${toks[i]} ${toks[i + 1]}`;
    if (!GATE_COVERAGE.teardownGitCommands.includes(sub)) return;
    // `--`, like `--force`/`-f`, is a flag/terminator, never the path itself.
    const rest = toks.slice(i + 2).filter((t) => t !== '--force' && t !== '-f' && t !== '--');
    if (rest.length !== 1 || rest[0].startsWith('-')) return; // unconfident -> allow
    out.push({ path: path.resolve(dir, rest[0]), source: 'bash' });
  });
  return out;
}

// The teardown gate itself: denies (or, for a provably foreign-owned run,
// warns) an ExitWorktree/`git worktree remove` call that targets a worktree
// still assigned to a non-terminal pipeline run. Mirrors E1's own
// deny/foreign-session/allow shape below, at the teardown boundary instead of
// the commit boundary.
//
// `teardownWarnings` (out-parameter, mirrors `indeterminateTargets` on
// checkWorktreeRequired below): a foreign-owned hit is collected here and the
// loop CONTINUES rather than returning — an early return on the warn path
// used to short-circuit runInner entirely, so a compound `git worktree
// remove <foreign-wt> && git commit -m x` skipped the worktree-always check
// on the trailing commit (whole-branch review IMPORTANT 3). Only a genuine
// deny still returns early — a deny is the one outcome where evaluating
// anything further is pointless (the call is blocked).
function checkTeardownGate(ctx, teardownWarnings = []) {
  const targets = teardownTargets(ctx);
  if (!targets.length) return {};
  // A run whose recorded `worktree` IS the main checkout (a bad record, or a
  // current-branch-strategy run) must never deny an ExitWorktree/`worktree
  // remove` call issued AT the main checkout — there is no worktree to
  // orphan there, and the deny message's "remove the worktree" framing would
  // be nonsensical (whole-branch review MINOR 6). Computed only when there is
  // at least one target, since it costs an fs walk on every hook call
  // otherwise.
  const mainRoot = safeReal(wtDetect.mainCheckoutRoot(ctx.cwd || process.cwd()));
  // Own-cwd guard (#693): resolved once per call, reused across targets.
  const cwdReal = safeReal(ctx.cwd || process.cwd());
  for (const { path: target, source } of targets) {
    if (mainRoot && safeReal(target) === mainRoot) continue;

    // A raw Bash `git worktree remove` (never ExitWorktree — see teardownTargets'
    // header comment) whose target IS the session's own cwd, or a directory
    // containing it, deletes the shell's live working directory out from
    // under itself: the incident #693 documents. This fires independent of
    // any pipeline-run assignment below — a `close-run` already having run
    // (which lifts the assignment-based deny further down, see AC2 in
    // tests/teardown-gate.test.js) does nothing to stop the shell's own cwd
    // being pulled out from under it, which is exactly the gap that let the
    // incident's raw remove through. Ambiguity (unresolvable target or cwd)
    // still resolves to allow, matching this file's own posture throughout.
    if (source === 'bash') {
      const targetReal = safeReal(target);
      if (targetReal && cwdReal && (cwdReal === targetReal || cwdReal.startsWith(targetReal + path.sep))) {
        return denyResult(
          `claude-tweaks teardown gate: this \`git worktree remove\` targets ${target}, which is the ` +
          `current session's own working directory (or an ancestor of it). Removing it deletes the ` +
          `shell's live cwd and leaves the session with no git context. Use \`ExitWorktree\` instead — ` +
          `it is the only sanctioned way to remove the worktree a session is standing in ` +
          `(skills/wrap-up/cleanup-procedures.md Section C's Teardown ordering invariant).`,
        );
      }
    }

    let exists = false;
    try { fs.statSync(target); exists = true; } catch { /* gone */ }
    // Recorded-or-target path already gone from disk -> allow (fail-open).
    // Target and recorded assignment are the same path once matched, so
    // statting the target side covers both.
    if (!exists) continue;
    const hit = ctxLib.findRunByWorktreePath(ctx.cwd, target);
    if (!hit || !hit.state) continue;
    const status = hit.state.status;
    if (status !== 'active' && status !== 'interrupted') continue;
    const owner = typeof hit.state.sessionId === 'string' && hit.state.sessionId ? hit.state.sessionId : null;
    const caller = ctx.input && typeof ctx.input.session_id === 'string' && ctx.input.session_id ? ctx.input.session_id : null;
    if (owner && caller && owner !== caller) {
      // Provably foreign-owned: allow + warn, event to the TARGET run's dir
      // (the wd-foreign-session precedent — enforcement-target, not
      // ownedRun). Collected, not returned — see the function header.
      ctxLib.appendEvent(hit.runDir, 'wd-foreign-teardown', { path: target });
      teardownWarnings.push(
        `claude-tweaks: worktree ${target} is assigned to run ${path.basename(hit.runDir)}, recorded by a different session — ` +
        `allowing this teardown, but if that pipeline is still live its state will be orphaned. ` +
        `Prefer closing the run first: node "${pluginRoot()}/bin/hooks.js" close-run --run "${hit.runDir}"`,
      );
      continue;
    }
    // Same session, unowned run, or identity missing on either side -> deny.
    return denyResult(
      `claude-tweaks teardown gate: worktree ${target} is still assigned to non-terminal pipeline run ` +
      `${hit.runDir}. Tearing it down now skips the documented cleanup sequence (skills/wrap-up/cleanup-procedures.md ` +
      `Section C) and destroys the run's gitignored state. Finish via /claude-tweaks:wrap-up, or close the bookkeeping first: ` +
      `node "${pluginRoot()}/bin/hooks.js" close-run --run "${hit.runDir}", then retry.`,
    );
  }
  return {};
}

// Pipeline-shadow guard (#692): refuses to CREATE `.claude-tweaks/pipelines/`
// state inside a linked worktree at all — see _shared/pipeline-run-dir.md's
// Anchoring section, and `node bin/hooks.js resolve-run-dir`, the command that
// section now points callers at instead of composing $RUN_ROOT inline. Unlike
// checkWorktreeRequired below, this guard is UNCONDITIONAL: it does not check
// `worktree-always` policy, because run-dir anchoring is a plugin-architecture
// invariant every project gets, not something a project opts into.
//
// Flags only a NEW creation — the run-dir-level path (the first path segment
// under `.claude-tweaks/pipelines/`) does not already exist on disk. A
// pre-anchoring run directory already sitting in a worktree is left alone
// (tolerated transitionally by wrap-up/cleanup-procedures.md Section C step
// 3.5's copy-out guard, sunset 2026-11-07): that guard only ever READS from
// the worktree and WRITES to the main checkout, so it never trips this guard
// itself, and further writes into an already-existing worktree-trapped run
// dir (e.g. a still-running pre-anchoring pipeline appending events.jsonl)
// must not be newly denied by a guard shipped after that pipeline started.
//
// #959: also lets the one documented worktree-local exception through even
// when the run-id directory does NOT yet exist there — `work/{n}-spec.md`
// (or its multi-record `spec-{slug}/work/{n}-spec.md` form) is meant to be
// created and committed on the feature branch as the run's FIRST commit
// (materialize.md's "When this runs"), so requiring the run-dir to
// pre-exist made the sanctioned exception unreachable by any tool-mediated
// write. See WORK_SPEC_TAIL_RE above for exactly what this does and does
// not cover.
function shadowPipelineRunDir(targetPath) {
  if (typeof targetPath !== 'string' || !targetPath || !path.isAbsolute(targetPath)) return null;
  const resolved = path.resolve(targetPath);
  const { repoRoot, isLinkedWorktree, indeterminate } = wtDetect.repoInfo(resolved);
  if (indeterminate || !repoRoot || !isLinkedWorktree) return null;
  const pipelinesDir = path.join(repoRoot, PIPELINE_STATE_DIR);
  // realTarget follows an existing symlink chain the same way the policy.yml
  // exemption does; falls back to the literal resolved path when nothing
  // exists yet (a brand-new mkdir target has no leaf, sometimes not even a
  // parent, to realpath).
  const real = realTarget(resolved) || resolved;
  const relFromPipelines = path.relative(pipelinesDir, real);
  if (!relFromPipelines || relFromPipelines.startsWith('..') || path.isAbsolute(relFromPipelines)) return null;
  const relParts = relFromPipelines.split(path.sep);
  const runDirName = relParts[0];
  const tail = relParts.slice(1).join(path.sep);
  if (WORK_SPEC_TAIL_RE.test(tail)) return null;
  const runDirCandidate = path.join(pipelinesDir, runDirName);
  let exists = false;
  try { exists = fs.statSync(runDirCandidate).isDirectory(); } catch { /* not there yet — a genuinely new shadow */ }
  if (exists) return null;
  return { worktreeRoot: repoRoot, runDirCandidate };
}

function checkPipelineShadowGuard(ctx) {
  const toolName = ctx.input && ctx.input.tool_name;
  const toolInput = ctx.input && ctx.input.tool_input;
  const candidates = [];
  if (GATE_COVERAGE.tools.includes(toolName)) {
    const field = toolName === 'NotebookEdit' ? 'notebook_path' : 'file_path';
    if (toolInput && typeof toolInput[field] === 'string') candidates.push(toolInput[field]);
  } else if (toolName === 'Bash' && toolInput && typeof toolInput.command === 'string') {
    const command = toolInput.command;
    for (const t of fileWriteTargets(command, ctx.cwd)) candidates.push(t.file);
    for (const t of mkdirTargets(command, ctx.cwd)) candidates.push(t.file);
  }
  for (const candidate of candidates) {
    const shadow = shadowPipelineRunDir(candidate);
    if (!shadow) continue;
    return denyResult(
      `claude-tweaks: refusing to create ${shadow.runDirCandidate} — a NEW pipeline run directory inside a ` +
      `linked worktree (${shadow.worktreeRoot}). Run directories are anchored to the main checkout ` +
      `(_shared/pipeline-run-dir.md's Anchoring section); creating one here would be a worktree-local shadow that ` +
      `a later \`git worktree remove\` can silently destroy ([IL-127]). Resolve the correct path instead: ` +
      `node "${pluginRoot()}/bin/hooks.js" resolve-run-dir --create (see pipeline-run-dir.md for the full flag set).`,
    );
  }
  return {};
}

// worktree-required policy gate: unlike E1 below, this needs no pipeline run
// state at all — it fires on the first Edit/Write/NotebookEdit/commit of a
// session, before any skill has ever run, whenever the target repo has opted
// into `worktree-always: true` in its .claude-tweaks/policy.yml.
//
// `precomputedGitTargets` (Bash calls only) lets run() share the one
// gitTargets() parse of the command with its own later E1 loop instead of
// re-running git-command.js's quote-aware segment/token walk a second time
// over the same string.
// `indeterminateTargets` (optional, caller-supplied array) collects paths whose
// repo status could not be determined — see the branch below. An out-parameter
// rather than an extra return field so this function's return shape stays
// exactly `{}` | `{exit, json}`, leaving runInner's `if (gate.json) return gate`
// dispatch untouched.
function checkWorktreeRequired(ctx, precomputedGitTargets, indeterminateTargets = []) {
  const toolName = ctx.input && ctx.input.tool_name;
  const toolInput = ctx.input && ctx.input.tool_input;
  // Each entry is { path, exemptible, fileTool, action }. `exemptible` marks a
  // target that names a FILE being written, which is the only kind the
  // .claude-tweaks/pipelines/ exemption may apply to. A git commit/push target
  // is the command's working DIRECTORY, not a file — exempting those by prefix
  // would allow any commit merely ISSUED from inside .claude-tweaks/pipelines/,
  // which is precisely the isolation this gate enforces. `fileTool` is
  // narrower still: set ONLY for an Edit/Write/NotebookEdit target, never for a
  // Bash write shape (tee/cp/sed -i/…) — the .claude-tweaks/policy.yml
  // exemption is scoped to the three file tools by spec #537's Non-Goals (a
  // shell rewrite of an enforcement-relevant file stays gated), so it keys on
  // this flag, not on `exemptible`. `action` ('commit'/'push', only set for git
  // targets) is what lets the commit exemption below apply ONLY to a commit
  // target, never a push one. All three distinctions have to be carried from
  // where each target is resolved; none can be recovered later.
  let targetPaths = [];
  // The raw Bash command string, hoisted out of the branch below so the
  // per-target loop can reach it for the commit exemption's allowlist check
  // (isPolicyOnlyCommit needs the whole command, not just a resolved target).
  let bashCommand = null;

  // GATE_COVERAGE.tools decides WHETHER a tool is gated; only the input field
  // name varies per tool. Keep that list in sync with the Edit/Write/
  // NotebookEdit matchers in hooks/hooks.json — a new file-mutation tool must
  // be added to both or it silently bypasses this gate.
  if (GATE_COVERAGE.tools.includes(toolName)) {
    const field = toolName === 'NotebookEdit' ? 'notebook_path' : 'file_path';
    if (toolInput && typeof toolInput[field] === 'string') {
      targetPaths = [{ path: toolInput[field], exemptible: true, fileTool: true }];
    }
  } else if (toolName === 'Bash') {
    const command = toolInput && typeof toolInput.command === 'string' ? toolInput.command : null;
    if (command) {
      bashCommand = command;
      // Both commit AND push are covered by this policy (see the deny
      // message below and CLAUDE.md's Hooks section) — gitTargets already
      // detects both actions, so don't narrow to 'commit' only, or a bare
      // `git push` from a non-isolated checkout silently bypasses the gate.
      // Check EVERY target the command contains, not just the first — a
      // single compound Bash call can chain multiple independent
      // git/write targets (e.g. `git -C $A commit ... && git -C $B commit
      // ...`, or a git commit alongside a separate cp/mv/tee write), and
      // each one is checked on its own below: a violation later in the
      // chain must not be masked by an earlier, compliant target.
      const targets = precomputedGitTargets || gitTargets(command, ctx.cwd);
      const gitTargetPaths = targets
        .filter((t) => GATE_COVERAGE.gitActions.includes(t.action))
        .map((t) => ({ path: t.dir, exemptible: false, action: t.action }));
      // Non-git direct file writes (tee, cp, mv) — best-effort,
      // not exhaustive (see fileWriteTargets' own header comment).
      const writeTargetPaths = fileWriteTargets(command, ctx.cwd).map((t) => ({ path: t.file, exemptible: true }));
      targetPaths = [...gitTargetPaths, ...writeTargetPaths];
    }
  }
  if (!targetPaths.length) return {};

  for (const { path: targetPath, exemptible, fileTool, action } of targetPaths) {
    // Cheap fs-only pre-check: if no policy.yml exists anywhere in the
    // ancestor chain, there is definitely nothing to enforce for THIS
    // target — skip forking git entirely for the overwhelming majority of
    // projects that never opt into this policy. This is a fast-reject
    // filter ONLY: once it finds a policy file somewhere, the actual
    // enforcement check below still re-scopes to the target's own git repo
    // root, since a policy file belonging to an unrelated ANCESTOR
    // directory outside this repo's boundary must not leak into a nested
    // repo (e.g. a submodule) that never opted in itself.
    if (!wtDetect.findPolicyFile(targetPath)) continue;

    const { repoRoot, isLinkedWorktree, indeterminate } = wtDetect.repoInfo(targetPath);
    // TWO different conditions reach a null repoRoot, and they are not the same
    // fact (#134):
    //   indeterminate: false -> git ran and said "not a git repository". A real
    //     answer, and nothing to enforce: allow, silently, as before.
    //   indeterminate: true  -> git never answered (timed out under load, the
    //     fork was refused, git is missing, or realpath on its answer failed).
    //     We do not know whether this path is a repo, let alone whether it opted
    //     into the policy.
    // We still ALLOW the indeterminate case: CLAUDE.md's hooks contract is
    // "never break a session" and "ambiguity resolves to allow", and denying on
    // a transient load spike would freeze unattended runs. What changes is that
    // it is no longer SILENT — before, a load spike and a non-repo produced
    // byte-identical behavior, so an enforcement gap left no trace anywhere.
    if (indeterminate) {
      indeterminateTargets.push(targetPath);
      continue;
    }
    if (!repoRoot) continue; // git answered: not a git repo at all -> allow
    if (!policy.isWorktreeAlwaysOn(repoRoot)) continue;
    if (isLinkedWorktree) continue;
    // Placed here, immediately before the deny, so no earlier `continue` can
    // claim a path this was meant to exempt — the ordering defect [IL-83]
    // records. Only file-write targets are eligible; see `exemptible` above.
    if (exemptible && isPipelineBookkeeping(repoRoot, targetPath)) continue;
    // The second path exemption (#537): an Edit/Write/NotebookEdit write whose
    // fully-resolved real path IS the repo's own .claude-tweaks/policy.yml —
    // see isPolicyFile. Keyed on `fileTool`, NOT `exemptible`: a Bash write
    // shape (tee/cp/sed -i/…) targeting policy.yml is exemptible for the
    // pipelines/ prefix rule above but must stay gated here (spec #537
    // Non-Goals; review finding — a shell rewrite of the enforcement file).
    if (fileTool && isPolicyFile(repoRoot, targetPath)) continue;
    // The commit exemption (#537): ONLY for a target this loop resolved from a
    // 'commit' action (never 'push' — see the field comment above), and only
    // when the allowlist-matched command's staged set is provably nothing but
    // policy.yml. `bashCommand` is the whole command string; `targetPath` here
    // is the command's working directory, not a file, so it plays no part in
    // this check beyond having produced `action === 'commit'`.
    if (action === 'commit' && isPolicyOnlyCommit(bashCommand, ctx.cwd)) continue;
    // The delete-only push exemption (#658): ONLY for a target this loop
    // resolved from a 'push' action, and only when the ENTIRE command
    // matches the allowlist grammar above.
    if (action === 'push' && isDeleteOnlyPush(bashCommand)) continue;

    // Breadcrumb for the residue sweep's judgment class (#185, Task 12) —
    // scoped to ctx.ownedRun, NEVER ctx.runDir: this gate fires before any
    // pipeline run necessarily exists for THIS session, so there is no
    // "run being enforced" the way E1's wd-deny below has. The only run this
    // may write to is the one the calling session itself owns (ctxLib.
    // resolveRun's session/env attribution) — writing to the unfiltered
    // newest-non-terminal ctx.runDir would risk stamping another session's
    // audit trail with this session's own denied write ([IL-96]). Ad-hoc work
    // with no owned run dir records nothing here — appendEvent's own
    // try/catch turns a null runDir (path.join throws) into a silent no-op,
    // which is exactly the documented, accepted gap: a failed breadcrumb is
    // strictly less bad than a failed tool call, and this hook must never
    // throw on a deny.
    const ownedRun = ctx.ownedRun || {};
    ctxLib.appendEvent(ownedRun.dir, 'gate-denial', { tool: toolName, path: targetPath }, ownedRun.attribution);

    const retryGuidance = action === 'push'
      ? `If you're trying to delete a branch whose worktree is already gone, there is nothing to ` +
        `"retry inside a worktree" — use \`gh api -X DELETE repos/{owner}/{repo}/git/refs/heads/{branch}\` ` +
        `or \`gh pr merge --delete-branch\` instead. Otherwise, set one up first: invoke ` +
        `/superpowers:using-git-worktrees, then follow \`_shared/worktree-setup.md\`'s post-creation ` +
        `catch-up before any other action, then retry this push inside the new worktree.`
      : `Set one up first: invoke /superpowers:using-git-worktrees, then follow ` +
        `\`_shared/worktree-setup.md\`'s post-creation catch-up before any other action, ` +
        `then retry this edit inside the new worktree.`;
    return denyResult(
      // Derived from GATE_COVERAGE rather than spelled out, so widening
      // the gate can never leave this message describing the old reach
      // — the failure this whole binding exists to prevent (#70, #138).
      `claude-tweaks: this project requires an isolated worktree for ` +
      `${GATE_COVERAGE.tools.join('/')}, git ${GATE_COVERAGE.gitActions.join('/')}, and Bash ` +
      `${GATE_COVERAGE.bashWriteShapes.join('/')} writes (not every possible Bash write shape — ` +
      `see _shared/policy-schema-coverage.md's worktree-always coverage block; exempt: ` +
      `${GATE_COVERAGE.exemptions.paths.join(', ')}, an allowlisted (${GATE_COVERAGE.exemptions.commit}) commit, ` +
      `and an allowlisted (${GATE_COVERAGE.exemptions.push}) push) ` +
      `(policy: worktree-always in .claude-tweaks/policy.yml). You're currently working in ` +
      `a non-isolated checkout (${repoRoot}). ${retryGuidance}`,
    );
  }
  return {};
}

function runInner(ctx, indeterminateTargets, teardownWarnings) {
  const teardown = checkTeardownGate(ctx, teardownWarnings);
  if (teardown.json) return teardown;

  const shadow = checkPipelineShadowGuard(ctx);
  if (shadow.json) return shadow;

  const command = ctx.input && ctx.input.tool_name === 'Bash' && ctx.input.tool_input
    && typeof ctx.input.tool_input.command === 'string' ? ctx.input.tool_input.command : null;
  // Shared by checkWorktreeRequired's Bash branch above and the E1 loop
  // below — parsing the same command/cwd through gitTargets twice per
  // invocation was pure repeated work.
  const commandGitTargets = command ? gitTargets(command, ctx.cwd) : null;

  const gate = checkWorktreeRequired(ctx, commandGitTargets, indeterminateTargets);
  if (gate.json) return gate;

  if (!ctx.runDir || !ctx.runState || !ctx.runState.worktree) return {};
  if (ctx.runState.status === 'clean') return {};
  if (ctx.input.tool_name !== 'Bash') return {};
  if (typeof command !== 'string' || !command) return {};
  const assigned = safeReal(ctx.runState.worktree);
  if (!assigned) return {};

  // Multi-run project: the fallback resolver in bin/hooks.js always picks the
  // newest non-terminal run, so a terminal committing in its OWN assigned
  // worktree can land here with ctx.runDir pointing at a DIFFERENT (newer)
  // run. Build the full set of live worktrees (this run's plus every other
  // non-terminal run's) so such a commit is allowed rather than false-denied.
  const otherWorktrees = new Map(); // realpath (excluding this run's own) -> run dir
  for (const { dir, state } of ctxLib.listRunDirsWithState(ctx.cwd)) {
    if (!state || !state.worktree) continue;
    const real = safeReal(state.worktree);
    if (!real || real === assigned) continue;
    if (!otherWorktrees.has(real)) otherWorktrees.set(real, dir);
  }

  // #861: this run's assigned worktree is a linked worktree of some main
  // checkout — mainCheckoutRoot(assigned) resolves it via the fs-only
  // gitdir-pointer check (no git spawn needed, since `assigned`'s own `.git`
  // is always the worktree-marker FILE). The loop below compares it against
  // each target's own main-checkout root; the guard used to skip that step,
  // and so denied a commit in an out-of-repo scratch fixture repo exactly as
  // it denied one in the wrong in-project checkout.
  const mainRoot = safeReal(wtDetect.mainCheckoutRoot(assigned));

  for (const target of commandGitTargets || []) {
    const top = toplevel(target.dir);
    if (!top) continue; // cannot prove the target -> allow
    const actual = safeReal(top);
    if (!actual) continue;
    if (actual === assigned) continue;
    if (otherWorktrees.has(actual)) {
      // Matches a DIFFERENT live run's worktree -> allow, but a commit isn't
      // provably in the run this hook resolved, so flag it for review.
      if (target.action !== 'push') {
        ctxLib.appendEvent(ctx.runDir, 'wd-ambiguous', { matched: actual });
      }
      continue;
    }
    if (mainRoot) {
      // actual's OWN main-checkout root: for a repo that is genuinely part of
      // this project (the main checkout itself, or another of its linked
      // worktrees), this resolves to the same mainRoot as `assigned`. For a
      // foreign repo (e.g. a scratch fixture repo elsewhere), it resolves to
      // that repo's own root instead — provably a different repository, so
      // this gate has nothing to enforce there. An unresolvable actualMainRoot
      // is unprovable, not a match, and also allows here (ambiguity -> allow).
      // Checked AFTER otherWorktrees so a genuinely sibling worktree (already
      // provably this project's own, via its live run-state record) is never
      // reclassified as foreign merely because its own mainCheckoutRoot lookup
      // is inconclusive.
      const actualMainRoot = safeReal(wtDetect.mainCheckoutRoot(actual));
      if (actualMainRoot !== mainRoot) continue;
    }
    if (target.action === 'push') {
      ctxLib.appendEvent(ctx.runDir, 'wd-push-mismatch', { expected: assigned, actual, command: command.slice(0, 200) });
      continue;
    }
    const owner = typeof ctx.runState.sessionId === 'string' ? ctx.runState.sessionId : '';
    const caller = typeof ctx.input.session_id === 'string' ? ctx.input.session_id : '';
    if (owner && caller && owner !== caller) {
      ctxLib.appendEvent(ctx.runDir, 'wd-foreign-session', { expected: assigned, actual, owner, caller, command: command.slice(0, 200) });
      return {
        exit: 0,
        json: {
          systemMessage:
            `claude-tweaks: pipeline run ${path.basename(ctx.runDir)} is active in worktree ${assigned}; ` +
            `allowing this commit because it comes from a different session. ` +
            `If this IS that pipeline's work, run it inside the worktree (git -C "${assigned}").`,
        },
      };
    }
    ctxLib.appendEvent(ctx.runDir, 'wd-deny', { expected: assigned, actual, session: caller || undefined, command: command.slice(0, 200) });
    const others = [...otherWorktrees.keys()];
    const othersNote = others.length ? ` Other active runs' worktrees: ${others.join(', ')}.` : '';
    return denyResult(
      `claude-tweaks working-directory discipline: this run's assigned worktree is ${assigned} but the commit targets ${actual}.` +
      othersNote +
      ` Re-run inside the worktree (cd "${assigned}") or use git -C "${assigned}". ` +
      `If this checkout is intentionally correct (e.g. finishing the branch), clear the assignment first: node "${pluginRoot()}/bin/hooks.js" close-run`,
    );
  }
  return {};
}

// Attaching the worktree-gate's indeterminate warning (and, since the
// IMPORTANT-3 fix below, any collected teardown foreign-owner warnings) is
// done HERE, once, on whatever runInner returned — not at runInner's own
// return sites. runInner has a dozen of them and grows more over time;
// enumerating them to add a message is the exact shape `[IL-14]` records (an
// enumeration silently misses a path, and no test notices because the
// omission is invisible). This wrapper states the unconditional rule instead:
// every outcome, deny or allow, carries every collected note.
function run(ctx) {
  const indeterminateTargets = [];
  const teardownWarnings = [];
  const out = runInner(ctx, indeterminateTargets, teardownWarnings) || {};

  const notes = [...teardownWarnings];
  if (indeterminateTargets.length) {
    // Deliberately says the check could not RUN, not that a policy was
    // skipped. Reaching here means findPolicyFile found a policy.yml
    // somewhere up the ancestor chain, which is not the same as
    // worktree-always being on for this repo — that check needs a repoRoot
    // we never obtained. Claiming "the gate was not applied" would assert a
    // policy applied that may not exist.
    notes.push(
      `claude-tweaks: could not determine the git repo status of `
      + `${indeterminateTargets.join(', ')} (git did not answer — timeout under load, refused fork, or missing git). `
      + `The worktree-always check could not run for ${indeterminateTargets.length > 1 ? 'these paths' : 'this path'}, so `
      + `${indeterminateTargets.length > 1 ? 'they were' : 'it was'} allowed rather than denied, per the never-break-a-session rule. `
      + `If this project requires an isolated worktree, verify manually.`,
    );
  }
  if (!notes.length) return out;

  const json = { ...(out.json || {}) };
  json.systemMessage = json.systemMessage ? [json.systemMessage, ...notes].join(' ') : notes.join(' ');
  // exit stays 0 on every path, deny included — the deny signal is the stdout
  // JSON's permissionDecision, never the exit code (see this file's header).
  return { ...out, exit: 0, json };
}

module.exports = {
  run,
  GATE_COVERAGE,
  PIPELINE_STATE_DIR,
  POLICY_FILE,
  isPipelineBookkeeping,
  isPolicyFile,
  isPolicyOnlyCommit,
  POLICY_COMMIT_ALLOWLIST,
  isDeleteOnlyPush,
  DELETE_ONLY_PUSH_ALLOWLIST,
  shadowPipelineRunDir,
  checkPipelineShadowGuard,
};
