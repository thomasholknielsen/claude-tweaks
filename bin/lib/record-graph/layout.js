// bin/lib/record-graph/layout.js
// Pure: orchestrates columns.js + encode.js + edges.js into the one shared
// intermediate representation both render-d2.js and render-svg.js consume.
// Neither renderer touches a raw record or facets object directly.
'use strict';

const { bucketByStage, filterKnownStage } = require('./columns');
const { encodeRecord } = require('./encode');
const { computeEdges } = require('./edges');

function buildGraph(records, { workLinks, truncated = false }) {
  // Filter once, up front: a record with an unrecognized facets.stage must never
  // reach encode/edges either, not just be absent from columns — otherwise a
  // Blocked-by edge referencing it would resolve to a node with no computed
  // position, and both renderers would crash on an undefined lookup.
  const known = filterKnownStage(records);
  const columns = bucketByStage(known);
  const encoded = new Map(known.map((record) => [record.number, encodeRecord(record)]));
  const { edges, edgesOmitted } = computeEdges(known, { workLinks });
  return {
    columns, encoded, edges, edgesOmitted, truncated, recordCount: known.length,
  };
}

module.exports = { buildGraph };
