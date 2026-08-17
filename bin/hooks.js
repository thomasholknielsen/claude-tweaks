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

const EVENTS = ['session-start', 'session-end', 'pre-compact', 'pre-tool-use', 'post-tool-use', 'subagent-stop'];

function loadModule(event) {
  try { return require('./lib/hooks/' + event); } catch { return null; }
}

// Resolves an explicit `--run <path>` argument, validating it's a real
// directory, or falls back to ctxLib.resolveRunDir when --run is absent.
// Shared by record-worktree and close-run below so a future change to what
// counts as a valid --run path (e.g. also rejecting a directory that exists
// but isn't a real run dir, or resolving symlinks first) only needs to land
// once. `args` is the command's own argument list (cmd already stripped);
// when --run is found, its two-element span is spliced out of the returned
// `rest` so a caller with its own positional args (record-worktree's
// worktree path) can still find them regardless of flag placement.
function resolveRunArg(args, cwd, env) {
  const flagIdx = args.indexOf('--run');
  if (flagIdx === -1) {
    return { runDir: ctxLib.resolveRunDir(cwd, env), invalidRunArg: null, rest: args, explicit: false };
  }
  const rest = args.slice();
  const candidate = rest[flagIdx + 1] || null;
  rest.splice(flagIdx, 2);
  // An explicit --run must resolve to a real directory — falling back to
  // resolveRunDir's "newest non-terminal run" scan on a bad path would
  // silently record against the WRONG run, defeating the reason --run
  // exists at all.
  const isRealDir = candidate ? (() => { try { return fs.statSync(candidate).isDirectory(); } catch { return false; } })() : false;
  if (isRealDir) {
    return { runDir: candidate, invalidRunArg: null, rest, explicit: true };
  }
  return { runDir: null, invalidRunArg: candidate || '(missing value)', rest, explicit: true };
}

