// bin/lib/record-graph/columns.js
// Pure: partitions faceted records into the three Stage-axis buckets
// (_shared/work-record.md's Stage axis is exactly backlog | parked | ready —
// Authorization and Bot state are separate axes rendered as badges, not columns).
'use strict';

const { COLUMN_ORDER } = require('./palette');

const KNOWN_STAGES = new Set(COLUMN_ORDER);

// Bucket keys are derived from palette.js's COLUMN_ORDER rather than hardcoded here,
// so the column set can never drift from the one both renderers lay out.
function bucketByStage(records) {
  const columns = Object.fromEntries(COLUMN_ORDER.map((key) => [key, []]));
  for (const record of records) {
    // A record whose facets.stage isn't a recognized column key is omitted rather
    // than throwing — malformed input degrades to a missing node, not a crashed render.
    if (KNOWN_STAGES.has(record.facets.stage)) columns[record.facets.stage].push(record);
  }
  return columns;
}

module.exports = { bucketByStage };
