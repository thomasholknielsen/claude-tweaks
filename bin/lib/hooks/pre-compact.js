// bin/lib/hooks/pre-compact.js — A3: breadcrumb so compaction cannot lose the run.
'use strict';
const ctxLib = require('./context');

function run(ctx) {
  if (!ctx.runDir) return {};
  ctxLib.appendEvent(ctx.runDir, 'pre-compact', { trigger: ctx.input.trigger, sessionId: ctx.input.session_id });
  ctxLib.writeRunState(ctx.runDir, { lastEvent: 'pre-compact' });
  return {};
}

module.exports = { run };
