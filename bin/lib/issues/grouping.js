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
const HARNESS_HEADER_RE = /^\*\*[^:*]+:\*\*\s*([^\s|]+)/m;

function labelNames(labels) {
  return (labels || []).map((l) => (typeof l === 'string' ? l : l && l.name)).filter(Boolean);
}

// issue: { body, labels } shaped like `gh api .../issues/{n}` output.
// Returns string[] of file paths, [] when nothing is extractable.
function extractKeyFiles(issue) {
  const body = (issue && issue.body) || '';
  const names = labelNames(issue && issue.labels);

  if (names.includes('code-health')) {
    const anchor = ANCHOR_RE.exec(body);
    if (anchor) return [anchor[1]];
    const filesLine = FILES_LINE_RE.exec(body);
    if (filesLine && filesLine[1].trim() !== '(no specific file)') {
      return filesLine[1].split(',').map((f) => f.trim()).filter(Boolean);
    }
    return [];
  }

  if (names.includes('harness-health')) {
    // A new-skill candidate proposes content, it doesn't concern an existing
    // file — its header line ("**New skill candidate** | ...") has no colon
    // inside the bold run, so HARNESS_HEADER_RE fails to match it and would
    // otherwise scan forward into the embedded proposedBody markdown (which
    // commonly contains its own bold, colon-terminated, line-starting labels)
    // and return a wrong, unrelated file path. Short-circuit instead.
    if (names.includes('harness-health:new-skill')) return [];
    const targetHeader = HARNESS_HEADER_RE.exec(body);
    return targetHeader ? [targetHeader[1]] : [];
  }

  return [];
}

module.exports = { groupByFileOverlap, extractKeyFiles };
