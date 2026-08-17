// bin/lib/model-profiles/session-failures.js
//
// Pure(ish) filesystem helpers for the session-scoped model-failure
// blacklist (#763) — the code twin of
// skills/_shared/subagent-output-contract.md's Model Selection section's
// "record-failure" note. Mirrors bin/lib/issues/record-snapshot.js's
// session-file convention exactly: one file per session under os.tmpdir(),
// keyed by CLAUDE_CODE_SESSION_ID. No network; resolve-profile.js owns
// when this is read/written, same division of labor as record-snapshot.js
// and its `gh`-calling consumers.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

// A session id is required for the blacklist to mean anything — without
// one, concurrent unrelated invocations (no session context at all, e.g. a
// bare `node bin/resolve-profile.js standard` outside any Claude Code
// session) would silently share (and race on) the same file. An
// absent/blank id resolves to null, which every function below treats as
// "nothing recorded, nothing to record" rather than an error.
function resolveSessionId(sessionId) {
  return sessionId && String(sessionId).trim() ? String(sessionId).trim() : null;
}

function failurePath(sessionId) {
  const id = resolveSessionId(sessionId);
  if (!id) return null;
  return path.join(os.tmpdir(), `ct-model-failures-${id}.json`);
}

// -> Set<string> of model names that have failed with a credit/usage
// exhaustion error this session. Any read failure (missing file, malformed
// JSON) degrades to an empty set — a corrupt or absent blacklist must
// never block a resolution, only fail to protect one.
function readFailedModels(sessionId) {
  const p = failurePath(sessionId);
  if (!p) return new Set();
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    return new Set(Array.isArray(data) ? data : []);
  } catch {
    return new Set();
  }
}

// Appends `model` to the session's failure set (idempotent — recording the
// same model twice does not duplicate it). A no-op when no session id is
// available: there is nowhere safe to write a shared file, and the CLI
// layer (Task 3) is what decides whether that no-op should be reported to
// the caller as a failure.
function recordFailure(sessionId, model) {
  const p = failurePath(sessionId);
  if (!p) return;
  const current = readFailedModels(sessionId);
  current.add(model);
  fs.writeFileSync(p, JSON.stringify([...current]));
}

module.exports = { failurePath, readFailedModels, recordFailure };
