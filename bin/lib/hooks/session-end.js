// bin/lib/hooks/session-end.js — A2: mark the active run interrupted at session end.
'use strict';
const ctxLib = require('./context');

function run(ctx) {
  if (!ctx.runDir) return {};
  const status = ctx.runState && ctx.runState.status;
  if (status !== 'clean') {
    ctxLib.writeRunState(ctx.runDir, { status: 'interrupted', lastEvent: 'session-end' });
  }
  ctxLib.appendEvent(ctx.runDir, 'session-end', { reason: ctx.input.reason, sessionId: ctx.input.session_id });
  return {};
}

module.exports = { run };