async function main(argv) {
  const cmd = argv[2];
  if (cmd === 'record-worktree') {
    // --run <path> pins the target run dir explicitly, mirroring close-run
    // below — without it, this always fell through to resolveRunDir's
    // "newest non-terminal run" fallback, which a stale never-closed run
    // could win over the run genuinely making this call.
    const { runDir, invalidRunArg, rest } = resolveRunArg(argv.slice(3), process.cwd(), process.env);
    const worktreeArg = rest[0];
    if (invalidRunArg) {
      process.stdout.write(`claude-tweaks: --run path not found: ${invalidRunArg} — worktree not recorded\n`);
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
    } else if (!runDir) {
      process.stdout.write('claude-tweaks: no pipeline run dir found — worktree not recorded\n');
    } else {
      // runDir resolved but worktreeArg is falsy — the only remaining case
      // in this chain. Without this branch, a call that omits the worktree
      // positional (e.g. "record-worktree --run <dir>" with nothing after)
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
    function flagVal(name) {
      const i = args.indexOf(name);
      return i === -1 ? null : args[i + 1];
    }
    let result;
    try {
      result = require('./lib/hooks/run-dir-resolve').resolve({
        cwd: process.cwd(),
        env: process.env,
        specSlug: flagVal('--spec-slug'),
        mode: flagVal('--mode'),
        standalone: flagVal('--standalone'),
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
  if (cmd === 'record-pr') {
    // Mirrors record-worktree's shape: --run <path> pins the target run dir
    // explicitly (falls back to resolveRunDir's newest-non-terminal-run scan
    // when absent), positional args after it are the PR number and URL.
    // run-state.json is written only through hooks.js verbs (CLAUDE.md's
    // write-ownership rule) — this is the sanctioned verb for the pr-early
    // run lifecycle's { number, url } field (#409).
    const { runDir, invalidRunArg, rest } = resolveRunArg(argv.slice(3), process.cwd(), process.env);
    const numberArg = rest[0];
    const urlArg = rest[1];
    const number = Number(numberArg);
    if (invalidRunArg) {
      process.stdout.write(`claude-tweaks: --run path not found: ${invalidRunArg} — PR not recorded\n`);
    } else if (!runDir) {
      process.stdout.write('claude-tweaks: no pipeline run dir found — PR not recorded\n');
    } else if (!numberArg || !Number.isInteger(number) || number <= 0 || !urlArg) {
      process.stdout.write(`claude-tweaks: usage: record-pr [--run <dir>] <number> <url> — PR not recorded\n`);
    } else {
      const result = ctxLib.writeRunState(runDir, { pr: { number, url: urlArg } });
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
    const { runDir, invalidRunArg, rest } = resolveRunArg(argv.slice(3), process.cwd(), process.env);
    function flagVal(name) {
      const idx = rest.indexOf(name);
      return idx === -1 ? null : rest[idx + 1];
    }
    const specArg = flagVal('--spec');
    const statusArg = flagVal('--status');
    const phaseArg = flagVal('--phase');
    const nowArg = flagVal('--now'); // test-only clock override; real callers omit it
    if (invalidRunArg) {
      process.stdout.write(`claude-tweaks: --run path not found: ${invalidRunArg} — spec status not recorded\n`);
    } else if (!runDir) {
      process.stdout.write('claude-tweaks: no pipeline run dir found — spec status not recorded\n');
    } else if (!specArg || !statusArg || !phaseArg) {
      process.stdout.write('claude-tweaks: usage: spec-status --run <parent-dir> --spec <n> --status <pending|running|complete|failed|not-run> --phase <phase> — spec status not recorded\n');
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
    const { runDir, invalidRunArg, explicit } = resolveRunArg(argv.slice(3), process.cwd(), process.env);
    if (invalidRunArg) {
      process.stdout.write(`claude-tweaks: --run path not found: ${invalidRunArg} — run not closed\n`);
    } else if (runDir) {
      const prev = ctxLib.readRunState(runDir);
      const me = process.env.CLAUDE_CODE_SESSION_ID;
      const foreignOwner = !!(prev && typeof prev.sessionId === 'string' && prev.sessionId && me && prev.sessionId !== me);
      if (foreignOwner && !explicit) {
        // The implicit fallback ("newest non-terminal run") landed on a run
        // recorded by a DIFFERENT, still-active session — closing it here
        // would silently disarm that session's E1/E2/E3 enforcement with no
        // way for it to know (see CLAUDE.md's Hooks section). Refuse rather
        // than act; pass an explicit --run if closing someone else's run is
        // genuinely intended.
        process.stdout.write(`claude-tweaks: run ${path.basename(runDir)} was recorded by another session — refusing to close it without an explicit --run\n`);
        return 0;
      }
      if (foreignOwner) {
        process.stdout.write(`claude-tweaks: closing run ${path.basename(runDir)} recorded by another session\n`);
      }
      // Warn-tier check (#373): closing a run whose ledger never recorded a wrap-up
      // invocation. Warn, never block — dispatch's close-before-merge is sanctioned,
      // and a human-typed /claude-tweaks:wrap-up leaves no event at all (measured,
      // #371 finding (e)), so absence is not proof the procedure was skipped.
      let wrapupSeen = false;
      try {
        const rawEvents = fs.readFileSync(path.join(runDir, 'events.jsonl'), 'utf8');
        for (const line of rawEvents.split('\n')) {
          if (!line.trim()) continue;
          try {
            const ev = JSON.parse(line);
            if (ev && ev.type === 'skill_invoked' && ev.skill === 'claude-tweaks:wrap-up') { wrapupSeen = true; break; }
          } catch { /* skip garbage line */ }
        }
      } catch { /* no events.jsonl — treated the same as no wrap-up event */ }
      if (!wrapupSeen) {
        ctxLib.appendEvent(runDir, 'close-without-wrapup', {});
        process.stdout.write(
          `claude-tweaks: closing run ${path.basename(runDir)} with no recorded wrap-up invocation — ` +
          'expected if wrap-up was run manually (typed slash commands leave no ledger event); ' +
          'otherwise consider /claude-tweaks:wrap-up before closing. Event recorded: close-without-wrapup.\n',
        );
      }
      const result = ctxLib.writeRunState(runDir, { status: 'clean', worktree: null });
      if (!result) {
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
  if (cmd === 'check-resume-freshness') {
    // Read-only: never writes run-state.json. Skills call this immediately
    // before any of the three resume paths' safe-to-resume ruling
    // (skills/_shared/run-resume-freshness.md).
    const { runDir, invalidRunArg } = resolveRunArg(argv.slice(3), process.cwd(), process.env);
    if (invalidRunArg) {
      process.stdout.write(`claude-tweaks: --run path not found: ${invalidRunArg} — resume freshness not checked\n`);
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
    let out;
    try {
      out = await require('./lib/reconcile').reconcile(opts);
    } catch {
      out = { mirror: null, worktrees: null, claims: null, runs: null, branches: null, remoteBranches: null, console: null, skipped: [{ check: 'all', reason: 'reconcile-threw' }] };
    }
    process.stdout.write(JSON.stringify(out) + '\n');
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

module.exports = { main };
