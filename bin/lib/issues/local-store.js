// bin/lib/issues/local-store.js
// The local-files work-record driver: read/write specs/{n}-{slug}.md records with
// frontmatter facets. Frontmatter is parsed with the same no-dependency line-regex
// style bin/lib/policy.js uses — the plugin ships zero runtime npm deps, so there
// is no YAML library here. `facets` is a superset of record.js's parseRecordFacets
// shape (same keys — origin, risk, effort, priority, stage, grants{build,merge},
// bot{inProgress,blocked} — plus type, parent, blockedBy, unsynced); the github
// driver's callers get type/parent/blockedBy from the issue JSON itself, not from
// labels. No network calls.
'use strict';

const fs = require('fs');
const path = require('path');
const util = require('util');

const DEFAULT_DIR = 'specs';

// A record filename: a numeric id prefix, a dash, any slug, ending .md.
const ID_PREFIX_RE = /^(\d+)-.*\.md$/;
// Same shape, capturing id and slug separately for readRecord.
const FILENAME_RE = /^(\d+)-(.+)\.md$/;

const GRANT_KEYS = ['build', 'merge'];

// Explicit defaults first, only ever flipped/assigned by a matching frontmatter
// line elsewhere — never inferred from truthiness (parseRecordFacets style).
// `bot` is always this value: the local driver carries no bot state.
function defaultFacets() {
  return {
    type: null,
    origin: null,
    risk: null,
    effort: null,
    priority: null,
    stage: 'backlog',
    grants: { build: false, merge: false },
    bot: { inProgress: false, blocked: false },
    parent: null,
    blockedBy: [],
    unsynced: false,
  };
}

function trimLeadingBlank(lines) {
  let i = 0;
  while (i < lines.length && lines[i].trim() === '') i++;
  return lines.slice(i);
}

function trimTrailingBlank(lines) {
  let end = lines.length;
  while (end > 0 && lines[end - 1].trim() === '') end--;
  return lines.slice(0, end);
}

// raw file text -> { fmLines, afterLines }. fmLines is null when the file doesn't
// open with a '---' fence on its very first line, or the fence never closes —
// both treated as "no frontmatter" (the malformed-file case).
function splitFrontmatter(raw) {
  const lines = raw.split('\n');
  if (lines[0] !== '---') return { fmLines: null, afterLines: lines };
  const closeIdx = lines.indexOf('---', 1);
  if (closeIdx === -1) return { fmLines: null, afterLines: lines };
  return { fmLines: lines.slice(1, closeIdx), afterLines: lines.slice(closeIdx + 1) };
}

// "a, b" -> ['a', 'b']; "" -> [].
function parseBracketList(raw) {
  const trimmed = raw.trim();
  if (trimmed === '') return [];
  return trimmed.split(',').map((s) => s.trim()).filter((s) => s !== '');
}

// fmLines -> facets. Unrecognized lines are silently skipped (permissive
// line-regex parser, matching bin/lib/policy.js's style).
function parseFrontmatterLines(fmLines) {
  const facets = defaultFacets();

  for (const rawLine of fmLines) {
    const line = rawLine.trim();
    if (line === '') continue;

    let m;
    if ((m = /^type:\s*(.+)$/.exec(line))) { facets.type = m[1].trim(); continue; }
    if ((m = /^origin:\s*(.+)$/.exec(line))) { facets.origin = m[1].trim(); continue; }
    if ((m = /^risk:\s*(.+)$/.exec(line))) { facets.risk = m[1].trim(); continue; }
    if ((m = /^effort:\s*(.+)$/.exec(line))) { facets.effort = m[1].trim(); continue; }
    if ((m = /^priority:\s*(.+)$/.exec(line))) { facets.priority = m[1].trim(); continue; }
    if ((m = /^stage:\s*(.+)$/.exec(line))) { facets.stage = m[1].trim(); continue; }
    if ((m = /^grants:\s*\[(.*)\]$/.exec(line))) {
      const names = parseBracketList(m[1]);
      facets.grants = { build: names.includes('build'), merge: names.includes('merge') };
      continue;
    }
    if ((m = /^parent:\s*(\d+)$/.exec(line))) { facets.parent = Number(m[1]); continue; }
    if ((m = /^blocked-by:\s*\[(.*)\]$/.exec(line))) {
      facets.blockedBy = parseBracketList(m[1]).map(Number);
      continue;
    }
    if ((m = /^unsynced:\s*(true|false)$/.exec(line))) { facets.unsynced = m[1] === 'true'; continue; }
  }

  return facets;
}

