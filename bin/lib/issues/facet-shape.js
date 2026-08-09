// bin/lib/issues/facet-shape.js
// Single source of truth for the facet-default shape shared by both work-record
// drivers: record.js's parseRecordFacets (GitHub, derived from labels) and
// local-store.js's defaultFacets (local-files, derived from frontmatter). Each
// driver adds its own extra keys on top of sharedFacetDefaults() — parent/
// familyParent/blockedBy/type/unsynced/closed/closedAt are local-files-only and
// have no analog in the label-derived shape, so they stay declared in
// local-store.js. Add a new shared facet key here, not independently in either
// driver.
'use strict';

// Returns a fresh object every call — grants/bot are nested objects, and two
// independent callers must never end up sharing (and mutating) the same one.
function sharedFacetDefaults() {
  return {
    origin: null,
    risk: null,
    size: null,
    ceremony: null,
    framing: false,
    priority: null,
    stage: 'backlog',
    grants: { build: false, merge: false },
    bot: { inProgress: false, blocked: false },
    acceptance: null,
  };
}

module.exports = { sharedFacetDefaults };
