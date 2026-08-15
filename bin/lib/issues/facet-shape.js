// bin/lib/issues/facet-shape.js
// Single source of truth for the facet-default shape shared by both work-record
// drivers: record.js's parseRecordFacets (GitHub, derived from labels) and
// local-store.js's defaultFacets (local-files, derived from frontmatter). Each
// driver adds its own extra keys on top of sharedFacetDefaults() — parent/
// blockedBy/type/unsynced/closed/closedAt are local-files-only and have no
// analog in the label-derived shape, so they stay declared in local-store.js.
// Add a new shared facet key here, not independently in either driver.
//
// isParentIssue is shared: the GitHub driver derives it from the parent-issue
// label, the local driver from the is-parent-issue: frontmatter line — each
// with a permanent pre-rename legacy fallback (the [IL-85] branches in
// record.js and local-store.js).
//
// needsDefinition is deliberately NOT declared here, unlike every other shared
// boolean facet: it is presence-only (set true on the needs:definition label/
// needs-definition: frontmatter line, left absent otherwise — never explicit
// false) on both drivers. Adding `needsDefinition: false` here would silently
// break that convention for every record that doesn't carry the flag — see
// record.js's parseRecordFacets and local-store.js's parseFrontmatterLines,
// which both apply this shape by hand instead.
'use strict';

// Returns a fresh object every call — grants/bot are nested objects, and two
// independent callers must never end up sharing (and mutating) the same one.
function sharedFacetDefaults() {
  return {
    origin: null,
    risk: null,
    size: null,
    ceremony: null,
    solutionUnjustified: false,
    priority: null,
    stage: 'backlog',
    grants: { build: false, merge: false },
    bot: { inProgress: false, blocked: false },
    acceptance: null,
    isParentIssue: false,
  };
}

module.exports = { sharedFacetDefaults };
