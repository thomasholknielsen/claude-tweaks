// bin/lib/record-graph/edges.js
// Pure: Blocked-by edges for the open record set only. Only populated under
// work-links: body-text (the body field is already in record-queue-fetch.md's
// one fetch pull) — under work-links: native, resolving edges needs a second
// query, out of the issue's explicit "one gh issue list pull" scope, so this
// returns edgesOmitted: true instead (SKILL.md/record-graph.md render a
// visible on-diagram note for that case). A dependency on a number outside the
// open record set (e.g. an already-closed blocker) is dropped rather than
// drawn to a node that doesn't exist in the diagram.
'use strict';

const { parseDependencies } = require('../issues/record');

function computeEdges(records, { workLinks }) {
  if (workLinks !== 'body-text') {
    return { edges: [], edgesOmitted: true };
  }
  const openNumbers = new Set(records.map((r) => r.number));
  const edges = [];
  for (const record of records) {
    for (const depNumber of parseDependencies(record.body)) {
      if (openNumbers.has(depNumber)) edges.push({ from: record.number, to: depNumber });
    }
  }
  return { edges, edgesOmitted: false };
}

module.exports = { computeEdges };
