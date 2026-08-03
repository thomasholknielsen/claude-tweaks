// bin/lib/record-graph/columns.js
// Pure: partitions faceted records into the three Stage-axis buckets
// (_shared/work-record.md's Stage axis is exactly backlog | parked | ready —
// Authorization and Bot state are separate axes rendered as badges, not columns).
'use strict';

function bucketByStage(records) {
  const columns = { backlog: [], parked: [], ready: [] };
  for (const record of records) {
    columns[record.facets.stage].push(record);
  }
  return columns;
}

module.exports = { bucketByStage };
