// bin/lib/issues/grouping.js
// Pure: partition claimed issues into groups whose target files overlap, and
// extract the file(s) an issue concerns straight from its body — used at
// dispatch time. Health-sweep records are read from their origin-specific
// header lines; every other record (a /specify-produced sub-issue, a /capture
// record) is read from the `### Key Files` subsection its body already carries.
'use strict';

const { normalizeLabelNames } = require('./record');

// A path referenced by at least this many items, OR at least this fraction
// of the batch (whichever is larger — see the max() below), is treated as a
// hub and excluded from union-find bridging: it still counts as a file the
// item "has", but it can never be the shared file that merges two items into
// one group. Tuned against the reported incident (#1365): a 139-record
// eligible pool where tests/ appeared in 15 records, plugin/bin/hooks.js in
// 7, plugin/bin/lib/hooks/pre-tool-use.js in 5, and docs/donts.md in 5 —
// none of which represent real coupling between those records, just a common
// generic path each happens to touch. The min-count floor keeps small
// batches (the common case: 2-5 genuinely related records) from ever
// tripping the fraction half by accident; the tradeoff, accepted
// deliberately, is that a truly coincidental full-batch match (e.g. exactly
// 3 unrelated items in a 3-item batch that all happen to cite one path) also
// gets excluded — an "anomalously large fraction" is exactly what that is,
// regardless of how small the batch happens to be.
const HUB_PATH_MIN_COUNT = 3;
const HUB_PATH_FRACTION = 0.1;

// Partitions items into groups whose keyFiles overlap, directly or
// transitively (union-find over shared file paths). Items with no overlap
// to anything else in the batch are singleton groups. A file path referenced
// by an anomalously large fraction of the batch (see HUB_PATH_MIN_COUNT/
// HUB_PATH_FRACTION above, overridable via options) is excluded from the
// union-find step entirely — it can never bridge two items together, though
// each item's other (non-hub) files still can.
function groupByFileOverlap(items, options = {}) {
  const hubPathMinCount = options.hubPathMinCount ?? HUB_PATH_MIN_COUNT;
  const hubPathFraction = options.hubPathFraction ?? HUB_PATH_FRACTION;

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

  // Count each file's references across the batch — once per item (a
  // duplicate path within one item's own keyFiles list must not inflate its
  // count), so hub detection reflects how many *distinct items* cite it.
  const fileCounts = new Map();
  for (const item of items) {
    for (const file of new Set(item.keyFiles || [])) {
      fileCounts.set(file, (fileCounts.get(file) || 0) + 1);
    }
  }
  const hubThreshold = Math.max(hubPathMinCount, Math.ceil(items.length * hubPathFraction));
  const hubPaths = new Set();
  for (const [file, count] of fileCounts) {
    if (count >= hubThreshold) hubPaths.add(file);
  }

  const fileToId = new Map();
  for (const item of items) {
    for (const file of item.keyFiles || []) {
      if (hubPaths.has(file)) continue;
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
// ...") — the shape harness-health and journey-health both use. The value
// itself is captured up to the next " | " field separator (or end of line)
// rather than stopping at the first whitespace character, so a target path
// containing a literal space (e.g. "docs/User Guide.md") extracts intact —
// matching code-health's ANCHOR_RE/FILES_LINE_RE above, which already
// preserve spaces for the identical extraction purpose.
const BOLD_HEADER_RE = /^\*\*[^:*]+:\*\*\s*([^|]+?)\s*(?:\||$)/m;

// A health skill's origin label appears either in the bare pre-migration form
// (code-health, harness-health — the only two that predate the by:* origin
// migration) or the post-6.0 `by:*` form (skills/_shared/work-record.md).
// Records filed before and after the migration must group identically.
function hasOrigin(names, origin) {
  return names.includes(origin) || names.includes(`by:${origin}`);
}

// Extracts the file path from a spec-shaped bold header line ("**Label:**
// value | ..."), or [] when the body has no such header. Shared core logic
// for harness-health, journey-health, and docs-health issue bodies — all
// three use the same header shape (BOLD_HEADER_RE above).
function extractBoldHeaderFile(body) {
  const targetHeader = BOLD_HEADER_RE.exec(body);
  return targetHeader ? [targetHeader[1]] : [];
}

// The `### Key Files` subsection lives under `## Technical Approach` in every
// record /claude-tweaks:specify shapes (skills/specify/spec-template.md), one
// backticked path per list item followed by an optional annotation:
//   - `path/to/file.md` (create)
//   - `path/to/other.md` (modify — why, with commas, **and bold**)
// Tolerates `##`..`####` so a re-nested body still parses; the section always
// ends at the next heading of any level (Gotchas routinely names files in
// backticks, and scraping those would union records on an incidental mention).
const KEY_FILES_HEADING_RE = /^#{2,4}[ \t]+Key Files[ \t]*$/;
const ANY_HEADING_RE = /^#{1,6}[ \t]/;
const LIST_ITEM_RE = /^[ \t]*[-*][ \t]+(.+)$/;
const BACKTICKED_RE = /`([^`]+)`/;
// spec-template.md ships the literal "- `{path}` — {what changes}". A record
// still carrying the unfilled template must not union with every other one.
const TEMPLATE_PLACEHOLDER_RE = /^\{.*\}$/;

// Extracts the paths listed under a body's `### Key Files` subsection, or []
// when the body has no such subsection — the documented absence case, not an
// error (skills/specify/decomposition-mode.md: records without one "contribute
// nothing to the map — skip silently").
function extractKeyFilesSection(body) {
  const lines = body.split('\n');
  const start = lines.findIndex((line) => KEY_FILES_HEADING_RE.test(line));
  if (start === -1) return [];

  const files = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    if (ANY_HEADING_RE.test(lines[i])) break;
    const item = LIST_ITEM_RE.exec(lines[i]);
    if (!item) continue;
    // First backticked span wins: it drops the trailing annotation, and an item
    // naming an alternative (``- `a/tests/` or `tests/` ``) yields the primary
    // path rather than both. Matching the annotation would also re-introduce
    // code-health's comma-splitting bug on "(modify — Step 1, Step 2)".
    const backticked = BACKTICKED_RE.exec(item[1]);
    if (!backticked) continue;
    const file = backticked[1].trim();
    if (!file || TEMPLATE_PLACEHOLDER_RE.test(file)) continue;
    files.push(file);
  }
  return files;
}

