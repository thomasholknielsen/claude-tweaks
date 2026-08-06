'use strict';

// The recorded answer to "which versions reached main's tip".
//
// `changelog-git.js` reconstructs this from `git rev-list --first-parent`, and
// that reconstruction is not merely lossy — it is unstable. When a branch merges
// main INTO itself and then becomes main's tip, everything main carried since
// the fork point moves to the merge's second parent, where the walk never looks.
// Versions therefore LEAVE the reconstructed set as later merges land, and the
// same repository answers differently depending on which merge happened last.
// That is this repo's normal working mode, not an exotic case (`[IL-12]`).
//
// The failure is asymmetric, which is why it needed fixing rather than tolerating:
// a false "shipped" costs one unnecessary changelog entry, while a false "never
// shipped" reads as licence to delete a real release's write-up — and did, twice,
// before anyone checked the claim against a source outside this repo's topology.
//
// So this file records rather than infers. It is appended in the same commit as
// the version bump, exactly like the CHANGELOG entry, and the coverage suite
// fails when the manifest's version is absent from it.

const fs = require('node:fs');
const path = require('node:path');

// Slash-separated on every platform: this is also the path handed to `git show`
// and printed in assertion messages, and git speaks POSIX paths regardless of
// host. Filesystem access splits it back apart below rather than using it raw.
const RECORD_PATH = 'docs/shipped-versions.tsv';

function recordPath(repoRoot) {
  return path.join(repoRoot, ...RECORD_PATH.split('/'));
}

// Parse rows, ignoring comments and blank lines. A malformed line is reported
// rather than skipped — silently dropping one would understate what shipped,
// which is the exact failure direction this file exists to remove.
function readShippedRecord(repoRoot) {
  const file = recordPath(repoRoot);
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return { ok: false, reason: `${RECORD_PATH} not found`, rows: [], malformed: [] };
  }
  const rows = [];
  const malformed = [];
  text.split('\n').forEach((line, i) => {
    if (!line.trim() || line.startsWith('#')) return;
    const [version, date, source] = line.split('\t');
    if (!version || !date) {
      malformed.push({ line: i + 1, text: line });
      return;
    }
    rows.push({ version: version.trim(), date: date.trim(), source: (source || '').trim() });
  });
  return { ok: true, rows, malformed };
}

function recordedVersions(repoRoot) {
  return [...new Set(readShippedRecord(repoRoot).rows.map((r) => r.version))];
}

// Append one version. Idempotent: re-recording a version already present is a
// no-op rather than a duplicate row, so a hook and a human can both call it.
function appendShippedVersion(repoRoot, version, date, source = 'release') {
  if (!version || !date) throw new Error('appendShippedVersion requires both a version and a date');
  const record = readShippedRecord(repoRoot);
  if (!record.ok) throw new Error(record.reason);
  if (record.rows.some((r) => r.version === version)) return false;
  const file = recordPath(repoRoot);
  const existing = fs.readFileSync(file, 'utf8');
  const sep = existing.endsWith('\n') ? '' : '\n';
  fs.appendFileSync(file, `${sep}${version}\t${date}\t${source}\n`);
  return true;
}

module.exports = { RECORD_PATH, recordPath, readShippedRecord, recordedVersions, appendShippedVersion };
