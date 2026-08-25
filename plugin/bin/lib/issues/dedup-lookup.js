// bin/lib/issues/dedup-lookup.js
// Pure: find an issue by a body marker across a plain (non-`--search`) `gh issue
// list` result, and surface any duplicates for self-healing cleanup. Exists
// because `gh issue list --search` hits GitHub's eventually-consistent Search
// API — the wrong tool for an existence/dedup check. specify/record-creation.md
// already documents and avoids this exact anti-pattern via its own
// extractFingerprint-based idempotency map; this module generalizes that same
// idiom (plain list + explicit --limit + in-process marker match) for callers
// that don't need the full work-record fingerprint scheme, just "does an issue
// with this marker already exist, and if more than one does, which is
// canonical." No network — the caller fetches `gh issue list ... --limit N`
// output into a file first; this module only reads the parsed array. `N`
// is the caller's own call to size correctly (`_shared/github-write-transport.md`'s
// "Sizing the list-then-filter window") — a label-scoped list can stay small,
// an unscoped `--state all` list must cover the repo's whole issue history or
// risk truncating away an older duplicate (#1094).
'use strict';

function bodyMatches(body, markerPattern) {
  if (typeof body !== 'string' || !body) return false;
  if (markerPattern instanceof RegExp) return markerPattern.test(body);
  return body.includes(markerPattern);
}

// issues: [{ number, body, createdAt, ...anything else — ignored }]
// markerPattern: string (exact substring match against body) or RegExp
// -> { canonical, duplicates } | null
// canonical is the newest match (by createdAt; ties broken by highest number).
// duplicates is every other match, oldest-first — ready to hand a caller that
// wants to close everything except canonical.
function findByMarker(issues, markerPattern) {
  const matches = (Array.isArray(issues) ? issues : [])
    .filter((issue) => issue && bodyMatches(issue.body, markerPattern));

  if (matches.length === 0) return null;

  const sorted = [...matches].sort((a, b) => {
    const aTime = Date.parse(a && a.createdAt) || 0;
    const bTime = Date.parse(b && b.createdAt) || 0;
    if (aTime !== bTime) return bTime - aTime; // newest first
    return (b.number || 0) - (a.number || 0); // tie-break: highest number first
  });

  const [canonical, ...rest] = sorted;
  return { canonical, duplicates: rest.reverse() }; // oldest-first
}

module.exports = { findByMarker };
