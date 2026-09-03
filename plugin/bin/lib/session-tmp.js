// bin/lib/session-tmp.js
// Session-scoped temp-root convention (#266) — a single canonical root
// directory every skill's own non-snapshot temp state (composed bodies,
// payload files, queue-pull results) lands under, keyed by
// CLAUDE_CODE_SESSION_ID, so two concurrent sessions of the same skill never
// collide on a shared /tmp/{skill}-{thing} filename. Reuses the same
// session-identifying value bin/lib/issues/record-snapshot.js already
// established as reachable from skill-snippet execution (#645) — this is the
// general-purpose sibling of that file's single-purpose snapshot path. No
// network, no gh/MCP calls — pure filesystem helpers only.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
// Imported, not copy-pasted — the two files must never silently drift on what
// counts as a valid session id (both fs/path/os-only, no network pulled in).
const { resolveSessionId } = require('./issues/record-snapshot');

// sessionId -> this session's temp root directory, or null when no session
// id is available. Mirrors record-snapshot.js's snapshotPath degrade rule:
// callers fall through to an unscoped path rather than erroring.
function sessionTmpRoot(sessionId) {
  const id = resolveSessionId(sessionId);
  if (!id) return null;
  return path.join(os.tmpdir(), `ct-session-${id}`);
}

// sessionId, filename -> the full path for one purpose-suffixed file under
// this session's root (creating the root directory if needed), or null when
// no session id is available. `filename` keeps the exact basename each
// skill already uses today (e.g. 'specify-parent-body.md') -- the root
// directory is what changes, not each call site's own per-purpose naming.
// Never throws on a pre-existing root (mkdir recursive is idempotent).
function sessionTmpPath(sessionId, filename) {
  const root = sessionTmpRoot(sessionId);
  if (!root) return null;
  fs.mkdirSync(root, { recursive: true });
  return path.join(root, filename);
}

module.exports = { resolveSessionId, sessionTmpRoot, sessionTmpPath };