// issue: { labels } shaped like `gh api .../issues/{n}` output. True when
// extractKeyFiles reads this issue via the `### Key Files` fallthrough branch
// below (a /specify-produced sub-issue, a /capture record, or a hand-filed
// one) rather than one of the four health-sweep origin headers — i.e. when an
// empty extractKeyFiles([]) result for this issue is actually meaningful (the
// record was supposed to carry a `### Key Files` subsection and doesn't) as
// opposed to expected-and-correct (a health-sweep record's own header shape
// legitimately has no such section, or a harness-health new-skill candidate
// that explicitly returns [] regardless). Callers that want to warn on an
// empty extraction — multi-spec.md's Cross-spec conflict detection,
// dispatch's queue-pull-script.md, help/status-scan.md's Conflict detection —
// gate the warning on this, so the four health-sweep origins never trip it.
function expectsKeyFilesSection(issue) {
  const names = normalizeLabelNames(issue && issue.labels);
  return !hasOrigin(names, 'code-health')
    && !hasOrigin(names, 'harness-health')
    && !hasOrigin(names, 'journey-health')
    && !hasOrigin(names, 'docs-health');
}

// issue: { body, labels } shaped like `gh api .../issues/{n}` output.
// Returns string[] of file paths, [] when nothing is extractable.
function extractKeyFiles(issue) {
  const body = (issue && issue.body) || '';
  const names = normalizeLabelNames(issue && issue.labels);

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
    return extractBoldHeaderFile(body);
  }

  if (hasOrigin(names, 'journey-health') || hasOrigin(names, 'docs-health')) {
    // journey-health and docs-health were both born after the by:* origin
    // migration, so neither ever had a bare pre-migration label (label-
    // bootstrap.md only ever registers by:journey-health / by:docs-health) —
    // hasOrigin's bare-form check is a no-op for every real record today,
    // kept only for symmetry with code-health/harness-health above. Both
    // issue headers ("**Journey:** {path} | **Section:** ...", bin/lib/
    // journey-health/issue-payload.js; "**Doc:** {path} | **Section:** ...",
    // bin/lib/docs-health/issue-payload.js) are the same bold-field shape as
    // harness-health's, so the same extraction applies to both.
    return extractBoldHeaderFile(body);
  }

  // Fallthrough — every record that is not one of the four health sweeps: a
  // /claude-tweaks:specify-produced sub-issue, a /claude-tweaks:capture record, a
  // hand-filed one. These carry no by:* origin header to key off, but a shaped
  // body already lists its targets under `### Key Files`.
  //
  // This must stay BELOW the four branches above, which all return early. An
  // origin-labelled record whose body happens to contain a `### Key Files`
  // heading is still read from its own header line, not from here ([IL-83]).
  return extractKeyFilesSection(body);
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

module.exports = { groupByFileOverlap, extractKeyFiles, extractKeyFilesSection, expectsKeyFilesSection, parseExplicitIssueList, selectGroupsForExplicitList, hasOrigin };
