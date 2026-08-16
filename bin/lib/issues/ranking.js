// bin/lib/issues/ranking.js
// Pure: "what should I build next" ranking, shared by /claude-tweaks:backlog's
// overview mode and /claude-tweaks:help's Priority Order/Tie-Breaking (extracted
// from /help's prose-only rules so both consumers compute the identical order).
// Tie-break order: priority band (high first) -> unblocks-count (most other
// candidates in the same input array it unblocks, first) -> file-overlap-free
// (no shared keyFiles with another candidate in the array, first) -> size band
// (low first) -> hasPlan (true first). Every input this needs (the unblocks
// graph, file-overlap groups, hasPlan) must be precomputed by the caller and
// attached to each candidate — this function does no I/O, mirroring record.js
// and grouping.js's purity contract. Candidates *may* carry a top-level
// `blockedBy` or `facets.blockedBy` array (native/local-driver blocker data);
// when absent, blockers fall back to body-text parsing — see blockersOf for
// the exact precedence.
'use strict';

const { PRIORITIES, TIERS, parseDependencies } = require('./record');
const { groupByFileOverlap } = require('./grouping');

const RANK = { high: 0, medium: 1, low: 2 };
const SIZE_ORDER = { low: 0, medium: 1, high: 2 };
const priorityBandOf = (c) => (c.facets.priority && PRIORITIES.includes(c.facets.priority) ? RANK[c.facets.priority] : 3);
const sizeBandOf = (c) => (c.facets.size && TIERS.includes(c.facets.size) ? SIZE_ORDER[c.facets.size] : 3);

// candidate -> number[]. THE single blocker-precedence decision, shared by
// computeUnblocksCount here and funnelBuckets (backlog.js) — never re-implement
// it at a call site. Precedence: top-level `blockedBy` (attached by the
// overview's native fetch, or any caller that resolved blockers itself) wins;
// then the local-files driver's `facets.blockedBy` (already native-shaped
// frontmatter data); then record.js's parseDependencies over the body
// (work-links: body-text). Both explicit tiers are authoritative even when
// empty — `[]` means "confirmed no blockers", never "fall through to prose".
function blockersOf(candidate) {
  if (Array.isArray(candidate.blockedBy)) return candidate.blockedBy;
  if (candidate.facets && Array.isArray(candidate.facets.blockedBy)) return candidate.facets.blockedBy;
  return parseDependencies(candidate.body || '');
}

// candidates[] -> Map<id, count>. For each candidate, how many OTHER candidates
// in the SAME input array declare it as a blocker (blockersOf's precedence — not
// only body text). A blocker id outside this array's id set contributes
// nothing — this only ranks within the candidate set actually passed in, not
// the whole backlog's dependency graph.
function computeUnblocksCount(candidates) {
  const counts = new Map(candidates.map((c) => [c.id, 0]));
  for (const c of candidates) {
    for (const blockerId of blockersOf(c)) {
      if (counts.has(blockerId)) counts.set(blockerId, counts.get(blockerId) + 1);
    }
  }
  return counts;
}

// candidates[] -> Set<id> of candidates that share a keyFile with at least one
// other candidate in the array (grouping.js's groupByFileOverlap, filtered to
// groups of size > 1 — a singleton group has no overlap).
function computeOverlapSet(candidates) {
  const items = candidates.map((c) => ({ id: c.id, keyFiles: c.keyFiles || [] }));
  const groups = groupByFileOverlap(items);
  const overlapping = new Set();
  for (const group of groups) {
    if (group.length > 1) for (const id of group) overlapping.add(id);
  }
  return overlapping;
}

function rankNextToBuild(candidates) {
  const unblocksCountOf = computeUnblocksCount(candidates);
  const overlapping = computeOverlapSet(candidates);
  return candidates.slice().sort((a, b) =>
    priorityBandOf(a) - priorityBandOf(b) ||
    unblocksCountOf.get(b.id) - unblocksCountOf.get(a.id) ||
    Number(overlapping.has(a.id)) - Number(overlapping.has(b.id)) ||
    sizeBandOf(a) - sizeBandOf(b) ||
    Number(b.hasPlan) - Number(a.hasPlan)
  );
}

module.exports = { rankNextToBuild, blockersOf };
