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
// computeUnblocksCount here, funnelBuckets (backlog.js), and #515's import —
// never re-implement it at a call site. Precedence: an unsynced fallback
// record (`facets.unsynced === true`) short-circuits to `[]` FIRST — its
// blocker ids (when present) live in the local-record namespace, a different
// id space from the GitHub numbers in a merged set, and must never
// cross-match them (parent #512 promise F1); this helper owns the rule so
// every consumer inherits it. Then: top-level `blockedBy` (attached by the
// overview's native fetch, or any caller that resolved blockers itself)
// wins; then the local-files driver's `facets.blockedBy` (already
// native-shaped frontmatter data); then record.js's parseDependencies over
// the body (work-links: body-text). Both explicit tiers are authoritative
// even when empty — `[]` means "confirmed no blockers", never "fall through
// to prose". Callers must not mutate the returned array — the two explicit
// tiers return live references into the candidate's own data.
function blockersOf(candidate) {
  if (candidate.facets && candidate.facets.unsynced === true) return [];
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

// candidates[] -> [{id, mention}] for every candidate whose body mentions a
// dependency anywhere (/blocked by\b[^\n#]*#\d+/i — deliberately broader than
// record.js's line-anchored DEP_RE, mid-line prose included, and broader than
// a bare "blocked by #N": same-line words between "blocked by" and the first
// "#N" are allowed, e.g. "Blocked by links: #418", since that's real observed
// incident prose, not a hypothetical) while blockersOf(c) resolves empty:
// prose claims a dependency, but neither the native graph, the local driver,
// nor a canonical line backs it — the ranker is about to treat this candidate
// as unblocked, and the caller should say so loudly. The breadth is
// deliberate: this only fires when resolved blockers are empty and only ever
// renders a flag, never acts — an occasional false positive costs a human a
// glance, while a false negative here is exactly the silent mis-ranking this
// check exists to prevent, so it still never crosses a newline. Fires only on
// EMPTY resolved blockers by design: a partially wired record (non-empty
// blockedBy missing some prose-mentioned id) is not flagged — prose #N
// mentions have no mechanical ground truth, so partial-coverage checking
// would guess. `mention` is the trimmed full containing line of the first
// match.
const PROSE_DEP_RE = /blocked by\b[^\n#]*#\d+/i;
function findUnresolvedDependencyProse(candidates) {
  const hits = [];
  for (const c of candidates) {
    const body = c.body || '';
    if (!PROSE_DEP_RE.test(body)) continue;
    if (blockersOf(c).length > 0) continue;
    // An unsynced record's blockers resolve [] by the namespace rule above,
    // not because nothing is wired — its own facets.blockedBy is the local
    // ground truth. Wired-in-own-namespace suppresses the flag; only an
    // unsynced record with prose and NO wired local blockers is a mismatch.
    if (c.facets && c.facets.unsynced === true
      && Array.isArray(c.facets.blockedBy) && c.facets.blockedBy.length > 0) continue;
    const line = body.split('\n').find((l) => PROSE_DEP_RE.test(l));
    hits.push({ id: c.id, mention: line.trim() });
  }
  return hits;
}

// candidates[] -> Map<id, count>: for each candidate, how many OTHER candidates
// in the set are transitively blocked behind it — the chain-head payout the
// batch emitter ranks terminal blocks by. In-set scoping is deliberate: the
// payout answers "of the records you can currently act on, how many are behind
// this one" — an out-of-set blocker can't be dispatched from this report
// anyway (accepted limitation, recorded in the spec). Cycle-safe via a visited
// set: a cyclic pair yields finite counts, never an infinite walk. Blocker
// precedence comes from blockersOf — never re-implemented here.
function transitiveUnblocksCount(candidates) {
  const ids = new Set(candidates.map((c) => c.id));
  const dependents = new Map(candidates.map((c) => [c.id, []]));
  for (const c of candidates) {
    for (const blockerId of blockersOf(c)) {
      if (ids.has(blockerId) && blockerId !== c.id) dependents.get(blockerId).push(c.id);
    }
  }
  const counts = new Map();
  for (const id of ids) {
    const seen = new Set();
    const stack = [...dependents.get(id)];
    while (stack.length > 0) {
      const next = stack.pop();
      if (next === id || seen.has(next)) continue;
      seen.add(next);
      stack.push(...dependents.get(next));
    }
    counts.set(id, seen.size);
  }
  return counts;
}

// candidates[] -> { chains: number[][], independents: number[], cycles:
// {ids: number[]}[] } — the single authoritative shape (cycles always
// present, [] when none). Partitions the set into dependency components
// (undirected depth-first traversal over in-set blocker edges), then linearizes each
// multi-member component topologically: repeatedly emit ids whose in-set
// blockers are all already emitted, ready-batch ties broken by priority band
// then id for determinism. A component that stalls before emitting every
// member is cyclic — it lands whole under cycles (ids sorted), never
// partially in chains, never an infinite loop. Singleton components are
// independents. Precondition: candidates are the buildable subset
// (funnelBuckets dispatchable ∪ granted) carrying whatever blockedBy the
// caller attached; blocker precedence comes from blockersOf. Candidate ids
// must be unique and each candidate must carry `.facets` (same precondition
// as rankNextToBuild) — duplicate ids are undefined behavior (last-write-wins
// internally, since byId/adjacency/seen are all keyed by id). Ids are numbers
// at every carrier (GraphQL's `.number`, the local-store driver's `Number()`
// parse) — the strict-equality/Set comparisons above (`ids.has(b)`,
// `componentSet.has(b)`, `emitted.has(b)`) rely on that; a stringified id
// would silently drop its edge instead of throwing.
function buildChains(candidates) {
  const ids = new Set(candidates.map((c) => c.id));
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const inSetBlockers = new Map(candidates.map((c) => [
    c.id, blockersOf(c).filter((b) => ids.has(b) && b !== c.id),
  ]));
  const adjacency = new Map(candidates.map((c) => [c.id, new Set()]));
  for (const [id, blockers] of inSetBlockers) {
    for (const b of blockers) {
      adjacency.get(id).add(b);
      adjacency.get(b).add(id);
    }
  }
  const seen = new Set();
  const chains = [];
  const independents = [];
  const cycles = [];
  for (const c of candidates) {
    if (seen.has(c.id)) continue;
    const component = [];
    const stack = [c.id];
    while (stack.length > 0) {
      const id = stack.pop();
      if (seen.has(id)) continue;
      seen.add(id);
      component.push(id);
      stack.push(...adjacency.get(id));
    }
    if (component.length === 1) {
      independents.push(component[0]);
      continue;
    }
    const componentSet = new Set(component);
    const emitted = new Set();
    const order = [];
    let progressed = true;
    while (order.length < component.length && progressed) {
      progressed = false;
      const ready = component
        .filter((id) => !emitted.has(id)
          && inSetBlockers.get(id).filter((b) => componentSet.has(b)).every((b) => emitted.has(b)))
        .sort((a, b) => priorityBandOf(byId.get(a)) - priorityBandOf(byId.get(b)) || a - b);
      for (const id of ready) {
        emitted.add(id);
        order.push(id);
        progressed = true;
      }
    }
    if (order.length < component.length) cycles.push({ ids: component.slice().sort((a, b) => a - b) });
    else chains.push(order);
  }
  independents.sort((a, b) => a - b);
  return { chains, independents, cycles };
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

module.exports = {
  rankNextToBuild, blockersOf, findUnresolvedDependencyProse, transitiveUnblocksCount, buildChains,
};
