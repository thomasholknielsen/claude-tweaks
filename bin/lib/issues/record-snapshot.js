// bin/lib/issues/record-snapshot.js
// Pure filesystem helpers for the session-scoped record snapshot (#645) — the
// code twin of skills/_shared/record-queue-fetch.md's "Session-scoped record
// snapshot" section. One `gh issue list --state all` pull per session, shared
// by every consumer (backlog, capture, specify, trust-table, help, tidy,
// visualize) instead of each one paying for its own round-trip. No network —
// callers still shell out to `gh`/the MCP tools; this module only decides
// where the snapshot lives, whether it's still fresh, and how to invalidate it.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

// The union field set every consumer needs, so one fetch covers all of them —
// see record-queue-fetch.md's Deliverables for the field list this mirrors.
const UNION_FIELDS = 'number,title,labels,body,state,stateReason,closedAt,comments,updatedAt,milestone';

// A session id is required for the snapshot to mean anything — without one,
// concurrent unrelated sessions would silently share (and race on) the same
// file. Callers pass process.env.CLAUDE_CODE_SESSION_ID; an absent/falsy id
// resolves to a per-call sentinel path that can never be fresh across calls,
// which degrades correctly to "always re-fetch" rather than false-sharing a
// snapshot between unrelated sessions.
function resolveSessionId(sessionId) {
  return sessionId && String(sessionId).trim() ? String(sessionId).trim() : null;
}

function snapshotPath(sessionId) {
  const id = resolveSessionId(sessionId);
  if (!id) return null;
  return path.join(os.tmpdir(), `ct-records-${id}.json`);
}

function gitLogPath(sessionId) {
  const id = resolveSessionId(sessionId);
  if (!id) return null;
  return path.join(os.tmpdir(), `ct-gitlog-${id}.txt`);
}

// Fresh iff the file exists and its mtime is younger than ttlSeconds. Any stat
// failure (missing, unreadable) reads as not-fresh — the caller's job is then
// to fetch and write a new one, never to error out over a cache miss.
function isFresh(filePath, ttlSeconds, now = Date.now()) {
  if (!filePath) return false;
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return false;
  }
  const ageMs = now - stat.mtimeMs;
  return ageMs < Number(ttlSeconds) * 1000;
}

function readSnapshot(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeSnapshot(filePath, records) {
  fs.writeFileSync(filePath, JSON.stringify(records));
}

// Deletes both the record snapshot and its companion git-log dump for a
// session, tolerating either already being absent. Called after any
// `gh issue create`/`edit`/`close` (or the MCP equivalent) — see
// _shared/github-write-transport.md's note on the CRUD mapping table.
function invalidateSnapshot(sessionId) {
  for (const p of [snapshotPath(sessionId), gitLogPath(sessionId)]) {
    if (!p) continue;
    try {
      fs.unlinkSync(p);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }
}

module.exports = {
  UNION_FIELDS,
  snapshotPath,
  gitLogPath,
  isFresh,
  readSnapshot,
  writeSnapshot,
  invalidateSnapshot,
};
