// bin/lib/record-graph/layout.js
// Pure: orchestrates columns.js + encode.js + edges.js into the one shared
// intermediate representation both render-d2.js and render-svg.js consume.
// Neither renderer touches a raw record or facets object directly.
'use strict';

const { bucketByStage } = require('./columns');
const { encodeRecord } = require('./encode');
const { computeEdges } = require('./edges');

function buildGraph(records, { workLinks, truncated = false }) {
  const columns = bucketByStage(records);
  const encoded = new Map(records.map((record) => [record.number, encodeRecord(record)]));
  const { edges, edgesOmitted } = computeEdges(records, { workLinks });
  return {
    columns, encoded, edges, edgesOmitted, truncated, recordCount: records.length,
  };
}

module.exports = { buildGraph };
