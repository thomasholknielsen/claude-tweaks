// bin/lib/hooks/session-end.js — A2: mark the active run interrupted at session end.
'use strict';
const ctxLib = require('./context');

function run(ctx) {
  // Scoped to a run this session may write to, NOT ctx.runDir (#62). When every
  // non-terminal run belongs to another session there is nothing here to record.
  const owned = ctx.ownedRun || {};
  if (!owned.dir) return {};
  const status = ctxLib.readRunState(owned.dir)?.status;
  // Only stamp `interrupted` on a run this session is known to own.
  //
  // Under a `fallback` attribution the run is a guess, and stamping it is the
  // move that leaves a finished run flagged forever: an unrelated session ends,
  // resolves the newest non-terminal run dir, and writes `interrupted` onto a
  // run whose issue was closed hours earlier. Because that stamp is itself what
  // keeps the run non-terminal, it also keeps the run winning the same fallback
  // for every session that follows — the state is self-perpetuating, which is
  // why the reported runs were still flagged days later.
  //
  // The cost of not stamping is one missing warning about a genuinely
  // interrupted run whose ownership was never recorded. The cost of stamping
  // wrongly is a permanent false one that finishing the work does not clear.
  if (status !== 'clean' && owned.attribution !== 'fallback') {
    ctxLib.writeRunState(owned.dir, { status: 'interrupted', lastEvent: 'session-end' });
  }
  ctxLib.appendEvent(
    owned.dir,
    'session-end',
    { reason: ctx.input.reason, sessionId: ctx.input.session_id },
    owned.attribution,
  );
  return {};
}

module.exports = { run };
