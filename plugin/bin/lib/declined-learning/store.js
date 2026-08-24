// plugin/bin/lib/declined-learning/store.js
// One shared, project-local declined-learning store — see docs/skill-graph.md's `feedback` and
// `reflect`/`wrap-up` sections for the citing skills; this header states the degrade-open
// contract once, per CLAUDE.md's cross-reference rule.
//
// Records fingerprints of findings/insights a human explicitly declined, so a later run can
// annotate a re-surfaced match ("previously declined {date}: {reason}") instead of presenting
// it as a fresh proposal. One flat, non-per-consumer file (unlike
// bin/lib/transcript-judge/watermark.js's per-consumer subdirectories) because every entry
// already carries a `source` field distinguishing origin — nothing needs path-level isolation.
//
// Each entry may also carry a `subject` (#1033) — the human-legible text behind the fingerprint.
// Fingerprint-only matching cannot support this store's own consumers: an LLM judge dispatch has
// no way to compute a *candidate* finding's fingerprint to compare against a stored hash, and
// free-form insight prose rarely reproduces byte-identical across runs even when it means the
// same thing. `subject` is what lets a consumer (or the agent reading this store) judge
// equivalence directly instead of relying on exact-hash comparison alone — see lookupDecline
// (hash lookup, unchanged) vs listDeclined (subject scan, new) below.
//
// readStore degrades open: a missing or corrupt store file returns {}, never a throw — the same
// contract as watermark.js's readWatermark (both now go through ../json-store.js's shared
// read/write pair). writeStore (and therefore recordDecline/clearDecline, which read-modify-write
// through it) lets a real write failure propagate; the caller decides how to degrade. Every fs
// call is an injectable default param so tests never touch real disk.
//
// recordDecline/clearDecline hold ../file-lock.js's mkdir-based mutex around their
// read-modify-write, the same mechanism bin/lib/hooks/context.js's writeRunState uses for
// run-state.json — without it, two sessions declining different fingerprints near-simultaneously
// could each read the same pre-write store and the second write would silently drop the first's
// entry (review finding). Best-effort/fail-open, same posture as writeRunState: a write that
// can't acquire the lock in time still proceeds unlocked rather than hang the caller.
'use strict';

const fs = require('fs');
const path = require('path');
const { readJsonFile, writeJsonFile } = require('../json-store');
const { withLock } = require('../file-lock');

const STORE_PATH = path.join('.claude-tweaks', 'declined-learning', 'store.json');
const LOCK_PATH = path.join('.claude-tweaks', 'declined-learning', '.store.lock');

// Pure — the store has exactly one on-disk location; no per-transcript/per-consumer derivation.
function storePath() {
  return STORE_PATH;
}

// Returns the parsed store object, or {} when none exists (ENOENT), the file is present but not
// valid JSON, or the parsed value isn't a plain object (corrupt/foreign content == empty store,
// degrade-open contract).
function readStore({ readFile = fs.readFileSync } = {}) {
  const parsed = readJsonFile(storePath(), { readFile, fallback: {} });
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}

// Overwrites the whole store with `data`. Creates the containing directory if needed. Throws on
// a real failure (permissions, disk full, etc.) — this module doesn't silently eat the error.
function writeStore(data, { mkdirSync = fs.mkdirSync, writeFile = fs.writeFileSync, rename = fs.renameSync } = {}) {
  writeJsonFile(storePath(), data, { mkdirSync, writeFile, rename });
}

// Records (or overwrites) a decline entry for `fingerprint`. Read-modify-write through
// readStore/writeStore under the store's lock, so it inherits both their degrade-open (read) and
// propagate (write) behavior, plus protection from a concurrent recordDecline/clearDecline
// clobbering it mid-write. Returns the entry that was written.
//
// `subject` (#1033, rationale in this file's header) is the human-legible text a consumer already
// has on hand when it declines something — the draft's `fingerprintBasis.summary` for feedback,
// the insight's own description text for reflect. Optional and omitted from the written entry when
// not passed, so an entry recorded before this field existed round-trips unchanged (no forced
// `subject: null`) and every existing caller that doesn't pass one keeps writing the same
// three-key shape as before.
function recordDecline(fingerprint, {
  reason = null, source, subject, declinedAt = new Date().toISOString(),
} = {}, deps = {}) {
  return withLock(LOCK_PATH, () => {
    const current = readStore(deps);
    const entry = { declinedAt, reason, source };
    if (subject !== undefined) entry.subject = subject;
    current[fingerprint] = entry;
    writeStore(current, deps);
    return entry;
  });
}

// The annotation-lookup function: returns the stored { declinedAt, reason, source, subject? }
// entry for `fingerprint`, or null when no decline is on record. Never throws — readStore already
// degrades open. Exact-hash lookup only — a byte-identical (or near-identical, per the caller's
// own normalization) re-fingerprint. See listDeclined below for the subject-scan alternative this
// can't cover.
function lookupDecline(fingerprint, deps = {}) {
  const current = readStore(deps);
  return Object.prototype.hasOwnProperty.call(current, fingerprint) ? current[fingerprint] : null;
}

// All declined fingerprints (opaque hashes only, no subject text), optionally filtered to one
// `source`. Superseded as feedback's own watermark-payload source by listDeclined below (#1033:
// session-evaluation.md now reads dismissedSubjects, not a bare fingerprint list) — kept as a
// lighter-weight primitive for a caller that genuinely only needs the hash keys.
function listDeclinedFingerprints({ source } = {}, deps = {}) {
  const current = readStore(deps);
  const keys = Object.keys(current);
  return source ? keys.filter((k) => current[k] && current[k].source === source) : keys;
}

// Full entries (fingerprint + declinedAt/reason/source/subject), optionally filtered to one
// `source` — the subject-scan counterpart to listDeclinedFingerprints above. Where that function
// hands a consumer only opaque hashes, this one hands back the human-legible `subject` text
// alongside each fingerprint, so a consumer can render or compare declined subjects directly
// instead of being limited to exact-hash matching (header). An entry recorded before `subject`
// existed simply has no `subject` key on its returned object — callers that render subjects
// handle that omission themselves (e.g. falling back to the fingerprint).
function listDeclined({ source } = {}, deps = {}) {
  const current = readStore(deps);
  return Object.keys(current)
    .filter((fp) => !source || (current[fp] && current[fp].source === source))
    .map((fp) => ({ fingerprint: fp, ...current[fp] }));
}

// Removes a decline entry — "approving it anyway clears the entry" (a human re-affirms a
// previously-declined finding/insight, so it should surface as fresh next time rather than
// staying annotated forever). No-op (no write) when the fingerprint has no entry, so an
// idempotent clear never touches disk twice. Returns whether an entry was actually removed.
function clearDecline(fingerprint, deps = {}) {
  return withLock(LOCK_PATH, () => {
    const current = readStore(deps);
    if (!Object.prototype.hasOwnProperty.call(current, fingerprint)) return false;
    delete current[fingerprint];
    writeStore(current, deps);
    return true;
  });
}

module.exports = {
  storePath,
  readStore,
  writeStore,
  recordDecline,
  lookupDecline,
  listDeclinedFingerprints,
  listDeclined,
  clearDecline,
};