// content lines after the frontmatter fence (or the whole file, when there is
// none) -> { title, body }. title is the first line's '# ' heading text when
// present (null otherwise); body is everything after that heading, trimmed of
// blank lines at both edges — the inverse of writeRecord's
// '# {title}\n\n{body}' composition.
function extractTitleAndBody(afterLines) {
  let lines = trimLeadingBlank(afterLines);
  let title = null;

  const heading = lines.length > 0 ? /^#\s+(.+)$/.exec(lines[0]) : null;
  if (heading) {
    title = heading[1].trim();
    lines = trimLeadingBlank(lines.slice(1));
  }

  lines = trimTrailingBlank(lines);
  return { title, body: lines.join('\n') };
}

function readRecord(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const nameMatch = FILENAME_RE.exec(path.basename(filePath));
  const id = nameMatch ? Number(nameMatch[1]) : null;
  const slug = nameMatch ? nameMatch[2] : null;

  const { fmLines, afterLines } = splitFrontmatter(raw);
  const facets = fmLines ? parseFrontmatterLines(fmLines) : defaultFacets();
  const { title, body } = extractTitleAndBody(afterLines);

  return { path: filePath, id, slug, title, body, facets };
}

// facets -> frontmatter lines, omitting every key at its default/absent value:
// no 'stage: backlog', no empty 'grants: []', no 'unsynced: false', no 'parent'
// when null, no 'blocked-by' when empty. `bot` is never written — it isn't a
// file-backed facet for the local driver. Array syntax is exactly '[a, b]'.
function serializeFrontmatter(facets) {
  const lines = [];
  if (facets.type) lines.push(`type: ${facets.type}`);
  if (facets.origin) lines.push(`origin: ${facets.origin}`);
  if (facets.risk) lines.push(`risk: ${facets.risk}`);
  if (facets.effort) lines.push(`effort: ${facets.effort}`);
  if (facets.priority) lines.push(`priority: ${facets.priority}`);
  if (facets.stage && facets.stage !== 'backlog') lines.push(`stage: ${facets.stage}`);

  const grants = facets.grants || {};
  const grantNames = GRANT_KEYS.filter((key) => grants[key]);
  if (grantNames.length > 0) lines.push(`grants: [${grantNames.join(', ')}]`);

  if (facets.parent !== null && facets.parent !== undefined) lines.push(`parent: ${facets.parent}`);

  const blockedBy = facets.blockedBy || [];
  if (blockedBy.length > 0) lines.push(`blocked-by: [${blockedBy.join(', ')}]`);

  if (facets.unsynced) lines.push('unsynced: true');

  return lines;
}

// (filePath, { title, body, facets }) -> void. Composes frontmatter + '# {title}'
// + body. Creates the parent directory when missing.
function writeRecord(filePath, { title, body, facets } = {}) {
  const fmLines = serializeFrontmatter(facets || {});
  const parts = ['---', ...fmLines, '---', ''];
  if (title) parts.push(`# ${title}`, '');
  if (body) parts.push(body);

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, parts.join('\n') + '\n', 'utf8');
}

// dir -> record filenames (NN-*.md, files only, non-recursive), or [] when dir
// is missing/unreadable.
function listRecordFilenames(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.filter((e) => e.isFile() && ID_PREFIX_RE.test(e.name)).map((e) => e.name);
}

// dir -> max existing numeric filename prefix + 1; 1 when empty/missing.
function allocateId(dir = DEFAULT_DIR) {
  let max = 0;
  for (const name of listRecordFilenames(dir)) {
    const n = Number(ID_PREFIX_RE.exec(name)[1]);
    if (n > max) max = n;
  }
  return max + 1;
}

// Every key in facetFilter must deep-equal the record's same-named facet
// (assert.deepStrictEqual semantics via util.isDeepStrictEqual): scalar keys
// compare like ===, object-valued keys like grants compare structurally —
// { build: true } does not match a record whose grants is { build: true,
// merge: true }.
function matchesFilter(facets, facetFilter) {
  return Object.keys(facetFilter).every((key) => util.isDeepStrictEqual(facets[key], facetFilter[key]));
}

// (dir, facetFilter) -> record[]. Scans NN-*.md files only, non-recursively.
function queryRecords(dir = DEFAULT_DIR, facetFilter = {}) {
  const records = [];
  for (const name of listRecordFilenames(dir)) {
    const record = readRecord(path.join(dir, name));
    if (matchesFilter(record.facets, facetFilter)) records.push(record);
  }
  return records;
}

module.exports = { DEFAULT_DIR, readRecord, writeRecord, allocateId, queryRecords };
