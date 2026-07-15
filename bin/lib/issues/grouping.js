// bin/lib/issues/grouping.js
// Pure: partition claimed issues into groups whose target files overlap, and
// extract the file(s) an issue concerns straight from its body — used at
// dispatch time, before any spec exists to read a "Key Files" section from.
'use strict';

// Partitions items into groups whose keyFiles overlap, directly or
// transitively (union-find over shared file paths). Items with no overlap
// to anything else in the batch are singleton groups.
function groupByFileOverlap(items) {
  const parent = new Map();
  function find(x) {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)));
      x = parent.get(x);
    }
    return x;
  }
  function union(a, b) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }

  for (const item of items) parent.set(item.id, item.id);

  const fileToId = new Map();
  for (const item of items) {
    for (const file of item.keyFiles || []) {
      if (fileToId.has(file)) union(item.id, fileToId.get(file));
      else fileToId.set(file, item.id);
    }
  }

  const groups = new Map();
  for (const item of items) {
    const root = find(item.id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(item.id);
  }
  return [...groups.values()];
}

const ANCHOR_RE = /Anchor:\s*`([^`#]+)/;
const FILES_LINE_RE = /^Files:\s*(.+)$/m;
// Matches the first bold "**Label:** value" field of a spec-shaped issue
// header (e.g. "**Skill:** path | **Section:** ..." or "**Journey:** path |
// ...") — the shape harness-health and journey-health both use.
const BOLD_HEADER_RE = /^\*\*[^:*]+:\*\*\s*([^\s|]+)/m;

function labelNames(labels) {
  return (labels || []).map((l) => (typeof l === 'string' ? l : l && l.name)).filter(Boolean);
}

// A health skill's origin label appears either in the bare pre-migration form
// (code-health, harness-health — the only two that predate the by:* origin
// migration) or the post-6.0 `by:*` form (skills/_shared/work-record.md).
// Records filed before and after the migration must group identically.
function hasOrigin(names, origin) {
  return names.includes(origin) || names.includes(`by:${origin}`);
}

// issue: { body, labels } shaped like `gh api .../issues/{n}` output.
// Returns string[] of file paths, [] when nothing is extractable.
function extractKeyFiles(issue) {
  const body = (issue && issue.body) || '';
  const names = labelNames(issue && issue.labels);

  if (hasOrigin(names, 'code-health')) {
    const anchor = ANCHOR_RE.exec(body);
    if (anchor) return [anchor[1]];
    const filesLine = FILES_LINE_RE.exec(body);
    if (filesLine && filesLine[1].trim() !== '(no specific file)') {
      return filesLine[1].split(',').map((f) => f.trim()).filter(Boolean);
    }
    return [];
  }

  if (hasOrigin(names, 'harness-health')) {
    // A new-skill candidate proposes content, it doesn't concern an existing
    // file — its header line ("**New skill candidate** | ...") has no colon
    // inside the bold run, so BOLD_HEADER_RE fails to match it and would
    // otherwise scan forward into the embedded proposedBody markdown (which
    // commonly contains its own bold, colon-terminated, line-starting labels)
    // and return a wrong, unrelated file path. Short-circuit instead.
    if (names.includes('harness-health:new-skill')) return [];
    const targetHeader = BOLD_HEADER_RE.exec(body);
    return targetHeader ? [targetHeader[1]] : [];
  }

  if (hasOrigin(names, 'journey-health')) {
    // journey-health was born after the by:* origin migration, so it never
    // had a bare pre-migration label (label-bootstrap.md only ever registers
    // by:journey-health) — hasOrigin's bare-form check is a no-op for every
    // real record today, kept only for symmetry with the other two origins.
    // Its issue header ("**Journey:** {path} | **Section:** ...",
    // bin/lib/journey-health/issue-payload.js) is the same bold-field shape
    // as harness-health's, so the same extraction applies.
    const targetHeader = BOLD_HEADER_RE.exec(body);
    return targetHeader ? [targetHeader[1]] : [];
  }

  return [];
}

// Parses a comma-joined, optionally "#"-prefixed issue-number argument (the
// explicit-list dispatch form, e.g. "#123, #124,#130") into an array of
// issue numbers. Non-numeric entries are dropped, not thrown — a malformed
// entry in an otherwise-valid list shouldn't abort the whole parse.
function parseExplicitIssueList(argString) {
  return (argString || '')
    .split(',')
    .map((s) => s.trim().replace(/^#/, ''))
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
}

// Given a set of requested issue numbers and dispatch Step 2's already-
// computed groups (arrays of full issue objects), returns the deduplicated
// groups containing at least one requested number, plus any requested
// numbers found in none of them (not currently eligible — already claimed,
// grant stripped, or never existed).
function selectGroupsForExplicitList(requestedNumbers, groups) {
  const requested = new Set(requestedNumbers);
  const selectedGroups = [];
  const foundNumbers = new Set();
  for (const group of groups) {
    const groupNumbers = group.map((issue) => issue.number);
    if (groupNumbers.some((n) => requested.has(n))) {
      selectedGroups.push(group);
      groupNumbers.forEach((n) => foundNumbers.add(n));
    }
  }
  const notFound = requestedNumbers.filter((n) => !foundNumbers.has(n));
  return { selectedGroups, notFound };
}

module.exports = { groupByFileOverlap, extractKeyFiles, parseExplicitIssueList, selectGroupsForExplicitList };
